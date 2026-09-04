import test from "node:test";
import assert from "node:assert/strict";
import { surfaceQuantity, MEASUREMENT_FAMILIES } from "../src/lib/measurementPresentation.js";
import { LEGACY_TRADE_FEATURES, LEGACY_SURFACE_COLUMNS, legacyRollWarning, legacyAreaReferences } from "../src/lib/legacyTradeBehavior.js";
import { FLOORING_DEFAULTS, ROLL_GOODS_UI_ENABLED } from "../src/lib/canvasConstants.js";
import { FLOORING_DEFAULTS as archivedDefaults } from "../src/lib/legacyFlooringDefaults.js";
import { TABLE_PROFILE, CSV_PROFILE, visibleCols } from "../src/lib/reportColumns.js";
import { conditionTotals, sheetTotals } from "../src/lib/totals.js";
import { computeShapeMetrics } from "../src/lib/shapeMetrics.js";

test("generic measuring families do not infer a trade or material", () => {
  assert.equal(MEASUREMENT_FAMILIES.floor_area, "surface");
  assert.equal(MEASUREMENT_FAMILIES.surface_area, "surface");
  assert.equal(MEASUREMENT_FAMILIES.linear, "longueur");
  assert.equal(MEASUREMENT_FAMILIES.count_run, "unités");
  assert.equal(MEASUREMENT_FAMILIES.count, "unités");
});

test("surface display uses total exactly once and respects an explicit zero", () => {
  assert.equal(surfaceQuantity({ total_sf: 130, floor_sf: 100, wall_sf: 20, border_sf: 10 }), 130);
  assert.equal(surfaceQuantity({ total_sf: 0, floor_sf: 100 }), 0);
  assert.equal(surfaceQuantity({ floor_sf: 100, wall_sf: 20, border_sf: 10 }), 130);
  assert.equal(surfaceQuantity({ floor_sf: -25, wall_sf: 10 }), -15);
  assert.equal(surfaceQuantity(null), 0);
});

test("mixed methods retain quantities, multiplier and waste without duplicate cutouts", () => {
  const conditions = [{ id: "p", finish_tag: "Produit", multiplier: 2, waste_pct: 10 }];
  const shapes = [
    { sheet_id: "s", condition_id: "p", measure_role: "floor_area", computed: { area_sf: 90 } }, // already net of linked hole
    { sheet_id: "s", condition_id: "p", measure_role: "deduct", cuts_shape_id: "parent", computed: { area_sf: 10 } },
    { sheet_id: "s", condition_id: "p", measure_role: "surface_area", computed: { area_sf: 20, perimeter_lf: 5 } },
    { sheet_id: "s", condition_id: "p", measure_role: "linear", computed: { area_sf: 10, perimeter_lf: 30 } },
    { sheet_id: "s", condition_id: "p", measure_role: "count", computed: { count: 1 } },
    { sheet_id: "s", condition_id: "p", measure_role: "count_run", computed: { count: 4, guide_lf: 10 } },
  ];
  const [row] = conditionTotals(conditions, shapes);
  assert.equal(surfaceQuantity(row), 240);
  assert.equal(row.total_sf_net, 264);
  assert.equal(row.lf, 60); // Surface Area and Count guide are not billable LF
  assert.equal(row.ea, 10);
  assert.equal(surfaceQuantity(sheetTotals(conditions, shapes)[0].rows[0]), 120); // base, before ×N
});

test("Area stays an area even when its Product has a height; explicit Surface/Linear dimensions still work", () => {
  const dims = { w: 10, h: 10 }, cond = { height_ft: 8, thickness_in: 12 };
  const area = computeShapeMetrics({ measure_role: "floor_area", verts_norm: [[0, 0], [1, 0], [1, 1], [0, 1]] }, dims, 1, cond);
  assert.equal(area.area_sf, 100);
  assert.ok(!("volume_cy" in area));
  const surface = computeShapeMetrics({ measure_role: "surface_area", height_ft: 4, verts_norm: [[0, 0], [1, 0]] }, dims, 1, cond);
  assert.equal(surface.area_sf, 40);
  const line = computeShapeMetrics({ measure_role: "linear", verts_norm: [[0, 0], [1, 0]] }, dims, 1, cond);
  assert.equal(line.perimeter_lf, 10); assert.equal(line.area_sf, 10);
});

test("generic UI does not revive legacy surface columns from saved preferences", () => {
  const cols = visibleCols(TABLE_PROFILE, { floor_sf: true, wall_sf: true, border_sf: true });
  assert.ok(cols.some((c: {key: string}) => c.key === "total_sf"));
  assert.ok(!cols.some((c: {key: string}) => ["floor_sf", "wall_sf", "border_sf"].includes(c.key)));
  assert.deepEqual(LEGACY_SURFACE_COLUMNS.map((c) => c.key), ["floor_sf", "wall_sf", "border_sf"]);
  assert.ok(CSV_PROFILE.some((c) => c.key === "wall_sf")); // public compatibility stays
});

test("old trade warnings and extrusion references remain testable but dormant by default", () => {
  assert.ok(Object.values(LEGACY_TRADE_FEATURES).every((enabled) => enabled === false));
  assert.equal(ROLL_GOODS_UI_ENABLED, false);
  assert.equal(legacyRollWarning([50, 100]), false);
  assert.equal(legacyRollWarning([11.97], true), false);
  assert.equal(legacyRollWarning([11.98], true), true);
  assert.equal(legacyAreaReferences(100, 40, 8), null);
  assert.deepEqual(legacyAreaReferences(100, 40, 8, true), { surface_sf: 320, volume_cy: 800 / 27 });
});

test("archived starter templates remain available from their old import, with full data", () => {
  assert.equal(FLOORING_DEFAULTS, archivedDefaults);
  assert.deepEqual(FLOORING_DEFAULTS.map((c) => c.finish_tag), ["CPT-1", "BRD-1", "LVT-1", "WD-1", "VCT-1", "SV-1", "CT-1", "RB-1", "TR-1"]);
  const grout = FLOORING_DEFAULTS.find((c) => c.finish_tag === "CT-1")?.materials[1];
  assert.ok(grout && "grout" in grout && grout.grout?.tileL === 12);
});
