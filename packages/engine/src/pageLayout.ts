import type { LwDocument, Node } from "./ir.js";

export const PAGE_LAYOUT_STYLE_ID = "lw-page-layout";

export type PageFormat = "A4" | "Letter" | "Legal" | "A3" | "A5" | "Tabloid";
export type PageOrientation = "portrait" | "landscape";

export interface PageLayoutSettings {
  format: PageFormat;
  orientation: PageOrientation;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
}

export interface PageFormatSpec {
  id: PageFormat;
  label: string;
  /** Portrait width × height in mm */
  widthMm: number;
  heightMm: number;
  /** Playwright/Chromium PDF format name */
  pdfFormat: PageFormat | "Tabloid" | "Ledger";
}

export const PAGE_FORMAT_SPECS: PageFormatSpec[] = [
  { id: "A4", label: "A4", widthMm: 210, heightMm: 297, pdfFormat: "A4" },
  { id: "Letter", label: "US Letter", widthMm: 216, heightMm: 279, pdfFormat: "Letter" },
  { id: "Legal", label: "US Legal", widthMm: 216, heightMm: 356, pdfFormat: "Legal" },
  { id: "A3", label: "A3", widthMm: 297, heightMm: 420, pdfFormat: "A3" },
  { id: "A5", label: "A5", widthMm: 148, heightMm: 210, pdfFormat: "A5" },
  { id: "Tabloid", label: "Tabloid", widthMm: 279, heightMm: 432, pdfFormat: "Tabloid" },
];

export const DEFAULT_PAGE_LAYOUT: PageLayoutSettings = {
  format: "A4",
  orientation: "portrait",
  marginTopMm: 20,
  marginRightMm: 18,
  marginBottomMm: 20,
  marginLeftMm: 18,
};

export const PAGE_MARGIN_PRESETS: { id: string; label: string; margins: Pick<
  PageLayoutSettings,
  "marginTopMm" | "marginRightMm" | "marginBottomMm" | "marginLeftMm"
> }[] = [
  { id: "standard", label: "Standard", margins: { marginTopMm: 20, marginRightMm: 18, marginBottomMm: 20, marginLeftMm: 18 } },
  { id: "narrow", label: "Narrow", margins: { marginTopMm: 12, marginRightMm: 12, marginBottomMm: 12, marginLeftMm: 12 } },
  { id: "wide", label: "Wide", margins: { marginTopMm: 25, marginRightMm: 25, marginBottomMm: 25, marginLeftMm: 25 } },
  { id: "letterhead", label: "Letterhead", margins: { marginTopMm: 28, marginRightMm: 18, marginBottomMm: 20, marginLeftMm: 18 } },
];

export function normalizePageLayout(raw: Partial<PageLayoutSettings> | null | undefined): PageLayoutSettings {
  if (!raw) return { ...DEFAULT_PAGE_LAYOUT };
  const format = PAGE_FORMAT_SPECS.some((f) => f.id === raw.format) ? raw.format! : DEFAULT_PAGE_LAYOUT.format;
  return {
    format,
    orientation: raw.orientation === "landscape" ? "landscape" : "portrait",
    marginTopMm: clampMm(raw.marginTopMm, DEFAULT_PAGE_LAYOUT.marginTopMm),
    marginRightMm: clampMm(raw.marginRightMm, DEFAULT_PAGE_LAYOUT.marginRightMm),
    marginBottomMm: clampMm(raw.marginBottomMm, DEFAULT_PAGE_LAYOUT.marginBottomMm),
    marginLeftMm: clampMm(raw.marginLeftMm, DEFAULT_PAGE_LAYOUT.marginLeftMm),
  };
}

function clampMm(n: unknown, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(50, Math.round(v * 10) / 10));
}

export function pageLayoutCss(settings: PageLayoutSettings): string {
  const s = normalizePageLayout(settings);
  const spec = PAGE_FORMAT_SPECS.find((f) => f.id === s.format) ?? PAGE_FORMAT_SPECS[0]!;
  const size =
    s.orientation === "landscape"
      ? `${spec.pdfFormat} landscape`
      : spec.pdfFormat;
  const pad = `${s.marginTopMm}mm ${s.marginRightMm}mm ${s.marginBottomMm}mm ${s.marginLeftMm}mm`;
  return `@page { size: ${size}; margin: ${pad}; }
body {
  padding: ${pad};
}
@media print {
  body { padding: 0; }
}`;
}

/** Screen preview width so Design/Preview match paper proportions (portrait A4 ≈ 820px). */
export function pagePreviewWidthPx(settings: PageLayoutSettings): number {
  const s = normalizePageLayout(settings);
  const spec = PAGE_FORMAT_SPECS.find((f) => f.id === s.format) ?? PAGE_FORMAT_SPECS[0]!;
  const widthMm = s.orientation === "landscape" ? spec.heightMm : spec.widthMm;
  const scale = 820 / 210;
  return Math.round(widthMm * scale);
}

export function pageLayoutLabel(settings: PageLayoutSettings): string {
  const s = normalizePageLayout(settings);
  const spec = PAGE_FORMAT_SPECS.find((f) => f.id === s.format) ?? PAGE_FORMAT_SPECS[0]!;
  const ori = s.orientation === "landscape" ? "landscape" : "portrait";
  return `${spec.label} · ${ori}`;
}

export function extractPageLayoutFromDoc(doc: LwDocument): PageLayoutSettings | null {
  const node = doc.nodes.find(
    (n) => n.type === "element" && n.tag === "style" && n.id === PAGE_LAYOUT_STYLE_ID,
  );
  if (!node || node.type !== "element") return null;
  const txt = node.children.find((c) => c.type === "text");
  if (!txt || txt.type !== "text") return null;
  const raw = txt.text.template.trim();
  if (!raw) return null;
  try {
    return normalizePageLayout(JSON.parse(raw) as Partial<PageLayoutSettings>);
  } catch {
    return null;
  }
}

export function upsertPageLayoutStyle(doc: LwDocument, settings: PageLayoutSettings): LwDocument {
  const next = structuredClone(doc);
  const json = JSON.stringify(normalizePageLayout(settings), null, 2);
  const styleNode: Node = {
    type: "element",
    id: PAGE_LAYOUT_STYLE_ID,
    tag: "style",
    attrs: {},
    children: [{ type: "text", text: { template: json } }],
  };
  const idx = next.nodes.findIndex(
    (n) => n.type === "element" && n.tag === "style" && n.id === PAGE_LAYOUT_STYLE_ID,
  );
  if (idx >= 0) next.nodes[idx] = styleNode;
  else next.nodes.unshift(styleNode);
  return next;
}

export function resolvePageLayout(
  doc: LwDocument,
  override?: Partial<PageLayoutSettings> | null,
): PageLayoutSettings {
  const fromDoc = extractPageLayoutFromDoc(doc);
  return normalizePageLayout({ ...fromDoc, ...override });
}

/** Map to @lw-text/project PDF options. */
export function pageLayoutToPdfOptions(settings: PageLayoutSettings): {
  format: PageFormat | "Legal" | "A3" | "A5" | "Tabloid" | "Ledger";
  landscape: boolean;
} {
  const s = normalizePageLayout(settings);
  const spec = PAGE_FORMAT_SPECS.find((f) => f.id === s.format) ?? PAGE_FORMAT_SPECS[0]!;
  return {
    format: spec.pdfFormat,
    landscape: s.orientation === "landscape",
  };
}
