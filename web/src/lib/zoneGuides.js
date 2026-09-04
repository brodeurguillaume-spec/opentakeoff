// Preparation-only data. Never insert these records into shapes or markups.
export const GUIDE_TOOLS = { select: "Déplacer / sélectionner", note: "Note", arrow: "Flèche", measure: "Mesure K", column: "Colonne : vérifier derrière", poi: "POI dans une zone liée", pair: "Repères jumelés", sector: "Secteur à deux bornes", axis_x: "Axes X · A, B…", axis_y: "Axes Y · 1, 2…", datum: "RDC ↕", level_up: "Étages +", level_down: "Sous-sols −" };
export const guidePointCount = kind => kind === "sector" ? 4 : ["pair", "arrow", "measure", "poi"].includes(kind) ? 2 : 1;
export function alphaLabel(number) {
  let n = Number.isFinite(number) ? Math.max(1, Math.min(9999, Math.floor(number))) : 1, label = "";
  while (n) { n--; label = String.fromCharCode(65 + n % 26) + label; n = Math.floor(n / 26); }
  return label;
}
export function guideLabel(kind, n, text = "") {
  if (text.trim()) return text.trim();
  if (kind === "axis_x") return alphaLabel(n);
  if (kind === "axis_y") return String(n);
  if (kind === "level_up") return `Étage ${n}`;
  if (kind === "level_down") return `SS${n}`;
  return kind === "pair" ? `Façade ${n}` : kind === "sector" ? `Secteur ${n}` : kind === "poi" ? `POI ${n}` : kind === "datum" ? "RDC · réf. 100" : kind === "column" ? "Colonne — vérifier le revêtement derrière" : kind === "measure" ? "Dimension de référence" : "Repère";
}
export function guideError(guides) {
  if (!Array.isArray(guides) || guides.length > 2000) return "Liste de repères invalide (maximum 2 000 par zone).";
  const ids = new Set();
  for (const g of guides) {
    if (!g || typeof g.id !== "string" || !g.id.trim() || g.id.length > 512 || ids.has(g.id) || !Object.prototype.hasOwnProperty.call(GUIDE_TOOLS, g.kind) || g.kind === "select" || typeof g.label !== "string" || !g.label.trim() || g.label.length > 2000 || !Array.isArray(g.points) || !g.points.length || g.points.length > guidePointCount(g.kind)) return "Repère invalide.";
    if (g.actor !== "human" || !["view", "element"].includes(g.reference_type) || !["ground_floor", "other_level"].includes(g.target_role)) return "Contexte de repère invalide.";
    ids.add(g.id);
    for (const p of g.points) if (!p || typeof p.sheet_id !== "string" || !p.sheet_id.trim() || p.sheet_id.length > 512 || !Array.isArray(p.at) || p.at.length !== 2 || p.at.some(n => !Number.isFinite(n) || n < 0 || n > 1)) return "Position de repère invalide.";
    if (g.kind === "poi" && (typeof g.linked_region_id !== "string" || !g.linked_region_id.startsWith("region:") || g.linked_region_id.length > 512 || new Set(g.points.map(p => p.sheet_id)).size > 1)) return "POI lié invalide.";
    if (["measure", "arrow"].includes(g.kind) && new Set(g.points.map(p => p.sheet_id)).size > 1) return "Les deux points doivent être sur la même feuille.";
    if (g.kind === "sector" && ((g.points[1] && g.points[0].sheet_id !== g.points[1].sheet_id) || (g.points[3] && g.points[2].sheet_id !== g.points[3].sheet_id))) return "Chaque paire de bornes doit être sur une même feuille.";
  }
  return null;
}
export function shiftPoints(points, dx, dy) {
  if (!points.length) return [];
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const x = Math.max(-Math.min(...xs), Math.min(1 - Math.max(...xs), dx));
  const y = Math.max(-Math.min(...ys), Math.min(1 - Math.max(...ys), dy));
  return points.map(p => [p[0] + x, p[1] + y]);
}
