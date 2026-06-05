import { useEffect, useRef, useState } from "react";
import type { TestCaseSummary } from "../api";

export interface TestCaseBarProps {
  templateId: string;
  cases: TestCaseSummary[];
  activeKey: string;
  onSelect: (key: string) => void;
  onCreate: (input: {
    title: string;
    caseId: string;
    description?: string;
    copyFromKey?: string;
    useCurrentData?: boolean;
  }) => Promise<void>;
  canUseCurrentData?: boolean;
  onDelete: (key: string) => Promise<void>;
}

function slugify(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "case"
  );
}

export function TestCaseBar({
  templateId,
  cases,
  activeKey,
  onSelect,
  onCreate,
  onDelete,
  canUseCurrentData = false,
}: TestCaseBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [caseId, setCaseId] = useState("");
  const [description, setDescription] = useState("");
  const [copyFrom, setCopyFrom] = useState<string>("");
  const [useCurrentData, setUseCurrentData] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const createRef = useRef<HTMLDivElement>(null);

  const active = cases.find((c) => c.key === activeKey);

  useEffect(() => {
    if (!createOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (createRef.current && !createRef.current.contains(e.target as Node)) setCreateOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [createOpen]);

  useEffect(() => {
    if (createOpen) {
      setCopyFrom(activeKey || cases[0]?.key || "");
      setTitle("");
      setCaseId("");
      setDescription("");
      setUseCurrentData(canUseCurrentData);
    }
  }, [createOpen, activeKey, cases, canUseCurrentData]);

  useEffect(() => {
    if (title && !caseId) setCaseId(slugify(title));
  }, [title, caseId]);

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await onCreate({
        title: title.trim(),
        caseId: caseId.trim() || slugify(title),
        description: description.trim() || undefined,
        copyFromKey: useCurrentData ? undefined : copyFrom || undefined,
        useCurrentData,
      });
      setCreateOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 border-l border-white/5 pl-3">
      <div className="flex min-w-0 flex-col shrink-0">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-white/30">Scenarios</span>
        {templateId && (
          <span className="max-w-[7rem] truncate font-mono text-[10px] text-white/25">{templateId}</span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {cases.length === 0 ? (
          <span className="whitespace-nowrap text-[11px] text-white/35">No scenarios yet</span>
        ) : (
          cases.map((c) => {
            const isActive = c.key === activeKey;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => onSelect(c.key)}
                title={c.description ?? c.key}
                className={`group flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition ${
                  isActive
                    ? "bg-indigo-500/25 text-indigo-100 ring-1 ring-indigo-400/40 shadow-sm shadow-indigo-900/30"
                    : "bg-white/[0.04] text-white/55 ring-1 ring-white/8 hover:bg-white/[0.07] hover:text-white/85"
                }`}
              >
                {c.isDefault && (
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-white/30">def</span>
                )}
                <span className="max-w-[8rem] truncate">{c.title}</span>
              </button>
            );
          })
        )}
      </div>

      <div className="relative shrink-0" ref={createRef}>
        <button
          type="button"
          onClick={() => setCreateOpen((o) => !o)}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/30 transition hover:bg-indigo-500/35"
          title="New test scenario"
        >
          +
        </button>

        {createOpen && (
          <form
            onSubmit={(e) => void submitCreate(e)}
            className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-white/10 bg-[#141820] p-3 shadow-2xl shadow-black/50"
          >
            <p className="mb-2 text-xs font-semibold text-white/90">New scenario</p>
            <label className="mb-2 block">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-white/35">Display name</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. B2C customer"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white outline-none focus:border-indigo-400/50"
                autoFocus
              />
            </label>
            <label className="mb-2 block">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-white/35">Case id</span>
              <input
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                placeholder="b2c-customer"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-xs text-white/90 outline-none focus:border-indigo-400/50"
              />
            </label>
            <label className={`mb-2 block ${useCurrentData ? "opacity-40" : ""}`}>
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-white/35">Copy data from</span>
              <select
                value={copyFrom}
                disabled={useCurrentData}
                onChange={(e) => setCopyFrom(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white/90 outline-none disabled:cursor-not-allowed"
              >
                <option value="">Empty DATA object</option>
                {cases.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            {canUseCurrentData && (
              <label className="mb-2 flex cursor-pointer items-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-2">
                <input
                  type="checkbox"
                  checked={useCurrentData}
                  onChange={(e) => setUseCurrentData(e.target.checked)}
                  className="rounded border-white/20"
                />
                <span className="text-[11px] text-white/70">Start from current editor data</span>
              </label>
            )}
            <label className="mb-3 block">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-white/35">Note (optional)</span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this scenario tests"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white/80 outline-none focus:border-indigo-400/50"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-white/50 hover:text-white/80"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !title.trim()}
                className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-40"
              >
                {submitting ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="rounded-lg px-2 py-1 text-white/40 transition hover:bg-white/5 hover:text-white/70"
          title="More actions"
        >
          ⋯
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <ul className="absolute right-0 top-full z-50 mt-1 min-w-[10rem] rounded-lg border border-white/10 bg-[#141820] py-1 text-xs shadow-xl">
              <li>
                <button
                  type="button"
                  className="w-full px-3 py-1.5 text-left text-white/75 hover:bg-white/5 disabled:opacity-40"
                  disabled={!activeKey}
                  onClick={() => {
                    setMenuOpen(false);
                    if (active) {
                      setCreateOpen(true);
                      setTitle(`${active.title} (copy)`);
                      setCaseId("");
                      setCopyFrom(activeKey);
                    }
                  }}
                >
                  Duplicate as new…
                </button>
              </li>
              <li className="border-t border-white/5">
                <button
                  type="button"
                  className="w-full px-3 py-1.5 text-left text-rose-300/90 hover:bg-rose-500/10 disabled:opacity-40"
                  disabled={!activeKey || active?.isDefault}
                  onClick={() => {
                    setMenuOpen(false);
                    if (activeKey && window.confirm(`Delete scenario “${active?.title ?? activeKey}”?`)) {
                      void onDelete(activeKey);
                    }
                  }}
                >
                  Delete scenario
                </button>
              </li>
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
