import {
  parseExpression,
  collectPaths,
  type Expr,
  type Node,
  type LwDocument,
} from "@lw-text/engine";
import type { JSONSchema, Diagnostic } from "./types.js";

/** Map of variable name -> JSON Schema describing its shape. */
type VarScope = Map<string, JSONSchema>;

const INTERP = /\{\{\s*([\s\S]+?)\s*\}\}/g;

/**
 * Validate that every binding/expression in a template references a path that
 * exists in the relevant datasource schema. Loop variables introduced by
 * `repeat` are typed from the array's item schema so `row.amount` is checked
 * against `DATA.lineItems.items`.
 */
export function validateTemplateBindings(
  doc: LwDocument,
  schemas: Record<string, JSONSchema>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const root: VarScope = new Map();
  for (const ds of doc.meta.dataSources) {
    if (schemas[ds]) root.set(ds, schemas[ds]!);
  }
  // Datasources used but not declared as schema are still valid scope roots
  // (unchecked) so we don't produce false positives.
  for (const ds of doc.meta.dataSources) {
    if (!root.has(ds)) root.set(ds, { type: "object", additionalProperties: true });
  }
  walk(doc.nodes, root, schemas, diagnostics);
  return diagnostics;
}

function walk(nodes: Node[], scope: VarScope, schemas: Record<string, JSONSchema>, out: Diagnostic[]): void {
  for (const node of nodes) visit(node, scope, schemas, out);
}

function visit(node: Node, scope: VarScope, schemas: Record<string, JSONSchema>, out: Diagnostic[]): void {
  switch (node.type) {
    case "text":
      checkInterpolations(node.text.template, scope, node.loc, out);
      break;

    case "bind":
      checkExpr(node.expr, scope, node.loc, out);
      if (node.locale) checkExpr(node.locale, scope, node.loc, out);
      if (node.currency) checkExpr(node.currency, scope, node.loc, out);
      break;

    case "element":
      for (const v of Object.values(node.attrs)) checkInterpolations(v, scope, node.loc, out);
      walk(node.children, scope, schemas, out);
      break;

    case "if":
      checkExpr(node.when, scope, node.loc, out);
      walk(node.children, scope, schemas, out);
      if (node.otherwise) walk(node.otherwise, scope, schemas, out);
      break;

    case "repeat": {
      checkExpr(node.each, scope, node.loc, out);
      const itemSchema = resolveExprSchema(node.each, scope);
      const childScope: VarScope = new Map(scope);
      if (itemSchema && (itemSchema.type === "array" || Array.isArray(itemSchema.type))) {
        childScope.set(node.as, itemSchema.items ?? { type: "object", additionalProperties: true });
      } else {
        // Unknown element type — allow anything to avoid false positives.
        childScope.set(node.as, { type: "object", additionalProperties: true });
      }
      if (node.indexAs) childScope.set(node.indexAs, { type: "number" });
      walk(node.children, childScope, schemas, out);
      break;
    }

    case "blockRef":
      if (node.withData) checkExpr(node.withData, scope, node.loc, out);
      break;

    case "barcode":
      if (node.isExpr) checkExpr(node.value, scope, node.loc, out);
      break;
  }
}

function checkInterpolations(template: string, scope: VarScope, loc: Node["loc"], out: Diagnostic[]): void {
  let m: RegExpExecArray | null;
  INTERP.lastIndex = 0;
  while ((m = INTERP.exec(template)) !== null) {
    checkExpr(m[1]!, scope, loc, out);
  }
}

function checkExpr(src: string, scope: VarScope, loc: Node["loc"], out: Diagnostic[]): void {
  let ast: Expr;
  try {
    ast = parseExpression(src);
  } catch (e) {
    out.push({
      severity: "error",
      code: "RULE_SYNTAX",
      message: `Invalid expression "${src}": ${(e as Error).message}`,
      loc,
      hint: "Check operators and quoting in the expression DSL.",
    });
    return;
  }
  const roots = new Set(scope.keys());
  const paths = new Set<string>();
  collectPaths(ast, roots, paths);
  for (const path of paths) {
    if (!resolvePath(path, scope)) {
      out.push({
        severity: "error",
        code: "BINDING_UNKNOWN",
        path,
        message: `Binding "${path}" is not defined in the datasource schema.`,
        loc,
        hint: "Add the field to the schema or fix the path.",
      });
    }
  }
}

/** Resolve a dotted path like "DATA.customer.name" against the var scope. */
function resolvePath(path: string, scope: VarScope): boolean {
  const segs = path.split(".");
  const head = segs[0]!;
  let schema = scope.get(head);
  if (!schema) return false;
  for (let i = 1; i < segs.length; i++) {
    const seg = segs[i]!;
    const next = stepSchema(schema, seg);
    if (!next) return false;
    schema = next;
  }
  return true;
}

function stepSchema(schema: JSONSchema, seg: string): JSONSchema | null {
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  // `.length` is valid on arrays and strings.
  if (seg === "length" && (types.includes("array") || types.includes("string"))) {
    return { type: "number" };
  }
  // Open objects accept any property.
  if (schema.additionalProperties === true && !schema.properties) {
    return { type: "object", additionalProperties: true };
  }
  if (schema.properties && seg in schema.properties) {
    return schema.properties[seg]!;
  }
  // If object has additionalProperties schema, use it.
  if (typeof schema.additionalProperties === "object") {
    return schema.additionalProperties;
  }
  return null;
}

function resolveExprSchema(src: string, scope: VarScope): JSONSchema | null {
  let ast: Expr;
  try {
    ast = parseExpression(src);
  } catch {
    return null;
  }
  const segs = memberChain(ast);
  if (!segs) return null;
  let schema = scope.get(segs[0]!);
  if (!schema) return null;
  for (let i = 1; i < segs.length; i++) {
    const next = stepSchema(schema, segs[i]!);
    if (!next) return null;
    schema = next;
  }
  return schema;
}

function memberChain(ast: Expr): string[] | null {
  if (ast.t === "ident") return [ast.name];
  if (ast.t === "member") {
    const base = memberChain(ast.obj);
    return base ? [...base, ast.prop] : null;
  }
  return null;
}
