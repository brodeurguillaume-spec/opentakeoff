import React, { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { fmtCheckLen } from "../lib/units";
import { parseSheetKey, RENDER_SCALE } from "../lib/sheets";

const BASE_RENDER_SCALE = 1.35;

function ObservationPage({ sheetKey, label, rotation, unitsPerPx, units, zoom, armed, draft, measurements, onPoint, loadPdfData }) {
  const canvasRef = useRef(null);
  const [pageInfo, setPageInfo] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let renderTask = null;
    let documentTask = null;
    let document = null;
    (async () => {
      try {
        const { file, page } = parseSheetKey(sheetKey);
        const bytes = await loadPdfData(file);
        documentTask = pdfjsLib.getDocument({ data: bytes });
        document = await documentTask.promise;
        const pdfPage = await document.getPage(page);
        const viewport = pdfPage.getViewport({ scale: BASE_RENDER_SCALE, rotation: rotation || 0 });
        const logical = pdfPage.getViewport({ scale: RENDER_SCALE, rotation: rotation || 0 });
        if (cancelled) return;
        const canvas = canvasRef.current;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.ceil(viewport.width * ratio);
        canvas.height = Math.ceil(viewport.height * ratio);
        canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
        setPageInfo({ width: viewport.width, height: viewport.height, logicalWidth: logical.width, logicalHeight: logical.height });
        renderTask = pdfPage.render({ canvasContext: canvas.getContext("2d"), viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] });
        await renderTask.promise;
      } catch (reason) {
        if (!cancelled && reason?.name !== "RenderingCancelledException") setError(reason?.message || String(reason));
      }
    })();
    return () => {
      cancelled = true;
      try { renderTask?.cancel(); } catch { /* already complete */ }
      try { documentTask?.destroy(); } catch { /* loading task already gone */ }
      try { document?.destroy(); } catch { /* document already gone */ }
    };
  }, [sheetKey, rotation, loadPdfData]);

  const display = points => {
    if (!pageInfo || !(unitsPerPx > 0) || points.length < 2) return "Échelle non définie";
    const total = points.slice(1).reduce((sum, point, index) => {
      const previous = points[index];
      return sum + Math.hypot((point[0] - previous[0]) * pageInfo.logicalWidth, (point[1] - previous[1]) * pageInfo.logicalHeight) * unitsPerPx;
    }, 0);
    return fmtCheckLen(total, units, 8);
  };
  const localDraft = draft?.sheetKey === sheetKey ? draft.points : [];
  const lines = [...measurements.filter(item => item.sheetKey === sheetKey), ...(localDraft.length ? [{ id: "draft", points: localDraft }] : [])];

  return <section data-observation-sheet={sheetKey} style={{ width: `${zoom * 100}%`, minWidth: "100%", margin: "0 auto 12px", background: "white", border: "1px solid #5f8dff", boxSizing: "border-box" }}>
    <div style={{ position: "sticky", left: 0, zIndex: 2, width: "fit-content", maxWidth: "100%", padding: "4px 8px", background: "#17305a", color: "white", font: "700 10px/1.2 var(--f-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
    <div style={{ position: "relative", lineHeight: 0 }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "auto", background: "white" }} />
      {pageInfo && <svg viewBox={`0 0 ${pageInfo.width} ${pageInfo.height}`} preserveAspectRatio="none" onPointerDown={event => {
        if (!armed || event.button !== 0) return;
        event.preventDefault(); event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        onPoint(sheetKey, [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height], event.ctrlKey || event.metaKey);
      }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", cursor: armed ? "crosshair" : "default", pointerEvents: armed ? "all" : "none" }}>
        {lines.map(item => {
          const pts = item.points.map(point => `${point[0] * pageInfo.width},${point[1] * pageInfo.height}`).join(" ");
          const last = item.points[item.points.length - 1];
          return <g key={item.id}>
            {item.points.length > 1 && <polyline points={pts} fill="none" stroke="#2453cb" strokeWidth={2.2 / zoom} vectorEffect="non-scaling-stroke" />}
            {item.points.map((point, index) => <circle key={index} cx={point[0] * pageInfo.width} cy={point[1] * pageInfo.height} r={4.5 / zoom} fill="#fff" stroke="#2453cb" strokeWidth={2 / zoom} vectorEffect="non-scaling-stroke" />)}
            {item.points.length > 1 && <text x={last[0] * pageInfo.width + 10 / zoom} y={last[1] * pageInfo.height - 10 / zoom} fill="#17305a" stroke="white" strokeWidth={4 / zoom} paintOrder="stroke" fontSize={16 / zoom} fontWeight="800">{display(item.points)}</text>}
          </g>;
        })}
      </svg>}
      {error && <div role="alert" style={{ padding: 12, color: "#b42318", lineHeight: 1.3 }}>Impossible d’afficher cette feuille : {error}</div>}
    </div>
  </section>;
}

export default function ObservationStack({ stack, labels, rotations, scales, units, loadPdfData, onClose }) {
  const rootRef = useRef(null);
  const panRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [armed, setArmed] = useState(false);
  const [draft, setDraft] = useState(null);
  const [measurements, setMeasurements] = useState([]);

  const cancelMeasure = () => { setDraft(null); setArmed(false); };
  const addPoint = (sheetKey, point, keepGoing) => {
    if (!draft || draft.sheetKey !== sheetKey) { setDraft({ sheetKey, points: [point] }); return; }
    const points = [...draft.points, point];
    if (keepGoing) setDraft({ sheetKey, points });
    else {
      setMeasurements(items => [...items, { id: `observation-measure:${crypto.randomUUID()}`, sheetKey, points }]);
      setDraft(null); setArmed(false);
    }
  };

  return <aside ref={rootRef} tabIndex={0} data-testid="observation-stack" aria-label="Stack d’observation" onPointerDown={event => {
    rootRef.current?.focus({ preventScroll: true });
    if (event.button !== 1 && event.button !== 2) return;
    event.preventDefault();
    panRef.current = { x: event.clientX, y: event.clientY, left: rootRef.current.scrollLeft, top: rootRef.current.scrollTop };
    event.currentTarget.setPointerCapture(event.pointerId);
  }} onPointerMove={event => {
    const pan = panRef.current;
    if (!pan) return;
    rootRef.current.scrollLeft = pan.left - (event.clientX - pan.x);
    rootRef.current.scrollTop = pan.top - (event.clientY - pan.y);
  }} onPointerUp={event => { if (panRef.current) { panRef.current = null; try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* lost capture */ } } }} onContextMenu={event => event.preventDefault()} onWheel={event => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    setZoom(value => Math.max(.4, Math.min(3, +(value + (event.deltaY < 0 ? .1 : -.1)).toFixed(2))));
  }} onKeyDown={event => {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName)) return;
    if (event.key.toLowerCase() === "k") { event.preventDefault(); setArmed(true); setDraft(null); }
    else if (event.key.toLowerCase() === "v" || event.key === "Escape") { event.preventDefault(); cancelMeasure(); }
  }} style={{ position: "absolute", inset: 0, overflow: "auto", overscrollBehavior: "contain", outline: "none", background: "#09111f", border: "2px solid #5f8dff", boxSizing: "border-box", touchAction: "none" }}>
    <header style={{ position: "sticky", top: 0, zIndex: 5, display: "flex", alignItems: "center", gap: 7, padding: "7px 9px", background: "#17305a", color: "white", borderBottom: "1px solid #5f8dff", fontSize: 11 }}>
      <b style={{ fontFamily: "var(--f-mono)", letterSpacing: ".08em" }}>OBSERVATION · {stack.members.length} FEUILLES</b>
      <span style={{ opacity: .75 }}>roulette : défiler · Ctrl+roulette : zoom · K : mesurer</span>
      <button type="button" onClick={() => { setArmed(true); setDraft(null); rootRef.current?.focus(); }} style={{ marginLeft: "auto", border: `1px solid ${armed ? "white" : "#5f8dff"}`, background: armed ? "#2453cb" : "transparent", color: "white", cursor: "pointer" }}>K</button>
      <button type="button" onClick={() => setZoom(value => Math.max(.4, +(value - .1).toFixed(2)))} aria-label="Réduire le zoom">−</button>
      <span style={{ minWidth: 38, textAlign: "center", fontFamily: "var(--f-mono)" }}>{Math.round(zoom * 100)}%</span>
      <button type="button" onClick={() => setZoom(value => Math.min(3, +(value + .1).toFixed(2)))} aria-label="Augmenter le zoom">+</button>
      <button type="button" onClick={onClose} aria-label="Fermer le Stack d’observation">×</button>
    </header>
    <div style={{ padding: 10, minWidth: 0 }}>
      {stack.members.map(sheetKey => <ObservationPage key={sheetKey} sheetKey={sheetKey} label={labels[sheetKey] || sheetKey} rotation={rotations[sheetKey] || 0} unitsPerPx={scales[sheetKey]} units={units} zoom={zoom} armed={armed} draft={draft} measurements={measurements} onPoint={addPoint} loadPdfData={loadPdfData} />)}
    </div>
  </aside>;
}
