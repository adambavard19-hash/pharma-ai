import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import type { Admin } from "@/server/services/central-advice";
import { classificationKey } from "@/server/services/product-classification";
import { tagsFromName } from "@/core/stock-import/tags";
import { parseDrugAnswer, parseProductAnswer } from "@/core/knowledge/gaps";
import type { GapKind, GapReason } from "@/core/knowledge/gaps";

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

