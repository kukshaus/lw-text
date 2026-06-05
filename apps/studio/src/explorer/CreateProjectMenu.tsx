import { useEffect, useRef, useState } from "react";
import { api, type ProjectKind, type ProjectSummary } from "../api";

export interface CreateProjectMenuProps {
  onCreated: (project: ProjectSummary, kind: ProjectKind) => void;
  onProjectsChange: (projects: ProjectSummary[]) => void;
  onToast: (msg: string) => void;
}

export function CreateProjectMenu({ onCreated, onProjectsChange, onToast }: CreateProjectMenuProps) {
  const [open, setOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [kind, setKind] = useState<ProjectKind>("application");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open && !formOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        if (!busy) setFormOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, formOpen, busy]);

  function startCreate(k: ProjectKind) {
    setKind(k);
    setName("");
    setOpen(false);
    setFormOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await api.createProject({ name: name.trim(), kind });
      onProjectsChange(res.projects);
      onCreated(res.project, kind);
      onToast(`Created ${kind} “${res.project.name}”`);
      setFormOpen(false);
    } catch (err) {
      onToast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        title="Create project"
        onClick={() => setOpen((o) => !o)}
        className="mr-1 rounded px-1.5 py-0.5 text-white/35 hover:bg-indigo-500/20 hover:text-indigo-200"
      >
        +
      </button>

      {open && (
        <ul className="absolute right-0 top-full z-50 mt-1 min-w-[10rem] rounded-lg border border-white/10 bg-[#141820] py-1 text-xs shadow-xl">
          <li>
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-white/80 hover:bg-white/5"
              onClick={() => startCreate("application")}
            >
              New application
            </button>
          </li>
          <li>
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-white/80 hover:bg-white/5"
              onClick={() => startCreate("framework")}
            >
              New framework
            </button>
          </li>
        </ul>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4">
          <form
            className="w-full max-w-sm rounded-xl border border-white/10 bg-[#141820] p-4 shadow-2xl"
            onSubmit={(e) => void submit(e)}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-sm font-semibold text-white">
              {kind === "framework" ? "New framework" : "New application"}
            </h3>
            <p className="mb-3 text-[11px] text-white/40">
              {kind === "framework"
                ? "Shared blocks and schemas for other projects."
                : "Templates, test data, and document composition."}
            </p>
            <label className="mb-3 block">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-white/35">Project name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={kind === "framework" ? "Acme Common" : "My Documents"}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white outline-none focus:border-indigo-400/50"
                autoFocus
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-white/50 hover:text-white/80"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !name.trim()}
                className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-40"
              >
                {busy ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
