import React, { useEffect, useMemo, useState } from "react";
import { Z } from "../lib/ui.js";

const STATUS = {
  proposed: { label: "Proposed", color: "var(--cobalt)" },
  needs_review: { label: "Needs review", color: "var(--c-warning)" },
  confirmed: { label: "Confirmed", color: "var(--c-positive)" },
  rejected: { label: "Rejected", color: "var(--c-danger)" },
};

const button = (color = "var(--ink-faint)", fill = "transparent") => ({
  padding: "6px 9px", border: `1px solid ${color}`, background: fill,
  color: fill === "transparent" ? color : "white", cursor: "pointer",
  fontSize: 11.5, fontWeight: 700,
});
const label = { display: "block", marginTop: 9, fontSize: 10.5, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: 0.4 };
const input = { width: "100%", boxSizing: "border-box", marginTop: 4, padding: "7px 8px", border: "1px solid var(--ink-faint)", background: "var(--paper-bright)", color: "var(--ink)", fontSize: 12 };

function percent(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : "—";
}

function ListValues({ title, values }) {
  if (!Array.isArray(values) || !values.length) return null;
  return <div style={{ marginTop: 5, fontSize: 10.5, color: "var(--ink-secondary)" }}><b>{title}:</b> {values.join(", ")}</div>;
}

