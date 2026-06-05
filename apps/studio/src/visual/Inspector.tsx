import type { Node, BindNode, BarcodeNode, Format, BarcodeSymbology } from "@lw-text/engine";
import { bindOf, nodeLabel, type Path } from "./editorModel";
import { ImageField } from "./ImageField";
import { BoxSizeField } from "./BoxSizeField";
import { applyBoxSizeToStyle, isResizableTag } from "./boxStyle";
import { FontField } from "./FontField";
import { AlignmentField } from "./AlignmentField";
import { BindingField } from "../bindings/BindingField";

export interface InspectorProps {
  node: Node;
  path: Path;
  pid: string;
  variableHints: string[];
  sampleData: Record<string, unknown> | null;
  onPatch: (fn: (n: Node) => void) => void;
}

const FORMATS: Format[] = ["plain", "html", "date", "datetime", "currency", "number", "percent", "phone", "iban"];
const SYMBOLOGIES: BarcodeSymbology[] = ["qrcode", "datamatrix", "pdf417", "code128", "code39", "ean13", "ean8", "gs1-128", "interleaved2of5"];
const TAGS = ["p", "div", "section", "span", "h1", "h2", "h3", "strong", "em", "ul", "li", "table", "tr", "td", "th", "blockquote"];

export function Inspector({ node, path, pid, variableHints, sampleData, onPatch }: InspectorProps) {
  const key = path.join("-");
  return (
    <div className="border-b border-white/5 p-3">
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/40">
        Properties
        <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] normal-case text-indigo-300">{nodeLabel(node)}</span>
      </h3>
      <div className="space-y-2">{fields(node, key, pid, variableHints, sampleData, onPatch)}</div>
    </div>
  );
}

