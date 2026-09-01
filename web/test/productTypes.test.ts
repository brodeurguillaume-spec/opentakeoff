import assert from "node:assert/strict";
import test from "node:test";
import { groupConditionItemsByProductType, partitionRowsByProductType, productTypeLabel } from "../src/lib/productTypes.js";

test("Product categories use the business vocabulary", () => {
  assert.equal(productTypeLabel("brick"), "Brique");
  assert.equal(productTypeLabel(""), "Non classé");
});

test("Product panel groups by category while preserving manual order inside it", () => {
  const items = [
    { c: { id: "s1", product_type: "stone" } },
    { c: { id: "b1", product_type: "brick" } },
    { c: { id: "s2", product_type: "stone" } },
    { c: { id: "u1" } },
  ];
  const groups = groupConditionItemsByProductType(items);
  assert.deepEqual(groups.map((group) => group.name), ["Brique", "Pierre", "Non classé"]);
  assert.deepEqual(groups.find((group) => group.name === "Pierre")?.items.map((item: { c: { id: string } }) => item.c.id), ["s1", "s2"]);
});

test("Report rows partition through their Product category", () => {
  const rows = [{ id: "b1" }, { id: "s1" }, { id: "u1" }];
  const conditions = [{ id: "s1", product_type: "stone" }, { id: "b1", product_type: "brick" }, { id: "u1" }];
  assert.deepEqual(partitionRowsByProductType(rows, conditions).map((group) => [group.label, group.rows.map((row: { id: string }) => row.id)]), [
    ["Brique", ["b1"]], ["Pierre", ["s1"]], ["Non classé", ["u1"]],
  ]);
});
