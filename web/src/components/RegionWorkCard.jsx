import React, { useEffect, useState } from "react";
import { REFERENCE_ROLES, workContextWarnings } from "../lib/regionWorkContext";

const field = { width: "100%", boxSizing: "border-box", padding: "var(--sp-2)", background: "var(--paper-bright)", color: "var(--ink)", border: "1px solid var(--ink-faint)", fontSize: 12 };
const block = { display: "grid", gap: "var(--sp-2)", marginTop: "var(--sp-3)" };
export default function RegionWorkCard({ region, regions, products, onSave, onNavigate, onStartPoi, onDirty }) {
  const saved = region.work_context;
  const [instructions, setInstructions] = useState(saved?.instructions || "");
  const [productIds, setProductIds] = useState(saved?.product_ids || []);
  const [references, setReferences] = useState(saved?.references || []);
  const [error, setError] = useState("");
  const draft = { instructions, product_ids: productIds, references };
  const dirty = JSON.stringify(draft) !== JSON.stringify({ instructions: saved?.instructions || "", product_ids: saved?.product_ids || [], references: saved?.references || [] });
  useEffect(() => { onDirty?.(dirty); return () => onDirty?.(false); }, [dirty, onDirty]);
  const warnings = workContextWarnings({ ...draft, version: 1 }, regions, products);
  const updateReference = (id, patch) => setReferences(list => list.map(ref => ref.region_id === id ? { ...ref, ...patch } : ref));
  return <details data-testid="map-work-card" open style={{ ...block, border: "1px solid var(--ink-faint)", padding: "var(--sp-2)" }}>
    <summary style={{ cursor: "pointer", fontWeight: 700 }}>Fiche de préparation · V2</summary>
    <p style={{ fontSize: 11, color: "var(--ink-muted)" }}>Consignes humaines, distinctes des observations IA. Cette fiche ne lance aucun calcul et n’est pas encore transmise automatiquement à GRUMP.</p>
    <label style={block}>Consignes particulières
      <textarea data-testid="map-work-instructions" rows={4} value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Ex. : compter la pierre derrière le parement; consulter la coupe liée." style={{ ...field, resize: "vertical" }} />
    </label>
    <fieldset style={block}><legend>Produits à calculer</legend>
      <div style={{ maxHeight: 150, overflowY: "auto" }}>
        {!products.length && <small>Créez les produits dans le panneau Produits. La bibliothèque n’est pas requise.</small>}
        {products.map(p => <label key={p.id} style={{ display: "flex", gap: "var(--sp-2)", marginBottom: "var(--sp-2)" }}>
          <input type="checkbox" checked={productIds.includes(p.id)} onChange={e => setProductIds(ids => e.target.checked ? [...ids, p.id] : ids.filter(id => id !== p.id))} />{p.tag || p.name || p.id}
        </label>)}
        {productIds.filter(id => !products.some(p => p.id === id)).map(id => <button key={id} type="button" onClick={() => setProductIds(ids => ids.filter(x => x !== id))}>Retirer le produit manquant : {id}</button>)}
      </div>
      <small>Aucune sélection = périmètre produits non défini, pas « tous les produits ».</small>
    </fieldset>
    <label style={block}>Lier une coupe, un détail ou une autre zone
      <select aria-label="Ajouter une zone de référence" value="" style={field} onChange={e => {
        const target = regions.find(r => r.id === e.target.value);
        if (target) setReferences(list => [...list, { region_id: target.id, revision: target.revision, role: "context", note: "" }]);
      }}><option value="">Choisir une zone du projet…</option>{regions.filter(r => r.id !== region.id && !references.some(ref => ref.region_id === r.id)).map(r => <option key={r.id} value={r.id}>{r.name} · {r.sheet_id}</option>)}</select>
    </label>
    <small>Références de contexte uniquement : leurs surfaces ne sont jamais ajoutées à celles de cette zone. Chaque zone conserve son échelle.</small>
    {references.map(ref => {
      const target = regions.find(r => r.id === ref.region_id);
      return <div key={ref.region_id} style={{ ...block, borderLeft: "2px solid var(--ink-faint)", paddingLeft: "var(--sp-2)" }}>
        <b>{target?.name || ref.region_id} · r{ref.revision}</b>
        <select aria-label={`Rôle de ${target?.name || ref.region_id}`} value={ref.role} style={field} onChange={e => updateReference(ref.region_id, { role: e.target.value })}>{Object.entries(REFERENCE_ROLES).map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select>
        <textarea aria-label={`Consigne pour ${target?.name || ref.region_id}`} rows={2} value={ref.note} style={field} placeholder="Pourquoi ce détail est-il pertinent ?" onChange={e => updateReference(ref.region_id, { note: e.target.value })} />
        <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
          <button type="button" disabled={!target || dirty} title={dirty ? "Enregistrez la fiche avant de changer de zone" : "Ouvrir la zone liée"} onClick={() => onNavigate(target)}>Voir la zone</button>
          {onStartPoi && <button type="button" disabled={!target || dirty} title={dirty ? "Enregistrez d’abord la fiche" : "Encadrer un secteur précis dans cette zone liée"} onClick={() => onStartPoi(region, target, ref.note)}>+ POI précis</button>}
          {target && target.revision !== ref.revision && <button type="button" onClick={() => updateReference(ref.region_id, { revision: target.revision })}>Actualiser à r{target.revision}</button>}
          <button type="button" onClick={() => setReferences(list => list.filter(r => r.region_id !== ref.region_id))}>Délier</button>
        </div>
      </div>;
    })}
    {warnings.map(w => <p key={w} style={{ color: "var(--c-warning)", fontSize: 11 }}>{w}</p>)}
    {error && <p role="alert" style={{ color: "var(--c-danger)" }}>{error}</p>}
    <button data-testid="map-work-save" type="button" disabled={!dirty} style={{ ...field, marginTop: "var(--sp-3)", cursor: dirty ? "pointer" : "default" }} onClick={() => {
      const result = onSave(region.id, draft, region.revision);
      setError(result?.error || "");
    }}>Enregistrer la fiche{dirty ? " *" : ""}</button>
    {dirty && <small style={{ display: "block", color: "var(--c-warning)" }}>Modifications non enregistrées. Enregistrez avant de changer de zone ou de fermer Project Map.</small>}
  </details>;
}
