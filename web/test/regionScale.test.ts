import test from "node:test";
import assert from "node:assert/strict";
import { classifyScaleGeometry, resolveRegionScale } from "../src/lib/regionScale";
import type { PlanRegion } from "../src/lib/regions";

const square = (x0: number, y0: number, x1: number, y1: number) =>
  [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as [number, number][];

const zone = (id: string, ring: [number, number][], upp: number, extra: Partial<PlanRegion> = {}): PlanRegion => ({
  id: `region:${id}`,
  sheet_id: "A101",
  name: id,
  kind: "detail",
  geometry: { type: "polygon", verts_norm: ring },
  purposes: ["semantic", "scale"],
  revision: 1,
  scale_profile: { units_per_px: upp, label: id, source: "human", confirmed: true },
  review: { status: "confirmed" },
  ...extra,
});

test("geometry classification distinguishes inside, outside, crossing, and surrounding polygons", () => {
  const ring = square(.2, .2, .8, .8);
  assert.equal(classifyScaleGeometry({ kind: "polyline", verts_norm: [[.3, .3], [.7, .7]] }, ring), "inside");
  assert.equal(classifyScaleGeometry({ kind: "polyline", verts_norm: [[.05, .05], [.1, .1]] }, ring), "outside");
  assert.equal(classifyScaleGeometry({ kind: "polyline", verts_norm: [[.1, .5], [.9, .5]] }, ring), "crosses");
  assert.equal(classifyScaleGeometry({ kind: "polygon", verts_norm: square(.1, .1, .9, .9) }, ring), "crosses");
});

test("inside a confirmed zone uses its scale; outside falls back to the sheet", () => {
  const regions = [zone("detail", square(.2, .2, .8, .8), .01)];
  assert.deepEqual(resolveRegionScale({
    sheet_id: "A101", regions, sheet_units_per_px: .02,
    geometry: { kind: "point", verts_norm: [[.5, .5]] },
  }), {
    status: "resolved", units_per_px: .01, source: "region",
    region_id: "region:detail", region_ids: ["region:detail"], label: "detail",
  });
  assert.deepEqual(resolveRegionScale({
    sheet_id: "A101", regions, sheet_units_per_px: .02,
    geometry: { kind: "point", verts_norm: [[.05, .05]] },
  }), { status: "resolved", units_per_px: .02, source: "sheet" });
});

test("crossing a scale boundary refuses instead of falling back", () => {
  const result = resolveRegionScale({
    sheet_id: "A101", regions: [zone("detail", square(.2, .2, .8, .8), .01)], sheet_units_per_px: .02,
    geometry: { kind: "polygon", verts_norm: square(.1, .3, .4, .6) },
  });
  assert.equal(result.status, "crosses_zone");
  assert.match(result.message, /split it/);
});

test("a nested child scale overrides its parent", () => {
  const parent = zone("parent", square(.1, .1, .9, .9), .02);
  const child = zone("child", square(.3, .3, .7, .7), .005, { parent_id: parent.id });
  const result = resolveRegionScale({
    sheet_id: "A101", regions: [parent, child], sheet_units_per_px: .03,
    geometry: { kind: "polygon", verts_norm: square(.4, .4, .6, .6) },
  });
  assert.equal(result.status, "resolved");
  assert.equal(result.status === "resolved" && result.units_per_px, .005);
  assert.equal(result.status === "resolved" && result.region_id, child.id);
});

test("unrelated overlaps agree deterministically or refuse when scales conflict", () => {
  const a = zone("a", square(.1, .1, .7, .7), .01);
  const b = zone("b", square(.3, .3, .9, .9), .01);
  const geometry = { kind: "point" as const, verts_norm: [[.5, .5]] as [number, number][] };
  const agreed = resolveRegionScale({ sheet_id: "A101", regions: [b, a], geometry });
  assert.equal(agreed.status, "resolved");
  assert.deepEqual(agreed.status === "resolved" && agreed.region_ids, [a.id, b.id]);

  const conflict = resolveRegionScale({ sheet_id: "A101", regions: [a, zone("b", square(.3, .3, .9, .9), .02)], geometry });
  assert.equal(conflict.status, "ambiguous");
  assert.match(conflict.message, /conflicting scales/);
});

test("an unconfirmed or anisotropic most-specific zone blocks its parent and sheet fallback", () => {
  const parent = zone("parent", square(.1, .1, .9, .9), .02);
  const unconfirmed = zone("child", square(.3, .3, .7, .7), .01, {
    parent_id: parent.id,
    scale_profile: { units_per_px: .01, confirmed: false },
  });
  const args = {
    sheet_id: "A101", sheet_units_per_px: .03,
    geometry: { kind: "point" as const, verts_norm: [[.5, .5]] as [number, number][] },
  };
  assert.equal(resolveRegionScale({ ...args, regions: [parent, unconfirmed] }).status, "unconfirmed");
  const anisotropic = zone("child", square(.3, .3, .7, .7), .01, {
    parent_id: parent.id,
    scale_profile: { units_per_px: .01, units_per_px_y: .02, confirmed: true },
  });
  assert.equal(resolveRegionScale({ ...args, regions: [parent, anisotropic] }).status, "unsupported");
});

test("a rejected Project Map verdict suspends an otherwise confirmed scale profile", () => {
  const rejected = zone("rejected", square(.2, .2, .8, .8), .01, {
    review: { status: "rejected", fields: { scale_profile: "rejected" } },
  });
  const result = resolveRegionScale({
    sheet_id: "A101", regions: [rejected], sheet_units_per_px: .02,
    geometry: { kind: "point", verts_norm: [[.5, .5]] },
  });
  assert.equal(result.status, "unconfirmed");
  assert.match(result.message, /not human-confirmed/);
});

test("a sheet with neither a containing zone nor a sheet scale is explicitly missing", () => {
  const result = resolveRegionScale({
    sheet_id: "A101", regions: [], sheet_units_per_px: null,
    geometry: { kind: "point", verts_norm: [[.5, .5]] },
  });
  assert.equal(result.status, "missing");
});
