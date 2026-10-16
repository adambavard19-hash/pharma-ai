import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/server/db/client";
import { getEnv } from "@/config/env";
import { getAIProvider } from "@/server/ai/registry";
import type { TenantScope } from "@/server/db/tenant";
import type { PatientCard, PatientCardRequest } from "@/core/ai/patient-card";
import { validatePatientCard } from "@/core/ai/patient-card";
import { AnthropicPatientCardWriter } from "@/core/ai/providers/anthropic-patient-card";

/**
 * Les fiches patient des produits conseillés, pour le bilan e-mail (17 oct. 2026) : une fiche déjà rédigée pour ce produit et ce
 * médicament est reprise telle quelle ; sinon le modèle la rédige (en parallèle des notices officielles, dans le même délai), elle
 * passe le validateur, et elle est gardée pour les ventes suivantes. Sans fournisseur autorisé, pour la démonstration, ou en cas
 * d'échec : pas de fiche, et le bilan part avec ce que la pharmacie sait déjà.
 */

const OPERATION = "patient.report_card";

export type CardTarget = { request: PatientCardRequest; forbidden: string[]; ean: string | null };

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** La clé d'une fiche : le produit (code-barres, sinon nom) et le médicament qui l'a appelé (son nom de boîte, sans la forme). */
export function cardKey(target: CardTarget): string {
  const product = target.ean?.replace(/\D/g, "") || fold(target.request.product.name);
  const drug = fold(target.request.treatment.drug.replace(/,[\s\S]*$/, ""));
  return createHash("sha256").update(`v1|${product}|${drug}`).digest("hex");
}

function getWriter(): AnthropicPatientCardWriter | null {
  const ai = getAIProvider();
  if (ai.info.capability !== "LIVE" || !ai.info.id.startsWith("anthropic:")) return null;
  const apiKey = getEnv().ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new AnthropicPatientCardWriter({ apiKey, model: ai.info.id.slice("anthropic:".length) });
}

/** Les fiches de produits vendus, dans l'ordre (`null` quand il n'y en a pas). Ne lève jamais : un bilan part toujours. */
export async function patientCardsFor(scope: Pick<TenantScope, "organizationId" | "pharmacyId">, targets: CardTarget[], options: { demo?: boolean; timeoutMs?: number } = {}): Promise<(PatientCard | null)[]> {
  if (targets.length === 0) return [];
  const keys = targets.map(cardKey);
  const cached = new Map<string, PatientCard>();
  try {
    const rows = await prisma.patientCardCache.findMany({ where: { key: { in: keys } }, select: { key: true, content: true } });
    for (const row of rows) {
      // Une fiche gardée repasse le validateur avec le traitement de CETTE vente : jamais un nom de médicament qui aurait glissé.
      const index = keys.indexOf(row.key);
      const { card } = validatePatientCard(row.content, { productName: targets[index].request.product.name, forbidden: targets[index].forbidden });
      if (card) cached.set(row.key, card);
    }
  } catch {
    // Le cache est un plus.
  }
  const writer = options.demo ? null : getWriter();
  const work = targets.map(async (target, index): Promise<PatientCard | null> => {
    const key = keys[index];
    if (cached.has(key)) return cached.get(key)!;
    if (!writer) return null;
    const startedAt = Date.now();
    try {
      const result = await writer.write(target.request, target.forbidden);
      await prisma.aiUsageRecord.create({ data: { organizationId: scope.organizationId, pharmacyId: scope.pharmacyId, operation: OPERATION, provider: result.providerId, model: result.providerId.replace(/^anthropic:/, ""), inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, durationMs: result.usage.durationMs, succeeded: result.card !== null } }).catch(() => undefined);
      if (!result.card) {
        console.warn(`[bilan] fiche refusée pour « ${target.request.product.name} » : ${result.problems.join(", ")}`);
        return null;
      }
      await prisma.patientCardCache.upsert({ where: { key }, create: { key, content: result.card as never, providerId: result.providerId }, update: { content: result.card as never, providerId: result.providerId } }).catch(() => undefined);
      return result.card;
    } catch (error) {
      console.warn(`[bilan] fiche impossible pour « ${target.request.product.name} » (${Date.now() - startedAt} ms) : ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  });
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), options.timeoutMs ?? 20_000));
  return Promise.all(work.map((job) => Promise.race([job, timeout])));
}
