import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { JSONSchema, Diagnostic, ValidationResult } from "./types.js";

const ajv = new Ajv2020({ allErrors: true, strict: false, allowUnionTypes: true });
addFormats(ajv);

type Validator = ReturnType<typeof ajv.compile>;

// Cache compiled validators for anonymous (no `$id`) schemas by object identity.
const validatorCache = new WeakMap<JSONSchema, Validator>();

function getValidator(schema: JSONSchema): Validator {
  // Schemas with a `$id` are registered in Ajv's shared instance the first time
  // they are compiled. The project loader re-reads schema files on each request,
  // producing a new object each time — so we must look the validator up by `$id`
  // (not object identity) to avoid Ajv's "schema with key or id already exists".
  const id = typeof schema.$id === "string" ? schema.$id : undefined;
  if (id) {
    const existing = ajv.getSchema(id) as Validator | undefined;
    return existing ?? ajv.compile(schema);
  }
  let v = validatorCache.get(schema);
  if (!v) {
    v = ajv.compile(schema);
    validatorCache.set(schema, v);
  }
  return v;
}

/** Check that a value is a compilable JSON Schema (used before persisting edits). */
export function isCompilableSchema(schema: unknown): { ok: boolean; error?: string } {
  try {
    const probe = new Ajv2020({ strict: false, allowUnionTypes: true });
    addFormats(probe);
    probe.compile(schema as JSONSchema);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Validate a data payload for a single datasource against its JSON Schema. */
export function validateData(
  schema: JSONSchema,
  data: unknown,
  sourceName = "DATA",
): ValidationResult {
  const validate = getValidator(schema);
  const ok = validate(data);
  if (ok) return { valid: true, diagnostics: [] };
  const diagnostics: Diagnostic[] = (validate.errors ?? []).map((err) => ({
    severity: "error",
    code: "DATA_INVALID",
    path: `${sourceName}${err.instancePath.replace(/\//g, ".")}`,
    message: `${err.instancePath || "(root)"} ${err.message ?? "is invalid"}`,
    hint: err.keyword === "required" ? "Add the missing required field to your payload." : undefined,
  }));
  return { valid: false, diagnostics };
}

/** Validate multiple named datasources at once. */
export function validateDataSources(
  schemas: Record<string, JSONSchema>,
  data: Record<string, unknown>,
): ValidationResult {
  const diagnostics: Diagnostic[] = [];
  for (const [name, schema] of Object.entries(schemas)) {
    if (!(name in data)) {
      diagnostics.push({
        severity: "error",
        code: "DATASOURCE_MISSING",
        path: name,
        message: `Required datasource "${name}" is missing from the payload.`,
        hint: `Include "${name}" in dataSources.`,
      });
      continue;
    }
    const res = validateData(schema, data[name], name);
    diagnostics.push(...res.diagnostics);
  }
  return { valid: diagnostics.every((d) => d.severity !== "error"), diagnostics };
}
