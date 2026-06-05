# Product Requirements Document (PRD)

## lw-text — Enterprise Document Authoring & Composition Platform

| Field | Value |
|-------|--------|
| **Product** | lw-text |
| **Version** | 0.2 (PRD draft — AI-native) |
| **Status** | Discovery / Phase 0 |
| **Date** | 2026-06-01 |
| **Author** | Product & Engineering (initial) |

---

## 1. Executive Summary

**lw-text** is a next-generation **Customer Communications Management (CCM)** and **document composition** platform built **AI-first**: users create, refine, and maintain templates primarily with **AI assistants** (Claude, GitHub Copilot, Cursor, ChatGPT, enterprise copilots) in the IDE and in the browser—not only via drag-and-drop. Templates are stored as **human- and machine-readable source** (Git + `lw-doc` / declarative markup) so LLMs can generate, edit, and validate them reliably. A visual **Template Studio** remains available for review, WYSIWYG tweaks, and non-technical stakeholders.

External systems fill templates via **REST API** (and async/batch APIs), producing governed, brand-compliant documents at scale.

The product targets parity—and selective superiority—with category leaders **kwsoft M/TEXT (Serie M/)** and **OpenText Communications (Exstream)**, while adopting modern cloud-native architecture, Git-native template lifecycle, **agent-native authoring APIs**, and developer-first integration.

**Positioning statement:** *“M/TEXT-grade composition logic and OpenText-grade omnichannel governance—authored AI-first in your repo with Claude and Copilot, governed in Git, composed at scale via API.”*

**Scope of this document:** Product vision, requirements, competitive synthesis, architecture principles, and a phased delivery plan. Implementation begins after PRD approval.

---

## 2. Problem Statement

Organizations generate millions of regulated, personalized documents (contracts, policies, statements, letters, emails, portals). Today they rely on:

- **Legacy CCM suites** (M/TEXT, Exstream) with steep licensing, proprietary formats, and slow change cycles.
- **Office-centric tools** (Word mail merge, PowerPoint) that break governance at scale.
- **Developer-only engines** (Docmosis, custom PDF libs) that exclude business users.

**Pain points lw-text solves:**

| Pain | Impact |
|------|--------|
| Templates locked in vendor silos | Slow releases, vendor lock-in |
| Business users depend on IT for logic changes | Backlogs, errors |
| Poor browser/editor UX | Low adoption, shadow IT |
| Weak API / batch story | Cannot embed in modern apps |
| No first-class Git for templates | No PR review, no multi-env promotion |
| Performance cliffs on large jobs | SLA breaches, manual reruns |
| Legacy CCM formats opaque to LLMs | Cannot use Copilot/Claude; AI rewrites break production |
| Visual-only editors | Power users and integrators blocked; slow iteration |

---

## 2.1 Design Principle: AI-Generated First

**Default authoring path:** describe intent → AI generates or edits template source → **validate & preview** → Git PR → publish.

| Principle | Implication |
|-----------|-------------|
| **Source over binary** | Templates are text/JSON/YAML in Git—not opaque DB blobs |
| **Schema-guided generation** | LLMs receive JSON Schema + `lw-doc` spec + project context |
| **Validate before merge** | CLI + CI fail PRs on compile/brand/rule violations |
| **Human-in-the-loop** | Studio and diff UI for review; locked zones cannot be AI-overwritten |
| **Bring-your-own-model** | Tenant configures Anthropic, OpenAI, Azure OpenAI, or local models; lw-text does not lock one vendor |
| **Same artifacts everywhere** | Copilot in VS Code, Claude in Cursor, and in-app assistant all edit the **same files** |

Legacy suites (M/TEXT, Exstream) were not designed for LLM pair-programming. **lw-text treats AI assistants as primary authors**, with visual editing as a first-class peer—not a fallback.

---

## 3. Goals & Success Metrics

### 3.1 Product Goals

1. **Authoring excellence** — Non-developers build production templates with conditional logic, loops, sub-documents, and data bindings without code.
2. **Integration excellence** — REST (and GraphQL optional later) with JSON/XML/CSV payloads mapped to user-defined schemas.
3. **Performance excellence** — Sub-second preview for typical templates; batch throughput measured in **pages/hour**, not pages/day.
4. **Governance excellence** — Versioning, approvals, audit trails, role-based editing (Empower-style), brand lockdown.
5. **Git-native lifecycle** — Connect GitHub, GitLab, Bitbucket (and generic Git) as template sources; support multiple remotes per tenant/project.
6. **Reusable frameworks** — Shared libraries of blocks, styles, data models, and rules usable across projects/tenants.
7. **AI-native authoring** — Users generate and edit templates with Claude, Copilot, Cursor, and compatible tools via Git source, MCP, LSP, and documented prompts—without breaking governance.

### 3.2 Measurable Success Criteria (MVP → GA)

| Metric | MVP target | GA target |
|--------|------------|-----------|
| Template editor TTI (cold load) | < 3s P95 | < 2s P95 |
| Interactive preview after data change | < 500ms P95 (simple) | < 300ms P95 |
| Single document render (10-page PDF) | < 5s P95 | < 3s P95 |
| Batch throughput | 10K pages/hour (single cluster) | 100K+ pages/hour (horiz. scale) |
| API availability | 99.5% | 99.9% |
| Editor browser support | Last 2 versions: Chrome, Firefox, Safari, Edge | Same + mobile preview |
| Concurrent API clients | 100 | 1,000+ |
| AI-generated template compiles on first try | ≥ 70% (guided prompt + schema) | ≥ 85% |
| Time: natural language → valid draft template | < 5 min median | < 2 min |
| IDE AI completion acceptance (lw LSP) | — | ≥ 40% of suggestions used |
| PR blocked by AI policy violation | 100% when rules enabled | 100% |

