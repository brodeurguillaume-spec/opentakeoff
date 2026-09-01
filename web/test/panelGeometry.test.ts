import assert from "node:assert/strict";
import test from "node:test";
import { panelAt, stageExtent } from "../src/lib/panelGeometry.js";

const row = [
  { key: "A", xOffset: 0, yOffset: 0, img: { w: 100, h: 200 } },
  { key: "B", xOffset: 148, yOffset: 0, img: { w: 80, h: 120 } },
];

const column = [
  { key: "A", xOffset: 0, yOffset: 0, img: { w: 100, h: 200 } },
  { key: "B", xOffset: 0, yOffset: 248, img: { w: 80, h: 120 } },
];

test("stage extent supports both horizontal and vertical sheet groups", () => {
  assert.deepEqual(stageExtent(row), { w: 228, h: 200 });
  assert.deepEqual(stageExtent(column), { w: 100, h: 368 });
});

test("panelAt routes a point by both stage axes", () => {
  assert.equal(panelAt(column, 20, 40).key, "A");
  assert.equal(panelAt(column, 20, 300).key, "B");
  assert.equal(panelAt(row, 170, 40).key, "B");
});

test("a click in the gap routes to the nearest sheet", () => {
  assert.equal(panelAt(column, 20, 220).key, "A");
  assert.equal(panelAt(column, 20, 236).key, "B");
});
