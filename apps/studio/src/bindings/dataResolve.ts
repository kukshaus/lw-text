import { evalExpr, type Scope } from "@lw-text/engine";

const MUSTACHE = /\{\{([\s\S]*?)\}\}/g;

/** Fixture JSON is stored as `{ DATA: … }` (dataSources envelope). */
export function normalizeDataScope(data: Record<string, unknown> | null): Scope {
  if (!data) return {};
  return data;
}

export function formatPreviewValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value.length > 120 ? `${value.slice(0, 117)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const s = JSON.stringify(value);
    return s.length > 160 ? `${s.slice(0, 157)}…` : s;
  } catch {
    return String(value);
  }
}

export function resolveBindingPreview(
  expr: string,
  scope: Scope,
): { ok: true; display: string } | { ok: false; message: string } {
  const trimmed = expr.trim();
  if (!trimmed) return { ok: false, message: "Empty binding" };
  try {
    const v = evalExpr(trimmed, scope);
    if (v === undefined) return { ok: false, message: "No value in test data" };
    return { ok: true, display: formatPreviewValue(v) };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** Expression under the caret inside `{{ … }}` or a bare mono binding. */
export function bindingExprAt(text: string, offset: number): string | null {
  for (const m of text.matchAll(MUSTACHE)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (offset >= start && offset <= end) return m[1]!.trim();
  }
  const bare = text.trim();
  if (/^[A-Za-z_][\w.[\]]*$/.test(bare)) return bare;
  return null;
}

export interface BindingCompletionCtx {
  from: number;
  to: number;
  options: string[];
}

/** Suggest schema paths at the text cursor (properties panel + template editor). */
export function bindingCompletionAt(text: string, caret: number, hints: string[]): BindingCompletionCtx | null {
  if (!hints.length) return null;
  const before = text.slice(0, caret);

  const inMustache = before.match(/\{\{\s*([A-Za-z_][\w.[\]]*)$/);
  if (inMustache) {
    const token = inMustache[1] ?? "";
    const from = caret - token.length;
    const options = filterHints(hints, token);
    return options.length ? { from, to: caret, options } : null;
  }

  if (/\{\{\s*$/.test(before)) {
    return { from: caret, to: caret, options: hints.slice(0, 80) };
  }

  const word = before.match(/[A-Za-z_][\w.[\]]*$/);
  if (word) {
    const token = word[0];
    const from = caret - token.length;
    const options = filterHints(hints, token);
    return options.length ? { from, to: caret, options } : null;
  }

  return null;
}

function filterHints(hints: string[], token: string): string[] {
  const t = token.toLowerCase();
  return hints.filter((h) => !t || h.toLowerCase().startsWith(t) || h.toLowerCase().includes(t)).slice(0, 80);
}
