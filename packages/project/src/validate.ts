import type { LwDocument, Node } from "@lw-text/engine";
import { validateTemplateBindings, type Diagnostic } from "@lw-text/schema";
import type { LoadedProject } from "./types.js";

/** Walk every node, invoking cb. */
function walkNodes(nodes: Node[], cb: (n: Node) => void): void {
  for (const n of nodes) {
    cb(n);
    if (n.type === "element" || n.type === "if" || n.type === "repeat") {
      walkNodes(n.children, cb);
      if (n.type === "if" && n.otherwise) walkNodes(n.otherwise, cb);
    }
  }
}

/** Validate a single template against the project's schemas and blocks. */
export function validateTemplate(doc: LwDocument, project: LoadedProject): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // 1. Bindings against schemas
  diagnostics.push(...validateTemplateBindings(doc, project.schemas));

  // 2. Unresolved block references
  walkNodes(doc.nodes, (n) => {
    if (n.type === "blockRef" && !project.blocks.has(n.ref)) {
      diagnostics.push({
        severity: "error",
        code: "BLOCK_UNRESOLVED",
        message: `Block reference "${n.ref}" could not be resolved.`,
        loc: n.loc,
        hint: "Add the block under blocks/, link a framework project in lw-project.yaml dependencies, or declare a package dependency.",
      });
    }
  });

  // 3. Declared datasources must have schemas in strict mode
  if (project.manifest.validation?.profile === "strict") {
    for (const ds of doc.meta.dataSources) {
      if (!project.schemas[ds]) {
        diagnostics.push({
          severity: "warning",
          code: "SCHEMA_MISSING",
          path: ds,
          message: `Datasource "${ds}" has no schema; bindings are unchecked.`,
          hint: `Add a schema for "${ds}" in lw-project.yaml.`,
        });
      }
    }
  }

  return diagnostics;
}

/** Validate all templates in a project. */
export function validateProject(project: LoadedProject): Record<string, Diagnostic[]> {
  const result: Record<string, Diagnostic[]> = {};
  for (const [id, t] of Object.entries(project.templates)) {
    result[id] = validateTemplate(t.doc, project);
  }
  return result;
}

/** Collect ids of AI-locked nodes (aiEditable === false). */
export function findLockedNodeIds(doc: LwDocument): string[] {
  const ids: string[] = [];
  walkNodes(doc.nodes, (n) => {
    if (n.aiEditable === false && n.id) ids.push(n.id);
  });
  return ids;
}

/**
 * Enforce that an AI-proposed template does not change locked zones.
 * Returns a diagnostic per violated locked node (matched by id).
 */
export function checkLockedZones(original: LwDocument, proposed: LwDocument): Diagnostic[] {
  const out: Diagnostic[] = [];
  const origLocked = collectLocked(original);
  const propById = collectById(proposed);
  for (const [id, node] of origLocked) {
    const proposedNode = propById.get(id);
    if (!proposedNode) {
      out.push({
        severity: "error",
        code: "AI_POLICY_VIOLATION",
        path: id,
        message: `Locked node "${id}" was removed.`,
        hint: "Restore the locked node; AI may not modify ai-editable=false content.",
      });
      continue;
    }
    if (JSON.stringify(stripLoc(node)) !== JSON.stringify(stripLoc(proposedNode))) {
      out.push({
        severity: "error",
        code: "AI_POLICY_VIOLATION",
        path: id,
        message: `Locked node "${id}" was modified.`,
        hint: "Revert changes to locked content.",
      });
    }
  }
  return out;
}

function collectLocked(doc: LwDocument): Map<string, Node> {
  const m = new Map<string, Node>();
  walkNodes(doc.nodes, (n) => {
    if (n.aiEditable === false && n.id) m.set(n.id, n);
  });
  return m;
}

function collectById(doc: LwDocument): Map<string, Node> {
  const m = new Map<string, Node>();
  walkNodes(doc.nodes, (n) => {
    if (n.id) m.set(n.id, n);
  });
  return m;
}

function stripLoc(node: Node): unknown {
  return JSON.parse(JSON.stringify(node, (k, v) => (k === "loc" ? undefined : v)));
}