function RegionEditor({ editor, scales, detectedScales, standardScales, sheetLabel, onChange, onSave, onRedraw, onDelete, onCancel }) {
  const grumpNames = Boolean(editor.grump_names_zone);
  const valid = (grumpNames || String(editor.name || "").trim()) && (!editor.scale_enabled || Number(editor.scale_upp) > 0);
  return <>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <b style={{ fontSize: 13 }}>{editor.existing ? "Edit map zone" : "Name new map zone"}</b>
      <span style={{ marginLeft: "auto", fontFamily: "var(--f-mono)", fontSize: 9.5, color: "var(--ink-muted)" }}>{sheetLabel(editor.sheet_id)}</span>
    </div>
    <label style={label}>Name</label>
    <input data-testid="map-region-name" autoFocus={!grumpNames} disabled={grumpNames} value={editor.name} placeholder={grumpNames ? "GRUMP la nommera après l'analyse" : "Example: Section A, Patient Room 161"} onChange={(event) => onChange({ ...editor, name: event.target.value })} style={{ ...input, opacity: grumpNames ? 0.55 : 1 }} />
    <label style={label}>Type</label>
    <select data-testid="map-region-kind" value={editor.kind} onChange={(event) => onChange({ ...editor, kind: event.target.value })} style={input}>
      <option value="area">Area</option><option value="plan">Plan</option><option value="room">Room</option>
      <option value="section">Section</option><option value="elevation">Elevation</option><option value="detail">Detail</option>
    </select>
    {editor.existing && <div style={{ marginTop: 8, padding: 8, border: "1px solid var(--ink-faint)", color: "var(--ink-secondary)", fontSize: 10.5 }}>Contour: drag a round point on the plan to move it; drag a diamond on an edge to add a point; click a round point, then Delete, to remove it. Every completed change confirms a new audited revision.</div>}
    <label style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 11, fontSize: 11.5, color: "var(--ink)" }}>
      <input data-testid="map-region-scale-enabled" type="checkbox" checked={Boolean(editor.scale_enabled)} onChange={(event) => {
        const enabled = event.target.checked;
        const detected = detectedScales[editor.sheet_id];
        const fallbackUpp = scales[editor.sheet_id] || detected?.upp || "";
        const fallbackLabel = standardScales.find((item) => Math.abs(item.upp - fallbackUpp) < 1e-9)?.label || detected?.label || "";
        onChange({ ...editor, scale_enabled: enabled, ...(enabled && !editor.scale_upp ? { scale_upp: fallbackUpp, scale_label: fallbackLabel } : {}) });
      }} />
      Use a different scale inside this zone
    </label>
    {editor.scale_enabled && <>
      <label style={label}>Zone scale</label>
      <select data-testid="map-region-scale" value={standardScales.some((item) => Math.abs(item.upp - Number(editor.scale_upp)) < 1e-9) ? String(editor.scale_upp) : (editor.scale_upp ? "__custom" : "")} onChange={(event) => {
        const picked = standardScales.find((item) => String(item.upp) === event.target.value);
        if (picked) onChange({ ...editor, scale_upp: picked.upp, scale_label: picked.label });
      }} style={input}>
        <option value="" disabled>Choose a scale</option>
        {editor.scale_upp && !standardScales.some((item) => Math.abs(item.upp - Number(editor.scale_upp)) < 1e-9) && <option value="__custom">{editor.scale_label || "Custom calibrated scale"}</option>}
        {standardScales.map((item) => <option key={item.label} value={String(item.upp)}>{item.label}</option>)}
      </select>
      <div style={{ marginTop: 5, fontSize: 10.5, color: "var(--ink-muted)" }}>Human-confirmed when saved. Measurements crossing its outline will be refused.</div>
    </>}
    {!editor.existing && <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 13, paddingTop: 10, borderTop: "1px solid var(--ink-faint)", fontSize: 11.5, lineHeight: 1.35, color: "var(--ink)" }}>
      <input data-testid="map-region-grump-name" type="checkbox" checked={grumpNames} onChange={(event) => onChange({ ...editor, grump_names_zone: event.target.checked })} />
      <span>Laisser GRUMP déterminer le nom de la zone.<small style={{ display: "block", marginTop: 3, color: "var(--ink-muted)" }}>La géométrie sera sauvegardée immédiatement et le nom restera clairement en attente jusqu’à l’analyse de GRUMP.</small></span>
    </label>}
    <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
      <button data-testid="map-region-save" type="button" disabled={!valid} onClick={onSave} style={{ ...button("var(--cobalt)", "var(--cobalt)"), cursor: valid ? "pointer" : "not-allowed", opacity: valid ? 1 : 0.45 }}>Enregistrer la zone</button>
      {editor.existing && <button data-testid="map-region-redraw" type="button" onClick={() => onRedraw(editor.id)} style={button("var(--ink-secondary)")}>Manual redraw</button>}
      {editor.existing && <button data-testid="map-region-delete" type="button" onClick={() => onDelete(editor.id)} style={button("var(--c-danger)")}>Delete</button>}
      <button type="button" onClick={onCancel} style={{ ...button("var(--ink-muted)"), border: "none" }}>Cancel</button>
    </div>
    <div style={{ marginTop: 8, fontSize: 10.5, color: "var(--ink-muted)" }}>Saved as human-confirmed project structure · Ctrl+Z restores edits and deletions.</div>
  </>;
}

