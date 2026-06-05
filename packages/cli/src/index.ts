#!/usr/bin/env node
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import {
  loadProject,
  validateProject,
  validateTemplate,
  composeTemplate,
  renderPdf,
  PdfUnavailableError,
  type LoadedProject,
} from "@lw-text/project";
import type { Diagnostic } from "@lw-text/schema";
import { parseLw } from "@lw-text/engine";
import { c, sym } from "./ui.js";
import { createProject } from "./scaffold.js";

const program = new Command();

program
  .name("lw")
  .description("lw-text — AI-first document composition toolkit")
  .version("0.1.0");

/* ----------------------------- init ----------------------------- */
program
  .command("init")
  .argument("[dir]", "target directory", ".")
  .description("scaffold a new lw-text project")
  .action((dir: string) => {
    const target = resolve(dir);
    mkdirSync(target, { recursive: true });
    const created = createProject(target);
    if (created.length === 0) {
      console.log(`${sym.warn} Project already initialized (no files written).`);
      return;
    }
    console.log(`${sym.ok} Initialized lw-text project in ${c.cyan(target)}`);
    for (const f of created) console.log(`  ${sym.arrow} ${f}`);
    console.log(`\nNext:\n  ${c.gray("$")} lw validate ${dir}\n  ${c.gray("$")} lw preview letter --open`);
  });

/* --------------------------- validate --------------------------- */
program
  .command("validate")
  .argument("[dir]", "project directory", ".")
  .description("validate all templates against their schemas")
  .action((dir: string) => {
    const project = openProject(dir);
    const results = validateProject(project);
    let errors = 0;
    let warnings = 0;
    for (const [id, diags] of Object.entries(results)) {
      const errs = diags.filter((d) => d.severity === "error");
      const warns = diags.filter((d) => d.severity === "warning");
      errors += errs.length;
      warnings += warns.length;
      const status = errs.length ? sym.err : warns.length ? sym.warn : sym.ok;
      console.log(`${status} ${c.bold(id)} ${c.gray(`(${project.templates[id]?.path ?? ""})`)}`);
      for (const d of diags) printDiagnostic(d);
    }
    console.log(
      `\n${errors ? sym.err : sym.ok} ${Object.keys(results).length} template(s), ` +
        `${c.red(String(errors))} error(s), ${c.yellow(String(warnings))} warning(s)`,
    );
    process.exit(errors ? 1 : 0);
  });

/* ---------------------------- preview --------------------------- */
program
  .command("preview")
  .argument("<templateId>", "template id to render")
  .argument("[dir]", "project directory", ".")
  .option("-f, --fixture <name>", "fixture name (without .json)")
  .option("-d, --data <file>", "path to a data JSON file")
  .option("-o, --out <file>", "write HTML to a file (default: <templateId>.html)")
  .option("--stdout", "print HTML to stdout instead of a file")
  .description("compose a template to HTML")
  .action((templateId: string, dir: string, opts: PreviewOpts) => {
    const project = openProject(dir);
    const data = resolveData(project, opts);
    const { html, warnings } = composeTemplate(project, templateId, data);
    warnings.forEach((w) => console.error(`${sym.warn} ${c.yellow(w)}`));
    if (opts.stdout) {
      process.stdout.write(html);
      return;
    }
    const out = resolve(dir, opts.out ?? `${templateId}.html`);
    writeFileSync(out, html, "utf8");
    console.log(`${sym.ok} Wrote ${c.cyan(out)} (${html.length.toLocaleString()} bytes)`);
  });

/* ---------------------------- compose --------------------------- */
program
  .command("compose")
  .argument("<templateId>", "template id to render")
  .argument("[dir]", "project directory", ".")
  .requiredOption("-d, --data <file>", "path to a data JSON file")
  .option("-f, --format <fmt>", "output format: html | pdf", "pdf")
  .option("-o, --out <file>", "output file path")
  .description("compose a template to HTML or PDF")
  .action(async (templateId: string, dir: string, opts: ComposeOpts) => {
    const project = openProject(dir);
    const data = resolveData(project, { data: opts.data });
    const { html, warnings } = composeTemplate(project, templateId, data);
    warnings.forEach((w) => console.error(`${sym.warn} ${c.yellow(w)}`));

    if (opts.format === "html") {
      const out = resolve(dir, opts.out ?? `${templateId}.html`);
      writeFileSync(out, html, "utf8");
      console.log(`${sym.ok} Wrote ${c.cyan(out)}`);
      return;
    }
    // PDF
    try {
      const pdf = await renderPdf(html);
      const out = resolve(dir, opts.out ?? `${templateId}.pdf`);
      writeFileSync(out, pdf);
      console.log(`${sym.ok} Wrote ${c.cyan(out)} (${pdf.length.toLocaleString()} bytes)`);
    } catch (e) {
      if (e instanceof PdfUnavailableError) {
        console.error(`${sym.err} ${e.message}`);
        process.exit(2);
      }
      throw e;
    }
  });

/* ----------------------------- check ---------------------------- */
program
  .command("check")
  .argument("<file>", "a single .lw template file")
  .argument("[dir]", "project directory for schemas", ".")
  .description("validate one template file and print JSON diagnostics (for agents)")
  .action((file: string, dir: string) => {
    const project = openProject(dir);
    const doc = parseLw(readFileSync(resolve(file), "utf8"));
    const diags = validateTemplate(doc, project);
    process.stdout.write(JSON.stringify({ ok: diags.every((d) => d.severity !== "error"), diagnostics: diags }, null, 2));
    process.exit(diags.some((d) => d.severity === "error") ? 1 : 0);
  });

program.parseAsync().catch((e) => {
  console.error(`${sym.err} ${(e as Error).message}`);
  process.exit(1);
});

/* --------------------------- helpers --------------------------- */
interface PreviewOpts {
  fixture?: string;
  data?: string;
  out?: string;
  stdout?: boolean;
}
interface ComposeOpts {
  data: string;
  format: "html" | "pdf";
  out?: string;
}

function openProject(dir: string): LoadedProject {
  try {
    return loadProject(resolve(dir));
  } catch (e) {
    console.error(`${sym.err} ${(e as Error).message}`);
    process.exit(1);
  }
}

function resolveData(project: LoadedProject, opts: { fixture?: string; data?: string }): Record<string, unknown> {
  if (opts.data) {
    return JSON.parse(readFileSync(resolve(opts.data), "utf8")) as Record<string, unknown>;
  }
  if (opts.fixture) {
    const fx = project.fixtures[opts.fixture];
    if (!fx) {
      console.error(`${sym.err} Fixture "${opts.fixture}" not found.`);
      process.exit(1);
    }
    return fx;
  }
  // Use the first available fixture, else empty.
  const first = Object.values(project.fixtures)[0];
  if (first) return first;
  return { DATA: {} };
}

function printDiagnostic(d: Diagnostic): void {
  const tag = d.severity === "error" ? c.red(d.code) : c.yellow(d.code);
  const loc = d.loc ? c.gray(` @${d.loc.line}:${d.loc.col}`) : "";
  const path = d.path ? c.magenta(` ${d.path}`) : "";
  console.log(`    ${tag}${path}${loc} ${d.message}`);
  if (d.hint) console.log(`      ${c.gray("hint: " + d.hint)}`);
}
