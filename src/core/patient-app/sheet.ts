/**
 * L'APPLI GRAND PUBLIC « PharmaBoost » (phase 1, 21 oct. 2026) : ce qu'un particulier voit quand il scanne une boîte.
 *
 * Règle absolue, sans exception : la fiche ne dit QUE ce qu'une source publiée dit. Une rubrique sans source vérifiée
 * n'est pas affichée — jamais un texte de remplacement, jamais une note sur un médicament. Les sources :
 *   • la Base de données publique des médicaments (BDPM) : nom, forme, voies, composition, conditions de délivrance,
 *     remboursement, effets indésirables fréquents lus dans le RCP (rubrique 4.8) ;
 *   • Open Medic (Assurance Maladie) : la famille du médicament (classification ATC) ;
 *   • une fiche éditoriale réelle (`DrugReference`, jamais celle du jeu de démonstration) pour « à quoi ça sert » et
 *     « comment le prendre ».
 * Rien n'est gardé du scan : aucune donnée de santé n'est enregistrée en phase 1.
 */

export type ScannedCode =
  | { kind: "CIP13"; code: string }
  | { kind: "CIP7"; code: string }
  | { kind: "EAN"; code: string };

/**
 * Le code lu par la caméra ou tapé, ramené à ce que la base connaît :
 *   • un Datamatrix de boîte (GS1 : « 01 » + GTIN-14 « 03400… », suivi du lot et de la date) → CIP13 ;
 *   • un GTIN-14 « 0340… » → CIP13 (le zéro de tête retiré) ;
 *   • un CIP13 « 3400… » ; un CIP7 (7 chiffres) ;
 *   • tout autre EAN-13 / EAN-8 (parapharmacie).
 * `null` si rien d'exploitable.
 */
export function normalizeScannedCode(raw: string): ScannedCode | null {
  const text = raw.replace(/[\u001d\s()]/g, "");
  // GS1 Datamatrix : l'identifiant d'application 01 suivi de 14 chiffres, en tête.
  const gs1 = /^01(\d{14})/.exec(text);
  const digits = gs1 ? gs1[1] : /^\d+$/.test(text) ? text : null;
  if (!digits) return null;
  if (digits.length === 14 && digits.startsWith("0")) return normalizeScannedCode(digits.slice(1));
  if (digits.length === 13) return digits.startsWith("3400") ? { kind: "CIP13", code: digits } : { kind: "EAN", code: digits };
  if (digits.length === 7) return { kind: "CIP7", code: digits };
  if (digits.length === 8) return { kind: "EAN", code: digits };
  return null;
}

export type DrugSheetInput = {
  cisCode: string;
  name: string;
  form: string | null;
  routes: string[];
  presentation: string | null;
  substances: { label: string; dosage: string | null }[];
  prescriptionConditions: string[];
  reimbursementRate: number | null;
  family: { atcCode: string; label: string | null } | null;
  /** Effets indésirables fréquents lus dans le RCP (BDPM 4.8) ; vide si le RCP n'a pas été lu ou n'en donne pas. */
  officialSideEffects: string[];
  /** Fiche éditoriale réelle ; `null` pour une fiche de démonstration ou absente. */
  editorial: { explanation: string | null; intake: string | null; sourceName: string } | null;
};

export type SheetSection = { key: "usage" | "intake" | "composition" | "sideEffects" | "family"; title: string; lines: string[]; source: string };

export type DrugSheet = {
  kind: "MEDICINE";
  cisCode: string;
  name: string;
  subtitle: string | null;
  /** « Sur ordonnance » quand la BDPM publie une condition de délivrance (liste I, II, stupéfiant…), sinon « Sans ordonnance ». */
  delivery: "PRESCRIPTION" | "NO_PRESCRIPTION";
  deliveryDetail: string[];
  reimbursement: string | null;
  sections: SheetSection[];
  sourceUrl: string;
};

const BDPM = "Base de données publique des médicaments";

/** L'adresse publique de la fiche officielle d'une spécialité. */
export function bdpmUrl(cisCode: string): string {
  return `https://base-donnees-publique.medicaments.gouv.fr/medicament/${cisCode}/extrait`;
}

const LIST = /liste\s*i\b|liste\s*ii\b|liste\s*1|liste\s*2|stup[ée]fiant|prescription|ordonnance|hospitali|r[ée]serv[ée]/i;

/** La fiche d'un médicament, faite seulement de ce que les sources disent ; une rubrique vide n'existe pas. */
export function buildDrugSheet(input: DrugSheetInput): DrugSheet {
  const sections: SheetSection[] = [];
  const explanation = input.editorial?.explanation?.trim();
  if (explanation && input.editorial) sections.push({ key: "usage", title: "À quoi ça sert", lines: [explanation], source: input.editorial.sourceName });
  const intake = input.editorial?.intake?.trim();
  if (intake && input.editorial) sections.push({ key: "intake", title: "Comment le prendre", lines: [intake], source: input.editorial.sourceName });
  if (input.family?.label) sections.push({ key: "family", title: "Famille du médicament", lines: [input.family.label], source: "Open Medic (Assurance Maladie), classification ATC" });
  const substances = input.substances.filter((s) => s.label.trim());
  if (substances.length > 0) sections.push({ key: "composition", title: "Composition", lines: substances.map((s) => (s.dosage ? `${s.label} · ${s.dosage}` : s.label)), source: BDPM });
  if (input.officialSideEffects.length > 0) sections.push({ key: "sideEffects", title: "Effets indésirables fréquents", lines: input.officialSideEffects, source: `${BDPM}, résumé des caractéristiques du produit (rubrique 4.8)` });
  const prescribed = input.prescriptionConditions.some((c) => LIST.test(c));
  return {
    kind: "MEDICINE",
    cisCode: input.cisCode,
    name: input.name,
    subtitle: [input.form, input.presentation].filter(Boolean).join(" · ") || null,
    delivery: prescribed ? "PRESCRIPTION" : "NO_PRESCRIPTION",
    deliveryDetail: input.prescriptionConditions,
    reimbursement: typeof input.reimbursementRate === "number" && input.reimbursementRate > 0 ? `Remboursé à ${input.reimbursementRate} %` : null,
    sections,
    sourceUrl: bdpmUrl(input.cisCode),
  };
}

/** Un produit de parapharmacie connu (nom et marque lus sur l'étiquette) : pas de fiche médicale, jamais de note. */
export type ParaSheet = { kind: "PARA"; ean: string; name: string; brand: string | null; imageUrl: string | null; category: string | null };

/** Une suggestion de conseil : de la parapharmacie, jamais un médicament. */
export type PatientAdvice = {
  title: string;
  reason: string;
  products: { id: string; name: string; brand: string | null; imageUrl: string | null; partner: boolean }[];
};

/** Un produit proposable au grand public : ni code CIP (médicament), ni condition de délivrance. */
export function isParapharmacy(product: { ean: string | null; cip13?: string | null; prescriptionConditions?: string[] }): boolean {
  if (product.cip13?.startsWith("3400")) return false;
  if (product.ean && /^0?3400/.test(product.ean)) return false;
  return (product.prescriptionConditions ?? []).length === 0;
}
