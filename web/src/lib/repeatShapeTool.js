// Resolve the drawing tool that best reproduces an existing takeoff shape.
// Shapes intentionally store measurement meaning (`measure_role`) rather than
// UI state, so old project files can still participate. New manual shapes also
// carry `origin.draw_tool`, which preserves Rectangle versus Area exactly.

function approx(a, b, tolerance = 1e-7) {
  return Math.abs(Number(a) - Number(b)) <= tolerance;
}

export function isAxisAlignedRectangle(verts) {
  if (!Array.isArray(verts) || verts.length !== 4) return false;
  const xs = [];
  const ys = [];
  for (const point of verts) {
    if (!Array.isArray(point) || point.length < 2 || !Number.isFinite(Number(point[0])) || !Number.isFinite(Number(point[1]))) return false;
    if (!xs.some((value) => approx(value, point[0]))) xs.push(Number(point[0]));
    if (!ys.some((value) => approx(value, point[1]))) ys.push(Number(point[1]));
  }
  if (xs.length !== 2 || ys.length !== 2) return false;
  return xs.every((x) => ys.every((y) => verts.some((point) => approx(point[0], x) && approx(point[1], y))));
}

export function repeatToolForShape(shape) {
  if (!shape || typeof shape !== "object") return null;
  const hint = shape.origin?.draw_tool || shape.draw_tool || "";

  switch (shape.measure_role) {
    case "count": return "count";
    case "count_run": return "linear-count";
    case "surface_area": return "surface";
    case "linear": return hint === "curve" || shape.curved ? "curve" : "linear";
    case "floor_area":
      if (hint === "area" || hint === "rect") return hint;
      return isAxisAlignedRectangle(shape.verts_norm) ? "rect" : "area";
    case "deduct":
      if (hint === "deduct-rect" || hint === "rect") return "deduct-rect";
      return "deduct";
    default: return null;
  }
}

const PRODUCT_TOOLS = new Set(["oneclick", "area", "rect", "linear", "linear-count", "curve", "surface", "count"]);

function productToolForShape(shape) {
  if (!shape || shape.measure_role === "deduct" || shape.cuts_shape_id) return null;
  return shape.measure_role === "floor_area" && shape.origin?.method === "one_click_v1"
    ? "oneclick" : repeatToolForShape(shape);
}

export function rememberProductShape(history, shape) {
  rememberProductTool(history, shape?.condition_id, productToolForShape(shape));
}

// Session memory records explicit tool choices (including a second click on the
// already-active tool). Merely browsing another Product must not overwrite it.
export function rememberProductTool(history, productId, tool) {
  if (!productId || !PRODUCT_TOOLS.has(tool)) return;
  const previous = history.get(productId);
  history.set(productId, { lastTool: tool, linearCount: tool === "linear-count" || !!previous?.linearCount });
}

export function repeatToolForProduct(productId, shapes, history = new Map(), fallback = "area") {
  if (!productId) return null;
  const remembered = history.get(productId);
  let latest = null;
  let hasLinearCount = !!remembered?.linearCount;
  // Project-wide insertion order, not the visible page or the Product's list
  // position. This also supports legacy projects without any session history.
  for (let i = shapes.length - 1; i >= 0; i--) {
    const shape = shapes[i];
    if (shape.condition_id !== productId) continue;
    const candidate = productToolForShape(shape);
    if (!PRODUCT_TOOLS.has(candidate)) continue;
    latest ||= candidate;
    if (candidate === "linear-count") hasLinearCount = true;
  }
  const preferred = PRODUCT_TOOLS.has(remembered?.lastTool) ? remembered.lastTool : latest;
  // Only resolve the Count/distribution conflict. A newer Area or Linear tool
  // must still win; picking a Count SHAPE explicitly uses repeatToolForShape.
  if (preferred === "count" && hasLinearCount) return "linear-count";
  return preferred || (PRODUCT_TOOLS.has(fallback) ? fallback : "area");
}