function fields(
  node: Node,
  key: string,
  pid: string,
  variableHints: string[],
  sampleData: Record<string, unknown> | null,
  onPatch: InspectorProps["onPatch"],
) {
  if (node.type === "text") {
    return (
      <BindingField
        key={`${key}-t`}
        label="Text (use {{ DATA.x }} for data)"
        value={node.text.template}
        multiline
        mono
        variableHints={variableHints}
        sampleData={sampleData}
        onCommit={(v) => onPatch((n) => { (n as Extract<Node, { type: "text" }>).text.template = v; })}
      />
    );
  }

  if (node.type === "if") {
    return (
      <BindingField
        key={`${key}-if`}
        label="Condition (when)"
        value={node.when}
        mono
        variableHints={variableHints}
        sampleData={sampleData}
        onCommit={(v) => onPatch((n) => { (n as Extract<Node, { type: "if" }>).when = v; })}
      />
    );
  }

  if (node.type === "repeat") {
    return (
      <>
        <BindingField
          key={`${key}-each`}
          label="Array expression (each)"
          value={node.each}
          mono
          variableHints={variableHints}
          sampleData={sampleData}
          onCommit={(v) => onPatch((n) => { (n as Extract<Node, { type: "repeat" }>).each = v; })}
        />
        <Text key={`${key}-as`} label="Item variable (as)" value={node.as} mono
          onCommit={(v) => onPatch((n) => { (n as Extract<Node, { type: "repeat" }>).as = v; })} />
        <Text key={`${key}-idx`} label="Index variable (optional)" value={node.indexAs ?? ""} mono
          onCommit={(v) => onPatch((n) => { (n as Extract<Node, { type: "repeat" }>).indexAs = v || undefined; })} />
      </>
    );
  }

  if (node.type === "barcode") {
    const b = node as BarcodeNode;
    return (
      <>
        <Select key={`${key}-sym`} label="Symbology" value={b.symbology} options={SYMBOLOGIES}
          onChange={(v) => onPatch((n) => { (n as BarcodeNode).symbology = v as BarcodeSymbology; })} />
        {b.isExpr ? (
          <BindingField
            key={`${key}-val`}
            label="Value expression"
            value={b.value}
            mono
            variableHints={variableHints}
            sampleData={sampleData}
            onCommit={(v) => onPatch((n) => { (n as BarcodeNode).value = v; })}
          />
        ) : (
          <Text key={`${key}-val`} label="Value (literal)" value={b.value} mono
            onCommit={(v) => onPatch((n) => { (n as BarcodeNode).value = v; })} />
        )}
        <Check key={`${key}-expr`} label="Value is a data expression" checked={!!b.isExpr}
          onChange={(v) => onPatch((n) => { (n as BarcodeNode).isExpr = v || undefined; })} />
        <Check key={`${key}-txt`} label="Show human-readable text" checked={!!b.showText}
          onChange={(v) => onPatch((n) => { (n as BarcodeNode).showText = v || undefined; })} />
        <Text key={`${key}-alt`} label="Alt text" value={b.alt ?? ""}
          onCommit={(v) => onPatch((n) => { (n as BarcodeNode).alt = v || undefined; })} />
      </>
    );
  }

  if (node.type === "blockRef") {
    return (
      <>
        <Text key={`${key}-ref`} label="Block reference" value={node.ref} mono
          onCommit={(v) => onPatch((n) => { (n as Extract<Node, { type: "blockRef" }>).ref = v; })} />
        <BindingField
          key={`${key}-wd`}
          label="With data (optional expression)"
          value={node.withData ?? ""}
          mono
          variableHints={variableHints}
          sampleData={sampleData}
          onCommit={(v) => onPatch((n) => { (n as Extract<Node, { type: "blockRef" }>).withData = v || undefined; })}
        />
        <Check key={`${key}-lock`} label="Locked for AI (ai-editable=false)" checked={node.aiEditable === false}
          onChange={(v) => onPatch((n) => { (n as Node).aiEditable = v ? false : undefined; })} />
      </>
    );
  }

  // element / bind-element
  const bind = bindOf(node);
  if (bind) {
    const el = node as Extract<Node, { type: "element" }>;
    return (
      <>
        <AlignmentField
          key={`${key}-align`}
          tag={el.tag}
          style={el.attrs.style ?? ""}
          children={el.children}
          onChange={(s) => patchStyle(onPatch, s)}
        />
        <BindingField
          key={`${key}-bx`}
          label="Data binding"
          value={bind.expr}
          mono
          variableHints={variableHints}
          sampleData={sampleData}
          onCommit={(v) => onPatch((n) => { (bindChild(n)).expr = v; })}
        />
        <Select key={`${key}-fmt`} label="Format" value={bind.format ?? "plain"} options={FORMATS}
          onChange={(v) => onPatch((n) => { (bindChild(n)).format = v as Format; })} />
        {bind.format === "currency" && (
          <BindingField
            key={`${key}-cur`}
            label="Currency (expr or {{ }})"
            value={bind.currency ?? ""}
            mono
            variableHints={variableHints}
            sampleData={sampleData}
            onCommit={(v) => onPatch((n) => { (bindChild(n)).currency = v || undefined; })}
          />
        )}
        <BindingField
          key={`${key}-loc`}
          label="Locale (optional)"
          value={bind.locale ?? ""}
          mono
          variableHints={variableHints}
          sampleData={sampleData}
          onCommit={(v) => onPatch((n) => { (bindChild(n)).locale = v || undefined; })}
        />
      </>
    );
  }

  if (node.type === "element" && (node.tag === "img" || node.tag === "svg")) {
    const el = node;
    const isSvg = el.tag === "svg";
    const src = isSvg ? svgImageHref(el) : (el.attrs.src ?? "");
    return (
      <>
        {isSvg && (
          <p className="mb-2 text-[11px] leading-snug text-white/45">
            Inline vector graphic. Upload a PNG, JPG, or SVG file to replace it with a project image you can swap anytime.
          </p>
        )}
        <ImageField
          key={`${key}-img`}
          pid={pid}
          src={src}
          alt={el.attrs.alt ?? ""}
          onSrc={(v) => onPatch((n) => applyImageSource(n, v))}
          onAlt={(v) => onPatch((n) => { setAttr(n, "alt", v); })}
        />
        {el.tag === "img" && (
          <BoxSizeField
            key={`${key}-size`}
            variant="image"
            style={el.attrs.style ?? ""}
            onChange={(patch) =>
              onPatch((n) => {
                if (n.type !== "element" || n.tag !== "img") return;
                n.attrs.style = applyBoxSizeToStyle(n.attrs.style, patch);
              })
            }
          />
        )}
        <AlignmentField
          key={`${key}-align`}
          tag={el.tag}
          style={el.attrs.style ?? ""}
          children={el.children}
          onChange={(s) => patchStyle(onPatch, s)}
        />
        <Text key={`${key}-cls`} label="CSS class" value={el.attrs.class ?? ""} mono
          onCommit={(v) => onPatch((n) => { setAttr(n, "class", v); })} />
        <Text key={`${key}-sty`} label="Inline style" value={el.attrs.style ?? ""} mono
          onCommit={(v) => onPatch((n) => { setAttr(n, "style", v); })} />
        <FontField
          pid={pid}
          family={styleProp(el, "font-family") ?? "inherit"}
          onFamily={(v) => onPatch((n) => setStyleProp(n, "font-family", v))}
        />
        <Check key={`${key}-lock`} label="Locked for AI (ai-editable=false)" checked={node.aiEditable === false}
          onChange={(v) => onPatch((n) => { (n as Node).aiEditable = v ? false : undefined; })} />
      </>
    );
  }

  if (node.type === "element") {
    const el = node;
    return (
      <>
        <Select key={`${key}-tag`} label="Tag" value={node.tag} options={TAGS} allowCustom
          onChange={(v) => onPatch((n) => { (n as Extract<Node, { type: "element" }>).tag = v; })} />
        {isResizableTag(el.tag) && el.tag !== "img" && (
          <BoxSizeField
            key={`${key}-size`}
            variant="section"
            style={el.attrs.style ?? ""}
            onChange={(patch) =>
              onPatch((n) => {
                if (n.type !== "element" || !isResizableTag(n.tag)) return;
                n.attrs.style = applyBoxSizeToStyle(n.attrs.style, patch);
              })
            }
          />
        )}
        <AlignmentField
          key={`${key}-align`}
          tag={el.tag}
          style={el.attrs.style ?? ""}
          children={el.children}
          onChange={(s) => patchStyle(onPatch, s)}
        />
        <Text key={`${key}-id`} label="Id" value={node.id ?? ""} mono
          onCommit={(v) => onPatch((n) => { (n as Node).id = v || undefined; })} />
        <Text key={`${key}-cls`} label="CSS class" value={node.attrs.class ?? ""} mono
          onCommit={(v) => onPatch((n) => { setAttr(n, "class", v); })} />
        <Text key={`${key}-sty`} label="Inline style" value={node.attrs.style ?? ""} mono
          onCommit={(v) => onPatch((n) => { setAttr(n, "style", v); })} />
        <FontField
          pid={pid}
          family={styleProp(node, "font-family") ?? "inherit"}
          onFamily={(v) => onPatch((n) => setStyleProp(n, "font-family", v))}
        />
        <Check key={`${key}-lock`} label="Locked for AI (ai-editable=false)" checked={node.aiEditable === false}
          onChange={(v) => onPatch((n) => { (n as Node).aiEditable = v ? false : undefined; })} />
      </>
    );
  }

  return <p className="text-xs text-white/40">No editable properties.</p>;
}

