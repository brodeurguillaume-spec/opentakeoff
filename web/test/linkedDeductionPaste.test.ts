import { test } from "node:test";
import assert from "node:assert/strict";
import { cutoutAreaChangeAllowed, prepareLinkedCutoutPaste, recomposeCutouts, ringFullyInside, subtractCutout } from "../src/lib/cutout.js";
import { applyShapeCommand, geomSnapshot } from "../src/lib/shapeCommands.js";
import { resolveRegionScale } from "../src/lib/regionScale.ts";

const square = (lo: number, hi: number) => [[lo, lo], [hi, lo], [hi, hi], [lo, hi]];

test("clipboard permits zero new cut area; ordinary drawing still refuses duplicate cuts", () => {
  assert.equal(cutoutAreaChangeAllowed(100, 96), true);
  assert.equal(cutoutAreaChangeAllowed(96, 96), false);
  assert.equal(cutoutAreaChangeAllowed(96, 96, { allowNoop: true }), true);
  assert.equal(cutoutAreaChangeAllowed(96, 97, { allowNoop: true }), false);
  assert.equal(cutoutAreaChangeAllowed(96, NaN, { allowNoop: true }), false);
});

test("linked paste tries the offset once when it fits", () => {
  const source = square(0.2, 0.3), before = structuredClone(source);
  let calls = 0;
  const result = prepareLinkedCutoutPaste(source, 0.03, (verts: number[][]) => {
    calls++;
    return { cut: { verts } };
  });
  assert.equal(calls, 1);
  assert.equal(result.overSource, false);
  assert.deepEqual(result.cut.verts, source.map(([x, y]) => [x + 0.03, y + 0.03]));
  assert.deepEqual(source, before);
});

test("linked paste falls back to its intact source when the nudge leaves its parent", () => {
  const source = square(0.77, 0.89), parent = square(0.1, 0.9);
  const result = prepareLinkedCutoutPaste(source, 0.03, (verts: number[][]) =>
    ringFullyInside(parent, verts) ? { cut: { verts } } : { error: "outside parent" });
  assert.equal(result.overSource, true);
  assert.deepEqual(result.cut.verts, source);
  assert.notEqual(result.cut.verts[0], source[0], "no alias back to the clipboard");
});

test("a zone-only sheet retries the original geometry after the nudge crosses its scale zone", () => {
  const zone: any = {
    id: "zone", sheet_id: "a.pdf#1", purposes: ["scale"],
    geometry: { type: "polygon", verts_norm: square(0.1, 0.9) },
    review: { status: "confirmed" },
    scale_profile: { units_per_px: 0.1, confirmed: true, source: "human" },
  };
  const statuses: string[] = [];
  const result = prepareLinkedCutoutPaste(square(0.77, 0.89), 0.03, (verts: any) => {
    const scale = resolveRegionScale({ sheet_id: "a.pdf#1", geometry: { kind: "polygon", verts_norm: verts }, regions: [zone], sheet_units_per_px: null });
    statuses.push(scale.status);
    return scale.status === "resolved" ? { cut: { verts, upp: scale.units_per_px } } : { error: scale.message };
  });
  assert.deepEqual(statuses, ["crosses_zone", "resolved"]);
  assert.equal(result.overSource, true);
  assert.equal(result.cut.upp, 0.1);
});

test("near the page edge paste never clamps individual vertices and deforms the opening", () => {
  const source = square(0.95, 0.99);
  const tried: number[][][] = [];
  const result = prepareLinkedCutoutPaste(source, 0.03, (verts: number[][]) => {
    tried.push(verts);
    return verts.some(([x, y]) => x > 1 || y > 1) ? { error: "outside sheet" } : { cut: { verts } };
  });
  assert.equal(tried[0][1][0], 1.02);
  assert.deepEqual(result.cut.verts, source);
});

test("an invalid source also refuses paste without manufacturing a cut", () => {
  const result = prepareLinkedCutoutPaste(square(0.1, 0.2), 0.03, () => ({ error: "unconfirmed scale" }));
  assert.equal(result.error, "unconfirmed scale");
  assert.equal(result.cut, undefined);
});

test("copy overlay → move overlapping → move separate → delete copy keeps parent and undo/redo exact", () => {
  const base = square(0, 1), source = square(0.2, 0.4);
  const snapshot = (r: any) => ({ verts_norm: r.outer, verts_norm_holes: r.holes, computed: { area_sf: +(r.area * 100).toFixed(6), perimeter_lf: r.perim * 10 } });
  const initial = subtractCutout(base, [], source)!;
  const parent: any = { id: "parent", sheet_id: "a.pdf#1", condition_id: "product", measure_role: "floor_area", ...snapshot(initial) };
  const original: any = { id: "source", sheet_id: parent.sheet_id, condition_id: parent.condition_id, measure_role: "deduct", cuts_shape_id: parent.id, verts_norm: source, computed: { area_sf: 4 }, origin: { method: "cutout_v1", parent_prev: { verts_norm: base, computed: { area_sf: 100 } } } };
  const before = [parent, original];
  const overlay = subtractCutout(initial.outer, initial.holes, source)!;
  assert.equal(cutoutAreaChangeAllowed(initial.area, overlay.area, { allowNoop: true }), true);
  const pasted = applyShapeCommand(before, { type: "cutout", parentId: parent.id, parentNext: snapshot(overlay), shape: { ...original, id: "copy", origin: { method: "cutout_v1", copied: true, parent_prev: snapshot(initial) } } } as any);
  assert.equal(pasted.shapes[0].computed.area_sf, 96, "overlay never double-deducts");
  assert.deepEqual(applyShapeCommand(pasted.shapes, pasted.inverse).shapes, before);
  let state = pasted.shapes;
  for (const [ring, expected] of [[square(0.3, 0.5), 93], [square(0.6, 0.8), 92]] as [number[][], number][]) {
    const currentCopy = state.find((s: any) => s.id === "copy");
    const recomposed = recomposeCutouts(base, [], [source, ring])!;
    const move = applyShapeCommand(state, { type: "cutoutGeom", id: "copy", parentId: parent.id, editKind: "move", verts_norm: ring, computed: currentCopy.computed, prev: geomSnapshot(currentCopy), parentNext: snapshot(recomposed) } as any);
    assert.equal(move.shapes[0].computed.area_sf, expected);
    assert.deepEqual(applyShapeCommand(move.shapes, move.inverse).shapes, state);
    state = move.shapes;
  }
  const surviving = recomposeCutouts(base, [], [source])!;
  const deleted = applyShapeCommand(state, { type: "cutout", restore: true, deductId: "copy", parentId: parent.id, parentPrev: snapshot(surviving) } as any);
  assert.equal(deleted.shapes.length, 2);
  assert.equal(deleted.shapes[0].computed.area_sf, 96);
  assert.deepEqual(deleted.shapes[1], original);
  const undoDelete = applyShapeCommand(deleted.shapes, deleted.inverse);
  assert.deepEqual(undoDelete.shapes, state);
  assert.deepEqual(applyShapeCommand(undoDelete.shapes, undoDelete.inverse).shapes, deleted.shapes);
});
