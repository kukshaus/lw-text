import type { PageLayoutSettings } from "@lw-text/engine";

export type ProjectKind = "application" | "framework";

export interface ProjectSummary {
  id: string;
  name: string;
  kind?: ProjectKind;
}

export interface TemplateMeta {
  id: string;
  version: string;
  dataSources: string[];
  title?: string;
  outputModes: string[];
}

export interface TestCaseSummary {
  key: string;
  id: string;
  templateId: string;
  title: string;
  description?: string;
  isDefault: boolean;
}

export interface BlockConsumer {
  id: string;
  kind: "template" | "block";
  ref: string;
}

export interface BlockReference {
  block: string;
  usedBy: BlockConsumer[];
  shared: boolean;
}

export interface ProjectDetail {
  id: string;
  name: string;
  templates: { id: string; meta: TemplateMeta }[];
  fixtures: string[];
  testCases: TestCaseSummary[];
  schemas: string[];
  blocks: string[];
}

export interface Diagnostic {
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
  loc?: { line: number; col: number };
  hint?: string;
}

export type HistorySource = "save" | "checkpoint" | "restore" | "autosave";

export interface HistoryEntryMeta {
  id: string;
  path: string;
  createdAt: string;
  label: string;
  source: HistorySource;
  hash: string;
  bytes: number;
}

export interface HistorySnapshot extends HistoryEntryMeta {
  content: string;
}

export interface AssetInfo {
  name: string;
  path: string;
  size: number;
  mimeType: string;
  modified: string;
}

export type ProjectFileKind = "template" | "schema" | "fixture" | "block" | "asset" | "font" | "manifest" | "other";

