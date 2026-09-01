// Count footprints — an EA remains one EA, but its on-plan symbol can be a
// calibrated, editable polygon. Conditions persist the reusable symbol as
// offsets in REAL feet from its centre, so a 36" baton stays 36" on sheets
// with different bitmap resolutions/scales.

export const DEFAULT_COUNT_FOOTPRINT = Object.freeze({
  offsets_ft: Object.freeze([
    Object.freeze([-0.5, -0.5]),
    Object.freeze([0.5, -0.5]),
    Object.freeze([0.5, 0.5]),
    Object.freeze([-0.5, 0.5]),
  ]),
});

export function rectangularCountFootprint(widthIn = 12, heightIn = 12) {
  // 1/8 in is the editor's precision floor on the X axis. A deliberate zero
  // height is meaningful: it creates an open, two-point Count line instead of
  // a degenerate polygon. The Count still contributes exactly 1 EA.
  const widthFt = Math.max(1 / 96, Number(widthIn) / 12 || 1);
  const rawHeightIn = Number(heightIn);
  const heightFt = Number.isFinite(rawHeightIn) && rawHeightIn === 0
    ? 0
    : Math.max(1 / 96, rawHeightIn / 12 || 1);
  const hx = widthFt / 2;
  const hy = heightFt / 2;
  if (heightFt === 0) return { offsets_ft: [[-hx, 0], [hx, 0]] };
  return {
    offsets_ft: [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]],
  };
}

export function countFootprintDimensions(rawFootprint) {
  const { offsets_ft: offsets } = normalizeCountFootprint(rawFootprint);
  const xs = offsets.map(([x]) => x);
  const ys = offsets.map(([, y]) => y);
  return {
    width_in: +(Math.max(...xs) - Math.min(...xs)) * 12,
    height_in: +(Math.max(...ys) - Math.min(...ys)) * 12,
  };
}

const finitePair = (v) => Array.isArray(v) && v.length === 2
  && Number.isFinite(Number(v[0])) && Number.isFinite(Number(v[1]));

export function normalizeCountFootprint(raw) {
  const offsets = raw?.offsets_ft;
  if (!Array.isArray(offsets) || offsets.length < 2 || !offsets.every(finitePair)) {
    return { offsets_ft: DEFAULT_COUNT_FOOTPRINT.offsets_ft.map((v) => [...v]) };
  }
  return { offsets_ft: offsets.map(([x, y]) => [Number(x), Number(y)]) };
}

export function countVertsAt(anchorPx, image, unitsPerPx, rawFootprint) {
  if (!image?.w || !image?.h || !(unitsPerPx > 0)) return null;
  const footprint = normalizeCountFootprint(rawFootprint);
  return footprint.offsets_ft.map(([dxFt, dyFt]) => [
    (anchorPx[0] + dxFt / unitsPerPx) / image.w,
    (anchorPx[1] + dyFt / unitsPerPx) / image.h,
  ]);
}

export function countFootprintFromVerts(vertsNorm, image, unitsPerPx) {
  if (!Array.isArray(vertsNorm) || vertsNorm.length < 2 || !image?.w || !image?.h || !(unitsPerPx > 0)) return null;
  const pts = vertsNorm.map(([nx, ny]) => [nx * image.w, ny * image.h]);
  const center = pts.reduce((sum, [x, y]) => [sum[0] + x, sum[1] + y], [0, 0])
    .map((v) => v / pts.length);
  return {
    offsets_ft: pts.map(([x, y]) => [
      +((x - center[0]) * unitsPerPx).toFixed(6),
      +((y - center[1]) * unitsPerPx).toFixed(6),
    ]),
  };
}
