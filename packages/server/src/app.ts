import { existsSync, writeFileSync, watch, readFileSync, type FSWatcher } from "node:fs";
import { resolve, join, extname } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import {
  parseLw,
  compose,
  pageLayoutToPdfOptions,
  resolvePageLayout,
  type LwDocument,
  type PageLayoutSettings,
} from "@lw-text/engine";
import {
  validateTemplate,
  findLockedNodeIds,
  findReferences,
  renderPdf,
  PdfUnavailableError,
  resolveDependencyDir,
  type LoadedProject,
} from "@lw-text/project";
import {
  validateDataSources,
  validateData,
  inferSchema,
  isCompilableSchema,
  type JSONSchema,
} from "@lw-text/schema";
import { Workspace, resolveWorkspaceRoot } from "./workspace.js";
import { InMemoryDocumentStore } from "./documents.js";
import {
  deleteAsset,
  embedAssetsInHtml,
  listAssets,
  mimeFromExt,
  resolveAssetFile,
  saveAsset,
  sanitizeAssetName,
} from "./assets.js";
import {
  deleteFont,
  fontMimeFromExt,
  injectFontsIntoHtml,
  listFonts,
  resolveFontFile,
  saveFont,
  sanitizeFontName,
} from "./fonts.js";
import {
  buildProjectFileTree,
  createProjectFile,
  readProjectFile,
  writeProjectFile,
  addProjectDependency,
  type CreateFileInput,
} from "./projectFiles.js";
import { scaffoldProject } from "./scaffold.js";
import { duplicateProject, renameProject, deleteProject, listDependents } from "./projectManage.js";
import { uploadProjectFiles, type UploadFolderId } from "./fileUpload.js";
import { HTTP_BODY_LIMIT_BYTES, MAX_ASSET_BYTES, MAX_FONT_BYTES } from "./limits.js";
import { createTestCase, saveTestCase, deleteTestCase } from "./testCases.js";
import {
  getSnapshot,
  historyStats,
  listSnapshots,
  recordSnapshot,
  restoreSnapshot,
} from "./history.js";

export interface ServerOptions {
  workspaceRoot?: string;
  /** Path to built Studio assets to serve at "/" (optional). */
  studioDir?: string;
  logger?: boolean;
}

interface ComposeBody {
  templateId?: string;
  source?: string;
  dataSources?: Record<string, unknown>;
  output?: { format?: "html" | "pdf"; fullDocument?: boolean };
  metadata?: Record<string, unknown>;
  /** Live override for preview/PDF (merged with template `lw-page-layout`). */
  pageLayout?: Partial<PageLayoutSettings>;
}

