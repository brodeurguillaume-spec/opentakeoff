// Persistent project-map regions — the shared data contract behind semantic
// Spaces, scale viewports, bounded analysis profiles, and GRUMP's mapping
// proposals.  This module is deliberately UI-free and pdfjs-free: the Canvas
// owns confirmed region geometry, while the MCP imports the same sanitizer so
// both sides persist exactly the same records.

export const REGION_PREFIX = "region:";
export const REGION_PURPOSES = ["semantic", "scale", "analysis"] as const;
export const REGION_REVIEW_STATUSES = ["proposed", "confirmed", "needs_review", "rejected"] as const;

export type RegionPurpose = typeof REGION_PURPOSES[number];
export type RegionReviewStatus = typeof REGION_REVIEW_STATUSES[number];
export type NormPoint = [number, number];

export interface RegionGeometry {
  type: "polygon";
  verts_norm: NormPoint[];
}

export interface RegionScaleProfile {
  units_per_px?: number;
  units_per_px_y?: number;
  label?: string;
  source?: string;
  confirmed?: boolean;
  confidence?: number;
  evidence_ids?: string[];
}

export interface RegionAnalysisProfile {
  include_layers?: string[];
  exclude_layers?: string[];
  include_hatches?: string[];
  exclude_hatches?: string[];
}

export interface RegionEvidence {
  id: string;
  kind: string;
  source?: string;
  text?: string;
  sheet_id?: string;
  bbox_norm?: [number, number, number, number];
  confidence?: number;
}

export interface RegionLink {
  id: string;
  type: string;
  target_region_id?: string;
  target_sheet_id?: string;
  target_document_id?: string;
  tag?: string;
  status?: RegionReviewStatus;
  confidence?: number;
  evidence_ids?: string[];
}

export interface RegionAssessment {
  confidence: number;
  status?: RegionReviewStatus;
  evidence_ids?: string[];
}

export interface RegionReview {
  status: RegionReviewStatus;
  fields?: Record<string, RegionReviewStatus>;
  reviewed_by?: string;
  reviewed_at?: string;
  reason_code?: string;
  note?: string;
}

export interface PlanRegion {
  id: string;
  sheet_id: string;
  name: string;
  kind: string;
  geometry: RegionGeometry;
  purposes: RegionPurpose[];
  revision: number;
  parent_id?: string;
  scale_profile?: RegionScaleProfile;
  analysis_profile?: RegionAnalysisProfile;
  evidence?: RegionEvidence[];
  links?: RegionLink[];
  assessments?: Record<string, RegionAssessment>;
  review: RegionReview;
  origin?: Record<string, unknown>;
  [key: string]: unknown;
}

export type RegionCommand =
  | { type: "replace"; region: PlanRegion; index?: number }
  | { type: "delete"; id: string };

export interface RegionCommandResult {
  regions: PlanRegion[];
  inverse: RegionCommand | null;
  changed: boolean;
}

export interface RegionReviewOptions {
  reviewed_by?: string;
  reviewed_at?: string;
  reason_code?: string;
  note?: string;
}

const PURPOSES = new Set<string>(REGION_PURPOSES);
const STATUSES = new Set<string>(REGION_REVIEW_STATUSES);
const MAX_TEXT = 2048;

const text = (value: unknown, max = 512): string | null => {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned && cleaned.length <= max ? cleaned : null;
};
const confidence = (value: unknown): number | null => (
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null
);
const positive = (value: unknown): number | null => (
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null
);
const norm = (value: unknown): number | null => (
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null
);
const stringList = (value: unknown, max = 256): string[] => {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of value.slice(0, max)) {
    const item = text(raw);
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
};

function sanitizeGeometry(value: unknown): RegionGeometry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.type !== "polygon" || !Array.isArray(raw.verts_norm)) return null;
  const verts: NormPoint[] = [];
  for (const point of raw.verts_norm) {
    if (!Array.isArray(point) || point.length !== 2) return null;
    const x = norm(point[0]), y = norm(point[1]);
    if (x == null || y == null) return null;
    verts.push([x, y]);
  }
  // A closing vertex is redundant in the persisted contract. Remove it so
  // identity and later overlap checks do not depend on a drawing gesture.
  if (verts.length > 3) {
    const first = verts[0], last = verts[verts.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) verts.pop();
  }
  if (verts.length < 3) return null;
  let twiceArea = 0;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i], b = verts[(i + 1) % verts.length];
    twiceArea += a[0] * b[1] - b[0] * a[1];
  }
  if (Math.abs(twiceArea) <= 1e-12) return null;
  return { type: "polygon", verts_norm: verts };
}

