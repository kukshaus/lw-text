import { EditorSelection, StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import type { SourceRange } from "./sourceLocator";

export const setSourceHighlight = StateEffect.define<SourceRange | null>();

const highlightMark = Decoration.mark({ class: "cm-lw-source-mark" });
const highlightLine = Decoration.line({ class: "cm-lw-source-line" });

const highlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setSourceHighlight)) {
        const range = effect.value;
        if (!range) return Decoration.none;
        const line = tr.state.doc.line(Math.min(range.line, tr.state.doc.lines));
        return Decoration.set([
          highlightLine.range(line.from),
          highlightMark.range(
            Math.min(range.from, tr.state.doc.length),
            Math.min(range.to, tr.state.doc.length),
          ),
        ]);
      }
    }
    return deco.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

export const sourceHighlightExtension = highlightField;

export function revealSourceRange(view: EditorView, range: SourceRange): void {
  const doc = view.state.doc;
  const from = Math.max(0, Math.min(range.from, doc.length));
  const to = Math.max(from + 1, Math.min(range.to, doc.length));
  const line = doc.line(Math.min(range.line, doc.lines));

  view.dispatch({
    effects: [
      setSourceHighlight.of(range),
      EditorView.scrollIntoView(line.from, { y: "center" }),
    ],
    selection: EditorSelection.single(from, to),
  });
  view.focus();
}

export function clearSourceHighlight(view: EditorView): void {
  view.dispatch({ effects: setSourceHighlight.of(null) });
}
