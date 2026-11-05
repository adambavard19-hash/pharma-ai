/**
 * Le bilan conseil remis par QR code (fondateur, 5 nov. 2026) : ce que le patient emporte sur son téléphone, sans nom ni e-mail.
 * Il est chiffré avec une clé qui n'existe que dans le lien du QR code (après le dièse) : PharmaBoost garde le chiffré, ne peut
 * pas le lire et ne sait pas à qui il appartient. Rien n'y nomme ce que la pharmacie a délivré (même verrou que l'e-mail).
 */
export type BilanContent = {
  kind: "bilan";
  version: 1;
  /** « 2026-11-05 ». */
  date: string;
  pharmacy: { name: string; city: string | null; phone: string | null; address: string | null };
  products: { name: string; reason: string | null; benefits: string[]; precautions: string[]; posology: string | null; imageUrl: string | null }[];
  /** Les compléments en cure : le rappel se programme sur le téléphone, jamais chez PharmaBoost. « 2026-12-01 » = le jour du rappel. */
  cures: { name: string; remindOn: string }[];
};

export function isBilanContent(value: unknown): value is BilanContent {
  const row = value as Partial<BilanContent> | null;
  return Boolean(row && row.kind === "bilan" && row.version === 1 && Array.isArray(row.products) && row.pharmacy && typeof row.pharmacy.name === "string");
}
