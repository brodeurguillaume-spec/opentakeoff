// Presentation-only condition settings. They never enter quantity math:
// fill opacity controls the overlay's visual density, and line width is a
// screen-space pixel width (the canvas divides by zoom before drawing it).

export const DEFAULT_LINE_WIDTH_PX = 2;

export function clampFillOpacity(value, fallback = 0.2) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

export function clampLineWidthPx(value, fallback = DEFAULT_LINE_WIDTH_PX) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0.5, Math.min(8, n)) : fallback;
}

export function conditionFillOpacity(condition, { dark = false, overview = false, pending = false, count = false } = {}) {
  if (pending) return count ? 0.13 : 0.08;
  if (condition?.fill_opacity != null) return clampFillOpacity(condition.fill_opacity);
  if (overview) return dark ? 0.35 : 0.25;
  if (condition?.hatch && condition.hatch !== "solid") return 1;
  return dark ? 0.3 : 0.2;
}

export function conditionLineWidthPx(condition, fallback = DEFAULT_LINE_WIDTH_PX) {
  return condition?.line_width_px == null
    ? fallback
    : clampLineWidthPx(condition.line_width_px, fallback);
}
