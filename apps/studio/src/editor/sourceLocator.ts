import type { LwDocument, Node } from "@lw-text/engine";
import { bindOf, getNode, isBindElement, type Path } from "../visual/editorModel";

export interface SourceRange {
  from: number;
  to: number;
  line: number;
  col: number;
}

/** Map a structure-tree path to a character range in `.lw` source. */
export function locateNodeInSource(source: string, doc: LwDocument, path: Path): SourceRange | null {
  const node = getNode(doc, path);
  if (!node) return null;

  let from = findStartOffset(source, node);
  if (from < 0) return null;

  const to = findEndOffset(source, node, from);
  const { line, col } = offsetToLineCol(source, from);
  return { from, to: Math.max(to, from + 1), line, col };
}

function findStartOffset(source: string, node: Node): number {
  if (node.loc) {
    const approx = offsetAtLineCol(source, node.loc.line, node.loc.col);
    const refined = refineOnLine(source, node, approx);
    if (refined >= 0) return refined;
  }

  for (const needle of searchNeedles(node)) {
    const idx = source.indexOf(needle);
    if (idx >= 0) {
      const tagStart = source.lastIndexOf("<", idx);
      return tagStart >= 0 ? tagStart : idx;
    }
  }

  return -1;
}

function refineOnLine(source: string, node: Node, approx: number): number {
  const { line } = offsetToLineCol(source, approx);
  const lineStart = offsetAtLineCol(source, line, 1);
  const lineEnd = source.indexOf("\n", lineStart);
  const slice = source.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
  const tag = openingTagName(node);
  if (!tag) return lineStart + Math.max(0, approx - lineStart);

  const re = new RegExp(`<${escapeRegExp(tag)}\\b`, "gi");
  let best = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice))) {
    const pos = lineStart + m.index;
    if (best < 0 || Math.abs(pos - approx) < Math.abs(best - approx)) best = pos;
  }
  return best;
}

function findEndOffset(source: string, node: Node, from: number): number {
  const tag = openingTagName(node);
  if (!tag) return from + 1;

  const openEnd = source.indexOf(">", from);
  if (openEnd < 0) return from + 1;
  const openTag = source.slice(from, openEnd + 1);
  if (/\/>\s*$/.test(openTag) || VOID_TAGS.has(tag)) return openEnd + 1;

  const close = `</${tag}>`;
  let depth = 1;
  let pos = openEnd + 1;
  const openRe = new RegExp(`<${escapeRegExp(tag)}\\b`, "gi");
  while (depth > 0 && pos < source.length) {
    const nextClose = source.indexOf(close, pos);
    if (nextClose < 0) return openEnd + 1;
    openRe.lastIndex = pos;
    const nextOpen = openRe.exec(source);
    if (nextOpen && nextOpen.index < nextClose) {
      depth++;
      pos = nextOpen.index + nextOpen[0].length;
      continue;
    }
    depth--;
    if (depth === 0) return nextClose + close.length;
    pos = nextClose + close.length;
  }
  return openEnd + 1;
}

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
  "lw-barcode",
]);

function openingTagName(node: Node): string | null {
  if (node.type === "element") return node.tag;
  if (node.type === "blockRef") return node.tag ?? "div";
  if (node.type === "barcode") return "lw-barcode";
  if (node.type === "if" || node.type === "repeat") {
    const child = node.children[0];
    return child ? openingTagName(child) : null;
  }
  return null;
}

function searchNeedles(node: Node): string[] {
  const needles: string[] = [];
  if ("id" in node && node.id) {
    needles.push(`id="${node.id}"`);
    needles.push(`id='${node.id}'`);
  }
  if (node.type === "blockRef") {
    needles.push(`data-block="${node.ref}"`);
  }
  if (node.type === "barcode") {
    if (node.isExpr) needles.push(`value="{{`);
    else if (node.value) needles.push(`value="${node.value}"`);
  }
  if (node.type === "element" || (node.type === "blockRef" && node.tag)) {
    const tag = node.type === "element" ? node.tag : node.tag ?? "div";
    const bind = bindOf(node) ?? (node.type === "element" ? node.children.find((c) => c.type === "bind") : null);
    if (bind && bind.type === "bind") {
      needles.push(`data-bind="${bind.expr}"`);
    }
    if (isBindElement(node)) {
      needles.push(`<${tag}`);
    }
    const src = node.type === "element" ? node.attrs.src : undefined;
    if (src) {
      needles.push(`src="${src}"`);
      needles.push(`src='${src}'`);
    }
    needles.push(`<${tag} `);
    needles.push(`<${tag}>`);
  }
  if (node.type === "if") needles.push(`if="${node.when}"`);
  if (node.type === "repeat") needles.push(`repeat="`);
  return needles;
}

function offsetAtLineCol(text: string, line: number, col: number): number {
  const lines = text.split("\n");
  let offset = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) offset += lines[i]!.length + 1;
  const lineText = lines[line - 1] ?? "";
  return offset + Math.max(0, Math.min(col - 1, lineText.length));
}

function offsetToLineCol(text: string, offset: number): { line: number; col: number } {
  const safe = Math.max(0, Math.min(offset, text.length));
  const before = text.slice(0, safe);
  const lines = before.split("\n");
  return { line: lines.length, col: (lines[lines.length - 1]?.length ?? 0) + 1 };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
