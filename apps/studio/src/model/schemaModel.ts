import type { JsonSchema } from "../api";

export const SCHEMA_TYPES = ["string", "number", "integer", "boolean", "object", "array", "null"] as const;
export type SchemaType = (typeof SCHEMA_TYPES)[number];

export const STRING_FORMATS = ["", "date", "date-time", "time", "email", "uri", "uuid", "hostname", "ipv4"] as const;

export function typeOf(schema: JsonSchema): SchemaType {
  const t = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  return (t as SchemaType) ?? "string";
}

/** Return a clean schema for a freshly chosen type (drops incompatible keywords). */
export function schemaForType(type: SchemaType, prev: JsonSchema = {}): JsonSchema {
  const base: JsonSchema = { type };
  if (prev.title) base.title = prev.title;
  if (prev.description) base.description = prev.description;
  if (type === "object") base.properties = prev.properties ?? {};
  if (type === "array") base.items = prev.items ?? { type: "string" };
  return base;
}

/* ----------------------------- object props ---------------------------- */

export function isRequired(schema: JsonSchema, key: string): boolean {
  return (schema.required ?? []).includes(key);
}

export function setRequired(schema: JsonSchema, key: string, required: boolean): JsonSchema {
  const set = new Set(schema.required ?? []);
  if (required) set.add(key);
  else set.delete(key);
  const next = { ...schema };
  if (set.size) next.required = [...set];
  else delete next.required;
  return next;
}

export function setProperty(schema: JsonSchema, key: string, value: JsonSchema): JsonSchema {
  return { ...schema, properties: { ...(schema.properties ?? {}), [key]: value } };
}

export function removeProperty(schema: JsonSchema, key: string): JsonSchema {
  const props = { ...(schema.properties ?? {}) };
  delete props[key];
  const next = { ...schema, properties: props };
  if (next.required) {
    const req = next.required.filter((k) => k !== key);
    if (req.length) next.required = req;
    else delete next.required;
  }
  return next;
}

/** Rename a property, preserving insertion order and required membership. */
export function renameProperty(schema: JsonSchema, from: string, to: string): JsonSchema {
  if (from === to || !to) return schema;
  const props = schema.properties ?? {};
  if (to in props) return schema; // refuse collisions
  const next: Record<string, JsonSchema> = {};
  for (const [k, v] of Object.entries(props)) next[k === from ? to : k] = v;
  const required = (schema.required ?? []).map((k) => (k === from ? to : k));
  const out: JsonSchema = { ...schema, properties: next };
  if (required.length) out.required = required;
  return out;
}

export function addProperty(schema: JsonSchema): { schema: JsonSchema; key: string } {
  const props = schema.properties ?? {};
  let i = 1;
  let key = "newField";
  while (key in props) key = `newField${++i}`;
  const next = setRequired(setProperty(schema, key, { type: "string" }), key, true);
  return { schema: next, key };
}

/** Set a keyword, removing it when the value is empty/undefined. */
export function setKeyword(schema: JsonSchema, key: string, value: unknown): JsonSchema {
  const next = { ...schema };
  if (value === undefined || value === "" || value === null) delete next[key];
  else next[key] = value;
  return next;
}