---

## 4. Competitive Research & Feature Synthesis

### 4.1 kwsoft M/TEXT (Serie M/) — Key Capabilities

| Capability | Description | lw-text response |
|------------|-------------|------------------|
| **Content composition** | Logic-based control of data, content, layout via module technology | Visual + declarative rule engine on typed data model |
| **Text modules / building blocks** | Reusable elements down to phrase level | First-class **Block Library** with semver and dependencies |
| **M/TEXT TONIC Editor** | HTML5 client, role-configurable UI, WYSIWYG | Primary **Template Studio** (see §6) |
| **Content Hub / editorial** | Specialist editors, translation, tables, barcodes | Editorial workspace + localization pipeline |
| **Internal canonical format** | Single source → many outputs | **lw-doc** IR (JSON/binary) + render adapters |
| **REST document API** | Template query, multipart data binding, metadata | **Composition API** v1 (OpenAPI 3.1) |
| **Data providers / virtual datanodes** | Map external data into document model | **Data binding layer** + schema registry |
| **M/OMS output** | Omnichannel output management | Phase 2+ **Output Hub** (queue, print, email) |
| **Hyphenation / language modules** | TYPO quality | ICU + Hunspell / proprietary hooks |
| **Output formats** | PDF, PDF/A, PDF/UA, AFP, HTML, etc. | MVP: PDF, PDF/A, HTML, DOCX; roadmap: AFP, PCL |

**API patterns to adopt (from kwconnect samples):**

- Template discovery via **metadata filters** (not only name).
- Named datasources (convention: primary datasource `DATA`).
- Multipart POST for document creation with XML/JSON/CSV streams.
- Searchable vs. document-embedded metadata (fast index vs. full read).

### 4.2 OpenText Exstream — Key Capabilities

| Capability | Description | lw-text response |
|------------|-------------|------------------|
| **Communications Designer** | Web-based, HTML5, drag-drop, responsive preview | Template Studio + responsive breakpoints |
| **Design Asset Service (DAS)** | Import/export sections, rules, language layers | **Asset packs** + Git sync |
| **Content Author** | Business edits chunks without breaking layout | **Content zones** with guardrails |
| **Empower Editor** | Browser thin-client; permission-scoped editing | **Interactive Fill** mode for clerks |
| **LiveEditor** | Deep client-side editing for complex docs | Optional **Desktop Assist** (Electron) Phase 3 |
| **PowerDocs** | Post-generation edit + workflow handoff | **Document workspace** + workflow hooks |
| **Rule / flow deciders** | Multi-condition orchestration | **Flow graphs** on data + events |
| **Runtime stylesheet switching** | One design, many looks | **Theme variants** bound to data/rules |
| **Design layouts** | Shared layouts across pages | **Master layouts** + page templates |
| **Migration accelerators** | PDF/Word import, rationalization | Phase 2 **Import Studio** |
| **Omnichannel orchestration** | Bundle, sort, approve sets | Phase 2 **Campaign / set** API |
| **Integrations** | SAP, Salesforce | **Connector framework** (webhooks + plugins) |

### 4.3 Cross-Market “Best of Breed” (Windward, Templafy, Docmosis, etc.)

Consolidated **must-have** features for lw-text:

1. **AI-first authoring** with visual review (not visual-only, not opaque binary).
2. **Code-free** conditional logic with optional **expression DSL** for power users.
3. Multiple datasources in one template.
4. Drag-drop **sub-templates** / sections.
5. **Query or schema-driven** field picker (wizard).
6. Sub-template locking (legal boilerplate immutable).
7. Batch + real-time generation.
8. **Content-hash caching** for identical outputs.
9. eSignature & storage integrations (Phase 2+).
10. Full **audit trail** and approval workflows.

---

## 5. Personas & User Stories

### 5.1 Personas

| Persona | Needs |
|---------|--------|
| **Template Designer** | WYSIWYG, logic, preview, Git commit, brand compliance |
| **Content Editor / Legal** | Edit approved clauses only; suggest changes via workflow |
| **Integration Developer** | OpenAPI, SDKs, webhooks, stable IDs, sandbox |
| **Operations / Clerk** | Fill interactive templates (Empower-like), preview, submit |
| **Platform Admin** | Tenants, RBAC, Git connections, quotas, monitoring |
| **Framework Author** | Publish reusable packages across projects |
| **AI-Assisted Author** | Generate/edit templates in Cursor/VS Code with Copilot or Claude; rely on LSP, CLI, MCP |
| **Prompt Engineer / Admin** | Curate org prompts, skills, allowed models, guardrails |

### 5.2 Representative User Stories (MVP)

