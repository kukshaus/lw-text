import type { Node } from "@lw-text/engine";
import type { LoadedProject } from "./types.js";

/** A single consumer of a building block. */
export interface BlockConsumer {
  /** id of the template or block that references the block. */
  id: string;
  kind: "template" | "block";
  /** The literal `ref` string used at the reference site. */
  ref: string;
}

/** Where-used result for one building block. */
export interface BlockReference {
  /** Canonical block key (e.g. "blocks/legal-footer"). */
  block: string;
  /** Templates and blocks that reference it. */
  usedBy: BlockConsumer[];
  /** True when more than one resource depends on the block. */
  shared: boolean;
}

function walk(nodes: Node[], cb: (n: Node) => void): void {
  for (const n of nodes) {
    cb(n);
    if (n.type === "element" || n.type === "if" || n.type === "repeat") {
      walk(n.children, cb);
      if (n.type === "if" && n.otherwise) walk(n.otherwise, cb);
    }
  }
}

/** All block references (`<… data-block>`) reachable from a node tree. */
export function collectBlockRefs(nodes: Node[]): string[] {
  const refs: string[] = [];
  walk(nodes, (n) => {
    if (n.type === "blockRef") refs.push(n.ref);
  });
  return refs;
}

/**
 * Build the "where-used" graph for every building block in a project.
 *
 * Mirrors M/TEXT Content Hub's reference search: before editing a shared
 * block, an author can see which templates (and other blocks) it affects.
 * Blocks reachable under more than one resource are flagged `shared`.
 */
export function findReferences(project: LoadedProject): BlockReference[] {
  // The loader registers each block under several keys (path + meta id) that
  // point to the *same* node array. Pick a canonical key per node array.
  const canonicalByNodes = new Map<Node[], string>();
  for (const [key, nodes] of project.blocks) {
    const existing = canonicalByNodes.get(nodes);
    if (!existing || (key.startsWith("blocks/") && !existing.startsWith("blocks/"))) {
      canonicalByNodes.set(nodes, key);
    }
  }
  const resolve = (ref: string): string => {
    const nodes = project.blocks.get(ref);
    return nodes ? (canonicalByNodes.get(nodes) ?? ref) : ref;
  };

  const usage = new Map<string, BlockConsumer[]>();
  const ensure = (block: string): BlockConsumer[] => {
    let list = usage.get(block);
    if (!list) usage.set(block, (list = []));
    return list;
  };
  // Seed every canonical block so zero-usage (orphan) blocks still surface.
  for (const canon of new Set(canonicalByNodes.values())) ensure(canon);

  const addEdges = (id: string, kind: BlockConsumer["kind"], nodes: Node[]): void => {
    for (const ref of collectBlockRefs(nodes)) ensure(resolve(ref)).push({ id, kind, ref });
  };

  for (const t of Object.values(project.templates)) addEdges(t.id, "template", t.doc.nodes);

  const seen = new Set<Node[]>();
  for (const [key, nodes] of project.blocks) {
    if (seen.has(nodes)) continue;
    seen.add(nodes);
    addEdges(canonicalByNodes.get(nodes) ?? key, "block", nodes);
  }

  return [...usage.entries()]
    .map(([block, usedBy]) => ({ block, usedBy, shared: usedBy.length > 1 }))
    .sort((a, b) => a.block.localeCompare(b.block));
}

/** Canonical block keys referenced (directly) by a given template. */
export function blocksUsedByTemplate(project: LoadedProject, templateId: string): string[] {
  const tpl = project.templates[templateId];
  if (!tpl) return [];
  const canonicalByNodes = new Map<Node[], string>();
  for (const [key, nodes] of project.blocks) {
    const existing = canonicalByNodes.get(nodes);
    if (!existing || (key.startsWith("blocks/") && !existing.startsWith("blocks/"))) {
      canonicalByNodes.set(nodes, key);
    }
  }
  const resolve = (ref: string): string => {
    const nodes = project.blocks.get(ref);
    return nodes ? (canonicalByNodes.get(nodes) ?? ref) : ref;
  };
  return [...new Set(collectBlockRefs(tpl.doc.nodes).map(resolve))];
}
