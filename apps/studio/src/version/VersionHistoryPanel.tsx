import { useCallback, useEffect, useState } from "react";
import { api, type HistoryEntryMeta } from "../api";
import { usePersistedFlag } from "../prefs/usePersistedUi";

export interface VersionHistoryPanelProps {
  pid: string;
  filePath: string | null;
  /** Current editor buffer (for checkpoint without save). */
  currentContent: string;
  /** Bump after save/restore to reload the list. */
  refreshToken?: number;
  readOnly?: boolean;
  onRestore: (content: string) => void;
  onToast: (msg: string) => void;
}

export function VersionHistoryPanel({
  pid,
  filePath,
  currentContent,
  refreshToken = 0,
  readOnly,
  onRestore,
  onToast,
}: VersionHistoryPanelProps) {
  const [entries, setEntries] = useState<HistoryEntryMeta[]>([]);
  const [stats, setStats] = useState<{ total: number; paths: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [expanded, , toggleExpanded] = usePersistedFlag("versionHistoryExpanded");

  const refresh = useCallback(async () => {
    if (!pid || !filePath) {
      setEntries([]);
      return;
    }
    try {
      const res = await api.listHistory(pid, filePath);
      setEntries(res.entries);
      setStats(res.stats);
    } catch {
      setEntries([]);
    }
  }, [pid, filePath]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshToken]);

  async function checkpoint() {
    if (!pid || !filePath || readOnly) return;
    setBusy(true);
    try {
      await api.createCheckpoint(pid, filePath, currentContent, label.trim() || undefined);
      setLabel("");
      await refresh();
      onToast("Checkpoint saved to version history");
    } catch (e) {
      onToast(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function restore(id: string, entryLabel: string) {
    if (!pid || readOnly) return;
    if (!window.confirm(`Restore “${entryLabel}”?\n\nYour current file will be replaced. You can save or pick another version again.`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await api.restoreHistory(pid, id);
      onRestore(res.snapshot.content);
      await refresh();
      onToast(`Restored version from ${formatWhen(res.snapshot.createdAt)}`);
    } catch (e) {
      onToast(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  if (!filePath) {
    return (
      <div className="border-b border-white/5 p-3 text-xs text-white/40">
        Open a template or data file to see version history.
      </div>
    );
  }

  return (
    <div className="border-b border-white/5 p-3">
      <button
        type="button"
        onClick={toggleExpanded}
        className="mb-2 flex w-full items-center gap-2 text-left"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">Version history</h3>
        <span className="ml-auto font-mono text-[10px] text-white/30">{entries.length}</span>
        <span className="text-white/40">{expanded ? "▾" : "▸"}</span>
      </button>

      {expanded && (
        <>
          <p className="mb-2 text-[10px] leading-snug text-white/35">
            Snapshots on every save — no Git required. Stored in{" "}
            <span className="font-mono text-white/45">.lw-studio/history</span>
            {stats && stats.total > 0 && (
              <span className="text-white/30"> · {stats.total} total</span>
            )}
          </p>

          {!readOnly && (
            <div className="mb-2 flex gap-1">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Checkpoint label (optional)"
                className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/90 outline-none focus:border-indigo-400/50"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void checkpoint()}
                title="Save current editor content as a named checkpoint (does not write to disk)"
                className="shrink-0 rounded-md border border-indigo-400/40 bg-indigo-500/15 px-2 py-1 text-xs font-medium text-indigo-200 hover:bg-indigo-500/25 disabled:opacity-50"
              >
                Checkpoint
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => void refresh()}
            className="mb-2 text-[10px] text-white/40 hover:text-white/70"
          >
            ↻ Refresh list
          </button>

          {entries.length === 0 ? (
            <p className="rounded-md bg-white/[0.03] px-2 py-2 text-xs text-white/45">
              No versions yet — save the file (⌘S) to create the first snapshot.
            </p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-auto">
              {entries.map((e, i) => (
                <li
                  key={e.id}
                  className="flex items-start gap-2 rounded-md border border-white/5 bg-white/[0.03] p-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SourceBadge source={e.source} />
                      {i === 0 && (
                        <span className="rounded bg-emerald-500/20 px-1 py-0.5 text-[9px] font-bold uppercase text-emerald-300">
                          Latest
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 font-medium text-white/85">{e.label}</p>
                    <p className="font-mono text-[10px] text-white/35">
                      {formatWhen(e.createdAt)} · {(e.bytes / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void restore(e.id, e.label)}
                      className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-[10px] font-medium text-white/70 hover:border-indigo-400/40 hover:bg-indigo-500/10 hover:text-indigo-200 disabled:opacity-40"
                    >
                      Restore
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function SourceBadge({ source }: { source: HistoryEntryMeta["source"] }) {
  const cls =
    source === "checkpoint"
      ? "bg-violet-500/20 text-violet-300"
      : source === "restore"
        ? "bg-amber-500/20 text-amber-300"
        : source === "autosave"
          ? "bg-slate-500/20 text-slate-300"
          : "bg-indigo-500/20 text-indigo-300";
  return (
    <span className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase ${cls}`}>{source}</span>
  );
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 60_000) return "Just now";
    if (diffMs < 3600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
    if (diffMs < 86400_000) return `${Math.floor(diffMs / 3600_000)}h ago`;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
