import type { IslandOutcome, IslandStage, IslandState } from "./banner-flow";

/**
 * L'île de l'écran de vente : la VRAIE vente lue comme la bannière du comptoir. Module pur, testé : à partir de ce que
 * l'écran sait déjà (en saisie, en analyse et à quelle étape, mises en garde, conseils et réponses, vente enregistrée),
 * il dit où en est l'île. Il ne décide rien : l'écran garde ses actions, l'île les reflète.
 */

export type SaleIslandInput = {
  editing: boolean;
  analysing: boolean;
  /** L'étape d'analyse annoncée par le serveur (0 à 3), `null` hors analyse ou si elle n'est pas connue. */
  analysisStep: number | null;
  /** Vente qui se remplit au fil des scans du poste. */
  liveScan: boolean;
  lineCount: number;
  /** Mises en garde non lues (ou blocage), et si la personne l'a déjà fermée dans l'île. */
  warnings: number;
  alertDismissed: boolean;
  /** Les conseils montrés dans l'île et leur réponse. */
  outcomes: IslandOutcome[];
  hasSale: boolean;
  emailStage: "email" | "emailSent" | null;
  emailValue: string;
};

export function saleIslandState(input: SaleIslandInput): IslandState {
  const base = { stepsDone: 0, outcomes: input.outcomes, email: input.emailValue };
  let stage: IslandStage;
  let stepsDone = 0;
  if (input.hasSale) stage = "done";
  else if (input.analysing) {
    stage = "analyzing";
    stepsDone = Math.max(0, Math.min(3, input.analysisStep ?? 0));
  } else if (input.editing) stage = input.liveScan && input.lineCount > 0 ? "scan" : "idle";
  else if (input.emailStage) stage = input.emailStage;
  else if (input.warnings > 0 && !input.alertDismissed) stage = "alert";
  else if (input.outcomes.length > 0) stage = "advice";
  else stage = "quiet";
  return { ...base, stage, stepsDone };
}

/** La réponse d'un conseil, vue par l'île : vendu s'il est dans la délivrance, non vendu s'il a été refusé. */
export function adviceOutcome(status: string, inBasket: boolean): IslandOutcome {
  if (inBasket || status === "ACCEPTED" || status === "PURCHASED") return "SOLD";
  if (status === "DECLINED") return "NOT_SOLD";
  return null;
}
