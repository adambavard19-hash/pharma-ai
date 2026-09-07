import type { AnalysisStage } from "@/server/services/analysis";

/**
 * Lit le flux d'analyse et rapporte chaque étape réelle à l'écran.
 *
 * Aucune temporisation, aucune étape simulée : ce qui s'affiche est ce que le
 * serveur vient de commencer.
 */
export type AnalysisStreamResult =
  | { ok: true; analysisRunId: string; recommendationCount: number; durationMs: number }
  | { ok: false; error: string };

export async function streamAnalysis(
  prescriptionId: string,
  onStage: (stage: AnalysisStage) => void,
): Promise<AnalysisStreamResult> {
  let response: Response;
  try {
    response = await fetch(`/api/ordonnances/${prescriptionId}/analyse`, { method: "POST" });
  } catch {
    return { ok: false, error: "Le serveur ne répond pas. Vérifiez votre connexion." };
  }
  if (!response.ok || !response.body) {
    return { ok: false, error: `Analyse refusée (${response.status}).` };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let outcome: AnalysisStreamResult = { ok: false, error: "L'analyse s'est interrompue." };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separator = buffer.indexOf("\n\n");
    while (separator !== -1) {
      const chunk = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      const line = chunk.split("\n").find((part) => part.startsWith("data: "));
      if (line) {
        const event = JSON.parse(line.slice(6)) as
          | { type: "stage"; stage: AnalysisStage }
          | { type: "done"; analysisRunId: string; recommendationCount: number; durationMs: number }
          | { type: "error"; message: string };
        if (event.type === "stage") onStage(event.stage);
        else if (event.type === "done") outcome = { ok: true, ...event };
        else outcome = { ok: false, error: event.message };
      }
      separator = buffer.indexOf("\n\n");
    }
  }

  return outcome;
}

/** Ce que le pharmacien lit pendant chaque étape. */
export const STAGE_LABELS: Record<AnalysisStage, string> = {
  IDENTIFICATION: "Médicaments identifiés…",
  UNDERSTANDING: "Compréhension du traitement…",
  ENGINE: "Recherche des conseils disponibles…",
  PERSIST: "Enregistrement…",
};

export const STAGE_ORDER: AnalysisStage[] = ["IDENTIFICATION", "UNDERSTANDING", "ENGINE", "PERSIST"];
