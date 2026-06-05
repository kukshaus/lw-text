import { readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadProject, findManifest, type LoadedProject } from "@lw-text/project";

import type { ProjectKind } from "@lw-text/project";

export interface ProjectSummary {
  id: string;
  dir: string;
  name: string;
  kind?: ProjectKind;
}

/** A workspace is a directory containing one or more lw-text projects. */
export class Workspace {
  constructor(public readonly root: string) {}

  list(): ProjectSummary[] {
    const out: ProjectSummary[] = [];
    // The root itself may be a project.
    if (findManifest(this.root)) {
      const p = loadProject(this.root, { workspaceRoot: this.root });
      out.push({
        id: ".",
        dir: this.root,
        name: p.manifest.name,
        kind: p.kind,
      });
    }
    if (!existsSync(this.root)) return out;
    for (const entry of readdirSync(this.root)) {
      const dir = join(this.root, entry);
      if (!statSync(dir).isDirectory()) continue;
      if (!findManifest(dir)) continue;
      try {
        const p = loadProject(dir, { workspaceRoot: this.root });
        out.push({ id: entry, dir, name: p.manifest.name, kind: p.kind });
      } catch {
        // skip invalid project
      }
    }
    return out;
  }

  /** Absolute directory for a project id (does not validate the manifest). */
  dirOf(id: string): string {
    return id === "." ? this.root : join(this.root, id);
  }

  /** Load a project fresh (reflects on-disk edits — ideal for dev/Studio). */
  get(id: string): LoadedProject {
    const dir = this.dirOf(id);
    if (!findManifest(dir)) {
      throw new Error(`Project "${id}" not found in workspace ${this.root}`);
    }
    return loadProject(dir, { workspaceRoot: this.root });
  }
}

export function resolveWorkspaceRoot(): string {
  const fromEnv = process.env["LW_WORKSPACE"];
  if (fromEnv) return resolve(fromEnv);
  // Climb from cwd looking for an `examples/` dir or a project manifest, so the
  // server finds projects whether started from the repo root (npm start) or a
  // package dir (npm run dev:server via tsx).
  let dir = resolve(".");
  for (let i = 0; i < 6; i++) {
    const examples = join(dir, "examples");
    if (existsSync(examples)) return examples;
    if (findManifest(dir)) return dir;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(".");
}
