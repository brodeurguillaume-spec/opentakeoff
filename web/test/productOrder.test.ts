import { test } from "node:test";
import assert from "node:assert/strict";
import { moveProductToPosition } from "../src/lib/productOrder.js";

const products = () => [
  { id: "a", finish_tag: "A" },
  { id: "b", finish_tag: "B" },
  { id: "c", finish_tag: "C" },
  { id: "d", finish_tag: "D" },
];

test("a Product moves to a one-based position and the rest close the gap", () => {
  const source = products();
  const moved = moveProductToPosition(source, "b", 4);
  assert.deepEqual(moved.map((product: { id: string }) => product.id), ["a", "c", "d", "b"]);
  assert.deepEqual(source.map((product: { id: string }) => product.id), ["a", "b", "c", "d"], "source order stays immutable");
});

test("positions clamp to the existing list, so 99 means move to the end", () => {
  assert.deepEqual(moveProductToPosition(products(), "c", 0).map((product: { id: string }) => product.id), ["c", "a", "b", "d"]);
  assert.deepEqual(moveProductToPosition(products(), "a", 99).map((product: { id: string }) => product.id), ["b", "c", "d", "a"]);
});

test("unknown ids, invalid positions, and no-op moves preserve array identity", () => {
  const source = products();
  assert.equal(moveProductToPosition(source, "missing", 2), source);
  assert.equal(moveProductToPosition(source, "b", "nope"), source);
  assert.equal(moveProductToPosition(source, "b", 2), source);
});
