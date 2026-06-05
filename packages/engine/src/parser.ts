import { parseFragment } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";
import type {
  LwDocument,
  Node,
  ElementNode,
  Format,
  TemplateMeta,
  BarcodeSymbology,
} from "./ir.js";

type P5Node = DefaultTreeAdapterMap["childNode"] | DefaultTreeAdapterMap["parentNode"];
type P5Element = DefaultTreeAdapterMap["element"];
type P5Text = DefaultTreeAdapterMap["textNode"];

export class ParseError extends Error {
  constructor(message: string, public readonly line?: number) {
    super(message);
    this.name = "ParseError";
  }
}

/** Control attributes consumed by the compiler (stripped from output element attrs). */
const CONTROL_ATTRS = new Set([
  "if",
  "repeat",
  "data-bind",
  "format",
  "locale",
  "currency",
  "ai-editable",
  "data-block",
  "with-data",
]);

const VALID_FORMATS = new Set<Format>([
  "plain", "html", "date", "datetime", "currency", "number", "percent", "phone", "iban",
]);

const VALID_SYMBOLOGIES = new Set<BarcodeSymbology>([
  "qrcode", "datamatrix", "pdf417", "code128", "code39", "ean13", "ean8", "gs1-128", "interleaved2of5",
]);

/** Extract `{{ expr }}` → { value: expr, isExpr: true }; else literal. */
function exprOrLiteral(raw: string): { value: string; isExpr: boolean } {
  const m = /^\s*\{\{\s*([\s\S]+?)\s*\}\}\s*$/.exec(raw);
  return m ? { value: m[1]!, isExpr: true } : { value: raw, isExpr: false };
}

function isElement(n: P5Node): n is P5Element {
  return (n as P5Element).tagName !== undefined && (n as { nodeName: string }).nodeName !== "#text";
}
function isText(n: P5Node): n is P5Text {
  return (n as { nodeName: string }).nodeName === "#text";
}

function attrMap(el: P5Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of el.attrs) out[a.name] = a.value;
  return out;
}

function loc(n: P5Node): { line: number; col: number } | undefined {
  const l = (n as { sourceCodeLocation?: { startLine: number; startCol: number } }).sourceCodeLocation;
  return l ? { line: l.startLine, col: l.startCol } : undefined;
}

/** Parse `repeat="item in DATA.array"` (with optional ", idx"). */
function parseRepeat(value: string): { as: string; indexAs?: string; each: string } {
  const m = /^\s*([A-Za-z_$][\w$]*)\s*(?:,\s*([A-Za-z_$][\w$]*)\s*)?\s+in\s+(.+)$/.exec(value);
  if (!m) throw new ParseError(`Invalid repeat expression: "${value}". Expected "item in EXPR".`);
  return { as: m[1]!, indexAs: m[2], each: m[3]!.trim() };
}

function compileElement(el: P5Element): Node {
  const attrs = attrMap(el);
  const id = attrs["id"];
  const aiEditable = attrs["ai-editable"] === "false" ? false : undefined;
  const location = loc(el);

  let core: Node;

  if (el.tagName === "lw-barcode") {
    const symbology = (attrs["type"] || "qrcode") as BarcodeSymbology;
    if (!VALID_SYMBOLOGIES.has(symbology)) {
      throw new ParseError(`Unknown barcode type "${symbology}" on <lw-barcode>.`, location?.line);
    }
    const { value, isExpr } = exprOrLiteral(attrs["value"] ?? "");
    core = {
      type: "barcode",
      symbology,
      value,
      isExpr: isExpr || undefined,
      scale: attrs["scale"] ? Number(attrs["scale"]) : undefined,
      height: attrs["height"] ? Number(attrs["height"]) : undefined,
      showText: attrs["show-text"] === "true" ? true : undefined,
      alt: attrs["alt"],
      id,
      aiEditable,
      loc: location,
    };
  } else if (attrs["data-block"] !== undefined) {
    core = {
      type: "blockRef",
      ref: attrs["data-block"],
      withData: attrs["with-data"],
      tag: el.tagName,
      id,
      aiEditable,
      loc: location,
    };
  } else if (attrs["data-bind"] !== undefined) {
    const format = attrs["format"] as Format | undefined;
    if (format && !VALID_FORMATS.has(format)) {
      throw new ParseError(`Unknown format "${format}" on element <${el.tagName}>.`, location?.line);
    }
    // Element wrapping a single binding.
    core = {
      type: "element",
      tag: el.tagName,
      attrs: cleanAttrs(attrs),
      id,
      aiEditable,
      loc: location,
      children: [
        {
          type: "bind",
          expr: attrs["data-bind"],
          format,
          locale: stripBraces(attrs["locale"]),
          currency: stripBraces(attrs["currency"]),
        },
      ],
    };
  } else {
    core = {
      type: "element",
      tag: el.tagName,
      attrs: cleanAttrs(attrs),
      id,
      aiEditable,
      loc: location,
      children: compileChildren(el),
    };
  }

  // Wrap order: if (outer) > repeat > element.
  if (attrs["repeat"] !== undefined) {
    const { as, indexAs, each } = parseRepeat(attrs["repeat"]);
    core = { type: "repeat", each, as, indexAs, children: [core], loc: location };
  }
  if (attrs["if"] !== undefined) {
    core = { type: "if", when: attrs["if"], children: [core], loc: location };
  }
  return core;
}

/** Allow `locale="{{ DATA.locale }}"` shorthand → expression `DATA.locale`. */
function stripBraces(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  const m = /^\s*\{\{\s*(.+?)\s*\}\}\s*$/.exec(v);
  return m ? m[1] : JSON.stringify(v); // literal string locale, quote it for the DSL
}

function cleanAttrs(attrs: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (CONTROL_ATTRS.has(k) || k === "id") continue;
    out[k] = v;
  }
  return out;
}

function compileChildren(parent: P5Element | DefaultTreeAdapterMap["documentFragment"]): Node[] {
  const out: Node[] = [];
  for (const child of parent.childNodes) {
    if (isElement(child)) {
      out.push(compileElement(child));
    } else if (isText(child)) {
      const raw = child.value;
      if (raw.trim() === "" && !raw.includes("{{")) continue;
      out.push({ type: "text", text: { template: raw } });
    }
  }
  return out;
}

function readMeta(root: P5Element): TemplateMeta {
  const a = attrMap(root);
  if (!a["id"]) throw new ParseError(`<template> requires an "id" attribute.`);
  return {
    id: a["id"],
    version: a["version"] || "0.0.0",
    dataSources: (a["data-sources"] || "DATA").split(/\s+/).filter(Boolean),
    layoutRef: a["layout"],
    outputModes: (a["output-modes"] || "pdf,html").split(",").map((s) => s.trim()).filter(Boolean),
    title: a["title"],
  };
}

/** Parse `.lw` markup source into an lw-doc IR document. */
export function parseLw(source: string): LwDocument {
  const frag = parseFragment(source, { sourceCodeLocationInfo: true });
  const root = frag.childNodes.find(
    (n): n is P5Element => isElement(n) && n.tagName === "template",
  );
  if (!root) {
    throw new ParseError(`Template must have a single root <template ...> element.`);
  }
  // The HTML <template> element stores its children in a separate `content`
  // document fragment, not in childNodes. Fall back to the element itself for
  // non-standard tags.
  const contentRoot =
    (root as P5Element & { content?: DefaultTreeAdapterMap["documentFragment"] }).content ?? root;
  return {
    ir: "0.1",
    meta: readMeta(root),
    nodes: compileChildren(contentRoot),
  };
}
