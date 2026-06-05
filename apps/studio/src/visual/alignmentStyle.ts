import { getStyleProp, parseStyleMap, serializeStyleMap, setStyleProp, setStyleProps } from "./styleUtils";

export type AlignMode = "text" | "flex" | "self";
export type HAlign = "start" | "center" | "end" | "between";
export type VAlign = "start" | "center" | "end";

const CONTAINER_TAGS = new Set([
  "section",
  "div",
  "header",
  "footer",
  "article",
  "main",
  "aside",
  "nav",
  "ul",
  "ol",
  "figure",
  "fieldset",
  "form",
]);

const SELF_TAGS = new Set(["img", "lw-barcode"]);

export function getAlignmentMode(tag: string, hasBlockChildren: boolean): AlignMode {
  if (SELF_TAGS.has(tag)) return "self";
  if (CONTAINER_TAGS.has(tag) && hasBlockChildren) return "flex";
  return "text";
}

export function hasBlockChildren(tag: string, childTags: string[]): boolean {
  if (!CONTAINER_TAGS.has(tag)) return false;
  const inlineOnly = new Set([
    "span",
    "strong",
    "em",
    "b",
    "i",
    "u",
    "a",
    "small",
    "code",
    "br",
    "label",
    "mark",
  ]);
  return childTags.some((t) => !inlineOnly.has(t));
}

export interface ParsedAlignment {
  mode: AlignMode;
  horizontal: HAlign | null;
  vertical: VAlign | null;
}

export function parseAlignment(style: string | undefined, mode: AlignMode): ParsedAlignment {
  if (mode === "text") {
    const ta = getStyleProp(style, "text-align") ?? "left";
    const h =
      ta === "center" ? "center" : ta === "right" || ta === "end" ? "end" : ta === "justify" ? "between" : "start";
    return { mode, horizontal: h, vertical: null };
  }
  if (mode === "flex") {
    const jc = getStyleProp(style, "justify-content") ?? "flex-start";
    const ai = getStyleProp(style, "align-items") ?? "flex-start";
    return {
      mode,
      horizontal: flexMainToH(jc),
      vertical: flexCrossToV(ai),
    };
  }
  const self = getStyleProp(style, "align-self");
  const ml = getStyleProp(style, "margin-left");
  const mr = getStyleProp(style, "margin-right");
  let h: HAlign = "start";
  if (self === "center" || (ml === "auto" && mr === "auto")) h = "center";
  else if (self === "flex-end" || mr === "auto") h = "end";
  const mt = getStyleProp(style, "margin-top");
  const mb = getStyleProp(style, "margin-bottom");
  let v: VAlign = "start";
  if (self === "center" || (mt === "auto" && mb === "auto")) v = "center";
  else if (self === "flex-end" || mb === "auto") v = "end";
  return { mode, horizontal: h, vertical: v };
}

export function applyHorizontalAlign(style: string | undefined, mode: AlignMode, h: HAlign): string {
  if (mode === "text") {
    const v =
      h === "center" ? "center" : h === "end" ? "right" : h === "between" ? "justify" : "left";
    return setStyleProp(style, "text-align", v);
  }
  if (mode === "flex") {
    let next = ensureFlex(style);
    const v =
      h === "center"
        ? "center"
        : h === "end"
          ? "flex-end"
          : h === "between"
            ? "space-between"
            : "flex-start";
    return setStyleProp(next, "justify-content", v);
  }
  return applySelfHorizontal(style, h);
}

export function applyVerticalAlign(style: string | undefined, mode: AlignMode, v: VAlign): string {
  if (mode === "text") return style ?? "";
  if (mode === "flex") {
    let next = ensureFlex(style);
    const val = v === "center" ? "center" : v === "end" ? "flex-end" : "flex-start";
    return setStyleProp(next, "align-items", val);
  }
  return applySelfVertical(style, v);
}

function ensureFlex(style: string | undefined): string {
  const map = parseStyleMap(style);
  if (!map.has("display")) map.set("display", "flex");
  if (!map.has("flex-direction")) map.set("flex-direction", "row");
  if (!map.has("gap") && map.get("display") === "flex") {
    // leave gap unset
  }
  return serializeStyleMap(map);
}

function applySelfHorizontal(style: string | undefined, h: HAlign): string {
  const clears: Record<string, string> = {
    "align-self": "",
    "margin-left": "",
    "margin-right": "",
  };
  let next = setStyleProps(style, clears);
  if (h === "center") {
    next = setStyleProps(next, { "align-self": "center", "margin-left": "auto", "margin-right": "auto" });
  } else if (h === "end") {
    next = setStyleProps(next, { "align-self": "flex-end", "margin-left": "auto" });
  } else {
    next = setStyleProps(next, { "align-self": "flex-start" });
  }
  return next;
}

function applySelfVertical(style: string | undefined, v: VAlign): string {
  const clears: Record<string, string> = {
    "margin-top": "",
    "margin-bottom": "",
  };
  let next = setStyleProps(style, clears);
  if (v === "center") {
    next = setStyleProps(next, { "align-self": "center", "margin-top": "auto", "margin-bottom": "auto" });
  } else if (v === "end") {
    next = setStyleProps(next, { "align-self": "flex-end", "margin-bottom": "auto" });
  }
  return next;
}

function flexMainToH(jc: string): HAlign {
  if (jc.includes("center")) return "center";
  if (jc.includes("end") || jc === "right") return "end";
  if (jc.includes("space-between")) return "between";
  return "start";
}

function flexCrossToV(ai: string): VAlign {
  if (ai.includes("center")) return "center";
  if (ai.includes("end") || ai === "bottom") return "end";
  return "start";
}
