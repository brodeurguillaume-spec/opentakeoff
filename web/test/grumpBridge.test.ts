import assert from "node:assert/strict";
import test from "node:test";

import { bridgeParent, createGrumpBridge, shapeFacts } from "../src/lib/grumpBridge.js";

test("bridgeParent enables only an explicitly embedded loopback canvas", () => {
  assert.equal(
    bridgeParent({ search: "?grumpBridge=1" } as Location, "http://127.0.0.1:8765/"),
    "http://127.0.0.1:8765",
  );
  assert.equal(bridgeParent({ search: "" } as Location, "http://127.0.0.1:8765/"), null);
  assert.equal(bridgeParent({ search: "?grumpBridge=1" } as Location, "https://example.com/"), null);
});

test("shapeFacts reports review, undo, edits and deletes for machine shapes", () => {
  const pending = { id: "s1", origin: { actor: "agent", reviewed: false } };
  const accepted = { id: "s1", origin: { actor: "agent", reviewed: true } };
  assert.deepEqual(shapeFacts([pending], [accepted], { type: "review", ids: ["s1"] }), [
    { type: "shape.reviewed", payload: { shape_ids: ["s1"] } },
  ]);
  assert.deepEqual(shapeFacts([accepted], [pending], { type: "review", restore: [{ id: "s1" }] }), [
    { type: "shape.review.undone", payload: { shape_ids: ["s1"] } },
  ]);
  assert.deepEqual(shapeFacts([pending], [], { type: "delete", ids: ["s1"] }), [
    { type: "shape.deleted", payload: { shape_ids: ["s1"] } },
  ]);
  const edited = { ...accepted, verts_norm: [[0, 0], [1, 0], [1, 1]] };
  assert.deepEqual(shapeFacts([accepted], [edited], { type: "geom", id: "s1" }), [
    { type: "shape.edited", payload: { shapes: [edited] } },
  ]);
});

test("bridge applies a proposal once and emits a correlated Canvas fact", async () => {
  const sent: any[] = [];
  let listener: any = null;
  const parent = { postMessage: (message: any, origin: string) => sent.push({ message, origin }) };
  const windowLike: any = {
    location: { search: "?grumpBridge=1" },
    parent,
    addEventListener: (_name: string, fn: (event: any) => void) => { listener = fn; },
    removeEventListener: () => { listener = null; },
  };
  let applied = 0;
  const bridge = createGrumpBridge({
    windowLike,
    documentLike: { referrer: "http://127.0.0.1:8765/" } as Document,
    applyTakeoff: async () => { applied++; return { shapes_added: 1 }; },
  });
  assert.ok(bridge && listener);
  await listener!({
    source: parent, origin: "http://127.0.0.1:8765",
    data: { source: "grump.gateway", kind: "session", session_id: "session-1", revision: 2 },
  });
  const proposal = {
    schema: "grump.event.v1", session_id: "session-1", event_id: "proposal-1",
    revision: 3, payload: { shape_id: "s1", takeoff: { schema: "opentakeoff.takeoff_canvas.v1" } },
  };
  await listener!({
    source: parent, origin: "http://127.0.0.1:8765",
    data: { source: "grump.gateway", kind: "takeoff.proposed", event: proposal },
  });
  await listener!({
    source: parent, origin: "http://127.0.0.1:8765",
    data: { source: "grump.gateway", kind: "takeoff.proposed", event: proposal },
  });
  assert.equal(applied, 1);
  assert.equal(sent[0].message.kind, "canvas.hello");
  assert.equal(sent[1].message.kind, "canvas.ready");
  assert.equal(sent[2].message.event.type, "canvas.takeoff.applied");
  assert.equal(sent[2].message.event.event_id, "canvas-applied:proposal-1");
  assert.equal(sent[2].message.event.payload.proposal_event_id, "proposal-1");
  bridge.stop();
});

test("bridge applies each journaled proposal action once", async () => {
  const sent: any[] = [];
  const actions: any[] = [];
  let listener: any = null;
  const parent = { postMessage: (message: any) => sent.push(message) };
  const windowLike: any = {
    location: { search: "?grumpBridge=1" }, parent,
    addEventListener: (_name: string, fn: any) => { listener = fn; },
    removeEventListener: () => {},
  };
  const bridge = createGrumpBridge({
    windowLike,
    documentLike: { referrer: "http://127.0.0.1:8765/" } as Document,
    applyTakeoff: async () => {},
    applyProposalAction: async (payload: any) => { actions.push(payload); },
  });
  await listener({
    source: parent, origin: "http://127.0.0.1:8765",
    data: { source: "grump.gateway", kind: "session", session_id: "session-1", revision: 1 },
  });
  const action = {
    schema: "grump.event.v1", session_id: "session-1", event_id: "accept-1",
    revision: 2, type: "proposal.action.requested",
    payload: { action: "accept", shape_ids: ["s1"] },
  };
  for (let i = 0; i < 2; i++) await listener({
    source: parent, origin: "http://127.0.0.1:8765",
    data: { source: "grump.gateway", kind: "gateway.event", event: action },
  });
  assert.deepEqual(actions, [{ action: "accept", shape_ids: ["s1"] }]);
  bridge!.stop();
});

test("bridge forwards transient proposal focus without turning it into a fact", async () => {
  const focused: any[] = [];
  const sent: any[] = [];
  let listener: any = null;
  const parent = { postMessage: (message: any) => { sent.push(message); } };
  const windowLike: any = {
    location: { search: "?grumpBridge=1" }, parent,
    addEventListener: (_name: string, fn: any) => { listener = fn; }, removeEventListener: () => {},
  };
  const bridge = createGrumpBridge({
    windowLike, documentLike: { referrer: "http://127.0.0.1:8765/" } as Document,
    applyTakeoff: async () => {}, applyProposalFocus: async (payload: any) => { focused.push(payload); },
  });
  await listener({ source: parent, origin: "http://127.0.0.1:8765", data: { source: "grump.gateway", kind: "session", session_id: "s", revision: 1 } });
  await listener({ source: parent, origin: "http://127.0.0.1:8765", data: { source: "grump.gateway", kind: "proposal.focus", session_id: "s", payload: { shape_ids: ["x"], accent: "#fff" } } });
  assert.deepEqual(focused, [{ shape_ids: ["x"], accent: "#fff" }]);
  assert.equal(bridge!.clearProposalFocus(), true);
  assert.deepEqual(sent.at(-1), { source: "opentakeoff.grump", kind: "proposal.focus.cleared", session_id: "s" });
  bridge!.stop();
});
