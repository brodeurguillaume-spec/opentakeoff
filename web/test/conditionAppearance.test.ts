import assert from "node:assert/strict";
import test from "node:test";
import { clampFillOpacity, clampLineWidthPx, conditionFillOpacity, conditionLineWidthPx } from "../src/lib/conditionAppearance.js";

test("appearance values are clamped without entering measurement math", () => {
  assert.equal(clampFillOpacity(2), 1);
  assert.equal(clampFillOpacity(-1), 0);
  assert.equal(clampLineWidthPx(20), 8);
  assert.equal(clampLineWidthPx(0), 0.5);
});

test("legacy products keep their established visual defaults", () => {
  assert.equal(conditionFillOpacity({ hatch: "solid" }), 0.2);
  assert.equal(conditionFillOpacity({ hatch: "diag" }), 1);
  assert.equal(conditionLineWidthPx({}, 3), 3);
});

test("explicit appearance settings win", () => {
  const product = { fill_opacity: 0.65, line_width_px: 5 };
  assert.equal(conditionFillOpacity(product), 0.65);
  assert.equal(conditionLineWidthPx(product, 2), 5);
});
