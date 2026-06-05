import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { recordSnapshot } from "./history.js";

export interface TestCaseMeta {
  title?: string;
  description?: string;
  default?: boolean;
  template?: string;
}

export interface CreateTestCaseInput {
  templateId: string;
  caseId?: string;
  title: string;
  description?: string;
  copyFromKey?: string;
  dataSources?: Record<string, unknown>;
  isDefault?: boolean;
}

export interface SaveTestCaseInput {
  dataSources: Record<string, unknown>;
  title?: string;
  description?: string;
}

function sanitizeCaseId(raw: string): string {
  return (
    raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "case"
  );
}

export function fixtureKey(templateId: string, caseId: string): string {
  const id = caseId === "default" ? "default" : sanitizeCaseId(caseId);
  return id === "default" ? templateId : `${templateId}.${id}`;
}

function fixturePath(projectDir: string, key: string): string {
  return join(projectDir, "fixtures", `${key}.json`);
}

function readFixture(projectDir: string, key: string): Record<string, unknown> {
  const path = fixturePath(projectDir, key);
  if (!existsSync(path)) throw new Error(`Test case "${key}" not found`);
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function extractDataSources(raw: Record<string, unknown>): Record<string, unknown> {
  const env = raw as { lwTestCase?: unknown; dataSources?: Record<string, unknown> };
  if (env.lwTestCase != null && env.dataSources != null) return env.dataSources;
  return raw;
}

function extractMeta(raw: Record<string, unknown>): TestCaseMeta {
  const env = raw as { lwTestCase?: TestCaseMeta };
  return env.lwTestCase ?? {};
}

function writeFixture(
  projectDir: string,
  key: string,
  dataSources: Record<string, unknown>,
  meta: TestCaseMeta,
): void {
  const useEnvelope = meta.title != null || meta.description != null || meta.default != null || meta.template != null;
  const body = useEnvelope
    ? { lwTestCase: meta, dataSources }
    : dataSources;
  const rel = `fixtures/${key}.json`;
  const text = JSON.stringify(body, null, 2) + "\n";
  writeFileSync(fixturePath(projectDir, key), text, "utf8");
  recordSnapshot(projectDir, { path: rel, content: text, source: "save", label: meta.title ? `Saved · ${meta.title}` : "Saved" });
}

/** Create a new fixture / named test case for a template. */
export function createTestCase(projectDir: string, input: CreateTestCaseInput): { key: string } {
  const templateId = input.templateId.trim();
  if (!templateId) throw new Error("templateId is required");

  const caseId = input.caseId ? sanitizeCaseId(input.caseId) : sanitizeCaseId(input.title);
  if (caseId === "default" && !input.isDefault) {
    throw new Error('Reserved id "default" — pick another case id or mark as default.');
  }

  const key = fixtureKey(templateId, input.isDefault ? "default" : caseId);
  const path = fixturePath(projectDir, key);
  if (existsSync(path)) throw new Error(`Test case "${key}" already exists`);

  let dataSources = input.dataSources;
  if (!dataSources && input.copyFromKey) {
    dataSources = extractDataSources(readFixture(projectDir, input.copyFromKey));
  }
  if (!dataSources) {
    dataSources = { DATA: {} };
  }

  writeFixture(projectDir, key, dataSources, {
    title: input.title.trim() || (caseId === "default" ? "Default" : caseId),
    description: input.description?.trim(),
    default: input.isDefault ?? caseId === "default",
    template: templateId,
  });

  return { key };
}

/** Persist test-case data (keeps envelope metadata when present). */
export function saveTestCase(projectDir: string, key: string, input: SaveTestCaseInput): void {
  const existing = readFixture(projectDir, key);
  const meta = extractMeta(existing);
  if (input.title !== undefined) meta.title = input.title.trim();
  if (input.description !== undefined) meta.description = input.description.trim();
  writeFixture(projectDir, key, input.dataSources, meta);
}

/** Remove a non-default test case fixture. */
export function deleteTestCase(projectDir: string, key: string): void {
  const dot = key.indexOf(".");
  const isDefault = dot < 0;
  if (isDefault) throw new Error("Cannot delete the default test case for a template.");
  const path = fixturePath(projectDir, key);
  if (!existsSync(path)) throw new Error(`Test case "${key}" not found`);
  unlinkSync(path);
}