export function buildServer(opts: ServerOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: opts.logger ?? false,
    bodyLimit: HTTP_BODY_LIMIT_BYTES,
  });
  const workspace = new Workspace(opts.workspaceRoot ?? resolveWorkspaceRoot());
  const documents = new InMemoryDocumentStore();

  app.setErrorHandler((err: Error & { code?: string; statusCode?: number }, _req, reply) => {
    if (err.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      return reply.code(413).send({
        error: `Upload too large. Images must be under ${MAX_ASSET_BYTES / (1024 * 1024)} MB.`,
      });
    }
    const status = err.statusCode ?? 500;
    return reply.code(status).send({ error: err.message });
  });

  app.register(cors, { origin: true });

  if (opts.studioDir && existsSync(opts.studioDir)) {
    app.register(fastifyStatic, { root: resolve(opts.studioDir), prefix: "/" });
  }

  /* ----------------------------- health ----------------------------- */
  app.get("/health", async () => ({ status: "ok", workspace: workspace.root }));

  /* ---------------------------- projects ----------------------------- */
  app.get("/v1/projects", async () => ({ projects: workspace.list(), workspace: workspace.root }));

  app.post("/v1/projects", async (req, reply) => {
    const body = req.body as { id?: string; name?: string; kind?: "application" | "framework" };
    if (!body.id && !body.name) {
      return reply.code(400).send({ error: "Provide `id` or `name` for the new project." });
    }
    try {
      const project = scaffoldProject(workspace.root, body);
      return { project, projects: workspace.list() };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.patch("/v1/projects/:pid", async (req, reply) => {
    const { pid } = req.params as { pid: string };
    if (!existsSync(workspace.dirOf(pid))) {
      return reply.code(404).send({ error: `Project "${pid}" not found` });
    }
    const body = req.body as { name?: string; newId?: string };
    if (!body.name?.trim() && !body.newId?.trim()) {
      return reply.code(400).send({ error: "Provide `name` and/or `newId`." });
    }
    try {
      const project = renameProject(workspace.root, pid, {
        name: body.name,
        newId: body.newId,
      });
      return { project, projects: workspace.list() };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.post("/v1/projects/:pid/duplicate", async (req, reply) => {
    const { pid } = req.params as { pid: string };
    if (!existsSync(workspace.dirOf(pid))) {
      return reply.code(404).send({ error: `Project "${pid}" not found` });
    }
    const body = (req.body ?? {}) as { name?: string; id?: string };
    try {
      const project = duplicateProject(workspace.root, pid, { name: body.name, id: body.id });
      return { project, projects: workspace.list() };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.delete("/v1/projects/:pid", async (req, reply) => {
    const { pid } = req.params as { pid: string };
    if (!existsSync(workspace.dirOf(pid))) {
      return reply.code(404).send({ error: `Project "${pid}" not found` });
    }
    const force = (req.query as { force?: string }).force === "true";
    try {
      deleteProject(workspace.root, pid, { force });
      return { ok: true, projects: workspace.list() };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.get("/v1/projects/:pid/dependents", async (req, reply) => {
    const { pid } = req.params as { pid: string };
    return { dependents: listDependents(workspace.root, pid) };
  });

  app.get("/v1/projects/:pid", async (req, reply) => {
    const { pid } = req.params as { pid: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    return {
      id: pid,
      name: project.manifest.name,
      kind: project.kind,
      manifest: project.manifest,
      dependencies: project.resolvedDependencies,
      frameworkBlocks: [...project.blockOrigins.values()].map((o) => ({
        ref: o.blockRef,
        fromProject: o.fromProject,
        path: o.fromPath,
      })),
      templates: Object.values(project.templates).map((t) => ({ id: t.id, meta: t.doc.meta })),
      fixtures: Object.keys(project.fixtures),
      testCases: project.testCases.map(({ dataSources: _ds, ...summary }) => summary),
      schemas: Object.keys(project.schemas),
      blocks: [...project.blocks.keys()],
    };
  });

  app.post("/v1/projects/:pid/dependencies", async (req, reply) => {
    const { pid } = req.params as { pid: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    const body = req.body as { project?: string; version?: string };
    if (!body.project?.trim()) {
      return reply.code(400).send({ error: "Body must include `project` (framework workspace id)." });
    }
    try {
      resolveDependencyDir(workspace.root, body.project.trim());
      addProjectDependency(project.dir, project.manifest, body.project.trim(), body.version ?? "1");
      const fresh = workspace.get(pid);
      return {
        ok: true,
        dependencies: fresh.resolvedDependencies,
        tree: buildProjectFileTree(fresh.dir, fresh.manifest, fresh),
      };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  /* ----------------- live file watch (Server-Sent Events) ----------------- *
   * The Studio (and any client) subscribes here to learn when template,
   * block, schema or fixture files change on disk — e.g. when an AI tool such
   * as Claude Code edits them — so the UI can refresh without a manual reload. */
  app.get("/v1/projects/:pid/events", (req, reply) => {
    const { pid } = req.params as { pid: string };
    const dir = workspace.dirOf(pid);
    if (!existsSync(dir)) {
      reply.code(404).send({ error: `Project "${pid}" not found` });
      return;
    }

    const res = reply.raw;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write(`retry: 2000\n\n`);
    res.write(`event: ready\ndata: {"project":${JSON.stringify(pid)}}\n\n`);

    const WATCHED = new Set([".lw", ".json", ".yaml", ".yml"]);
    const ASSET_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".ico"]);
    const FONT_EXT = new Set([".ttf", ".otf", ".woff", ".woff2"]);
    const IGNORE = /(^|[\\/])(node_modules|\.git|dist|\.turbo)([\\/]|$)/;
    let pending: ReturnType<typeof setTimeout> | undefined;
    let changed = new Set<string>();

    const flush = () => {
      pending = undefined;
      const files = [...changed];
      changed = new Set();
      res.write(`event: change\ndata: ${JSON.stringify({ files })}\n\n`);
    };

    const watchers: FSWatcher[] = [];
    const watchDirs = new Set<string>([dir]);
    try {
      const loaded = workspace.get(pid);
      for (const dep of loaded.resolvedDependencies) {
        watchDirs.add(dep.dir);
      }
    } catch {
      // keep primary dir only
    }

    const onFsChange = (filename: string | Buffer | null) => {
      if (!filename) return;
      const name = filename.toString();
      if (IGNORE.test(name)) return;
      const ext = extname(name).toLowerCase();
      if (ext && !WATCHED.has(ext) && !ASSET_EXT.has(ext) && !FONT_EXT.has(ext)) return;
      changed.add(name);
      if (!pending) pending = setTimeout(flush, 120);
    };

    for (const watchDir of watchDirs) {
      try {
        watchers.push(watch(watchDir, { recursive: true }, (_event, filename) => onFsChange(filename)));
      } catch {
        // recursive watch unsupported on this platform for this path
      }
    }

    const heartbeat = setInterval(() => res.write(`: ping\n\n`), 25_000);

    const close = () => {
      clearInterval(heartbeat);
      if (pending) clearTimeout(pending);
      for (const w of watchers) w.close();
    };
    req.raw.on("close", close);
    req.raw.on("error", close);

    reply.hijack();
  });

  app.get("/v1/projects/:pid/templates/:tid", async (req, reply) => {
    const { pid, tid } = req.params as { pid: string; tid: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    const tpl = project.templates[tid];
    if (!tpl) return reply.code(404).send({ error: `Template "${tid}" not found` });
    return { id: tpl.id, meta: tpl.doc.meta, source: tpl.source, ir: tpl.doc, locked: findLockedNodeIds(tpl.doc) };
  });

  app.get("/v1/projects/:pid/fixtures/:fid", async (req, reply) => {
    const { pid, fid } = req.params as { pid: string; fid: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    const fx = project.fixtures[fid];
    if (!fx) return reply.code(404).send({ error: `Fixture "${fid}" not found` });
    return fx;
  });

  /* --------------------------- test cases ---------------------------- */
  app.get("/v1/projects/:pid/test-cases/:key", async (req, reply) => {
    const { pid, key } = req.params as { pid: string; key: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    const tc = project.testCases.find((c) => c.key === key);
    if (!tc) return reply.code(404).send({ error: `Test case "${key}" not found` });
    return { key: tc.key, id: tc.id, templateId: tc.templateId, title: tc.title, dataSources: tc.dataSources };
  });

  app.post("/v1/projects/:pid/test-cases", async (req, reply) => {
    const { pid } = req.params as { pid: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    const body = req.body as {
      templateId?: string;
      caseId?: string;
      title?: string;
      description?: string;
      copyFromKey?: string;
      dataSources?: Record<string, unknown>;
      isDefault?: boolean;
    };
    if (!body.templateId?.trim() || !body.title?.trim()) {
      return reply.code(400).send({ error: "Body must include `templateId` and `title`." });
    }
    try {
      const { key } = createTestCase(project.dir, {
        templateId: body.templateId.trim(),
        caseId: body.caseId,
        title: body.title.trim(),
        description: body.description,
        copyFromKey: body.copyFromKey,
        dataSources: body.dataSources,
        isDefault: body.isDefault,
      });
      const fresh = workspace.get(pid);
      const tc = fresh.testCases.find((c) => c.key === key);
      return {
        key,
        testCase: tc
          ? { key: tc.key, id: tc.id, templateId: tc.templateId, title: tc.title, isDefault: tc.isDefault }
          : { key, title: body.title.trim(), templateId: body.templateId.trim() },
        testCases: fresh.testCases.map(({ dataSources: _d, ...s }) => s),
      };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.put("/v1/projects/:pid/test-cases/:key", async (req, reply) => {
    const { pid, key } = req.params as { pid: string; key: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    const body = req.body as {
      dataSources?: Record<string, unknown>;
      title?: string;
      description?: string;
    };
    if (!body.dataSources || typeof body.dataSources !== "object") {
      return reply.code(400).send({ error: "Body must include `dataSources`." });
    }
    try {
      saveTestCase(project.dir, key, {
        dataSources: body.dataSources,
        title: body.title,
        description: body.description,
      });
      return { ok: true, key };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.delete("/v1/projects/:pid/test-cases/:key", async (req, reply) => {
    const { pid, key } = req.params as { pid: string; key: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    try {
      deleteTestCase(project.dir, key);
      const fresh = workspace.get(pid);
      return { ok: true, testCases: fresh.testCases.map(({ dataSources: _d, ...s }) => s) };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  /* ------------------------ project file explorer ------------------------ */
  app.get("/v1/projects/:pid/files", async (req, reply) => {
    const { pid } = req.params as { pid: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    return buildProjectFileTree(project.dir, project.manifest, project);
  });

  app.get("/v1/projects/:pid/files/content", async (req, reply) => {
    const { pid } = req.params as { pid: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    const path = (req.query as { path?: string }).path;
    if (!path) return reply.code(400).send({ error: "Query parameter `path` is required." });
    try {
      return readProjectFile(project.dir, path, { workspaceRoot: workspace.root });
    } catch (e) {
      return reply.code(404).send({ error: (e as Error).message });
    }
  });

  app.put("/v1/projects/:pid/files/content", async (req, reply) => {
    const { pid } = req.params as { pid: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    const body = req.body as { path?: string; content?: string };
    if (!body.path || body.content === undefined) {
      return reply.code(400).send({ error: "Body must include `path` and `content`." });
    }
    try {
      writeProjectFile(project.dir, body.path, body.content, {
        historyLabel: (req.body as { historyLabel?: string }).historyLabel,
      });
      return { ok: true, path: body.path };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  /* ------------------------ local version history ------------------------ */
  app.get("/v1/projects/:pid/history", async (req, reply) => {
    const { pid } = req.params as { pid: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    const path = (req.query as { path?: string }).path;
    if (!path) return reply.code(400).send({ error: "Query parameter `path` is required." });
    const entries = listSnapshots(project.dir, path);
    const stats = historyStats(project.dir);
    return { path, entries, stats };
  });

  app.get("/v1/projects/:pid/history/:id", async (req, reply) => {
    const { pid, id } = req.params as { pid: string; id: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    const snap = getSnapshot(project.dir, id);
    if (!snap) return reply.code(404).send({ error: `Snapshot "${id}" not found.` });
    return snap;
  });

  app.post("/v1/projects/:pid/history", async (req, reply) => {
    const { pid } = req.params as { pid: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    const body = req.body as { path?: string; content?: string; label?: string };
    if (!body.path || body.content === undefined) {
      return reply.code(400).send({ error: "Body must include `path` and `content`." });
    }
    const entry = recordSnapshot(project.dir, {
      path: body.path,
      content: body.content,
      label: body.label?.trim() || "Checkpoint",
      source: "checkpoint",
      dedupe: false,
    });
    if (!entry) return reply.code(400).send({ error: "This file type is not versioned." });
    return { entry };
  });

  app.post("/v1/projects/:pid/history/:id/restore", async (req, reply) => {
    const { pid, id } = req.params as { pid: string; id: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    try {
      const snap = restoreSnapshot(project.dir, id, (path, content) => {
        writeProjectFile(project.dir, path, content, { skipHistory: true });
      });
      return { ok: true, snapshot: snap };
    } catch (e) {
      return reply.code(404).send({ error: (e as Error).message });
    }
  });

  app.post("/v1/projects/:pid/files/upload", async (req, reply) => {
    const { pid } = req.params as { pid: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    const body = req.body as {
      folder?: UploadFolderId | "auto";
      files?: Array<{ filename?: string; data?: string }>;
    };
    const files = body.files ?? [];
    if (files.length === 0) {
      return reply.code(400).send({ error: "Provide at least one file in `files`." });
    }
    const prepared = files
      .filter((f) => f.filename && f.data)
      .map((f) => ({ filename: f.filename!, data: f.data! }));
    if (prepared.length === 0) {
      return reply.code(400).send({ error: "Each file needs `filename` and base64 `data`." });
    }
    try {
      const result = uploadProjectFiles(project.dir, prepared, body.folder ?? "auto");
      const fresh = workspace.get(pid);
      return {
        uploaded: result.uploaded,
        errors: result.errors,
        tree: buildProjectFileTree(fresh.dir, fresh.manifest, fresh),
      };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.post("/v1/projects/:pid/files", async (req, reply) => {
    const { pid } = req.params as { pid: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    const body = req.body as CreateFileInput;
    if (!body.folder || !body.name) {
      return reply.code(400).send({ error: "Body must include `folder` and `name`." });
    }
    try {
      const file = createProjectFile(project.dir, project.manifest, body);
      const fresh = workspace.get(pid);
      return { file, tree: buildProjectFileTree(fresh.dir, fresh.manifest, fresh) };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  /* ----------------------------- assets ----------------------------- */
  app.get("/v1/projects/:pid/assets", async (req, reply) => {
    const { pid } = req.params as { pid: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    return { assets: listAssets(project.dir) };
  });

  app.post("/v1/projects/:pid/assets", async (req, reply) => {
    const { pid } = req.params as { pid: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    const body = req.body as { filename?: string; data?: string };
    if (!body.data) return reply.code(400).send({ error: "Missing base64 `data`." });
    let bytes: Buffer;
    try {
      bytes = Buffer.from(body.data, "base64");
    } catch {
      return reply.code(400).send({ error: "Invalid base64 payload." });
    }
    if (bytes.length === 0) return reply.code(400).send({ error: "Empty file." });
    if (bytes.length > MAX_ASSET_BYTES) {
      return reply.code(413).send({ error: `Image exceeds ${MAX_ASSET_BYTES / (1024 * 1024)} MB limit.` });
    }
    const name = sanitizeAssetName(body.filename ?? "image.png");
    try {
      const asset = saveAsset(project.dir, name, bytes);
      return { asset };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.delete("/v1/projects/:pid/assets/:name", async (req, reply) => {
    const { pid, name } = req.params as { pid: string; name: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    try {
      deleteAsset(project.dir, name);
      return { ok: true };
    } catch (e) {
      return reply.code(404).send({ error: (e as Error).message });
    }
  });

  app.get("/v1/projects/:pid/assets/:name", async (req, reply) => {
    const { pid, name } = req.params as { pid: string; name: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    try {
      const file = resolveAssetFile(project.dir, name);
      if (!existsSync(file)) return reply.code(404).send({ error: "Asset not found" });
      const buf = readFileSync(file);
      reply.header("content-type", mimeFromExt(name));
      reply.header("cache-control", "public, max-age=3600");
      return reply.send(buf);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  /* ------------------------------ fonts ------------------------------ */
  app.get("/v1/projects/:pid/fonts", async (req, reply) => {
    const { pid } = req.params as { pid: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    return { fonts: listFonts(project.dir) };
  });

  app.post("/v1/projects/:pid/fonts", async (req, reply) => {
    const { pid } = req.params as { pid: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    const body = req.body as { filename?: string; data?: string };
    if (!body.data) return reply.code(400).send({ error: "Missing base64 `data`." });
    let bytes: Buffer;
    try {
      bytes = Buffer.from(body.data, "base64");
    } catch {
      return reply.code(400).send({ error: "Invalid base64 payload." });
    }
    if (bytes.length === 0) return reply.code(400).send({ error: "Empty file." });
    if (bytes.length > MAX_FONT_BYTES) {
      return reply.code(413).send({ error: `Font exceeds ${MAX_FONT_BYTES / (1024 * 1024)} MB limit.` });
    }
    const name = sanitizeFontName(body.filename ?? "font.woff2");
    try {
      const font = saveFont(project.dir, name, bytes);
      return { font };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  app.delete("/v1/projects/:pid/fonts/:name", async (req, reply) => {
    const { pid, name } = req.params as { pid: string; name: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    try {
      deleteFont(project.dir, name);
      return { ok: true };
    } catch (e) {
      return reply.code(404).send({ error: (e as Error).message });
    }
  });

  app.get("/v1/projects/:pid/fonts/:name", async (req, reply) => {
    const { pid, name } = req.params as { pid: string; name: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    try {
      const file = resolveFontFile(project.dir, name);
      if (!existsSync(file)) return reply.code(404).send({ error: "Font not found" });
      const buf = readFileSync(file);
      reply.header("content-type", fontMimeFromExt(name));
      reply.header("cache-control", "public, max-age=3600");
      return reply.send(buf);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  /* ----------------------- data model (schemas) ---------------------- */
  app.get("/v1/projects/:pid/schemas/:name", async (req, reply) => {
    const { pid, name } = req.params as { pid: string; name: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    const schema = project.schemas[name];
    if (!schema) return reply.code(404).send({ error: `Datasource "${name}" has no schema` });
    return { name, schema, path: schemaPath(project, name) };
  });

  // Infer a JSON Schema from an example payload ("JSON-first" authoring).
  app.post("/v1/projects/:pid/schema/infer", async (req, reply) => {
    const { pid } = req.params as { pid: string };
    if (!loadOr404(workspace, pid, reply)) return;
    const body = req.body as { sample?: unknown; title?: string; rootId?: string; required?: "present" | "none" };
    const schema = inferSchema(body.sample, {
      title: body.title,
      rootId: body.rootId,
      required: body.required,
    });
    return { schema };
  });

  // Persist an edited schema back to the project's schema file.
  app.put("/v1/projects/:pid/schemas/:name", async (req, reply) => {
    const { pid, name } = req.params as { pid: string; name: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    const body = req.body as { schema?: unknown };
    if (body.schema == null || typeof body.schema !== "object") {
      return reply.code(400).send({ error: "Body must include a `schema` object." });
    }
    const check = isCompilableSchema(body.schema);
    if (!check.ok) {
      return reply.code(400).send({ error: `Schema is not valid JSON Schema: ${check.error}` });
    }
    const rel = schemaPath(project, name);
    if (!rel) {
      return reply.code(404).send({ error: `Datasource "${name}" is not declared in lw-project.yaml.` });
    }
    const abs = join(project.dir, rel);
    const text = JSON.stringify(body.schema, null, 2) + "\n";
    writeFileSync(abs, text, "utf8");
    recordSnapshot(project.dir, { path: rel, content: text, label: `Saved schema · ${name}` });
    return { ok: true, path: rel };
  });

  // Validate an example payload against a candidate schema (live, unsaved).
  app.post("/v1/projects/:pid/schema/check", async (req, reply) => {
    const { pid } = req.params as { pid: string };
    if (!loadOr404(workspace, pid, reply)) return;
    const body = req.body as { schema?: unknown; sample?: unknown; name?: string };
    const compileCheck = isCompilableSchema(body.schema);
    if (!compileCheck.ok) {
      return { ok: false, diagnostics: [{ severity: "error", code: "SCHEMA_INVALID", message: compileCheck.error ?? "Invalid schema" }] };
    }
    const res = validateData(body.schema as JSONSchema, body.sample, body.name ?? "DATA");
    return { ok: res.valid, diagnostics: res.diagnostics };
  });

  /* ------------------------ reference search ------------------------- */
  app.get("/v1/projects/:pid/references", async (req, reply) => {
    const { pid } = req.params as { pid: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    return { blocks: findReferences(project) };
  });

  /* --------------------------- AI context ---------------------------- */
  app.get("/v1/projects/:pid/ai/context", async (req, reply) => {
    const { pid } = req.params as { pid: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    return {
      project: project.manifest.name,
      validationProfile: project.manifest.validation?.profile ?? "standard",
      dataSources: project.schemas,
      templates: Object.values(project.templates).map((t) => ({
        id: t.id,
        meta: t.doc.meta,
        locked: findLockedNodeIds(t.doc),
      })),
      blocks: [...project.blocks.keys()],
      irVersion: "0.1",
    };
  });

  /* ----------------------------- preview ----------------------------- */
  app.post("/v1/projects/:pid/preview", async (req, reply) => {
    const { pid } = req.params as { pid: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    const body = req.body as ComposeBody;
    let doc: LwDocument;
    try {
      doc = resolveDoc(project, body);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
    const result = compose({
      template: doc,
      dataSources: body.dataSources ?? {},
      blocks: project.blocks,
      theme: project.theme,
      locale: (body.dataSources?.["DATA"] as { locale?: string } | undefined)?.locale,
      fullDocument: body.output?.fullDocument ?? true,
      pageLayout: body.pageLayout,
    });
    return {
      html: injectFontsIntoHtml(embedAssetsInHtml(result.html, project.dir), project.dir),
      warnings: result.warnings,
      meta: doc.meta,
    };
  });

  /* ---------------------------- validate ----------------------------- */
  app.post("/v1/projects/:pid/validate", async (req, reply) => {
    const { pid } = req.params as { pid: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    const body = req.body as ComposeBody;
    let doc: LwDocument;
    try {
      doc = resolveDoc(project, body);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
    const diagnostics = validateTemplate(doc, project);
    if (body.dataSources) {
      const dataRes = validateDataSources(project.schemas, body.dataSources);
      diagnostics.push(...dataRes.diagnostics);
    }
    return { ok: diagnostics.every((d) => d.severity !== "error"), diagnostics };
  });

  /* ----------------------------- compose ----------------------------- */
  app.post("/v1/projects/:pid/compose", async (req, reply) => {
    const { pid } = req.params as { pid: string };
    const project = loadOr404(workspace, pid, reply);
    if (!project) return;
    const body = req.body as ComposeBody;
    let doc: LwDocument;
    try {
      doc = resolveDoc(project, body);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
    const pageLayout = resolvePageLayout(doc, body.pageLayout);
    const result = compose({
      template: doc,
      dataSources: body.dataSources ?? {},
      blocks: project.blocks,
      theme: project.theme,
      locale: (body.dataSources?.["DATA"] as { locale?: string } | undefined)?.locale,
      fullDocument: true,
      pageLayout: body.pageLayout,
    });
    const html = injectFontsIntoHtml(embedAssetsInHtml(result.html, project.dir), project.dir);
    const format = body.output?.format ?? "html";

    if (format === "pdf") {
      try {
        const pdf = await renderPdf(html, pageLayoutToPdfOptions(pageLayout));
        const instance = documents.create({
          projectId: pid,
          templateId: doc.meta.id,
          format,
          metadata: body.metadata ?? {},
          bytes: pdf.length,
        });
        reply.header("content-type", "application/pdf");
        reply.header("content-disposition", `inline; filename="${doc.meta.id}.pdf"`);
        reply.header("x-lw-document-id", instance.id);
        return reply.send(pdf);
      } catch (e) {
        if (e instanceof PdfUnavailableError) {
          return reply.code(503).send({ error: e.message, code: "PDF_ENGINE_UNAVAILABLE" });
        }
        throw e;
      }
    }

    const instance = documents.create({
      projectId: pid,
      templateId: doc.meta.id,
      format,
      metadata: body.metadata ?? {},
      bytes: html.length,
    });
    reply.header("x-lw-document-id", instance.id);
    return { documentId: instance.id, html, warnings: result.warnings };
  });

  /* ---------------------------- documents ---------------------------- */
  app.get("/v1/documents/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const doc = documents.get(id);
    if (!doc) return reply.code(404).send({ error: "Document not found" });
    return doc;
  });

  return app;
}

function loadOr404(ws: Workspace, pid: string, reply: import("fastify").FastifyReply): LoadedProject | null {
  try {
    return ws.get(pid);
  } catch (e) {
    reply.code(404).send({ error: (e as Error).message });
    return null;
  }
}

/** Relative path of a datasource's schema file from the manifest, if declared. */
function schemaPath(project: LoadedProject, name: string): string | null {
  const sources = project.manifest.dataSources ?? [{ name: "DATA", schema: "schemas/DATA.schema.json" }];
  const entry = sources.find((d) => d.name === name);
  return entry ? entry.schema : null;
}

function resolveDoc(project: LoadedProject, body: ComposeBody): LwDocument {
  if (body.source) return parseLw(body.source);
  if (body.templateId) {
    const tpl = project.templates[body.templateId];
    if (!tpl) throw new Error(`Template "${body.templateId}" not found`);
    return tpl.doc;
  }
  throw new Error("Provide either `source` (.lw) or `templateId`.");
}
