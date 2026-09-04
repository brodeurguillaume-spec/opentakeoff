import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { productReportDetails, sortReportRows, loadReportSort, saveReportSort } from "../src/lib/reportPresentation.js";
import ReportProduct from "../src/components/ReportProduct.jsx";
import { conditionTotals, grandTotals, sheetTotals } from "../src/lib/totals.js";
import { TABLE_PROFILE, CSV_PROFILE, applyUnits } from "../src/lib/reportColumns.js";
import { conditions, shapes } from "./fixtures/report.fixture.ts";

test("optional report details: legacy products and invalid imported values stay blank", () => {
  assert.deepEqual(productReportDetails(undefined), { description: "", notes: "" });
  assert.deepEqual(productReportDetails({ description: {}, report_notes: 5 }), { description: "", notes: "" });
  assert.deepEqual(productReportDetails({ description: "  Brique  ", report_notes: "  Vérifier au chantier.\nJoints de 1/2 po.  " }),
    { description: "Brique", notes: "Vérifier au chantier.\nJoints de 1/2 po." });
});

test("product cell prints full description + multiline notes as escaped text, not markup", () => {
  const row = { finish_tag: "BR1", color: "#0099aa", multiplier: 2 };
  const product = { description: "Brique Rinox — Oxford Silver White ".repeat(30), report_notes: 'À confirmer\n<script>alert("test")</script>' };
  const html = renderToStaticMarkup(React.createElement(ReportProduct, { row, product }));
  assert.ok(html.includes(product.description.trim()));
  assert.ok(html.includes("À confirmer\n&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("white-space:pre-wrap"));
  assert.ok(html.includes("overflow-wrap:anywhere"));
  assert.ok(html.includes("BR1") && html.includes("×2"));
  const legacy = renderToStaticMarkup(React.createElement(ReportProduct, { row, product: {} }));
  assert.ok(!legacy.includes("report-product-notes") && !legacy.includes("report-product-description"));
});

test("prose never enters contribution-ready totals and never changes measured quantities", () => {
  const described = conditions.map((c) => ({ ...c, description: "Description confidentielle", report_notes: "Notes client\nDeuxième ligne" }));
  assert.deepEqual(conditionTotals(described, shapes), conditionTotals(conditions, shapes));
  assert.deepEqual(sheetTotals(described, shapes), sheetTotals(conditions, shapes));
  assert.ok(!JSON.stringify(conditionTotals(described, shapes)).includes("confidentielle"));
});

test("TAG sorting is natural, stable, view-only and keeps totals and product order intact", () => {
  const rows = [{ id: "10", finish_tag: "BR10" }, { id: "2", finish_tag: "BR2" }, { id: "1", finish_tag: "BR1" }, { id: "other", finish_tag: "BR2" }];
  assert.equal(sortReportRows(rows, "manual"), rows);
  assert.deepEqual(sortReportRows(rows, "tag").map((r: { id: string }) => r.id), ["1", "2", "other", "10"]);
  assert.deepEqual(rows.map((r) => r.id), ["10", "2", "1", "other"]);
  const totals = conditionTotals(conditions, shapes);
  assert.deepEqual(grandTotals(sortReportRows(totals, "tag")), grandTotals(totals));
});

test("sort preference survives reload and gracefully falls back without storage", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k: string) => values.get(k), setItem: (k: string, v: string) => values.set(k, v) } });
  try {
    assert.equal(loadReportSort(), "manual");
    saveReportSort("tag"); assert.equal(loadReportSort(), "tag");
    saveReportSort("invalid"); assert.equal(loadReportSort(), "manual");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
    assert.equal(loadReportSort(), "manual");
    assert.doesNotThrow(() => saveReportSort("tag"));
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete (globalThis as any).localStorage;
  }
});

test("generic surface headers preserve legacy CSV keys and metric conversion", () => {
  assert.equal(TABLE_PROFILE.find((c) => c.key === "total_sf")?.header, "Surface SF");
  assert.equal(applyUnits(TABLE_PROFILE, "metric").find((c: { key: string }) => c.key === "total_sf")?.header, "Surface m²");
  assert.equal(CSV_PROFILE.find((c) => c.key === "wall_sf")?.header, "Wall SF");
});
