import { existsSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { isAllowedImage, saveAsset, sanitizeAssetName } from "./assets.js";
import { isAllowedFont, saveFont, sanitizeFontName } from "./fonts.js";
import { type ProjectFileEntry, writeProjectFileInternal } from "./projectFiles.js";
import { MAX_ASSET_BYTES, MAX_FONT_BYTES, MAX_TEXT_UPLOAD_BYTES } from "./limits.js";

export const UPLOAD_FOLDER_IDS = [
  "templates",
  "schemas",
  "fixtures",
  "blocks",
  "assets",
  "fonts",
] as const;

export type UploadFolderId = (typeof UPLOAD_FOLDER_IDS)[number];

export interface UploadFileInput {
  filename: string;
  data: string;
}

export interface UploadFilesResult {
  uploaded: ProjectFileEntry[];
  errors: string[];
}

function assertFolderMatch(folder: UploadFolderId, filename: string): void {
  const ext = extname(filename).toLowerCase();
  switch (folder) {
    case "assets":
      if (!isAllowedImage(filename)) throw new Error(`“${filename}” is not a supported image`);
      return;
    case "fonts":
      if (!isAllowedFont(filename)) throw new Error(`“${filename}” is not a supported font`);
      return;
    case "templates":
    case "blocks":
      if (ext !== ".lw") throw new Error(`“${filename}” must be a .lw template/block file`);
      return;
    case "fixtures":
    case "schemas":
      if (ext !== ".json") throw new Error(`“${filename}” must be a .json file`);
      return;
  }
}

const TEXT_MAX = MAX_TEXT_UPLOAD_BYTES;
const IMAGE_MAX = MAX_ASSET_BYTES;
const FONT_MAX = MAX_FONT_BYTES;

function sanitizeFilename(name: string): string {
  return basename(name).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^\.+/, "") || "file";
}

function uniquePath(dir: string, filename: string): string {
  const full = join(dir, filename);
  if (!existsSync(full)) return filename;
  const ext = extname(filename);
  const stem = basename(filename, ext);
  for (let n = 2; n < 100; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!existsSync(join(dir, candidate))) return candidate;
  }
  throw new Error(`Could not find a free name for "${filename}"`);
}

/** Pick target folder from extension when no explicit folder is given. */
export function inferUploadFolder(filename: string): UploadFolderId {
  const ext = extname(filename).toLowerCase();
  if (isAllowedFont(filename)) return "fonts";
  if (isAllowedImage(filename)) return "assets";
  if (ext === ".lw") return "templates";
  if (ext === ".json") {
    const lower = filename.toLowerCase();
    if (lower.includes("schema") || lower.endsWith(".schema.json")) return "schemas";
    return "fixtures";
  }
  throw new Error(`Unsupported file type “${ext || filename}”`);
}

function relPathForFolder(folder: UploadFolderId, filename: string): string {
  switch (folder) {
    case "templates":
      return `templates/${filename.endsWith(".lw") ? filename : `${filename}.lw`}`;
    case "blocks":
      return `blocks/${filename.endsWith(".lw") ? filename : `${filename}.lw`}`;
    case "fixtures":
      return `fixtures/${filename.endsWith(".json") ? filename : `${filename}.json`}`;
    case "schemas":
      return `schemas/${filename.endsWith(".json") ? filename : `${filename}.json`}`;
    case "assets":
      return `assets/${sanitizeAssetName(filename)}`;
    case "fonts":
      return `fonts/${sanitizeFontName(filename)}`;
  }
}

function entryFromPath(path: string, kind: ProjectFileEntry["kind"], id?: string): ProjectFileEntry {
  const name = basename(path);
  return { name, path, kind, id: id ?? basename(name, extname(name)) };
}

/**
 * Write one or more files into the project (templates, fixtures, assets, etc.).
 */
export function uploadProjectFiles(
  projectDir: string,
  inputs: UploadFileInput[],
  folderHint?: UploadFolderId | "auto",
): UploadFilesResult {
  const uploaded: ProjectFileEntry[] = [];
  const errors: string[] = [];

  for (const input of inputs) {
    try {
      const safeName = sanitizeFilename(input.filename);
      let bytes: Buffer;
      try {
        bytes = Buffer.from(input.data, "base64");
      } catch {
        throw new Error(`Invalid encoding for “${input.filename}”`);
      }
      if (bytes.length === 0) throw new Error(`Empty file “${input.filename}”`);

      const folder: UploadFolderId =
        folderHint && folderHint !== "auto" ? folderHint : inferUploadFolder(safeName);
      assertFolderMatch(folder, safeName);

      if (folder === "assets") {
        if (bytes.length > IMAGE_MAX) throw new Error(`“${safeName}” exceeds 5 MB image limit`);
        const asset = saveAsset(projectDir, safeName, bytes);
        uploaded.push({
          name: asset.name,
          path: asset.path,
          kind: "asset",
          id: asset.name,
          size: asset.size,
          modified: asset.modified,
        });
        continue;
      }

      if (folder === "fonts") {
        if (bytes.length > FONT_MAX) throw new Error(`“${safeName}” exceeds 8 MB font limit`);
        const font = saveFont(projectDir, safeName, bytes);
        uploaded.push({
          name: basename(font.path),
          path: font.path,
          kind: "font",
          id: font.name,
          size: font.size,
          modified: font.modified,
        });
        continue;
      }

      if (bytes.length > TEXT_MAX) throw new Error(`“${safeName}” exceeds 2 MB text limit`);

      const subdir = folder;
      const dir = join(projectDir, subdir);
      const uniqueName = uniquePath(dir, basename(relPathForFolder(folder, safeName)));
      const relPath = `${subdir}/${uniqueName}`;

      if (folder === "templates" || folder === "blocks") {
        const text = bytes.toString("utf8");
        writeProjectFileInternal(projectDir, relPath, text);
        const id = basename(uniqueName, ".lw");
        uploaded.push(entryFromPath(relPath, folder === "blocks" ? "block" : "template", id));
        continue;
      }

      if (folder === "fixtures" || folder === "schemas") {
        const text = bytes.toString("utf8");
        JSON.parse(text);
        writeProjectFileInternal(projectDir, relPath, text.endsWith("\n") ? text : `${text}\n`);
        const id =
          folder === "fixtures"
            ? basename(uniqueName, ".json")
            : uniqueName.replace(/\.schema\.json$/i, "").replace(/\.json$/i, "");
        uploaded.push(entryFromPath(relPath, folder === "schemas" ? "schema" : "fixture", id));
        continue;
      }
    } catch (e) {
      errors.push((e as Error).message);
    }
  }

  return { uploaded, errors };
}
