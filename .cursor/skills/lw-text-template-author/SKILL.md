---
name: lw-text-template-author
description: >-
  Authors, edits, and validates lw-text document templates (lw-doc, .lw markup,
  JSON Schema, fixtures) for enterprise CCM composition. Use when the user
  works on lw-text, document templates, data bindings, conditional sections,
  building blocks, compose APIs, M/Text-style templates, or asks Claude/Copilot
  to generate or fix templates in this project.
---

# lw-text Template Author

## Role

You author **production-ready lw-text templates**: typed data models, declarative layout/logic, reusable blocks, and fixtures. Output must be **Git-friendly text**, validatable, and safe for regulated documents (locked legal zones).

Read [lw-doc-reference.md](lw-doc-reference.md) for format rules. See [examples.md](examples.md) for patterns.

## Before writing

1. Read `lw-project.yaml` (if present), `AGENTS.md`, and `schemas/*.json`.
2. Read existing `templates/`, `blocks/`, `themes/` in the target project—match conventions.
3. Never invent field paths: every binding must exist in the schema for its datasource (default name: `DATA`).
4. Check `aiEditable: false` nodes—**do not modify** locked content; extend around it.

## Authoring workflow

```
- [ ] Confirm intent (channel, locale, output: pdf/html/email)
- [ ] Read or create JSON Schema for datasource(s)
- [ ] Add/update fixture under fixtures/
- [ ] Write or edit template (.lw preferred for new work; lw-doc.json when required)
- [ ] Run validation (see below)
- [ ] Summarize changes and list files touched
```

## Validation (required before done)

When `lw` CLI is available:

```bash
lw validate
lw preview --template <id> --fixture fixtures/<name>.json
```

If CLI is not installed yet: manually verify bindings against schema, matching brackets/tags, and that locked nodes are untouched. Tell the user to run `lw validate` when tooling exists.

## File layout (template repo)

```
lw-project.yaml
schemas/DATA.schema.json
fixtures/DATA.sample.json
templates/<name>.lw
blocks/
themes/
layouts/
```

## Rules (non-negotiable)

| Rule | Detail |
|------|--------|
| **Datasource name** | Primary datasource is `DATA` unless project defines others |
| **Bindings** | Use `{{ DATA.path.to.field }}` in `.lw`; JSON pointers in lw-doc |
| **Logic** | Prefer declarative `if` / `repeat` in `.lw`; JSONLogic in lw-doc `rules` |
| **Locked content** | Respect `"aiEditable": false`; suggest human review instead of editing |
| **No secrets in fixtures** | Use placeholders for PII; mark sensitive fields in schema |
| **IDs** | kebab-case: `claim-letter`, `invoice-table` |
| **i18n** | Separate files per locale: `letter-body.de.lw`, not inline mixed languages |
| **Dependencies** | Reference blocks as `@scope/block-name@version` per `lw-project.yaml` |

## What to produce

| Task | Deliver |
|------|---------|
| New template | `.lw` + fixture + schema updates if new fields |
| New block | `blocks/<name>.lw` + minimal fixture slice |
| Logic change | Edit only affected nodes; explain rule in one sentence |
| Schema change | Bump version note in schema; flag breaking changes |

## Self-correction loop

On validation errors:

1. Read structured error (`code`, `path`, `hint`).
2. Fix **only** the reported paths.
3. Re-run validate; do not rewrite unrelated sections.

## Output style

- Prefer **small, focused diffs** over full-file rewrites.
- After edits, list: files changed, bindings added, rules added, validation status.
- If requirements are ambiguous, ask one clarifying question—then proceed with documented assumptions in a comment block at top of new `.lw` files:

```html
<!-- lw-assumptions: B2B invoice, EUR, locale de-DE, PDF paged -->
```

## Additional resources

- Product context: [docs/PRD.md](../../../docs/PRD.md)
- Install skill globally: [docs/skills/INSTALL.md](../../../docs/skills/INSTALL.md)
