import type { NormPoint, PlanRegion } from "./regions";

export type ScaleGeometryKind = "point" | "polyline" | "polygon";

export interface ScaleGeometry {
  kind: ScaleGeometryKind;
  verts_norm: NormPoint[];
}

export type RegionScaleResolution =
  | {
      status: "resolved";
      units_per_px: number;
      source: "region" | "sheet";
      region_id?: string;
      region_ids?: string[];
      label?: string;
    }
  | {
      status: "missing" | "crosses_zone" | "ambiguous" | "unconfirmed" | "unsupported";
      region_ids: string[];
      message: string;
    };

const EPS = 1e-9;

const cross = (a: NormPoint, b: NormPoint, c: NormPoint): number =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function pointOnSegment(p: NormPoint, a: NormPoint, b: NormPoint): boolean {
  if (Math.abs(cross(a, b, p)) > EPS) return false;
  return p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS
    && p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS;
}

/** Boundary-inclusive point-in-ring. Scale zone edges belong to the zone so a
 * measurement snapped exactly to the outline does not fail nondeterministically. */
export function pointInRegionRing(point: NormPoint, ring: readonly NormPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    if (pointOnSegment(point, a, b)) return true;
    const crossesY = (a[1] > point[1]) !== (b[1] > point[1]);
    if (crossesY) {
      const x = ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0];
      if (point[0] < x) inside = !inside;
    }
  }
  return inside;
}

function segmentBoundaryParams(a: NormPoint, b: NormPoint, ring: readonly NormPoint[]): number[] {
  const params = [0, 1];
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const add = (value: number) => {
    if (value >= -EPS && value <= 1 + EPS) params.push(Math.max(0, Math.min(1, value)));
  };
  for (let i = 0; i < ring.length; i++) {
    const c = ring[i], d = ring[(i + 1) % ring.length];
    const ex = d[0] - c[0], ey = d[1] - c[1];
    const denom = dx * ey - dy * ex;
    const acx = c[0] - a[0], acy = c[1] - a[1];
    if (Math.abs(denom) > EPS) {
      const t = (acx * ey - acy * ex) / denom;
      const u = (acx * dy - acy * dx) / denom;
      if (u >= -EPS && u <= 1 + EPS) add(t);
      continue;
    }
    if (Math.abs(acx * dy - acy * dx) > EPS) continue;
    const axis = Math.abs(dx) >= Math.abs(dy) ? 0 : 1;
    const span = axis === 0 ? dx : dy;
    if (Math.abs(span) <= EPS) continue;
    add(((axis === 0 ? c[0] : c[1]) - (axis === 0 ? a[0] : a[1])) / span);
    add(((axis === 0 ? d[0] : d[1]) - (axis === 0 ? a[0] : a[1])) / span);
  }
  return [...new Set(params.map((value) => Math.round(value * 1e12) / 1e12))].sort((x, y) => x - y);
}