function bindChild(n: Node): BindNode {
  return (n as Extract<Node, { type: "element" }>).children[0] as BindNode;
}
function setAttr(n: Node, key: string, value: string) {
  const el = n as Extract<Node, { type: "element" }>;
  if (value) el.attrs[key] = value;
  else delete el.attrs[key];
}

function patchStyle(onPatch: InspectorProps["onPatch"], style: string) {
  onPatch((n) => {
    if (n.type !== "element") return;
    setAttr(n, "style", style);
  });
}

function svgImageHref(el: Extract<Node, { type: "element" }>): string {
  if (el.tag !== "svg") return "";
  for (const c of el.children) {
    if (c.type === "element" && c.tag === "image") {
      return c.attrs.href ?? c.attrs["xlink:href"] ?? "";
    }
  }
  return "";
}

/** Set image src on &lt;img&gt; or replace inline &lt;svg&gt; logo with &lt;img src="assets/…"&gt;. */
function applyImageSource(n: Node, src: string) {
  const el = n as Extract<Node, { type: "element" }>;
  if (el.tag === "svg") {
    el.tag = "img";
    el.children = [];
    const next: Record<string, string> = {};
    if (src) next.src = src;
    if (el.attrs.alt) next.alt = el.attrs.alt;
    if (el.attrs.style) next.style = el.attrs.style;
    if (el.attrs.class) next.class = el.attrs.class;
    el.attrs = next;
    return;
  }
  setAttr(n, "src", src);
}

function styleProp(el: Extract<Node, { type: "element" }>, key: string): string | undefined {
  const style = el.attrs.style ?? "";
  for (const part of style.split(";")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim().toLowerCase();
    if (k === key) return part.slice(idx + 1).trim();
  }
  return undefined;
}

function setStyleProp(n: Node, key: string, value: string) {
  const el = n as Extract<Node, { type: "element" }>;
  const style = el.attrs.style ?? "";
  const map = new Map<string, string>();
  for (const part of style.split(";")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim().toLowerCase();
    const v = part.slice(idx + 1).trim();
    if (k) map.set(k, v);
  }
  if (!value || value === "inherit") map.delete(key);
  else map.set(key, value);
  const next = [...map.entries()].map(([k, v]) => `${k}: ${v}`).join("; ");
  setAttr(n, "style", next);
}

/* ------------------------------ inputs -------------------------------- */

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-white/35">{children}</label>;
}

function Text({
  label,
  value,
  onCommit,
  mono,
  multiline,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  mono?: boolean;
  multiline?: boolean;
}) {
  const cls = `w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/90 outline-none focus:border-indigo-400/50 ${mono ? "font-mono" : ""}`;
  return (
    <div>
      <Label>{label}</Label>
      {multiline ? (
        <textarea defaultValue={value} rows={3} onBlur={(e) => onCommit(e.target.value)} className={cls} />
      ) : (
        <input defaultValue={value} onBlur={(e) => onCommit(e.target.value)} className={cls} />
      )}
    </div>
  );
}

function Select({ label, value, options, onChange, allowCustom }: { label: string; value: string; options: string[]; onChange: (v: string) => void; allowCustom?: boolean }) {
  const opts = allowCustom && !options.includes(value) ? [value, ...options] : options;
  return (
    <div>
      <Label>{label}</Label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/90 outline-none focus:border-indigo-400/50">
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-white/70">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-indigo-500" />
      {label}
    </label>
  );
}
