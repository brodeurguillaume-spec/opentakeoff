// Presentation-only product prose. Keep it out of conditionTotals: those rows
// are also used in the opt-in external contribution payload.
export function productReportDetails(product) {
  const text = (value) => typeof value === "string" ? value.trim() : "";
  return { description: text(product?.description), notes: text(product?.report_notes) };
}

const tags = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });
export function sortReportRows(rows, order = "manual") {
  return order === "tag" ? [...rows].sort((a, b) => tags.compare(a.finish_tag || "", b.finish_tag || "")) : rows;
}

const SORT_KEY = "anviltrace_report_sort";
export function loadReportSort() {
  try { return localStorage.getItem(SORT_KEY) === "tag" ? "tag" : "manual"; }
  catch { return "manual"; }
}
export function saveReportSort(order) {
  try { localStorage.setItem(SORT_KEY, order === "tag" ? "tag" : "manual"); }
  catch { /* The report remains usable without browser preferences. */ }
}