| ID | Story | Priority |
|----|-------|----------|
| US-01 | As a designer, I connect my GitLab repo and pull templates into a project | P0 |
| US-02 | As a designer, I define a data model (fields, types, nested objects) and bind them in the canvas | P0 |
| US-03 | As a designer, I add a building block from the org library and override styles within brand rules | P0 |
| US-04 | As a designer, I set “show section if `customer.type = 'B2B'`” without writing JavaScript | P0 |
| US-05 | As a developer, I POST JSON to `/v1/compose` and receive a PDF within SLA | P0 |
| US-06 | As a developer, I query templates by metadata `product=auto` | P1 |
| US-07 | As an admin, I lock footer legal text so clerks cannot edit it | P0 |
| US-08 | As a clerk, I open Interactive Fill, change allowed fields, preview, submit | P1 |
| US-09 | As a framework author, I publish `@acme/insurance-blocks@2.1.0` used by 5 projects | P1 |
| US-10 | As ops, I enqueue 50K documents and track job progress via API | P1 |
| US-11 | As a developer, I ask Claude in Cursor to “create a B2B invoice template for schema X” and get valid `lw-doc` files committed to Git | P0 |
| US-12 | As a developer, Copilot suggests bindings and rule expressions as I type `.lw` template source | P0 |
| US-13 | As a designer, I paste AI-generated markup into Studio and see validation errors inline before publish | P0 |
| US-14 | As an admin, I block AI from modifying locked legal clauses while allowing edits elsewhere | P0 |
| US-15 | As a developer, I run `lw validate` in CI so AI-authored PRs cannot merge if compile or brand rules fail | P0 |
| US-16 | As a user, I use the in-app assistant to “add a dynamic table for line items” and accept a diff preview | P1 |
| US-17 | As a developer, the lw-text MCP server lets my agent list schemas, read templates, validate, and preview compose | P0 |

---

## 6. Core Product Capabilities

### 6.1 AI-Native Authoring (Primary Path)

**Goal:** Any user with Claude, Copilot, Cursor, Windsurf, or an enterprise copilot can author production templates as confidently as they author application code.

#### 6.1.1 Source Formats (LLM-Friendly)

| Format | Role |
|--------|------|
| **`lw-doc.json` / `.lw.yaml`** | Canonical template IR; stable field names; JSON Schema published |
| **`.lw` (declarative markup)** | Optional concise syntax compiling to `lw-doc` (HTML-like + bindings + `{% if %}` blocks) |
| **`schema.json`** | JSON Schema per datasource; primary context for AI |
| **`fixtures/*.json`** | Sample data for preview and few-shot examples in prompts |
| **`AGENTS.md` / `.cursor/rules`** | Project instructions: brand tokens, naming, forbidden patterns |
| **`lw-project.yaml`** | Manifest: deps, remotes, validation profile |

All formats are **UTF-8 text**, line-diff friendly, and documented in a public **lw-text Specification** (versioned).

#### 6.1.2 Tooling for External AI (IDE & Agents)

| Capability | Requirement | Phase |
|------------|-------------|-------|
| **`lw` CLI** | `init`, `validate`, `compile`, `preview`, `compose`, `diff`, `explain` (human-readable errors for LLM self-correction) | P0 |
| **Language Server (LSP)** | Diagnostics, completions, go-to-definition for bindings, schema-aware field insert | P0 |
| **VS Code / Cursor extension** | Bundles LSP, snippets, prompt templates, “Fix with AI” passes error output to clipboard | P0 |
| **MCP server** | Tools: `list_templates`, `get_template`, `get_schema`, `validate`, `preview`, `compose`; resources for schemas/fixtures | P0 |
| **GitHub Copilot instructions** | `copilot-instructions.md` + snippet library in starter repos | P0 |
| **Cursor skills / rules** | Skill `lw-text-template-author` in `.cursor/skills/` + [INSTALL.md](skills/INSTALL.md) | ✓ shipped (v0.1) |
| **OpenAPI + JSON Schema export** | Auto-published per project for agent context | P0 |
| **Prompt library (in-product)** | Curated prompts: new template, add clause, localize, add repeater table | P1 |
| **In-app AI panel** | BYOK chat with diff preview, apply/reject hunks, audit log | P1 |
| **RAG over org frameworks** | Index published blocks/packages for retrieval-augmented generation | P2 |

#### 6.1.3 In-Product AI Assistant (Studio)

- **Not a replacement** for IDE AI—same files, same validation.
- Actions: generate section, refactor bindings, explain rule, suggest fixture, fix validation errors.
- **Diff-first UX:** every AI change shown as hunks; user accepts per file or per hunk.
- **Context injection:** active template, schemas, theme tokens, locked-zone map, similar blocks from framework.
- **Model routing:** tenant admin selects allowed providers/models; secrets in vault; no training on customer data by default.

#### 6.1.4 AI Governance & Safety

| Control | Description |
|---------|-------------|
| **Locked zones** | Metadata marks nodes `aiEditable: false`; CLI/LSP/API reject AI patches touching them |
| **Allowlists** | Components, functions, and DSL operators permitted in AI output |
| **Policy profiles** | `strict` (legal), `standard`, `sandbox` (dev only) |
| **Audit** | Log prompt hash, model id, files touched, user, accept/reject (not full prompt if customer opts out) |
| **PII in prompts** | Redact fixture fields marked sensitive before sending to cloud LLMs |
| **Deterministic validation** | AI output is untrusted until `lw validate` + optional human approval |

#### 6.1.5 AI Generation Flows

```
User intent (chat / IDE)
    → Agent reads schema + AGENTS.md + existing templates
    → Writes/edits .lw / lw-doc / schema / fixtures
    → lw validate (local or MCP)
    → lw preview (HTML/PDF)
    → Git commit / PR
    → CI: validate + compose smoke test with fixtures
    → Human approval (if required) → publish
```

**Regeneration flows:** “Regenerate letter body for locale de-DE keeping layout” → AI edits only `blocks/letter-body.de.lw` → validate → diff.

**Document-level AI (Phase 2):** After compose, clerks use AI to **suggest** edits within Empower-style permissions; suggestions never auto-apply to locked content.

#### 6.1.6 Starter Repo & Documentation for LLMs

