# AGENTS.md — lw-text repository

Instructions for **all AI coding agents** (Cursor, Claude Code, GitHub Copilot, Windsurf, etc.) working in this repo.

## Project

**lw-text** — AI-first enterprise document composition (templates, schemas, REST compose). See [docs/PRD.md](docs/PRD.md).

## When authoring document templates

You are a **lw-text template author**. Follow the skill:

- **Cursor:** skill `lw-text-template-author` in `.cursor/skills/lw-text-template-author/`
- **Copilot:** [.github/copilot-instructions.md](.github/copilot-instructions.md)
- **Claude / others:** read `.cursor/skills/lw-text-template-author/SKILL.md` and [lw-doc-reference.md](.cursor/skills/lw-text-template-author/lw-doc-reference.md)

### Quick rules

1. Primary datasource: **`DATA`** — bindings must match `schemas/DATA.schema.json`.
2. Prefer **`.lw`** files for templates; compile to `lw-doc` when required.
3. Never edit nodes marked **`ai-editable="false"`** / `"aiEditable": false`.
4. Always add/update **`fixtures/*.json`** when introducing bindings.
5. Run **`lw validate`** before considering work complete (when CLI exists).
6. Small diffs; kebab-case IDs; one locale per file for translations.

### Install skill globally (Cursor)

```bash
mkdir -p ~/.cursor/skills
cp -R .cursor/skills/lw-text-template-author ~/.cursor/skills/
```

Details: [docs/skills/INSTALL.md](docs/skills/INSTALL.md)

## When working on platform code

Use normal engineering practices; run `npm test` / `npm run build` when those exist. Do not commit secrets.

### Performance (required)

Studio, server APIs, and compose paths must feel **instant**. Before shipping UI or editor features:

1. **No hot-path document churn** — never `serializeLw` / full `parseLw` / undo stack updates on every pointer move; commit once on release (live preview = DOM/CSS only).
2. **Defer heavy work** — use `requestAnimationFrame`, debounced preview (≥500ms), `startTransition` for IR parses, and ignore stale async preview/validate responses.
3. **Minimize render tree** — avoid extra wrappers on unselected nodes; memoize large canvases; prefer targeted state updates over whole-app rerenders.
4. **APIs stay lean** — no redundant round-trips; batch when possible; cap payload sizes already enforced on upload.
5. **Measure** — if interaction feels sluggish, profile the change (resize, drag, typing) before adding features on top.

### Preview / Design parity (required)

Studio **Design** and **Preview** must match **1:1 at 100% scale** (same page width, margins, typography, and `LW_COMPOSE_BASE_CSS`). Use `DocumentPage` / `DocumentSurface` / `PreviewFrame`; do not duplicate ad-hoc canvas typography or extra page padding on the design wrapper.
