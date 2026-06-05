import { cpSync, existsSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { findManifest, type ProjectManifest } from "@lw-text/project";
import { sanitizeProjectId } from "./scaffold.js";
import type { ProjectSummary } from "./workspace.js";

function assertInWorkspace(workspaceRoot: string, targetPath: string): void {
  const root = resolve(workspaceRoot) + "/";
  const abs = resolve(targetPath);
  if (!abs.startsWith(root)) throw new Error("Path escapes workspace");
}

function readManifest(dir: string): { path: string; manifest: ProjectManifest } {
  const path = findManifest(dir);
  if (!path) throw new Error(`No lw-project.yaml in ${dir}`);
  const manifest = parseYaml(readFileSync(path, "utf8")) as ProjectManifest;
  return { path, manifest };
}

function writeManifest(path: string, manifest: ProjectManifest): void {
  writeFileSync(path, stringifyYaml(manifest), "utf8");
}

/** Projects that declare a dependency on `projectId`. */
export function listDependents(workspaceRoot: string, projectId: string): string[] {
  if (!existsSync(workspaceRoot)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(workspaceRoot)) {
    const dir = join(workspaceRoot, entry);
    if (!statSync(dir).isDirectory()) continue;
    if (!findManifest(dir)) continue;
    try {
      const { manifest } = readManifest(dir);
      const deps = manifest.dependencies ?? [];
      if (deps.some((d) => d.project === projectId)) out.push(entry);
    } catch {
      // skip
    }
  }
  return out;
}

function patchDependencyRefs(workspaceRoot: string, oldId: string, newId: string): void {
  for (const entry of readdirSync(workspaceRoot)) {
    const dir = join(workspaceRoot, entry);
    if (!statSync(dir).isDirectory() || !findManifest(dir)) continue;
    const { path, manifest } = readManifest(dir);
    let changed = false;
    for (const dep of manifest.dependencies ?? []) {
      if (dep.project === oldId) {
        dep.project = newId;
        changed = true;
      }
    }
    if (changed) writeManifest(path, manifest);
  }
}

/** Copy an entire project directory. */
export function duplicateProject(
  workspaceRoot: string,
  sourceId: string,
  opts: { name?: string; id?: string },
): ProjectSummary {
  if (sourceId === ".") throw new Error("Cannot duplicate the workspace root project.");
  const sourceDir = join(workspaceRoot, sourceId);
  assertInWorkspace(workspaceRoot, sourceDir);
  if (!existsSync(sourceDir)) throw new Error(`Project "${sourceId}" not found`);

  const { manifest: srcManifest } = readManifest(sourceDir);
  const newId = sanitizeProjectId(opts.id ?? opts.name ?? `${sourceId}-copy`);
  const targetDir = join(workspaceRoot, newId);
  if (existsSync(targetDir)) throw new Error(`Project folder "${newId}" already exists`);

  cpSync(sourceDir, targetDir, { recursive: true });
  const { path, manifest } = readManifest(targetDir);
  manifest.name = opts.name?.trim() || `${srcManifest.name} (copy)`;
  writeManifest(path, manifest);

  return { id: newId, dir: targetDir, name: manifest.name, kind: manifest.kind };
}

/** Rename display name and/or workspace folder id. */
export function renameProject(
  workspaceRoot: string,
  projectId: string,
  opts: { name?: string; newId?: string },
): ProjectSummary {
  if (projectId === ".") {
    if (opts.newId?.trim()) throw new Error("Cannot rename the workspace root folder id.");
    const dir = workspaceRoot;
    const { path, manifest } = readManifest(dir);
    if (opts.name?.trim()) {
      manifest.name = opts.name.trim();
      writeManifest(path, manifest);
    }
    return { id: ".", dir, name: manifest.name, kind: manifest.kind };
  }

  const dir = join(workspaceRoot, projectId);
  assertInWorkspace(workspaceRoot, dir);
  if (!existsSync(dir)) throw new Error(`Project "${projectId}" not found`);

  const { path, manifest } = readManifest(dir);
  if (opts.name?.trim()) {
    manifest.name = opts.name.trim();
    writeManifest(path, manifest);
  }

  let finalId = projectId;
  const requestedId = opts.newId?.trim() ? sanitizeProjectId(opts.newId) : null;
  if (requestedId && requestedId !== projectId) {
    const newDir = join(workspaceRoot, requestedId);
    if (existsSync(newDir)) throw new Error(`Project folder "${requestedId}" already exists`);
    renameSync(dir, newDir);
    patchDependencyRefs(workspaceRoot, projectId, requestedId);
    finalId = requestedId;
  }

  const finalDir = join(workspaceRoot, finalId);
  const updated = readManifest(finalDir);
  return { id: finalId, dir: finalDir, name: updated.manifest.name, kind: updated.manifest.kind };
}

/** Remove a project directory from the workspace. */
export function deleteProject(
  workspaceRoot: string,
  projectId: string,
  opts?: { force?: boolean },
): void {
  if (projectId === ".") throw new Error("Cannot delete the workspace root project.");

  const dir = join(workspaceRoot, projectId);
  assertInWorkspace(workspaceRoot, dir);
  if (!existsSync(dir)) throw new Error(`Project "${projectId}" not found`);

  const dependents = listDependents(workspaceRoot, projectId);
  if (dependents.length > 0 && !opts?.force) {
    throw new Error(
      `“${projectId}” is used by: ${dependents.join(", ")}. Unlink frameworks first or delete with force.`,
    );
  }

  rmSync(dir, { recursive: true, force: true });
}
