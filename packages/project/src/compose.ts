import { compose, type ComposeResult } from "@lw-text/engine";
import type { LoadedProject } from "./types.js";

export interface ProjectComposeOptions {
  locale?: string;
  currency?: string;
  fullDocument?: boolean;
}

/**
 * Compose a project template to HTML using project blocks, theme and schemas.
 * Locale defaults to DATA.locale when present.
 */
export function composeTemplate(
  project: LoadedProject,
  templateId: string,
  dataSources: Record<string, unknown>,
  opts: ProjectComposeOptions = {},
): ComposeResult {
  const tpl = project.templates[templateId];
  if (!tpl) {
    throw new Error(
      `Template "${templateId}" not found. Available: ${Object.keys(project.templates).join(", ") || "(none)"}`,
    );
  }
  const data = dataSources["DATA"] as { locale?: string } | undefined;
  return compose({
    template: tpl.doc,
    dataSources,
    blocks: project.blocks,
    theme: project.theme,
    locale: opts.locale ?? data?.locale,
    currency: opts.currency,
    fullDocument: opts.fullDocument,
  });
}
