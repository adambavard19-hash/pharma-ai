import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import type { Admin } from "@/server/services/central-advice";
import { classificationKey } from "@/server/services/product-classification";
import { tagsFromName } from "@/core/stock-import/tags";
import { LOW_CONFIDENCE, parseDrugAnswer, parseProductAnswer } from "@/core/knowledge/gaps";
import type { DrugAnswer, GapKind, GapReason } from "@/core/knowledge/gaps";
import { getAIProvider } from "@/server/ai/registry";
import { officialFamilyByName, officialSubstancesByName } from "@/server/services/official-family";
import { officialTherapeuticClass } from "@/core/reference/atc/official-atc";
import type { UnderstandingLine } from "@/core/understanding";

/**
 * « Produits à connaître » : ce que le moteur n'a pas su ranger, et la réponse de la pharmacienne de PharmaBoost.
 *
 * Répondre écrit dans la mémoire commune (`product_classifications` / `drug_classifications`) avec la source « PHARMACIST » : la réponse
 * passe avant le dictionnaire et le modèle, vaut pour TOUTES les pharmacies — celles qui ont déjà le produit comme celles à venir — et le
 * sujet ne revient plus. Le titulaire n'en voit jamais rien.
 */

type Failure = { ok: false; error: string };

export type GapView = {
  id: string;
  kind: GapKind;
  label: string;
  reason: GapReason;
  guess: unknown;
  occurrences: number;
  pharmacies: string[];
  status: "OPEN" | "ANSWERED" | "DISMISSED";
  answer: unknown;
  answeredByName: string | null;
  answeredAt: Date | null;
  createdAt: Date;
};

