import { parseLw, ParseError } from "@lw-text/engine";
import type { Diagnostic } from "../api";

/** Parse `data.json` / fixture text and return structured issues (syntax + hints). */
export function diagnoseJson(text: string): Diagnostic[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [
      {
        severity: "error",
        code: "JSON_EMPTY",
        message: "JSON is empty.",
        hint: "Add a root object, e.g. { \"DATA\": { ... } }.",
      },
    ];
  }
  try {
    JSON.parse(text);
    return [];
  } catch (e) {
    const err = e as SyntaxError;
    const loc = jsonErrorLocation(text, err);
    const message = err.message || "Invalid JSON";
    return [
      {
        severity: "error",
        code: "JSON_SYNTAX",
        message: simplifyJsonMessage(message),
        loc,
        hint: jsonSyntaxHint(message, text, loc?.line),
      },
    ];
  }
}

/** Parse `.lw` template source before compose/validate. */
export function diagnoseTemplateParse(source: string): Diagnostic[] {
  if (!source.trim()) {
    return [
      {
        severity: "error",
        code: "LW_EMPTY",
        message: "Template source is empty.",
        hint: "Add a root <template id=\"…\" …> element.",
      },
    ];
  }
  try {
    parseLw(source);
    return [];
  } catch (e) {
    const pe = e as ParseError;
    const line = pe.line ?? guessLineFromLwMessage(source, pe.message);
    return [
      {
        severity: "error",
        code: "LW_PARSE",
        message: pe.message,
        loc: line ? { line, col: 1 } : undefined,
        hint: "Fix the markup in the template editor, then check Preview again.",
      },
    ];
  }
}

export function countBySeverity(items: Diagnostic[]): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const d of items) {
    if (d.severity === "error") errors++;
    else warnings++;
  }
  return { errors, warnings };
}

/** Short label for the top status chip (first error preferred). */
export function statusLabel(
  items: Diagnostic[],
  opts?: { dataInvalid?: boolean },
): { text: string; title: string; tone: "ok" | "warn" | "error" } {
  const { errors, warnings } = countBySeverity(items);
  if (errors > 0) {
    const first = items.find((d) => d.severity === "error")!;
    const loc = first.loc ? ` · line ${first.loc.line}` : "";
    const text =
      errors === 1
        ? truncate(`${first.message}${loc}`, 72)
        : `${errors} errors — ${truncate(first.message, 48)}`;
    return { text, title: formatDiagnosticsTitle(items), tone: "error" };
  }
  if (opts?.dataInvalid) {
    return {
      text: "Invalid JSON — open data.json for details",
      title: "Test data JSON could not be parsed. Switch to the data tab to see the exact issue.",
      tone: "error",
    };
  }
  if (warnings > 0) {
    const first = items.find((d) => d.severity === "warning")!;
    return {
      text: warnings === 1 ? truncate(first.message, 72) : `${warnings} warnings`,
      title: formatDiagnosticsTitle(items),
      tone: "warn",
    };
  }
  return { text: "Valid", title: "No blocking issues", tone: "ok" };
}

export function formatDiagnosticsForCopy(
  diagnostics: Diagnostic[],
  warnings: string[],
  ctx?: { projectId?: string; templateId?: string },
): string {
  const lines: string[] = ["lw-text Studio — diagnostics", ""];
  if (ctx?.projectId) lines.push(`Project: ${ctx.projectId}`);
  if (ctx?.templateId) lines.push(`Template: ${ctx.templateId}`);
  if (ctx?.projectId || ctx?.templateId) lines.push("");

  for (const d of diagnostics) {
    const loc = d.loc ? ` @ ${d.loc.line}:${d.loc.col}` : "";
    const path = d.path ? ` (${d.path})` : "";
    lines.push(`[${d.severity.toUpperCase()}] ${d.code}${path}${loc}`);
    lines.push(`  ${d.message}`);
    if (d.hint) lines.push(`  Hint: ${d.hint}`);
    lines.push("");
  }
  for (const w of warnings) {
    lines.push(`[WARNING] ${w}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function formatDiagnosticsTitle(items: Diagnostic[]): string {
  return items
    .map((d) => {
      const loc = d.loc ? ` line ${d.loc.line}` : "";
      return `${d.severity}: ${d.message}${loc}${d.hint ? `\n  → ${d.hint}` : ""}`;
    })
    .join("\n\n");
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function simplifyJsonMessage(message: string): string {
  return message.replace(/^JSON\.parse: /, "").replace(/^Unexpected token /, "Unexpected token ");
}

function jsonErrorLocation(text: string, err: SyntaxError): { line: number; col: number } | undefined {
  const posMatch = /position\s+(\d+)/i.exec(err.message);
  if (posMatch) return offsetToLineCol(text, Number(posMatch[1]));
  const lineMatch = /line\s+(\d+)\s+column\s+(\d+)/i.exec(err.message);
  if (lineMatch) return { line: Number(lineMatch[1]), col: Number(lineMatch[2]) };
  return undefined;
}

function offsetToLineCol(text: string, offset: number): { line: number; col: number } {
  const safe = Math.max(0, Math.min(offset, text.length));
  const before = text.slice(0, safe);
  const lines = before.split("\n");
  return { line: lines.length, col: (lines[lines.length - 1]?.length ?? 0) + 1 };
}

function jsonSyntaxHint(message: string, text: string, line?: number): string {
  const lower = message.toLowerCase();
  if (lower.includes("unexpected end") || lower.includes("end of json")) {
    const lineText = line ? text.split("\n")[line - 1] ?? "" : text;
    if ((lineText.match(/"/g)?.length ?? 0) % 2 === 1) {
      return "This line has an opening quote without a closing \" — strings must be closed.";
    }
    return "JSON ended early — check for missing }, ], or closing quotes.";
  }
  if (lower.includes("unexpected token")) {
    if (message.includes("}") || message.includes("]")) {
      return "Often caused by a missing comma between properties, or an extra comma before } or ].";
    }
    return "Check commas between properties and that keys/strings use double quotes.";
  }
  if (lower.includes("unexpected string") || lower.includes("unexpected number")) {
    return "A value may be missing a comma before the next property.";
  }
  return "Fix the syntax at the highlighted line, then save the scenario.";
}

function guessLineFromLwMessage(source: string, message: string): number | undefined {
  const m = /line\s+(\d+)/i.exec(message);
  if (m) return Number(m[1]);
  if (message.includes("<template")) return 1;
  const idx = source.indexOf("<template");
  if (idx < 0) return 1;
  return source.slice(0, idx).split("\n").length;
}
