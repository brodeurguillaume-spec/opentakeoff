// Compatibility island, not a user/project setting. No trade is inferred
// from a measuring tool. Keep old formulas/data available without enabling
// automatic suggestions for every project. See docs/LEGACY_TRADE_BEHAVIORS.md.
export const LEGACY_TRADE_FEATURES = Object.freeze({
  rollGoodsUi: false,
  carpetRollWarning: false,
  derivedPerimeterSurface: false,
  coverageSuggestions: false,
});

// Historic 12 ft carpet-roll seam warning, including its original tolerance.
// Explicit opt-in parameter makes the old behavior testable without enabling it.
/** @param {number[]} lengthsFt @param {boolean} [enabled] */
export function legacyRollWarning(lengthsFt, enabled = LEGACY_TRADE_FEATURES.carpetRollWarning) {
  return enabled && lengthsFt.some((length) => length >= 12 - 0.02);
}

// Retained vocabulary/profile for old file consumers or a future trade view.
// The generic report never loads these, even if old column prefs remain saved.
export const LEGACY_SURFACE_COLUMNS = [
  { key: "floor_sf", header: "Floor SF", defaultVisible: true },
  { key: "wall_sf", header: "Wall SF", defaultVisible: true },
  { key: "border_sf", header: "Border SF", defaultVisible: true },
];

// Historical automatic Area-derived references (not actual takeoff quantities).
/** @param {number} areaSf @param {number} perimeterLf @param {number} heightFt @param {boolean} [enabled] */
export function legacyAreaReferences(areaSf, perimeterLf, heightFt, enabled = LEGACY_TRADE_FEATURES.derivedPerimeterSurface) {
  if (!enabled || !(heightFt > 0)) return null;
  return { surface_sf: perimeterLf * heightFt, volume_cy: areaSf * heightFt / 27 };
}
