import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRegionCommand, editRegionGeometry, mintRegionId, reviewRegion, sanitizeRegions } from "../src/lib/regions.js";

const square = [[0.1, 0.1], [0.4, 0.1], [0.4, 0.4], [0.1, 0.4]];
const region = (over: Record<string, unknown> = {}) => ({
  id: "region:a",
  sheet_id: "A101.pdf",
  name: "Plan du rez-de-chaussée",
  kind: "plan",
  geometry: { type: "polygon", verts_norm: square },
  purposes: ["semantic"],
  revision: 1,
  review: { status: "proposed" },
  ...over,
});

test("old payloads without regions load as an empty additive collection", () => {
  assert.deepEqual(sanitizeRegions(undefined), []);
  assert.deepEqual(sanitizeRegions(null), []);
  assert.deepEqual(sanitizeRegions({}), []);
});

test("review transitions preserve rejected geometry and resolve populated fields", () => {
  const [proposed] = sanitizeRegions([region({
    id: "region:review",
    review: { status: "proposed", fields: { geometry: "proposed" } },
    scale_profile: { units_per_px: 0.01, label: "1/8 in", confirmed: false },
    purposes: ["semantic", "scale"],
  })]);
  const rejected = reviewRegion(proposed, "rejected", {
    reviewed_at: "2026-08-21T12:00:00.000Z",
    note: "Contour follows the hatch instead of the wall.",
    reason_code: "wrong_boundary",
  });
  assert.ok(rejected);
  assert.deepEqual(rejected.geometry, proposed.geometry);
  assert.equal(rejected.revision, proposed.revision + 1);
  assert.equal(rejected.review.status, "rejected");
  assert.equal(rejected.review.fields?.geometry, "rejected");
  assert.equal(rejected.review.fields?.scale_profile, "rejected");
  assert.equal(rejected.review.note, "Contour follows the hatch instead of the wall.");
  assert.equal(rejected.review.reason_code, "wrong_boundary");
});

test("an explanation can be saved without changing the current verdict", () => {
  const [confirmed] = sanitizeRegions([region({ id: "region:explained", review: { status: "confirmed" }, revision: 4 })]);
  const explained = reviewRegion(confirmed, "confirmed", {
    reviewed_at: "2026-08-21T12:01:00.000Z",
    note: "Scale confirmed against dimension string A-3.",
    reason_code: "human_explanation",
  });
  assert.ok(explained);
  assert.equal(explained.review.status, "confirmed");
  assert.equal(explained.revision, 5);
  assert.equal(explained.review.note, "Scale confirmed against dimension string A-3.");
});

test("human geometry edits confirm the contour and preserve its correction context", () => {
  const [needsReview] = sanitizeRegions([region({
    id: "region:edit",
    revision: 4,
    review: { status: "needs_review", fields: { geometry: "needs_review", name: "confirmed" }, note: "Ignore the VCT hatch." },
  })]);
  const edited = editRegionGeometry(needsReview, [[0.1, 0.1], [0.5, 0.1], [0.5, 0.4], [0.1, 0.4]], {
    reviewed_at: "2026-08-24T18:00:00.000Z",
  });
  assert.ok(edited);
  assert.equal(edited.revision, 5);
  assert.equal(edited.review.status, "confirmed");
  assert.equal(edited.review.fields?.geometry, "confirmed");
  assert.equal(edited.review.fields?.name, "confirmed");
  assert.equal(edited.review.reason_code, "human_geometry_edit");
  assert.equal(edited.review.note, "Ignore the VCT hatch.");
  assert.deepEqual(edited.geometry.verts_norm[1], [0.5, 0.1]);
  assert.equal(editRegionGeometry(needsReview, [[0, 0], [1, 1]], {}), null);
});

test("a complete region preserves the durable mapping contract", () => {
  const [got] = sanitizeRegions([region({
    purposes: ["semantic", "scale", "analysis", "scale"],
    scale_profile: {
      units_per_px: 0.02,
      units_per_px_y: 0.021,
      label: "1/4\" = 1'-0\"",
      source: "detected",
      confirmed: false,
      confidence: 0.88,
      evidence_ids: ["ev-scale", "ev-scale"],
    },
    analysis_profile: {
      include_layers: ["Walls", "Structure", "Walls"],
      exclude_layers: ["Hatch"],
    },
    evidence: [{ id: "ev-scale", kind: "scale_note", text: "Scale 1/4", bbox_norm: [0.2, 0.2, 0.3, 0.3], confidence: 0.88 }],
    links: [{ id: "link-1", type: "detail_of", target_sheet_id: "A301.pdf", tag: "2/A301", status: "proposed", confidence: 0.73, evidence_ids: ["ev-scale"] }],
    assessments: { boundary: { confidence: 0.94, status: "proposed", evidence_ids: ["ev-scale"] } },
    review: { status: "needs_review", fields: { geometry: "confirmed", scale_profile: "needs_review" }, reason_code: "scale_missing", note: "Confirm with a known dimension." },
    future_field: { survives: true },
  })]);
  assert.equal((got.future_field as { survives: boolean }).survives, true, "unknown additive fields survive a valid record");
  assert.deepEqual(got.purposes, ["semantic", "scale", "analysis"]);
  assert.deepEqual(got.scale_profile?.evidence_ids, ["ev-scale"]);
  assert.deepEqual(got.analysis_profile?.include_layers, ["Walls", "Structure"]);
  assert.equal(got.links?.[0].target_sheet_id, "A301.pdf");
  assert.equal(got.assessments?.boundary.confidence, 0.94);
  assert.equal(got.review.fields?.geometry, "confirmed");
});

