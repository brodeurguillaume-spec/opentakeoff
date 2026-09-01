import test from "node:test";
import assert from "node:assert/strict";
import { mapRegionForShape, mapZoneTree, pointInMapPolygon } from "../src/lib/mapZones.js";

const region = (id: string, name: string, verts: number[][], extra = {}) => ({
  id, name, sheet_id: "A401", kind: "view", purposes: ["semantic"],
  geometry: { type: "polygon", verts_norm: verts }, review: { status: "confirmed" }, ...extra,
});

test("map polygons include their boundary", () => {
  const square = [[0, 0], [1, 0], [1, 1], [0, 1]];
  assert.equal(pointInMapPolygon([0.5, 0.5], square), true);
  assert.equal(pointInMapPolygon([1, 0.5], square), true);
  assert.equal(pointInMapPolygon([1.1, 0.5], square), false);
});

test("a shape uses the smallest confirmed semantic enclosure", () => {
  const outer = region("outer", "Elevation", [[0, 0], [1, 0], [1, 1], [0, 1]]);
  const inner = region("inner", "Detail", [[0.2, 0.2], [0.6, 0.2], [0.6, 0.6], [0.2, 0.6]], { parent_id: "outer" });
  const proposed = region("draft", "Draft", [[0.25, 0.25], [0.5, 0.25], [0.5, 0.5], [0.25, 0.5]], { review: { status: "proposed" } });
  const shape = { sheet_id: "A401", verts_norm: [[0.3, 0.3], [0.4, 0.3], [0.4, 0.4]] };
  assert.equal(mapRegionForShape(shape, [outer, inner, proposed])?.id, "inner");
});

test("crossing and unmapped shapes stay unassigned", () => {
  const zone = region("z", "Zone", [[0, 0], [0.5, 0], [0.5, 1], [0, 1]]);
  assert.equal(mapRegionForShape({ sheet_id: "A401", verts_norm: [[0.4, 0.5], [0.6, 0.5]] }, [zone]), null);
  assert.equal(mapRegionForShape({ sheet_id: "A402", verts_norm: [[0.2, 0.2]] }, [zone]), null);
});

test("tree lists parents before children and preserves sheet scope", () => {
  const child = region("c", "Child", [[0, 0], [0.2, 0], [0.2, 0.2]], { parent_id: "p" });
  const parent = region("p", "Parent", [[0, 0], [1, 0], [1, 1]]);
  const rows = mapZoneTree([child, parent]);
  assert.deepEqual(rows.map(({ region: item, depth }) => [item.id, depth]), [["p", 0], ["c", 1]]);
});

test("tree keeps cyclic migrated zones visible for repair", () => {
  const a = region("a", "A", [[0, 0], [1, 0], [1, 1]], { parent_id: "b" });
  const b = region("b", "B", [[0, 0], [1, 0], [0, 1]], { parent_id: "a" });
  const rows = mapZoneTree([a, b]);
  assert.deepEqual(rows.map(({ region: item }) => item.id).sort(), ["a", "b"]);
});
