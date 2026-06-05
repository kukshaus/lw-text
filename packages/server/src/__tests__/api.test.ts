import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../app.js";

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(here, "../../../../examples");

describe("lw-text API", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = buildServer({ workspaceRoot });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("reports health", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ok");
  });

  it("lists projects", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/projects" });
    const ids = res.json().projects.map((p: { id: string }) => p.id);
    expect(ids).toContain("acme-insurance");
    expect(ids).toContain("acme-common");
  });

  it("uploads project files via explorer endpoint", async () => {
    const filename = `uploaded-doc-${Date.now()}.lw`;
    const lw = Buffer.from(
      `<template id="uploaded" version="1.0.0" data-sources="DATA"><p>{{ DATA.x }}</p></template>\n`,
    ).toString("base64");
    const res = await app.inject({
      method: "POST",
      url: "/v1/projects/acme-insurance/files/upload",
      payload: {
        folder: "templates",
        files: [{ filename, data: lw }],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().uploaded.length).toBe(1);
    expect(res.json().uploaded[0].path).toBe(`templates/${filename}`);
  });

  it("creates and saves a test case", async () => {
    const id = `tc-test-${Date.now()}`;
    const createRes = await app.inject({
      method: "POST",
      url: "/v1/projects/acme-insurance/test-cases",
      payload: {
        templateId: "invoice",
        title: "API test case",
        caseId: id,
        copyFromKey: "invoice",
      },
    });
    expect(createRes.statusCode).toBe(200);
    const key = createRes.json().key as string;
    expect(key).toContain(id);

    const saveRes = await app.inject({
      method: "PUT",
      url: `/v1/projects/acme-insurance/test-cases/${key}`,
      payload: { dataSources: { DATA: { title: "mutated" } } },
    });
    expect(saveRes.statusCode).toBe(200);

    const delRes = await app.inject({
      method: "DELETE",
      url: `/v1/projects/acme-insurance/test-cases/${key}`,
    });
    expect(delRes.statusCode).toBe(200);
  });

  it("resolves framework blocks for acme-insurance", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/projects/acme-insurance" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.dependencies).toHaveLength(1);
    expect(body.dependencies[0].id).toBe("acme-common");
    expect(body.frameworkBlocks.some((b: { ref: string }) => b.ref === "blocks/legal-footer")).toBe(true);
    expect(body.schemas).toContain("COMMON");
  });

  it("returns a template with IR and a locked-node list", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/projects/acme-insurance/templates/invoice" });
    expect(res.statusCode).toBe(200);
    expect(res.json().meta.id).toBe("invoice");
    // Locked legal content lives in the reusable block, so the template's own
    // locked list is empty — the API still returns the array.
    expect(Array.isArray(res.json().locked)).toBe(true);
  });

  it("composes to HTML and stores a document instance", async () => {
    const fixtureRes = await app.inject({ method: "GET", url: "/v1/projects/acme-insurance/fixtures/invoice" });
    const data = fixtureRes.json();
    const res = await app.inject({
      method: "POST",
      url: "/v1/projects/acme-insurance/compose",
      payload: { templateId: "invoice", dataSources: data, output: { format: "html" } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.html).toContain("Globex GmbH");
    expect(body.documentId).toBeTruthy();

    const docRes = await app.inject({ method: "GET", url: `/v1/documents/${body.documentId}` });
    expect(docRes.json().templateId).toBe("invoice");
  });

  it("validates an ad-hoc source with unknown bindings", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/projects/acme-insurance/validate",
      payload: { source: `<template id="t" data-sources="DATA"><p>{{ DATA.nope }}</p></template>` },
    });
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.diagnostics.some((d: { code: string }) => d.code === "BINDING_UNKNOWN")).toBe(true);
  });

  it("serves AI context", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/projects/acme-insurance/ai/context" });
    const body = res.json();
    expect(body.dataSources.DATA).toBeDefined();
    expect(body.irVersion).toBe("0.1");
  });

  it("duplicates, renames, and deletes a project", async () => {
    const base = `pm-${Date.now()}`;
    const createRes = await app.inject({
      method: "POST",
      url: "/v1/projects",
      payload: { id: base, name: "PM Test", kind: "application" },
    });
    expect(createRes.statusCode).toBe(200);

    const dupRes = await app.inject({
      method: "POST",
      url: `/v1/projects/${base}/duplicate`,
      payload: { name: "PM Copy", id: `${base}-copy` },
    });
    expect(dupRes.statusCode).toBe(200);
    expect(dupRes.json().project.id).toBe(`${base}-copy`);

    const renameRes = await app.inject({
      method: "PATCH",
      url: `/v1/projects/${base}-copy`,
      payload: { name: "PM Renamed", newId: `${base}-renamed` },
    });
    expect(renameRes.statusCode).toBe(200);
    expect(renameRes.json().project.id).toBe(`${base}-renamed`);

    const delRes = await app.inject({
      method: "DELETE",
      url: `/v1/projects/${base}-renamed`,
    });
    expect(delRes.statusCode).toBe(200);

    const delBase = await app.inject({ method: "DELETE", url: `/v1/projects/${base}` });
    expect(delBase.statusCode).toBe(200);
  });

  it("creates a new project in the workspace", async () => {
    const id = `studio-test-${Date.now()}`;
    const res = await app.inject({
      method: "POST",
      url: "/v1/projects",
      payload: { id, name: "Studio Test Project" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().project.id).toBe(id);
    const list = await app.inject({ method: "GET", url: "/v1/projects" });
    expect(list.json().projects.some((p: { id: string }) => p.id === id)).toBe(true);
  });

  it("lists project files and creates a template", async () => {
    const treeRes = await app.inject({ method: "GET", url: "/v1/projects/acme-insurance/files" });
    expect(treeRes.statusCode).toBe(200);
    const folders = treeRes.json().folders as { id: string }[];
    expect(folders.some((f) => f.id === "templates")).toBe(true);

    const tpl = `explorer-test-${Date.now()}`;
    const createRes = await app.inject({
      method: "POST",
      url: "/v1/projects/acme-insurance/files",
      payload: { folder: "templates", name: tpl },
    });
    expect(createRes.statusCode).toBe(200);
    expect(createRes.json().file.path).toBe(`templates/${tpl}.lw`);

    const readRes = await app.inject({
      method: "GET",
      url: `/v1/projects/acme-insurance/files/content?path=templates/${tpl}.lw`,
    });
    expect(readRes.statusCode).toBe(200);
    expect(readRes.json().content).toContain(`id="${tpl}"`);
  });

  it("uploads, serves, embeds and deletes project assets", async () => {
    const PNG_1x1 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

    const up = await app.inject({
      method: "POST",
      url: "/v1/projects/acme-insurance/assets",
      payload: { filename: "test-pixel.png", data: PNG_1x1 },
    });
    expect(up.statusCode).toBe(200);
    expect(up.json().asset.path).toBe("assets/test-pixel.png");

    const list = await app.inject({ method: "GET", url: "/v1/projects/acme-insurance/assets" });
    expect(list.json().assets.some((a: { name: string }) => a.name === "test-pixel.png")).toBe(true);

    const file = await app.inject({ method: "GET", url: "/v1/projects/acme-insurance/assets/test-pixel.png" });
    expect(file.statusCode).toBe(200);
    expect(file.headers["content-type"]).toBe("image/png");

    const preview = await app.inject({
      method: "POST",
      url: "/v1/projects/acme-insurance/preview",
      payload: {
        source: `<template id="t" data-sources="DATA"><img src="assets/test-pixel.png" alt="x" /></template>`,
        dataSources: { DATA: {} },
      },
    });
    expect(preview.json().html).toContain("data:image/png;base64,");

    const del = await app.inject({
      method: "DELETE",
      url: "/v1/projects/acme-insurance/assets/test-pixel.png",
    });
    expect(del.statusCode).toBe(200);
  });

  it("records version history on save and restores a snapshot", async () => {
    const name = `history-test-${Date.now()}`;
    const path = `templates/${name}.lw`;
    const v1 = `<template id="history-test" data-sources="DATA"><p>v1</p></template>`;
    const v2 = `<template id="history-test" data-sources="DATA"><p>v2</p></template>`;

    const createRes = await app.inject({
      method: "POST",
      url: "/v1/projects/acme-insurance/files",
      payload: { folder: "templates", name },
    });
    expect(createRes.statusCode).toBe(200);
    expect(createRes.json().file.path).toBe(path);

    const save1 = await app.inject({
      method: "PUT",
      url: "/v1/projects/acme-insurance/files/content",
      payload: { path, content: v1, historyLabel: "Version one" },
    });
    expect(save1.statusCode).toBe(200);

    const listAfterV1 = await app.inject({
      method: "GET",
      url: `/v1/projects/acme-insurance/history?path=${encodeURIComponent(path)}`,
    });
    const v1Entry = listAfterV1.json().entries[0] as { id: string };
    expect(v1Entry).toBeDefined();

    const save2 = await app.inject({
      method: "PUT",
      url: "/v1/projects/acme-insurance/files/content",
      payload: { path, content: v2, historyLabel: "Second save" },
    });
    expect(save2.statusCode).toBe(200);

    const restoreRes = await app.inject({
      method: "POST",
      url: `/v1/projects/acme-insurance/history/${v1Entry.id}/restore`,
    });
    expect(restoreRes.statusCode).toBe(200);
    expect(restoreRes.json().snapshot.content).toBe(v1);

    const readRes = await app.inject({
      method: "GET",
      url: `/v1/projects/acme-insurance/files/content?path=${encodeURIComponent(path)}`,
    });
    expect(readRes.json().content).toBe(v1);
  });
});