Ship `lw-text-template-starter` including:

- Example insurance/invoice templates (AI-generated samples, human-reviewed)
- `AGENTS.md` with authoring rules
- `.github/workflows/lw-validate.yml`
- MCP config snippet for Cursor
- `copilot-instructions.md` and VS Code snippets

Publish **“Authoring with AI”** guide: prompt patterns, common failures, self-healing via CLI error output.

---

### 6.2 Template Studio (HTML5 Editor — Review & Visual Edit)

**Principles:** Browser-only for MVP (no plugin); **bidirectional sync** with Git source; AI changes visible as diffs; accessible (WCAG 2.2 AA target).

| Feature | Requirement |
|---------|-------------|
| **Canvas** | Paginated (print) + fluid (email/HTML) modes; rulers, grids, snap |
| **Components** | Text, rich text, image, table, repeater, chart, barcode/QR, page break, container, conditional wrapper |
| **Data binding** | Drag field from schema; format masks (date, currency, locale) |
| **Logic** | Visual rules + optional expression DSL (JSONLogic or custom safe DSL) |
| **Repeater / tables** | Dynamic rows from array data; subtotals; grouping |
| **Sub-documents** | Embed template by reference; pass data slice |
| **Master layout** | Headers/footers; page numbers; running elements |
| **Themes / CSS** | Design tokens; runtime theme switch via data |
| **Preview** | Live preview with sample/fixture data; side-by-side data inspector |
| **Responsive** | Breakpoints for HTML/email output |
| **Collaboration** | Presence optional Phase 2; comments in Phase 2 |
| **Import** | Phase 2: DOCX/HTML fragment import |
| **Localization** | Language layers; fallback chain |
| **Accessibility checker** | PDF/UA hints in editor |
| **AI diff view** | Side-by-side: AI proposal vs current; accept/reject per node |
| **Open in IDE** | Deep link to VS Code/Cursor at file:line |
| **Source mode** | Edit `.lw` / `lw-doc` in Monaco with LSP diagnostics |

**Editor tech direction (recommendation):**

- **Shell:** React 19 + TypeScript strict.
- **Canvas:** Custom layout engine OR ProseMirror/TipTap for text + absolute layout layer for print (evaluate in spike).
- **State:** CRDT (Yjs) optional for real-time; OT acceptable for MVP single-editor.
- **Styling:** CSS Paged Media + token system; separate email-safe CSS pipeline.

### 6.3 Data Model & Schema Registry

| Feature | Requirement |
|---------|-------------|
| **Schema designer** | Visual + JSON Schema export |
| **Types** | string, number, boolean, date, enum, object, array, reference |
| **Validation** | Required fields, regex, cross-field rules |
| **Versioning** | Semver; breaking change detection |
| **Fixtures** | Sample payloads per template for preview/CI |
| **Multi-datasource** | Named sources (e.g. `DATA`, `PARTY_B`) like M/TEXT |
| **Mapping** | API payload → internal canonical model |

#### 6.3.1 Named Test Cases — *implemented*

Mirroring M/TEXT's per-template "test cases", a template can carry **several
named data scenarios** so authors can prove the dynamic logic against varied
inputs (e.g. *B2B EU reverse-charge* vs *B2C, no due date*).

- A fixture file is either raw datasources (`{ "DATA": {…} }`) or an envelope
  `{ "lwTestCase": { "title", "default", … }, "dataSources": {…} }`.
- Filename convention `‹templateId›.‹caseId›.json` associates cases with a
  template; `‹templateId›.json` is the default case.
- API: `GET …/{id}` returns the case list; `GET …/test-cases/{key}` returns one.
- Studio adds a **test-case switcher** + **Reset** (discard live edits) to the
  data editor; values remain live-editable for ad-hoc what-ifs.

### 6.4 Building Blocks & Frameworks

| Concept | Description |
|---------|-------------|
| **Block** | Smallest reusable unit (paragraph, clause, table fragment) |
| **Section** | Composed blocks + local logic |
| **Template** | Full document definition referencing layouts/blocks |
| **Framework package** | Versioned bundle: blocks, schemas, themes, rules, i18n |
| **Dependency graph** | Resolve semver ranges; lockfile in Git (`lw-lock.json`) |

**Framework publishing:**

- Scoped packages: `@org/framework-name@version`
- Projects declare dependencies; Studio resolves and shows upgrade diff
- **Promotion:** dev → staging → prod via Git branches/tags or internal registry

#### 6.4.1 Reference Search (Where-Used) — *implemented*

Editing a shared block silently changes every document that includes it — the
single biggest footgun in M/TEXT-style reuse. lw-text builds a **where-used
graph** across templates and blocks:

- API: `GET /v1/projects/{id}/references` → for each block, the templates/blocks
  that consume it, plus a `shared` flag when more than one resource depends on it.
- Studio surfaces a **"Building blocks · where used"** panel and highlights the
  active template's dependencies; shared blocks are badged so authors know the
  blast radius before they edit.

### 6.5 Git Integration (Multi-Remote)

| Feature | Requirement |
|---------|-------------|
| **Providers** | GitHub, GitLab, Bitbucket Cloud/Server, generic HTTPS/SSH Git |
| **Multi-remote** | Multiple repos per project (e.g. `templates` + `frameworks`) |
| **Auth** | OAuth App / PAT (encrypted at rest); org-level allowlist |
| **Sync modes** | Pull on demand, webhook on push, scheduled sync |
| **Mapping** | Repo path ↔ template ID; branch per environment |
| **PR workflow** | Link PR status to template approval state |
| **Conflict handling** | Three-way merge UI for template IR (not raw binary) |

