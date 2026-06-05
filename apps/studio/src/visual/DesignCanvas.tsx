import { createElement, memo, useRef, type CSSProperties, type ReactNode } from "react";
import { renderBarcodeSvg, type LwDocument, type Node } from "@lw-text/engine";
import { bindOf, samePath, type Path, type PaletteKind } from "./editorModel";
import { resolveImageSrc } from "./imageAssets";
import { CanvasImage } from "./CanvasImage";
import { ResizableBlock } from "./ResizableBlock";
import { isResizableTag, type BoxSize } from "./boxStyle";
import { CanvasEditableText } from "../bindings/CanvasEditableText";

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const INLINE = new Set(["span", "strong", "em", "b", "i", "u", "a", "small", "code", "sup", "sub", "br", "label", "mark", "abbr", "td", "th"]);
/** SVG subtree — children must not be wrapped in layout divs. */
const SVG_CONTAINER = new Set([
  "svg",
  "g",
  "defs",
  "symbol",
  "clipPath",
  "mask",
  "pattern",
  "marker",
  "switch",
  "a",
]);

export interface DesignCanvasProps {
  doc: LwDocument;
  pid: string;
  selected: Path | null;
  onSelect: (path: Path | null) => void;
  onInsert: (parentPath: Path, index: number, kind: PaletteKind) => void;
  onEditText: (path: Path, value: string) => void;
  onDuplicate: (path: Path) => void;
  onDelete: (path: Path) => void;
  onMoveTo: (from: Path, toParentPath: Path, toIndex: number) => void;
  onElementResize: (path: Path, patch: Partial<BoxSize>) => void;
  variableHints: string[];
  sampleData: Record<string, unknown> | null;
}

function DesignCanvasInner({ doc, pid, onSelect, ...rest }: DesignCanvasProps) {
  const common: CommonProps = { pid, onSelect, ...rest };
  return (
    <div
      className="lw-canvas"
      onClick={() => onSelect(null)}
      onDragStart={(e) => (e.currentTarget as HTMLElement).classList.add("dragging")}
      onDragEnd={(e) => (e.currentTarget as HTMLElement).classList.remove("dragging")}
    >
      <style>{CANVAS_CSS}</style>
      <NodeList nodes={doc.nodes} parentPath={[]} {...common} />
      {doc.nodes.length === 0 && <p className="lw-empty">Drag elements from the palette to start building.</p>}
    </div>
  );
}

interface CommonProps {
  pid: string;
  inSvg?: boolean;
  selected: Path | null;
  onSelect: (path: Path | null) => void;
  onInsert: (parentPath: Path, index: number, kind: PaletteKind) => void;
  onEditText: (path: Path, value: string) => void;
  onDuplicate: (path: Path) => void;
  onDelete: (path: Path) => void;
  onMoveTo: (from: Path, toParentPath: Path, toIndex: number) => void;
  onElementResize: (path: Path, patch: Partial<BoxSize>) => void;
  variableHints: string[];
  sampleData: Record<string, unknown> | null;
}

function NodeList({ nodes, parentPath, inSvg = false, ...rest }: { nodes: Node[]; parentPath: Path } & CommonProps) {
  if (inSvg) {
    return (
      <>
        {nodes.map((n, i) => (
          <NodeView key={i} node={n} path={[...parentPath, i]} inSvg {...rest} />
        ))}
      </>
    );
  }
  return (
    <>
      <DropZone parentPath={parentPath} index={0} onInsert={rest.onInsert} onMoveTo={rest.onMoveTo} />
      {nodes.map((n, i) => {
        const path = [...parentPath, i];
        return (
          <div key={i} className="lw-row">
            <RowTools path={path} onDuplicate={rest.onDuplicate} onDelete={rest.onDelete} onSelect={rest.onSelect} />
            <NodeView node={n} path={path} {...rest} />
            <DropZone parentPath={parentPath} index={i + 1} onInsert={rest.onInsert} onMoveTo={rest.onMoveTo} />
          </div>
        );
      })}
    </>
  );
}

