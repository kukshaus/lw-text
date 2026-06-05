import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

export type HistorySource = "save" | "checkpoint" | "restore" | "autosave";

export interface HistoryEntryMeta {
  id: string;
  path: string;
  createdAt: string;
  label: string;
  source: HistorySource;
  hash: string;
  bytes: number;
}

export interface HistorySnapshot extends HistoryEntryMeta {
  content: string;
}

interface HistoryIndex {
  version: 1;
  entries: HistoryEntryMeta[];
}

const HISTORY_ROOT = ".lw-studio/history";
const SNAPSHOTS_DIR = "snapshots";
const INDEX_FILE = "index.json";
const MAX_PER_PATH = 80;
const MAX_TOTAL = 500;

const VERSIONED_PREFIXES = ["templates/", "blocks/", "fixtures/", "schemas/"];

export function isVersionedPath(relPath: string): boolean {
  const p = relPath.replace(/\\/g, "/");
  return VERSIONED_PREFIXES.some((pre) => p.startsWith(pre));
}

function historyDir(projectDir: string): string {
  return join(projectDir, HISTORY_ROOT);
}

function snapshotsDir(projectDir: string): string {
  return join(historyDir(projectDir), SNAPSHOTS_DIR);
}

function indexPath(projectDir: string): string {
  return join(historyDir(projectDir), INDEX_FILE);
}

function loadIndex(projectDir: string): HistoryIndex {
  const path = indexPath(projectDir);
  if (!existsSync(path)) return { version: 1, entries: [] };
  try {
    return JSON.parse(readFileSync(path, "utf8")) as HistoryIndex;
  } catch {
    return { version: 1, entries: [] };
  }
}

function saveIndex(projectDir: string, index: HistoryIndex): void {
  const dir = historyDir(projectDir);
  mkdirSync(dir, { recursive: true });
  mkdirSync(snapshotsDir(projectDir), { recursive: true });
  writeFileSync(indexPath(projectDir), JSON.stringify(index, null, 2) + "\n", "utf8");
}

function contentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex").slice(0, 16);
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function pruneWithDir(projectDir: string, index: HistoryIndex, path: string): void {
  const forPath = index.entries.filter((e) => e.path === path);
  if (forPath.length > MAX_PER_PATH) {
    const remove = forPath.slice(0, forPath.length - MAX_PER_PATH);
    const removeIds = new Set(remove.map((e) => e.id));
    index.entries = index.entries.filter((e) => !removeIds.has(e.id));
    for (const e of remove) {
      try {
        unlinkSync(join(snapshotsDir(projectDir), `${e.id}.json`));
      } catch {
        /* gone */
      }
    }
  }
  if (index.entries.length > MAX_TOTAL) {
    const sorted = [...index.entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const remove = sorted.slice(0, index.entries.length - MAX_TOTAL);
    const removeIds = new Set(remove.map((e) => e.id));
    index.entries = index.entries.filter((e) => !removeIds.has(e.id));
    for (const e of remove) {
      try {
        unlinkSync(join(snapshotsDir(projectDir), `${e.id}.json`));
      } catch {
        /* gone */
      }
    }
  }
}

export interface RecordSnapshotInput {
  path: string;
  content: string;
  label?: string;
  source?: HistorySource;
  /** Skip if identical to the latest snapshot for this path. */
  dedupe?: boolean;
}

/** Store a versioned copy of file content (no disk write). */
export function recordSnapshot(projectDir: string, input: RecordSnapshotInput): HistoryEntryMeta | null {
  const rel = input.path.replace(/\\/g, "/");
  if (!isVersionedPath(rel)) return null;

  const hash = contentHash(input.content);
  const index = loadIndex(projectDir);
  const latest = [...index.entries].reverse().find((e) => e.path === rel);
  if (input.dedupe !== false && latest?.hash === hash) return latest;

  const id = newId();
  const meta: HistoryEntryMeta = {
    id,
    path: rel,
    createdAt: new Date().toISOString(),
    label: input.label ?? defaultLabel(input.source ?? "save"),
    source: input.source ?? "save",
    hash,
    bytes: Buffer.byteLength(input.content, "utf8"),
  };

  mkdirSync(snapshotsDir(projectDir), { recursive: true });
  writeFileSync(
    join(snapshotsDir(projectDir), `${id}.json`),
    JSON.stringify({ ...meta, content: input.content }),
    "utf8",
  );

  index.entries.push(meta);
  pruneWithDir(projectDir, index, rel);
  saveIndex(projectDir, index);
  return meta;
}

function defaultLabel(source: HistorySource): string {
  switch (source) {
    case "checkpoint":
      return "Checkpoint";
    case "restore":
      return "Restored version";
    case "autosave":
      return "Autosave";
    default:
      return "Saved";
  }
}

export function listSnapshots(projectDir: string, relPath: string, limit = 50): HistoryEntryMeta[] {
  const path = relPath.replace(/\\/g, "/");
  const index = loadIndex(projectDir);
  return index.entries
    .filter((e) => e.path === path)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function getSnapshot(projectDir: string, id: string): HistorySnapshot | null {
  const file = join(snapshotsDir(projectDir), `${id}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as HistorySnapshot;
  } catch {
    return null;
  }
}

export function restoreSnapshot(
  projectDir: string,
  id: string,
  write: (path: string, content: string) => void,
): HistorySnapshot {
  const snap = getSnapshot(projectDir, id);
  if (!snap) throw new Error(`History snapshot "${id}" not found.`);
  write(snap.path, snap.content);
  recordSnapshot(projectDir, {
    path: snap.path,
    content: snap.content,
    source: "restore",
    label: `Restored · ${formatShortTime(snap.createdAt)}`,
    dedupe: false,
  });
  return snap;
}

export function historyStats(projectDir: string): { total: number; paths: number } {
  const index = loadIndex(projectDir);
  const paths = new Set(index.entries.map((e) => e.path));
  return { total: index.entries.length, paths: paths.size };
}

function formatShortTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Remove orphan snapshot files (maintenance). */
export function vacuumHistory(projectDir: string): number {
  const index = loadIndex(projectDir);
  const ids = new Set(index.entries.map((e) => e.id));
  const dir = snapshotsDir(projectDir);
  if (!existsSync(dir)) return 0;
  let removed = 0;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const id = f.replace(/\.json$/, "");
    if (!ids.has(id)) {
      unlinkSync(join(dir, f));
      removed++;
    }
  }
  return removed;
}

export function snapshotFileSize(projectDir: string): number {
  const dir = snapshotsDir(projectDir);
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const f of readdirSync(dir)) {
    try {
      total += statSync(join(dir, f)).size;
    } catch {
      /* skip */
    }
  }
  return total;
}
