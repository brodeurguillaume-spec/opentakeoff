import assert from "node:assert/strict";
import test from "node:test";

import { bridgeParent, createGrumpBridge, regionFacts, shapeFacts } from "../src/lib/grumpBridge.js";

test("bridgeParent enables only an explicitly embedded loopback canvas", () => {
  assert.equal(
    bridgeParent({ search: "?grumpBridge=1" } as Location, "http://127.0.0.1:8765/"),
    "http://127.0.0.1:8765",
  );
  assert.equal(bridgeParent({ search: "" } as Location, "http://127.0.0.1:8765/"), null);
  assert.equal(bridgeParent({ search: "?grumpBridge=1" } as Location, "https://example.com/"), null);
});

test("shapeFacts reports review, undo, edits, deletes and restores for machine shapes", () => {
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
  assert.deepEqual(shapeFacts([], [pending], { type: "add", restore: true, shapes: [pending] }), [
    { type: "shape.restored", payload: { shapes: [pending] } },
  ]);
  const edited = { ...accepted, verts_norm: [[0, 0], [1, 0], [1, 1]] };
  assert.deepEqual(shapeFacts([accepted], [edited], { type: "geom", id: "s1" }), [
    { type: "shape.edited", payload: { shapes: [edited] } },
  ]);
});

