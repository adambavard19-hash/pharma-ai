import { MockOCRProvider } from "./mock-ocr";
import { VisionOCRProvider } from "./ocr-vision";
import type { OCRProvider } from "../ports";

/**
 * Décide qui lit l'ordonnance — et si l'image a le droit de sortir.
 *
 * Fonction pure, testable sans base ni réseau : c'est ici que se joue la
 * garantie juridique du lot. Une ordonnance photographiée est une donnée de
 * santé ; son envoi à un tiers suppose un contrat de sous-traitance et un
 * hébergement adapté.
 *
 * Le choix du fournisseur ne suffit donc PAS. Il faut une autorisation
 * distincte et explicite. Une variable d'environnement recopiée d'un autre
 * projet ne doit jamais suffire à envoyer les ordonnances des patients.
 */

export type OcrConfig = {
  provider: "mock" | "anthropic" | "openai" | "tesseract";
  apiKey?: string;
  model?: string;
  /** Autorisation explicite de transmettre l'image à un tiers. */
  sendImagesExternally?: boolean;
};

export function chooseOCRProvider(config: OcrConfig): OCRProvider {
  if (config.provider === "mock") return new MockOCRProvider();

  if (config.provider === "anthropic") {
    const missing = [
      config.apiKey ? null : "ANTHROPIC_API_KEY",
      config.sendImagesExternally ? null : 'OCR_SEND_IMAGES_EXTERNALLY="true"',
    ].filter(Boolean) as string[];

    if (missing.length > 0) {
      return new MockOCRProvider(
        `Lecture réelle demandée, mais ${missing.join(" et ")} ${
          missing.length > 1 ? "manquent" : "manque"
        } dans la configuration. Aucune image n'est transmise à un tiers.`,
      );
    }

    return new VisionOCRProvider({
      apiKey: config.apiKey as string,
      model: config.model ?? "claude-opus-5",
    });
  }

  // Un fournisseur déclaré mais non implémenté ne dégrade jamais silencieusement
  // vers un résultat inventé : on retombe sur le simulé, qui s'annonce.
  return new MockOCRProvider(
    `Le fournisseur « ${config.provider} » n'est pas implémenté dans Pharma.ai.`,
  );
}