export async function listGaps(): Promise<{ open: GapView[]; recent: GapView[] }> {
  const [open, recent] = await Promise.all([
    prisma.knowledgeGap.findMany({ where: { status: "OPEN" }, orderBy: [{ occurrences: "desc" }, { createdAt: "asc" }], take: 300 }),
    prisma.knowledgeGap.findMany({ where: { status: { not: "OPEN" } }, orderBy: { answeredAt: "desc" }, take: 30 }),
  ]);
  const ids = [...new Set([...open, ...recent].flatMap((gap) => gap.pharmacyIds))];
  const names = new Map((await prisma.pharmacy.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((pharmacy) => [pharmacy.id, pharmacy.name]));
  const view = (gap: (typeof open)[number]): GapView => ({
    id: gap.id,
    kind: gap.kind as GapKind,
    label: gap.label,
    reason: gap.reason as GapReason,
    guess: gap.guess,
    occurrences: gap.occurrences,
    pharmacies: gap.pharmacyIds.map((id) => names.get(id) ?? "Pharmacie").slice(0, 5),
    status: gap.status as GapView["status"],
    answer: gap.answer,
    answeredByName: gap.answeredByName,
    answeredAt: gap.answeredAt,
    createdAt: gap.createdAt,
  });
  return { open: open.map(view), recent: recent.map(view) };
}

/** Applique la réponse aux produits déjà en stock dans toutes les pharmacies : ils ne restent pas « inconnus » en attendant leur prochain passage. */
async function applyToExistingProducts(key: string, category: string, tags: string[]): Promise<number> {
  const longest = [...key.split(" ")].sort((a, b) => b.length - a.length)[0];
  if (!longest || longest.length < 3) return 0;
  const candidates = await prisma.product.findMany({ where: { deletedAt: null, name: { contains: longest, mode: "insensitive" } }, select: { id: true, name: true }, take: 5000 });
  const matching = candidates.filter((product) => classificationKey(product.name) === key);
  for (const product of matching) {
    await prisma.product.update({
      where: { id: product.id },
      data: { category: category as never, matchingTags: [...new Set([...tags, ...tagsFromName(product.name)])], classifiedAt: new Date(), classificationSource: "PHARMACIST" },
    });
  }
  return matching.length;
}

export async function answerProductGap(admin: Admin, id: string, raw: unknown): Promise<{ ok: true; label: string; applied: number } | Failure> {
  const gap = await prisma.knowledgeGap.findUnique({ where: { id } });
  if (!gap || gap.kind !== "PRODUCT") return { ok: false, error: "Sujet introuvable." };
  if (gap.status !== "OPEN") return { ok: false, error: "Ce sujet est déjà tranché." };
  const parsed = parseProductAnswer(raw);
  if (!parsed.ok) return parsed;
  const { category, tags } = parsed.value;
  await prisma.productClassification.upsert({
    where: { key: gap.key },
    create: { key: gap.key, category, tags, confidence: 1, source: "PHARMACIST", providerId: "pharmacienne" },
    update: { category, tags, confidence: 1, source: "PHARMACIST", providerId: "pharmacienne", model: null },
  });
  const applied = await applyToExistingProducts(gap.key, category, tags);
  await prisma.knowledgeGap.update({ where: { id }, data: { status: "ANSWERED", answer: parsed.value as never, answeredByAdminId: admin.id, answeredByName: admin.fullName, answeredAt: new Date() } });
  await recordAudit({ action: "knowledge.gap_answered", entityType: "KnowledgeGap", entityId: id, platformAdminId: admin.id, metadata: { kind: "PRODUCT", key: gap.key, category, tags, applied } });
  return { ok: true, label: gap.label, applied };
}

export async function answerDrugGap(admin: Admin, id: string, raw: unknown): Promise<{ ok: true; label: string } | Failure> {
  const gap = await prisma.knowledgeGap.findUnique({ where: { id } });
  if (!gap || gap.kind !== "MEDICINE") return { ok: false, error: "Sujet introuvable." };
  if (gap.status !== "OPEN") return { ok: false, error: "Ce sujet est déjà tranché." };
  const parsed = parseDrugAnswer(raw);
  if (!parsed.ok) return parsed;
  const { substance, atcCode, therapeuticClass } = parsed.value;
  await prisma.drugClassification.upsert({
    where: { key: gap.key },
    create: { key: gap.key, substance, atcCode, therapeuticClass, confidence: 1, providerId: "pharmacienne", model: "pharmacienne", validatedAt: new Date() },
    update: { substance, atcCode, therapeuticClass, confidence: 1, providerId: "pharmacienne", model: "pharmacienne", validatedAt: new Date() },
  });
  await prisma.knowledgeGap.update({ where: { id }, data: { status: "ANSWERED", answer: parsed.value as never, answeredByAdminId: admin.id, answeredByName: admin.fullName, answeredAt: new Date() } });
  await recordAudit({ action: "knowledge.gap_answered", entityType: "KnowledgeGap", entityId: id, platformAdminId: admin.id, metadata: { kind: "MEDICINE", key: gap.key, atcCode, therapeuticClass } });
  return { ok: true, label: gap.label };
}

/** « Je ne sais pas » / « sans importance » : le sujet sort de la liste, sans rien apprendre au moteur. Il ne reviendra pas. */
export async function dismissGap(admin: Admin, id: string): Promise<{ ok: true; label: string } | Failure> {
  const gap = await prisma.knowledgeGap.findUnique({ where: { id }, select: { label: true, status: true } });
  if (!gap) return { ok: false, error: "Sujet introuvable." };
  if (gap.status !== "OPEN") return { ok: false, error: "Ce sujet est déjà tranché." };
  await prisma.knowledgeGap.update({ where: { id }, data: { status: "DISMISSED", answeredByAdminId: admin.id, answeredByName: admin.fullName, answeredAt: new Date() } });
  await recordAudit({ action: "knowledge.gap_dismissed", entityType: "KnowledgeGap", entityId: id, platformAdminId: admin.id, metadata: {} });
  return { ok: true, label: gap.label };
}


const AUTO_NAME = "PharmaBoost (classement automatique)";
const MODEL_BATCH = 25;

export type AutoResolution = { open: number; official: number; model: number; left: number };

/**
 * Les médicaments en attente que PharmaBoost sait classer seul (fondateur, 27 oct. 2026 : « Donna ne peut pas tout faire à la
 * main ») : d'abord la famille officielle du catalogue national, par le nom ; puis, pour ce que le catalogue ne classe pas (un
 * médicament non remboursé comme le tadalafil), le modèle, avec les substances officielles sous les yeux et seulement s'il est sûr.
 * Chaque médicament classé entre dans la mémoire commune et sort de la liste ; il ne reste à la pharmacienne que les vrais doutes.
 * Une réponse déjà confirmée par la pharmacienne n'est jamais remplacée.
 */
export async function autoResolveMedicineGaps(options: { useModel?: boolean; limit?: number } = {}): Promise<AutoResolution> {
  const gaps = await prisma.knowledgeGap.findMany({ where: { status: "OPEN", kind: "MEDICINE" }, orderBy: { occurrences: "desc" }, take: options.limit ?? 500, select: { id: true, key: true, label: true } });
  const result: AutoResolution = { open: gaps.length, official: 0, model: 0, left: 0 };
  if (gaps.length === 0) return result;
  const confirmed = new Set((await prisma.drugClassification.findMany({ where: { key: { in: gaps.map((gap) => gap.key) }, validatedAt: { not: null } }, select: { key: true } })).map((row) => row.key));

  const settle = async (gap: (typeof gaps)[number], answer: DrugAnswer & { confidence: number; source: "official" | "model" }) => {
    if (!confirmed.has(gap.key)) {
      const data = { substance: answer.substance, atcCode: answer.atcCode, therapeuticClass: answer.therapeuticClass, confidence: answer.confidence, providerId: answer.source === "official" ? "catalogue-officiel" : "modele", model: answer.source === "official" ? "Open Medic + BDPM" : "modele" };
      await prisma.drugClassification.upsert({ where: { key: gap.key }, create: { key: gap.key, ...data }, update: data });
    }
    const { source, confidence, ...value } = answer;
    // Deux passages en même temps (deux onglets ouverts) : un seul ferme le sujet.
    const closed = await prisma.knowledgeGap.updateMany({ where: { id: gap.id, status: "OPEN" }, data: { status: "ANSWERED", answer: { ...value, origine: source === "official" ? "catalogue officiel" : "modèle", confiance: confidence } as never, answeredByName: AUTO_NAME, answeredAt: new Date() } });
    if (closed.count === 0) return false;
    await recordAudit({ action: "knowledge.gap_answered", entityType: "KnowledgeGap", entityId: gap.id, metadata: { kind: "MEDICINE", key: gap.key, atcCode: answer.atcCode, auto: source } });
    return true;
  };

  const leftovers: typeof gaps = [];
  for (const gap of gaps) {
    const family = await officialFamilyByName(gap.label).catch(() => null);
    if (!family) { leftovers.push(gap); continue; }
    if (await settle(gap, { substance: family.substance, atcCode: family.atcCode, therapeuticClass: family.therapeuticClass, confidence: 1, source: "official" })) result.official += 1;
  }

  if (options.useModel !== false && leftovers.length > 0) {
    const provider = getAIProvider({ demo: false });
    for (let i = 0; i < leftovers.length; i += MODEL_BATCH) {
      const batch = leftovers.slice(i, i + MODEL_BATCH);
      const substances = await Promise.all(batch.map((gap) => officialSubstancesByName(gap.label).catch(() => [] as string[])));
      const lines: UnderstandingLine[] = batch.map((gap, index) => ({ lineIndex: index, drugName: gap.label, dosage: null, form: null, posology: null, durationDays: null, officialName: null, officialSubstances: substances[index], officialCisCode: null }));
      const answer = await provider.classifyDrugs({ lines }).catch((error) => { console.error("[produits à connaître] modèle", error instanceof Error ? error.message : error); return null; });
      if (!answer) break;
      for (const drug of answer.drugs) {
        const gap = batch[drug.lineIndex];
        if (!gap || !drug.atcCode || drug.confidence < LOW_CONFIDENCE) continue;
        if (await settle(gap, { substance: drug.substance, atcCode: drug.atcCode, therapeuticClass: drug.therapeuticClass ?? officialTherapeuticClass(drug.atcCode), confidence: drug.confidence, source: "model" })) result.model += 1;
      }
    }
  }
  result.left = result.open - result.official - result.model;
  return result;
}
