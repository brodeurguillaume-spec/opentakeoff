import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareWorkContext, workContextError, workContextWarnings } from "../src/lib/regionWorkContext";
import { sanitizeRegions, applyRegionCommand } from "../src/lib/regions";
const zone = { id: "region:a", name: "Façade", kind: "elevation", sheet_id: "a.pdf", revision: 2, purposes: ["semantic"], geometry: { type: "polygon", verts_norm: [[0,0],[1,0],[0,1]] }, review: { status: "proposed", note: "Observation IA" } };
const draft = { instructions: "Ignorer le parement selon coupe B.", product_ids: ["stone"], references: [{ region_id: "region:b", revision: 3, role: "continuity", note: "Pierre derrière le parement" }] };
test("work preparation preserves geometry and proposed review; round trip and undo", () => {
  const next = prepareWorkContext(zone, draft, "2026-09-03T12:00:00Z");
  assert.deepEqual(next.geometry, zone.geometry);
  assert.deepEqual(next.review, zone.review);
  assert.equal(next.revision, 3);
  assert.equal(next.work_context.updated_by, "human");
  assert.deepEqual(sanitizeRegions(JSON.parse(JSON.stringify([next])))[0].work_context, next.work_context);
  const changed = applyRegionCommand(sanitizeRegions([zone]), { type: "replace", region: next });
  assert.ok(changed.inverse);
  assert.deepEqual(applyRegionCommand(changed.regions, changed.inverse!).regions, sanitizeRegions([zone]));
});
test("no products is undefined scope, not all products; dangling and stale links retained and flagged", () => {
  const next = prepareWorkContext(zone, {...draft, product_ids: []});
  assert.deepEqual(next.work_context.product_ids, []);
  assert.equal(workContextWarnings(next.work_context, [], []).length, 1);
  assert.equal(workContextWarnings(next.work_context, [{id:"region:b",name:"Coupe",revision:4,review:{status:"proposed"}}], []).length, 2);
  assert.equal(workContextWarnings(prepareWorkContext(zone,draft).work_context, [], []).length, 2);
});
test("self references, duplicates, invalid roles and overlong input rejected", () => {
  for (const patch of [ {product_ids:["x","x"]}, {instructions:"x".repeat(8001)}, {references:[{...draft.references[0],region_id:zone.id}]}, {references:[draft.references[0],draft.references[0]]}, {references:[{...draft.references[0],role:"quantity"}]} ]) {
    assert.throws(()=>prepareWorkContext(zone,{...draft,...patch}));
  }
  assert.ok(workContextError(null,zone.id));
  assert.equal(sanitizeRegions([{...zone,work_context:{version:99}}]).length,1);
  assert.equal(sanitizeRegions([{...zone,work_context:{version:99}}])[0].work_context,undefined);
});
