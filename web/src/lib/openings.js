// Project-scoped opening library. An opening is geometry only: a named polygon
// expressed as real-foot offsets from its centre. Keeping physical dimensions
// (rather than pixels or normalized sheet coordinates) lets the same door or
// window land at the right size on any calibrated sheet/scale zone.

const finitePoint = (point) => Array.isArray(point)
  && point.length >= 2
  && Number.isFinite(Number(point[0]))
  && Number.isFinite(Number(point[1]));

export function sanitizeOpeningTemplates(value) {
  if (!Array.isArray(value)) return [];
  const ids = new Set();
  const out = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 160) : "";
    const offsets = Array.isArray(raw.offsets_ft)
      ? raw.offsets_ft.filter(finitePoint).map(([x, y]) => [Number(x), Number(y)])
      : [];
    if (!id || ids.has(id) || !name || offsets.length < 3) continue;
    ids.add(id);
    out.push({ id, name, offsets_ft: offsets });
  }
  return out;
}

export function openingTemplateFromShape(shape, image, effectiveUpp, name, id) {
  const verts = Array.isArray(shape?.verts_norm) ? shape.verts_norm : [];
  const width = Number(image?.w), height = Number(image?.h), upp = Number(effectiveUpp);
  const cleanName = typeof name === "string" ? name.trim().slice(0, 160) : "";
  if (shape?.measure_role !== "deduct" || verts.length < 3 || !(width > 0) || !(height > 0) || !(upp > 0) || !cleanName || !id) return null;
  const points = verts.filter(finitePoint).map(([x, y]) => [Number(x) * width, Number(y) * height]);
  if (points.length < 3) return null;
  const xs = points.map((point) => point[0]), ys = points.map((point) => point[1]);
  const centre = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  return {
    id,
    name: cleanName,
    offsets_ft: points.map(([x, y]) => [(x - centre[0]) * upp, (y - centre[1]) * upp]),
  };
}

export function openingStagePoints(template, anchorStage, effectiveUpp) {
  const upp = Number(effectiveUpp);
  if (!template || !finitePoint(anchorStage) || !(upp > 0)) return null;
  const offsets = Array.isArray(template.offsets_ft) ? template.offsets_ft.filter(finitePoint) : [];
  if (offsets.length < 3) return null;
  return offsets.map(([dx, dy]) => [Number(anchorStage[0]) + Number(dx) / upp, Number(anchorStage[1]) + Number(dy) / upp]);
}

export function openingDimensions(template) {
  const points = Array.isArray(template?.offsets_ft) ? template.offsets_ft.filter(finitePoint) : [];
  if (points.length < 3) return null;
  const xs = points.map((point) => Number(point[0])), ys = points.map((point) => Number(point[1]));
  return { width_ft: Math.max(...xs) - Math.min(...xs), height_ft: Math.max(...ys) - Math.min(...ys) };
}
