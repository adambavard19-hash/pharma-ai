import type {
  ClaimedClassification,
  ClassificationResult,
  DrugClassification,
  RejectedUnderstanding,
} from "./types";

/**
 * Le validateur — la seule porte par laquelle une classification entre dans
 * le moteur.
 *
 * Le modèle a respecté un schéma strict ; ce n'est pas suffisant. Un code ATC
 * bien formé peut être faux, une ligne peut ne pas exister, une confiance peut
 * être décorative. Tout ce qui n'est pas vérifiable ou pas assez sûr est
 * écarté, et l'écart est consigné.
 */

/**
 * Sous ce seuil, une classification est ignorée : mieux vaut « inconnu ».
 *
 * Fixé haut à dessein. Sur une ordonnance réelle, le modèle a classé un
 * antitussif sous une substance voisine mais fausse, à 0,6 de confiance : une
 * classification hésitante ne vaut pas mieux qu'une absence, et elle coûte
 * plus cher — elle se lit comme un fait.
 */
export const CLASSIFICATION_MIN_CONFIDENCE = 0.75;

/**
 * Code ATC : une lettre, deux chiffres, puis facultativement une lettre, une
 * lettre, deux chiffres. « J01FA06 » passe ; « J1F » ou « ATC-J01 » non.
 */
const ATC_PATTERN = /^[A-Z]\d{2}(?:[A-Z](?:[A-Z](?:\d{2})?)?)?$/;

function clamp01(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > 1) return null;
  return value;
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export function validateClassification(
  claimed: ClaimedClassification,
  context: { lineCount: number; providerId: string; model: string },
): { result: ClassificationResult; rejected: RejectedUnderstanding[] } {
  const rejected: RejectedUnderstanding[] = [];
  const validLine = (index: unknown): index is number =>
    Number.isInteger(index) && (index as number) >= 0 && (index as number) < context.lineCount;

  const byLine = new Map<number, DrugClassification>();
  for (const item of claimed.medicaments ?? []) {
    const subject = `ligne ${String(item?.ligne)}`;
    if (!validLine(item?.ligne)) {
      rejected.push({ subject, reason: "LIGNE_INEXISTANTE" });
      continue;
    }
    const confidence = clamp01(item.confiance);
    if (confidence === null) {
      rejected.push({ subject, reason: "CONFIANCE_INVALIDE" });
      continue;
    }
    if (confidence < CLASSIFICATION_MIN_CONFIDENCE) {
      rejected.push({ subject, reason: "CLASSIFICATION_PEU_SURE" });
      continue;
    }

    const rawAtc = cleanText(item.code_atc, 8)?.toUpperCase() ?? null;
    let atcCode: string | null = null;
    if (rawAtc) {
      if (ATC_PATTERN.test(rawAtc)) atcCode = rawAtc;
      else rejected.push({ subject, reason: `ATC_MAL_FORME:${rawAtc}` });
    }

    const classification: DrugClassification = {
      lineIndex: item.ligne,
      substance: cleanText(item.substance, 80)?.toUpperCase() ?? null,
      atcCode,
      therapeuticClass: cleanText(item.classe_therapeutique, 120),
      commonSideEffects: [],
      confidence,
      source: "MODEL",
    };

    const existing = byLine.get(item.ligne);
    if (!existing || existing.confidence < confidence) byLine.set(item.ligne, classification);
  }

  return {
    result: {
      drugs: [...byLine.values()].sort((a, b) => a.lineIndex - b.lineIndex),
      providerId: context.providerId,
      model: context.model,
      warnings: rejected.map((r) => `${r.subject} : ${r.reason}`),
      usage: null,
    },
    rejected,
  };
}
