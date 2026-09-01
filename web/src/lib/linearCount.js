import { countFootprintDimensions } from "./countFootprint.js";

export const DEFAULT_COUNT_JOINT_IN = 0.5;

const positive = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const nonNegative = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

// A linear distribution reuses the Product's Count dimensions: X is the
// nominal piece length, Y is its visual height. The joint belongs to the
// Product too, while a shape receives a snapshot so old takeoffs remain
// stable when the Product is edited later.
export function linearCountConfig(source = {}) {
  const dims = countFootprintDimensions(source.count_footprint);
  return {
    unit_length_in: positive(source.unit_length_in ?? source.length_in, positive(dims.width_in, 12)),
    height_in: positive(source.height_in, positive(dims.height_in, 12)),
    joint_in: nonNegative(source.joint_in ?? source.count_joint_in, DEFAULT_COUNT_JOINT_IN),
    tag: String(source.tag ?? source.count_tag ?? source.finish_tag ?? "").trim(),
  };
}

export function linearCountMetrics(pointsPx, unitsPerPx, source = {}) {
  const cfg = linearCountConfig(source);
  const [a, b] = pointsPx || [];
  const px = a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0;
  const guideIn = px * positive(unitsPerPx, 0) * 12;
  const count = guideIn > 0 ? Math.max(1, Math.ceil(guideIn / cfg.unit_length_in - 1e-9)) : 0;
  const nominalTotalIn = count * cfg.unit_length_in;
  const installedSpanIn = nominalTotalIn + Math.max(0, count - 1) * cfg.joint_in;
  return {
    count,
    guide_lf: +(guideIn / 12).toFixed(4),
    unit_length_in: cfg.unit_length_in,
    joint_in: cfg.joint_in,
    nominal_total_in: +nominalTotalIn.toFixed(4),
    installed_span_in: +installedSpanIn.toFixed(4),
  };
}

// Returns one four-corner polygon per physical piece, centred as a group on
// the two-point guide. Gaps are real empty space; they never change the
// ceil(guide / nominal length) quantity calculation above.
export function linearCountPieces(pointsPx, unitsPerPx, source = {}) {
  const cfg = linearCountConfig(source);
  const metrics = linearCountMetrics(pointsPx, unitsPerPx, cfg);
  const [a, b] = pointsPx || [];
  if (!a || !b || !metrics.count || !(unitsPerPx > 0)) return [];
  const dx = b[0] - a[0], dy = b[1] - a[1], guidePx = Math.hypot(dx, dy);
  if (!(guidePx > 0)) return [];
  const ux = dx / guidePx, uy = dy / guidePx;
  const nx = -uy, ny = ux;
  const inchPerPx = unitsPerPx * 12;
  const unitPx = cfg.unit_length_in / inchPerPx;
  const jointPx = cfg.joint_in / inchPerPx;
  const halfHeightPx = (cfg.height_in / inchPerPx) / 2;
  const spanPx = metrics.installed_span_in / inchPerPx;
  const midX = (a[0] + b[0]) / 2, midY = (a[1] + b[1]) / 2;
  const startX = midX - ux * spanPx / 2, startY = midY - uy * spanPx / 2;
  const out = [];
  for (let i = 0; i < metrics.count; i++) {
    const s = i * (unitPx + jointPx);
    const ax = startX + ux * s, ay = startY + uy * s;
    const bx = ax + ux * unitPx, by = ay + uy * unitPx;
    out.push([
      [ax + nx * halfHeightPx, ay + ny * halfHeightPx],
      [bx + nx * halfHeightPx, by + ny * halfHeightPx],
      [bx - nx * halfHeightPx, by - ny * halfHeightPx],
      [ax - nx * halfHeightPx, ay - ny * halfHeightPx],
    ]);
  }
  return out;
}

// Persisted computed.guide_lf lets renderers recover the original physical
// scale without depending on whichever scale-zone happens to be active now.
export function linearCountUnitsPerPx(pointsPx, computed = {}) {
  const [a, b] = pointsPx || [];
  const px = a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0;
  const guideLf = Number(computed.guide_lf) || 0;
  return px > 0 && guideLf > 0 ? guideLf / px : 0;
}
