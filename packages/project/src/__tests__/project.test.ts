import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadProject, validateProject, composeTemplate, findReferences } from "../index.js";

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(here, "../../../../examples");
const exampleDir = join(examplesDir, "acme-insurance");

describe("example project", () => {
  const project = loadProject(exampleDir, { workspaceRoot: examplesDir });

  it("loads templates, schemas, blocks and fixtures", () => {
    expect(project.manifest.name).toBe("acme-insurance");
    expect(project.templates["invoice"]).toBeDefined();
    expect(project.blocks.has("blocks/legal-footer")).toBe(true);
    expect(project.fixtures["invoice"]).toBeDefined();
    expect(project.schemas["DATA"]).toBeDefined();
  });

  it("validates with no errors", () => {
    const results = validateProject(project);
    const errors = (results["invoice"] ?? []).filter((d) => d.severity === "error");
    expect(errors).toEqual([]);
  });

  it("composes the invoice to HTML", () => {
    const data = project.fixtures["invoice"]!;
    const { html, warnings } = composeTemplate(project, "invoice", data);
    expect(warnings).toEqual([]);
    expect(html).toContain("Acme Insurance AG");
    expect(html).toContain("Globex GmbH");
    expect(html).toContain("Commercial liability premium");
    // de-DE currency for gross total
    expect(html).toMatch(/3\.602,73\s*€/);
    // legal footer block resolved + IBAN grouped
    expect(html).toContain("DE89 3704 0044 0532 0130 00");
    expect(html).toContain("valid without signature");
  });

  it("discovers named test cases (default + envelope)", () => {
    const cases = project.testCases.filter((c) => c.templateId === "invoice");
    const byId = Object.fromEntries(cases.map((c) => [c.id, c]));
    expect(byId["default"]?.isDefault).toBe(true);
    expect(byId["b2c"]).toBeDefined();
    expect(byId["b2c"]!.title).toBe("B2C — no reverse charge");
    expect((byId["b2c"]!.dataSources.DATA as { customer: { type: string } }).customer.type).toBe("B2C");
  });

  it("resolves block where-used references", () => {
    const refs = findReferences(project);
    const footer = refs.find((r) => r.block === "blocks/legal-footer");
    expect(footer).toBeDefined();
    expect(footer!.usedBy.map((u) => u.id)).toContain("invoice");
  });
});
