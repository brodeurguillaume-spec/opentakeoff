import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeQuarterTurn,
  rotateApprovalForSheet,
  rotateMarkupForSheet,
  rotateNormPoint,
  rotateRegionForSheet,
  rotateShapeForSheet,
  sanitizeSheetRotations,
  sanitizeSheetTitles,
  SHEET_TITLE_MAX,
} from "../src/lib/sheetPresentation.js";

test("quarter turns normalize and four right turns return to the same point", () => {
  assert.equal(normalizeQuarterTurn(-90), 270);
  assert.equal(normalizeQuarterTurn(450), 90);
  let point = [0.2, 0.3];
  for (let i = 0; i < 4; i++) point = rotateNormPoint(point, 90);
  assert.ok(Math.abs(point[0] - 0.2) < 1e-12);
  assert.ok(Math.abs(point[1] - 0.3) < 1e-12);
});

test("sheet presentation metadata is defensive and omits defaults", () => {
  assert.deepEqual(sanitizeSheetRotations({ a: 90, b: 360, c: -90, d: "bad" }), { a: 90, c: 270 });
  assert.deepEqual(sanitizeSheetTitles({ a: "  A401   Main elevation ", b: "", c: "bad\nname", d: "x".repeat(SHEET_TITLE_MAX + 1) }), { a: "A401 Main elevation" });
});

test("rotating a sheet keeps takeoff provenance, holes and markup geometry aligned", () => {
  const shape = {
    id: "s1", sheet_id: "A", verts_norm: [[0.1, 0.2], [0.4, 0.2]],
    verts_norm_holes: [[[0.2, 0.3], [0.3, 0.3], [0.3, 0.4]]],
    origin: {
      seed_norm: [0.25, 0.5], proposed_verts_norm: [[0.1, 0.2]],
      parent_prev: { verts_norm: [[0.1, 0.1]], verts_norm_holes: [[[0.2, 0.2]]] },
    },
  };
  const turned = rotateShapeForSheet(shape, "A", 90);
  assert.deepEqual(turned.verts_norm, [[0.8, 0.1], [0.8, 0.4]]);
  assert.deepEqual(turned.origin.seed_norm, [0.5, 0.25]);
  assert.deepEqual(turned.origin.parent_prev.verts_norm_holes, [[[0.8, 0.2]]]);
  assert.equal(rotateShapeForSheet(shape, "B", 90), shape);

  const markup = rotateMarkupForSheet({ sheet_id: "A", type: "cloud", rect: [[0.1, 0.2], [0.4, 0.6]] }, "A", 90);
  assert.deepEqual(markup.rect, [[0.4, 0.1], [0.8, 0.4]]);
  assert.deepEqual(rotateApprovalForSheet({ sheet_id: "A", at: [0.2, 0.3] }, "A", 90).at, [0.7, 0.2]);
});

test("Project Map geometry and evidence boxes rotate in the same visual frame", () => {
  const region = rotateRegionForSheet({
    id: "region:1", sheet_id: "A",
    geometry: { type: "polygon", verts_norm: [[0.1, 0.2], [0.3, 0.2], [0.3, 0.4]] },
    evidence: [{ id: "e1", bbox_norm: [0.1, 0.2, 0.3, 0.4] }],
    scale_profile: { units_per_px: 2, units_per_px_y: 3 },
  }, "A", 90);
  assert.deepEqual(region.geometry.verts_norm[0], [0.8, 0.1]);
  assert.deepEqual(region.evidence[0].bbox_norm, [0.6, 0.1, 0.8, 0.3]);
  assert.deepEqual(region.scale_profile, { units_per_px: 3, units_per_px_y: 2 });
});
