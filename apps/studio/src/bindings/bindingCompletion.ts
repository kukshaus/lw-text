import type { Completion, CompletionContext } from "@codemirror/autocomplete";
import { bindingCompletionAt } from "./dataResolve";

export function bindingCompletionSource(hints: string[]) {
  const wrapped: Completion[] = hints.map((h) => ({
    label: `{{ ${h} }}`,
    type: "text",
    detail: "interpolation",
    apply: `{{ ${h} }}`,
  }));
  const bare: Completion[] = hints.map((h) => ({
    label: h,
    type: "variable",
    detail: "binding",
  }));

  return (ctx: CompletionContext) => {
    const line = ctx.state.doc.lineAt(ctx.pos);
    const lineText = line.text;
    const caretInLine = ctx.pos - line.from;
    const fullBefore = ctx.state.doc.sliceString(0, ctx.pos);

    const mustache = fullBefore.match(/\{\{\s*([A-Za-z_][\w.[\]]*)$/);
    if (mustache) {
      const token = mustache[1] ?? "";
      const from = ctx.pos - token.length;
      const options = bare.filter((o) =>
        !token || o.label.toLowerCase().startsWith(token.toLowerCase()) || o.label.toLowerCase().includes(token.toLowerCase()),
      );
      return options.length ? { from, options: options.slice(0, 80), validFor: /^[\w.[\]]*$/ } : null;
    }

    if (/\{\{\s*$/.test(fullBefore) || (fullBefore.endsWith("{") && lineText.slice(0, caretInLine).endsWith("{{"))) {
      return { from: ctx.pos, options: bare.slice(0, 80) };
    }

    const panel = bindingCompletionAt(lineText, caretInLine, hints);
    if (panel) {
      const from = line.from + panel.from;
      return {
        from,
        options: bare.filter((o) => panel.options.includes(o.label)).slice(0, 80),
        validFor: /^[\w.[\]]*$/,
      };
    }

    const word = ctx.matchBefore(/[A-Za-z_][\w.[\]]*/);
    if (!word && !ctx.explicit) return null;
    const from = word ? word.from : ctx.pos;
    const token = word?.text?.toLowerCase() ?? "";
    const options = [...bare, ...wrapped].filter((o) => {
      const core = o.label.startsWith("{{") ? o.label.slice(3, -3).trim().toLowerCase() : o.label.toLowerCase();
      return !token || core.includes(token);
    });
    return { from, options: options.slice(0, 80), validFor: /^[\w.[\]]*$/ };
  };
}
