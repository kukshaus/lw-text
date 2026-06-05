/** Inline width/height/min-height for images, sections, and block containers. */

export interface BoxSize {
  width?: string;
  height?: string;
  minHeight?: string;
  maxWidth?: string;
  objectFit?: string;
}

export type ImageSize = BoxSize;

/** Block-level tags that support canvas resize + inspector size controls. */
export const RESIZABLE_TAGS = new Set([
  "section",
  "div",
  "header",
  "footer",
  "article",
  "main",
  "aside",
  "nav",
  "blockquote",
  "figure",
  "fieldset",
  "form",
  "table",
  "ul",
  "ol",
]);

export function isResizableTag(tag: string): boolean {
  return RESIZABLE_TAGS.has(tag);
}

export function parseBoxSize(style?: string): BoxSize {
  const map = parseStyleMap(style);
  return {
    width: map.get("width"),
    height: map.get("height"),
    minHeight: map.get("min-height"),
    maxWidth: map.get("max-width"),
    objectFit: map.get("object-fit"),
  };
}

export const parseImageSize = parseBoxSize;

export function applyBoxSizeToStyle(style: string | undefined, patch: Partial<BoxSize>): string {
  const map = parseStyleMap(style);
  const setOrDel = (key: string, val: string | undefined) => {
    if (val === "") map.delete(key);
    else if (val != null) map.set(key, val);
  };
  setOrDel("width", patch.width);
  setOrDel("height", patch.height);
  setOrDel("min-height", patch.minHeight);
  setOrDel("max-width", patch.maxWidth);
  setOrDel("object-fit", patch.objectFit);
  return [...map.entries()].map(([k, v]) => `${k}: ${v}`).join("; ");
}

export const applyImageSizeToStyle = applyBoxSizeToStyle;
export const mergeImageSize = applyBoxSizeToStyle;

export const IMAGE_SIZE_PRESETS: { id: string; label: string; size: Partial<BoxSize> }[] = [
  { id: "xs", label: "XS", size: { width: "64px", height: "auto", maxWidth: "" } },
  { id: "s", label: "S", size: { width: "120px", height: "auto", maxWidth: "" } },
  { id: "m", label: "M", size: { width: "180px", height: "auto", maxWidth: "" } },
  { id: "l", label: "L", size: { width: "260px", height: "auto", maxWidth: "" } },
  { id: "full", label: "Full width", size: { width: "100%", height: "auto", maxWidth: "100%" } },
  { id: "natural", label: "Natural", size: { width: "", height: "", maxWidth: "" } },
];

export const SECTION_SIZE_PRESETS: { id: string; label: string; size: Partial<BoxSize> }[] = [
  { id: "full", label: "Full width", size: { width: "100%", maxWidth: "100%" } },
  { id: "half", label: "Half", size: { width: "50%", maxWidth: "" } },
  { id: "auto", label: "Auto width", size: { width: "", maxWidth: "" } },
  { id: "short", label: "Short", size: { minHeight: "72px" } },
  { id: "medium", label: "Medium", size: { minHeight: "140px" } },
  { id: "tall", label: "Tall", size: { minHeight: "240px" } },
  { id: "clear", label: "Reset", size: { width: "", height: "", minHeight: "", maxWidth: "" } },
];

export function parsePx(value?: string): number | null {
  if (!value) return null;
  const m = /^(\d+(?:\.\d+)?)\s*px$/i.exec(value.trim());
  return m ? Number(m[1]) : null;
}

export function toPx(n: number): string {
  return `${Math.max(8, Math.round(n))}px`;
}

export function boxSizeToCss(size: BoxSize, opts?: { fillHost?: boolean }): Record<string, string | undefined> {
  return {
    width: size.width || (opts?.fillHost ? "100%" : undefined),
    height: size.height && size.height !== "auto" ? size.height : undefined,
    minHeight: size.minHeight || undefined,
    maxWidth: size.maxWidth || undefined,
    boxSizing: "border-box",
  };
}

function parseStyleMap(style?: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!style) return map;
  for (const part of style.split(";")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim().toLowerCase();
    const v = part.slice(idx + 1).trim();
    if (k) map.set(k, v);
  }
  return map;
}
