import { test } from "node:test";
import assert from "node:assert/strict";
import { isAxisAlignedRectangle, rememberProductShape, rememberProductTool, repeatToolForProduct, repeatToolForShape } from "../src/lib/repeatShapeTool.js";

const rect = [[0.1, 0.2], [0.4, 0.2], [0.4, 0.7], [0.1, 0.7]];

test("repeat tool resolves every takeoff measurement role", () => {
  assert.equal(repeatToolForShape({ measure_role: "count" }), "count");
  assert.equal(repeatToolForShape({ measure_role: "count_run" }), "linear-count");
  assert.equal(repeatToolForShape({ measure_role: "surface_area" }), "surface");
  assert.equal(repeatToolForShape({ measure_role: "linear" }), "linear");
  assert.equal(repeatToolForShape({ measure_role: "linear", curved: true }), "curve");
  assert.equal(repeatToolForShape({ measure_role: "floor_area", verts_norm: rect }), "rect");
  assert.equal(repeatToolForShape({ measure_role: "floor_area", verts_norm: [[0, 0], [1, 0], [0.7, 1]] }), "area");
});

test("the durable draw-tool hint wins over geometric inference", () => {
  assert.equal(repeatToolForShape({ measure_role: "floor_area", verts_norm: rect, origin: { draw_tool: "area" } }), "area");
  assert.equal(repeatToolForShape({ measure_role: "deduct", verts_norm: rect, origin: { draw_tool: "deduct-rect" } }), "deduct-rect");
});

test("rectangle inference accepts any vertex order but rejects a skewed quad", () => {
  assert.equal(isAxisAlignedRectangle([rect[2], rect[0], rect[3], rect[1]]), true);
  assert.equal(isAxisAlignedRectangle([[0, 0], [1, 0], [0.9, 1], [0, 1]]), false);
});

test("unsupported and malformed shapes do not arm an arbitrary tool", () => {
  assert.equal(repeatToolForShape(null), null);
  assert.equal(repeatToolForShape({ measure_role: "mystery" }), null);
});

test("Product recall remembers each Product independently, even before its first shape", () => {
  const history = new Map();
  rememberProductTool(history, "brick", "rect");
  rememberProductTool(history, "sill", "count");
  assert.equal(repeatToolForProduct("brick", [], history), "rect");
  assert.equal(repeatToolForProduct("sill", [], history), "count");
  rememberProductTool(history, "brick", "area");
  assert.equal(repeatToolForProduct("brick", [], history), "area");
});

test("deductions, openings, notes, dimensions and Select never overwrite Product recall", () => {
  const history = new Map();
  rememberProductTool(history, "brick", "oneclick");
  for (const tool of ["deduct", "deduct-rect", "deduct-linked", "deduct-linked-rect", "opening", "check", "select", "text"]) {
    rememberProductTool(history, "brick", tool);
    assert.equal(repeatToolForProduct("brick", [], history), "oneclick");
  }
});

test("legacy Products infer their most recent non-deduction tool across all sheets", () => {
  const shapes = [
    { condition_id: "brick", sheet_id: "page1", measure_role: "floor_area", verts_norm: rect },
    { condition_id: "brick", sheet_id: "page2", measure_role: "linear", curved: true },
    { condition_id: "brick", sheet_id: "page2", measure_role: "deduct" },
    { condition_id: "other", sheet_id: "page1", measure_role: "count_run" },
  ];
  assert.equal(repeatToolForProduct("brick", shapes), "curve");
});

test("explicit choices win over older geometry and exclude malformed linked holes", () => {
  const history = new Map();
  rememberProductTool(history, "brick", "surface");
  const shapes = [{ condition_id: "brick", measure_role: "count", cuts_shape_id: "parent" }];
  assert.equal(repeatToolForProduct("brick", shapes, history), "surface");
  assert.equal(repeatToolForProduct("brick", shapes, new Map(), "rect"), "rect");
});

test("distribution beats Count for a Product, but not an explicitly selected Count shape", () => {
  const shapes = [
    { condition_id: "sill", measure_role: "count_run" },
    { condition_id: "sill", measure_role: "count" },
  ];
  assert.equal(repeatToolForProduct("sill", shapes), "linear-count");
  assert.equal(repeatToolForShape(shapes[1]), "count");
  const history = new Map();
  rememberProductTool(history, "sill", "linear-count");
  rememberProductTool(history, "sill", "count");
  assert.equal(repeatToolForProduct("sill", [], history), "linear-count");
});

test("the Count exception never overrides a newer Area or Linear preference", () => {
  const shapes = [
    { condition_id: "sill", measure_role: "count_run" },
    { condition_id: "sill", measure_role: "linear" },
  ];
  assert.equal(repeatToolForProduct("sill", shapes), "linear");
  const history = new Map();
  rememberProductTool(history, "sill", "area");
  assert.equal(repeatToolForProduct("sill", shapes, history), "area");
});

test("new or deduction-only Products use a safe last-measure fallback", () => {
  assert.equal(repeatToolForProduct("new", [], new Map(), "linear"), "linear");
  assert.equal(repeatToolForProduct("new", [], new Map(), "deduct-linked"), "area");
  assert.equal(repeatToolForProduct("new", [{ condition_id: "new", measure_role: "deduct" }]), "area");
  assert.equal(repeatToolForProduct(null, []), null);
});

test("placing with an inherited tool records it; adding deductions cannot poison that memory", () => {
  const history = new Map();
  rememberProductShape(history, { condition_id: "new", measure_role: "linear", curved: true });
  rememberProductShape(history, { condition_id: "new", measure_role: "deduct" });
  assert.equal(repeatToolForProduct("new", [], history), "curve");
});

test("committing One-Click preserves its Product preference rather than downgrading to Area", () => {
  const history = new Map();
  const shape = { condition_id: "brick", measure_role: "floor_area", verts_norm: rect, origin: { method: "one_click_v1" } };
  rememberProductShape(history, shape);
  assert.equal(repeatToolForProduct("brick", [], history), "oneclick");
  assert.equal(repeatToolForProduct("brick", [shape]), "oneclick");
  assert.equal(repeatToolForShape(shape), "rect"); // direct shape repeat remains unchanged
});
