// Human-authored preparation, not executable instructions or AI observations.
export const REFERENCE_ROLES = { context: "Contexte", dimensions: "Dimensions", continuity: "Continuité de maçonnerie", assembly: "Assemblage" };
export interface RegionWorkContext {
  version: 1;
  instructions: string;
  product_ids: string[];
  references: { region_id: string; revision: number; role: string; note: string }[];
  updated_by: "human";
  updated_at: string;
}
export function workContextError(value: unknown, selfId: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Fiche de travail invalide.";
  const c = value as RegionWorkContext;
  if (c.version !== 1 || c.updated_by !== "human" || typeof c.updated_at !== "string" || !c.updated_at.trim() || c.updated_at.length > 128) return "Version ou auteur de fiche invalide.";
  if (typeof c.instructions !== "string" || c.instructions.length > 8000) return "Les consignes doivent contenir au plus 8 000 caractères.";
  if (!Array.isArray(c.product_ids) || c.product_ids.length > 256 || c.product_ids.some(id => typeof id !== "string" || !id.trim() || id.length > 512) || new Set(c.product_ids).size !== c.product_ids.length) return "Liste de produits invalide.";
  if (!Array.isArray(c.references) || c.references.length > 128) return "Liste de références invalide.";
  const ids = new Set();
  for (const r of c.references) {
    if (!r || typeof r.region_id !== "string" || !r.region_id.startsWith("region:") || r.region_id.length > 512 || r.region_id === selfId || ids.has(r.region_id) || !Number.isInteger(r.revision) || r.revision < 1 || !Object.prototype.hasOwnProperty.call(REFERENCE_ROLES, r.role) || typeof r.note !== "string" || r.note.length > 2000) return "Référence invalide, répétée ou vers la zone elle-même.";
    ids.add(r.region_id);
  }
  return null;
}
export function workContextWarnings(context: RegionWorkContext | undefined, regions: any[], products: any[]): string[] {
  if (!context) return [];
  const warnings: string[] = [];
  for (const ref of context.references) {
    const target = regions.find(r => r.id === ref.region_id);
    if (!target) warnings.push(`Zone liée introuvable : ${ref.region_id}`);
    else {
      if (target.revision !== ref.revision) warnings.push(`Référence modifiée depuis le lien : ${target.name} (r${ref.revision} → r${target.revision}).`);
      if (target.review?.status !== "confirmed") warnings.push(`Référence à valider : ${target.name}.`);
    }
  }
  for (const id of context.product_ids) if (!products.some(p => p.id === id)) warnings.push(`Produit introuvable : ${id}`);
  return warnings;
}
export function prepareWorkContext(region: any, draft: any, now = new Date().toISOString()) {
  const context: RegionWorkContext = { ...draft, version: 1, updated_by: "human", updated_at: now };
  const error = workContextError(context, region.id);
  if (error) throw new Error(error);
  // Only this field changes: never accept proposed geometry or reprice quantities.
  return { ...region, revision: region.revision + 1, work_context: context, preparation_ready: false };
}
