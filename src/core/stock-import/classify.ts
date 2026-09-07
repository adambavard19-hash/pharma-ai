import type { ImportRow } from "./rows";

/**
 * Le rattachement d'une ligne à quelque chose de connu.
 *
 * L'ordre est celui de la fiabilité : un code CIP13 identifie une boîte de
 * médicament sans ambiguïté ; un EAN13 identifie un produit de l'officine ;
 * un nom exactement identique à un produit existant vaut rattachement ; un
 * nom seulement proche est une PISTE, montrée au titulaire, jamais validée
 * seule. Ce qui ne correspond à rien peut devenir un produit de l'officine —
 * sur décision explicite.
 */

export type RowStatus =
  /** Boîte du catalogue national, identifiée par son CIP13. */
  | "MEDICAMENT"
  /** Produit déjà présent dans le stock de cette officine. */
  | "PRODUIT_EXISTANT"
  /** Une ou plusieurs correspondances proches : le titulaire tranche. */
  | "A_VERIFIER"
  /** Rien de connu : à créer comme produit de l'officine, ou à ignorer. */
  | "NON_RECONNU"
  /** Ligne inexploitable (quantité illisible, ni nom ni code…). */
  | "INVALIDE";

export type RowCandidate = { id: string; label: string; detail: string | null };

export type ClassifiedRow = ImportRow & {
  status: RowStatus;
  /** Identifiant de la cible reconnue (présentation ou produit). */
  targetId: string | null;
  targetLabel: string | null;
  candidates: RowCandidate[];
};

export type Lookups = {
  /** CIP13 → présentation du catalogue national. */
  presentationByCip13: Map<string, { id: string; label: string }>;
  /** EAN13 → produit de l'officine. */
  productByEan: Map<string, { id: string; name: string }>;
  /** Nom normalisé → produit de l'officine. */
  productByName: Map<string, { id: string; name: string }>;
  /** Nom normalisé partiel → pistes (produits de l'officine et médicaments). */
  candidatesFor: (name: string) => RowCandidate[];
};

export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Un CIP7 devient un CIP13 par le préfixe national et sa clé. */
export function expandCip(code: string): string | null {
  if (code.length === 13) return code;
  if (code.length !== 7) return null;
  const twelve = `34009${code}`;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(twelve[i]) * (i % 2 === 0 ? 1 : 3);
  return `${twelve}${(10 - (sum % 10)) % 10}`;
}

export function classifyRows(rows: ImportRow[], lookups: Lookups): ClassifiedRow[] {
  return rows.map((row) => {
    const base = { ...row, targetId: null, targetLabel: null, candidates: [] as RowCandidate[] };

    if (
      row.issues.includes("NOM_ET_CODE_MANQUANTS") ||
      row.issues.includes("QUANTITE_INVALIDE") ||
      row.quantity === null
    ) {
      return { ...base, status: "INVALIDE" };
    }

    if (row.code) {
      const cip13 = expandCip(row.code);
      const presentation = cip13 ? lookups.presentationByCip13.get(cip13) : undefined;
      if (presentation) {
        return { ...base, status: "MEDICAMENT", targetId: presentation.id, targetLabel: presentation.label };
      }
      const product = row.code.length === 13 ? lookups.productByEan.get(row.code) : undefined;
      if (product) {
        return { ...base, status: "PRODUIT_EXISTANT", targetId: product.id, targetLabel: product.name };
      }
    }

    if (row.name) {
      const exact = lookups.productByName.get(normalizeName(row.name));
      if (exact) {
        return { ...base, status: "PRODUIT_EXISTANT", targetId: exact.id, targetLabel: exact.name };
      }
      const candidates = lookups.candidatesFor(row.name).slice(0, 3);
      if (candidates.length > 0) return { ...base, status: "A_VERIFIER", candidates };
    }

    return { ...base, status: "NON_RECONNU" };
  });
}

export type ImportSummary = {
  detected: number;
  medicaments: number;
  existing: number;
  toVerify: number;
  unknown: number;
  invalid: number;
  /** Lignes dont une anomalie est signalée, quel que soit leur statut. */
  withIssues: number;
};

export function summarize(rows: ClassifiedRow[]): ImportSummary {
  return {
    detected: rows.length,
    medicaments: rows.filter((r) => r.status === "MEDICAMENT").length,
    existing: rows.filter((r) => r.status === "PRODUIT_EXISTANT").length,
    toVerify: rows.filter((r) => r.status === "A_VERIFIER").length,
    unknown: rows.filter((r) => r.status === "NON_RECONNU").length,
    invalid: rows.filter((r) => r.status === "INVALIDE").length,
    withIssues: rows.filter((r) => r.issues.length > 0).length,
  };
}

/**
 * La décision du titulaire sur une ligne non tranchée par le rattachement.
 * `IGNORER` par défaut pour « à vérifier » : rien d'incertain ne passe seul.
 */
export type RowDecision =
  | { kind: "CREER_PRODUIT" }
  | { kind: "RATTACHER"; targetId: string }
  | { kind: "IGNORER" };
