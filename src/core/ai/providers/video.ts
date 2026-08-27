import type { ProviderInfo, VideoGenerationRequest, VideoGenerationResult, VideoProvider } from "../ports";

/**
 * Module vidéo — ARCHITECTURE PRÉPARÉE, MOTEUR NON DÉVELOPPÉ.
 *
 * Le port `VideoProvider` existe pour qu'un moteur de génération puisse être
 * branché plus tard sans toucher au reste du produit. Aucun rendu n'est
 * effectué aujourd'hui : l'interface affiche « Vidéo personnalisée — bientôt
 * disponible » et le statut renvoyé est explicitement `NOT_CONFIGURED`.
 */
export class UnavailableVideoProvider implements VideoProvider {
  readonly info: ProviderInfo = {
    id: "none",
    label: "Génération vidéo non configurée",
    capability: "SIMULATED",
    description:
      "Le port est prêt ; aucun moteur de génération vidéo n'est branché. Aucune vidéo n'est produite.",
  };

  async generate(request: VideoGenerationRequest): Promise<VideoGenerationResult> {
    return {
      status: "NOT_CONFIGURED",
      videoUrl: null,
      message: `Vidéo personnalisée — bientôt disponible. Aucun moteur de génération n'est actuellement branché (document ${request.documentId}).`,
    };
  }
}
