/** Parse and update inline `style` attribute strings. */

export function parseStyleMap(style?: string): Map<string, string> {
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

export function serializeStyleMap(map: Map<string, string>): string {
  return [...map.entries()].map(([k, v]) => `${k}: ${v}`).join("; ");
}

export function getStyleProp(style: string | undefined, key: string): string | undefined {
  return parseStyleMap(style).get(key.toLowerCase());
}

export function setStyleProp(style: string | undefined, key: string, value: string): string {
  const map = parseStyleMap(style);
  const k = key.toLowerCase();
  if (!value || value === "inherit") map.delete(k);
  else map.set(k, value);
  return serializeStyleMap(map);
}

export function setStyleProps(style: string | undefined, patch: Record<string, string>): string {
  let next = style ?? "";
  for (const [key, value] of Object.entries(patch)) {
    next = setStyleProp(next, key, value);
  }
  return next;
}
