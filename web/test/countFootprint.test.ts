import assert from "node:assert/strict";
import test from "node:test";
import { countFootprintDimensions, countFootprintFromVerts, countVertsAt, normalizeCountFootprint, rectangularCountFootprint } from "../src/lib/countFootprint.js";

test("a default count footprint is a calibrated 1 ft × 1 ft square", () => {
  const image = { w: 1000, h: 800 };
  const verts = countVertsAt([500, 400], image, 0.01, null)!;
  const px = verts.map(([x, y]) => [x * image.w, y * image.h]);
  assert.deepEqual(px, [[450, 350], [550, 350], [550, 450], [450, 450]]);
});

test("an edited footprint round-trips in real feet across sheets", () => {
  const first = { w: 1000, h: 800 };
  const baton = [[0.35, 0.49], [0.65, 0.49], [0.65, 0.51], [0.35, 0.51]];
  const saved = countFootprintFromVerts(baton, first, 0.01)!;
  assert.deepEqual(saved.offsets_ft, [[-1.5, -0.08], [1.5, -0.08], [1.5, 0.08], [-1.5, 0.08]]);

  const second = { w: 2000, h: 1600 };
  const placed = countVertsAt([1000, 800], second, 0.005, saved)!;
  const px = placed.map(([x, y]) => [x * second.w, y * second.h]);
  assert.deepEqual(px, [[700, 784], [1300, 784], [1300, 816], [700, 816]]);
});

test("invalid persisted symbols fall back without throwing", () => {
  assert.equal(normalizeCountFootprint({ offsets_ft: [[0, 0]] }).offsets_ft.length, 4);
});

test("a rectangular count footprint accepts precise inch dimensions", () => {
  const footprint = rectangularCountFootprint(36, 6);
  assert.deepEqual(footprint.offsets_ft, [[-1.5, -0.25], [1.5, -0.25], [1.5, 0.25], [-1.5, 0.25]]);
  assert.deepEqual(countFootprintDimensions(footprint), { width_in: 36, height_in: 6 });
});

test("zero height creates a calibrated line count footprint", () => {
  const footprint = rectangularCountFootprint(36, 0);
  assert.deepEqual(footprint.offsets_ft, [[-1.5, 0], [1.5, 0]]);
  assert.deepEqual(countFootprintDimensions(footprint), { width_in: 36, height_in: 0 });
});

test("rectangular count dimensions clamp safely to the 1/8-inch editor floor", () => {
  const footprint = rectangularCountFootprint(0, 0.01);
  assert.deepEqual(countFootprintDimensions(footprint), { width_in: 12, height_in: 0.125 });
});