/** Floating handle + actions shown on hover/selection of a row. */
function RowTools({ path, onDuplicate, onDelete, onSelect }: { path: Path } & Pick<CommonProps, "onDuplicate" | "onDelete" | "onSelect">) {
  return (
    <div className="lw-tools" contentEditable={false}>
      <button
        className="lw-tool lw-grip"
        title="Drag to move"
        draggable
        onClick={(e) => { e.stopPropagation(); onSelect(path); }}
        onDragStart={(e) => {
          e.dataTransfer.setData("application/lw-path", JSON.stringify(path));
          e.dataTransfer.effectAllowed = "move";
        }}
      >⠿</button>
      <button className="lw-tool" title="Duplicate" onClick={(e) => { e.stopPropagation(); onDuplicate(path); }}>⧉</button>
      <button className="lw-tool lw-del" title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(path); }}>✕</button>
    </div>
  );
}

function DropZone({ parentPath, index, onInsert, onMoveTo }: { parentPath: Path; index: number; onInsert: CommonProps["onInsert"]; onMoveTo: CommonProps["onMoveTo"] }) {
  const ref = useRef<HTMLDivElement>(null);
  const accepts = (e: React.DragEvent) =>
    e.dataTransfer.types.includes("application/lw-kind") || e.dataTransfer.types.includes("application/lw-path");
  return (
    <div
      ref={ref}
      className="lw-drop"
      onDragOver={(e) => {
        if (accepts(e)) {
          e.preventDefault();
          ref.current?.classList.add("over");
        }
      }}
      onDragLeave={() => ref.current?.classList.remove("over")}
      onDrop={(e) => {
        ref.current?.classList.remove("over");
        const movePath = e.dataTransfer.getData("application/lw-path");
        if (movePath) {
          e.preventDefault();
          e.stopPropagation();
          onMoveTo(JSON.parse(movePath) as Path, parentPath, index);
          return;
        }
        const kind = e.dataTransfer.getData("application/lw-kind") as PaletteKind;
        if (kind) {
          e.preventDefault();
          e.stopPropagation();
          onInsert(parentPath, index, kind);
        }
      }}
    />
  );
}