test("regionFacts journals create, review, edit, delete and undo without owning map state", () => {
  const proposed = { id: "region:1", name: "Room 161", review: { status: "proposed" }, revision: 1 };
  const confirmed = { ...proposed, review: { status: "confirmed", note: "Wall checked." }, revision: 2 };
  const renamed = { ...confirmed, name: "Patient Room 161", revision: 3 };
  assert.equal(regionFacts([], [proposed], { type: "replace", region: proposed })[0].type, "region.created");
  assert.deepEqual(regionFacts([proposed], [confirmed], { type: "replace", region: confirmed }), [{
    type: "region.reviewed",
    payload: {
      region_id: "region:1", decision: "confirmed", previous_status: "proposed",
      note: "Wall checked.", reason_code: null, region: confirmed,
    },
  }]);
  assert.equal(regionFacts([confirmed], [renamed], { type: "replace", region: renamed })[0].type, "region.edited");
  assert.equal(regionFacts([renamed], [], { type: "delete", id: "region:1" })[0].type, "region.deleted");
  assert.equal(regionFacts([], [renamed], { type: "replace", region: renamed, audit: "restore" })[0].type, "region.restored");
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

test("bridge serializes rapid proposal replay imports", async () => {
  let listener: any = null;
  const parent = { postMessage: () => {} };
  const windowLike: any = {
    location: { search: "?grumpBridge=1" }, parent,
    addEventListener: (_name: string, fn: any) => { listener = fn; },
    removeEventListener: () => {},
  };
  const order: string[] = [];
  let releaseFirst: (() => void) | null = null;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const bridge = createGrumpBridge({
    windowLike,
    documentLike: { referrer: "http://127.0.0.1:8765/" } as Document,
    applyTakeoff: async (takeoff: any) => {
      order.push(`start:${takeoff.id}`);
      if (takeoff.id === "first") await firstGate;
      order.push(`end:${takeoff.id}`);
    },
  });
  await listener({
    source: parent, origin: "http://127.0.0.1:8765",
    data: { source: "grump.gateway", kind: "session", session_id: "s", revision: 1 },
  });
  const event = (id: string, revision: number) => ({
    session_id: "s", event_id: `proposal-${id}`, revision,
    payload: { shape_id: `shape-${id}`, takeoff: { id } },
  });
  const first = listener({
    source: parent, origin: "http://127.0.0.1:8765",
    data: { source: "grump.gateway", kind: "takeoff.proposed", event: event("first", 2) },
  });
  const second = listener({
    source: parent, origin: "http://127.0.0.1:8765",
    data: { source: "grump.gateway", kind: "takeoff.proposed", event: event("second", 3) },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(order, ["start:first"]);
  releaseFirst!();
  await Promise.all([first, second]);
  assert.deepEqual(order, ["start:first", "end:first", "start:second", "end:second"]);
  bridge!.stop();
});

test("bridge scopes a replay import to the proposal's own shapes", async () => {
  let listener: any = null;
  let imported: any = null;
  const parent = { postMessage: () => {} };
  const windowLike: any = {
    location: { search: "?grumpBridge=1" }, parent,
    addEventListener: (_name: string, fn: any) => { listener = fn; },
    removeEventListener: () => {},
  };
  const bridge = createGrumpBridge({
    windowLike,
    documentLike: { referrer: "http://127.0.0.1:8765/" } as Document,
    applyTakeoff: async (takeoff: any) => { imported = takeoff; },
  });
  await listener({ source: parent, origin: "http://127.0.0.1:8765", data: { source: "grump.gateway", kind: "session", session_id: "s", revision: 1 } });
  await listener({
    source: parent, origin: "http://127.0.0.1:8765",
    data: {
      source: "grump.gateway", kind: "takeoff.proposed",
      event: {
        session_id: "s", event_id: "proposal-new", revision: 2,
        payload: {
          proposal: { shape_ids: ["new"] },
          takeoff: {
            shapes: [{ id: "rejected", condition_id: "old-cond" }, { id: "new", condition_id: "new-cond" }],
            conditions: [{ id: "old-cond" }, { id: "new-cond" }],
          },
        },
      },
    },
  });
  assert.deepEqual(imported.shapes.map((shape: any) => shape.id), ["new"]);
  assert.deepEqual(imported.conditions.map((condition: any) => condition.id), ["new-cond"]);
  bridge!.stop();
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

test("deferred replay does not resurrect a shape rejected later in the journal", async () => {
  let listener: any = null;
  let ready = false;
  const importedShapeIds: string[][] = [];
  const parent = { postMessage: () => {} };
  const windowLike: any = {
    location: { search: "?grumpBridge=1" }, parent,
    addEventListener: (_name: string, fn: any) => { listener = fn; },
    removeEventListener: () => {},
  };
  const bridge = createGrumpBridge({
    windowLike,
    documentLike: { referrer: "http://127.0.0.1:8765/" } as Document,
    applyTakeoff: async (takeoff: any) => {
      if (!ready) {
        const error: any = new Error("not hydrated");
        error.retryable = true;
        throw error;
      }
      importedShapeIds.push((takeoff.shapes || []).map((shape: any) => shape.id));
    },
    applyProposalFact: async () => {},
  });
  await listener({ source: parent, origin: "http://127.0.0.1:8765", data: { source: "grump.gateway", kind: "session", session_id: "s", revision: 1 } });
  const proposal = {
    session_id: "s", event_id: "proposal-rejected", revision: 2,
    payload: {
      shape_id: "rejected",
      takeoff: { shapes: [{ id: "rejected", condition_id: "c1" }], conditions: [{ id: "c1" }] },
    },
  };
  await listener({ source: parent, origin: "http://127.0.0.1:8765", data: { source: "grump.gateway", kind: "takeoff.proposed", event: proposal } });
  await listener({
    source: parent, origin: "http://127.0.0.1:8765",
    data: {
      source: "grump.gateway", kind: "gateway.event",
      event: { session_id: "s", event_id: "deleted-rejected", revision: 3, type: "shape.deleted", payload: { shape_ids: ["rejected"] } },
    },
  });
  ready = true;
  bridge!.publishContext({ sheet_id: "A101" });
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.deepEqual(importedShapeIds, [[]]);
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

test("bridge replays terminal shape facts after queued proposal imports", async () => {
  const order: string[] = [];
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
    applyTakeoff: async () => { order.push("proposal"); },
    applyProposalFact: async (type: string) => { order.push(type); },
  });
  await listener({ source: parent, origin: "http://127.0.0.1:8765", data: { source: "grump.gateway", kind: "session", session_id: "s", revision: 1 } });
  const proposal = {
    session_id: "s", event_id: "proposal-1", revision: 2,
    payload: { shape_id: "shape-1", takeoff: { id: "one" } },
  };
  const deleted = {
    session_id: "s", event_id: "deleted-1", revision: 3, type: "shape.deleted",
    payload: { shape_ids: ["shape-1"] },
  };
  await Promise.all([
    listener({ source: parent, origin: "http://127.0.0.1:8765", data: { source: "grump.gateway", kind: "takeoff.proposed", event: proposal } }),
    listener({ source: parent, origin: "http://127.0.0.1:8765", data: { source: "grump.gateway", kind: "gateway.event", event: deleted } }),
  ]);
  assert.deepEqual(order, ["proposal", "shape.deleted"]);
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
  const polygonRequested = {
    session_id: "s", event_id: "capture:chat-2", revision: 4,
    type: "geometry.capture.requested",
    payload: { request_event_id: "chat-2", capture_tool: "polygon", min_points: 3, sheet_id: "A101.pdf" },
  };
  const polygonCaptured = {
    session_id: "s", event_id: "geometry-captured:capture:chat-2", revision: 5,
    type: "geometry.captured",
    payload: { request_event_id: "capture:chat-2", capture_tool: "polygon", sheet_id: "A101.pdf", points_norm: [[0.1, 0.2], [0.3, 0.2], [0.3, 0.4]] },
  };
  for (const event of [requested, requested, captured, captured, polygonRequested, polygonCaptured]) await listener({
    source: parent, origin: "http://127.0.0.1:8765",
    data: { source: "grump.gateway", kind: "gateway.event", event },
  });
  assert.deepEqual(received, [
    ["geometry.capture.requested", requested.payload],
    ["geometry.captured", captured.payload],
    ["geometry.capture.requested", polygonRequested.payload],
    ["geometry.captured", polygonCaptured.payload],
  ]);
  bridge!.stop();
});