function sanitizeScaleProfile(value: unknown): RegionScaleProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const x = positive(raw.units_per_px);
  const y = positive(raw.units_per_px_y);
  const label = text(raw.label);
  if (x == null && y == null && label == null) return null;
  return {
    ...(x != null ? { units_per_px: x } : {}),
    ...(y != null ? { units_per_px_y: y } : {}),
    ...(label ? { label } : {}),
    ...(text(raw.source) ? { source: text(raw.source)! } : {}),
    ...(typeof raw.confirmed === "boolean" ? { confirmed: raw.confirmed } : {}),
    ...(confidence(raw.confidence) != null ? { confidence: confidence(raw.confidence)! } : {}),
    ...(stringList(raw.evidence_ids).length ? { evidence_ids: stringList(raw.evidence_ids) } : {}),
  };
}

function sanitizeAnalysisProfile(value: unknown): RegionAnalysisProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const result: RegionAnalysisProfile = {};
  for (const key of ["include_layers", "exclude_layers", "include_hatches", "exclude_hatches"] as const) {
    const items = stringList(raw[key]);
    if (items.length) result[key] = items;
  }
  return Object.keys(result).length ? result : null;
}

function sanitizeEvidence(value: unknown): RegionEvidence[] {
  if (!Array.isArray(value)) return [];
  const out: RegionEvidence[] = [];
  const seen = new Set<string>();
  for (const entry of value.slice(0, 256)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const raw = entry as Record<string, unknown>;
    const id = text(raw.id), kind = text(raw.kind);
    if (!id || !kind || seen.has(id)) continue;
    const bbox = Array.isArray(raw.bbox_norm) && raw.bbox_norm.length === 4
      ? raw.bbox_norm.map(norm)
      : null;
    seen.add(id);
    out.push({
      id, kind,
      ...(text(raw.source) ? { source: text(raw.source)! } : {}),
      ...(text(raw.text, MAX_TEXT) ? { text: text(raw.text, MAX_TEXT)! } : {}),
      ...(text(raw.sheet_id) ? { sheet_id: text(raw.sheet_id)! } : {}),
      ...(bbox && bbox.every((part) => part != null) && bbox[0]! <= bbox[2]! && bbox[1]! <= bbox[3]!
        ? { bbox_norm: bbox as [number, number, number, number] }
        : {}),
      ...(confidence(raw.confidence) != null ? { confidence: confidence(raw.confidence)! } : {}),
    });
  }
  return out;
}

function sanitizeLinks(value: unknown, regionId: string): RegionLink[] {
  if (!Array.isArray(value)) return [];
  const out: RegionLink[] = [];
  const seen = new Set<string>();
  for (const entry of value.slice(0, 256)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const raw = entry as Record<string, unknown>;
    const id = text(raw.id), type = text(raw.type);
    const targetRegion = text(raw.target_region_id);
    const targetSheet = text(raw.target_sheet_id);
    const targetDocument = text(raw.target_document_id);
    const tag = text(raw.tag);
    if (!id || !type || seen.has(id) || targetRegion === regionId) continue;
    if (!targetRegion && !targetSheet && !targetDocument && !tag) continue;
    const status = text(raw.status);
    seen.add(id);
    out.push({
      id, type,
      ...(targetRegion ? { target_region_id: targetRegion } : {}),
      ...(targetSheet ? { target_sheet_id: targetSheet } : {}),
      ...(targetDocument ? { target_document_id: targetDocument } : {}),
      ...(tag ? { tag } : {}),
      ...(status && STATUSES.has(status) ? { status: status as RegionReviewStatus } : {}),
      ...(confidence(raw.confidence) != null ? { confidence: confidence(raw.confidence)! } : {}),
      ...(stringList(raw.evidence_ids).length ? { evidence_ids: stringList(raw.evidence_ids) } : {}),
    });
  }
  return out;
}

