import type { LwDocument, Node, Theme } from "@lw-text/engine";
import type { JSONSchema } from "@lw-text/schema";

export type ValidationProfile = "strict" | "standard" | "sandbox";
export type ProjectKind = "application" | "framework";

/** Declares a reusable framework project or future registry package. */
export interface ProjectDependencyRef {
  /** Workspace folder id (e.g. `acme-common`). */
  project?: string;
  /** Future registry id (e.g. `@acme/legal-blocks`). */
  package?: string;
  version?: string;
}

export interface ManifestDataSource {
  name: string;
  schema: string;
}

export interface ProjectManifest {
  name: string;
  version?: number;
  /** `framework` projects publish blocks/schemas for other projects. */
  kind?: ProjectKind;
  validation?: { profile?: ValidationProfile };
  dataSources?: ManifestDataSource[];
  dependencies?: ProjectDependencyRef[];
  /** What a framework project exports to dependents (defaults: blocks + schemas). */
  exports?: { blocks?: boolean; schemas?: boolean };
  theme?: { file?: string; tokens?: Record<string, string> };
}

/** Origin of a building block resolved from a framework dependency. */
export interface BlockOrigin {
  blockRef: string;
  fromProject: string;
  fromPath: string;
}

export interface ResolvedDependency {
  id: string;
  dir: string;
  name: string;
  kind: ProjectKind;
}

export interface LoadedTemplate {
  id: string;
  path: string;
  source: string;
  doc: LwDocument;
}

/**
 * A named data scenario used to drive preview/validation, mirroring M/TEXT's
 * per-template "test cases". A fixture file is either raw datasources
 * (`{ "DATA": {...} }`) or an envelope:
 *
 * ```json
 * { "lwTestCase": { "title": "B2C", "default": false }, "dataSources": { "DATA": {...} } }
 * ```
 *
 * The filename associates the case with a template: `invoice.json` is the
 * default case for template `invoice`; `invoice.b2c.json` is case `b2c`.
 */
export interface TestCase {
  /** Unique key (fixture file basename), used for lookup. */
  key: string;
  /** Short case id (e.g. "default", "b2c"). */
  id: string;
  /** Template this case belongs to (filename prefix or envelope override). */
  templateId: string;
  /** Human-friendly label shown in the Studio switcher. */
  title: string;
  description?: string;
  /** Marks the case selected by default for its template. */
  isDefault: boolean;
  /** Datasource payloads, keyed by datasource name (e.g. "DATA"). */
  dataSources: Record<string, unknown>;
}

export interface LoadedProject {
  dir: string;
  manifest: ProjectManifest;
  kind: ProjectKind;
  /** datasource name -> JSON schema */
  schemas: Record<string, JSONSchema>;
  /** template id -> loaded template */
  templates: Record<string, LoadedTemplate>;
  /** block ref/id -> IR nodes */
  blocks: Map<string, Node[]>;
  /** block ref -> framework source when not defined locally */
  blockOrigins: Map<string, BlockOrigin>;
  /** Resolved `dependencies[].project` entries */
  resolvedDependencies: ResolvedDependency[];
  /** fixture name -> data (keyed by file basename) */
  fixtures: Record<string, Record<string, unknown>>;
  /** named data scenarios layered over fixtures */
  testCases: TestCase[];
  theme?: Theme;
}

export interface LoadProjectOptions {
  /** Workspace root used to resolve `dependencies[].project` (e.g. `examples/`). */
  workspaceRoot?: string;
}
