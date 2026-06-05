import type { LwDocument, Node, ElementNode, BindNode, BarcodeNode } from "@lw-text/engine";

/** A path addresses a node by child-index from the document root. */
export type Path = number[];

export const samePath = (a: Path | null, b: Path | null): boolean =>
  !!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]);

/** Editable child array of a node, or null for leaves. */
export function childrenOf(node: Node): Node[] | null {
  if (node.type === "element" || node.type === "if" || node.type === "repeat") return node.children;
  return null;
}

/** An element whose only child is a binding behaves like a leaf "field". */
export function isBindElement(node: Node): node is ElementNode {
  return node.type === "element" && node.children.length === 1 && node.children[0]!.type === "bind";
}

export function bindOf(node: Node): BindNode | null {
  return isBindElement(node) ? (node.children[0] as BindNode) : null;
}

/** True when the node can contain other nodes (and thus accept drops). */
export function isContainer(node: Node): boolean {
  if (isBindElement(node)) return false;
  return childrenOf(node) !== null;
}

export function getNode(doc: LwDocument, path: Path): Node | null {
  let nodes: Node[] = doc.nodes;
  let node: Node | null = null;
  for (const idx of path) {
    node = nodes[idx] ?? null;
    if (!node) return null;
    nodes = childrenOf(node) ?? [];
  }
  return node;
}

function clone(doc: LwDocument): LwDocument {
  return structuredClone(doc);
}

function parentArray(doc: LwDocument, path: Path): Node[] | null {
  if (path.length === 0) return null;
  if (path.length === 1) return doc.nodes;
  const parent = getNode(doc, path.slice(0, -1));
  return parent ? childrenOf(parent) : null;
}

/** Return a new doc with the node at `path` transformed by `fn`. */
export function updateNode(doc: LwDocument, path: Path, fn: (n: Node) => void): LwDocument {
  const next = clone(doc);
  const node = getNode(next, path);
  if (node) fn(node);
  return next;
}

/** Insert `node` as a child of `parentPath` at `index` (parentPath [] = root). */
export function insertChild(doc: LwDocument, parentPath: Path, index: number, node: Node): LwDocument {
  const next = clone(doc);
  const arr = parentPath.length === 0 ? next.nodes : childrenOf(getNode(next, parentPath)!) ?? null;
  if (!arr) return doc;
  arr.splice(Math.max(0, Math.min(index, arr.length)), 0, node);
  return next;
}

export function removeNode(doc: LwDocument, path: Path): LwDocument {
  const next = clone(doc);
  const arr = parentArray(next, path);
  if (!arr) return doc;
  arr.splice(path[path.length - 1]!, 1);
  return next;
}

export function moveNode(doc: LwDocument, path: Path, dir: -1 | 1): LwDocument {
  const next = clone(doc);
  const arr = parentArray(next, path);
  if (!arr) return doc;
  const i = path[path.length - 1]!;
  const j = i + dir;
  if (j < 0 || j >= arr.length) return doc;
  [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  return next;
}

/** Insert a deep copy of the node at `path` right after it; returns its path. */
export function duplicateNode(doc: LwDocument, path: Path): { doc: LwDocument; path: Path } {
  const src = getNode(doc, path);
  if (!src) return { doc, path };
  const copy = structuredClone(src);
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1]! + 1;
  return { doc: insertChild(doc, parentPath, index, copy), path: [...parentPath, index] };
}

const startsWith = (a: Path, b: Path) => b.length <= a.length && b.every((v, i) => v === a[i]);

/**
 * Move the node at `from` to become child `toIndex` of `toParentPath`,
 * supporting cross-container moves. Returns the node's resulting path.
 * No-ops when dropping a node into itself or one of its descendants.
 */
export function moveNodeTo(
  doc: LwDocument,
  from: Path,
  toParentPath: Path,
  toIndex: number,
): { doc: LwDocument; path: Path } {
  if (startsWith(toParentPath, from)) return { doc, path: from }; // into self/descendant
  const next = clone(doc);
  const node = getNode(next, from);
  if (!node) return { doc, path: from };

  const fromParent = from.slice(0, -1);
  const fromIndex = from[from.length - 1]!;

  // Remove from source.
  const srcArr = fromParent.length === 0 ? next.nodes : childrenOf(getNode(next, fromParent)!)!;
  srcArr.splice(fromIndex, 1);

  // Removing the source shifts later indices in its array. Adjust the target
  // parent path if it routes through that same array past the removed index…
  const adjParent = [...toParentPath];
  const lvl = fromParent.length;
  if (toParentPath.length > lvl && startsWith(toParentPath, fromParent) && adjParent[lvl]! > fromIndex) {
    adjParent[lvl] = adjParent[lvl]! - 1;
  }
  // …and the drop index itself when dropping back into the source's own array.
  let index = toIndex;
  if (samePath(fromParent, toParentPath) && toIndex > fromIndex) index -= 1;

  const dstArr = adjParent.length === 0 ? next.nodes : childrenOf(getNode(next, adjParent)!);
  if (!dstArr) return { doc, path: from };
  index = Math.max(0, Math.min(index, dstArr.length));
  dstArr.splice(index, 0, node);
  return { doc: next, path: [...adjParent, index] };
}