**Repository layout convention (recommended):**

```
/
  lw-project.yaml          # project manifest
  schemas/
  templates/
  blocks/
  themes/
  fixtures/                # named test cases (see §6.3.1)
  AGENTS.md                # AI authoring instructions (required in starter)
  copilot-instructions.md  # GitHub Copilot context
  .cursor/rules/           # optional Cursor rules
  .github/workflows/       # lw validate + compose smoke on PR
```

#### 6.5.1 Virtual Workspace & Overlay/Publish Model

> Informed by kwsoft M/TEXT Content Hub "Git mode" — a battle-tested design for
> multi-repo, multi-author, branch-aware editing. We adopt its core mechanics.

- **Virtual workspace = merge of N repositories.** Projects from several repos
  (optionally across **different providers** — e.g. some in GitHub, some in
  GitLab/Gitea) are combined server-side and presented as one tree. Duplicate
  top-level project names across repos are **rejected** (not silently merged);
  repos can be excluded from a project's view.
- **Branch-aware editing.** All branches are selectable in the UI; an author
  picks the branch to work on. Locks and drafts are **scoped to a branch**, so
  two authors can edit the same resource on different feature branches.
- **Overlay (draft) edits.** While editing, changes are held as *overlay
  resources* in the platform DB — visible only to the editing author. Other
  users continue to see the published original. This avoids long-lived Git
  branches for every in-progress edit and enables instant preview.
- **Publish = commit.** A publish wizard lets the author select which edited
  resources to ship, attaches a commit message, and **commits back to the
  branch the resources were read from**. After deployment they are visible to
  all. This maps cleanly onto our PR workflow (publish → branch → PR → merge).
- **Performance.** Read via the Git host HTTP API on first touch, then **clone
  to local FS + in-memory cache** to avoid repeated large-blob transfers
  (HTTPS now; SSH later).
- **Per-repo authorization.** Read-only repos and per-role/per-user repo access,
  independent of branch.
- **Reference search (where-used).** A search index (Elastic/OpenSearch at
  enterprise scale; in-process for small projects) answers "which templates use
  this block?" *before* an author edits a shared block — see §6.4.1.

| Mode | When | Trade-off |
|------|------|-----------|
| **Git mode** (virtual workspace, branches, overlays) | Default; real multi-team use | Requires a Git host reachable over HTTPS |
| **Database/single-branch mode** | Simple workflows, no feature branches | One fixed branch; no per-branch isolation |

### 6.6 Composition & Document API

**Synchronous compose (MVP):**

```http
POST /v1/tenants/{tenantId}/compose
Content-Type: application/json

{
  "templateRef": "insurance/claim-letter@1.2.0",
  "dataSources": {
    "DATA": { ... },
    "PARTY_B": { ... }
  },
  "output": { "format": "pdf", "profile": "pdf-a-2b" },
  "metadata": { "caseId": "C-12345", "assignee": "team-a" }
}
```

**Additional endpoints (phased):**

| Endpoint | Purpose |
|----------|---------|
| `GET /v1/templates` | List/search with metadata filters |
| `GET /v1/templates/{id}` | Metadata + schema refs |
| `POST /v1/documents` | Create persistent document instance |
| `GET /v1/documents/{id}` | Retrieve + metadata index |
| `POST /v1/jobs` | Async batch compose |
| `GET /v1/jobs/{id}` | Status, artifacts |
| `POST /v1/preview` | Fast HTML preview (no full PDF) |
| `POST /v1/validate` | Validate payload against template schema |
| `POST /v1/ai/validate-patch` | Validate AI-proposed patch against policy + compile (MVP) |
| `GET /v1/ai/context/{projectId}` | Bundled schema + spec + tokens for external agents (MVP) |

**Protocols:**

- JSON primary; XML/CSV datasources via `multipart/form-data` (M/TEXT compatibility mode).
- OpenAPI 3.1 spec published; SDKs (TypeScript, Java, Python) Phase 2.
- Webhooks for job completion, approval events.

### 6.7 Document Management & Governance

| Feature | Phase |
|---------|-------|
| Template versioning & diff | MVP |
| Approval workflow (draft → review → published) | MVP |
| Immutable published versions | MVP |
| Document instances with searchable metadata | MVP |
| Full audit log (who/when/what) | MVP |
| Retention policies | Phase 2 |
| Legal hold | Phase 3 |
| Content Author zones | Phase 2 |
| Interactive Fill (Empower-like) | Phase 2 |

### 6.8 Output & Rendering

| Format | MVP | Notes |
|--------|-----|-------|
| PDF | Yes | Primary; via headless Chromium pool or hybrid |
| HTML | Yes | Responsive; email inline CSS option |
| DOCX | Phase 2 | Round-trip limited |
| PDF/A, PDF/UA | Phase 2 | Accessibility pipeline |
| AFP, PCL | Phase 3 | Enterprise print |

**Rendering pipeline:**

1. **Resolve** template IR + framework deps + data bindings.
2. **Evaluate** rules/logic → document AST.
3. **Layout** paginate (print) or flow (HTML).
4. **Render** HTML → PDF (Gotenberg/Chromium) or native HTML export.
5. **Post-process** merge, compress, PDF/A conversion.

### 6.9 Interactive Fill & Clerk Workflows (Phase 2)

- Permission matrix: field/section level (read, edit, hidden).
- Guided **interview mode** (questionnaire drives visible sections).
- Attach additional documents; recipient list.
- Preview → submit → triggers compose + downstream webhook.