test("malformed and duplicate records are dropped without wedging valid siblings", () => {
  const got = sanitizeRegions([
    null,
    region({ id: "wrong-prefix" }),
    region({ id: "region:short", geometry: { type: "polygon", verts_norm: [[0, 0], [1, 1]] } }),
    region({ id: "region:outside", geometry: { type: "polygon", verts_norm: [[0, 0], [2, 0], [0, 1]] } }),
    region({ id: "region:flat", geometry: { type: "polygon", verts_norm: [[0, 0], [0.5, 0.5], [1, 1]] } }),
    region(),
    region({ name: "duplicate loses" }),
  ]);
  assert.equal(got.length, 1);
  assert.equal(got[0].name, "Plan du rez-de-chaussée");
});

test("geometry removes a redundant closing point and malformed optionals cannot leak through", () => {
  const [got] = sanitizeRegions([region({
    geometry: { type: "polygon", verts_norm: [...square, square[0]] },
    parent_id: 42,
    scale_profile: { units_per_px: -1 },
    analysis_profile: { include_layers: ["", 7] },
    evidence: "bad",
    links: [{ id: "self", type: "same", target_region_id: "region:a" }],
    assessments: { scale: { confidence: 4 } },
    origin: "bad",
    review: { status: "invented", fields: { scale: "invented" } },
  })]);
  assert.equal(got.geometry.verts_norm.length, 4);
  assert.equal("parent_id" in got, false);
  assert.equal("scale_profile" in got, false);
  assert.equal("analysis_profile" in got, false);
  assert.equal("evidence" in got, false);
  assert.equal("links" in got, false);
  assert.equal("assessments" in got, false);
  assert.equal("origin" in got, false);
  assert.deepEqual(got.review, { status: "needs_review" });
});

test("scale and analysis profiles add their capabilities when the proposal omitted them", () => {
  const [got] = sanitizeRegions([region({
    purposes: ["semantic"],
    scale_profile: { label: "1/8\" = 1'-0\"" },
    analysis_profile: { exclude_hatches: ["VCT-1"] },
  })]);
  assert.deepEqual(got.purposes, ["semantic", "scale", "analysis"]);
});

test("parents must exist on the same sheet and cycles are broken", () => {
  const got = sanitizeRegions([
    region({ id: "region:parent", name: "Floor" }),
    region({ id: "region:child", name: "Room", parent_id: "region:parent" }),
    region({ id: "region:other-sheet", sheet_id: "A102.pdf", parent_id: "region:parent" }),
    region({ id: "region:dangling", parent_id: "region:nope" }),
    region({ id: "region:cycle-a", parent_id: "region:cycle-b" }),
    region({ id: "region:cycle-b", parent_id: "region:cycle-a" }),
  ]);
  const byId = new Map(got.map((item) => [item.id, item]));
  assert.equal(byId.get("region:child")?.parent_id, "region:parent");
  assert.equal(byId.get("region:other-sheet")?.parent_id, undefined);
  assert.equal(byId.get("region:dangling")?.parent_id, undefined);
  assert.ok(!byId.get("region:cycle-a")?.parent_id || !byId.get("region:cycle-b")?.parent_id);
});

test("region ids are namespaced and unique-shaped", () => {
  const first = mintRegionId(), second = mintRegionId();
  assert.match(first, /^region:/);
  assert.notEqual(first, second);
});

test("manual region commands create, update, delete, and restore exact order", () => {
  const first = sanitizeRegions([region({ id: "region:first", name: "First" })])[0];
  const second = sanitizeRegions([region({ id: "region:second", name: "Second" })])[0];
  const created = applyRegionCommand([], { type: "replace", region: first });
  assert.equal(created.changed, true);
  assert.deepEqual(created.regions, [first]);
  assert.deepEqual(created.inverse, { type: "delete", id: "region:first" });

  const appended = applyRegionCommand(created.regions, { type: "replace", region: second });
  const renamed = { ...first, name: "Renamed", revision: 2 };
  const updated = applyRegionCommand(appended.regions, { type: "replace", region: renamed });
  assert.deepEqual(updated.regions.map((item) => item.name), ["Renamed", "Second"]);

  const removed = applyRegionCommand(updated.regions, { type: "delete", id: "region:first" });
  assert.deepEqual(removed.regions.map((item) => item.id), ["region:second"]);
  const restored = applyRegionCommand(removed.regions, removed.inverse!);
  assert.deepEqual(restored.regions.map((item) => item.id), ["region:first", "region:second"]);
  assert.equal(restored.regions[0].name, "Renamed");
});

test("manual region commands refuse malformed geometry and make no-op updates inert", () => {
  const first = sanitizeRegions([region()])[0];
  assert.equal(applyRegionCommand([first], { type: "replace", region: first }).changed, false);
  const malformed = { ...first, geometry: { type: "polygon", verts_norm: [[0, 0], [1, 1]] } } as any;
  const refused = applyRegionCommand([first], { type: "replace", region: malformed });
  assert.equal(refused.changed, false);
  assert.deepEqual(refused.regions, [first]);
});
