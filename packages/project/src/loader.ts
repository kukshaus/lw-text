import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { parse as parseYaml } from "yaml";
import { parseLw, type Node, type Theme } from "@lw-text/engine";
import type { JSONSchema } from "@lw-text/schema";
import { mergeFrameworkDependencies } from "./dependencies.js";
import type {
  BlockOrigin,
  LoadedProject,
  LoadProjectOptions,
  ProjectManifest,
  LoadedTemplate,
  TestCase,
} from "./types.js";

const MANIFEST_FILES = ["lw-project.yaml", "lw-project.yml"];

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function listFiles(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => extname(f) === ext)
    .map((f) => join(dir, f));
}

export function findManifest(dir: string): string | null {
  for (const name of MANIFEST_FILES) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

/** Load a complete lw-text project from a directory. */
export function loadProject(dir: string, options?: LoadProjectOptions): LoadedProject {
  const manifestPath = findManifest(dir);
  if (!manifestPath) {
    throw new Error(`No lw-project.yaml found in ${dir}`);
  }
  const manifest = parseYaml(readFileSync(manifestPath, "utf8")) as ProjectManifest;

  // Schemas
  const schemas: Record<string, JSONSchema> = {};
  for (const ds of manifest.dataSources ?? [{ name: "DATA", schema: "schemas/DATA.schema.json" }]) {
    const schemaPath = join(dir, ds.schema);
    if (existsSync(schemaPath)) {
      schemas[ds.name] = readJson<JSONSchema>(schemaPath);
    }
  }

  const blockOrigins = new Map<string, BlockOrigin>();

  // Local blocks (override framework blocks with the same ref)
  const blocks = new Map<string, Node[]>();
  for (const file of listFiles(join(dir, "blocks"), ".lw")) {
    const doc = parseLw(readFileSync(file, "utf8"));
    const refByPath = `blocks/${basename(file, ".lw")}`;
    blocks.set(refByPath, doc.nodes);
    if (doc.meta.id) blocks.set(doc.meta.id, doc.nodes);
    blockOrigins.delete(refByPath);
    if (doc.meta.id) blockOrigins.delete(doc.meta.id);
  }

  // Templates
  const templates: Record<string, LoadedTemplate> = {};
  for (const file of listFiles(join(dir, "templates"), ".lw")) {
    const source = readFileSync(file, "utf8");
    const doc = parseLw(source);
    templates[doc.meta.id] = { id: doc.meta.id, path: file, source, doc };
  }

  // Fixtures + named test cases (layered over fixtures/*.json)
  const fixtures: Record<string, Record<string, unknown>> = {};
  const testCases: TestCase[] = [];
  for (const file of listFiles(join(dir, "fixtures"), ".json")) {
    const key = basename(file, ".json");
    const raw = readJson<Record<string, unknown>>(file);
    fixtures[key] = raw;
    testCases.push(toTestCase(key, raw));
  }

  // Theme
  let theme: Theme | undefined;
  if (manifest.theme) {
    theme = { tokens: manifest.theme.tokens };
    if (manifest.theme.file) {
      const themePath = join(dir, manifest.theme.file);
      if (existsSync(themePath)) theme.css = readFileSync(themePath, "utf8");
    }
  }

  const kind = manifest.kind === "framework" ? "framework" : "application";
  const workspaceRoot = options?.workspaceRoot;
  const resolvedDependencies =
    workspaceRoot && (manifest.dependencies?.length ?? 0) > 0
      ? mergeFrameworkDependencies(workspaceRoot, manifest, blocks, schemas, blockOrigins)
      : [];

  return {
    dir,
    manifest,
    kind,
    schemas,
    templates,
    blocks,
    blockOrigins,
    resolvedDependencies,
    fixtures,
    testCases,
    theme,
  };
}

interface TestCaseEnvelope {
  lwTestCase?: { title?: string; description?: string; default?: boolean; template?: string };
  dataSources?: Record<string, unknown>;
}

/** Normalize a fixture file into a {@link TestCase}, accepting raw or enveloped JSON. */
function toTestCase(key: string, raw: Record<string, unknown>): TestCase {
  const env = raw as TestCaseEnvelope;
  const enveloped = env.lwTestCase != null && env.dataSources != null;
  const dataSources = enveloped ? (env.dataSources as Record<string, unknown>) : raw;

  // Filename convention: "<templateId>.<caseId>.json"; no dot => default case.
  const dot = key.indexOf(".");
  const inferredTemplate = dot >= 0 ? key.slice(0, dot) : key;
  const caseId = dot >= 0 ? key.slice(dot + 1) : "default";

  const meta = env.lwTestCase ?? {};
  return {
    key,
    id: caseId,
    templateId: meta.template ?? inferredTemplate,
    title: meta.title ?? (caseId === "default" ? "Default" : caseId),
    description: meta.description,
    isDefault: meta.default ?? caseId === "default",
    dataSources,
  };
}
