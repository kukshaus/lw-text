import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { recordSnapshot, type HistorySource } from "./history.js";
import { basename, dirname, extname, join, resolve } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { listAssets } from "./assets.js";
import { listFonts } from "./fonts.js";
import {
  frameworkVirtualPath,
  parseFrameworkVirtualPath,
  resolveDependencyDir,
  type LoadedProject,
  type ProjectManifest,
} from "@lw-text/project";

export type ProjectFileKind = "template" | "schema" | "fixture" | "block" | "asset" | "font" | "manifest" | "other";

export interface ProjectFileEntry {
  name: string;
  path: string;
  kind: ProjectFileKind;
  /** Logical id for Studio navigation (template id, schema name, fixture key, etc.). */
  id?: string;
  size?: number;
  modified?: string;
  /** Framework dependency file — read-only in Studio. */
  readOnly?: boolean;
  /** Source framework project id when `readOnly`. */
  frameworkProject?: string;
}

export interface ProjectFolder {
  id: string;
  label: string;
  files: ProjectFileEntry[];
}

export interface ProjectFileTree {
  projectDir: string;
  manifestPath: string;
  folders: ProjectFolder[];
}

const MANIFEST_NAMES = ["lw-project.yaml", "lw-project.yml"];

export function buildProjectFileTree(projectDir: string, manifest: ProjectManifest, project?: LoadedProject): ProjectFileTree {
  const folders: ProjectFolder[] = [];

  const templatesDir = join(projectDir, "templates");
  folders.push({
    id: "templates",
    label: "Templates",
    files: listDirFiles(templatesDir, ".lw", "template").map((f) => ({
      ...f,
      id: basename(f.name, ".lw"),
    })),
  });

  const schemasDir = join(projectDir, "schemas");
  const schemaFiles = listDirFiles(schemasDir, ".json", "schema");
  const dsNames = new Map<string, string>();
  for (const ds of manifest.dataSources ?? [{ name: "DATA", schema: "schemas/DATA.schema.json" }]) {
    dsNames.set(ds.schema.replace(/\\/g, "/"), ds.name);
  }
  folders.push({
    id: "schemas",
    label: "Data models",
    files: schemaFiles.map((f) => ({
      ...f,
      id: dsNames.get(f.path) ?? (basename(f.name, ".schema.json").replace(/\.json$/, "") || basename(f.name, ".json")),
    })),
  });

  folders.push({
    id: "fixtures",
    label: "Test data",
    files: listDirFiles(join(projectDir, "fixtures"), ".json", "fixture").map((f) => ({
      ...f,
      id: basename(f.name, ".json"),
    })),
  });

  folders.push({
    id: "blocks",
    label: "Building blocks",
    files: listDirFiles(join(projectDir, "blocks"), ".lw", "block").map((f) => ({
      ...f,
      id: basename(f.name, ".lw"),
    })),
  });

  folders.push({
    id: "assets",
    label: "Images",
    files: listAssets(projectDir).map((a) => ({
      name: a.name,
      path: a.path,
      kind: "asset" as const,
      id: a.name,
      size: a.size,
      modified: a.modified,
    })),
  });

  folders.push({
    id: "fonts",
    label: "Fonts",
    files: listFonts(projectDir).map((f) => ({
      name: f.name,
      path: f.path,
      kind: "font" as const,
      id: f.name,
      size: f.size,
      modified: f.modified,
    })),
  });

  if (project && project.blockOrigins.size > 0) {
    const byFramework = new Map<string, ProjectFileEntry[]>();
    for (const origin of project.blockOrigins.values()) {
      const list = byFramework.get(origin.fromProject) ?? [];
      const virtualPath = frameworkVirtualPath(origin.fromProject, origin.fromPath);
      if (!list.some((f) => f.path === virtualPath)) {
        list.push({
          name: basename(origin.fromPath),
          path: virtualPath,
          kind: "block",
          id: basename(origin.fromPath, ".lw"),
          readOnly: true,
          frameworkProject: origin.fromProject,
        });
      }
      byFramework.set(origin.fromProject, list);
    }
    const depFiles: ProjectFileEntry[] = [];
    for (const dep of project.resolvedDependencies) {
      for (const f of byFramework.get(dep.id) ?? []) depFiles.push(f);
    }
    if (depFiles.length > 0) {
      folders.push({
        id: "framework-blocks",
        label: "Shared blocks (framework)",
        files: depFiles.sort((a, b) => a.name.localeCompare(b.name)),
      });
    }
  }

  if (project?.resolvedDependencies.length) {
    folders.push({
      id: "dependencies",
      label: "Framework dependencies",
      files: project.resolvedDependencies.map((d) => ({
        name: d.name,
        path: `dependencies/${d.id}`,
        kind: "other" as const,
        id: d.id,
      })),
    });
  }

  const manifestFile = MANIFEST_NAMES.map((n) => join(projectDir, n)).find((p) => existsSync(p));
  if (manifestFile) {
    const st = statSync(manifestFile);
    folders.unshift({
      id: "config",
      label: "Configuration",
      files: [
        {
          name: basename(manifestFile),
          path: basename(manifestFile),
          kind: "manifest",
          id: "manifest",
          size: st.size,
          modified: st.mtime.toISOString(),
        },
      ],
    });
  }

  return {
    projectDir,
    manifestPath: manifestFile ? basename(manifestFile) : "lw-project.yaml",
    folders,
  };
}