function NodeView({
  node,
  path,
  pid,
  inSvg = false,
  selected,
  onSelect,
  onInsert,
  onEditText,
  onDuplicate,
  onDelete,
  onMoveTo,
  onElementResize,
  variableHints,
  sampleData,
}: { node: Node; path: Path } & CommonProps) {
  const isSel = samePath(selected, path);
  const select = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(path);
  };
  const selCls = isSel ? " lw-sel" : "";
  const common: CommonProps = {
    pid,
    inSvg: inSvg || (node.type === "element" && node.tag === "svg"),
    selected,
    onSelect,
    onInsert,
    onEditText,
    onDuplicate,
    onDelete,
    onMoveTo,
    onElementResize,
    variableHints,
    sampleData,
  };

  // Logic wrappers ------------------------------------------------------
  if (node.type === "if") {
    return (
      <div className={`lw-ctrl lw-if${selCls}`} onClick={select}>
        <span className="lw-tag">IF {node.when}</span>
        <NodeList nodes={node.children} parentPath={path} {...common} />
      </div>
    );
  }
  if (node.type === "repeat") {
    return (
      <div className={`lw-ctrl lw-loop${selCls}`} onClick={select}>
        <span className="lw-tag">FOR {node.as}{node.indexAs ? `, ${node.indexAs}` : ""} in {node.each}</span>
        <NodeList nodes={node.children} parentPath={path} {...common} />
      </div>
    );
  }

  // Leaves --------------------------------------------------------------
  if (node.type === "barcode") {
    const preview = renderBarcodeSvg(node.symbology, node.isExpr ? node.value : node.value, {
      scale: 2,
      height: node.height,
      showText: node.showText,
    });
    return (
      <span className={`lw-barcode-box${selCls}`} onClick={select} title={node.isExpr ? `value: ${node.value}` : undefined}>
        <span className="lw-bc-svg" dangerouslySetInnerHTML={{ __html: preview }} />
        {node.isExpr && <span className="lw-fn">ƒ {node.value}</span>}
      </span>
    );
  }

  if (node.type === "blockRef") {
    return (
      <div className={`lw-block${selCls}`} onClick={select}>
        <span className="lw-tag">◆ block</span> {node.ref}{node.aiEditable === false && <span className="lw-lock">🔒 locked</span>}
      </div>
    );
  }

  if (node.type === "bind") {
    return <span className={`lw-chip${selCls}`} onClick={select}>{`{ ${node.expr} }`}</span>;
  }

  if (node.type === "text") {
    return (
      <CanvasEditableText
        value={node.text.template}
        variableHints={variableHints}
        sampleData={sampleData}
        onCommit={(v) => onEditText(path, v)}
        onSelect={select}
      />
    );
  }

  // Element (and bind-element field) ------------------------------------
  if (node.type === "element" && node.tag === "style") {
    return null;
  }

  const bind = bindOf(node);
  if (bind) {
    const fmt = bind.format && bind.format !== "plain" ? ` · ${bind.format}` : "";
    return (
      <span className={`lw-field${selCls}`} onClick={select}>
        {`{ ${bind.expr}${fmt} }`}
      </span>
    );
  }

  const style = parseStyle(node.attrs.style);
  const domAttrs: Record<string, unknown> = {
    className: `lw-el${selCls}${node.attrs.class ? " " + node.attrs.class : ""}`,
    style,
    onClick: select,
  };
  if (node.tag === "svg" && !node.attrs.xmlns) {
    domAttrs.xmlns = "http://www.w3.org/2000/svg";
  }
  for (const [k, v] of Object.entries(node.attrs)) {
    if (k === "style" || k === "class") continue;
    if (node.tag === "img" && k === "src") {
      domAttrs.src = resolveImageSrc(pid, v);
      continue;
    }
    if (node.tag === "image" && (k === "href" || k === "xlink:href")) {
      const resolved = resolveImageSrc(pid, v);
      domAttrs.href = resolved;
      domAttrs.xlinkHref = resolved;
      continue;
    }
    domAttrs[k] = v;
  }

  if (VOID.has(node.tag)) {
    if (node.tag === "img" && !node.attrs.src) {
      return (
        <span className={`lw-img-empty${selCls}`} onClick={select} title="Select to upload an image">
          ▣ Image
        </span>
      );
    }
    if (node.tag === "img" && node.attrs.src) {
      const isSel = samePath(selected, path);
      return (
        <CanvasImage
          pid={pid}
          src={node.attrs.src}
          alt={node.attrs.alt ?? ""}
          styleStr={node.attrs.style}
          className={`lw-el${isSel ? " lw-sel" : ""}${node.attrs.class ? ` ${node.attrs.class}` : ""}`}
          selected={isSel}
          onSelect={select}
          onResize={(patch) => onElementResize(path, patch)}
        />
      );
    }
    return createElement(node.tag, domAttrs);
  }

  const svgSubtree = SVG_CONTAINER.has(node.tag);
  const inlineChildren =
    !svgSubtree &&
    node.children.every(
      (c) => c.type === "text" || c.type === "bind" || (c.type === "element" && INLINE.has(c.tag)),
    );
  const childEls: ReactNode = svgSubtree ? (
    <NodeList nodes={node.children} parentPath={path} inSvg {...common} />
  ) : inlineChildren ? (
    node.children.map((c, i) => (
      <InlineChild
        key={i}
        node={c}
        path={[...path, i]}
        pid={pid}
        onEditText={onEditText}
        onSelect={onSelect}
        selected={selected}
        onElementResize={onElementResize}
        variableHints={variableHints}
        sampleData={sampleData}
      />
    ))
  ) : (
    <NodeList nodes={node.children} parentPath={path} {...common} />
  );

  if (isResizableTag(node.tag) && !svgSubtree && isSel) {
    const innerAttrs = { ...domAttrs };
    innerAttrs.className = `lw-el${selCls}${node.attrs.class ? ` ${node.attrs.class}` : ""}`;
    innerAttrs.style = {
      ...(typeof innerAttrs.style === "object" ? innerAttrs.style : {}),
      width: "100%",
      boxSizing: "border-box",
      minHeight: "inherit",
    };
    return (
      <ResizableBlock
        selected
        styleStr={node.attrs.style}
        onSelect={select}
        onResize={(patch) => onElementResize(path, patch)}
      >
        {createElement(node.tag, innerAttrs, childEls)}
      </ResizableBlock>
    );
  }

  return createElement(node.tag, domAttrs, childEls);
}

export const DesignCanvas = memo(DesignCanvasInner);