function sanitizeAssessments(value: unknown): Record<string, RegionAssessment> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, RegionAssessment> = {};
  for (const [rawKey, entry] of Object.entries(value as Record<string, unknown>).slice(0, 64)) {
    const key = text(rawKey, 128);
    if (!key || !entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const raw = entry as Record<string, unknown>;
    const score = confidence(raw.confidence);
    if (score == null) continue;
    const status = text(raw.status);
    out[key] = {
      confidence: score,
      ...(status && STATUSES.has(status) ? { status: status as RegionReviewStatus } : {}),
      ...(stringList(raw.evidence_ids).length ? { evidence_ids: stringList(raw.evidence_ids) } : {}),
    };
  }
  return out;
}

function sanitizeReview(value: unknown): RegionReview {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const statusValue = text(raw.status);
  const status = statusValue && STATUSES.has(statusValue)
    ? statusValue as RegionReviewStatus
    : "needs_review";
  const fields: Record<string, RegionReviewStatus> = {};
  if (raw.fields && typeof raw.fields === "object" && !Array.isArray(raw.fields)) {
    for (const [rawKey, rawStatus] of Object.entries(raw.fields as Record<string, unknown>).slice(0, 64)) {
      const key = text(rawKey, 128), fieldStatus = text(rawStatus);
      if (key && fieldStatus && STATUSES.has(fieldStatus)) fields[key] = fieldStatus as RegionReviewStatus;
    }
  }
  return {
    status,
    ...(Object.keys(fields).length ? { fields } : {}),
    ...(text(raw.reviewed_by) ? { reviewed_by: text(raw.reviewed_by)! } : {}),
    ...(text(raw.reviewed_at) ? { reviewed_at: text(raw.reviewed_at)! } : {}),
    ...(text(raw.reason_code) ? { reason_code: text(raw.reason_code)! } : {}),
    ...(text(raw.note, MAX_TEXT) ? { note: text(raw.note, MAX_TEXT)! } : {}),
  };
}

/** Load gate for the additive `regions` payload field. Old projects return [];
 * malformed regions are dropped individually; duplicate ids are first-wins.
 * Parent links are kept only when the parent exists on the same sheet and the
 * resulting hierarchy is acyclic. Unknown root fields survive a valid record
 * so a future build does not lose additive metadata on save.
 */
export function sanitizeRegions(value: unknown): PlanRegion[] {
  if (!Array.isArray(value)) return [];
  const regions: PlanRegion[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const raw = entry as Record<string, unknown>;
    const id = text(raw.id), sheetId = text(raw.sheet_id), name = text(raw.name), kind = text(raw.kind, 128);
    const geometry = sanitizeGeometry(raw.geometry);
    if (!id || !id.startsWith(REGION_PREFIX) || seen.has(id) || !sheetId || !name || !kind || !geometry) continue;
    const purposes = stringList(raw.purposes).filter((purpose): purpose is RegionPurpose => PURPOSES.has(purpose));
    const scaleProfile = sanitizeScaleProfile(raw.scale_profile);
    const analysisProfile = sanitizeAnalysisProfile(raw.analysis_profile);
    if (scaleProfile && !purposes.includes("scale")) purposes.push("scale");
    if (analysisProfile && !purposes.includes("analysis")) purposes.push("analysis");
    if (!purposes.length) purposes.push("semantic");
    const revision = typeof raw.revision === "number" && Number.isInteger(raw.revision) && raw.revision >= 1 ? raw.revision : 1;
    const evidence = sanitizeEvidence(raw.evidence);
    const links = sanitizeLinks(raw.links, id);
    const assessments = sanitizeAssessments(raw.assessments);
    const parentId = text(raw.parent_id);
    seen.add(id);
    const next = {
      ...raw,
      id, sheet_id: sheetId, name, kind, geometry, purposes, revision,
      review: sanitizeReview(raw.review),
    } as PlanRegion;
    // The root record is forward-compatible, but today's known optional fields
    // must not survive in a malformed form merely because the raw spread above
    // preserved them. Re-add only their sanitized representation.
    delete next.parent_id;
    delete next.scale_profile;
    delete next.analysis_profile;
    delete next.evidence;
    delete next.links;
    delete next.assessments;
    delete next.origin;
    if (parentId && parentId !== id) next.parent_id = parentId;
    if (scaleProfile) next.scale_profile = scaleProfile;
    if (analysisProfile) next.analysis_profile = analysisProfile;
    if (evidence.length) next.evidence = evidence;
    if (links.length) next.links = links;
    if (Object.keys(assessments).length) next.assessments = assessments;
    if (raw.origin && typeof raw.origin === "object" && !Array.isArray(raw.origin)) next.origin = raw.origin as Record<string, unknown>;
    regions.push(next);
  }

  const byId = new Map(regions.map((region) => [region.id, region]));
  for (const region of regions) {
    const parent = region.parent_id ? byId.get(region.parent_id) : null;
    if (!parent || parent.sheet_id !== region.sheet_id) delete region.parent_id;
  }
  // Break every cycle at the member currently being inspected. The exact edge
  // removed is irrelevant; the invariant that hydrate always receives a tree
  // is what the future nested-region UI depends on.
  for (const region of regions) {
    const path = new Set<string>([region.id]);
    let cursor: PlanRegion | undefined = region;
    while (cursor?.parent_id) {
      if (path.has(cursor.parent_id)) { delete cursor.parent_id; break; }
      path.add(cursor.parent_id);
      cursor = byId.get(cursor.parent_id);
    }
  }
  return regions;
}

