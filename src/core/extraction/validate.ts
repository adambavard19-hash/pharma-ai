import { REJECTION_LABELS } from "./types";
import type {
  ClaimedField,
  ClaimedLine,
  ClaimedPrescription,
  RejectedField,
  RejectionReason,
} from "./types";
import type { ExtractedField, ExtractedPrescription } from "../ai/types";

/**
 * Le filtre entre le modèle de vision et la base de données.
 *
 * Fonction pure : aucun réseau, aucune base. Elle prend ce que le modèle
 * prétend avoir lu et n'en laisse passer que ce qui est justifié.
 *
 * Trois règles, dans cet ordre :
 *
 * 1. **Pas de citation, pas de valeur.** Un champ dont le modèle ne peut pas
 *    citer le texte sur l'image est écarté. C'est la règle qui empêche une
 *    posologie plausible de se glisser dans une ordonnance.
 * 2. **Un nombre doit se lire dans sa citation.** Une durée « 7 » dont la
 *    citation ne contient aucun chiffre est écartée.
 * 3. **La confiance annoncée n'est jamais crue sur parole.** Hors de
 *    l'intervalle 0 → 1, elle est traitée comme absente, donc nulle.
 *
 * Ce qui est écarté n'est jamais silencieux : chaque rejet est journalisé avec
 * son motif, et la ligne reste présente — un médicament illisible doit
 * apparaître à l'écran pour être relu, pas disparaître.
 */

/** En dessous, la valeur est conservée mais la relecture humaine s'impose. */
export const VISION_REVIEW_THRESHOLD = 0.85;

type FieldOutcome<T> = {
  field: ExtractedField<T>;
  rejection: RejectionReason | null;
};

function clampConfidence(raw: number | null): { value: number; invalid: boolean } {
  if (raw === null || Number.isNaN(raw)) return { value: 0, invalid: true };
  if (raw < 0 || raw > 1) return { value: 0, invalid: true };
  return { value: raw, invalid: false };
}

function unreadable<T>(): ExtractedField<T> {
  return { value: null, confidence: 0, unreadable: true };
}

/**
 * Le cas général : une valeur textuelle.
 *
 * La citation n'est pas comparée à la valeur — un modèle a le droit de
 * normaliser « 1 cp x3/j » en « 1 comprimé 3 fois par jour ». Ce qu'on exige,
 * c'est qu'il DÉSIGNE l'endroit de l'image d'où vient l'information.
 */
function acceptText(claim: ClaimedField | undefined): FieldOutcome<string> {
  if (!claim) return { field: unreadable(), rejection: "VALEUR_ABSENTE" };

  const value = claim.valeur?.trim() || null;
  const quote = claim.lu_tel_quel?.trim() || null;

  if (value === null) return { field: unreadable(), rejection: null };
  if (claim.lu_tel_quel === null || claim.lu_tel_quel === undefined) {
    return { field: unreadable(), rejection: "AUCUNE_CITATION" };
  }
  if (quote === null) return { field: unreadable(), rejection: "CITATION_VIDE" };

  const { value: confidence, invalid } = clampConfidence(claim.confiance ?? null);
  if (invalid) return { field: unreadable(), rejection: "CONFIANCE_INVALIDE" };

  return { field: { value, confidence, unreadable: false }, rejection: null };
}

/**
 * Un nombre exige davantage : le chiffre doit se retrouver dans la citation.
 *
 * Sans cette vérification, « 7 jours » pourrait naître d'une durée habituelle
 * plutôt que d'une lecture — l'erreur la plus difficile à repérer au comptoir,
 * parce qu'elle est vraisemblable.
 */
function acceptNumber(claim: ClaimedField | undefined): FieldOutcome<number> {
  const text = acceptText(claim);
  if (!text.field.value) {
    return { field: unreadable(), rejection: text.rejection };
  }

  const parsed = Number.parseInt(text.field.value.replace(/[^\d-]/g, ""), 10);
  const quoteHasDigit = /\d/.test(claim?.lu_tel_quel ?? "");

  if (Number.isNaN(parsed) || !quoteHasDigit) {
    return { field: unreadable(), rejection: "NOMBRE_ILLISIBLE" };
  }

  return {
    field: { value: parsed, confidence: text.field.confidence, unreadable: false },
    rejection: null,
  };
}

