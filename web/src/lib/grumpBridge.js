// Optional GRUMP parent-frame bridge. Disabled unless the canvas is embedded by
// a loopback page with ?grumpBridge=1; regular OpenTakeoff behavior is unchanged.

const LOOPBACK = new Set(["127.0.0.1", "localhost"]);

export function bridgeParent(locationLike = window.location, referrer = document.referrer) {
  const params = new URLSearchParams(locationLike.search || "");
  if (params.get("grumpBridge") !== "1" || !referrer) return null;
  try {
    const parent = new URL(referrer);
    if (!LOOPBACK.has(parent.hostname) || !["http:", "https:"].includes(parent.protocol)) return null;
    return parent.origin;
  } catch {
    return null;
  }
}

export function shapeFacts(before, after, cmd) {
  const previous = new Map((before || []).map((shape) => [shape.id, shape]));
  const current = new Map((after || []).map((shape) => [shape.id, shape]));
  const machine = (shape) => shape?.origin?.actor === "agent" || shape?.origin?.reviewed != null;

  if (cmd?.type === "review") {
    const reviewed = (cmd.ids || []).filter((shapeId) => {
      const oldShape = previous.get(shapeId), nextShape = current.get(shapeId);
      return machine(oldShape) && oldShape?.origin?.reviewed === false && nextShape?.origin?.reviewed === true;
    });
    if (reviewed.length) return [{ type: "shape.reviewed", payload: { shape_ids: reviewed } }];
    const restored = (cmd.restore || []).filter((row) => {
      const oldShape = previous.get(row.id), nextShape = current.get(row.id);
      return oldShape?.origin?.reviewed === true && nextShape?.origin?.reviewed === false;
    }).map((row) => row.id);
    return restored.length ? [{ type: "shape.review.undone", payload: { shape_ids: restored } }] : [];
  }

  if (cmd?.type === "delete") {
    const deleted = (cmd.ids || []).filter((shapeId) => machine(previous.get(shapeId)) && !current.has(shapeId));
    return deleted.length ? [{ type: "shape.deleted", payload: { shape_ids: deleted } }] : [];
  }

  if (["geom", "reassign", "label"].includes(cmd?.type)) {
    const ids = cmd.id ? [cmd.id] : (cmd.ids || cmd.restore || []).map((row) => typeof row === "string" ? row : row.id);
    const changed = ids.map((shapeId) => current.get(shapeId)).filter(machine);
    return changed.length ? [{ type: "shape.edited", payload: { shapes: changed } }] : [];
  }

  return [];
}