export function mintRegionId(): string {
  const uid = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${REGION_PREFIX}${uid}`;
}

/** Build one immutable human-review transition. Rejection is deliberately a
 * status change, not deletion: the mapped geometry remains available for
 * correction, comparison and audit until a separate delete command removes it.
 */
export function reviewRegion(
  value: PlanRegion,
  status: RegionReviewStatus,
  options: RegionReviewOptions = {},
): PlanRegion | null {
  const [region] = sanitizeRegions([value]);
  if (!region || !STATUSES.has(status)) return null;
  const now = text(options.reviewed_at) || new Date().toISOString();
  const reviewer = text(options.reviewed_by) || "human";
  const reasonCode = text(options.reason_code);
  const note = text(options.note, MAX_TEXT);
  const fields = { ...(region.review.fields || {}) };
  const reviewable = ["name", "kind", "geometry", "purposes"];
  for (const key of ["scale_profile", "analysis_profile", "evidence", "links", "assessments"] as const) {
    if (region[key] != null) reviewable.push(key);
  }
  // A whole-card verdict resolves every populated field. `needs_review` keeps
  // each field visibly open; rejection records what the human rejected.
  for (const key of reviewable) fields[key] = status;
  const next: PlanRegion = {
    ...region,
    revision: region.revision + 1,
    review: {
      ...region.review,
      status,
      fields,
      reviewed_by: reviewer,
      reviewed_at: now,
      ...(reasonCode ? { reason_code: reasonCode } : {}),
      ...(note ? { note } : {}),
    },
  };
  const [sanitized] = sanitizeRegions([next]);
  return sanitized || null;
}

/** Pure mutation gate for the manual Project Map editor. `replace` covers both
 * create and update; its inverse restores the exact previous record and index.
 * Every command passes through the same sanitizer as hydrate/import, so the UI
 * cannot persist geometry the rest of the product would later discard. */
export function applyRegionCommand(
  source: readonly PlanRegion[],
  command: RegionCommand,
): RegionCommandResult {
  const regions = sanitizeRegions(source);
  if (command.type === "delete") {
    const index = regions.findIndex((region) => region.id === command.id);
    if (index < 0) return { regions, inverse: null, changed: false };
    const previous = regions[index];
    return {
      regions: regions.filter((region) => region.id !== command.id),
      inverse: { type: "replace", region: previous, index },
      changed: true,
    };
  }

  if (command.type !== "replace") return { regions, inverse: null, changed: false };
  const [next] = sanitizeRegions([command.region]);
  if (!next) return { regions, inverse: null, changed: false };
  const index = regions.findIndex((region) => region.id === next.id);
  if (index >= 0) {
    const previous = regions[index];
    if (JSON.stringify(previous) === JSON.stringify(next)) {
      return { regions, inverse: null, changed: false };
    }
    const updated = [...regions];
    updated[index] = next;
    return {
      regions: updated,
      inverse: { type: "replace", region: previous, index },
      changed: true,
    };
  }
  const insertAt = Number.isInteger(command.index)
    ? Math.max(0, Math.min(regions.length, Number(command.index)))
    : regions.length;
  const updated = [...regions];
  updated.splice(insertAt, 0, next);
  return {
    regions: updated,
    inverse: { type: "delete", id: next.id },
    changed: true,
  };
}
