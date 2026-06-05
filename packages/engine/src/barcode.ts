// The `/browser` build exposes a pure-JS `toSVG` (no canvas) that runs in both
// Node (server + PDF pipeline) and the browser (Studio), and resolves cleanly
// under "Bundler" module resolution + Vite.
import { toSVG } from "bwip-js/browser";
import { escapeHtml } from "./format.js";
import type { BarcodeSymbology } from "./ir.js";

/** lw symbology → bwip-js `bcid`. */
const BCID: Record<BarcodeSymbology, string> = {
  qrcode: "qrcode",
  datamatrix: "datamatrix",
  pdf417: "pdf417",
  code128: "code128",
  code39: "code39",
  ean13: "ean13",
  ean8: "ean8",
  "gs1-128": "gs1-128",
  interleaved2of5: "interleaved2of5",
};

/** Two-dimensional symbologies size themselves; 1D needs an explicit height. */
const TWO_D = new Set<BarcodeSymbology>(["qrcode", "datamatrix", "pdf417"]);

export interface BarcodeRenderOptions {
  scale?: number;
  height?: number;
  showText?: boolean;
}

/**
 * Render a barcode/QR to an inline SVG string (renders identically in HTML and
 * in the Chromium PDF pipeline, with no canvas dependency). On any failure —
 * e.g. invalid data for the chosen symbology — a labelled placeholder is
 * returned instead of throwing, mirroring the engine's other soft-fail paths.
 */
export function renderBarcodeSvg(
  symbology: BarcodeSymbology,
  text: string,
  opts: BarcodeRenderOptions = {},
): string {
  const bcid = BCID[symbology] ?? "qrcode";
  // bwip-js rejects `undefined` option values, so only set keys we mean to pass.
  const options: Record<string, unknown> = {
    bcid,
    text: text || " ",
    scale: opts.scale ?? 3,
    includetext: opts.showText ?? false,
    textxalign: "center",
  };
  if (!TWO_D.has(symbology)) options.height = opts.height ?? 10;
  try {
    return toSVG(options as unknown as Parameters<typeof toSVG>[0]);
  } catch (e) {
    return placeholder(symbology, text, (e as Error).message);
  }
}

function placeholder(symbology: BarcodeSymbology, text: string, reason: string): string {
  return (
    `<span class="lw-barcode-error" title="${escapeHtml(reason)}" ` +
    `style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;` +
    `gap:2px;min-width:80px;min-height:80px;padding:8px;border:1px dashed #b91c1c;` +
    `border-radius:6px;color:#b91c1c;font:600 9px/1.3 ui-monospace,monospace;text-align:center">` +
    `<span>⚠ ${escapeHtml(symbology)}</span><span>${escapeHtml(text || "(empty)")}</span></span>`
  );
}
