import { test } from "node:test";
import assert from "node:assert/strict";
import { ownsKeyboard } from "../src/lib/keyboardScope.js";

test("editing, IME and scoped panels own their keys; ordinary canvas stays active", () => {
  assert.equal(ownsKeyboard({ target: { closest: () => null } }), false);
  assert.equal(ownsKeyboard({ defaultPrevented: true }), true);
  assert.equal(ownsKeyboard({ isComposing: true }), true);
  assert.equal(ownsKeyboard({ target: { isContentEditable: true } }), true);
  assert.equal(ownsKeyboard({ target: { closest: (selector: string) => selector.includes('[data-canvas-shortcuts="off"]') ? {} : null } }), true);
});