### 6.10 High-Volume Batch Composition (Phase 2)

> Informed by the kwsoft **M/TEXT Batch Adapter**, whose Kafka-vs-Tepine split
> validates our pluggable-processor seam. We adopt its entity model and its
> hard-won operational lessons.

**Entity model** (see §9):

| Entity | Role |
|--------|------|
| **BatchQueue** | A stream of documents to process; maps 1:1 to a processor lane (Kafka topic *or* thread pool) |
| **BatchConfig** | Reusable print/output config (`templateRef`, output profile, datasource-store policy, splitting) — shareable across jobs |
| **BatchJob** | A processing campaign bound to a Queue + Config; holds per-status counters |
| **BatchTask** | One enqueue request within a job (returned by `/process`); tracks enqueue + per-status counters |
| **BatchDocument** | A single tracked document (`QUEUED → COMPLETED \| FAILED`) with datasource + error |

**Pluggable processors** (behind one interface, like our PDF/store seams):

| Processor | Use | Mechanics |
|-----------|-----|-----------|
| **In-process pool** (default, "Tepine-class") | Lightweight / starter; low volume | `ThreadPoolExecutor`-style worker pool; stores only failed docs |
| **Streaming/Kafka-class** | High volume, horizontal scale | Streamed transactional enqueue, dead-letter queue, auto-restarting consumers, **eventual consistency** on document reads |

**Input adapters:** multipart, **filesystem drop dir**, **S3 bucket**, and
ZIP / CSV / large-XML **with row/element splitting**; a **custom preprocessing
API** transforms unsupported inputs into a supported datasource shape.

**Operational lessons baked into the design:**

- **Batch, don't drip** — never enqueue one doc per HTTP call; accept CSV / split
  XML / ZIP, or a filesystem/S3 pointer, for large loads.
- **Transactional enqueue** — a `/process` call either fully enqueues or rejects.
- **Push, don't poll** — emit job/task status-change events (notification
  topic / webhook) instead of forcing clients to poll.
- **Datasource retention policy** — `store-datasources = ALL | NONE | FAILED_ONLY`
  to bound storage growth; scheduled cleanup of old jobs/tasks.
- **Counters everywhere** — per-status counters on Job/Task drive live progress.
- **Force-delete guards** — deleting a Queue/Config in use, or a Job with queued
  docs, is rejected unless `?force=true`.

**API (extends §6.6):** `POST /v1/jobs`, `POST /v1/jobs/{id}/process` (→ task id),
`…/process-from-fs`, `…/process-from-s3`, `GET /v1/jobs/{id}` (counters),
`GET /v1/tasks/{id}`, `GET /v1/documents/{id}` (may 404 briefly under eventual
consistency in streaming mode).

---

## 7. Non-Functional Requirements

### 7.1 Performance & Scalability

| Area | Requirement |
|------|-------------|
| **Editor** | Virtualized canvas; lazy load assets; WASM for heavy layout optional |
| **API** | Stateless services; horizontal pod autoscaling |
| **Queue** | Redis Streams / NATS / RabbitMQ for async jobs |
| **Workers** | Pool of warm headless browsers; recycle on memory threshold |
| **Batch** | Page-level task splitting for large jobs; incremental PDF merge |
| **Cache** | Template compile cache; output cache by content hash |
| **Database** | PostgreSQL (metadata, ACL, jobs); object storage (S3-compatible) for artifacts |
| **CDN** | Static assets and published template bundles |

### 7.2 Reliability & Operations

- Idempotent compose requests (`Idempotency-Key` header).
- Dead-letter queue for failed jobs; automatic retry with backoff.
- Observability: OpenTelemetry traces, structured logs, metrics (latency, queue depth, render OOM).
- Multi-tenant isolation: row-level security or schema-per-tenant (configurable).

### 7.3 Security & Compliance

- OAuth2/OIDC (Keycloak, Auth0, Azure AD compatible).
- RBAC + ABAC for templates and documents.
- Encryption at rest (DB, object store) and in transit (TLS 1.3).
- Secrets in vault; Git tokens rotated.
- SOC2-ready audit exports.
- GDPR: data residency per tenant; right-to-erasure on document instances.

### 7.4 Browser Support

| Browser | Support |
|---------|---------|
| Chrome / Edge (Chromium) | Last 2 versions — primary |
| Firefox | Last 2 versions |
| Safari | Last 2 versions (macOS + iOS preview) |
| IE | Not supported |

---

## 8. Technical Architecture (Recommended)

### 8.1 High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (Browser)                          │
│  Template Studio │ IDE (Copilot/Claude) │ Admin │ Interactive Fill │
└────────────┬───────────────────┬──────────────────────────────────┘
             │ HTTPS             │ Git push / lw CLI / MCP
┌────────────▼───────────────────▼──────────────────────────────────┐
│                     API Gateway (BFF)                              │
│         Auth │ Rate limit │ OpenAPI │ Webhooks │ AI context API    │
└─────┬──────────────┬──────────────┬──────────────┬──────────────┘
      │              │              │              │
┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
│ Template  │  │ Compose   │  │ Git Sync  │  │ Job       │
│ + Validate│  │ Engine    │  │ Service   │  │ Orchestrator│
│ (AI patch)│  │           │  │           │  │           │
└─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
      │              │              │              │
      └──────────────┼──────────────┼──────────────┘
                     │              │
              ┌──────▼──────┐ ┌─────▼─────┐
              │ PostgreSQL  │ │  Redis    │
              │ (metadata)  │ │ (cache/q) │
              └─────────────┘ └─────┬─────┘
                                    │
                              ┌─────▼─────┐
                              │  Render   │
                              │  Workers  │
                              └─────┬─────┘
                                    │
                              ┌─────▼─────┐
                              │ S3 / MinIO│
                              └───────────┘
