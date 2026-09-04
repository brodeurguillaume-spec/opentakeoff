import React, { useRef } from "react";
import { GUIDE_TOOLS, guidePointCount, shiftPoints } from "../lib/zoneGuides.js";
import { Z } from "../lib/ui.js";
const button = { background: "var(--paper-bright)", color: "var(--ink)", border: "1px solid var(--ink-faint)", padding: "6px 8px", cursor: "pointer" };
export function ZoneGuideToolbar({ controller: c }) {
  if (!c.owner) return null;
  const selected = c.guides.find(g => g.id === c.selected);
  return <div data-testid="zone-guides-toolbar" onPointerDown={e => e.stopPropagation()} style={{ position: "absolute", left: 14, top: 14, zIndex: Z.canvasUi + 4, width: 400, boxSizing: "border-box", overflowWrap: "anywhere", maxWidth: "calc(100% - 28px)", maxHeight: "calc(100% - 28px)", overflow: "auto", background: "var(--paper-bright)", border: "1px solid var(--c-positive)", padding: 10, color: "var(--ink)", fontSize: 12 }}>
    <b>REPÈRES GRUMP — {c.owner.name}</b>
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
      <select aria-label="Outil de préparation" style={button} value={c.tool === "poi" ? "select" : c.tool} onChange={e => c.choose(e.target.value)}>{Object.entries(GUIDE_TOOLS).filter(([kind]) => kind !== "poi").map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select>
      <button style={button} onClick={() => c.setCollapsed(!c.collapsed)}>{c.collapsed ? "Ouvrir le panneau" : "Réduire"}</button>
    </div>
    <small>Hors take-off · K : mesurer · V : déplacer · clic droit/roulette maintenu : pan</small>
    {c.message && <p role="status">{c.message}</p>}
    {!c.collapsed && <div style={{ display: "grid", gap: 8, marginTop: 8, width: "min(380px, 100%)" }}>
      <label>Texte du prochain repère<input aria-label="Texte du repère" style={{ ...button, width: "100%", boxSizing: "border-box" }} value={c.text} onChange={e => c.setText(e.target.value)} /></label>
      <label>Numéro de départ <input aria-label="Numéro de départ" type="number" min={1} max={9999} value={c.serial} onChange={e => c.setSerial(Math.min(9999, Math.max(1, Number(e.target.value) || 1)))} style={button} /></label>
      <label><input type="checkbox" checked={c.exception} onChange={e => c.setException(e.target.checked)} /> Jumeau : autre niveau que le RDC</label>
      <label>Aller à une zone (sans changer la zone propriétaire)<select aria-label="Naviguer vers une zone" value="" style={{ ...button, width: "100%" }} onChange={e => { const r=c.regions.find(r=>r.id===e.target.value); if(r)c.navigate(r.sheet_id); }}><option value="">Choisir…</option>{c.regions.map(r=><option key={r.id} value={r.id}>{r.name} · {r.sheet_id}</option>)}</select></label>
      <small>Paire : source puis jumeau. Secteur : deux bornes source, puis deux bornes sur le plan. Ctrl+clic place le dernier repère d’une série. RDC 100 est un code, pas une altitude.</small>
      <div style={{ maxHeight: 150, overflowY: "auto" }}>{c.guides.map(g => <button key={g.id} style={{ ...button, display: "block", width: "100%", textAlign: "left" }} onClick={() => {c.setSelected(g.id);c.choose("select");c.setSelected(g.id);c.navigate(g.points[0].sheet_id);}}>{g.label} · {g.points.length}/{guidePointCount(g.kind)}{g.points.length < guidePointCount(g.kind) ? " — incomplet" : ""}</button>)}</div>
      {selected && <fieldset><legend>Repère sélectionné</legend>
        <input aria-label="Modifier le libellé" defaultValue={selected.label} key={selected.id+selected.label} style={button} onBlur={e => {if(e.target.value.trim()&&e.target.value!==selected.label)c.update(selected.id,{label:e.target.value.trim()});}} />
        {["pair","sector"].includes(selected.kind) && <select aria-label="Correspondance" value={selected.reference_type || "view"} onChange={e=>c.update(selected.id,{reference_type:e.target.value})} style={button}><option value="view">Correspondance de vues</option><option value="element">Correspondance d’éléments</option></select>}
        {["pair","sector"].includes(selected.kind) && <label><input type="checkbox" checked={selected.target_role === "other_level"} onChange={e=>c.update(selected.id,{target_role:e.target.checked ? "other_level" : "ground_floor"})}/> Jumeau sur un autre niveau que le RDC</label>}
        {selected.points.map((p,i)=><button key={i} style={button} onClick={()=>c.navigate(p.sheet_id)}>Voir {i+1} · {p.sheet_id}</button>)}
        {selected.points.length<guidePointCount(selected.kind)&&<button style={button} onClick={()=>c.resume(selected)}>Compléter le repère</button>}
        <button style={button} onClick={c.remove}>Supprimer le repère</button>
      </fieldset>}
      <button data-testid="zone-guides-return" style={button} onClick={c.exit}>Revenir à Project Map</button>
      <small>Repères sauvegardés avec le projet. Aucun appel IA. « Prête » signifie seulement que vous avez terminé votre révision.</small>
    </div>}
  </div>;
}

export function ZoneGuideOverlay({ controller: c, panel, zoom, toLocal, panHeld, measurement }) {
  const drag = useRef(null), root = useRef(null);
  if (!c.owner) return null;
  const point = e => {const p=toLocal(e.clientX,e.clientY);return [Math.max(0,Math.min(1,p[0]/panel.img.w)),Math.max(0,Math.min(1,p[1]/panel.img.h))];};
  const size=12/zoom, color="#bc36cf";
  const begin = (e,g,index) => {
    if(e.button!==0||panHeld())return;
    e.preventDefault();e.stopPropagation();c.setSelected(g.id);
    if(c.tool!=="select")return;
    drag.current={g,index,start:point(e),el:e.currentTarget,dx:0,dy:0};e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move=e=>{const d=drag.current;if(!d)return;e.stopPropagation();const at=point(e),old=d.g.points[d.index].at;const shifted=shiftPoints([old],at[0]-d.start[0],at[1]-d.start[1])[0];d.dx=shifted[0]-old[0];d.dy=shifted[1]-old[1];d.el.setAttribute("transform",`translate(${d.dx*panel.img.w},${d.dy*panel.img.h})`);};
  const end=e=>{const d=drag.current;if(!d)return;e.stopPropagation();drag.current=null;d.el.removeAttribute("transform");if(e.type!=="pointercancel"&&(d.dx||d.dy))c.update(d.g.id,{points:d.g.points.map((p,i)=>i===d.index?{...p,at:[p.at[0]+d.dx,p.at[1]+d.dy]}:p)});try{d.el.releasePointerCapture(e.pointerId);}catch{/* lost */}};
  return <g ref={root} data-testid="zone-guides-layer" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
    <rect width={panel.img.w} height={panel.img.h} fill="transparent" style={{pointerEvents:"all",cursor:c.tool==="select"?"default":"crosshair"}} onPointerDown={e=>{if(e.button!==0||panHeld())return;e.preventDefault();e.stopPropagation();c.add(panel.key,point(e),e.ctrlKey);}} />
    {c.guides.map(g=>{
      const local=g.points.map((p,i)=>({...p,i})).filter(p=>p.sheet_id===panel.key);
      const segments=g.kind==="sector"?[[0,1],[2,3]]:["arrow","measure"].includes(g.kind)?[[0,1]]:[];
      return <g key={g.id}>
        {g.kind==="poi"&&g.points.length===2&&g.points[0].sheet_id===panel.key&&<g style={{pointerEvents:"none"}}><rect x={Math.min(g.points[0].at[0],g.points[1].at[0])*panel.img.w} y={Math.min(g.points[0].at[1],g.points[1].at[1])*panel.img.h} width={Math.abs(g.points[1].at[0]-g.points[0].at[0])*panel.img.w} height={Math.abs(g.points[1].at[1]-g.points[0].at[1])*panel.img.h} fill="#bc36cf12" stroke={color} strokeWidth={2/zoom} strokeDasharray={`${7/zoom} ${4/zoom}`}/><text x={Math.min(g.points[0].at[0],g.points[1].at[0])*panel.img.w+8/zoom} y={Math.min(g.points[0].at[1],g.points[1].at[1])*panel.img.h-8/zoom} fontSize={14/zoom} fontWeight="bold" fill={color} stroke="white" strokeWidth={3/zoom} paintOrder="stroke">{g.label}</text></g>}
        {segments.map(([a,b])=>{const p=g.points[a],q=g.points[b];if(!p||!q||p.sheet_id!==panel.key||q.sheet_id!==panel.key)return null;return <g key={a} style={{pointerEvents:"none"}}><line x1={p.at[0]*panel.img.w} y1={p.at[1]*panel.img.h} x2={q.at[0]*panel.img.w} y2={q.at[1]*panel.img.h} stroke={color} strokeWidth={2/zoom}/>{g.kind==="arrow"&&<path transform={`translate(${q.at[0]*panel.img.w},${q.at[1]*panel.img.h}) rotate(${Math.atan2((q.at[1]-p.at[1])*panel.img.h,(q.at[0]-p.at[0])*panel.img.w)*180/Math.PI})`} d={`M${-size},${-size/2} L0,0 L${-size},${size/2}`} fill="none" stroke={color} strokeWidth={2/zoom}/>} {g.kind==="measure"&&<text x={(p.at[0]+q.at[0])*panel.img.w/2+18/zoom} y={(p.at[1]+q.at[1])*panel.img.h/2-18/zoom} fontSize={15/zoom} fill={color} stroke="white" strokeWidth={3/zoom} paintOrder="stroke">{measurement(g,panel)}</text>}</g>;})}
        {local.map(p=><g key={p.i} data-guide-id={g.id} data-guide-point={p.i} style={{pointerEvents:"all",cursor:c.tool==="select"?"move":"pointer"}} onPointerDown={e=>begin(e,g,p.i)}>
          <circle cx={p.at[0]*panel.img.w} cy={p.at[1]*panel.img.h} r={size/2} fill={c.selected===g.id?color:"white"} stroke={color} strokeWidth={2/zoom}/>
          {g.kind==="datum"&&<path d={`M${p.at[0]*panel.img.w},${p.at[1]*panel.img.h-3*size} v${6*size} m${-size/2},${-size/2} l${size/2},${size/2} l${size/2},${-size/2} M${p.at[0]*panel.img.w-size/2},${p.at[1]*panel.img.h-2.5*size} l${size/2},${-size/2} l${size/2},${size/2}`} stroke={color} fill="none" strokeWidth={2/zoom}/>}
          {g.kind !== "measure" && <text x={p.at[0]*panel.img.w+size} y={p.at[1]*panel.img.h-size} fontSize={size} fontWeight="bold" fill={color} stroke="white" strokeWidth={3/zoom} paintOrder="stroke">{g.label}{guidePointCount(g.kind)>1?` · ${p.i+1}/${guidePointCount(g.kind)}`:""}</text>}
        </g>)}
      </g>;
    })}
  </g>;
}
