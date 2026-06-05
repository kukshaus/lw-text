import { describe, it, expect } from "vitest";
import { evalExpr } from "../expression.js";
import { parseLw } from "../parser.js";
import { compose } from "../compose.js";
import { serializeLw } from "../serialize.js";
import { renderBarcodeSvg } from "../barcode.js";
import type { LwDocument } from "../ir.js";

const stripLoc = (d: LwDocument) => JSON.parse(JSON.stringify(d, (k, v) => (k === "loc" ? undefined : v)));

describe("expression DSL", () => {
  const scope = {
    DATA: {
      customer: { type: "B2B", name: "Acme" },
      items: [{ amount: 10 }, { amount: 5 }],
      total: 15,
      empty: [],
      locale: "de-DE",
    },
  };

  it("evaluates member access", () => {
    expect(evalExpr("DATA.customer.name", scope)).toBe("Acme");
  });
  it("evaluates comparisons and logic", () => {
    expect(evalExpr("DATA.customer.type == 'B2B' && DATA.total > 10", scope)).toBe(true);
    expect(evalExpr("DATA.total >= 100 || DATA.customer.type == 'B2B'", scope)).toBe(true);
  });
  it("evaluates array length and index", () => {
    expect(evalExpr("DATA.items.length", scope)).toBe(2);
    expect(evalExpr("DATA.items[0].amount", scope)).toBe(10);
  });
  it("supports ternary and builtins", () => {
    expect(evalExpr("DATA.total > 10 ? 'big' : 'small'", scope)).toBe("big");
    expect(evalExpr("upper(DATA.customer.name)", scope)).toBe("ACME");
    expect(evalExpr("default(DATA.missing, 'fallback')", scope)).toBe("fallback");
    expect(evalExpr("round(3.14159, 2)", scope)).toBe(3.14);
  });
  it("treats empty array as falsy", () => {
    expect(evalExpr("DATA.empty", scope)).toEqual([]);
    expect(evalExpr("DATA.empty.length > 0", scope)).toBe(false);
  });
  it("is sandboxed against prototype access", () => {
    expect(evalExpr("DATA.customer.constructor", scope)).toBeUndefined();
    expect(evalExpr("DATA.__proto__", scope)).toBeUndefined();
  });
});

describe("parser", () => {
  it("reads template meta and nodes", () => {
    const doc = parseLw(`<template id="t1" version="1.0.0" data-sources="DATA" title="Test">
      <section id="body"><p>Hello {{ DATA.name }}</p></section>
    </template>`);
    expect(doc.meta.id).toBe("t1");
    expect(doc.meta.version).toBe("1.0.0");
    expect(doc.meta.title).toBe("Test");
    expect(doc.nodes).toHaveLength(1);
  });

  it("marks ai-editable=false", () => {
    const doc = parseLw(`<template id="t"><section ai-editable="false"><p>legal</p></section></template>`);
    expect(doc.nodes[0]).toMatchObject({ type: "element", aiEditable: false });
  });
});

describe("compose", () => {
  it("renders conditionals, repeats and formatting end-to-end", () => {
    const source = `<template id="invoice" version="1.0.0" data-sources="DATA" title="Invoice">
      <section if="DATA.customer.type == 'B2B'">
        <p>Dear {{ DATA.customer.name }}</p>
      </section>
      <table>
        <tbody>
          <tr repeat="row in DATA.items">
            <td>{{ row.description }}</td>
            <td class="amount" data-bind="row.amount" format="currency" currency="EUR" locale="de-DE"></td>
          </tr>
        </tbody>
      </table>
    </template>`;
    const { html, warnings } = compose({
      source,
      dataSources: {
        DATA: {
          customer: { type: "B2B", name: "Acme GmbH" },
          items: [
            { description: "Consulting", amount: 1200 },
            { description: "License", amount: 300.5 },
          ],
        },
      },
    });
    expect(warnings).toHaveLength(0);
    expect(html).toContain("Dear Acme GmbH");
    expect(html).toContain("Consulting");
    // de-DE currency formatting uses comma decimal + euro sign
    expect(html).toMatch(/1\.200,00\s*€/);
    expect(html).toContain("<!doctype html>");
  });

  it("hides section when condition is false", () => {
    const { html } = compose({
      source: `<template id="t"><section if="DATA.show"><p>secret</p></section></template>`,
      dataSources: { DATA: { show: false } },
      fullDocument: false,
    });
    expect(html).not.toContain("secret");
  });

  it("escapes interpolated values to prevent injection", () => {
    const { html } = compose({
      source: `<template id="t"><p>{{ DATA.x }}</p></template>`,
      dataSources: { DATA: { x: "<script>alert(1)</script>" } },
      fullDocument: false,
    });
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
  });
});

describe("barcode", () => {
  it("renders QR, EAN-13 and Code 128 to SVG", () => {
    expect(renderBarcodeSvg("qrcode", "INV-2026")).toContain("<svg");
    expect(renderBarcodeSvg("ean13", "4006381333931")).toContain("<svg");
    expect(renderBarcodeSvg("code128", "ABC-123", { showText: true })).toContain("<svg");
  });
  it("falls back to a placeholder on invalid data", () => {
    const svg = renderBarcodeSvg("ean13", "not-a-number");
    expect(svg).toContain("lw-barcode-error");
  });
  it("parses <lw-barcode> with an expression value and composes it", () => {
    const doc = parseLw(
      `<template id="t"><lw-barcode type="qrcode" value="{{ DATA.id }}"></lw-barcode></template>`,
    );
    expect(doc.nodes[0]).toMatchObject({ type: "barcode", symbology: "qrcode", isExpr: true, value: "DATA.id" });
    const { html } = compose({ source:
      `<template id="t"><lw-barcode type="qrcode" value="{{ DATA.id }}"></lw-barcode></template>`,
      dataSources: { DATA: { id: "X-1" } }, fullDocument: false });
    expect(html).toContain("<svg");
    expect(html).toContain('role="img"');
  });
});

describe("serializer round-trip", () => {
  it("re-serializes parsed IR to equivalent .lw", () => {
    const src = `<template id="invoice" version="1.0.0" data-sources="DATA" title="Invoice">
      <section id="s" class="lw-section">
        <h1 style="color:red">{{ DATA.brand.name }}</h1>
        <p if="DATA.notes">Note: {{ DATA.notes }}</p>
        <table><tbody>
          <tr repeat="row in DATA.items">
            <td data-bind="row.amount" format="currency" currency="{{ DATA.cur }}"></td>
          </tr>
        </tbody></table>
        <lw-barcode type="qrcode" value="{{ DATA.id }}"></lw-barcode>
        <p data-block="blocks/footer" ai-editable="false"></p>
      </section>
    </template>`;
    const doc = parseLw(src);
    const reparsed = parseLw(serializeLw(doc));
    expect(stripLoc(reparsed)).toEqual(stripLoc(doc));
  });
});
