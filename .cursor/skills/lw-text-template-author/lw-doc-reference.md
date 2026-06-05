# lw-doc & `.lw` Reference (v0.1 draft)

Spec status: **draft** (platform in development). Formats below are the contract AI tools must follow.

## Datasources

- Named inputs; primary: **`DATA`**.
- Each datasource has `schemas/<NAME>.schema.json` (JSON Schema draft 2020-12).
- Compose API sends `dataSources: { "DATA": { ... } }`.

## `.lw` declarative markup (preferred for AI)

Compiles to `lw-doc`. HTML-like tags + Mustache bindings + control attributes.

```html
<template
  id="claim-letter"
  version="1.0.0"
  data-sources="DATA"
  layout="layouts/letter-master.lw"
  output-modes="pdf,html"
>
  <section id="header" ai-editable="false">
    <img src="{{ DATA.brand.logoUrl }}" alt="" />
  </section>

  <section id="body" if="DATA.claim.status == 'approved'">
    <p>{{ DATA.policyholder.salutation }} {{ DATA.policyholder.lastName }},</p>
    <p data-bind="DATA.claim.summary" format="plain" />
  </section>

  <table id="line-items" repeat="row in DATA.lineItems" if="DATA.lineItems.length > 0">
    <thead>
      <tr><th>Item</th><th>Amount</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>{{ row.description }}</td>
        <td data-bind="row.amount" format="currency" locale="{{ DATA.locale }}" />
      </tr>
    </tbody>
  </table>

  <section id="legal-footer" ai-editable="false">
    <p data-block="@acme/legal-footer@1.0.0" />
  </section>
</template>
```

### Attributes

| Attribute | Purpose |
|-----------|---------|
| `id` | Stable template identifier |
| `version` | Semver |
| `data-sources` | Space-separated datasource names |
| `layout` | Master layout path |
| `if` | Show node when expression true (safe DSL / JSONLogic subset) |
| `repeat` | `item in DATA.array` |
| `data-bind` | Field path; optional `format`, `locale` |
| `ai-editable="false"` | Locked zone—agents must not patch |
| `data-block` | Framework block reference |

### Allowed `format` values

`plain`, `html`, `date`, `currency`, `number`, `percent`, `phone`, `iban`

## `lw-doc.json` (canonical IR)

Use when tooling requires JSON or for machine round-trip.

```json
{
  "$schema": "https://lw-text.dev/schemas/lw-doc-0.1.json",
  "id": "claim-letter",
  "version": "1.0.0",
  "dataSources": ["DATA"],
  "layoutRef": "layouts/letter-master",
  "nodes": [
    {
      "type": "section",
      "id": "header",
      "aiEditable": false,
      "children": [
        {
          "type": "image",
          "bind": "DATA.brand.logoUrl"
        }
      ]
    },
    {
      "type": "section",
      "id": "body",
      "when": { "==": [{ "var": "DATA.claim.status" }, "approved"] },
      "children": [
        {
          "type": "text",
          "template": "{{DATA.policyholder.salutation}} {{DATA.policyholder.lastName}},"
        }
      ]
    },
    {
      "type": "repeat",
      "id": "line-items",
      "each": "DATA.lineItems",
      "as": "row",
      "children": [
        {
          "type": "tableRow",
          "cells": [
            { "bind": "row.description" },
            { "bind": "row.amount", "format": "currency", "locale": { "var": "DATA.locale" } }
          ]
        }
      ]
    }
  ]
}
```

## JSON Schema conventions

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/schemas/DATA.schema.json",
  "title": "DATA",
  "type": "object",
  "required": ["policyholder", "claim"],
  "properties": {
    "locale": { "type": "string", "default": "en-US" },
    "policyholder": {
      "type": "object",
      "properties": {
        "salutation": { "type": "string" },
        "lastName": { "type": "string", "x-sensitive": true }
      }
    },
    "lineItems": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["description", "amount"],
        "properties": {
          "description": { "type": "string" },
          "amount": { "type": "number" }
        }
      }
    }
  }
}
```

Extension: `"x-sensitive": true` → redact in AI prompts / fixtures for CI.

## `lw-project.yaml` (minimal)

```yaml
name: acme-communications
version: 1
validation:
  profile: strict
dataSources:
  - name: DATA
    schema: schemas/DATA.schema.json
dependencies:
  - package: "@acme/legal-blocks"
    version: "^1.0.0"
```

## Compose API (integration reminder)

```http
POST /v1/tenants/{tenantId}/compose
{
  "templateRef": "claim-letter@1.0.0",
  "dataSources": { "DATA": { } },
  "output": { "format": "pdf" }
}
```

## Error codes agents should fix

| Code | Meaning |
|------|---------|
| `BINDING_UNKNOWN` | Path not in schema |
| `DATASOURCE_MISSING` | Referenced datasource not declared |
| `BLOCK_UNRESOLVED` | Framework package/block not found |
| `AI_POLICY_VIOLATION` | Edit attempted on `aiEditable: false` |
| `RULE_SYNTAX` | Invalid `if` / `when` expression |
