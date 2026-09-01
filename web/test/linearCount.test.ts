import assert from "node:assert/strict";
import test from "node:test";
import { linearCountConfig, linearCountMetrics, linearCountPieces } from "../src/lib/linearCount.js";

test("a 10-foot guide becomes four 36-inch pieces with three half-inch joints", () => {
  const points = [[0, 0], [100, 0]];
  const config = { unit_length_in: 36, height_in: 6, joint_in: 0.5 };
  const metrics = linearCountMetrics(points, 0.1, config);
  assert.deepEqual(metrics, {
    count: 4,
    guide_lf: 10,
    unit_length_in: 36,
    joint_in: 0.5,
    nominal_total_in: 144,
    installed_span_in: 145.5,
  });

  const pieces = linearCountPieces(points, 0.1, config);
  assert.equal(pieces.length, 4);
  assert.ok(Math.abs(pieces[0][0][0] + 10.625) < 1e-10); // 12.75-inch overhang at 1.2 in/px
  assert.ok(Math.abs(pieces[3][1][0] - 110.625) < 1e-10);
  assert.ok(Math.abs(pieces[1][0][0] - pieces[0][1][0] - (0.5 / 1.2)) < 1e-10);
});

test("an exact multiple does not create a surplus piece", () => {
  assert.equal(linearCountMetrics([[0, 0], [90, 0]], 0.1, { unit_length_in: 36 }).count, 3);
});

test("one piece has no joint and invalid Product values use safe defaults", () => {
  const cfg = linearCountConfig({ length_in: -1, count_joint_in: -4 });
  assert.equal(cfg.unit_length_in, 12);
  assert.equal(cfg.joint_in, 0.5);
  const metrics = linearCountMetrics([[0, 0], [5, 0]], 0.1, { unit_length_in: 36, joint_in: 0.5 });
  assert.equal(metrics.count, 1);
  assert.equal(metrics.installed_span_in, 36);
});
