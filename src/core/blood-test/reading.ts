import { BLOOD_MARKERS, type BloodMarkerKey } from "./rules";

/**
 * La lecture d'une prise de sang : ce que le modèle de vision doit rendre, et ce qu'on en retient.
 *
 * Le modèle ne fait que RECOPIER les lignes que le compte rendu signale hors normes. La décision — basse, haute, retenue ou
 * écartée — se prend ici, sur les chiffres recopiés : une valeur n'est retenue que si elle sort de la fourchette IMPRIMÉE
 * par le laboratoire, ou si le laboratoire l'a marquée lui-même (flèche, astérisque, « L », « H »). Rien n'est deviné.
 *
 * Aucune identité n'est demandée ni gardée : ni nom, ni date de naissance, ni laboratoire, ni médecin.
 */

export const BLOOD_TOOL_NAME = "enregistrer_prise_de_sang";

const MARKER_KEYS = Object.keys(BLOOD_MARKERS) as BloodMarkerKey[];

export const BLOOD_SYSTEM_PROMPT = [
  "Tu recopies un compte rendu d'analyses de biologie médicale (prise de sang) photographié ou en PDF.",
  "Tu ne donnes aucun avis, aucun diagnostic, aucune interprétation : tu recopies.",
  "Recopie UNIQUEMENT les analyses que le laboratoire présente comme hors de ses valeurs de référence : valeur en dehors de la fourchette imprimée, ou marquée par le laboratoire (flèche, astérisque, gras signalé, « L », « H », « B », « bas », « élevé »).",
  "Pour chaque ligne : le libellé tel qu'imprimé, la valeur numérique, l'unité, les bornes de référence imprimées (basse et haute, null si absente), la marque du laboratoire telle qu'imprimée (null si aucune), et la citation exacte de la ligne.",
  `Rattache la ligne à l'une de ces analyses quand c'est bien elle : ${MARKER_KEYS.map((key) => `${key} = ${BLOOD_MARKERS[key].hint}`).join(" ; ")}. Sinon, AUTRE.`,
  "N'écris jamais le nom du patient, sa date de naissance, son adresse, le nom du médecin ou du laboratoire.",
  "Si le document n'est pas un compte rendu d'analyses biologiques, mets isBloodTest à false et aucune ligne.",
].join("\n");

export const BLOOD_USER_PROMPT = "Recopie les analyses hors normes de ce compte rendu, avec l'outil.";

export const BLOOD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["isBloodTest", "results"],
  properties: {
    isBloodTest: { type: "boolean" },
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "marker", "value", "unit", "refLow", "refHigh", "labFlag", "quote"],
        properties: {
          label: { type: "string" },
          marker: { type: "string", enum: [...MARKER_KEYS, "AUTRE"] },
          value: { type: ["number", "null"] },
          unit: { type: ["string", "null"] },
          refLow: { type: ["number", "null"] },
          refHigh: { type: ["number", "null"] },
          labFlag: { type: ["string", "null"] },
          quote: { type: "string" },
        },
      },
    },
  },
} as const;

export type ClaimedBloodResult = {
  label: string;
  marker: string;
  value: number | null;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  labFlag: string | null;
  quote: string;
};

export type ClaimedBloodTest = { isBloodTest: boolean; results: ClaimedBloodResult[] };

export type BloodFinding = {
  label: string;
  marker: BloodMarkerKey | null;
  direction: "LOW" | "HIGH";
  value: number | null;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  /** Moins de la moitié de la borne basse : jamais de produit, le médecin d'abord. */
  veryLow: boolean;
};

export type BloodReading = { ok: true; findings: BloodFinding[] } | { ok: false; error: string };

const LOW_FLAG = /(^|[^a-z])(l|b|bas|basse|low|↓)([^a-z]|$)/i;
const HIGH_FLAG = /(^|[^a-z])(h|haut|haute|eleve|élevé|high|↑)([^a-z]|$)/i;

function flagDirection(flag: string | null): "LOW" | "HIGH" | null {
  if (!flag) return null;
  const text = flag.trim();
  if (!text) return null;
  if (LOW_FLAG.test(text) && !HIGH_FLAG.test(text)) return "LOW";
  if (HIGH_FLAG.test(text) && !LOW_FLAG.test(text)) return "HIGH";
  return null;
}

const finite = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** Ce qu'on retient d'une lecture : seulement ce que les chiffres imprimés (ou la marque du laboratoire) établissent. */
export function validateBloodReading(claimed: ClaimedBloodTest | null | undefined): BloodReading {
  if (!claimed || typeof claimed !== "object") return { ok: false, error: "La prise de sang n'a pas pu être lue." };
  if (!claimed.isBloodTest) return { ok: false, error: "Ce document ne ressemble pas à un compte rendu de prise de sang." };
  const findings: BloodFinding[] = [];
  const seen = new Set<string>();
  for (const row of Array.isArray(claimed.results) ? claimed.results : []) {
    const value = finite(row.value);
    const refLow = finite(row.refLow);
    const refHigh = finite(row.refHigh);
    let direction: "LOW" | "HIGH" | null = null;
    if (value !== null && refLow !== null && value < refLow) direction = "LOW";
    else if (value !== null && refHigh !== null && value > refHigh) direction = "HIGH";
    else if (value !== null && (refLow !== null || refHigh !== null)) direction = null; // dans la fourchette imprimée : écartée
    else direction = flagDirection(row.labFlag);
    // Une valeur dans la fourchette imprimée n'est jamais retenue, même marquée : les chiffres priment.
    if (!direction) continue;
    const marker = (Object.keys(BLOOD_MARKERS) as BloodMarkerKey[]).includes(row.marker as BloodMarkerKey) ? (row.marker as BloodMarkerKey) : null;
    const label = String(row.label ?? "").trim().slice(0, 80) || (marker ? BLOOD_MARKERS[marker].label : "Analyse");
    const key = `${marker ?? label.toLowerCase()}:${direction}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const veryLow = direction === "LOW" && value !== null && refLow !== null && refLow > 0 && value < refLow / 2;
    findings.push({ label, marker, direction, value, unit: row.unit ? String(row.unit).slice(0, 20) : null, refLow, refHigh, veryLow });
  }
  return { ok: true, findings };
}
