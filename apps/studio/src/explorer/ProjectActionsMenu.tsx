import { useEffect, useRef, useState } from "react";
import { api, type ProjectSummary } from "../api";

function slugify(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "project"
  );
}

type DialogKind = "rename" | "duplicate" | "delete" | null;

export interface ProjectActionsMenuProps {
  project: ProjectSummary;
  active: boolean;
  onProjectsChange: (projects: ProjectSummary[]) => void;
  onActivate: (id: string) => void;
  onRenamed: (oldId: string, newId: string) => void;
  onDeleted: (id: string) => void;
  onToast: (msg: string) => void;
}

export function ProjectActionsMenu({
  project,
  active,
  onProjectsChange,
  onActivate,
  onRenamed,
  onDeleted,
  onToast,
}: ProjectActionsMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [displayName, setDisplayName] = useState(project.name);
  const [folderId, setFolderId] = useState(project.id);
  const [dependents, setDependents] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [forceDelete, setForceDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  useEffect(() => {
    if (dialog === "duplicate") {
      setDisplayName(`${project.name} (copy)`);
      setFolderId(`${project.id}-copy`);
    }
    if (dialog === "rename") {
      setDisplayName(project.name);
      setFolderId(project.id);
    }
    if (dialog === "delete") {
      api.projectDependents(project.id).then((r) => setDependents(r.dependents)).catch(() => setDependents([]));
      setDeleteConfirm("");
      setForceDelete(false);
    }
  }, [dialog, project.id, project.name]);

  function openDialog(kind: DialogKind) {
    setMenuOpen(false);
    setDisplayName(project.name);
    setFolderId(project.id);
    setDialog(kind);
  }

  async function submitRename(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.renameProject(project.id, {
        name: displayName.trim() || project.name,
        newId: folderId.trim() !== project.id ? folderId.trim() : undefined,
      });
      onProjectsChange(res.projects);
      const next = res.project;
      if (next.id !== project.id) onRenamed(project.id, next.id);
      onActivate(next.id);
      onToast(`Renamed to “${next.name}”`);
      setDialog(null);
    } catch (err) {
      onToast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitDuplicate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.duplicateProject(project.id, {
        name: displayName.trim(),
        id: folderId.trim() || undefined,
      });
      onProjectsChange(res.projects);
      onActivate(res.project.id);
      onToast(`Duplicated as “${res.project.name}”`);
      setDialog(null);
    } catch (err) {
      onToast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const confirmMatches = deleteConfirm.trim().toLowerCase() === project.id.toLowerCase();

  async function submitDelete() {
    if (!confirmMatches) return;
    setBusy(true);
    try {
      const res = await api.deleteProject(project.id, { force: forceDelete });
      onProjectsChange(res.projects);
      onDeleted(project.id);
      onToast(`Deleted “${project.name}”`);
      setDialog(null);
    } catch (err) {
      onToast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const canDelete = confirmMatches;
  const isRoot = project.id === ".";

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((o) => !o);
        }}
        title="Project actions"
        className={`rounded px-1.5 py-0.5 text-[11px] transition ${
          active || menuOpen
            ? "text-white/55 hover:bg-white/10 hover:text-white/90"
            : "text-white/25 opacity-0 group-hover:opacity-100 hover:bg-white/5 hover:text-white/60"
        }`}
      >
        ⋯
      </button>

      {menuOpen && (
        <ul className="absolute right-0 top-full z-50 mt-1 min-w-[11rem] rounded-lg border border-white/10 bg-[#141820] py-1 text-xs shadow-xl">
          <li>
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-white/80 hover:bg-white/5"
              onClick={() => openDialog("rename")}
            >
              Rename…
            </button>
          </li>
          <li>
            <button
              type="button"
              disabled={isRoot}
              className="w-full px-3 py-1.5 text-left text-white/80 hover:bg-white/5 disabled:opacity-40"
              onClick={() => openDialog("duplicate")}
            >
              Duplicate…
            </button>
          </li>
          <li className="border-t border-white/5">
            <button
              type="button"
              disabled={isRoot}
              className="w-full px-3 py-1.5 text-left text-rose-300/90 hover:bg-rose-500/10 disabled:opacity-40"
              onClick={() => openDialog("delete")}
            >
              Delete project…
            </button>
          </li>
        </ul>
      )}

      {dialog && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
          onClick={() => !busy && setDialog(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-white/10 bg-[#141820] p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {dialog === "rename" && (
              <form onSubmit={(e) => void submitRename(e)}>
                <h3 className="mb-1 text-sm font-semibold text-white">Rename project</h3>
                <p className="mb-3 text-[11px] text-white/40">Updates the display name and optionally the folder id.</p>
                <label className="mb-2 block">
                  <span className="mb-1 block text-[10px] uppercase tracking-wide text-white/35">Display name</span>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white outline-none focus:border-indigo-400/50"
                    autoFocus
                  />
                </label>
                {!isRoot && (
                  <label className="mb-3 block">
                    <span className="mb-1 block text-[10px] uppercase tracking-wide text-white/35">Folder id</span>
                    <input
                      value={folderId}
                      onChange={(e) => setFolderId(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-xs text-white/90 outline-none focus:border-indigo-400/50"
                    />
                  </label>
                )}
                <DialogActions busy={busy} onCancel={() => setDialog(null)} submitLabel="Save" />
              </form>
            )}

            {dialog === "duplicate" && (
              <form onSubmit={(e) => void submitDuplicate(e)}>
                <h3 className="mb-1 text-sm font-semibold text-white">Duplicate project</h3>
                <p className="mb-3 text-[11px] text-white/40">Creates a full copy of all templates, data, and blocks.</p>
                <label className="mb-2 block">
                  <span className="mb-1 block text-[10px] uppercase tracking-wide text-white/35">New display name</span>
                  <input
                    value={displayName}
                    onChange={(e) => {
                      setDisplayName(e.target.value);
                      if (!folderId || folderId === `${project.id}-copy`) setFolderId(slugify(e.target.value));
                    }}
                    placeholder={`${project.name} (copy)`}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white outline-none focus:border-indigo-400/50"
                    autoFocus
                  />
                </label>
                <label className="mb-3 block">
                  <span className="mb-1 block text-[10px] uppercase tracking-wide text-white/35">New folder id</span>
                  <input
                    value={folderId}
                    onChange={(e) => setFolderId(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-xs text-white/90 outline-none focus:border-indigo-400/50"
                  />
                </label>
                <DialogActions busy={busy} onCancel={() => setDialog(null)} submitLabel="Duplicate" />
              </form>
            )}

            {dialog === "delete" && (
              <div>
                <h3 className="mb-1 text-sm font-semibold text-rose-200">Delete project</h3>
                <p className="mb-2 text-[11px] text-white/45">
                  Permanently removes <span className="font-mono text-white/70">{project.id}</span> and all files.
                </p>
                {dependents.length > 0 && (
                  <p className="mb-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200/90">
                    Linked by: {dependents.join(", ")}. Unlink first, or force delete below.
                  </p>
                )}
                <label className="mb-2 block">
                  <span className="mb-1 block text-[10px] tracking-wide text-white/35">
                    Type{" "}
                    <span className="font-mono normal-case text-white/70">{project.id}</span> to confirm
                  </span>
                  <input
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    className="w-full rounded-lg border border-rose-500/20 bg-white/5 px-2.5 py-1.5 font-mono text-xs text-white outline-none focus:border-rose-400/50"
                    autoFocus
                  />
                </label>
                {dependents.length > 0 && (
                  <label className="mb-3 flex cursor-pointer items-center gap-2 text-[11px] text-white/60">
                    <input
                      type="checkbox"
                      checked={forceDelete}
                      onChange={(e) => setForceDelete(e.target.checked)}
                    />
                    Force delete (leave broken dependency links)
                  </label>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDialog(null)}
                    className="rounded-lg px-3 py-1.5 text-xs text-white/50 hover:text-white/80"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!canDelete || busy}
                    onClick={() => void submitDelete()}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DialogActions({
  busy,
  onCancel,
  submitLabel,
}: {
  busy: boolean;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs text-white/50 hover:text-white/80">
        Cancel
      </button>
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-40"
      >
        {busy ? "Working…" : submitLabel}
      </button>
    </div>
  );
}
