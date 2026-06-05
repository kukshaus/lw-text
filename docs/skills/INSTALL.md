# Installing the lw-text template author skill

Use the same skill content across **Cursor**, **Claude**, **GitHub Copilot**, and other agents.

**Canonical location in this repo:**

```
.cursor/skills/lw-text-template-author/
├── SKILL.md
├── lw-doc-reference.md
└── examples.md
```

---

## Cursor

### Project (automatic in this repo)

Already at `.cursor/skills/lw-text-template-author/`. Agents discover it via the `description` in `SKILL.md`.

Invoke explicitly: mention **lw-text template author** or `@lw-text-template-author` if your client supports skill mentions.

### Personal (all projects)

```bash
mkdir -p ~/.cursor/skills
cp -R /path/to/lw-text/.cursor/skills/lw-text-template-author ~/.cursor/skills/
```

Restart Cursor or start a new agent session.

---

## GitHub Copilot (VS Code / Visual Studio / GitHub.com)

### In this repository

Copilot reads [`.github/copilot-instructions.md`](../../.github/copilot-instructions.md) automatically on supported clients.

### In a customer template repo

Copy into the template project root:

```bash
cp lw-text/.github/copilot-instructions.md your-template-repo/.github/
cp lw-text/AGENTS.md your-template-repo/
```

Optional: add to VS Code `settings.json`:

```json
{
  "github.copilot.chat.codeGeneration.instructions": [
    { "file": ".github/copilot-instructions.md" }
  ]
}
```

---

## Claude (Code / Desktop / API projects)

Claude does not use Cursor’s `SKILL.md` format natively. Use one of:

### Option A — `AGENTS.md` (recommended)

Copy to project root:

```bash
cp lw-text/AGENTS.md your-template-repo/
```

Many Claude Code setups load `AGENTS.md` automatically.

### Option B — Project memory / CLAUDE.md

Add to `CLAUDE.md`:

```markdown
## lw-text templates

Follow lw-text template authoring rules in AGENTS.md.
Read .cursor/skills/lw-text-template-author/SKILL.md for workflow and lw-doc-reference.md for syntax.
```

### Option C — Paste skill in system prompt

For Claude Desktop custom projects, paste the contents of `SKILL.md` + link to `lw-doc-reference.md` in project instructions.

### Option D — MCP (when lw-text MCP server ships)

Configure MCP tools: `lw_validate`, `lw_preview`, `lw_list_templates`. See PRD §6.1.2.

---

## Windsurf, Cody, JetBrains AI

1. Copy `AGENTS.md` to project root.
2. Point the tool at `.cursor/skills/lw-text-template-author/lw-doc-reference.md` as docs context.
3. Use `lw` CLI when available for validation loops.

---

## Customer template repository starter

Minimum files for AI authoring:

```
your-comm-repo/
├── AGENTS.md
├── .github/copilot-instructions.md   # optional but recommended
├── lw-project.yaml
├── schemas/DATA.schema.json
├── fixtures/
├── templates/
└── .cursor/skills/lw-text-template-author/   # copy from lw-text
```

---

## Verify installation

Ask the agent:

> Create a lw-text template `payment-reminder` for datasource DATA with a conditional section when `DATA.reminder.level > 1`, plus a fixture.

Expected behavior:

- Reads schema before writing bindings
- Creates `.lw` + fixture
- Does not invent schema fields
- Mentions `lw validate`

---

## Updates

When the skill changes, bump version in `SKILL.md` frontmatter `description` or add a `## Changelog` section. Re-copy to `~/.cursor/skills/` for personal installs.
