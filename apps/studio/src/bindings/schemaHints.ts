type JsonLike = { type?: string | string[]; properties?: Record<string, JsonLike>; items?: JsonLike; [k: string]: unknown };

export function schemaToHints(schema: Record<string, unknown> | null): string[] {
  if (!schema) return [];
  const out = new Set<string>();
  for (const [name, root] of Object.entries(schema)) {
    walkSchema(root as JsonLike, name, out);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

/** Paths from the active test-case JSON (includes fields not yet in schema). */
export function dataToHints(data: Record<string, unknown> | null): string[] {
  if (!data) return [];
  const out = new Set<string>();
  for (const [name, root] of Object.entries(data)) {
    walkData(root, name, out);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

/** Schema paths + live fixture paths for autocomplete and hover. */
export function bindingHints(
  schema: Record<string, unknown> | null,
  sampleData: Record<string, unknown> | null,
): string[] {
  const out = new Set<string>();
  for (const h of schemaToHints(schema)) out.add(h);
  for (const h of dataToHints(sampleData)) out.add(h);
  return [...out].sort((a, b) => a.localeCompare(b));
}

function walkData(value: unknown, prefix: string, out: Set<string>): void {
  out.add(prefix);
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    out.add(`${prefix}[]`);
    if (value.length > 0) walkData(value[0], `${prefix}[]`, out);
    return;
  }
  for (const [k, v] of Object.entries(value)) walkData(v, `${prefix}.${k}`, out);
}

function walkSchema(node: JsonLike, prefix: string, out: Set<string>) {
  out.add(prefix);
  const props = node?.properties;
  if (props) {
    for (const [k, v] of Object.entries(props)) walkSchema(v, `${prefix}.${k}`, out);
  }
  const item = node?.items;
  if (item && typeof item === "object") walkSchema(item, `${prefix}[]`, out);
}