export type VisionValidationResult = {
  extraction: ExtractedPrescription;
  rejected: RejectedField[];
};

export function validateVisionExtraction(
  claimed: ClaimedPrescription,
  options: { providerId: string; model: string },
): VisionValidationResult {
  const rejected: RejectedField[] = [];

  const header = (name: string, claim: ClaimedField | undefined) => {
    const outcome = acceptText(claim);
    if (outcome.rejection) {
      rejected.push({
        lineIndex: null,
        field: name,
        reason: outcome.rejection,
        claimed: claim?.valeur ?? null,
      });
    }
    return outcome.field;
  };

  const prescriberName = header("prescripteur", claimed.prescripteur);
  const prescriberRpps = header("rpps", claimed.rpps);
  const prescribedAt = header("date_prescription", claimed.date_prescription);
  const patientName = header("patient", claimed.patient);

  const lines = (claimed.lignes ?? []).map((line: ClaimedLine, index) => {
    const take = <T,>(name: string, outcome: FieldOutcome<T>) => {
      if (outcome.rejection) {
        rejected.push({
          lineIndex: index,
          field: name,
          reason: outcome.rejection,
          claimed:
            (line as unknown as Record<string, ClaimedField | undefined>)[name]?.valeur ??
            null,
        });
      }
      return outcome.field;
    };

    // Le texte brut de la ligne est la réunion des citations : c'est ce que le
    // pharmacien relit quand un champ a été écarté. Il n'est jamais reformulé.
    const rawText =
      [
        line.medicament?.lu_tel_quel,
        line.dosage?.lu_tel_quel,
        line.posologie?.lu_tel_quel,
        line.duree_jours?.lu_tel_quel,
      ]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(" ") || null;

    return {
      position: index,
      rawText,
      drugName: take("medicament", acceptText(line.medicament)),
      dosage: take("dosage", acceptText(line.dosage)),
      form: take("forme", acceptText(line.forme)),
      posology: take("posologie", acceptText(line.posologie)),
      durationDays: take("duree_jours", acceptNumber(line.duree_jours)),
      quantity: take("quantite", acceptNumber(line.quantite)),
      instructions: take("instructions", acceptText(line.instructions)),
    };
  });

  // La confiance globale ne moyenne QUE ce qui a survécu au filtre : intégrer
  // les champs écartés à 0 ferait chuter le chiffre pour des zones simplement
  // absentes de l'ordonnance, et le rendrait illisible.
  const kept = lines.flatMap((line) =>
    [line.drugName, line.dosage, line.posology, line.durationDays].filter(
      (field) => !field.unreadable,
    ),
  );
  const overallConfidence =
    kept.length === 0
      ? 0
      : Math.round((kept.reduce((sum, f) => sum + f.confidence, 0) / kept.length) * 100) /
        100;

  const warnings: string[] = [];
  if (rejected.length > 0) {
    // Un compte, puis le détail : au comptoir on veut le nombre, à l'audit le motif.
    warnings.push(
      `${rejected.length} champ(s) écarté(s) faute de justification sur l'image — ils apparaissent vides et à relire.`,
    );
    const reasons = new Set(rejected.map((r) => r.reason));
    for (const reason of reasons) {
      warnings.push(`· ${REJECTION_LABELS[reason]}`);
    }
  }
  if (lines.length === 0) {
    warnings.push("Aucune ligne n'a pu être lue sur cette image.");
  }

  return {
    extraction: {
      prescriberName,
      prescriberRpps,
      prescribedAt,
      patientName,
      lines,
      overallConfidence,
      providerId: options.providerId,
      // Une extraction réelle n'est jamais simulée — c'est précisément ce que
      // ce lot apporte, et l'écran doit cesser d'afficher le bandeau de
      // démonstration pour cette ordonnance.
      isSimulated: false,
      warnings,
    },
    rejected,
  };
}
