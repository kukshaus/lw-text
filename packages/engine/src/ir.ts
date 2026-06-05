/**
 * lw-doc Intermediate Representation (IR).
 *
 * Templates authored in `.lw` markup compile to this stable, JSON-serializable
 * tree. The IR is the contract shared by the parser, validator, renderer and
 * (later) the visual Studio. Field names are intentionally stable so LLMs and
 * external tools can read and patch documents reliably.
 */

export type Format =
  | "plain"
  | "html"
  | "date"
  | "datetime"
  | "currency"
  | "number"
  | "percent"
  | "phone"
  | "iban";

/** A run of static text and/or `{{ expression }}` interpolations. */
export interface InterpolatedText {
  /** Raw template string, e.g. "Dear {{ DATA.name }}," */
  template: string;
}

export type Node =
  | ElementNode
  | TextNode
  | BindNode
  | RepeatNode
  | IfNode
  | BlockRefNode
  | BarcodeNode;

/** Supported barcode symbologies (mapped to bwip-js bcids by the renderer). */
export type BarcodeSymbology =
  | "qrcode"
  | "datamatrix"
  | "pdf417"
  | "code128"
  | "code39"
  | "ean13"
  | "ean8"
  | "gs1-128"
  | "interleaved2of5";

export interface NodeBase {
  /** Stable author-facing id (optional for anonymous nodes). */
  id?: string;
  /** When false, AI agents must not modify this node (legal/locked zones). */
  aiEditable?: boolean;
  /** Source location for diagnostics. */
  loc?: { line: number; col: number };
}

/** A structural/visual element (section, p, table, tr, td, div, h1...). */
export interface ElementNode extends NodeBase {
  type: "element";
  tag: string;
  attrs: Record<string, string>;
  children: Node[];
}

/** Static or interpolated text content. */
export interface TextNode extends NodeBase {
  type: "text";
  text: InterpolatedText;
}

/** A single data binding with optional formatting. */
export interface BindNode extends NodeBase {
  type: "bind";
  /** Expression source, e.g. "DATA.invoice.total" or "row.amount". */
  expr: string;
  format?: Format;
  /** Optional locale expression (literal or binding). */
  locale?: string;
  /** Optional currency code expression for currency format. */
  currency?: string;
}

/** Render children once per item of an array expression. */
export interface RepeatNode extends NodeBase {
  type: "repeat";
  /** Array expression to iterate, e.g. "DATA.lineItems". */
  each: string;
  /** Loop variable name, e.g. "row". */
  as: string;
  /** Optional index variable name. */
  indexAs?: string;
  children: Node[];
}

/** Conditional rendering. */
export interface IfNode extends NodeBase {
  type: "if";
  /** Boolean expression. */
  when: string;
  children: Node[];
  /** Optional else branch. */
  otherwise?: Node[];
}

/** Reference to a reusable building block / framework package. */
export interface BlockRefNode extends NodeBase {
  type: "blockRef";
  /** Block reference, e.g. "@acme/legal-footer@1.0.0" or "blocks/header". */
  ref: string;
  /** Optional data slice expression passed to the block. */
  withData?: string;
  /** Host element tag the block is mounted on (default "div"). */
  tag?: string;
}

/** Machine-readable barcode / QR code. Rendered to inline SVG at compose time. */
export interface BarcodeNode extends NodeBase {
  type: "barcode";
  symbology: BarcodeSymbology;
  /** Literal value, or — when {@link isExpr} is true — an expression. */
  value: string;
  /** When true, `value` is evaluated against the data scope. */
  isExpr?: boolean;
  /** Module scale factor (bwip-js `scale`), default 3. */
  scale?: number;
  /** Bar height for 1D symbologies, in mm-ish units (bwip-js `height`). */
  height?: number;
  /** Render the human-readable value beneath 1D barcodes. */
  showText?: boolean;
  /** Accessible label / alt text. */
  alt?: string;
}

export interface TemplateMeta {
  id: string;
  version: string;
  dataSources: string[];
  layoutRef?: string;
  outputModes: string[];
  title?: string;
}

export interface LwDocument {
  /** Spec version of the IR. */
  ir: "0.1";
  meta: TemplateMeta;
  nodes: Node[];
}
