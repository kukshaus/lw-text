import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  DEFAULT_PAGE_LAYOUT,
  LW_COMPOSE_BASE_CSS,
  pageLayoutCss,
  pagePreviewWidthPx,
  type PageLayoutSettings,
} from "@lw-text/engine";

/** Max content width — preview iframe and design surface use the same box. */
export const DOCUMENT_PAGE_MAX_PX = 820;

/** Scope compose `body` rules onto the Studio design canvas root. */
export function scopeDocumentCss(css: string, root = ".lw-doc-surface"): string {
  return css
    .replace(/@page[\s\S]*?\}/g, "")
    .replace(/@media print[\s\S]*?\}/g, "")
    .replace(/html,\s*body/g, root)
    .replace(/\bbody\b/g, root);
}

export function documentSurfaceCss(extraCss = ""): string {
  return `${scopeDocumentCss(LW_COMPOSE_BASE_CSS)}\n${extraCss}`;
}

export function typographyCssForSurface(settingsCss: string): string {
  if (!settingsCss) return "";
  return settingsCss
    .replace(/\bbody\s*\{/g, ".lw-doc-surface{")
    .replace(/h1,h2,h3,h4,h5,h6\{/g, ".lw-doc-surface h1,.lw-doc-surface h2,.lw-doc-surface h3,.lw-doc-surface h4,.lw-doc-surface h5,.lw-doc-surface h6{");
}

export function pageLayoutCssForSurface(settings: PageLayoutSettings): string {
  return scopeDocumentCss(pageLayoutCss(settings));
}

export interface DocumentPageProps {
  children: ReactNode;
  className?: string;
  pageLayout?: PageLayoutSettings;
}

/** White “page” shell shared by Preview and Design (1:1 width). */
export function DocumentPage({ children, className = "", pageLayout }: DocumentPageProps) {
  const maxWidth = pageLayout ? pagePreviewWidthPx(pageLayout) : DOCUMENT_PAGE_MAX_PX;
  return (
    <div
      className={`mx-auto w-full rounded-lg bg-white shadow-2xl shadow-black/40 ${className}`.trim()}
      style={{ maxWidth }}
    >
      {children}
    </div>
  );
}

export interface DocumentSurfaceProps {
  children: ReactNode;
  typographyCss?: string;
  pageLayout?: PageLayoutSettings;
}

/** Design-mode document body — same typography/margins as composed preview. */
export function DocumentSurface({
  children,
  typographyCss: typoExtra,
  pageLayout = DEFAULT_PAGE_LAYOUT,
}: DocumentSurfaceProps) {
  const surfaceCss = documentSurfaceCss(
    `${pageLayoutCssForSurface(pageLayout)}\n${typographyCssForSurface(typoExtra ?? "")}`,
  );
  return (
    <div className="lw-doc-surface min-h-full">
      <style>{surfaceCss}</style>
      <style>{`.lw-doc-surface style,#lw-typography,#lw-page-layout{display:none!important}`}</style>
      {children}
    </div>
  );
}

export function PreviewFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(400);

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;

    const measure = () => {
      const doc = iframe.contentDocument;
      const body = doc?.body;
      if (!body) return;
      setHeight(Math.max(body.scrollHeight, body.offsetHeight, 120));
    };

    iframe.addEventListener("load", measure);
    const t = window.setTimeout(measure, 50);
    return () => {
      iframe.removeEventListener("load", measure);
      window.clearTimeout(t);
    };
  }, [html]);

  return (
    <iframe
      ref={ref}
      title="preview"
      srcDoc={html}
      className="block w-full border-0"
      style={{ height, zoom: 1 }}
    />
  );
}