function segmentSamples(a: NormPoint, b: NormPoint, ring: readonly NormPoint[]): NormPoint[] {
  const params = segmentBoundaryParams(a, b, ring);
  const samples: NormPoint[] = [a, b];
  for (let i = 0; i < params.length - 1; i++) {
    const t = (params[i] + params[i + 1]) / 2;
    samples.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return samples;
}

type ZoneRelation = "inside" | "outside" | "crosses";

/** Exact for simple polygonal rings: segment intervals are split at every zone
 * boundary intersection, then sampled. Polygon containment also checks the
 * inverse case where the measurement surrounds the entire scale zone. */
export function classifyScaleGeometry(
  geometry: ScaleGeometry,
  zoneRing: readonly NormPoint[],
): ZoneRelation {
  if (!geometry.verts_norm.length || zoneRing.length < 3) return "outside";
  if (geometry.kind === "point") {
    return pointInRegionRing(geometry.verts_norm[0], zoneRing) ? "inside" : "outside";
  }

  let sawInside = false, sawOutside = false;
  const edgeCount = geometry.kind === "polygon"
    ? geometry.verts_norm.length
    : Math.max(0, geometry.verts_norm.length - 1);
  for (let i = 0; i < edgeCount; i++) {
    const a = geometry.verts_norm[i];
    const b = geometry.verts_norm[(i + 1) % geometry.verts_norm.length];
    for (const sample of segmentSamples(a, b, zoneRing)) {
      if (pointInRegionRing(sample, zoneRing)) sawInside = true;
      else sawOutside = true;
    }
  }
  if (geometry.kind === "polygon" && !sawOutside) return "inside";
  if (geometry.kind === "polygon" && zoneRing.some((point) => pointInRegionRing(point, geometry.verts_norm))) {
    sawInside = true;
    sawOutside = true;
  }
  if (sawInside && sawOutside) return "crosses";
  return sawInside ? "inside" : "outside";
}

function ringArea(ring: readonly NormPoint[]): number {
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    twice += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(twice) / 2;
}

function isAncestor(candidate: PlanRegion, other: PlanRegion, byId: Map<string, PlanRegion>): boolean {
  let cursor = other.parent_id ? byId.get(other.parent_id) : undefined;
  while (cursor) {
    if (cursor.id === candidate.id) return true;
    cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
  }
  return false;
}

/** Resolve the baseline feet-per-image-pixel scale for one measurement.
 * Nested child zones override ancestors. Unrelated overlaps may agree on one
 * scale; conflicting overlaps, unconfirmed zones and boundary crossings refuse
 * instead of silently falling back to the sheet scale. */
export function resolveRegionScale(args: {
  sheet_id: string;
  geometry: ScaleGeometry;
  regions: readonly PlanRegion[];
  sheet_units_per_px?: number | null;
}): RegionScaleResolution {
  const zones = args.regions.filter((region) =>
    region.sheet_id === args.sheet_id
    && (region.purposes.includes("scale") || region.scale_profile != null));
  const relations = zones.map((region) => ({
    region,
    relation: classifyScaleGeometry(args.geometry, region.geometry.verts_norm),
  }));
  const crossing = relations.filter((entry) => entry.relation === "crosses").map((entry) => entry.region);
  if (crossing.length) {
    return {
      status: "crosses_zone",
      region_ids: crossing.map((region) => region.id),
      message: `Measurement crosses scale zone ${crossing.map((region) => `“${region.name}”`).join(", ")} — keep it entirely inside one zone or split it.`,
    };
  }

  const inside = relations.filter((entry) => entry.relation === "inside").map((entry) => entry.region);
  if (!inside.length) {
    if (typeof args.sheet_units_per_px === "number" && Number.isFinite(args.sheet_units_per_px) && args.sheet_units_per_px > 0) {
      return { status: "resolved", units_per_px: args.sheet_units_per_px, source: "sheet" };
    }
    return { status: "missing", region_ids: [], message: "No confirmed scale applies here. Set the sheet scale or create a confirmed scale zone." };
  }

  const byId = new Map(zones.map((region) => [region.id, region]));
  const leaves = inside.filter((candidate) => !inside.some((other) =>
    candidate.id !== other.id && isAncestor(candidate, other, byId)));
  const ordered = [...leaves].sort((a, b) => ringArea(a.geometry.verts_norm) - ringArea(b.geometry.verts_norm) || a.id.localeCompare(b.id));

  const unconfirmed = ordered.filter((region) => region.scale_profile?.confirmed !== true);
  if (unconfirmed.length) {
    return {
      status: "unconfirmed",
      region_ids: unconfirmed.map((region) => region.id),
      message: `Scale zone ${unconfirmed.map((region) => `“${region.name}”`).join(", ")} is not human-confirmed. Confirm it before measuring.`,
    };
  }
  const unsupported = ordered.filter((region) => {
    const x = region.scale_profile?.units_per_px, y = region.scale_profile?.units_per_px_y;
    return !(typeof x === "number" && Number.isFinite(x) && x > 0)
      || (typeof y === "number" && Math.abs(y - x) > Math.max(EPS, x * 1e-9));
  });
  if (unsupported.length) {
    return {
      status: "unsupported",
      region_ids: unsupported.map((region) => region.id),
      message: `Scale zone ${unsupported.map((region) => `“${region.name}”`).join(", ")} needs one confirmed uniform scale. Independent X/Y scales are not supported yet.`,
    };
  }

  const first = ordered[0];
  const firstUpp = first.scale_profile!.units_per_px!;
  const conflicting = ordered.filter((region) => Math.abs(region.scale_profile!.units_per_px! - firstUpp) > Math.max(EPS, firstUpp * 1e-9));
  if (conflicting.length) {
    return {
      status: "ambiguous",
      region_ids: ordered.map((region) => region.id),
      message: `Measurement is inside overlapping scale zones with conflicting scales: ${ordered.map((region) => `“${region.name}”`).join(", ")}. Adjust the zones or their hierarchy.`,
    };
  }
  return {
    status: "resolved",
    units_per_px: firstUpp,
    source: "region",
    region_id: first.id,
    region_ids: ordered.map((region) => region.id),
    ...(first.scale_profile?.label ? { label: first.scale_profile.label } : {}),
  };
}
