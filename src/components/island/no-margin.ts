/**
 * Jamais de marge sur la bannière du comptoir (fondateur, 4 et 6 nov. 2026 : « on ne doit plus la voir sur la bannière ») :
 * retirée ici, à l'entrée, pour toutes les bannières (poste, vente, démo, site), quelles que soient les données reçues.
 */
export function withoutMargin<T extends { margin?: string }>(items: readonly T[]): T[] {
  return items.map((item) => (item.margin === undefined ? item : { ...item, margin: undefined }));
}
