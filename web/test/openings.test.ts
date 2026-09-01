import assert from "node:assert/strict";
import test from "node:test";
import {
  openingDimensions,
  openingStagePoints,
  openingTemplateFromShape,
  sanitizeOpeningTemplates,
} from "../src/lib/openings.js";

test("a deduction becomes a named, project-scoped opening in real feet", () => {
  const shape = {
    measure_role: "deduct",
    verts_norm: [[0.4, 0.3], [0.6, 0.3], [0.6, 0.7], [0.4, 0.7]],
  };
  const template = openingTemplateFromShape(shape, { w: 1000, h: 500 }, 0.01, "Porte P1", "opening-1")!;

  assert.equal(template.id, "opening-1");
  assert.equal(template.name, "Porte P1");
  assert.deepEqual(openingDimensions(template), { width_ft: 2, height_ft: 2 });
});

test("an opening keeps its physical dimensions on a differently scaled sheet", () => {
  const template = {
    id: "opening-1",
    name: "Fenêtre F2",
    offsets_ft: [[-1, -2.5], [1, -2.5], [1, 2.5], [-1, 2.5]],
  };

  assert.deepEqual(openingStagePoints(template, [300, 400], 0.005), [
    [100, -100],
    [500, -100],
    [500, 900],
    [100, 900],
  ]);
});

test("opening hydration removes corrupt, duplicate, and unnamed entries", () => {
  const clean = sanitizeOpeningTemplates([
    { id: "one", name: " Porte 1 ", offsets_ft: [[0, 0], [1, 0], [1, 1]] },
    { id: "one", name: "duplicate", offsets_ft: [[0, 0], [2, 0], [2, 2]] },
    { id: "two", name: "", offsets_ft: [[0, 0], [1, 0], [1, 1]] },
    { id: "three", name: "broken", offsets_ft: [[0, 0]] },
  ]);

  assert.deepEqual(clean, [{ id: "one", name: "Porte 1", offsets_ft: [[0, 0], [1, 0], [1, 1]] }]);
});