/** Inline rendering (no drop zones) for text/bind/inline elements. */
function InlineChild({
  node,
  path,
  pid,
  onEditText,
  onSelect,
  selected,
  onElementResize,
  variableHints,
  sampleData,
}: { node: Node; path: Path; pid: string } & Pick<
  CommonProps,
  "onEditText" | "onSelect" | "selected" | "onElementResize" | "variableHints" | "sampleData"
>) {
  if (node.type === "text") {
    return (
      <CanvasEditableText
        value={node.text.template}
        variableHints={variableHints}
        sampleData={sampleData}
        onCommit={(v) => onEditText(path, v)}
        onSelect={(e) => { e.stopPropagation(); onSelect(path); }}
      />
    );
  }
  if (node.type === "bind") {
    return <span className="lw-chip" onClick={(e) => { e.stopPropagation(); onSelect(path); }}>{`{ ${node.expr} }`}</span>;
  }
  if (node.type === "element") {
    const bind = bindOf(node);
    if (bind) return <span className="lw-field" onClick={(e) => { e.stopPropagation(); onSelect(path); }}>{`{ ${bind.expr} }`}</span>;
    const style = parseStyle(node.attrs.style);
    const attrs: Record<string, unknown> = {
      className: node.attrs.class,
      style,
      onClick: (e: React.MouseEvent) => { e.stopPropagation(); onSelect(path); },
    };
    if (node.tag === "img" && node.attrs.src) {
      const isSel = samePath(selected, path);
      return (
        <CanvasImage
          pid={pid}
          src={node.attrs.src}
          alt={node.attrs.alt ?? ""}
          styleStr={node.attrs.style}
          className={node.attrs.class}
          selected={isSel}
          onSelect={(e) => { e.stopPropagation(); onSelect(path); }}
          onResize={(patch) => onElementResize(path, patch)}
        />
      );
    }
    if (VOID.has(node.tag)) return createElement(node.tag, attrs);
    return createElement(
      node.tag,
      attrs,
      node.children.map((c, i) => (
        <InlineChild
          key={i}
          node={c}
          path={[...path, i]}
          pid={pid}
          onEditText={onEditText}
          onSelect={onSelect}
          selected={selected}
          onElementResize={onElementResize}
          variableHints={variableHints}
          sampleData={sampleData}
        />
      )),
    );
  }
  return null;
}

function parseStyle(style?: string): CSSProperties {
  if (!style) return {};
  const out: Record<string, string> = {};
  for (const decl of style.split(";")) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim().replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
    const val = decl.slice(idx + 1).trim();
    if (prop) out[prop] = val;
  }
  return out as CSSProperties;
}

