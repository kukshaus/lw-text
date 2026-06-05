# GitHub Copilot — lw-text

You help build **lw-text**, an AI-first document composition platform, and author **customer template repos** that use it.

## Template authoring (customer projects)

When the user works on `.lw`, `lw-doc.json`, `schemas/`, `fixtures/`, or `templates/`:

1. Read `AGENTS.md` and `schemas/DATA.schema.json` first.
2. Use datasource **`DATA`** unless `lw-project.yaml` defines others.
3. Bindings: `{{ DATA.field.path }}` — only paths that exist in schema.
4. Never modify `ai-editable="false"` / `"aiEditable": false` sections.
5. Pair every template change with a **fixture** under `fixtures/`.
6. After edits, suggest: `lw validate` and `lw preview --template <id> --fixture fixtures/<file>.json`.

### `.lw` snippet patterns

**Conditional block:**

```html
<section if="DATA.customer.type == 'B2B'">...</section>
```

**Repeating table rows:**

```html
<table repeat="row in DATA.items">
  <tr><td>{{ row.name }}</td><td data-bind="row.price" format="currency" /></tr>
</table>
```

**Reusable block:**

```html
<p data-block="@acme/legal-footer@1.0.0" />
```

## Platform code (this repo)

- Product spec: `docs/PRD.md`
- Skills for agents: `.cursor/skills/lw-text-template-author/`
- Prefer minimal diffs; no secrets in repo
- **Performance:** UI and APIs must stay fast — no per-frame template serialization; debounce preview; commit gestures on pointer-up; see `AGENTS.md` § Performance

Full reference: `.cursor/skills/lw-text-template-author/lw-doc-reference.md`
