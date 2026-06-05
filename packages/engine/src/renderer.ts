import type { LwDocument, Node } from "./ir.js";
import { evalExpr, parseExpression, evaluate, type Scope } from "./expression.js";
import { formatValue, escapeHtml } from "./format.js";
import { renderBarcodeSvg } from "./barcode.js";

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

export interface RenderOptions {
  /** Map of block ref → resolved IR nodes (e.g. "@acme/footer@1.0.0"). */
  blocks?: Map<string, Node[]>;
  /** Default locale when a binding does not specify one. */
  locale?: string;
  /** Default currency for currency formatting. */
  currency?: string;
  /** When true, throw on unresolved blocks; otherwise emit an HTML comment. */
  strictBlocks?: boolean;
}

export interface RenderResult {
  html: string;
  warnings: string[];
}

const INTERP = /\{\{\s*([\s\S]+?)\s*\}\}/g;

function interpolate(template: string, scope: Scope, warnings: string[], escape = true): string {
  return template.replace(INTERP, (_m, expr: string) => {
    try {
      const v = evalExpr(expr, scope);
      const s = v === null || v === undefined ? "" : String(v);
      return escape ? escapeHtml(s) : s;
    } catch (e) {
      warnings.push(`Interpolation error in "${expr}": ${(e as Error).message}`);
      return "";
    }
  });
}

function renderAttrs(attrs: Record<string, string>, scope: Scope, warnings: string[]): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(attrs)) {
    const value = interpolate(v, scope, warnings, true);
    parts.push(`${k}="${value}"`);
  }
  return parts.length ? " " + parts.join(" ") : "";
}

function renderNode(node: Node, scope: Scope, opts: RenderOptions, warnings: string[]): string {
  switch (node.type) {
    case "text":
      return interpolate(node.text.template, scope, warnings, true);

    case "bind": {
      try {
        const value = evaluate(parseExpression(node.expr), scope);
        const locale = node.locale ? String(evalExpr(node.locale, scope)) : opts.locale;
        const currency = node.currency ? String(evalExpr(node.currency, scope)) : opts.currency;
        const formatted = formatValue(value, node.format, { locale, currency });
        return node.format === "html" ? formatted : escapeHtml(formatted);
      } catch (e) {
        warnings.push(`Binding error in "${node.expr}": ${(e as Error).message}`);
        return "";
      }
    }

    case "element": {
      const open = `<${node.tag}${renderAttrs(node.attrs, scope, warnings)}>`;
      if (VOID_ELEMENTS.has(node.tag)) return open;
      const inner = node.children.map((c) => renderNode(c, scope, opts, warnings)).join("");
      return `${open}${inner}</${node.tag}>`;
    }

    case "if": {
      let pass = false;
      try {
        pass = truthy(evalExpr(node.when, scope));
      } catch (e) {
        warnings.push(`Condition error in "${node.when}": ${(e as Error).message}`);
      }
      const branch = pass ? node.children : node.otherwise ?? [];
      return branch.map((c) => renderNode(c, scope, opts, warnings)).join("");
    }

    case "repeat": {
      let arr: unknown;
      try {
        arr = evalExpr(node.each, scope);
      } catch (e) {
        warnings.push(`Repeat error in "${node.each}": ${(e as Error).message}`);
        return "";
      }
      if (!Array.isArray(arr)) {
        if (arr !== undefined && arr !== null) {
          warnings.push(`Repeat target "${node.each}" is not an array.`);
        }
        return "";
      }
      const out: string[] = [];
      arr.forEach((item, index) => {
        const childScope: Scope = { ...scope, [node.as]: item };
        if (node.indexAs) childScope[node.indexAs] = index;
        for (const c of node.children) out.push(renderNode(c, childScope, opts, warnings));
      });
      return out.join("");
    }

    case "barcode": {
      let text = node.value;
      if (node.isExpr) {
        try {
          const v = evalExpr(node.value, scope);
          text = v === null || v === undefined ? "" : String(v);
        } catch (e) {
          warnings.push(`Barcode value error in "${node.value}": ${(e as Error).message}`);
          text = "";
        }
      }
      const svg = renderBarcodeSvg(node.symbology, text, {
        scale: node.scale,
        height: node.height,
        showText: node.showText,
      });
      const label = node.alt ?? `${node.symbology} barcode`;
      return `<span class="lw-barcode" role="img" aria-label="${escapeHtml(label)}">${svg}</span>`;
    }

    case "blockRef": {
      const resolved = opts.blocks?.get(node.ref);
      if (!resolved) {
        if (opts.strictBlocks) throw new Error(`Unresolved block reference: ${node.ref}`);
        warnings.push(`Unresolved block reference: ${node.ref}`);
        return `<!-- lw:unresolved-block ${node.ref} -->`;
      }
      let childScope = scope;
      if (node.withData) {
        try {
          childScope = { ...scope, data: evalExpr(node.withData, scope) };
        } catch (e) {
          warnings.push(`Block data error in "${node.withData}": ${(e as Error).message}`);
        }
      }
      return resolved.map((c) => renderNode(c, childScope, opts, warnings)).join("");
    }
  }
}

function truthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

/**
 * Render an lw-doc IR document with the given data sources to an HTML fragment.
 * `dataSources` keys (e.g. DATA) become top-level scope variables.
 */
export function renderDocument(
  doc: LwDocument,
  dataSources: Record<string, unknown>,
  opts: RenderOptions = {},
): RenderResult {
  const warnings: string[] = [];
  const scope: Scope = { ...dataSources };
  const html = doc.nodes.map((n) => renderNode(n, scope, opts, warnings)).join("");
  return { html, warnings };
}
