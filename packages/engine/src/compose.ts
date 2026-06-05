import type { LwDocument, Node } from "./ir.js";
import { parseLw } from "./parser.js";
import { renderDocument, type RenderOptions, type RenderResult } from "./renderer.js";
import {
  DEFAULT_PAGE_LAYOUT,
  pageLayoutCss,
  resolvePageLayout,
  type PageLayoutSettings,
} from "./pageLayout.js";

export interface Theme {
  /** CSS custom properties, e.g. { "color-brand": "#4f46e5" }. */
  tokens?: Record<string, string>;
  /** Raw CSS appended after the base stylesheet. */
  css?: string;
}

export interface ComposeInput {
  /** Either compiled IR or raw `.lw` source (one required). */
  template?: LwDocument;
  source?: string;
  /** Named data sources, e.g. { DATA: {...} }. */
  dataSources: Record<string, unknown>;
  theme?: Theme;
  blocks?: Map<string, Node[]>;
  locale?: string;
  currency?: string;
  /** Emit a full standalone HTML document (default) or just the fragment. */
  fullDocument?: boolean;
  /** Paper size, orientation, and margins (merged with template `lw-page-layout` style). */
  pageLayout?: Partial<PageLayoutSettings> | null;
}

export interface ComposeResult extends RenderResult {
  doc: LwDocument;
  /** Full or fragment HTML depending on options. */
  html: string;
}

/** Shared document CSS — preview, PDF, and Studio design surface must stay in sync. */
export const LW_COMPOSE_BASE_CSS = `
:root {
  --color-brand: #4f46e5;
  --color-text: #111827;
  --color-muted: #6b7280;
  --color-border: #e5e7eb;
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --font-serif: Georgia, "Times New Roman", serif;
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body {
  /* Page margins come from pageLayoutCss() — see lw-page-layout in template. */
  font-family: var(--font-sans);
  color: var(--color-text);
  font-size: 11pt;
  line-height: 1.55;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
@media print { body { padding: 0; } }
h1, h2, h3 { color: var(--color-text); line-height: 1.25; }
h1 { font-size: 20pt; }
h2 { font-size: 15pt; }
h3 { font-size: 12.5pt; }
p { margin: 0 0 0.65em; }
a { color: var(--color-brand); }
table { width: 100%; border-collapse: collapse; margin: 0.75em 0; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--color-border); vertical-align: top; }
th { font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-muted); }
td.amount, th.amount { text-align: right; font-variant-numeric: tabular-nums; }
.lw-section { margin: 0 0 1.1em; }
.muted { color: var(--color-muted); }
.totals { margin-left: auto; width: 50%; }
.totals td { border: none; padding: 4px 10px; }
.totals .grand td { border-top: 2px solid var(--color-text); font-weight: 700; font-size: 12pt; }
img { max-width: 100%; height: auto; vertical-align: middle; }
.tag { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 9pt; font-weight: 600; }
.tag.approved { background: #dcfce7; color: #166534; }
.tag.pending { background: #fef9c3; color: #854d0e; }
.tag.rejected { background: #fee2e2; color: #991b1b; }
`;

function themeToCss(theme?: Theme): string {
  if (!theme) return "";
  const vars = theme.tokens
    ? `:root{${Object.entries(theme.tokens)
        .map(([k, v]) => `--${k}:${v};`)
        .join("")}}`
    : "";
  return `${vars}\n${theme.css ?? ""}`;
}

function wrapDocument(
  fragment: string,
  doc: LwDocument,
  theme?: Theme,
  pageLayout?: PageLayoutSettings,
): string {
  const title = doc.meta.title || doc.meta.id;
  const layout = pageLayout ?? DEFAULT_PAGE_LAYOUT;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>${LW_COMPOSE_BASE_CSS}\n${pageLayoutCss(layout)}\n${themeToCss(theme)}</style>
</head>
<body>
${fragment}
</body>
</html>`;
}

/**
 * Compose a document: parse (if needed), render with data, and (by default)
 * wrap into a standalone HTML document ready for the browser or a PDF engine.
 */
export function compose(input: ComposeInput): ComposeResult {
  const doc = input.template ?? parseLw(requireSource(input.source));
  const renderOpts: RenderOptions = {
    blocks: input.blocks,
    locale: input.locale,
    currency: input.currency,
  };
  const { html: fragment, warnings } = renderDocument(doc, input.dataSources, renderOpts);
  const layout = resolvePageLayout(doc, input.pageLayout);
  const html =
    input.fullDocument === false ? fragment : wrapDocument(fragment, doc, input.theme, layout);
  return { doc, html, warnings };
}

function requireSource(source?: string): string {
  if (!source) throw new Error("compose() requires either `template` (IR) or `source` (.lw).");
  return source;
}
