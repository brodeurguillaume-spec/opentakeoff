// Panel-row geometry for the Takeoff Canvas — the pure math behind the ONE
// rendering model (single-sheet mode is a group of one). Every coordinate on
// screen lives in "stage space": panel i's image px plus its x/y offsets; with
// one panel both offsets are 0, so stage space IS image space. These are the extracted
// computational cores of the canvas's panel helpers: each takes the live
// `panels` array / scale maps explicitly, and the component keeps thin
// same-named wrappers so call sites read unchanged.
//
// A panel is { key, file, page, img: {w,h}, xOffset, yOffset } (built in the canvas).

import { RENDER_SCALE } from "./sheets";

// Overall stage extent of any panel layout (row/column gaps are already baked
// into xOffset/yOffset).
export const stageExtent = (panels) =>
  panels.reduce((a, p) => ({
    w: Math.max(a.w, (p.xOffset || 0) + p.img.w),
    h: Math.max(a.h, (p.yOffset || 0) + p.img.h),
  }), { w: 0, h: 0 });

export const panelByKey = (panels, k) => panels.find((p) => p.key === k) || panels[0];

// never null: a click in a gap (or off the layout) routes to the NEAREST panel,
// matching the old behavior of happily returning out-of-bounds image coords
export const panelAt = (panels, sx, sy = 0) => {
  let best = panels[0], bd = Infinity;
  for (const p of panels) {
    const x0 = p.xOffset || 0, y0 = p.yOffset || 0;
    const x1 = x0 + p.img.w, y1 = y0 + p.img.h;
    if (sx >= x0 && sx < x1 && sy >= y0 && sy < y1) return p;
    const dx = sx < x0 ? x0 - sx : sx > x1 ? sx - x1 : 0;
    const dy = sy < y0 ? y0 - sy : sy > y1 ? sy - y1 : 0;
    const d = Math.hypot(dx, dy);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
};

// Stored scales are ALWAYS feet-per-pixel at the baseline RENDER_SCALE. A hi-res
// sheet is rastered at autoRenderScale, so its bitmap has factorFor× the baseline
// pixels — geometry must divide by that factor (uppFor) and calibration must multiply
// back to baseline, or a quantity would drift with the render resolution. Shape verts
// are normalized to the panel, so positions are scale-free; only the px→feet factor
// moves. factorFor reads the scale ACTUALLY rastered (the canvas's renderScalesRef
// map), so it always matches the bitmap currently on screen.
// `renderScales` is a Map of sheetKey → base raster pdf scale; `scales` is the
// sheetKey → units-per-px record.
export const factorFor = (renderScales, key) => (renderScales.get(key) || RENDER_SCALE) / RENDER_SCALE;
export const uppFor = (scales, renderScales, key) => {
  const u = scales[key];
  return u == null ? null : u / factorFor(renderScales, key);
};
