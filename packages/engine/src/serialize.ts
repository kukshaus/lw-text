import type { LwDocument, Node, ElementNode, BindNode, TemplateMeta } from "./ir.js";

/**
 * Serialize an lw-doc IR back to `.lw` source. This is the inverse of
 * {@link parseLw} and powers the visual editor's round-trip (edit IR → write
 * source). Parser-produced documents round-trip stably; hand-built IR with
 * shapes the parser can't express (e.g. multi-child `if`) degrade to an
 * equivalent wrapper element.
 */
export function serializeLw(doc: LwDocument): string {
  const head = serializeMeta(doc.meta);
  const body = doc.nodes.map((n) => serializeNode(n, 1)).join("\n");
  return `<template ${head}>\n${body}\n</template>\n`;
}

function serializeMeta(meta: TemplateMeta): string {
  const parts = [
    attr("id", meta.id),
    attr("version", meta.version),
    attr("data-sources", meta.dataSources.join(" ")),
  ];
  if (meta.layoutRef) parts.push(attr("layout", meta.layoutRef));
  if (meta.outputModes?.length) parts.push(attr("output-modes", meta.outputModes.join(",")));
  if (meta.title) parts.push(attr("title", meta.title));
  return parts.join(" ");
}

const INLINE_TAGS = new Set([
  "span", "strong", "em", "b", "i", "u", "a", "small", "code", "sup", "sub", "br", "label", "mark", "abbr",
]);

function isInlineContent(children: Node[]): boolean {
  return children.every(
    (c) =>
      c.type === "text" ||
      c.type === "bind" ||
      (c.type === "element" && INLINE_TAGS.has(c.tag) && isInlineContent(c.children)),
  );
}

/** Peel `if`/`repeat` wrappers (parser nests if→repeat→element) into attrs. */
function collectControls(node: Node): { inner: Node; controls: Array<[string, string]> } {
  const controls: Array<[string, string]> = [];
  let cur = node;
  if (cur.type === "if" && cur.children.length === 1 && !cur.otherwise) {
    controls.push(["if", cur.when]);
    cur = cur.children[0]!;
  }
  if (cur.type === "repeat" && cur.children.length === 1) {
    const idx = cur.indexAs ? `, ${cur.indexAs}` : "";
    controls.push(["repeat", `${cur.as}${idx} in ${cur.each}`]);
    cur = cur.children[0]!;
  }
  return { inner: cur, controls };
}

function indentStr(n: number): string {
  return "  ".repeat(n);
}

function serializeNode(node: Node, depth: number): string {
  const pad = indentStr(depth);

  if (node.type === "text") {
    return pad + node.text.template.replace(/\s+/g, " ").trim();
  }

  if (node.type === "if" || node.type === "repeat") {
    const { inner, controls } = collectControls(node);
    if (inner !== node) return serializeElementLike(inner, depth, controls);
    // Couldn't merge (multi-child / else): wrap children in a <div> carrying the control.
    const ctrl =
      node.type === "if"
        ? [["if", node.when] as [string, string]]
        : [["repeat", `${node.as}${node.indexAs ? `, ${node.indexAs}` : ""} in ${node.each}`] as [string, string]];
    const kids = (node.type === "if" ? node.children : node.children)
      .map((c) => serializeNode(c, depth + 1))
      .join("\n");
    return `${pad}<div${attrList(ctrl)}>\n${kids}\n${pad}</div>`;
  }

  return serializeElementLike(node, depth, []);
}

/** Serialize element / bind-element / blockRef / barcode, plus extra control attrs. */
function serializeElementLike(node: Node, depth: number, controls: Array<[string, string]>): string {
  const pad = indentStr(depth);

  if (node.type === "barcode") {
    const a: Array<[string, string]> = [];
    if (node.id) a.push(["id", node.id]);
    a.push(["type", node.symbology]);
    a.push(["value", node.isExpr ? `{{ ${node.value} }}` : node.value]);
    if (node.scale != null) a.push(["scale", String(node.scale)]);
    if (node.height != null) a.push(["height", String(node.height)]);
    if (node.showText) a.push(["show-text", "true"]);
    if (node.alt) a.push(["alt", node.alt]);
    if (node.aiEditable === false) a.push(["ai-editable", "false"]);
    return `${pad}<lw-barcode${attrList([...a, ...controls])}></lw-barcode>`;
  }

  if (node.type === "blockRef") {
    const tag = node.tag ?? "div";
    const a: Array<[string, string]> = [];
    if (node.id) a.push(["id", node.id]);
    a.push(["data-block", node.ref]);
    if (node.withData) a.push(["with-data", node.withData]);
    if (node.aiEditable === false) a.push(["ai-editable", "false"]);
    return `${pad}<${tag}${attrList([...a, ...controls])}></${tag}>`;
  }

  if (node.type === "element") {
    const bind = node.children.length === 1 && node.children[0]!.type === "bind"
      ? (node.children[0] as BindNode)
      : undefined;
    const a: Array<[string, string]> = [];
    if (node.id) a.push(["id", node.id]);
    for (const [k, v] of Object.entries(node.attrs)) a.push([k, v]);
    if (bind) {
      a.push(["data-bind", bind.expr]);
      if (bind.format) a.push(["format", bind.format]);
      if (bind.locale) a.push(["locale", exprAttr(bind.locale)]);
      if (bind.currency) a.push(["currency", exprAttr(bind.currency)]);
    }
    if (node.aiEditable === false) a.push(["ai-editable", "false"]);
    const open = `<${node.tag}${attrList([...a, ...controls])}>`;

    if (bind || node.children.length === 0) return `${pad}${open}</${node.tag}>`;

    if (isInlineContent(node.children)) {
      const inner = node.children.map(serializeInline).join("");
      return `${pad}${open}${inner}</${node.tag}>`;
    }
    const kids = node.children.map((c) => serializeNode(c, depth + 1)).join("\n");
    return `${pad}${open}\n${kids}\n${pad}</${node.tag}>`;
  }

  // bind node appearing standalone (rare) → emit a <span data-bind>.
  if (node.type === "bind") {
    const a: Array<[string, string]> = [["data-bind", node.expr]];
    if (node.format) a.push(["format", node.format]);
    return `${pad}<span${attrList([...a, ...controls])}></span>`;
  }

  return `${pad}<!-- unsupported node -->`;
}

/** Render inline children with no surrounding whitespace. */
function serializeInline(node: Node): string {
  if (node.type === "text") return node.text.template;
  if (node.type === "element") {
    const a: Array<[string, string]> = [];
    if (node.id) a.push(["id", node.id]);
    for (const [k, v] of Object.entries(node.attrs)) a.push([k, v]);
    return `<${node.tag}${attrList(a)}>${node.children.map(serializeInline).join("")}</${node.tag}>`;
  }
  if (node.type === "bind") {
    const fmt = node.format ? ` format="${node.format}"` : "";
    return `<span data-bind="${escapeAttr(node.expr)}"${fmt}></span>`;
  }
  return "";
}

/**
 * The parser normalizes `locale`/`currency` to either an expression
 * (`DATA.locale`) or a JSON-quoted literal (`"de-DE"`). Re-emit so the parser
 * recovers the same value: literals as plain strings, expressions as `{{ … }}`.
 */
function exprAttr(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value) as string;
    } catch {
      /* fall through */
    }
  }
  return `{{ ${value} }}`;
}

function attr(name: string, value: string): string {
  return `${name}="${escapeAttr(value)}"`;
}

function attrList(pairs: Array<[string, string]>): string {
  return pairs.length ? " " + pairs.map(([k, v]) => attr(k, v)).join(" ") : "";
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
