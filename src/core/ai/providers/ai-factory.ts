import type { AIProvider } from "../ports";
import { AnthropicAIProvider } from "./anthropic-ai";
import { RuleBasedAIProvider } from "./rule-based-ai";

/**
 * Le choix du fournisseur d'intelligence, testable sans base ni réseau.
 *
 * Trois conditions, délibérément distinctes, pour qu'un modèle externe voie
 * une ordonnance : l'avoir choisi, disposer d'une clé, et avoir autorisé la
 * transmission de données d'ordonnance à un tiers. La même autorisation que
 * pour l'image : le texte d'une ordonnance est la même donnée de santé sous
 * une autre forme. Tant qu'une condition manque, le fournisseur déterministe
 * prend le relais et l'application le dit.
 */
export function chooseAIProvider(config: {
  provider: "mock" | "anthropic" | "openai";
  apiKey?: string | null;
  model?: string | null;
  sendExternally: boolean;
}): AIProvider {
  if (config.provider === "anthropic") {
    if (!config.apiKey) {
      return withReason(
        new RuleBasedAIProvider(),
        "AI_PROVIDER vaut « anthropic » mais ANTHROPIC_API_KEY est vide.",
      );
    }
    if (!config.sendExternally) {
      return withReason(
        new RuleBasedAIProvider(),
        "AI_PROVIDER vaut « anthropic » mais OCR_SEND_IMAGES_EXTERNALLY ne vaut pas « true » : aucune donnée d'ordonnance ne quitte l'officine.",
      );
    }
    return new AnthropicAIProvider({
      apiKey: config.apiKey,
      model: config.model || "claude-opus-5",
    });
  }

  if (config.provider === "openai") {
    return withReason(
      new RuleBasedAIProvider(),
      "Le fournisseur « openai » n'est pas implémenté.",
    );
  }

  return new RuleBasedAIProvider();
}

function withReason(provider: RuleBasedAIProvider, reason: string): RuleBasedAIProvider {
  return Object.assign(provider, {
    info: { ...provider.info, description: `${reason} ${provider.info.description}` },
  });
}
