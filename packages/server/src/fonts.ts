import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, join } from "node:path";

const FONT_EXT = new Set([".ttf", ".otf", ".woff", ".woff2"]);
const MIME: Record<string, string> = {
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export interface FontInfo {
  name: string;
  path: string;
  family: string;
  size: number;
  mimeType: string;
  modified: string;
}

export function fontsDir(projectDir: string): string {
  return join(projectDir, "fonts");
}

function ensureFontsDir(projectDir: string): string {
  const dir = fontsDir(projectDir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function sanitizeFontName(name: string): string {
  const base = basename(name).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return (base.slice(0, 120) || "font").replace(/^\.+/, "");
}

export function isAllowedFont(name: string): boolean {
  return FONT_EXT.has(extname(name).toLowerCase());
}

export function fontMimeFromExt(name: string): string {
  return MIME[extname(name).toLowerCase()] ?? "application/octet-stream";
}

function familyFromName(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "");
  const clean = stem.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return clean || "Custom Font";
}

export function listFonts(projectDir: string): FontInfo[] {
  const dir = fontsDir(projectDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => isAllowedFont(name))
    .map((name) => {
      const file = join(dir, name);
      const st = statSync(file);
      return {
        name,
        path: `fonts/${name}`,
        family: familyFromName(name),
        size: st.size,
        mimeType: fontMimeFromExt(name),
        modified: st.mtime.toISOString(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function saveFont(projectDir: string, name: string, bytes: Buffer): FontInfo {
  const safe = sanitizeFontName(name);
  if (!isAllowedFont(safe)) throw new Error(`Unsupported font type "${extname(safe)}"`);
  ensureFontsDir(projectDir);
  const file = join(fontsDir(projectDir), safe);
  writeFileSync(file, bytes);
  const st = statSync(file);
  return {
    name: safe,
    path: `fonts/${safe}`,
    family: familyFromName(safe),
    size: st.size,
    mimeType: fontMimeFromExt(safe),
    modified: st.mtime.toISOString(),
  };
}

export function resolveFontFile(projectDir: string, name: string): string {
  const safe = sanitizeFontName(name);
  const file = join(fontsDir(projectDir), safe);
  const root = fontsDir(projectDir) + "/";
  if (!file.startsWith(root) && file !== root.slice(0, -1)) throw new Error("Invalid font path");
  return file;
}

export function deleteFont(projectDir: string, name: string): void {
  const file = resolveFontFile(projectDir, name);
  if (!existsSync(file)) throw new Error(`Font "${name}" not found`);
  unlinkSync(file);
}

function fontFaceCss(projectDir: string): string {
  const fonts = listFonts(projectDir);
  if (fonts.length === 0) return "";
  return fonts
    .map((f) => {
      const file = join(projectDir, f.path);
      const b64 = readFileSync(file).toString("base64");
      return `@font-face{font-family:"${cssEscape(f.family)}";src:url("data:${f.mimeType};base64,${b64}") format("${fontFormatHint(f.name)}");font-display:swap;}`;
    })
    .join("\n");
}

export function injectFontsIntoHtml(html: string, projectDir: string): string {
  const css = fontFaceCss(projectDir);
  if (!css) return html;
  const tag = `<style data-lw-fonts>\n${css}\n</style>`;
  if (html.includes("</head>")) return html.replace("</head>", `${tag}\n</head>`);
  return `${tag}\n${html}`;
}

function fontFormatHint(name: string): string {
  const ext = extname(name).toLowerCase();
  if (ext === ".ttf") return "truetype";
  if (ext === ".otf") return "opentype";
  if (ext === ".woff" || ext === ".woff2") return ext.slice(1);
  return "woff2";
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}
