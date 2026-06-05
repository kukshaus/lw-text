import { useMemo } from "react";
import type { Node } from "@lw-text/engine";
import { childrenOf } from "./editorModel";
import {
  applyHorizontalAlign,
  applyVerticalAlign,
  getAlignmentMode,
  hasBlockChildren,
  parseAlignment,
  type HAlign,
  type VAlign,
} from "./alignmentStyle";

export interface AlignmentFieldProps {
  tag: string;
  style: string;
  children?: Node[];
  compact?: boolean;
  onChange: (style: string) => void;
}

export function AlignmentField({ tag, style, children, compact, onChange }: AlignmentFieldProps) {
  const childTags =
    children?.map((c) => (c.type === "element" ? c.tag : c.type === "if" || c.type === "repeat" ? "div" : "")).filter(Boolean) ??
    [];
  const mode = getAlignmentMode(tag, hasBlockChildren(tag, childTags));
  const parsed = useMemo(() => parseAlignment(style, mode), [style, mode]);
  const showVertical = mode !== "text";

  const setH = (h: HAlign) => onChange(applyHorizontalAlign(style, mode, h));
  const setV = (v: VAlign) => onChange(applyVerticalAlign(style, mode, v));

  return (
    <div className={compact ? "flex items-center gap-2" : "space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-2"}>
      {!compact && (
        <span className="text-[10px] font-medium uppercase tracking-wide text-white/35">
          Alignment {mode === "flex" ? "(layout)" : mode === "self" ? "(position)" : "(text)"}
        </span>
      )}
      <div className={`flex flex-wrap items-center gap-2 ${compact ? "" : "flex-col items-stretch"}`}>
        <AlignRow
          label={compact ? "H" : "Horizontal"}
          options={
            mode === "flex"
              ? ([
                  ["start", "⬅", "Left / start"],
                  ["center", "⊙", "Center"],
                  ["end", "➡", "Right / end"],
                  ["between", "⇔", "Space between"],
                ] as const)
              : ([
                  ["start", "⬅", "Left"],
                  ["center", "⊙", "Center"],
                  ["end", "➡", "Right"],
                ] as const)
          }
          active={parsed.horizontal}
          onPick={setH}
          compact={compact}
        />
        {showVertical && (
          <AlignRow
            label={compact ? "V" : "Vertical"}
            options={
              [
                ["start", "⬆", "Top"],
                ["center", "⊙", "Middle"],
                ["end", "⬇", "Bottom"],
              ] as const
            }
            active={parsed.vertical}
            onPick={setV}
            compact={compact}
          />
        )}
      </div>
    </div>
  );
}

function AlignRow<T extends string>({
  label,
  options,
  active,
  onPick,
  compact,
}: {
  label: string;
  options: readonly (readonly [T, string, string])[];
  active: T | null;
  onPick: (v: T) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "flex items-center gap-1" : ""}>
      <span className={`shrink-0 font-medium uppercase text-white/35 ${compact ? "text-[9px] w-3" : "mb-1 block text-[10px]"}`}>
        {label}
      </span>
      <div className={`inline-flex rounded-md border border-white/10 bg-white/5 p-0.5 ${compact ? "" : "w-full"}`}>
        {options.map(([id, icon, title]) => (
          <button
            key={id}
            type="button"
            title={title}
            onClick={() => onPick(id)}
            className={`grid min-w-[28px] place-items-center rounded px-2 py-1 text-sm transition ${
              active === id
                ? "bg-indigo-500/80 text-white shadow"
                : "text-white/55 hover:bg-white/10 hover:text-white"
            }`}
          >
            {icon}
          </button>
        ))}
      </div>
    </div>
  );
}

export function isAlignableElement(node: Node): node is Extract<Node, { type: "element" }> {
  if (node.type !== "element") return false;
  const skip = new Set(["tr", "thead", "tbody", "tfoot", "colgroup", "col", "br", "hr"]);
  return !skip.has(node.tag);
}

export function childTagsOf(node: Extract<Node, { type: "element" }>): Node[] {
  const kids = childrenOf(node);
  return kids ?? [];
}
