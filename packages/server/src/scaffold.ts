import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import type { ProjectManifest } from "@lw-text/project";
import type { ProjectSummary } from "./workspace.js";

export function sanitizeProjectId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "new-project";
}

/** Scaffold a new lw-text project directory inside the workspace. */
export function scaffoldProject(
  workspaceRoot: string,
  opts: { id?: string; name?: string; kind?: "application" | "framework" },
): ProjectSummary {
  const id = sanitizeProjectId(opts.id ?? opts.name ?? "new-project");
  const dir = join(workspaceRoot, id);
  if (existsSync(dir)) {
    throw new Error(`Project folder "${id}" already exists`);
  }

  const displayName = opts.name?.trim() || id;
  mkdirSync(join(dir, "templates"), { recursive: true });
  mkdirSync(join(dir, "schemas"), { recursive: true });
  mkdirSync(join(dir, "fixtures"), { recursive: true });
  mkdirSync(join(dir, "blocks"), { recursive: true });
  mkdirSync(join(dir, "assets"), { recursive: true });
  mkdirSync(join(dir, "fonts"), { recursive: true });

  const isFramework = opts.kind === "framework";

  const manifest: ProjectManifest = {
    name: displayName,
    version: 1,
    kind: isFramework ? "framework" : "application",
    validation: { profile: "strict" },
    dataSources: isFramework
      ? [{ name: "COMMON", schema: "schemas/COMMON.schema.json" }]
      : [{ name: "DATA", schema: "schemas/DATA.schema.json" }],
    exports: isFramework ? { blocks: true, schemas: true } : undefined,
    theme: {
      tokens: isFramework
        ? { "color-border": "#e2e8f0", "color-muted": "#64748b" }
        : { "color-brand": "#4f46e5", "color-text": "#0f172a" },
    },
    dependencies: [],
  };
  writeFileSync(join(dir, "lw-project.yaml"), stringifyYaml(manifest), "utf8");

  if (isFramework) {
    writeFileSync(
      join(dir, "schemas/COMMON.schema.json"),
      JSON.stringify(
        {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          $id: `https://lw-text.dev/schemas/${id}/COMMON.json`,
          title: "COMMON",
          description: "Shared fields for reusable building blocks.",
          type: "object",
          properties: {
            seller: {
              type: "object",
              properties: {
                name: { type: "string" },
                vatId: { type: "string" },
                iban: { type: "string" },
              },
            },
          },
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    writeFileSync(
      join(dir, "blocks/legal-footer.lw"),
      `<template id="blocks/legal-footer" version="1.0.0" data-sources="DATA" ai-editable="false">
  <footer id="legal" class="muted" style="margin-top:16px;border-top:1px solid var(--color-border);padding-top:8px;font-size:8.5pt">
    <p>{{ DATA.seller.name }} — VAT {{ DATA.seller.vatId }}</p>
    <p>Generated electronically; valid without signature.</p>
  </footer>
</template>
`,
      "utf8",
    );
  } else {
    writeFileSync(
      join(dir, "schemas/DATA.schema.json"),
      JSON.stringify(
        {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          $id: `https://lw-text.dev/schemas/${id}/DATA.json`,
          title: "DATA",
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
          },
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    const templateId = "document";
    writeFileSync(
      join(dir, `templates/${templateId}.lw`),
      `<template id="${templateId}" version="1.0.0" data-sources="DATA" output-modes="html,pdf">
  <section id="main">
    <h1>{{ DATA.title }}</h1>
    <p data-bind="DATA.description" format="plain" />
    <p data-block="blocks/legal-footer"></p>
  </section>
</template>
`,
      "utf8",
    );

    writeFileSync(
      join(dir, "fixtures/document.json"),
      JSON.stringify({ DATA: { title: "Sample document", description: "Edit this test data in Studio." } }, null, 2) + "\n",
      "utf8",
    );
  }

  return { id, dir, name: displayName, kind: manifest.kind };
}
