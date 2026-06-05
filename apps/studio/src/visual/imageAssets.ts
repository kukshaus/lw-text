/** Turn a template `src` into a browser URL for Studio preview/design. */
export function resolveImageSrc(pid: string, src: string): string {
  if (!src) return "";
  if (src.startsWith("assets/")) return `/v1/projects/${pid}/assets/${encodeURIComponent(src.slice(7))}`;
  if (src.startsWith("/v1/projects/")) return src;
  if (/^(https?:|data:|blob:)/.test(src)) return src;
  return src;
}

export function isAssetPath(src: string): boolean {
  return src.startsWith("assets/") || src.startsWith("/v1/projects/");
}

export function isExpressionSrc(src: string): boolean {
  return /\{\{/.test(src);
}
