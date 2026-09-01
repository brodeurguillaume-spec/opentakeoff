import test from "node:test";
import assert from "node:assert/strict";
import { insertMarkupLineBreak, markupTextLayout, markupTextLines } from "../src/lib/markupText.js";

test("markup text normalizes persisted line endings", () => {
  assert.deepEqual(markupTextLines("one\r\ntwo\rthree"), ["one", "two", "three"]);
});

test("markup text layout uses the longest line, not the full string", () => {
  assert.deepEqual(markupTextLayout("short\nlongest"), {
    lines: ["short", "longest"], width: 59, height: 36, lineHeight: 16,
  });
});

test("Alt+Enter insertion replaces the selection and returns the new caret", () => {
  assert.deepEqual(insertMarkupLineBreak("before AFTER", 7, 12), { value: "before \n", caret: 8 });
});
