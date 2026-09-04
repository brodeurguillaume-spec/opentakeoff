import { test } from "node:test";
import assert from "node:assert/strict";
import { isCompactViewport } from "../src/lib/viewportMode.js";

test("1080p-class laptop content heights use compact layout", () => {
  assert.equal(isCompactViewport(1920, 1000), true);
  assert.equal(isCompactViewport(1920, 1050), true);
});

test("a full 2K workstation retains the spacious docked layout", () => {
  assert.equal(isCompactViewport(2560, 1300), false);
  assert.equal(isCompactViewport(2048, 1200), false);
});

test("narrow or resized windows use compact layout regardless of height", () => {
  assert.equal(isCompactViewport(1366, 1200), true);
  assert.equal(isCompactViewport(1500, 1400), true);
  assert.equal(isCompactViewport(1501, 1051), false);
});