export function createGrumpBridge({ applyTakeoff, applyProposalAction = async (_payload, _event) => {}, applyProposalFact = async (_type, _payload, _event) => {}, applyProposalFocus = async (_payload) => {}, applyGeometryCapture = async (_type, _payload, _event) => {}, getContext = /** @type {() => any} */ (() => null), onError = () => {}, windowLike = window, documentLike = document }) {
  const parentOrigin = bridgeParent(windowLike.location, documentLike.referrer);
  if (!parentOrigin || windowLike.parent === windowLike) return null;
  let sessionId = null;
  let revision = 0;
  const handled = new Set();
  const deferredProposals = new Map();
  const retryingProposals = new Set();
  const deletedShapeIds = new Set();
  const reviewedShapeTimestamps = new Map();
  const editedShapes = new Map();
  // Journal replay can deliver several proposals in the same turn. Applying
  // them concurrently makes each import merge against the same pre-replay
  // Canvas snapshot, so the last import can erase the shapes imported just
  // before it. Keep proposal imports strictly ordered.
  let proposalApplyChain = Promise.resolve();

  const post = (message) => windowLike.parent.postMessage({ source: "opentakeoff.grump", ...message }, parentOrigin);

  const publish = (type, payload = {}, actor = "human", eventId = null) => {
    if (!sessionId) return false;
    post({
      kind: "canvas.fact",
      event: {
        session_id: sessionId,
        event_id: eventId || globalThis.crypto?.randomUUID?.() || `canvas-${Date.now()}-${Math.random()}`,
        base_revision: revision,
        actor,
        type,
        timestamp: new Date().toISOString(),
        payload,
      },
    });
    return true;
  };

  const enqueueCanvasMutation = (apply) => {
    const run = proposalApplyChain.then(apply).then((value) => new Promise((resolve) => {
      // Let React commit the preceding import before the next journal mutation
      // reads the current Canvas callbacks/state.
      setTimeout(() => resolve(value), 0);
    }));
    proposalApplyChain = run.catch(() => {});
    return run;
  };

  const enqueueTakeoffProposal = (event) => enqueueCanvasMutation(() => applyTakeoffProposal(event));

  const retryDeferredProposals = () => {
    for (const [eventId, event] of deferredProposals) {
      if (retryingProposals.has(eventId)) continue;
      retryingProposals.add(eventId);
      enqueueTakeoffProposal(event).finally(() => retryingProposals.delete(eventId));
    }
  };

  const publishContext = (payload = getContext()) => {
    if (!sessionId || !payload || typeof payload !== "object") return false;
    post({ kind: "canvas.context", session_id: sessionId, payload });
    retryDeferredProposals();
    return true;
  };

  const applyTakeoffProposal = async (event) => {
    if (handled.has(event.event_id)) return;
    try {
      const takeoff = event.payload?.takeoff;
      const summaryIds = Array.isArray(event.payload?.proposal?.shape_ids)
        ? event.payload.proposal.shape_ids
        : (event.payload?.shape_id ? [event.payload.shape_id] : []);
      // export_takeoff is a full-project snapshot. A proposal replay must only
      // import the shapes owned by that proposal; otherwise a later snapshot
      // can resurrect an unrelated shape that the human already rejected.
      const scopedTakeoff = takeoff && summaryIds.length
        ? (() => {
            const wanted = new Set(summaryIds);
            const proposalShapes = (takeoff.shapes || [])
              .filter((shape) => wanted.has(shape.id) && !deletedShapeIds.has(shape.id))
              .map((shape) => editedShapes.get(shape.id) || shape)
              .map((shape) => reviewedShapeTimestamps.has(shape.id)
                ? {
                    ...shape,
                    origin: {
                      ...shape.origin,
                      reviewed: true,
                      accepted_ts: reviewedShapeTimestamps.get(shape.id),
                    },
                  }
                : shape);
            const conditionIds = new Set(proposalShapes.map((shape) => shape.condition_id));
            return {
              ...takeoff,
              shapes: proposalShapes,
              conditions: (takeoff.conditions || []).filter((condition) => conditionIds.has(condition.id)),
            };
          })()
        : takeoff;
      await applyTakeoff(scopedTakeoff, event);
      handled.add(event.event_id);
      deferredProposals.delete(event.event_id);
      publish("canvas.takeoff.applied", {
        proposal_event_id: event.event_id,
        shape_id: event.payload?.shape_id,
      }, "canvas", `canvas-applied:${event.event_id}`);
    } catch (error) {
      if (error?.retryable === true) {
        deferredProposals.set(event.event_id, event);
        return;
      }
      handled.add(event.event_id);
      deferredProposals.delete(event.event_id);
      const messageText = String(error?.message || error);
      onError(messageText);
      publish("canvas.takeoff.rejected", {
        proposal_event_id: event.event_id,
        message: messageText,
      }, "canvas", `canvas-rejected:${event.event_id}`);
    }
  };

  const receive = async (message) => {
    const data = message.data;
    if (message.source !== windowLike.parent || message.origin !== parentOrigin || data?.source !== "grump.gateway") return;
    if (data.kind === "session") {
      sessionId = data.session_id;
      revision = Math.max(revision, data.revision || 0);
      post({ kind: "canvas.ready", session_id: sessionId });
      publishContext();
      return;
    }
    if (data.kind === "proposal.focus" && data.session_id === sessionId) {
      await applyProposalFocus(data.payload || {});
      return;
    }
    const event = data.event;
    if (!event || event.session_id !== sessionId) return;
    revision = Math.max(revision, event.revision || 0);
    if (event.type === "proposal.action.requested") {
      if (handled.has(event.event_id)) return;
      handled.add(event.event_id);
      try {
        await enqueueCanvasMutation(() => applyProposalAction(event.payload || {}, event));
      } catch (error) {
        onError(String(error?.message || error));
      }
      return;
    }
    if (["shape.reviewed", "shape.review.undone", "shape.deleted", "shape.edited"].includes(event.type)) {
      if (handled.has(event.event_id)) return;
      handled.add(event.event_id);
      const shapeIds = Array.isArray(event.payload?.shape_ids) ? event.payload.shape_ids : [];
      if (event.type === "shape.deleted") {
        for (const shapeId of shapeIds) {
          deletedShapeIds.add(shapeId);
          editedShapes.delete(shapeId);
          reviewedShapeTimestamps.delete(shapeId);
        }
      } else if (event.type === "shape.reviewed") {
        for (const shapeId of shapeIds) reviewedShapeTimestamps.set(shapeId, event.timestamp || new Date().toISOString());
      } else if (event.type === "shape.review.undone") {
        for (const shapeId of shapeIds) reviewedShapeTimestamps.delete(shapeId);
      } else if (event.type === "shape.edited") {
        for (const shape of Array.isArray(event.payload?.shapes) ? event.payload.shapes : []) {
          if (shape?.id) editedShapes.set(shape.id, shape);
        }
      }
      try {
        await enqueueCanvasMutation(() => applyProposalFact(event.type, event.payload || {}, event));
      } catch (error) {
        onError(String(error?.message || error));
      }
      return;
    }
    if (["geometry.capture.requested", "geometry.captured", "geometry.capture.cancelled"].includes(event.type)) {
      if (handled.has(event.event_id)) return;
      handled.add(event.event_id);
      try {
        await applyGeometryCapture(event.type, event.payload || {}, event);
      } catch (error) {
        onError(String(error?.message || error));
      }
      return;
    }
    if (data.kind !== "takeoff.proposed" || handled.has(event.event_id)) return;
    await enqueueTakeoffProposal(event);
  };

  windowLike.addEventListener("message", receive);
  post({ kind: "canvas.hello" });
  return {
    parentOrigin,
    publish,
    publishContext,
    retryDeferredProposals,
    clearProposalFocus: () => {
      if (!sessionId) return false;
      post({ kind: "proposal.focus.cleared", session_id: sessionId });
      return true;
    },
    stop: () => windowLike.removeEventListener("message", receive),
  };
}
