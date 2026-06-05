import { describe, it, expect } from "vitest";
import { parseLw } from "@lw-text/engine";
import { validateData, validateTemplateBindings, inferSchema } from "../index.js";
import type { JSONSchema } from "../types.js";

const dataSchema: JSONSchema = {
  type: "object",
  required: ["customer", "lineItems"],
  properties: {
    locale: { type: "string" },
    customer: {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" }, type: { type: "string" } },
    },
    lineItems: {
      type: "array",
      items: {
        type: "object",
        properties: { description: { type: "string" }, amount: { type: "number" } },
      },
    },
  },
};

describe("validateData", () => {
  it("passes valid data", () => {
    const res = validateData(dataSchema, {
      customer: { name: "Acme" },
      lineItems: [],
    });
    expect(res.valid).toBe(true);
  });
  it("reports missing required fields", () => {
    const res = validateData(dataSchema, { lineItems: [] });
    expect(res.valid).toBe(false);
    expect(res.diagnostics[0]?.code).toBe("DATA_INVALID");
  });

  it("does not throw on repeated calls with re-read $id schemas", () => {
    // The loader re-reads schema files per request → a fresh object each time.
    // A shared Ajv instance must not double-register the same `$id`.
    const make = (): JSONSchema => ({
      $id: "https://acme.example/schemas/DATA.schema.json",
      type: "object",
      required: ["customer"],
      properties: { customer: { type: "object", properties: { name: { type: "string" } } } },
    });
    expect(validateData(make(), { customer: { name: "A" } }).valid).toBe(true);
    expect(() => validateData(make(), { customer: { name: "B" } })).not.toThrow();
    const bad = validateData(make(), {});
    expect(bad.valid).toBe(false);
  });
});

describe("inferSchema", () => {
  it("infers types, formats and required keys from a sample", () => {
    const schema = inferSchema(
      {
        invoice: { number: "INV-1", date: "2026-05-18", currency: "EUR" },
        total: 1200.5,
        qty: 3,
        items: [{ description: "A", amount: 10 }],
        contact: "a@b.com",
      },
      { title: "DATA", rootId: "https://x/DATA.json" },
    );
    expect(schema.type).toBe("object");
    expect(schema.title).toBe("DATA");
    expect(schema.$id).toBe("https://x/DATA.json");
    expect(schema.properties!.invoice!.properties!.date!.format).toBe("date");
    expect(schema.properties!.contact!.format).toBe("email");
    expect(schema.properties!.total!.type).toBe("number");
    expect(schema.properties!.qty!.type).toBe("integer");
    expect(schema.properties!.items!.type).toBe("array");
    expect(schema.required).toContain("invoice");
  });

  it("merges array element shapes so optional fields are not required", () => {
    const schema = inferSchema([
      { id: "1", note: "x" },
      { id: "2" },
    ]);
    const item = schema.items!;
    expect(item.required).toEqual(["id"]); // `note` only present in one element
    expect(Object.keys(item.properties!)).toEqual(["id", "note"]);
  });

  it("can leave everything optional with required:none", () => {
    const schema = inferSchema({ a: 1, b: 2 }, { required: "none" });
    expect(schema.required).toBeUndefined();
  });
});

describe("validateTemplateBindings", () => {
  it("accepts valid bindings including loop variables", () => {
    const doc = parseLw(`<template id="t" data-sources="DATA">
      <p>{{ DATA.customer.name }}</p>
      <table><tr repeat="row in DATA.lineItems">
        <td>{{ row.description }}</td>
        <td data-bind="row.amount" format="currency"></td>
      </tr></table>
    </template>`);
    const diags = validateTemplateBindings(doc, { DATA: dataSchema });
    expect(diags).toHaveLength(0);
  });

  it("flags unknown bindings", () => {
    const doc = parseLw(`<template id="t" data-sources="DATA">
      <p>{{ DATA.customer.unknownField }}</p>
    </template>`);
    const diags = validateTemplateBindings(doc, { DATA: dataSchema });
    expect(diags.some((d) => d.code === "BINDING_UNKNOWN")).toBe(true);
  });

  it("flags loop variable typos", () => {
    const doc = parseLw(`<template id="t" data-sources="DATA">
      <tr repeat="row in DATA.lineItems"><td>{{ row.nope }}</td></tr>
    </template>`);
    const diags = validateTemplateBindings(doc, { DATA: dataSchema });
    expect(diags.some((d) => d.code === "BINDING_UNKNOWN" && d.path === "row.nope")).toBe(true);
  });
});
