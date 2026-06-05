import { randomUUID } from "node:crypto";

export interface DocumentInstance {
  id: string;
  projectId: string;
  templateId: string;
  format: string;
  createdAt: string;
  metadata: Record<string, unknown>;
  bytes: number;
}

/**
 * In-memory document instance store. The architecture keeps this behind an
 * interface so it can be swapped for PostgreSQL + object storage without
 * touching the routes (see PRD §8). For local/dev it is fully functional.
 */
export interface DocumentStore {
  create(doc: Omit<DocumentInstance, "id" | "createdAt">): DocumentInstance;
  get(id: string): DocumentInstance | undefined;
  list(projectId?: string): DocumentInstance[];
}

export class InMemoryDocumentStore implements DocumentStore {
  private readonly map = new Map<string, DocumentInstance>();

  create(doc: Omit<DocumentInstance, "id" | "createdAt">): DocumentInstance {
    const instance: DocumentInstance = { id: randomUUID(), createdAt: new Date().toISOString(), ...doc };
    this.map.set(instance.id, instance);
    return instance;
  }
  get(id: string): DocumentInstance | undefined {
    return this.map.get(id);
  }
  list(projectId?: string): DocumentInstance[] {
    const all = [...this.map.values()];
    return projectId ? all.filter((d) => d.projectId === projectId) : all;
  }
}
