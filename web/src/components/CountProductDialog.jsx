import React, { useEffect, useRef, useState } from "react";
import { countFootprintDimensions } from "../lib/countFootprint.js";

const numeric = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const nonNegative = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export default function CountProductDialog({ product, mode = "count", onCancel, onConfirm }) {
  const isRun = mode === "linear-count";
  const dims = countFootprintDimensions(product?.count_footprint);
  const widthRef = useRef(null);
  const [widthIn, setWidthIn] = useState(isRun ? (product?.length_in || dims.width_in || 36) : (dims.width_in || 12));
  const [heightIn, setHeightIn] = useState(Number.isFinite(dims.height_in) ? dims.height_in : 12);
  const [tag, setTag] = useState(product?.count_tag ?? product?.finish_tag ?? "");
  const [nominalIn, setNominalIn] = useState(product?.length_in ?? "");
  const [jointIn, setJointIn] = useState(product?.count_joint_in ?? 0.5);
  const field = { width: 118, padding: "6px 8px", border: "1px solid var(--ink-faint)", background: "var(--paper-bright)", color: "var(--ink)", fontFamily: "var(--f-mono)", fontSize: 12 };

  useEffect(() => {
    const input = widthRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  const submit = (e) => {
    e.preventDefault();
    onConfirm({
      width_in: numeric(widthIn, 12),
      height_in: nonNegative(heightIn, 12),
      tag: String(tag || "").trim(),
      nominal_in: isRun ? numeric(widthIn, 36) : (nominalIn === "" ? null : numeric(nominalIn, null)),
      joint_in: Math.max(0, Number(jointIn) || 0),
    });
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="count-product-title"
      style={{ position: "fixed", inset: 0, zIndex: 1000, display: "grid", placeItems: "center", background: "rgba(8,12,18,.55)" }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <form onSubmit={submit} style={{ width: "min(560px, calc(100vw - 32px))", background: "var(--paper-bright)", color: "var(--ink)", border: "1px solid var(--cobalt)", boxShadow: "var(--shadow-pop)", padding: 18 }}>
        <div id="count-product-title" style={{ fontFamily: "var(--f-mono)", fontSize: 13, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>{isRun ? "Configurer la répartition linéaire" : "Configurer le symbole Count"}</div>
        <p style={{ margin: "8px 0 16px", color: "var(--ink-muted)", fontSize: 12.5, lineHeight: 1.45 }}>
          {isRun
            ? "Ces réglages appartiennent au Produit. Trace une distance en deux clics; AI Takeoff créera le nombre entier de morceaux requis, centré sur cette distance."
            : "Ce réglage appartient au Produit. Chaque nouveau Count réutilisera cette forme à l’échelle; il vaudra toujours 1 EA."}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 5, fontSize: 11.5 }}>{isRun ? "Longueur d’un morceau (po)" : "Largeur X (po)"}
            <input ref={widthRef} name="count-width-in" type="number" min="0.125" step="0.125" value={widthIn} onChange={(e) => setWidthIn(e.target.value)} style={{ ...field, width: "100%" }} />
          </label>
          <label style={{ display: "grid", gap: 5, fontSize: 11.5 }}>Hauteur Y (po) · 0 = ligne
            <input name="count-height-in" type="number" min="0" step="0.125" value={heightIn} onChange={(e) => setHeightIn(e.target.value)} style={{ ...field, width: "100%" }} />
          </label>
          <label style={{ display: "grid", gap: 5, fontSize: 11.5 }}>Tag visible
            <input name="count-tag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Ex. F2, ANCRAGE 36" style={{ ...field, width: "100%" }} />
          </label>
          {!isRun && <label style={{ display: "grid", gap: 5, fontSize: 11.5 }}>Mesure nominale (po)
            <input name="count-nominal-in" type="number" min="0.125" step="0.125" value={nominalIn} onChange={(e) => setNominalIn(e.target.value)} placeholder="Ex. 36" style={{ ...field, width: "100%" }} />
          </label>}
          {isRun && <label style={{ display: "grid", gap: 5, fontSize: 11.5 }}>Joint entre morceaux (po)
            <input name="count-joint-in" type="number" min="0" step="0.125" value={jointIn} onChange={(e) => setJointIn(e.target.value)} style={{ ...field, width: "100%" }} />
          </label>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button type="button" onClick={onCancel} style={{ padding: "7px 12px", border: "1px solid var(--ink-faint)", background: "transparent", color: "var(--ink)", cursor: "pointer" }}>Annuler</button>
          <button type="submit" style={{ padding: "7px 14px", border: "1px solid var(--cobalt)", background: "var(--cobalt)", color: "#fff", cursor: "pointer", fontWeight: 750 }}>{isRun ? "Enregistrer et tracer" : "Enregistrer et placer"}</button>
        </div>
      </form>
    </div>
  );
}