export default function ProjectMapPanel({
  regions, visibleSheetIds, selectedRegionId, editor, redrawId, scales, detectedScales,
  standardScales, sheetLabel, onClose, onSelect, onStartNew, onEditorChange, onSave,
  onEdit, onRedraw, onDelete, onCancelEdit, onCancelRedraw, onReview,
}) {
  const [scope, setScope] = useState("visible");
  const [collapsed, setCollapsed] = useState(false);
  const selected = regions.find((region) => region.id === selectedRegionId) || null;
  const [note, setNote] = useState("");
  useEffect(() => setNote(selected?.review?.note || ""), [selected?.id, selected?.review?.note]);
  const shown = useMemo(() => {
    const visible = new Set(visibleSheetIds);
    return regions.filter((region) => scope === "all" || visible.has(region.sheet_id)).sort((a, b) =>
      a.sheet_id.localeCompare(b.sheet_id) || a.name.localeCompare(b.name));
  }, [regions, scope, visibleSheetIds]);
  const pending = regions.filter((region) => ["proposed", "needs_review"].includes(region.review?.status)).length;

  if (collapsed) {
    const tabTitle = selected ? `Rouvrir Project Map — ${selected.name}` : "Rouvrir Project Map";
    return <button
      type="button"
      data-testid="project-map-expand-tab"
      title={tabTitle}
      aria-label={tabTitle}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => setCollapsed(false)}
      style={{
        // The canvas deliberately leaves a black utility corridor beside the
        // tool rail. Use it like a physical recall tab: about 5 cm tall at the
        // standard Windows CSS density, aligned with Area/Rectangle rather
        // than hiding as a tiny control in the top corner.
        position: "absolute", left: 8, top: 72, width: 48, height: 190,
        padding: "12px 8px", border: "1px solid var(--c-positive)",
        background: "var(--paper-bright)", color: "var(--c-positive)", boxShadow: "var(--shadow-pop)",
        zIndex: Z.canvasUi + 2, cursor: "pointer", writingMode: "vertical-rl",
        transform: "rotate(180deg)", fontSize: 10.5, fontWeight: 800,
        letterSpacing: 0.7, textTransform: "uppercase", overflow: "hidden",
        textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
      Project Map · {regions.length}
    </button>;
  }

  return <aside data-testid="project-map-panel" onPointerDown={(event) => event.stopPropagation()} style={{ position: "absolute", left: 14, top: 14, width: 374, maxWidth: "calc(100% - 28px)", maxHeight: "calc(100% - 28px)", overflowY: "auto", boxSizing: "border-box", padding: 14, background: "var(--paper-bright)", border: "1px solid var(--c-positive)", boxShadow: "var(--shadow-pop)", zIndex: Z.canvasUi + 2, color: "var(--ink)" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div><b style={{ fontSize: 13.5 }}>Project Map</b><div style={{ fontSize: 10, color: "var(--ink-muted)", marginTop: 2 }}>{regions.length} zones · {pending} awaiting review</div></div>
      <button type="button" data-testid="project-map-collapse" title="Réduire Project Map sur le côté" aria-label="Réduire Project Map sur le côté" onClick={() => setCollapsed(true)} style={{ marginLeft: "auto", ...button("var(--c-positive)"), padding: "3px 7px" }}>‹</button>
      <button type="button" title="Close Project Map" onClick={onClose} style={{ ...button("var(--ink-muted)"), padding: "3px 7px" }}>×</button>
    </div>

    {redrawId && !editor ? <div data-testid="map-region-editor">
      <div style={{ marginTop: 12, fontWeight: 700, fontSize: 13 }}>Manually redrawing map zone</div>
      <div style={{ marginTop: 6, color: "var(--ink-muted)", fontSize: 11.5 }}>This is a human Project Map trace, not a GRUMP retry. Trace at least three points, then Finish. The saved contour stays intact until you confirm the replacement.</div>
      <button type="button" onClick={onCancelRedraw} style={{ marginTop: 10, ...button("var(--ink-secondary)") }}>Cancel redraw</button>
    </div> : editor ? <div data-testid="map-region-editor" style={{ marginTop: 12 }}><RegionEditor editor={editor} scales={scales} detectedScales={detectedScales} standardScales={standardScales} sheetLabel={sheetLabel} onChange={onEditorChange} onSave={onSave} onRedraw={onRedraw} onDelete={onDelete} onCancel={onCancelEdit} /></div> : <>
      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        <button type="button" onClick={() => setScope("visible")} style={button(scope === "visible" ? "var(--c-positive)" : "var(--ink-faint)", scope === "visible" ? "var(--c-positive)" : "transparent")}>Visible sheets</button>
        <button type="button" onClick={() => setScope("all")} style={button(scope === "all" ? "var(--c-positive)" : "var(--ink-faint)", scope === "all" ? "var(--c-positive)" : "transparent")}>Whole project</button>
      </div>
      <div data-testid="project-map-list" style={{ marginTop: 10, display: "grid", gap: 5, maxHeight: selected ? 156 : 310, overflowY: "auto" }}>
        {!shown.length && <div style={{ padding: 12, border: "1px dashed var(--ink-faint)", color: "var(--ink-muted)", fontSize: 11.5 }}>No mapped zone in this scope. Click + Zone, then trace on the plan.</div>}
        {shown.map((region) => {
          const status = STATUS[region.review?.status] || STATUS.needs_review;
          const active = region.id === selectedRegionId;
          return <button key={region.id} type="button" data-region-id={region.id} onClick={() => onSelect(region)} style={{ textAlign: "left", padding: "7px 9px", border: `1px solid ${active ? "var(--c-positive)" : "var(--ink-faint)"}`, borderLeft: `4px solid ${status.color}`, background: active ? "var(--surface-pop)" : "transparent", color: "var(--ink)", cursor: "pointer" }}>
            <div style={{ display: "flex", gap: 7, alignItems: "baseline" }}><b style={{ fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{region.name}</b><span style={{ marginLeft: "auto", fontSize: 9.5, color: status.color }}>{status.label}</span></div>
            <div style={{ marginTop: 2, fontFamily: "var(--f-mono)", fontSize: 9.5, color: "var(--ink-muted)" }}>{sheetLabel(region.sheet_id)} · {region.kind} · r{region.revision}</div>
          </button>;
        })}
      </div>

      {selected && <section data-testid="project-map-card" style={{ borderTop: "1px solid var(--ink-faint)", marginTop: 11, paddingTop: 11 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}><b style={{ fontSize: 13.5 }}>{selected.name}</b><span style={{ marginLeft: "auto", color: (STATUS[selected.review?.status] || STATUS.needs_review).color, fontSize: 10.5, fontWeight: 700 }}>{(STATUS[selected.review?.status] || STATUS.needs_review).label}</span></div>
        <div style={{ marginTop: 3, fontFamily: "var(--f-mono)", fontSize: 9.5, color: "var(--ink-muted)" }}>{selected.id}<br />{selected.sheet_id} · {selected.kind} · revision {selected.revision}</div>
        <div style={{ marginTop: 8, display: "flex", gap: 5, flexWrap: "wrap" }}>{selected.purposes.map((purpose) => <span key={purpose} style={{ padding: "2px 5px", border: "1px solid var(--ink-faint)", fontSize: 9.5, textTransform: "uppercase" }}>{purpose}</span>)}</div>
        {Object.entries(selected.review?.fields || {}).length > 0 && <details style={{ marginTop: 8 }}><summary style={{ fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}>Field review ({Object.keys(selected.review.fields).length})</summary>{Object.entries(selected.review.fields).map(([key, status]) => <div key={key} style={{ display: "flex", marginTop: 3, fontSize: 10.5 }}><span>{key}</span><span style={{ marginLeft: "auto", color: (STATUS[status] || STATUS.needs_review).color }}>{(STATUS[status] || STATUS.needs_review).label}</span></div>)}</details>}

        {selected.scale_profile && <div style={{ marginTop: 9, padding: 8, border: "1px solid var(--ink-faint)", fontSize: 10.5 }}><b>Scale profile</b><div style={{ marginTop: 3 }}>{selected.scale_profile.label || `${selected.scale_profile.units_per_px} units/px`} · {selected.scale_profile.confirmed ? "human-confirmed" : "unconfirmed"}</div><div style={{ color: "var(--ink-muted)" }}>Source {selected.scale_profile.source || "unknown"} · confidence {percent(selected.scale_profile.confidence)}</div></div>}
        {selected.analysis_profile && <div style={{ marginTop: 8, padding: 8, border: "1px solid var(--ink-faint)" }}><b style={{ fontSize: 10.5 }}>Analysis profile</b><ListValues title="Include layers" values={selected.analysis_profile.include_layers} /><ListValues title="Exclude layers" values={selected.analysis_profile.exclude_layers} /><ListValues title="Include hatches" values={selected.analysis_profile.include_hatches} /><ListValues title="Exclude hatches" values={selected.analysis_profile.exclude_hatches} /></div>}

        {Object.entries(selected.assessments || {}).length > 0 && <div style={{ marginTop: 9 }}><b style={{ fontSize: 10.5 }}>Confidence</b>{Object.entries(selected.assessments).map(([key, assessment]) => <div key={key} style={{ display: "flex", marginTop: 3, fontSize: 10.5 }}><span>{key}</span><span style={{ marginLeft: "auto", fontFamily: "var(--f-mono)" }}>{percent(assessment.confidence)} · {assessment.status || "unreviewed"}</span></div>)}</div>}
        {selected.evidence?.length > 0 && <details style={{ marginTop: 9 }}><summary style={{ fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}>Evidence ({selected.evidence.length})</summary>{selected.evidence.map((item) => <div key={item.id} style={{ marginTop: 5, paddingLeft: 7, borderLeft: "2px solid var(--ink-faint)", fontSize: 10.5 }}><b>{item.kind}</b>{item.text ? ` · ${item.text}` : ""}<div style={{ color: "var(--ink-muted)" }}>{item.source || item.sheet_id || item.id} · {percent(item.confidence)}</div></div>)}</details>}
        {selected.links?.length > 0 && <details style={{ marginTop: 8 }}><summary style={{ fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}>Links ({selected.links.length})</summary>{selected.links.map((item) => <div key={item.id} style={{ marginTop: 4, fontSize: 10.5 }}>{item.type} → {item.tag || item.target_region_id || item.target_sheet_id || item.target_document_id}<span style={{ color: "var(--ink-muted)" }}> · {item.status || "unreviewed"} · {percent(item.confidence)}</span></div>)}</details>}
        {selected.parent_id && <div style={{ marginTop: 7, fontSize: 10.5 }}><b>Parent:</b> {regions.find((region) => region.id === selected.parent_id)?.name || selected.parent_id}</div>}

        <label style={label}>Human explanation / correction context</label>
        <textarea data-testid="project-map-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Example: ignore the VCT hatch and follow the wall centerline." rows={3} style={{ ...input, resize: "vertical" }} />
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
          <button type="button" data-testid="project-map-accept" onClick={() => onReview(selected.id, "confirmed", note, "human_accept")} style={button("var(--c-positive)")}>Accept</button>
          <button type="button" data-testid="project-map-needs-review" onClick={() => onReview(selected.id, "needs_review", note, "human_needs_review")} style={button("var(--c-warning)")}>Needs review</button>
          <button type="button" data-testid="project-map-reject" onClick={() => onReview(selected.id, "rejected", note, "human_reject")} style={button("var(--c-danger)")}>Reject</button>
          <button type="button" disabled={!note.trim() || note.trim() === (selected.review?.note || "")} onClick={() => onReview(selected.id, selected.review?.status || "needs_review", note, "human_explanation")} style={{ ...button("var(--cobalt)"), opacity: !note.trim() || note.trim() === (selected.review?.note || "") ? 0.45 : 1 }}>Save explanation</button>
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 7 }}><button type="button" onClick={() => { onEdit(selected); setCollapsed(true); }} style={button("var(--ink-secondary)")}>Edit details & points</button><button type="button" onClick={() => onRedraw(selected.id)} style={button("var(--ink-secondary)")}>Manual redraw</button><button type="button" onClick={() => onDelete(selected.id)} style={button("var(--c-danger)")}>Delete</button></div>
        {selected.review?.reviewed_at && <div style={{ marginTop: 7, fontSize: 9.5, color: "var(--ink-muted)" }}>Last verdict by {selected.review.reviewed_by || "human"} · {selected.review.reviewed_at}{selected.review.reason_code ? ` · ${selected.review.reason_code}` : ""}</div>}
      </section>}
      <button data-testid="project-map-new-zone" type="button" onClick={onStartNew} style={{ width: "100%", justifyContent: "center", marginTop: 13, ...button("var(--cobalt)", "var(--cobalt)") }}>+ Zone</button>
    </>}
  </aside>;
}
