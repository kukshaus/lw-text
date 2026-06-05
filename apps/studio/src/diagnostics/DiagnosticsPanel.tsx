import { useState } from "react";
import type { Diagnostic } from "../api";
import { formatDiagnosticsForCopy } from "./diagnose";

export function DiagnosticsPanel({
  diagnostics,
  warnings = [],
  projectId,
  templateId,
  title = "Diagnostics",
  emptyMessage = "No issues.",
  onCopied,
}: {
  diagnostics: Diagnostic[];
  warnings?: string[];
  projectId?: string;
  templateId?: string;
  title?: string;
  emptyMessage?: string;
  onCopied?: (message: string) => void;
}) {
  const hasIssues = diagnostics.length > 0 || warnings.length > 0;
  const [copied, setCopied] = useState(false);

  async function copyAll() {
    const text = formatDiagnosticsForCopy(diagnostics, warnings, { projectId, templateId });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onCopied?.("Diagnostics copied — paste into your AI assistant");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      onCopied?.("Could not copy to clipboard");
    }
  }

  return (
    <div className="border-b border-white/5 p-3">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">{title}</h3>
        {hasIssues && (
          <button
            type="button"
            onClick={() => void copyAll()}
            title="Copy all diagnostics for AI-assisted fixing"
            className="ml-auto rounded-md border border-white/10 px-2 py-0.5 text-[10px] font-medium text-white/50 transition hover:border-indigo-400/40 hover:bg-indigo-500/10 hover:text-indigo-200"
          >
            {copied ? "Copied!" : "Copy all"}
          </button>
        )}
      </div>
      {diagnostics.length === 0 && warnings.length === 0 ? (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{emptyMessage}</p>
      ) : (
        <DiagnosticList diagnostics={diagnostics} warnings={warnings} />
      )}
    </div>
  );
}

/** Compact list for under the code editor. */
export function EditorDiagnosticsStrip({
  diagnostics,
  warnings = [],
}: {
  diagnostics: Diagnostic[];
  warnings?: string[];
}) {
  if (diagnostics.length === 0 && warnings.length === 0) return null;
  return (
    <div className="max-h-40 shrink-0 overflow-auto border-t border-rose-500/20 bg-rose-950/40 px-3 py-2">
      <DiagnosticList diagnostics={diagnostics} warnings={warnings} compact />
    </div>
  );
}

function DiagnosticList({
  diagnostics,
  warnings,
  compact,
}: {
  diagnostics: Diagnostic[];
  warnings: string[];
  compact?: boolean;
}) {
  return (
    <ul className={compact ? "space-y-1" : "space-y-1.5"}>
      {diagnostics.map((d, i) => (
        <li
          key={`${d.code}-${i}`}
          className={`rounded-md border border-white/5 bg-white/[0.03] text-xs ${
            compact ? "p-1.5" : "p-2"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                d.severity === "error" ? "bg-rose-500/20 text-rose-300" : "bg-amber-500/20 text-amber-300"
              }`}
            >
              {d.code}
            </span>
            {d.path && <span className="font-mono text-violet-300">{d.path}</span>}
            {d.loc && (
              <span className="font-mono text-rose-300/90">
                line {d.loc.line}
                {d.loc.col > 1 ? `:${d.loc.col}` : ""}
              </span>
            )}
          </div>
          <p className={`text-white/85 ${compact ? "mt-0.5" : "mt-1"}`}>{d.message}</p>
          {d.hint && <p className="mt-0.5 text-white/45">{d.hint}</p>}
        </li>
      ))}
      {warnings.map((w, i) => (
        <li
          key={`w${i}`}
          className={`rounded-md border border-amber-500/10 bg-amber-500/[0.06] text-xs text-amber-200 ${
            compact ? "p-1.5" : "p-2"
          }`}
        >
          {w}
        </li>
      ))}
    </ul>
  );
}
