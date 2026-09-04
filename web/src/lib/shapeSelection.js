// A reconciled deduction and its parent share one visible hole boundary.
// First contact deliberately exposes the parent; after that the same contour
// opens the deduction and must keep returning it while the operator edits it.
export function linkedContourTarget(linkedShape, parentShape, selectedId) {
  if (!linkedShape) return parentShape || null;
  if (!linkedShape.cuts_shape_id) return linkedShape;
  const deductionIsOpen = selectedId === linkedShape.cuts_shape_id || selectedId === linkedShape.id;
  return deductionIsOpen ? linkedShape : (parentShape || linkedShape);
}

// Once the parent Area is deliberately selected, the operator is effectively
// inside that Area's deduction context. Its empty hole is then a safe target:
// one linked deduction under the pointer can open for editing, but ambiguity
// (two holes or a positive shape at the same point) still falls through to the
// normal picker. Before the parent is selected this always returns null, so a
// deduction can never shield ordinary takeoff geometry.
export function linkedBodyTarget(parentShape, linkedHits, blockedByPositive = false) {
  if (!parentShape || parentShape.cuts_shape_id || parentShape.measure_role !== "floor_area" || blockedByPositive) return null;
  const hits = Array.isArray(linkedHits) ? linkedHits : [];
  return hits.length === 1 ? hits[0] : null;
}

// Moving a linked deduction is a rigid translation. Its own area/perimeter do
// not change, so asking the scale-zone resolver to price the moved ring is both
// unnecessary and harmful: crossing a Map-zone boundary can make that lookup
// transiently ambiguous and bounce an otherwise valid drag back to its start.
// Vertex/edge/tidy edits do change geometry and still require a fresh scale.
export const linkedDeductionEditNeedsScale = (editKind) => editKind !== "move";
