// Per-shape detail export — MEASURED quantities only: no condition multiplier,
// no waste (those are condition-level report adjustments; see totals.js).
// Deduct rows carry NEGATIVE area SF so a column sum reconciles with the
// condition's floor SF. The LF column on floor_area / deduct / surface_area
// rows is the traced perimeter or run — a REFERENCE figure (floor perimeters
// include door openings and shared walls), never counted in the condition's
// LF total; only linear rows sum to it.

import { csvEsc as esc } from "./csv.js";

export function shapesDetail(conditions, shapes, sheetLabel) {
  const byId = new Map(conditions.map((c) => [c.id, c]));
  return shapes.map((s) => {
    const cond = byId.get(s.condition_id);
    const cp = s.computed || {};
    const role = s.measure_role;
    let area_sf = 0, lf = 0, ea = 0;
    switch (role) {
      case "deduct": area_sf = -(cp.area_sf || 0); lf = cp.perimeter_lf || 0; break;
      case "floor_area":
      case "surface_area":
      case "linear": area_sf = cp.area_sf || 0; lf = cp.perimeter_lf || 0; break;
      case "count": ea = cp.count || 1; break;
      case "count_run": ea = cp.count || 0; break;
      default: break;
    }
    return {
      shape_id: s.id,
      sheet_id: s.sheet_id,
      sheet: sheetLabel ? sheetLabel(s.sheet_id) : s.sheet_id,
      finish: cond?.finish_tag ?? "",
      role,
      area_sf, lf, ea,
      guide_lf: role === "count_run" ? Number(cp.guide_lf) || 0 : 0,
      unit_length_in: role === "count_run" ? Number(cp.unit_length_in ?? s.count_run?.unit_length_in) || 0 : 0,
      joint_in: role === "count_run" ? Number(cp.joint_in ?? s.count_run?.joint_in) || 0 : 0,
      nominal_total_in: role === "count_run" ? Number(cp.nominal_total_in) || 0 : 0,
      installed_span_in: role === "count_run" ? Number(cp.installed_span_in) || 0 : 0,
      // recomputeShape's height semantics, mirrored: an explicit override wins
      // outright (even 0); a legacy shape without its own height reports the
      // condition height its wall SF was actually computed against.
      height_ft: s.height_override === true
        ? Number(s.height_ft) || 0
        : Number(s.height_ft) || Number(cond?.height_ft) || 0,
      height_override: s.height_override === true,
      origin: s.origin?.method || "untracked",
    };
  });
}

export function shapesToCsv(rows, projectName = "", brandName = "AnvilTrace") {
  const header = ["Shape", "Sheet", "Sheet ID", "Finish", "Role", "Area SF", "LF", "EA", "Guide LF", "Unit length in", "Joint in", "Nominal total in", "Installed span in", "Height ft", "Height override", "Origin"];
  const lines = [
    "# Per-shape measured quantities — no multiplier or waste; deducts negative; LF on floor/deduct/surface rows is trace reference only (incl. openings) — linear rows alone sum to condition LF",
    header.map(esc).join(","),
  ];
  for (const r of rows) {
    lines.push([
      r.shape_id, r.sheet, r.sheet_id, r.finish, r.role,
      r.area_sf, r.lf, r.ea, r.guide_lf, r.unit_length_in, r.joint_in, r.nominal_total_in, r.installed_span_in, r.height_ft,
      r.height_override ? "yes" : "",
      r.origin,
    ].map(esc).join(","));
  }
  const title = projectName ? `# ${projectName} — ${brandName} shapes\n` : "";
  return title + lines.join("\n") + "\n";
}

export function shapesToJson(rows, projectName) {
  return {
    schema: "opentakeoff.shapes.v1",
    project_name: projectName || null,
    generated_with: "AnvilTrace",
    shapes: rows,
  };
}