/* --------------------------- node factories --------------------------- */

export type PaletteKind =
  | "heading"
  | "paragraph"
  | "container"
  | "table"
  | "image"
  | "field"
  | "block"
  | "barcode"
  | "qr"
  | "condition"
  | "loop";

export interface PaletteItem {
  kind: PaletteKind;
  label: string;
  icon: string;
  hint: string;
}

export const PALETTE: PaletteItem[] = [
  { kind: "heading", label: "Heading", icon: "H", hint: "Section heading" },
  { kind: "paragraph", label: "Paragraph", icon: "¶", hint: "Body text with bindings" },
  { kind: "container", label: "Container", icon: "▭", hint: "Section / grouping box" },
  { kind: "table", label: "Table", icon: "▦", hint: "Tabular data" },
  { kind: "image", label: "Image", icon: "▣", hint: "Logo / picture" },
  { kind: "field", label: "Data field", icon: "{}", hint: "Bound + formatted value" },
  { kind: "block", label: "Building block", icon: "◆", hint: "Reusable block reference" },
  { kind: "barcode", label: "Barcode", icon: "‖||", hint: "Code 128 / EAN / DataMatrix…" },
  { kind: "qr", label: "QR code", icon: "▤", hint: "2-D QR code" },
  { kind: "condition", label: "Condition", icon: "?", hint: "Show content only if…" },
  { kind: "loop", label: "Loop", icon: "↻", hint: "Repeat content per array item" },
];

const text = (t: string): Node => ({ type: "text", text: { template: t } });

export function createNode(kind: PaletteKind): Node {
  switch (kind) {
    case "heading":
      return { type: "element", tag: "h2", attrs: {}, children: [text("Heading")] };
    case "paragraph":
      return { type: "element", tag: "p", attrs: {}, children: [text("New paragraph — type here, use {{ DATA.field }} for data.")] };
    case "container":
      return { type: "element", tag: "section", attrs: { class: "lw-section" }, children: [] };
    case "table":
      return {
        type: "element",
        tag: "table",
        attrs: {},
        children: [
          { type: "element", tag: "thead", attrs: {}, children: [
            { type: "element", tag: "tr", attrs: {}, children: [
              { type: "element", tag: "th", attrs: {}, children: [text("Column")] },
              { type: "element", tag: "th", attrs: { class: "amount" }, children: [text("Amount")] },
            ] },
          ] },
          { type: "element", tag: "tbody", attrs: {}, children: [
            { type: "element", tag: "tr", attrs: {}, children: [
              { type: "element", tag: "td", attrs: {}, children: [text("Cell")] },
              { type: "element", tag: "td", attrs: { class: "amount" }, children: [text("0")] },
            ] },
          ] },
        ],
      };
    case "image":
      return { type: "element", tag: "img", attrs: { src: "", alt: "image" }, children: [] };
    case "field":
      return { type: "element", tag: "span", attrs: {}, children: [{ type: "bind", expr: "DATA.field", format: "plain" } as BindNode] };
    case "block":
      return { type: "blockRef", ref: "blocks/legal-footer", tag: "div" };
    case "barcode":
      return { type: "barcode", symbology: "code128", value: "12345678", isExpr: false, showText: true } as BarcodeNode;
    case "qr":
      return { type: "barcode", symbology: "qrcode", value: "DATA.invoice.number", isExpr: true } as BarcodeNode;
    case "condition":
      return { type: "if", when: "DATA.flag", children: [createNode("paragraph")] };
    case "loop":
      return { type: "repeat", each: "DATA.items", as: "item", children: [createNode("paragraph")] };
  }
}

/* ------------------------------ labels -------------------------------- */

export function nodeIcon(node: Node): string {
  switch (node.type) {
    case "text": return "T";
    case "bind": return "{}";
    case "barcode": return node.symbology === "qrcode" ? "▤" : "‖||";
    case "blockRef": return "◆";
    case "if": return "?";
    case "repeat": return "↻";
    case "element": return isBindElement(node) ? "{}" : "▭";
  }
}

export function nodeLabel(node: Node): string {
  switch (node.type) {
    case "text": return truncate(node.text.template.replace(/\s+/g, " ").trim() || "(empty text)");
    case "bind": return `bind ${node.expr}`;
    case "barcode": return `${node.symbology} · ${node.isExpr ? node.value : `"${node.value}"`}`;
    case "blockRef": return `block ${node.ref}`;
    case "if": return `if ${node.when}`;
    case "repeat": return `for ${node.as} in ${node.each}`;
    case "element": {
      const bind = bindOf(node);
      if (bind) return `${node.tag} · ${bind.expr}${bind.format && bind.format !== "plain" ? ` (${bind.format})` : ""}`;
      const id = node.id ? `#${node.id}` : "";
      return `${node.tag}${id}`;
    }
  }
}

function truncate(s: string, n = 36): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
