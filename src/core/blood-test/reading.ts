import { BLOOD_MARKERS, type BloodMarkerKey } from "./rules";
import { BLOOD_LIBRARY, LIBRARY_IDS, LIBRARY_TO_MARKER } from "./library";

/**
 * La lecture d'une prise de sang : ce que le modèle de vision doit rendre, et ce qu'on en retient.
 *
 * Le modèle ne fait que RECOPIER les lignes du compte rendu (toutes celles qui ont une valeur chiffrée) et les rattacher à
 * une fiche de la bibliothèque (library.ts). La décision — normale, basse, haute — se prend ici, sur les chiffres recopiés :
 * une valeur n'est hors normes que si elle sort de la fourchette IMPRIMÉE par le laboratoire, ou, sans fourchette, si le
 * laboratoire l'a marquée lui-même (flèche, « L », « H »). Rien n'est deviné. Deux sorties :
 *  • `findings` : les seules valeurs hors normes, comme avant — elles nourrissent les propositions (propose.ts) ;
 *  • `analyses` : toutes les valeurs, avec leur état, pour la carte du corps.
 *
 * Aucune identité n'est demandée ni gardée : ni nom, ni date de naissance, ni laboratoire, ni médecin.
 */

export const BLOOD_TOOL_NAME = "enregistrer_prise_de_sang";

const MARKER_KEYS = Object.keys(BLOOD_MARKERS) as BloodMarkerKey[];

export const BLOOD_SYSTEM_PROMPT = [
  "Tu recopies un compte rendu d'analyses de biologie médicale (prise de sang) photographié ou en PDF.",
  "Tu ne donnes aucun avis, aucun diagnostic, aucune interprétation : tu recopies.",
  "Recopie TOUTES les analyses du compte rendu qui ont un résultat chiffré, qu'elles soient dans les normes ou non. Ignore les lignes sans valeur chiffrée et les résultats antérieurs.",
  "Pour chaque ligne : le libellé tel qu'imprimé, la valeur numérique, l'unité, les bornes de référence imprimées (basse et haute, null si absente ; « < 1,60 » donne refLow null et refHigh 1.6), la marque du laboratoire telle qu'imprimée (flèche, astérisque, « L », « H »… null si aucune), et une citation courte de la ligne.",
  `analysisId : rattache la ligne à l'une de ces fiches quand c'est bien elle : ${BLOOD_LIBRARY.map((entry) => `${entry.id} = ${entry.hint}`).join(" ; ")}. Sinon, AUTRE.`,
  `marker : ${MARKER_KEYS.map((key) => `${key} = ${BLOOD_MARKERS[key].hint}`).join(" ; ")}. Sinon, AUTRE.`,
  "N'écris jamais le nom du patient, sa date de naissance, son adresse, le nom du médecin ou du laboratoire.",
  "Si le document n'est pas un compte rendu d'analyses biologiques, mets isBloodTest à false et aucune ligne.",
].join("\n");

export const BLOOD_USER_PROMPT = "Recopie toutes les analyses chiffrées de ce compte rendu, avec l'outil.";

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
        required: ["label", "analysisId", "marker", "value", "unit", "refLow", "refHigh", "labFlag", "quote"],
        properties: {
          label: { type: "string" },
          analysisId: { type: "string", enum: [...LIBRARY_IDS, "AUTRE"] },
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
  /** Fiche de la bibliothèque, ou « AUTRE ». Absent des anciennes lectures : déduit de `marker`. */
  analysisId?: string;
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

export type BloodAnalysisStatus = "ok" | "low" | "high" | "unknown";

/** Une analyse lue, quelle qu'elle soit : ce que montre la carte du corps. `libraryId` null = analyse « autre ». */
export type BloodAnalysis = {
  libraryId: string | null;
  label: string;
  marker: BloodMarkerKey | null;
  value: number;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  /** « unknown » : ni fourchette imprimée ni marque du laboratoire — on montre la valeur, sans juger. */
  status: BloodAnalysisStatus;
  veryLow: boolean;
};

export type BloodReading = { ok: true; findings: BloodFinding[]; analyses: BloodAnalysis[] } | { ok: false; error: string };

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
    const claimedMarker = (Object.keys(BLOOD_MARKERS) as BloodMarkerKey[]).includes(row.marker as BloodMarkerKey) ? (row.marker as BloodMarkerKey) : null;
    // Une ligne rattachée à la fiche « vitd » est la vitamine D, même si le champ `marker` est resté à AUTRE.
    const marker = claimedMarker ?? (typeof row.analysisId === "string" ? (LIBRARY_TO_MARKER[row.analysisId] ?? null) : null);
    const label = String(row.label ?? "").trim().slice(0, 80) || (marker ? BLOOD_MARKERS[marker].label : "Analyse");
    const key = `${marker ?? label.toLowerCase()}:${direction}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const veryLow = direction === "LOW" && value !== null && refLow !== null && refLow > 0 && value < refLow / 2;
    findings.push({ label, marker, direction, value, unit: row.unit ? String(row.unit).slice(0, 20) : null, refLow, refHigh, veryLow });
  }
  return { ok: true, findings, analyses: allAnalyses(claimed.results) };
}

/** Toutes les lignes chiffrées, avec leur état calculé sur les mêmes règles que les valeurs hors normes. */
function allAnalyses(rows: ClaimedBloodResult[] | unknown): BloodAnalysis[] {
  const out: BloodAnalysis[] = [];
  const seen = new Set<string>();
  for (const row of Array.isArray(rows) ? (rows as ClaimedBloodResult[]) : []) {
    const value = finite(row.value);
    if (value === null) continue;
    const refLow = finite(row.refLow);
    const refHigh = finite(row.refHigh);
    let status: BloodAnalysisStatus;
    if (refLow !== null && value < refLow) status = "low";
    else if (refHigh !== null && value > refHigh) status = "high";
    else if (refLow !== null || refHigh !== null) status = "ok";
    else {
      const flag = flagDirection(row.labFlag);
      status = flag === "LOW" ? "low" : flag === "HIGH" ? "high" : "unknown";
    }
    const claimedMarker = (Object.keys(BLOOD_MARKERS) as BloodMarkerKey[]).includes(row.marker as BloodMarkerKey) ? (row.marker as BloodMarkerKey) : null;
    const marker = claimedMarker ?? (typeof row.analysisId === "string" ? (LIBRARY_TO_MARKER[row.analysisId] ?? null) : null);
    const claimedId = typeof row.analysisId === "string" && LIBRARY_IDS.includes(row.analysisId) ? row.analysisId : null;
    const libraryId = claimedId ?? (marker ? Object.entries(LIBRARY_TO_MARKER).find(([, m]) => m === marker)?.[0] ?? null : null);
    const label = String(row.label ?? "").trim().slice(0, 80) || (libraryId ? (BLOOD_LIBRARY.find((entry) => entry.id === libraryId)?.name ?? "Analyse") : "Analyse");
    const key = libraryId ?? label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const veryLow = status === "low" && refLow !== null && refLow > 0 && value < refLow / 2;
    out.push({ libraryId, label, marker, value, unit: row.unit ? String(row.unit).slice(0, 20) : null, refLow, refHigh, status, veryLow });
  }
  return out;
}
