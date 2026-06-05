import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadProject, validateProject, composeTemplate } from "../index.js";

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(here, "../../../../examples");

describe("framework dependencies", () => {
  it("loads shared blocks from acme-common", () => {
    const project = loadProject(join(examplesDir, "acme-insurance"), { workspaceRoot: examplesDir });
    expect(project.resolvedDependencies).toHaveLength(1);
    expect(project.resolvedDependencies[0]!.id).toBe("acme-common");
    expect(project.blocks.has("blocks/legal-footer")).toBe(true);
    expect(project.blockOrigins.get("blocks/legal-footer")?.fromProject).toBe("acme-common");
  });

  it("imports COMMON schema from framework", () => {
    const project = loadProject(join(examplesDir, "acme-insurance"), { workspaceRoot: examplesDir });
    const common = project.schemas.COMMON;
    expect(common).toBeDefined();
    expect(common!.properties?.seller).toBeDefined();
  });

  it("composes invoice with framework footer", () => {
    const project = loadProject(join(examplesDir, "acme-insurance"), { workspaceRoot: examplesDir });
    const data = project.fixtures["invoice"]!;
    const { html } = composeTemplate(project, "invoice", data);
    expect(html).toContain("valid without signature");
    expect(html).toContain("DE89 3704 0044 0532 0130 00");
  });

  it("validates when framework block is present", () => {
    const project = loadProject(join(examplesDir, "acme-insurance"), { workspaceRoot: examplesDir });
    const errors = (validateProject(project)["invoice"] ?? []).filter((d) => d.severity === "error");
    expect(errors).toEqual([]);
  });

  it("loads acme-common as a framework project", () => {
    const fw = loadProject(join(examplesDir, "acme-common"), { workspaceRoot: examplesDir });
    expect(fw.kind).toBe("framework");
    expect(fw.blocks.has("blocks/legal-footer")).toBe(true);
  });
});
