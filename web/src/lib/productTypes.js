export const PRODUCT_TYPES = [
  ["", "Non classé"],
  ["brick", "Brique"],
  ["stone", "Pierre"],
  ["architectural_block", "Bloc architectural"],
  ["concrete_block", "Bloc de béton"],
  ["sill", "Allège"],
  ["angle_iron", "Fer angle"],
  ["cladding", "Revêtement"],
  ["opening", "Ouverture"],
  ["other", "Autre"],
];

const TYPE_LABELS = new Map(PRODUCT_TYPES);
const TYPE_ORDER = new Map(PRODUCT_TYPES.map(([value], index) => [value, index]));
const typeRank = (value) => value ? (TYPE_ORDER.get(value) ?? 999) : 1000;

export const productTypeLabel = (value) => TYPE_LABELS.get(String(value || "")) || String(value || "Non classé");

// Product-panel grouping: category order follows the picker, while the
// canonical manual order is preserved inside every category.
export function groupConditionItemsByProductType(items) {
  const groups = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const value = String(item?.c?.product_type || "");
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(item);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => typeRank(a) - typeRank(b) || productTypeLabel(a).localeCompare(productTypeLabel(b)))
    .map(([value, groupedItems]) => ({ name: productTypeLabel(value), value, items: groupedItems }));
}

// Report grouping uses the same category vocabulary/order as the Product
// panel. Unclassified rows remain visible in their own final group.
export function partitionRowsByProductType(rows, conditions) {
  const typeById = new Map((Array.isArray(conditions) ? conditions : []).map((condition) => [condition.id, String(condition.product_type || "")]));
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const value = typeById.get(row.id) || "";
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(row);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => typeRank(a) - typeRank(b) || productTypeLabel(a).localeCompare(productTypeLabel(b)))
    .map(([value, groupedRows]) => ({ value: value || null, label: productTypeLabel(value), rows: groupedRows }));
}
