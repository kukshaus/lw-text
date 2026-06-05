import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { BindingAutocompleteMenu, type BindingMenuState } from "./BindingAutocompleteMenu";
import { bindingCompletionAt, bindingExprAt, normalizeDataScope, resolveBindingPreview } from "./dataResolve";
import { getCaretOffset, setCaretOffset } from "./contentEditableCaret";

export interface CanvasEditableTextProps {
  value: string;
  variableHints: string[];
  sampleData: Record<string, unknown> | null;
  onCommit: (v: string) => void;
  onSelect: (e: MouseEvent) => void;
}

/** Inline contenteditable text on the design canvas with DATA.* autocomplete. */
export function CanvasEditableText({
  value,
  variableHints,
  sampleData,
  onCommit,
  onSelect,
}: CanvasEditableTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const scope = useMemo(() => normalizeDataScope(sampleData), [sampleData]);
  const [menu, setMenu] = useState<BindingMenuState | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; title: string; body: string } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && el.textContent !== value) el.textContent = value;
  }, [value]);

  const syncMenu = useCallback(() => {
    const el = ref.current;
    if (!el || !variableHints.length) {
      setMenu(null);
      return;
    }
    const text = el.textContent ?? "";
    const caret = getCaretOffset(el);
    const ctx = bindingCompletionAt(text, caret, variableHints);
    if (!ctx) {
      setMenu(null);
      return;
    }
    setAnchorRect(el.getBoundingClientRect());
    setMenu({ from: ctx.from, to: ctx.to, options: ctx.options, index: 0 });
  }, [variableHints]);

  const applyOption = useCallback(
    (path: string) => {
      const el = ref.current;
      if (!el || !menu) return;
      const text = el.textContent ?? "";
      const next = text.slice(0, menu.from) + path + text.slice(menu.to);
      el.textContent = next;
      setMenu(null);
      const pos = menu.from + path.length;
      requestAnimationFrame(() => {
        el.focus();
        setCaretOffset(el, pos);
      });
    },
    [menu],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
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
      syncMenu();
    }
  };

  const onPointerMove = (e: MouseEvent) => {
    const el = ref.current;
    if (!el || !sampleData) {
      setTip(null);
      return;
    }
    const caret = getCaretOffset(el);
    const expr = bindingExprAt(el.textContent ?? "", caret);
    if (!expr) {
      setTip(null);
      return;
    }
    const preview = resolveBindingPreview(expr, scope);
    setTip({
      x: e.clientX,
      y: e.clientY + 14,
      title: expr,
      body: preview.ok ? preview.display : preview.message,
    });
  };

  return (
    <>
      <span
        ref={ref}
        className="lw-text-edit"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onClick={onSelect}
        onInput={syncMenu}
        onKeyUp={syncMenu}
        onKeyDown={onKeyDown}
        onBlur={(e) => {
          setMenu(null);
          setTip(null);
          const next = e.currentTarget.textContent ?? "";
          if (next !== value) onCommit(next);
        }}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setTip(null)}
      />
      {menu && anchorRect &&
        createPortal(
          <BindingAutocompleteMenu menu={menu} anchorRect={anchorRect} onPick={applyOption} />,
          document.body,
        )}
      {tip &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[301] max-w-xs rounded-md border border-indigo-400/40 bg-[#1a2030] px-2 py-1.5 shadow-lg"
            style={{ left: Math.min(tip.x, window.innerWidth - 260), top: tip.y }}
          >
            <p className="font-mono text-[10px] text-indigo-300">{tip.title}</p>
            <p className="text-[11px] text-white/90">{tip.body}</p>
          </div>,
          document.body,
        )}
    </>
  );
}
