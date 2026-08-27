import "server-only";
import { getEnv } from "@/config/env";
import { prisma } from "@/server/db/client";
import type {
  AIProvider,
  DrugKnowledgeProvider,
  MessagingProvider,
  OCRProvider,
  ProviderInfo,
  StorageProvider,
  VideoProvider,
} from "@/core/ai/ports";
import { LocalDrugKnowledgeProvider } from "@/core/ai/providers/local-drug-knowledge";
import { LocalStorageProvider } from "@/core/ai/providers/local-storage";
import { MockOCRProvider } from "@/core/ai/providers/mock-ocr";
import { NotConfiguredMessagingProvider } from "@/core/ai/providers/messaging";
import { RuleBasedAIProvider } from "@/core/ai/providers/rule-based-ai";
import { UnavailableVideoProvider } from "@/core/ai/providers/video";
import type { DrugKnowledge } from "@/core/ai/types";

/**
 * Registre des fournisseurs.
 *
 * Unique endroit où l'on décide QUEL adaptateur est utilisé. Le moteur métier
 * (`src/core/ai/`) ne connaît que les interfaces ; brancher un modèle, un OCR
 * dédié ou la BDPM consiste à ajouter un `case` ici et un fichier dans
 * `src/core/ai/providers/`.
 *
 * Aucune clé d'API ne transite hors de ce module côté serveur.
 */

let drugProvider: LocalDrugKnowledgeProvider | null = null;

export function getOCRProvider(): OCRProvider {
  const { OCR_PROVIDER } = getEnv();
  switch (OCR_PROVIDER) {
    case "mock":
      return new MockOCRProvider();
    default:
      // Un fournisseur déclaré mais non implémenté ne doit jamais dégrader
      // silencieusement vers un résultat inventé : on retombe sur le simulé,
      // qui s'annonce comme tel.
      console.warn(
        `[registry] Fournisseur OCR « ${OCR_PROVIDER} » non implémenté. Repli sur l'OCR simulé.`,
      );
      return new MockOCRProvider();
  }
}

export function getAIProvider(): AIProvider {
  const { AI_PROVIDER } = getEnv();
  switch (AI_PROVIDER) {
    case "mock":
      return new RuleBasedAIProvider();
    default:
      console.warn(
        `[registry] Fournisseur IA « ${AI_PROVIDER} » non implémenté. Repli sur la reformulation déterministe.`,
      );
      return new RuleBasedAIProvider();
  }
}

export function getDrugKnowledgeProvider(): DrugKnowledgeProvider {
  if (drugProvider) return drugProvider;

  drugProvider = new LocalDrugKnowledgeProvider(async () => {
    const records = await prisma.drugReference.findMany();
    return records.map(
      (record): DrugKnowledge => ({
        id: record.id,
        name: record.name,
        inn: record.inn,
        atcCode: record.atcCode,
        therapeuticClass: record.therapeuticClass,
        form: record.form,
        commonSideEffects: record.commonSideEffects,
        interactionClasses: record.interactionClasses,
        cautionPopulations: record.cautionPopulations,
        patientExplanation: record.patientExplanation,
        intakeAdvice: record.intakeAdvice,
        sourceName: record.sourceName,
        sourceVersion: record.sourceVersion,
        isDemoData: record.isDemoData,
      }),
    );
  });

  return drugProvider;
}

export function invalidateDrugKnowledgeCache(): void {
  drugProvider?.invalidate();
}

export function getStorageProvider(): StorageProvider {
  const env = getEnv();
  return new LocalStorageProvider(env.STORAGE_LOCAL_PATH);
}

export function getMessagingProvider(): MessagingProvider {
  // Aucun fournisseur réel n'est branché dans le MVP : voir `.env.example`.
  return new NotConfiguredMessagingProvider();
}

export function getVideoProvider(): VideoProvider {
  return new UnavailableVideoProvider();
}

export type ProviderSnapshot = {
  ocr: ProviderInfo;
  ai: ProviderInfo;
  knowledge: ProviderInfo;
  storage: ProviderInfo;
  messaging: ProviderInfo;
  video: ProviderInfo;
  /** `true` dès qu'un maillon de la chaîne est simulé. */
  anySimulated: boolean;
};

/** État des fournisseurs, affiché dans Paramètres → Moteur Pharma.ai. */
export function getProviderSnapshot(): ProviderSnapshot {
  const infos = {
    ocr: getOCRProvider().info,
    ai: getAIProvider().info,
    knowledge: getDrugKnowledgeProvider().info,
    storage: getStorageProvider().info,
    messaging: getMessagingProvider().info,
    video: getVideoProvider().info,
  };

  return {
    ...infos,
    anySimulated: Object.values(infos).some((i) => i.capability === "SIMULATED"),
  };
}
