import { test } from "node:test";
import assert from "node:assert/strict";
import { linkedBodyTarget, linkedContourTarget, linkedDeductionEditNeedsScale } from "../src/lib/shapeSelection.js";

const parent = { id: "area-1", measure_role: "floor_area" };
const deduction = { id: "deduct-1", measure_role: "deduct", cuts_shape_id: parent.id };

test("a linked contour exposes its parent before deduction editing begins", () => {
  assert.equal(linkedContourTarget(deduction, parent, null), parent);
  assert.equal(linkedContourTarget(deduction, parent, "other-shape"), parent);
});

test("the second contour press opens the deduction and subsequent presses keep it open", () => {
  assert.equal(linkedContourTarget(deduction, parent, parent.id), deduction);
  assert.equal(linkedContourTarget(deduction, parent, deduction.id), deduction,
    "regression: a drag press must not toggle the selected deduction back to its parent");
});

test("free deductions and orphaned linked deductions remain deliberately reachable", () => {
  const free = { id: "free", measure_role: "deduct" };
  assert.equal(linkedContourTarget(free, parent, null), free);
  assert.equal(linkedContourTarget(deduction, null, null), deduction);
});

test("a selected parent opens exactly one linked deduction through its empty body", () => {
  assert.equal(linkedBodyTarget(parent, [deduction]), deduction);
  assert.equal(linkedBodyTarget(parent, [deduction], true), null, "positive geometry keeps click priority");
  assert.equal(linkedBodyTarget(parent, [deduction, { ...deduction, id: "deduct-2" }]), null, "ambiguous holes do not guess");
});

test("a linked deduction body never opens before its parent context", () => {
  assert.equal(linkedBodyTarget(null, [deduction]), null);
  assert.equal(linkedBodyTarget(deduction, [deduction]), null);
});

test("rigid linked-deduction moves preserve quantity without resolving a new scale zone", () => {
  assert.equal(linkedDeductionEditNeedsScale("move"), false);
  for (const edit of ["vertex", "edge", "vertexDelete", "tidy"]) {
    assert.equal(linkedDeductionEditNeedsScale(edit), true, `${edit} changes geometry and must reprice`);
  }
});
