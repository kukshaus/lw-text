import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { parse as parseYaml } from "yaml";
import { parseLw, type Node } from "@lw-text/engine";
import type { JSONSchema } from "@lw-text/schema";
import type {
  BlockOrigin,
  ProjectDependencyRef,
  ProjectKind,
  ProjectManifest,
  ResolvedDependency,
} from "./types.js";
import { findManifest } from "./loader.js";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function listFiles(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => extname(f) === ext)
    .map((f) => join(dir, f));
}

/** Resolve a dependency entry to a workspace project folder id. */
export function dependencyProjectId(dep: ProjectDependencyRef): string | null {
  if (dep.project?.trim()) return dep.project.trim();
  if (dep.package?.trim()) {
    const pkg = dep.package.trim();
    const slash = pkg.indexOf("/");
    return slash >= 0 ? pkg.slice(slash + 1) : pkg.replace(/^@/, "");
  }
  return null;
}

/** Absolute directory for a dependency project inside the workspace. */
export function resolveDependencyDir(workspaceRoot: string, projectId: string): string {
  const dir = projectId === "." ? workspaceRoot : join(workspaceRoot, projectId);
  if (!findManifest(dir)) {
    throw new Error(`Dependency project "${projectId}" not found in workspace`);
  }
  return dir;
}

function readManifest(dir: string): ProjectManifest {
  const path = findManifest(dir);
  if (!path) throw new Error(`No manifest in ${dir}`);
  return parseYaml(readFileSync(path, "utf8")) as ProjectManifest;
}

function loadBlocksInto(
  dir: string,
  fromProject: string,
  blocks: Map<string, Node[]>,
  origins: Map<string, BlockOrigin>,
  overwrite: boolean,
): void {
  for (const file of listFiles(join(dir, "blocks"), ".lw")) {
    const doc = parseLw(readFileSync(file, "utf8"));
    const relPath = `blocks/${basename(file, ".lw")}`;
    const refByPath = relPath;
    const refs = [refByPath];
    if (doc.meta.id) refs.push(doc.meta.id);

    for (const ref of refs) {
      if (!overwrite && blocks.has(ref)) continue;
      blocks.set(ref, doc.nodes);
      origins.set(ref, { blockRef: ref, fromProject, fromPath: relPath });
    }
  }
}

function loadSchemasInto(
  dir: string,
  manifest: ProjectManifest,
  schemas: Record<string, JSONSchema>,
  overwrite: boolean,
): void {
  if (manifest.exports?.schemas === false) return;
  for (const ds of manifest.dataSources ?? []) {
    if (!overwrite && schemas[ds.name]) continue;
    const schemaPath = join(dir, ds.schema);
    if (existsSync(schemaPath)) {
      schemas[ds.name] = readJson<JSONSchema>(schemaPath);
    }
  }
}

/**
 * Merge blocks and schemas from framework dependencies declared in the manifest.
 * Local project assets are loaded first; dependencies fill gaps (local wins on conflict).
 */
export function mergeFrameworkDependencies(
  workspaceRoot: string,
  manifest: ProjectManifest,
  blocks: Map<string, Node[]>,
  schemas: Record<string, JSONSchema>,
  blockOrigins: Map<string, BlockOrigin>,
): ResolvedDependency[] {
  const resolved: ResolvedDependency[] = [];
  const deps = manifest.dependencies ?? [];
  const seen = new Set<string>();

  for (const dep of deps) {
    const id = dependencyProjectId(dep);
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const depDir = resolveDependencyDir(workspaceRoot, id);
    const depManifest = readManifest(depDir);
    const kind: ProjectKind = depManifest.kind === "framework" ? "framework" : "application";

    loadBlocksInto(depDir, id, blocks, blockOrigins, false);
    loadSchemasInto(depDir, depManifest, schemas, false);

    resolved.push({
      id,
      dir: depDir,
      name: depManifest.name,
      kind,
    });
  }

  return resolved;
}

/** Virtual path prefix for read-only framework files in Studio (`@acme-common/blocks/foo.lw`). */
export function frameworkVirtualPath(projectId: string, relPath: string): string {
  return `@${projectId}/${relPath.replace(/^\/+/, "")}`;
}

export function parseFrameworkVirtualPath(path: string): { projectId: string; relPath: string } | null {
  if (!path.startsWith("@")) return null;
  const slash = path.indexOf("/");
  if (slash < 0) return null;
  return { projectId: path.slice(1, slash), relPath: path.slice(slash + 1) };
}