export interface ProjectFileEntry {
  name: string;
  path: string;
  kind: ProjectFileKind;
  id?: string;
  size?: number;
  modified?: string;
  readOnly?: boolean;
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

export interface FontInfo {
  name: string;
  path: string;
  family: string;
  size: number;
  mimeType: string;
  modified: string;
}

export interface JsonSchema {
  $schema?: string;
  $id?: string;
  title?: string;
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  format?: string;
  default?: unknown;
  description?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  "x-sensitive"?: boolean;
  [key: string]: unknown;
}

const base = "";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const msg = (body as { error?: string }).error ?? `HTTP ${res.status}`;
    if (res.status === 413) {
      throw new Error(msg.includes("too large") ? msg : `${msg} (file may exceed the 8 MB image limit)`);
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  /** URL for the live file-change event stream (Server-Sent Events). */
  eventsUrl(pid: string): string {
    return `${base}/v1/projects/${pid}/events`;
  },
  async projects(): Promise<ProjectSummary[]> {
    return (await json<{ projects: ProjectSummary[] }>(await fetch(`${base}/v1/projects`))).projects;
  },
  async renameProject(
    pid: string,
    body: { name?: string; newId?: string },
  ): Promise<{ project: ProjectSummary; projects: ProjectSummary[] }> {
    return json(
      await fetch(`${base}/v1/projects/${pid}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  },
  async duplicateProject(
    pid: string,
    body?: { name?: string; id?: string },
  ): Promise<{ project: ProjectSummary; projects: ProjectSummary[] }> {
    return json(
      await fetch(`${base}/v1/projects/${pid}/duplicate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      }),
    );
  },
  async deleteProject(
    pid: string,
    opts?: { force?: boolean },
  ): Promise<{ ok: boolean; projects: ProjectSummary[] }> {
    const q = opts?.force ? "?force=true" : "";
    return json(
      await fetch(`${base}/v1/projects/${pid}${q}`, {
        method: "DELETE",
      }),
    );
  },
  async projectDependents(pid: string): Promise<{ dependents: string[] }> {
    return json(await fetch(`${base}/v1/projects/${pid}/dependents`));
  },
  async createProject(body: {
    id?: string;
    name?: string;
    kind?: ProjectKind;
  }): Promise<{ project: ProjectSummary; projects: ProjectSummary[] }> {
    return json(
      await fetch(`${base}/v1/projects`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  },
  async project(id: string): Promise<ProjectDetail> {
    return json<ProjectDetail>(await fetch(`${base}/v1/projects/${id}`));
  },
  async fileTree(pid: string): Promise<ProjectFileTree> {
    return json(await fetch(`${base}/v1/projects/${pid}/files`));
  },
  async readFile(pid: string, path: string): Promise<{ path: string; content: string }> {
    return json(await fetch(`${base}/v1/projects/${pid}/files/content?path=${encodeURIComponent(path)}`));
  },
  async writeFile(
    pid: string,
    path: string,
    content: string,
    opts?: { historyLabel?: string },
  ): Promise<{ ok: boolean; path: string }> {
    return json(
      await fetch(`${base}/v1/projects/${pid}/files/content`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path, content, historyLabel: opts?.historyLabel }),
      }),
    );
  },
  async listHistory(
    pid: string,
    path: string,
  ): Promise<{ path: string; entries: HistoryEntryMeta[]; stats: { total: number; paths: number } }> {
    return json(
      await fetch(`${base}/v1/projects/${pid}/history?path=${encodeURIComponent(path)}`),
    );
  },
  async getHistorySnapshot(pid: string, id: string): Promise<HistorySnapshot> {
    return json(await fetch(`${base}/v1/projects/${pid}/history/${id}`));
  },
  async createCheckpoint(
    pid: string,
    path: string,
    content: string,
    label?: string,
  ): Promise<{ entry: HistoryEntryMeta }> {
    return json(
      await fetch(`${base}/v1/projects/${pid}/history`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path, content, label }),
      }),
    );
  },
  async restoreHistory(
    pid: string,
    id: string,
  ): Promise<{ ok: boolean; snapshot: HistorySnapshot }> {
    return json(
      await fetch(`${base}/v1/projects/${pid}/history/${id}/restore`, {
        method: "POST",
      }),
    );
  },
  async addDependency(
    pid: string,
    body: { project: string; version?: string },
  ): Promise<{ ok: boolean; dependencies: { id: string; name: string; kind: ProjectKind }[]; tree: ProjectFileTree }> {
    return json(
      await fetch(`${base}/v1/projects/${pid}/dependencies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  },
  async uploadFiles(
    pid: string,
    body: {
      folder?: "templates" | "schemas" | "fixtures" | "blocks" | "assets" | "fonts" | "auto";
      files: Array<{ filename: string; data: string }>;
    },
  ): Promise<{ uploaded: ProjectFileEntry[]; errors: string[]; tree: ProjectFileTree }> {
    return json(
      await fetch(`${base}/v1/projects/${pid}/files/upload`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  },
  async createFile(
    pid: string,
    body: { folder: "templates" | "schemas" | "fixtures" | "blocks"; name: string; datasourceName?: string },
  ): Promise<{ file: ProjectFileEntry; tree: ProjectFileTree }> {
    return json(
      await fetch(`${base}/v1/projects/${pid}/files`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  },
  async template(pid: string, tid: string): Promise<{ source: string; meta: TemplateMeta; locked: string[] }> {
    return json(await fetch(`${base}/v1/projects/${pid}/templates/${tid}`));
  },
  async fixture(pid: string, fid: string): Promise<Record<string, unknown>> {
    return json(await fetch(`${base}/v1/projects/${pid}/fixtures/${fid}`));
  },
  async testCase(pid: string, key: string): Promise<{ key: string; title: string; dataSources: Record<string, unknown> }> {
    return json(await fetch(`${base}/v1/projects/${pid}/test-cases/${key}`));
  },
  async createTestCase(
    pid: string,
    body: {
      templateId: string;
      title: string;
      caseId?: string;
      description?: string;
      copyFromKey?: string;
      dataSources?: Record<string, unknown>;
      isDefault?: boolean;
    },
  ): Promise<{ key: string; testCases: TestCaseSummary[] }> {
    return json(
      await fetch(`${base}/v1/projects/${pid}/test-cases`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  },
  async saveTestCase(
    pid: string,
    key: string,
    dataSources: Record<string, unknown>,
  ): Promise<{ ok: boolean; key: string }> {
    return json(
      await fetch(`${base}/v1/projects/${pid}/test-cases/${key}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataSources }),
      }),
    );
  },
  async deleteTestCase(pid: string, key: string): Promise<{ ok: boolean; testCases: TestCaseSummary[] }> {
    return json(
      await fetch(`${base}/v1/projects/${pid}/test-cases/${key}`, {
        method: "DELETE",
      }),
    );
  },
  async references(pid: string): Promise<BlockReference[]> {
    return (await json<{ blocks: BlockReference[] }>(await fetch(`${base}/v1/projects/${pid}/references`))).blocks;
  },
  async aiContext(pid: string): Promise<{ dataSources: Record<string, unknown> }> {
    return json(await fetch(`${base}/v1/projects/${pid}/ai/context`));
  },
  assetUrl(pid: string, name: string): string {
    return `${base}/v1/projects/${pid}/assets/${encodeURIComponent(name)}`;
  },
  async assets(pid: string): Promise<AssetInfo[]> {
    return (await json<{ assets: AssetInfo[] }>(await fetch(`${base}/v1/projects/${pid}/assets`))).assets;
  },
  async uploadAsset(pid: string, file: File): Promise<AssetInfo> {
    const data = await fileToBase64(file);
    const res = await fetch(`${base}/v1/projects/${pid}/assets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: file.name, data }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    }
    return (await res.json() as { asset: AssetInfo }).asset;
  },
  async deleteAsset(pid: string, name: string): Promise<void> {
    const res = await fetch(`${base}/v1/projects/${pid}/assets/${encodeURIComponent(name)}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    }
  },
  fontUrl(pid: string, name: string): string {
    return `${base}/v1/projects/${pid}/fonts/${encodeURIComponent(name)}`;
  },
  async fonts(pid: string): Promise<FontInfo[]> {
    return (await json<{ fonts: FontInfo[] }>(await fetch(`${base}/v1/projects/${pid}/fonts`))).fonts;
  },
  async uploadFont(pid: string, file: File): Promise<FontInfo> {
    const data = await fileToBase64(file);
    const res = await fetch(`${base}/v1/projects/${pid}/fonts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: file.name, data }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    }
    return (await res.json() as { font: FontInfo }).font;
  },
  async deleteFont(pid: string, name: string): Promise<void> {
    const res = await fetch(`${base}/v1/projects/${pid}/fonts/${encodeURIComponent(name)}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    }
  },
  async preview(
    pid: string,
    source: string,
    dataSources: Record<string, unknown>,
    pageLayout?: PageLayoutSettings,
  ): Promise<{ html: string; warnings: string[] }> {
    return json(
      await fetch(`${base}/v1/projects/${pid}/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source,
          dataSources,
          output: { fullDocument: true },
          ...(pageLayout ? { pageLayout } : {}),
        }),
      }),
    );
  },
  async validate(
    pid: string,
    source: string,
    dataSources: Record<string, unknown>,
  ): Promise<{ ok: boolean; diagnostics: Diagnostic[] }> {
    return json(
      await fetch(`${base}/v1/projects/${pid}/validate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source, dataSources }),
      }),
    );
  },
  async schema(pid: string, name: string): Promise<{ name: string; schema: JsonSchema; path: string }> {
    return json(await fetch(`${base}/v1/projects/${pid}/schemas/${name}`));
  },
  async inferSchema(
    pid: string,
    sample: unknown,
    opts: { title?: string; rootId?: string; required?: "present" | "none" } = {},
  ): Promise<JsonSchema> {
    return (
      await json<{ schema: JsonSchema }>(
        await fetch(`${base}/v1/projects/${pid}/schema/infer`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sample, ...opts }),
        }),
      )
    ).schema;
  },
  async checkSchema(
    pid: string,
    schema: JsonSchema,
    sample: unknown,
    name = "DATA",
  ): Promise<{ ok: boolean; diagnostics: Diagnostic[] }> {
    return json(
      await fetch(`${base}/v1/projects/${pid}/schema/check`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ schema, sample, name }),
      }),
    );
  },
  async saveSchema(pid: string, name: string, schema: JsonSchema): Promise<{ ok: boolean; path: string }> {
    return json(
      await fetch(`${base}/v1/projects/${pid}/schemas/${name}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ schema }),
      }),
    );
  },
  async composePdf(
    pid: string,
    source: string,
    dataSources: Record<string, unknown>,
    pageLayout?: PageLayoutSettings,
  ): Promise<Blob> {
    const res = await fetch(`${base}/v1/projects/${pid}/compose`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source,
        dataSources,
        output: { format: "pdf" },
        ...(pageLayout ? { pageLayout } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    }
    return res.blob();
  },
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
