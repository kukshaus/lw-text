# lw-text

AI-first enterprise **document composition** platform: author `.lw` templates with complex logic, typed data models and reusable building blocks, validate them against JSON Schema, and compose governed documents to **HTML / PDF** via CLI and a fast REST API — edited live in a browser **Studio**.

Inspired by M/TEXT and OpenText Exstream, rebuilt as an open, Git-native, agent-friendly stack. See [docs/PRD.md](docs/PRD.md).

---

## What works today (running code)

| Capability | Status |
|------------|--------|
| `.lw` template language (conditionals, loops, bindings, blocks, locked zones) | ✅ |
| Safe expression DSL (no `eval`, sandboxed) | ✅ |
| `lw-doc` IR + HTML renderer with `Intl` formatting (currency, date, IBAN…) | ✅ |
| JSON Schema validation + **schema-aware binding checks with loop typing** | ✅ |
| Reusable building blocks / framework references | ✅ |
| `lw` CLI: `init`, `validate`, `preview`, `compose`, `check` | ✅ |
| REST API: projects, templates, preview, validate, compose, documents, AI context | ✅ |
| Browser **Studio**: live preview, diagnostics, schema explorer, PDF export | ✅ |
| PDF rendering via Playwright/Chromium (warm pool, pluggable) | ✅ (needs a normal, non-sandboxed env) |
| AI authoring skill + `AGENTS.md` + Copilot instructions | ✅ |

**25 automated tests** pass across the engine, schema, project and server packages.

---

## Architecture

A TypeScript monorepo (npm workspaces). Each package is independently testable.

```
packages/
  engine/    @lw-text/engine    .lw parser → lw-doc IR → safe DSL → HTML renderer
  schema/    @lw-text/schema    Ajv (2020-12) data validation + binding/loop type checks
  project/   @lw-text/project   project loader (yaml/schemas/templates/blocks/fixtures),
                                validation, compose orchestration, PDF (lazy Playwright)
  cli/       @lw-text/cli       `lw` command-line tool
  server/    @lw-text/server    Fastify REST API + in-memory document store (Postgres-ready)
apps/
  studio/    @lw-text/studio    React 19 + Vite + Tailwind v4 + CodeMirror editor
examples/
  acme-common/                  framework project (shared footer block + COMMON schema)
  acme-insurance/               invoice app — depends on acme-common for building blocks
```

### Framework projects (shared building blocks)

A **framework** project (`kind: framework` in `lw-project.yaml`) publishes reusable blocks and schemas. Application projects link it via `dependencies`:

```yaml
dependencies:
  - project: acme-common
    version: "1"
```

Templates reference shared blocks with `data-block="blocks/legal-footer"`. The loader merges framework blocks and imported schemas (e.g. `COMMON`) into the consuming project. In Studio, use **Framework dependencies → +** to link a framework, or create a new **framework** project from the workspace **+** menu.

**Key design decisions**

- **Source over binary.** Templates are line-diffable text in Git so Claude/Copilot/Cursor can author them and humans can review PRs.
- **Sandboxed DSL.** A hand-written Pratt parser/evaluator — no JavaScript `eval`, no host/global/prototype access — so user- and AI-authored logic is safe to run server-side.
- **Pluggable everywhere.** Document store and PDF engine sit behind interfaces; swap the in-memory store for PostgreSQL + S3 and the single-process Chromium for a worker pool without touching routes.
- **Validate before trust.** Every template is checked against its schema (including loop-variable typing) and AI edits can be gated on locked zones.

---

## Quickstart

Requires Node ≥ 20.

```bash
npm install
npm run build            # build all packages

# Validate + preview the example project
npm run lw -- validate examples/acme-insurance
npm run lw -- preview invoice examples/acme-insurance --fixture invoice --out /tmp/invoice.html
```

### Run the API + Studio — one command

```bash
npm run dev
```

This starts the API (:4000) and the Studio (:5173) together with labeled output and clean Ctrl-C shutdown. (You can still run them separately with `npm run dev:server` and `npm run dev:studio`.)

Open http://localhost:5173 — pick the project/template, edit the `.lw` source or the data JSON, and watch the live preview, diagnostics and schema explorer update. Click **Export PDF**.

**Single-command production-style run:** build the Studio, then start the server (it serves the built Studio at `/`):

```bash
npm run build --workspace @lw-text/studio
npm start                # http://localhost:4000
```

### PDF rendering

```bash
npm i -w @lw-text/project playwright
npx playwright install chromium
npm run lw -- compose invoice examples/acme-insurance -d examples/acme-insurance/fixtures/invoice.json -f pdf -o /tmp/invoice.pdf
```

---

## The `.lw` template language (taste)

```html
<template id="invoice" version="1.0.0" data-sources="DATA" title="Invoice">
  <section if="DATA.customer.type == 'B2B'">
    <p>Dear {{ DATA.customer.name }}</p>
  </section>

  <table>
    <tr repeat="row in DATA.lineItems">
      <td>{{ row.description }}</td>
      <td data-bind="row.amount" format="currency" currency="{{ DATA.invoice.currency }}"></td>
    </tr>
  </table>

  <footer ai-editable="false">
    <p data-block="blocks/legal-footer"></p>
  </footer>
</template>
```

Full syntax and IR: [.cursor/skills/lw-text-template-author/lw-doc-reference.md](.cursor/skills/lw-text-template-author/lw-doc-reference.md).

## REST API (selected)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/v1/projects` | list projects in the workspace |
| `GET` | `/v1/projects/:pid/templates/:tid` | template source + IR + locked nodes |
| `POST` | `/v1/projects/:pid/preview` | compose to HTML (`source` or `templateId`) |
| `POST` | `/v1/projects/:pid/validate` | diagnostics for a template + optional data |
| `POST` | `/v1/projects/:pid/compose` | compose to HTML **or PDF**; stores a document instance |
| `GET` | `/v1/documents/:id` | document instance metadata |
| `GET` | `/v1/projects/:pid/ai/context` | schemas + locked zones + IR version for agents |

Set `LW_WORKSPACE` to point the server at a directory of projects (defaults to `examples/`).

---

## AI authoring (Claude, Copilot, Cursor)

| Tool | Entry point |
|------|-------------|
| **Cursor** | `.cursor/skills/lw-text-template-author/` |
| **GitHub Copilot** | `.github/copilot-instructions.md` |
| **Claude & others** | `AGENTS.md` → links to skill + reference |

Install globally (Cursor): see [docs/skills/INSTALL.md](docs/skills/INSTALL.md).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | build all workspace packages |
| `npm test` | run all package test suites |
| `npm run dev:server` | API with hot reload (:4000) |
| `npm run dev:studio` | Studio with hot reload (:5173) |
| `npm start` | run built API (serves built Studio) |
| `npm run lw -- <cmd>` | run the CLI |

## Roadmap

This repo implements the **MVP compose + AI-author core** from the [PRD](docs/PRD.md). Next: multi-remote Git sync, async batch jobs, MCP server + LSP, framework registry, Interactive Fill, and PostgreSQL/object-storage backends (all designed for behind the existing interfaces).
