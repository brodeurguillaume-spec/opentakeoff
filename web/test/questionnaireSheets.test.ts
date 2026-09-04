import assert from "node:assert/strict";
import test from "node:test";
import { questionnaireSheetSelection } from "../src/lib/questionnaireSheets.js";
import { createGrumpBridge } from "../src/lib/grumpBridge.js";

test("questionnaire navigation requires the same PDF, known sheets and idle canvas", () => {
  const context = { document_sha256: "abc" };
  const payload = { context, sheet_ids: ["p#4", "p", "p#4"] };
  assert.deepEqual(questionnaireSheetSelection(payload, context, ["p", "p#4"]), ["p#4", "p"]);
  assert.throws(() => questionnaireSheetSelection(payload, { document_sha256: "changed" }, ["p", "p#4"]));
  assert.throws(() => questionnaireSheetSelection(payload, context, ["p", "p#4"], true));
  assert.throws(() => questionnaireSheetSelection(payload, context, ["p"]));
  assert.throws(() => questionnaireSheetSelection({ ...payload, sheet_ids: ["../../x"] }, context, ["p"]));
});

test("questionnaire opening is explicit, origin-scoped, acknowledged, never journal replay", async () => {
  const sent: any[] = [];
  let receive: any;
  const parent = { postMessage: (value: any) => sent.push(value) };
  const windowLike: any = { location: { search: "?grumpBridge=1" }, parent,
    addEventListener: (_: string, fn: any) => { receive = fn; }, removeEventListener: () => {} };
  let opened = 0;
  createGrumpBridge({ windowLike, documentLike: { referrer: "http://127.0.0.1:8765/" } as Document,
    applyTakeoff: async () => { throw new Error("must not import"); },
    openQuestionnaireSheets: async () => { opened++; return 3; } });
  const envelope = (data: any) => ({ source: parent, origin: "http://127.0.0.1:8765", data: { source: "grump.gateway", ...data } });
  await receive(envelope({ kind: "session", session_id: "s", revision: 1 }));
  await receive(envelope({ kind: "gateway.event", event: { session_id: "s", type: "chat.reply", payload: { questionnaire: {} } } }));
  await receive(envelope({ kind: "questionnaire.open", session_id: "other" }));
  await receive({ ...envelope({ kind: "questionnaire.open", session_id: "s" }), origin: "https://untrusted.test" });
  assert.equal(opened, 0);
  await receive(envelope({ kind: "questionnaire.open", session_id: "s", payload: { request_id: "r" } }));
  assert.equal(opened, 1);
  assert.equal(sent.at(-1).kind, "questionnaire.opened");
  assert.equal(sent.at(-1).count, 3);
  assert.equal(sent.some(row => row.kind === "canvas.fact"), false);
});