const CANVAS_CSS = `
/* Editor chrome only — document typography comes from LW_COMPOSE_BASE_CSS on .lw-doc-surface */
.lw-canvas { min-height: 100%; color: inherit; font: inherit; }
.lw-row { position: relative; }
.lw-tools { position: absolute; top: -2px; right: -2px; z-index: 5; display: none; gap: 2px; padding: 2px; border-radius: 6px; background: #1e293b; box-shadow: 0 2px 8px rgba(0,0,0,.3); }
.lw-row:hover > .lw-tools, .lw-row:focus-within > .lw-tools { display: flex; }
.lw-tool { display: grid; place-items: center; width: 18px; height: 18px; border-radius: 4px; border: 0; background: transparent; color: #cbd5e1; font-size: 11px; line-height: 1; cursor: pointer; }
.lw-tool:hover { background: rgba(255,255,255,.12); color: #fff; }
.lw-tool.lw-del:hover { background: #be123c; color: #fff; }
.lw-grip { cursor: grab; color: #94a3b8; }
.lw-grip:active { cursor: grabbing; }
/* While dragging, surface every drop zone so targets are obvious. */
.lw-canvas.dragging .lw-drop { height: 12px; background: repeating-linear-gradient(90deg, #c7d2fe 0 6px, transparent 6px 12px); opacity: .7; }
.lw-canvas.dragging .lw-drop.over { opacity: 1; }
.lw-el { outline: 1px dashed transparent; outline-offset: 2px; cursor: pointer; transition: outline-color .12s; }
.lw-el:hover { outline-color: #c7d2fe; }
.lw-sel { outline: 2px solid #6366f1 !important; outline-offset: 2px; border-radius: 2px; }
.lw-drop { height: 6px; border-radius: 3px; margin: 1px 0; transition: background .1s, height .1s; }
.lw-drop.over { height: 16px; background: #6366f1; box-shadow: 0 0 0 2px #6366f155; }
.lw-ctrl { border: 1px dashed #cbd5e1; border-radius: 8px; padding: 18px 10px 8px; margin: 4px 0; position: relative; cursor: pointer; }
.lw-if { border-color: #f59e0b88; background: #fffbeb55; }
.lw-loop { border-color: #3b82f688; background: #eff6ff55; }
.lw-tag { position: absolute; top: -9px; left: 8px; background: #fff; padding: 0 6px; font: 600 9px/1 ui-monospace, monospace; color: #475569; border-radius: 4px; }
.lw-if > .lw-tag { color: #b45309; }
.lw-loop > .lw-tag { color: #1d4ed8; }
.lw-block { border: 1px dashed #94a3b8; border-radius: 6px; padding: 8px 10px; background: #f8fafc; color: #475569; font-size: 11px; cursor: pointer; }
.lw-block .lw-tag { position: static; margin-right: 6px; }
.lw-lock { margin-left: 8px; color: #b91c1c; font-size: 10px; }
.lw-field, .lw-chip { display: inline-block; background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe; border-radius: 5px; padding: 0 5px; font: 600 11px/1.5 ui-monospace, monospace; cursor: pointer; }
.lw-chip { background: #f1f5f9; color: #475569; border-color: #e2e8f0; }
.lw-barcode-box { display: inline-flex; flex-direction: column; gap: 2px; align-items: flex-start; padding: 4px; border: 1px solid transparent; border-radius: 6px; cursor: pointer; vertical-align: middle; }
.lw-barcode-box .lw-bc-svg svg { display: block; max-height: 90px; width: auto; }
.lw-fn { font: 600 9px/1 ui-monospace, monospace; color: #7c3aed; }
.lw-text-edit { outline: none; cursor: text; border-radius: 2px; }
.lw-text-edit:hover { background: #f1f5f9; }
.lw-text-edit:focus { background: #eef2ff; box-shadow: 0 0 0 2px #c7d2fe; }
.lw-empty { color: #94a3b8; text-align: center; padding: 40px 0; }
.lw-img-empty { display: inline-flex; align-items: center; justify-content: center; min-width: 120px; min-height: 64px; padding: 8px 14px; border: 2px dashed #cbd5e1; border-radius: 8px; background: #f8fafc; color: #64748b; font-size: 12px; font-weight: 600; cursor: pointer; }
.lw-img-empty:hover { border-color: #6366f1; color: #4338ca; background: #eef2ff; }
.lw-img-wrap { line-height: 0; display: inline-block; max-width: 100%; }
.lw-img-wrap-sel { box-shadow: 0 0 0 2px #6366f1; border-radius: 2px; }
.lw-resize-host { min-height: 24px; }
.lw-resize-host-sel { box-shadow: 0 0 0 2px #6366f1; border-radius: 4px; outline: 1px dashed #a5b4fc; outline-offset: 2px; }
.lw-resize-host > .lw-el { min-height: inherit; }
.lw-resize { position: absolute; z-index: 6; background: #6366f1; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.25); touch-action: none; }
.lw-resize-se { right: -6px; bottom: -6px; width: 12px; height: 12px; border-radius: 3px; cursor: nwse-resize; }
.lw-resize-e { right: -5px; top: 50%; margin-top: -10px; width: 8px; height: 20px; border-radius: 4px; cursor: ew-resize; }
.lw-resize-s { bottom: -5px; left: 50%; margin-left: -10px; width: 20px; height: 8px; border-radius: 4px; cursor: ns-resize; }
.lw-canvas svg { overflow: visible; flex-shrink: 0; }
/* Let flex layouts (e.g. masthead) see logo + text as siblings, not one full-width row. */
.lw-canvas section[style*="display:flex"] > .lw-row,
.lw-canvas [style*="display:flex"] > .lw-row { display: contents; }
.lw-canvas section[style*="display:flex"] > .lw-row > .lw-drop,
.lw-canvas [style*="display:flex"] > .lw-row > .lw-drop { display: none; }
`;
