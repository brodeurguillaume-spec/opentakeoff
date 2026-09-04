import { useEffect, useState } from "react";
import { guideLabel, guidePointCount, guideError } from "../lib/zoneGuides.js";

export default function useZoneGuides({ regions, write, navigate }) {
  const [ownerId, setOwner] = useState(null), [tool, setTool] = useState("select");
  const [collapsed, setCollapsed] = useState(true), [text, setText] = useState("");
  const [serial, setSerial] = useState(1), [pending, setPending] = useState(null), [selected, setSelected] = useState(null);
  const [exception, setException] = useState(false), [message, setMessage] = useState("");
  const [poiTarget, setPoiTarget] = useState(null);
  const owner = regions.find(r => r.id === ownerId);
  const guides = owner?.guides || [];
  const choose = kind => { setTool(kind); setPending(null); setSelected(null); setPoiTarget(null); setText(""); setSerial(guides.filter(g => g.kind === kind).length + 1); setMessage(""); };
  const beginPoi = (source, target, note = "") => {
    setOwner(source.id); setTool("poi"); setPending(null); setSelected(null);
    setPoiTarget({ region_id: target.id, sheet_id: target.sheet_id });
    setText(note.trim() || `POI — ${target.name}`); setSerial((source.guides || []).filter(g => g.kind === "poi").length + 1);
    setCollapsed(false); setMessage(`Encadrez le secteur pertinent dans ${target.name} avec deux coins.`); navigate(target.sheet_id);
  };
  useEffect(() => { if (ownerId && !owner) setOwner(null); }, [ownerId, owner]);
  const commit = next => {
    const error = guideError(next);
    if (error) { setMessage(error); return false; }
    const result = write(ownerId, next);
    if (result?.error) { setMessage(result.error); return false; }
    return true;
  };
  const remove = () => { if (selected && commit(guides.filter(g => g.id !== selected))) { setSelected(null); setPending(null); } };
  useEffect(() => {
    if (!ownerId) return;
    const key = e => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName) || e.target?.isContentEditable) return;
      // Undo/redo remains the Canvas region-command history. Everything else
      // must not arm a quantity or ordinary markup while preparing a zone.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { setPending(null); return; }
      if (["Shift", "Control", "Alt", "Meta", " ", "F5"].includes(e.key) || e.key.toLowerCase() === "g") return;
      e.stopImmediatePropagation();
      if (["Escape", "Delete", "Backspace", "k", "K", "v", "V"].includes(e.key)) e.preventDefault();
      if (e.key.toLowerCase() === "k") choose("measure");
      else if (e.key.toLowerCase() === "v" || e.key === "Escape") choose("select");
      else if (e.key === "Delete" || e.key === "Backspace") remove();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });
  const add = (sheetId, at, ctrl) => {
    if (!owner || tool === "select") { setSelected(null); return; }
    const current = guides.find(g => g.id === pending && g.kind === tool);
    const g = current || { id: `guide:${crypto.randomUUID()}`, kind: tool, label: guideLabel(tool, serial, text), points: [], ...(tool === "poi" ? { linked_region_id: poiTarget?.region_id } : {}), target_role: exception ? "other_level" : "ground_floor", reference_type: "view", actor: "human" };
    const allowedStart = tool === "poi" ? poiTarget?.sheet_id : owner.sheet_id;
    if (!current && sheetId !== allowedStart) { setMessage(tool === "poi" ? "Ouvrez la feuille de la zone liée indiquée." : "Commencez le repère sur la feuille de la zone source."); return; }
    const next = { ...g, points: [...g.points, { sheet_id: sheetId, at }] };
    if (!commit(current ? guides.map(x => x.id === g.id ? next : x) : [...guides, next])) return;
    setSelected(g.id);
    const complete = next.points.length === guidePointCount(tool);
    setPending(complete ? null : g.id);
    setMessage(complete ? "Repère enregistré dans la zone uniquement." : `${next.points.length}/${guidePointCount(tool)} points — complétez le repère, au besoin sur une autre feuille.`);
    if (complete) {
      setSerial(n => n + 1);
      if (["measure", "arrow", "poi"].includes(tool) || ctrl) { setTool("select"); setPoiTarget(null); }
    }
  };
  return { owner, ownerId, tool, collapsed, setCollapsed, text, setText, serial, setSerial, exception, setException, selected, setSelected, message, guides, choose, beginPoi, add, remove,
    enter: id => { setOwner(id); choose("select"); setCollapsed(true); },
    exit: () => { setOwner(null); setPending(null); setSelected(null); },
    update: (id, patch) => commit(guides.map(g => g.id === id ? { ...g, ...patch } : g)),
    resume: g => { setTool(g.kind); setPending(g.id); setSelected(g.id); setMessage("Complétez les points manquants."); },
    navigate, regions,
  };
}
