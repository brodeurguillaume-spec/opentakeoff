// Generic display adapter over the stable storage/export contract. Internal
// floor_sf / wall_sf / border_sf distinguish construction METHODS, not trades.
// Do not rename persisted roles or double-count total_sf alongside its parts.
export function surfaceQuantity(row) {
  if (!row) return 0;
  if (Number.isFinite(row.total_sf)) return row.total_sf;
  return [row.floor_sf, row.wall_sf, row.border_sf]
    .reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
}

export const MEASUREMENT_FAMILIES = Object.freeze({
  floor_area: "surface", surface_area: "surface", deduct: "déduction",
  linear: "longueur", count: "unités", count_run: "unités",
});
