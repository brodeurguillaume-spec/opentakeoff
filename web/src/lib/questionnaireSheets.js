// Transient navigation only: never an annotation import or durable journal action.
export function questionnaireSheetSelection(payload, context, availableKeys, busy = false) {
  const wanted = payload?.context;
  if (!wanted?.document_sha256 || wanted.document_sha256 !== context?.document_sha256) {
    throw new Error("Le PDF analysé n’est plus le PDF actif. Réouvre-le puis réessaie.");
  }
  if (busy) throw new Error("Termine le tracé ou la modification en cours, puis clique sur « Ouvrir RDC / élévations ».");
  const keys = payload?.sheet_ids;
  if (!Array.isArray(keys) || !keys.length || keys.length > 12 || keys.some((key) => typeof key !== "string" || !availableKeys.includes(key))) {
    throw new Error("Une feuille proposée est absente du PDF actif; aucune navigation effectuée.");
  }
  return [...new Set(keys)];
}
