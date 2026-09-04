// Per-sheet presentation metadata and quarter-turn geometry transforms.
//
// A page rotation is not allowed to be cosmetic: takeoffs, markups, approvals,
// Project Map regions and their evidence all live in the page's normalized
// visual frame. When that frame turns, every attached normalized point turns
// with it so existing work stays on the same drawing ink.

export const SHEET_TITLE_MAX = 160;

export function normalizeQuarterTurn(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return ((Math.round(n / 90) * 90) % 360 + 360) % 360;
}

export function sanitizeSheetRotations(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!key || typeof key !== "string") continue;
    const rotation = normalizeQuarterTurn(raw);
    if (rotation) out[key] = rotation;
  }
  return out;
}

export function sanitizeSheetTitles(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!key || typeof key !== "string" || typeof raw !== "string") continue;
    if ([...raw].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) continue;
    const title = raw.trim().replace(/\s+/g, " ");
    if (title && title.length <= SHEET_TITLE_MAX) out[key] = title;
  }
  return out;
}

export function rotateNormPoint(point, delta) {
  if (!Array.isArray(point) || point.length < 2) return point;
  const [x, y] = point;
  switch (normalizeQuarterTurn(delta)) {
    case 90: return [1 - y, x];
    case 180: return [1 - x, 1 - y];
    case 270: return [y, 1 - x];
    default: return [x, y];
  }
}

const rotatePoints = (points, delta) => Array.isArray(points)
  ? points.map((point) => rotateNormPoint(point, delta))
  : points;

const rotateRect = (rect, delta) => {
  if (!Array.isArray(rect) || rect.length !== 2) return rect;
  const a = rotateNormPoint(rect[0], delta), b = rotateNormPoint(rect[1], delta);
  return [[Math.min(a[0], b[0]), Math.min(a[1], b[1])], [Math.max(a[0], b[0]), Math.max(a[1], b[1])]];
};

const rotateBbox = (bbox, delta) => {
  if (!Array.isArray(bbox) || bbox.length !== 4) return bbox;
  const corners = [
    rotateNormPoint([bbox[0], bbox[1]], delta),
    rotateNormPoint([bbox[2], bbox[1]], delta),
    rotateNormPoint([bbox[2], bbox[3]], delta),
    rotateNormPoint([bbox[0], bbox[3]], delta),
  ];
  return [
    Math.min(...corners.map((p) => p[0])), Math.min(...corners.map((p) => p[1])),
    Math.max(...corners.map((p) => p[0])), Math.max(...corners.map((p) => p[1])),
  ];
};

function rotateOrigin(origin, delta) {
  if (!origin || typeof origin !== "object" || Array.isArray(origin)) return origin;
  const next = { ...origin };
  if (Array.isArray(origin.seed_norm)) next.seed_norm = rotateNormPoint(origin.seed_norm, delta);
  if (Array.isArray(origin.proposed_verts_norm)) next.proposed_verts_norm = rotatePoints(origin.proposed_verts_norm, delta);
  if (origin.evidence && typeof origin.evidence === "object" && !Array.isArray(origin.evidence)) {
    next.evidence = { ...origin.evidence };
    if (Array.isArray(origin.evidence.seed_norm)) next.evidence.seed_norm = rotateNormPoint(origin.evidence.seed_norm, delta);
  }
  if (origin.parent_prev && typeof origin.parent_prev === "object" && !Array.isArray(origin.parent_prev)) {
    next.parent_prev = { ...origin.parent_prev };
    if (Array.isArray(origin.parent_prev.verts_norm)) next.parent_prev.verts_norm = rotatePoints(origin.parent_prev.verts_norm, delta);
    if (Array.isArray(origin.parent_prev.verts_norm_holes)) {
      next.parent_prev.verts_norm_holes = origin.parent_prev.verts_norm_holes.map((ring) => rotatePoints(ring, delta));
    }
  }
  return next;
}

export function rotateShapeForSheet(shape, sheetId, delta) {
  if (!shape || shape.sheet_id !== sheetId) return shape;
  const next = { ...shape };
  if (Array.isArray(shape.verts_norm)) next.verts_norm = rotatePoints(shape.verts_norm, delta);
  if (Array.isArray(shape.verts_norm_holes)) next.verts_norm_holes = shape.verts_norm_holes.map((ring) => rotatePoints(ring, delta));
  if (shape.origin) next.origin = rotateOrigin(shape.origin, delta);
  return next;
}

export function rotateMarkupForSheet(markup, sheetId, delta) {
  if (!markup || markup.sheet_id !== sheetId) return markup;
  const next = { ...markup };
  if (Array.isArray(markup.at)) next.at = rotateNormPoint(markup.at, delta);
  if (Array.isArray(markup.target)) next.target = rotateNormPoint(markup.target, delta);
  if (Array.isArray(markup.from)) next.from = rotateNormPoint(markup.from, delta);
  if (Array.isArray(markup.to)) next.to = rotateNormPoint(markup.to, delta);
  if (Array.isArray(markup.pts)) next.pts = rotatePoints(markup.pts, delta);
  if (Array.isArray(markup.rect)) next.rect = rotateRect(markup.rect, delta);
  return next;
}

export function rotateApprovalForSheet(approval, sheetId, delta) {
  return approval?.sheet_id === sheetId && Array.isArray(approval.at)
    ? { ...approval, at: rotateNormPoint(approval.at, delta) }
    : approval;
}

export function rotateRegionForSheet(region, sheetId, delta) {
  if (!region) return region;
  const guides = region.guides?.map(g => ({ ...g, points: g.points.map(p => p.sheet_id === sheetId ? { ...p, at: rotateNormPoint(p.at, delta) } : p) }));
  if (region.sheet_id !== sheetId) return guides && region.guides.some(g => g.points.some(p => p.sheet_id === sheetId)) ? { ...region, guides, preparation_ready: false } : region;
  const next = { ...region };
  if (guides) next.guides = guides;
  if (region.preparation_ready) next.preparation_ready = false;
  if (region.geometry && Array.isArray(region.geometry.verts_norm)) {
    next.geometry = { ...region.geometry, verts_norm: rotatePoints(region.geometry.verts_norm, delta) };
  }
  if (Array.isArray(region.evidence)) {
    next.evidence = region.evidence.map((evidence) => (
      Array.isArray(evidence?.bbox_norm) ? { ...evidence, bbox_norm: rotateBbox(evidence.bbox_norm, delta) } : evidence
    ));
  }
  if (normalizeQuarterTurn(delta) % 180 === 90 && region.scale_profile?.units_per_px_y) {
    next.scale_profile = {
      ...region.scale_profile,
      units_per_px: region.scale_profile.units_per_px_y,
      units_per_px_y: region.scale_profile.units_per_px,
    };
  }
  return next;
}
