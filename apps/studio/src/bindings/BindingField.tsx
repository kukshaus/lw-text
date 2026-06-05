import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  bindingCompletionAt,
  bindingExprAt,
  normalizeDataScope,
  resolveBindingPreview,
} from "./dataResolve";

export interface BindingFieldProps {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  variableHints: string[];
  sampleData: Record<string, unknown> | null;
  mono?: boolean;
  multiline?: boolean;
}

export function BindingField({
  label,
  value,
  onCommit,
  variableHints,
  sampleData,
  mono,
  multiline,
}: BindingFieldProps) {
  const scope = useMemo(() => normalizeDataScope(sampleData), [sampleData]);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);
  const [menu, setMenu] = useState<{ from: number; to: number; options: string[]; index: number } | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; title: string; body: string } | null>(null);

  useEffect(() => setDraft(value), [value]);

  const syncMenu = useCallback(
    (text: string, caret: number) => {
      const ctx = bindingCompletionAt(text, caret, variableHints);
      if (!ctx) {
        setMenu(null);
        return;
      }
      setMenu({ from: ctx.from, to: ctx.to, options: ctx.options, index: 0 });
    },
    [variableHints],
  );

  const applyOption = useCallback(
    (path: string) => {
      if (!menu) return;
      const next = draft.slice(0, menu.from) + path + draft.slice(menu.to);
      setDraft(next);
      setMenu(null);
      const pos = menu.from + path.length;
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(pos, pos);
      });
    },
    [draft, menu],
  );

  const onInput = (text: string, caret: number) => {
    setDraft(text);
    syncMenu(text, caret);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (menu && menu.options.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMenu((m) => (m ? { ...m, index: (m.index + 1) % m.options.length } : m));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMenu((m) => (m ? { ...m, index: (m.index - 1 + m.options.length) % m.options.length } : m));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applyOption(menu.options[menu.index]!);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMenu(null);
        return;
      }
    }
    if (e.key === " " && e.ctrlKey) {
      e.preventDefault();
      const el = inputRef.current;
      const caret = el ? (el.selectionStart ?? draft.length) : draft.length;
      syncMenu(draft, caret);
    }
  };

  const onPointerMove = (e: MouseEvent) => {
    const el = inputRef.current;
    if (!el || !sampleData) {
      setTip(null);
      return;
    }
    const caret = caretOffsetFromPoint(el, e.clientX, e.clientY);
    const expr = bindingExprAt(draft, caret);
    if (!expr) {
      setTip(null);
      return;
    }
    const preview = resolveBindingPreview(expr, scope);
    const rect = el.getBoundingClientRect();
    setTip({
      x: Math.min(e.clientX, window.innerWidth - 280),
      y: rect.bottom + 6,
      title: expr,
      body: preview.ok ? preview.display : preview.message,
    });
  };

  const cls = `w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/90 outline-none focus:border-indigo-400/50 ${mono ? "font-mono" : ""}`;

  return (
    <div className="relative">
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-white/35">{label}</label>
      {multiline ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          rows={3}
          className={cls}
          spellCheck={false}
          onChange={(e) => onInput(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          onKeyDown={onKeyDown}
          onBlur={(e) => onCommit(e.target.value)}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setTip(null)}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={draft}
          className={cls}
          spellCheck={false}
          onChange={(e) => onInput(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          onKeyDown={onKeyDown}
          onBlur={(e) => onCommit(e.target.value)}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setTip(null)}
        />
      )}
      {menu && menu.options.length > 0 && (
        <ul
          className="absolute left-0 right-0 z-50 mt-1 max-h-40 overflow-auto rounded-md border border-indigo-400/30 bg-[#151922] py-1 shadow-lg"
          role="listbox"
        >
          {menu.options.map((opt, i) => (
            <li key={opt}>
              <button
                type="button"
                role="option"
                aria-selected={i === menu.index}
                className={`block w-full px-2 py-1 text-left font-mono text-xs ${
                  i === menu.index ? "bg-indigo-500/25 text-indigo-100" : "text-white/80 hover:bg-white/5"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyOption(opt);
                }}
              >
                {opt}
              </button>
            </li>
          ))}
        </ul>
      )}
      {tip && (
        <div
          className="pointer-events-none fixed z-[200] max-w-xs rounded-md border border-indigo-400/40 bg-[#1a2030] px-2.5 py-2 shadow-xl"
          style={{ left: tip.x, top: tip.y }}
        >
          <p className="font-mono text-[10px] text-indigo-300">{tip.title}</p>
          <p className="mt-0.5 break-words text-xs text-white/90">{tip.body}</p>
          <p className="mt-1 text-[9px] text-white/35">Test data preview</p>
        </div>
      )}
      <p className="mt-1 text-[9px] text-white/30">
        Type <span className="font-mono text-white/45">{"{{ DATA."}</span> for suggestions · hover binding for value · Ctrl+Space
      </p>
    </div>
  );
}

/** Approximate caret index from pointer position (textarea / input). */
function caretOffsetFromPoint(el: HTMLTextAreaElement | HTMLInputElement, clientX: number, clientY: number): number {
  if (typeof document.caretPositionFromPoint === "function") {
    const pos = document.caretPositionFromPoint(clientX, clientY);
    if (pos?.offsetNode === el.firstChild || pos?.offsetNode === el) return pos.offset;
  }
  const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
  const range = doc.caretRangeFromPoint?.(clientX, clientY);
  if (range && (range.startContainer === el || el.contains(range.startContainer))) {
    return range.startOffset;
  }
  return el.selectionStart ?? el.value.length;
}
