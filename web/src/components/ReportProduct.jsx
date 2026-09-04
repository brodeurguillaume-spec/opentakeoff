import React from "react";
import { productReportDetails } from "../lib/reportPresentation.js";

// Shared by the main/grouped table and the per-sheet breakdown, on screen
// and in print. Plain React text preserves newlines without injecting HTML.
export default function ReportProduct({ row, product }) {
  const { description, notes } = productReportDetails(product);
  const detailStyle = { marginTop: 4, fontSize: 11.5, lineHeight: 1.45, whiteSpace: "pre-wrap", overflowWrap: "anywhere" };
  return (
    <div className="report-product" style={{ whiteSpace: "normal", overflowWrap: "anywhere", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0, background: row.color, border: "1px solid var(--ink-faint)" }} />
        <strong style={{ fontFamily: "var(--f-mono)", fontWeight: 600 }}>{row.finish_tag}</strong>
        {row.multiplier > 1 && <span style={{ color: "var(--ink-muted)", fontSize: 11, flexShrink: 0 }}>×{row.multiplier}</span>}
      </div>
      {description && <div className="report-product-description" style={detailStyle}>{description}</div>}
      {notes && <div className="report-product-notes" style={detailStyle}><strong>Notes : </strong>{notes}</div>}
    </div>
  );
}
