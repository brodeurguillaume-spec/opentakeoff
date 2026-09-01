// Project Map → takeoff/report bridge. Regions remain the spatial source of
// truth; this module only derives a stable semantic bucket for each shape.
// Proposed/rejected zones never classify quantities silently.

const EPS = 1e-9;

const polygonArea = (poly) => {
  let twice = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    twice += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(twice) / 2;
};

const onSegment = (p, a, b) => {
  const cross = (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]);
  if (Math.abs(cross) > EPS) return false;
  return p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS
    && p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS;
};

export function pointInMapPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if (onSegment(point, a, b)) return true;
    const crosses = (b[1] > point[1]) !== (a[1] > point[1])
      && point[0] < ((a[0] - b[0]) * (point[1] - b[1])) / (a[1] - b[1]) + b[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

const reportRegion = (region) => region?.review?.status === "confirmed"
  && region.purposes?.includes("semantic")
  && Array.isArray(region.geometry?.verts_norm)
  && region.geometry.verts_norm.length >= 3;

export function mapRegionForShape(shape, regions = []) {
  const points = Array.isArray(shape?.verts_norm) ? shape.verts_norm : [];
  if (!shape?.sheet_id || !points.length) return null;
  const matches = regions.filter((region) => reportRegion(region)
    && region.sheet_id === shape.sheet_id
    && points.every((point) => pointInMapPolygon(point, region.geometry.verts_norm)));
  if (!matches.length) return null;
  // Nested map zones are expected (sheet → elevation → detail). The smallest
  // confirmed semantic enclosure is the most precise description.
  return matches.sort((a, b) => polygonArea(a.geometry.verts_norm) - polygonArea(b.geometry.verts_norm))[0];
}

export function mapZoneTree(regions = []) {
  const clean = regions.filter((region) => region?.id && region?.sheet_id && region?.name);
  const byId = new Map(clean.map((region) => [region.id, region]));
  const children = new Map();
  for (const region of clean) {
    const parent = byId.has(region.parent_id) ? region.parent_id : null;
    const key = `${region.sheet_id}\0${parent || ""}`;
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(region);
  }
  for (const list of children.values()) list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const sheets = [...new Set(clean.map((region) => region.sheet_id))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const out = [];
  const visit = (sheetId, parentId, depth, seen) => {
    for (const region of children.get(`${sheetId}\0${parentId || ""}`) || []) {
      if (seen.has(region.id)) continue;
      seen.add(region.id);
      out.push({ region, depth });
      visit(sheetId, region.id, depth + 1, seen);
    }
  };
  for (const sheetId of sheets) {
    const seen = new Set();
    visit(sheetId, null, 0, seen);
    // Corrupt/migrated data can contain an orphaned parent chain or a cycle.
    // Keep those zones visible for repair instead of dropping them from Columns.
    for (const region of clean.filter((candidate) => candidate.sheet_id === sheetId)) {
      if (seen.has(region.id)) continue;
      seen.add(region.id);
      out.push({ region, depth: 0 });
      visit(sheetId, region.id, 1, seen);
    }
  }
  return out;
}
