import type { JSONSchema } from "./types.js";

export interface InferOptions {
  /** Title for the root schema (e.g. the datasource name). */
  title?: string;
  /** Emit `$schema`/`$id` on the root. */
  rootId?: string;
  /** Detect string formats (date, date-time, email, uri, uuid). Default true. */
  detectFormats?: boolean;
  /**
   * How to treat keys: "present" (default) marks every key seen in the sample
   * as required; "none" leaves `required` empty.
   */
  required?: "present" | "none";
}

const RX = {
  date: /^\d{4}-\d{2}-\d{2}$/,
  dateTime: /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/,
  email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
  uri: /^https?:\/\/\S+$/i,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
};

/**
 * Infer a JSON Schema (Draft 2020-12) from an example value — the "JSON-first"
 * data-model workflow. Objects become `properties` with all present keys
 * required; arrays merge their element schemas so only fields shared by every
 * element stay required. The result is a starting point authors refine.
 */
export function inferSchema(sample: unknown, opts: InferOptions = {}): JSONSchema {
  const detectFormats = opts.detectFormats ?? true;
  const requireMode = opts.required ?? "present";
  const schema = infer(sample, detectFormats, requireMode);
  if (opts.title) schema.title = opts.title;
  if (opts.rootId) {
    schema.$schema = "https://json-schema.org/draft/2020-12/schema";
    schema.$id = opts.rootId;
  }
  return schema;
}

function infer(value: unknown, fmt: boolean, req: "present" | "none"): JSONSchema {
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) {
    const items = value
      .map((v) => infer(v, fmt, req))
      .reduce<JSONSchema | null>((acc, s) => (acc ? mergeSchema(acc, s) : s), null);
    return { type: "array", items: items ?? {} };
  }
  if (typeof value === "object") {
    const properties: Record<string, JSONSchema> = {};
    const keys = Object.keys(value as Record<string, unknown>);
    for (const k of keys) properties[k] = infer((value as Record<string, unknown>)[k], fmt, req);
    const out: JSONSchema = { type: "object", properties };
    if (req === "present" && keys.length) out.required = keys;
    return out;
  }
  if (typeof value === "number") return { type: Number.isInteger(value) ? "integer" : "number" };
  if (typeof value === "boolean") return { type: "boolean" };
  // string
  const s: JSONSchema = { type: "string" };
  if (fmt && typeof value === "string") {
    const f = detectFormat(value);
    if (f) s.format = f;
  }
  return s;
}

function detectFormat(v: string): string | undefined {
  if (RX.dateTime.test(v)) return "date-time";
  if (RX.date.test(v)) return "date";
  if (RX.email.test(v)) return "email";
  if (RX.uuid.test(v)) return "uuid";
  if (RX.uri.test(v)) return "uri";
  return undefined;
}

/** Merge two inferred schemas (used to combine array element shapes). */
export function mergeSchema(a: JSONSchema, b: JSONSchema): JSONSchema {
  if (isEmpty(a)) return b;
  if (isEmpty(b)) return a;
  if (a.type !== b.type) return {}; // mixed types → accept anything

  if (a.type === "object") {
    const properties: Record<string, JSONSchema> = {};
    const aProps = a.properties ?? {};
    const bProps = b.properties ?? {};
    for (const k of Object.keys(aProps)) {
      properties[k] = bProps[k] ? mergeSchema(aProps[k]!, bProps[k]!) : aProps[k]!;
    }
    for (const k of Object.keys(bProps)) {
      if (!(k in properties)) properties[k] = bProps[k]!;
    }
    // A key is required only if it was required in both branches (present in all samples).
    const aReq = new Set(a.required ?? []);
    const required = (b.required ?? []).filter((k) => aReq.has(k));
    const out: JSONSchema = { type: "object", properties };
    if (required.length) out.required = required;
    return out;
  }

  if (a.type === "array") {
    return { type: "array", items: mergeSchema(a.items ?? {}, b.items ?? {}) };
  }

  // scalars: keep type, keep format only if both agree
  const out: JSONSchema = { type: a.type };
  if (a.format && a.format === b.format) out.format = a.format;
  return out;
}

function isEmpty(s: JSONSchema): boolean {
  return !s.type && !s.$ref && !s.properties && !s.enum;
}
