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

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".ico"]);

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
};

export interface AssetInfo {
  name: string;
  /** Project-relative path stored in templates, e.g. `assets/logo.png`. */
  path: string;
  size: number;
  mimeType: string;
  modified: string;
}

export function assetsDir(projectDir: string): string {
  return join(projectDir, "assets");
}

export function ensureAssetsDir(projectDir: string): string {
  const dir = assetsDir(projectDir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** Safe filename — no path segments, limited charset. */
export function sanitizeAssetName(name: string): string {
  const base = basename(name).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return (base.slice(0, 120) || "image").replace(/^\.+/, "");
}

export function isAllowedImage(name: string): boolean {
  return IMAGE_EXT.has(extname(name).toLowerCase());
}

export function mimeFromExt(name: string): string {
  return MIME[extname(name).toLowerCase()] ?? "application/octet-stream";
}

export function assetRelPath(name: string): string {
  return `assets/${name}`;
}

export function resolveAssetFile(projectDir: string, name: string): string {
  const safe = sanitizeAssetName(name);
  const file = join(assetsDir(projectDir), safe);
  const root = assetsDir(projectDir) + "/";
  if (!file.startsWith(root) && file !== root.slice(0, -1)) {
    throw new Error("Invalid asset path");
  }
  return file;
}

export function listAssets(projectDir: string): AssetInfo[] {
  const dir = assetsDir(projectDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => isAllowedImage(name))
    .map((name) => {
      const file = join(dir, name);
      const st = statSync(file);
      return {
        name,
        path: assetRelPath(name),
        size: st.size,
        mimeType: mimeFromExt(name),
        modified: st.mtime.toISOString(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function saveAsset(projectDir: string, name: string, bytes: Buffer): AssetInfo {
  const safe = sanitizeAssetName(name);
  if (!isAllowedImage(safe)) throw new Error(`Unsupported image type "${extname(safe)}"`);
  ensureAssetsDir(projectDir);
  const file = join(assetsDir(projectDir), safe);
  writeFileSync(file, bytes);
  const st = statSync(file);
  return {
    name: safe,
    path: assetRelPath(safe),
    size: st.size,
    mimeType: mimeFromExt(safe),
    modified: st.mtime.toISOString(),
  };
}

export function deleteAsset(projectDir: string, name: string): void {
  const file = resolveAssetFile(projectDir, name);
  if (!existsSync(file)) throw new Error(`Asset "${name}" not found`);
  unlinkSync(file);
}

/** Inline project assets as data URLs so preview/PDF work inside srcDoc. */
export function embedAssetsInHtml(html: string, projectDir: string): string {
  return html.replace(/src="(assets\/[^"]+)"/g, (_m, rel: string) => {
    const file = join(projectDir, rel);
    if (!existsSync(file)) return `src="${rel}"`;
    try {
      const buf = readFileSync(file);
      const mime = mimeFromExt(rel);
      return `src="data:${mime};base64,${buf.toString("base64")}"`;
    } catch {
      return `src="${rel}"`;
    }
  });
}
