// Canonical Product ordering. The conditions array is already the durable
// order used by save/export and the fallback 1–9 shortcuts; moving one Product
// therefore means one stable splice, never an added display-only rank field.
export function moveProductToPosition(products, id, requestedPosition) {
  if (!Array.isArray(products) || products.length < 2) return products;
  const from = products.findIndex((product) => product?.id === id);
  const raw = Number(requestedPosition);
  if (from < 0 || !Number.isFinite(raw)) return products;
  const to = Math.max(0, Math.min(products.length - 1, Math.trunc(raw) - 1));
  if (from === to) return products;
  const next = products.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// A one-click Product copy needs a deterministic, immediately editable name.
// Start with “<name> 1” exactly as the operator expects, then advance only when
// that name already exists. Comparison follows the rest of the Product UI:
// whitespace/case differences do not create two visually identical tags.
export function nextProductCopyName(name, existingNames = []) {
  const base = String(name || "Produit").trim() || "Produit";
  const used = new Set((Array.isArray(existingNames) ? existingNames : [])
    .map((value) => String(value || "").trim().replace(/\s+/g, " ").toLocaleUpperCase()));
  for (let suffix = 1; suffix < 10000; suffix += 1) {
    const candidate = `${base} ${suffix}`;
    if (!used.has(candidate.replace(/\s+/g, " ").toLocaleUpperCase())) return candidate;
  }
  return `${base} copie`;
}
