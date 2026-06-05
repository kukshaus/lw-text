import { linter, type Diagnostic as CmLint } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";
import type { Diagnostic } from "../api";

function lineColToOffset(view: EditorView, line: number, col: number): number {
  const doc = view.state.doc;
  const ln = Math.max(1, Math.min(line, doc.lines));
  const lineObj = doc.line(ln);
  return Math.min(lineObj.to, lineObj.from + Math.max(0, col - 1));
}

function toCmMarks(view: EditorView, items: Diagnostic[]): CmLint[] {
  return items.map((d) => {
    const line = d.loc?.line ?? 1;
    const col = d.loc?.col ?? 1;
    const from = lineColToOffset(view, line, col);
    const lineEnd = view.state.doc.line(Math.min(line, view.state.doc.lines));
    const to = Math.min(lineEnd.to, from + Math.max(1, lineEnd.length));
    const message = d.hint ? `${d.message}\n\n${d.hint}` : d.message;
    return {
      from,
      to: Math.max(to, from + 1),
      severity: d.severity === "warning" ? "warning" : "error",
      message,
      source: d.code,
    };
  });
}

/** CodeMirror gutter markers from lw-text diagnostics. */
export function diagnosticsLinter(getItems: () => Diagnostic[]) {
  return linter((view) => toCmMarks(view, getItems()));
}