```

### 8.2 Technology Stack (Proposal)

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Frontend** | React 19, TypeScript, Vite | Ecosystem, hiring, performance |
| **API** | Node.js (NestJS) or Go (Fiber/Chi) | Team skill TBD; both scale |
| **Database** | PostgreSQL 16+ | JSONB, RLS, mature ops |
| **Cache/Queue** | Redis 7 | Sessions, cache, streams |
| **Object storage** | S3-compatible | Artifacts, exports |
| **Search** | PostgreSQL FTS → OpenSearch later | Template metadata search |
| **Render** | Gotenberg or Playwright pool | HTML→PDF quality |
| **Git** | libgit2 / isomorphic-git + provider APIs | Sync & webhooks |
| **IaC** | Terraform / Pulumi | Reproducible envs |
| **Containers** | Kubernetes or managed (ECS/Cloud Run) | Worker scaling |

*Final stack confirmation in Architecture Decision Record (ADR) after Phase 0 spike.*

### 8.3 Canonical Template IR (`lw-doc`)

- JSON-based intermediate representation (versioned); **documented for LLM consumption** (machine-readable spec + JSON Schema meta-schema).
- Optional **`.lw` surface syntax** for smaller token footprint in AI context windows.
- Git-friendly (line-oriented JSON or YAML with stable ordering; `jq`-sort for deterministic diffs).
- Compiled to optimized binary for runtime (`.lwbc`) in CI/CD.
- Compiler validates: unresolved refs, circular deps, schema compatibility, **AI policy violations**.
- Error messages structured (`code`, `path`, `hint`, `docsUrl`) so agents can self-correct in a loop.

### 8.4 AI Integration Layer

| Component | Responsibility |
|-----------|----------------|
| **lw CLI** | Local validate/preview; CI entrypoint; exit codes for agents |
| **LSP** | Real-time feedback in VS Code, Cursor, JetBrains (later) |
| **MCP server** | Agent tool surface (Cursor, Claude Desktop, custom agents) |
| **AI Context API** | Server-assembled context bundle (schemas, tokens, examples) |
| **Patch validator** | Server-side gate for `aiEditable` and policy profiles |
| **Optional hosted inference** | lw-text-managed assistant (Phase 1+); default BYOK |

---

## 9. Data Model (Platform Entities)

| Entity | Description |
|--------|-------------|
| **Tenant** | Organization boundary |
| **Project** | Group of templates + Git remotes |
| **GitConnection** | Provider credentials + repo URLs |
| **FrameworkPackage** | Published reusable package |
| **Template** | Document definition (versioned) |
| **Schema** | Data contract |
| **Block** | Reusable fragment |
| **Theme** | Tokens + CSS |
| **TestCase** | Named data scenario for a template (preview/CI) |
| **DocumentInstance** | Generated or in-progress document |
| **OverlayResource** | Per-author unpublished draft of a resource (branch-scoped) |
| **BatchQueue** | Processing lane (Kafka topic or worker pool) |
| **BatchConfig** | Reusable print/output config (shareable across jobs) |
| **BatchJob** | Batch campaign bound to a Queue + Config; status counters |
| **BatchTask** | One enqueue request within a job; status counters |
| **BatchDocument** | Tracked document (`QUEUED/COMPLETED/FAILED`) |
| **ComposeJob** | Batch/async work unit (synchronous-style jobs) |
| **Approval** | Workflow state on template version |
| **AuditEvent** | Immutable log entry |
| **AIPolicyProfile** | Locked zones, allowlists, model restrictions |
| **AIEditSession** | Proposed/applied hunks, model metadata, user decisions |

---

## 10. Phased Delivery Roadmap

### Phase 0 — Foundation (4–6 weeks)

- [ ] ADRs: editor approach, IR format, **`.lw` syntax**, render engine, **AI patch policy**
- [ ] Monorepo scaffold (`/src`, `/tests`, `/docs`)
- [ ] PostgreSQL schema for tenants, projects, templates
- [ ] Auth skeleton (OIDC)
- [ ] Spike: 10-page template → PDF < 3s
- [ ] Spike: Claude/Copilot generates draft from schema → `lw validate` passes
- [ ] Publish `lw-doc` spec v0.1 + JSON Schema; starter repo with `AGENTS.md`

### Phase 1 — MVP “Compose + AI Author” (3–4 months)

- [ ] **`lw` CLI** + LSP (diagnostics, completions)
- [ ] **MCP server** (validate, preview, compose, list/get template)
- [ ] VS Code / Cursor extension (snippets, Copilot instructions)
- [ ] Git pull (GitHub + GitLab); single remote; **CI validate workflow**
- [ ] Template Studio: preview, source mode, **AI diff accept/reject**
- [ ] Schema designer + fixtures (AI context)
- [ ] `POST /v1/compose` → PDF + HTML
- [ ] `POST /v1/ai/validate-patch` + locked zones
- [ ] Template versioning & publish workflow
- [ ] Block library (project scope)
- [ ] Admin: users, roles, projects, **AI policy profiles (basic)**

### Phase 2 — Enterprise Parity (3–4 months)

- [ ] Multi-remote Git + webhooks
- [ ] Framework packages (cross-project)
- [ ] Async batch jobs + progress API
- [ ] Interactive Fill (clerk UI)
- [ ] Content zones / Content Author mode
- [ ] Import Studio (DOCX/HTML fragments)
- [ ] PDF/A, enhanced audit exports
- [ ] Connector SDK (webhooks + plugins)
- [ ] In-app AI assistant (BYOK) + prompt library
- [ ] RAG over framework packages
- [ ] Clerk-facing AI suggestions (governed, no auto-apply on locked content)

### Phase 3 — Scale & Ecosystem (ongoing)

- [ ] Output Hub (email, print queues)
- [ ] Campaign / document set orchestration
- [ ] Desktop Assist (optional LiveEditor-class)
- [ ] AFP/PCL, postal optimization partners
- [ ] Multi-agent workflows (spec → template → test → PR)
- [ ] Fine-tuned small models for binding completion (optional, on-prem)

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Editor complexity underestimated | Phase 0 spike; limit MVP component set |
| PDF render cost at scale | Queue + warm pools + cache; page-level sharding |
| Git merge conflicts on templates | IR diff tool; lock regions; binary-free storage |
| Feature parity creep vs Exstream | Strict MVP scope; phased parity matrix |
| Browser inconsistencies | Chromium-only for Studio; Safari test matrix |
| Regulatory output errors | Immutable published versions; simulation test suite in CI |
| AI hallucinates invalid bindings | Schema + LSP + mandatory `lw validate`; structured errors for retry |
| AI overwrites legal text | Locked zones + patch validator + PR review |
| Vendor lock-in on models | BYOK; MCP/CLI work with any agent |
| Token limits on large templates | `.lw` syntax; partial file edits; context API returns slices |

---

## 12. Out of Scope (Initial Releases)

- Full OMS (postal optimization, franking) — partner integrations only initially.
- Native Word authoring plugin (Phase 3+ evaluate).
- On-premise air-gapped install (Phase 3 offering).
- Built-in CRM/ERP (integrate via API only).

---

## 13. Open Questions

1. **Primary market vertical first?** (Insurance, banking, public sector — affects import priorities.)
2. **SaaS only vs. self-hosted** for MVP?
3. **Expression DSL:** JSONLogic vs. custom safe DSL vs. limited JavaScript sandbox?
4. **Multi-tenancy model:** shared DB with RLS vs. dedicated DB per enterprise tenant?
5. **Licensing model:** per seat, per page, per API call?
6. **Hosted AI:** offer lw-text-managed inference vs BYOK-only for MVP?
7. **`.lw` syntax:** adopt in MVP or JSON-only until Phase 2?

---

## 14. Appendix A — Feature Parity Matrix (Summary)

| Feature area | M/TEXT | Exstream | lw-text target |
|--------------|--------|----------|----------------|
| HTML5 web editor | ✓ TONIC | ✓ Designer | ✓ Studio |
| Module/block reuse | ✓ | ✓ DAS | ✓ Frameworks |
| REST compose | ✓ | ✓ | ✓ |
| Metadata template search | ✓ | ✓ | ✓ |
| Multi-datasource | ✓ | ✓ | ✓ |
| Git-native templates | ○ (external) | ○ | ✓ **differentiator** |
| AI-first authoring (Copilot/Claude) | ✗ | ○ (add-on AI) | ✓ **core differentiator** |
| MCP / agent APIs | ✗ | ✗ | ✓ P0 |
| Empower interactive | ○ | ✓ | Phase 2 |
| Content Author | ✓ Hub | ✓ | Phase 2 |
| Omnichannel OMS | ✓ M/OMS | ✓ | Phase 3 |
| PDF/UA, AFP | ✓ | ✓ | Phased |

---

## 15. Appendix B — References

- [kwsoft M/TEXT — Content Composition](https://kwsoft.com/solutions/content-composition-document-creation/)
- [kwsoft Serie M/ Architecture](https://kwsoft.com/series-m/series-m-product-architecture/)
- [M/TEXT REST samples (kwconnect)](https://github.com/kwconnect/mtext-rest-document-process-sample)
- [OpenText Exstream Empower Editor (PDF)](https://www.opentext.com/assets/documents/en-US/pdf/opentext-exstream-empower-editor-product-overview.pdf)
- [OpenText Exstream — What’s new (HTML5, DAS)](https://blogs.opentext.com/whats-new-in-opentext-exstream/)
- [Windward — 15 document generation features](https://www.windwardstudios.com/blog/features-document-generation-vendors)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) — agent tool integration pattern

---

## 16. Appendix C — Supported AI Tools (Target Matrix)

| Tool | Integration mechanism | MVP |
|------|----------------------|-----|
| **Cursor** | MCP + LSP + `.cursor/rules` + skills | ✓ |
| **Claude (Desktop/Code)** | MCP + CLI validate loop | ✓ |
| **GitHub Copilot** | `copilot-instructions.md` + LSP + snippets | ✓ |
| **VS Code Copilot** | Same as GitHub Copilot | ✓ |
| **Windsurf / Cody / Tabnine** | LSP + CLI (generic) | ✓ |
| **ChatGPT / custom agents** | MCP + OpenAPI context API | ✓ |
| **Azure OpenAI / enterprise copilots** | BYOK in-app assistant + API | Phase 2 |
| **In-app lw-text assistant** | Diff UI + BYOK | Phase 1–2 |

**Not in scope:** training customer templates into public foundation models; customers control their own API keys and data processing agreements.

---

## 17. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Product Owner | | | |
| Engineering Lead | | | |
| Stakeholder | | | |

---

*Next step after PRD approval: Phase 0 kickoff — ADRs, repository structure, and editor/render spikes.*
