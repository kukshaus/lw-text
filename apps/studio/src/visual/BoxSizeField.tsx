import { useMemo } from "react";
import {
  IMAGE_SIZE_PRESETS,
  SECTION_SIZE_PRESETS,
  parseBoxSize,
  parsePx,
  toPx,
  type BoxSize,
} from "./boxStyle";

export interface BoxSizeFieldProps {
  style: string;
  variant: "image" | "section";
  onChange: (patch: Partial<BoxSize>) => void;
}

export function BoxSizeField({ style, variant, onChange }: BoxSizeFieldProps) {
  const size = useMemo(() => parseBoxSize(style), [style]);
  const presets = variant === "image" ? IMAGE_SIZE_PRESETS : SECTION_SIZE_PRESETS;
  const widthPx = parsePx(size.width);
  const heightPx = parsePx(size.height);
  const minHPx = parsePx(size.minHeight);

  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-white/35">
          {variant === "image" ? "Image size" : "Section size"}
        </span>
        <span className="font-mono text-[10px] text-white/30">
          {size.width || "auto"} × {size.height || size.minHeight || "auto"}
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            title={p.label}
            onClick={() => onChange(p.size)}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium text-white/70 transition hover:border-indigo-400/40 hover:bg-indigo-500/10 hover:text-white"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className={`grid gap-2 ${variant === "section" ? "grid-cols-3" : "grid-cols-2"}`}>
        <DimInput label="Width" px={widthPx} raw={size.width} onCommit={(v) => onChange({ width: v })} />
        <DimInput
          label="Height"
          px={heightPx}
          raw={size.height}
          allowAuto
          onCommit={(v) => onChange({ height: v })}
        />
        {variant === "section" && (
          <DimInput
            label="Min height"
            px={minHPx}
            raw={size.minHeight}
            allowAuto
            onCommit={(v) => onChange({ minHeight: v })}
          />
        )}
      </div>

      {variant === "image" && (
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-white/35">Fit</label>
          <select
            value={size.objectFit ?? "contain"}
            onChange={(e) => onChange({ objectFit: e.target.value })}
            className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/90 outline-none focus:border-indigo-400/50"
          >
            <option value="contain">Contain (keep ratio)</option>
            <option value="cover">Cover (fill box)</option>
            <option value="fill">Stretch</option>
            <option value="">Default</option>
          </select>
        </div>
      )}

      <p className="text-[10px] leading-snug text-white/35">
        {variant === "image"
          ? "Drag handles on the canvas. Shift = free aspect."
          : "Drag handles on the section box. Shift = lock width/height ratio."}
      </p>
    </div>
  );
}

function DimInput({
  label,
  px,
  raw,
  allowAuto,
  onCommit,
}: {
  label: string;
  px: number | null;
  raw?: string;
  allowAuto?: boolean;
  onCommit: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-white/35">{label}</label>
      <div className="flex gap-1">
        <input
          type="number"
          min={8}
          max={4000}
          step={1}
          value={px ?? ""}
          placeholder={allowAuto && !raw ? "auto" : "—"}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n) || n <= 0) {
              if (allowAuto) onCommit("");
              return;
            }
            onCommit(toPx(n));
          }}
          className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/90 outline-none focus:border-indigo-400/50"
        />
        <span className="self-center text-[10px] text-white/30">px</span>
      </div>
    </div>
  );
}
