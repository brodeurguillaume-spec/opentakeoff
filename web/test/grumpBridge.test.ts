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

test("bridge defers a proposal until the PDF registry is ready, then applies it once", async () => {
  const sent: any[] = [];
  let listener: any = null;
  let ready = false;
  let applied = 0;
  const parent = { postMessage: (message: any) => sent.push(message) };
  const windowLike: any = {
    location: { search: "?grumpBridge=1" }, parent,
    addEventListener: (_name: string, fn: any) => { listener = fn; },
    removeEventListener: () => {},
  };
  const bridge = createGrumpBridge({
    windowLike,
    documentLike: { referrer: "http://127.0.0.1:8765/" } as Document,
    applyTakeoff: async () => {
      if (!ready) {
        const error: any = new Error("PDF registry not ready");
        error.retryable = true;
        throw error;
      }
      applied++;
    },
  });
  await listener({
    source: parent, origin: "http://127.0.0.1:8765",
    data: { source: "grump.gateway", kind: "session", session_id: "s", revision: 1 },
  });
  const proposal = {
    session_id: "s", event_id: "proposal-reload", revision: 2,
    payload: { shape_id: "line-1", takeoff: { schema: "opentakeoff.takeoff_canvas.v1" } },
  };
  await listener({
    source: parent, origin: "http://127.0.0.1:8765",
    data: { source: "grump.gateway", kind: "takeoff.proposed", event: proposal },
  });
  assert.equal(applied, 0);
  assert.equal(sent.some((message) => message.event?.type === "canvas.takeoff.rejected"), false);

  ready = true;
  bridge!.publishContext({ document_name: "sample-finish-plan.pdf", sheet_id: "AF101" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  bridge!.retryDeferredProposals();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(applied, 1);
  assert.equal(sent.filter((message) => message.event?.type === "canvas.takeoff.applied").length, 1);
  bridge!.stop();
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

test("bridge announces the visible document context on session and sheet changes", async () => {
  const sent: any[] = [];
  let listener: any = null;
  const parent = { postMessage: (message: any) => { sent.push(message); } };
  const windowLike: any = {
    location: { search: "?grumpBridge=1" }, parent,
    addEventListener: (_name: string, fn: any) => { listener = fn; }, removeEventListener: () => {},
  };
  const bridge = createGrumpBridge({
    windowLike,
    documentLike: { referrer: "http://127.0.0.1:8765/" } as Document,
    applyTakeoff: async () => {},
    getContext: () => ({ document_name: "A101.pdf", sheet_id: "A101.pdf#2", visible_sheet_ids: ["A101.pdf#2"] }),
  });
  await listener({
    source: parent, origin: "http://127.0.0.1:8765",
    data: { source: "grump.gateway", kind: "session", session_id: "s", revision: 1 },
  });
  assert.deepEqual(sent.at(-1), {
    source: "opentakeoff.grump",
    kind: "canvas.context",
    session_id: "s",
    payload: { document_name: "A101.pdf", sheet_id: "A101.pdf#2", visible_sheet_ids: ["A101.pdf#2"] },
  });
  assert.equal(bridge!.publishContext({ document_name: "S101.pdf", sheet_id: "S101.pdf", visible_sheet_ids: ["S101.pdf"] }), true);
  assert.equal(sent.at(-1).payload.document_name, "S101.pdf");
  bridge!.stop();
});

test("bridge replays a durable geometry request and its terminal capture in order", async () => {
  const received: any[] = [];
  let listener: any = null;
  const parent = { postMessage: () => {} };
  const windowLike: any = {
    location: { search: "?grumpBridge=1" }, parent,
    addEventListener: (_name: string, fn: any) => { listener = fn; },
    removeEventListener: () => {},
  };
  const bridge = createGrumpBridge({
    windowLike,
    documentLike: { referrer: "http://127.0.0.1:8765/" } as Document,
    applyTakeoff: async () => {},
    applyGeometryCapture: async (type: string, payload: any) => { received.push([type, payload]); },
  });
  await listener({
    source: parent, origin: "http://127.0.0.1:8765",
    data: { source: "grump.gateway", kind: "session", session_id: "s", revision: 1 },
  });
  const requested = {
    session_id: "s", event_id: "capture:chat-1", revision: 2,
    type: "geometry.capture.requested",
    payload: { request_event_id: "chat-1", capture_tool: "line", point_count: 2, sheet_id: "A101.pdf" },
  };
  const captured = {
    session_id: "s", event_id: "geometry-captured:capture:chat-1", revision: 3,
    type: "geometry.captured",
    payload: { request_event_id: "capture:chat-1", capture_tool: "line", sheet_id: "A101.pdf", points_norm: [[0.1, 0.2], [0.3, 0.4]] },
  };
  for (const event of [requested, requested, captured, captured]) await listener({
    source: parent, origin: "http://127.0.0.1:8765",
    data: { source: "grump.gateway", kind: "gateway.event", event },
  });
  assert.deepEqual(received, [
    ["geometry.capture.requested", requested.payload],
    ["geometry.captured", captured.payload],
  ]);
  bridge!.stop();
});