function listDirFiles(dir: string, ext: string, kind: ProjectFileKind): ProjectFileEntry[] {
  if (!existsSync(dir)) return [];
  const folder = basename(dir);
  return readdirSync(dir)
    .filter((f) => extname(f) === ext)
    .map((f) => {
      const st = statSync(join(dir, f));
      return {
        name: f,
        path: `${folder}/${f}`,
        kind,
        size: st.size,
        modified: st.mtime.toISOString(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Resolve and validate a project-relative path. */
export function resolveProjectPath(projectDir: string, relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.includes("..")) throw new Error("Invalid path");
  const abs = resolve(projectDir, normalized);
  const root = resolve(projectDir) + "/";
  if (!abs.startsWith(root) && abs !== resolve(projectDir)) {
    throw new Error("Path escapes project directory");
  }
  return abs;
}

export function readProjectFile(
  projectDir: string,
  relPath: string,
  opts?: { workspaceRoot?: string },
): { path: string; content: string } {
  const framework = parseFrameworkVirtualPath(relPath);
  if (framework && opts?.workspaceRoot) {
    const depDir = resolveDependencyDir(opts.workspaceRoot, framework.projectId);
    const abs = resolveProjectPath(depDir, framework.relPath);
    if (!existsSync(abs)) throw new Error(`File not found: ${relPath}`);
    return { path: relPath, content: readFileSync(abs, "utf8") };
  }
  const abs = resolveProjectPath(projectDir, relPath);
  if (!existsSync(abs)) throw new Error(`File not found: ${relPath}`);
  return { path: relPath.replace(/\\/g, "/"), content: readFileSync(abs, "utf8") };
}

export interface WriteProjectFileOptions {
  historyLabel?: string;
  historySource?: HistorySource;
  skipHistory?: boolean;
}

export function writeProjectFile(
  projectDir: string,
  relPath: string,
  content: string,
  opts?: WriteProjectFileOptions,
): void {
  if (parseFrameworkVirtualPath(relPath)) {
    throw new Error("Framework blocks are read-only — edit them in the framework project.");
  }
  writeProjectFileInternal(projectDir, relPath, content);
  if (!opts?.skipHistory) {
    recordSnapshot(projectDir, {
      path: relPath,
      content,
      label: opts?.historyLabel,
      source: opts?.historySource ?? "save",
    });
  }
}

/** Append a workspace framework dependency to the project manifest. */
export function addProjectDependency(
  projectDir: string,
  manifest: ProjectManifest,
  frameworkId: string,
  version = "1",
): ProjectManifest {
  const deps = [...(manifest.dependencies ?? [])];
  if (deps.some((d) => d.project === frameworkId)) {
    throw new Error(`Already depends on "${frameworkId}"`);
  }
  deps.push({ project: frameworkId, version });
  const next = { ...manifest, dependencies: deps };
  writeManifest(projectDir, next);
  return next;
}

export function writeProjectFileInternal(projectDir: string, relPath: string, content: string): void {
  const abs = resolveProjectPath(projectDir, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

export interface CreateFileInput {
  folder: "templates" | "schemas" | "fixtures" | "blocks";
  name: string;
  /** For schemas: datasource name (defaults from filename). */
  datasourceName?: string;
}

export function createProjectFile(projectDir: string, manifest: ProjectManifest, input: CreateFileInput): ProjectFileEntry {
  const safe = input.name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^\.+/, "") || "untitled";
  switch (input.folder) {
    case "templates": {
      const id = safe.replace(/\.lw$/i, "");
      const path = `templates/${id}.lw`;
      if (existsSync(resolveProjectPath(projectDir, path))) throw new Error(`Template "${id}" already exists`);
      const content = defaultTemplateSource(id);
      writeProjectFileInternal(projectDir, path, content);
      return { name: `${id}.lw`, path, kind: "template", id };
    }
    case "blocks": {
      const id = safe.replace(/\.lw$/i, "");
      const path = `blocks/${id}.lw`;
      if (existsSync(resolveProjectPath(projectDir, path))) throw new Error(`Block "${id}" already exists`);
      writeProjectFileInternal(projectDir, path, defaultBlockSource(id));
      return { name: `${id}.lw`, path, kind: "block", id };
    }
    case "fixtures": {
      const key = safe.replace(/\.json$/i, "");
      const path = `fixtures/${key}.json`;
      if (existsSync(resolveProjectPath(projectDir, path))) throw new Error(`Fixture "${key}" already exists`);
      writeProjectFileInternal(projectDir, path, JSON.stringify({ DATA: {} }, null, 2) + "\n");
      return { name: `${key}.json`, path, kind: "fixture", id: key };
    }
    case "schemas": {
      const dsName = (input.datasourceName ?? safe.replace(/\.schema\.json$/i, "").replace(/\.json$/i, "")).toUpperCase();
      const fileName = safe.endsWith(".json") ? safe : `${dsName}.schema.json`;
      const path = `schemas/${fileName}`;
      if (existsSync(resolveProjectPath(projectDir, path))) throw new Error(`Schema file "${fileName}" already exists`);
      const schemaPath = path;
      const sources = [...(manifest.dataSources ?? [])];
      if (!sources.find((d) => d.name === dsName)) {
        sources.push({ name: dsName, schema: schemaPath });
        writeManifest(projectDir, { ...manifest, dataSources: sources });
      }
      writeProjectFileInternal(
        projectDir,
        path,
        JSON.stringify(
          {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            $id: `https://lw-text.dev/schemas/${dsName}.json`,
            title: dsName,
            type: "object",
            properties: {},
          },
          null,
          2,
        ) + "\n",
      );
      return { name: fileName, path, kind: "schema", id: dsName };
    }
    default:
      throw new Error(`Cannot create files in folder "${input.folder}"`);
  }
}

function writeManifest(projectDir: string, manifest: ProjectManifest): void {
  const path = MANIFEST_NAMES.map((n) => join(projectDir, n)).find((p) => existsSync(p)) ?? join(projectDir, "lw-project.yaml");
  writeFileSync(path, stringifyYaml(manifest), "utf8");
}

function defaultTemplateSource(id: string): string {
  return `<template id="${id}" version="1.0.0" data-sources="DATA" output-modes="html,pdf">
  <section id="main">
    <h1>{{ DATA.title }}</h1>
    <p data-bind="DATA.description" format="plain" />
  </section>
</template>
`;
}

function defaultBlockSource(id: string): string {
  return `<template id="${id}" version="1.0.0" data-sources="DATA" output-modes="html">
  <p data-bind="DATA.text" format="plain" />
</template>
`;
}
