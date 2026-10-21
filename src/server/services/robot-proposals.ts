import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import type { ProductCategoryCode } from "@/core/ai/types";
import type { RuleFeedback } from "@/core/ai/rule-feedback";
import { ROBOT_NEED_LABELS, robotCentralDraft, robotRuleKey, type RobotProposalFacts } from "@/core/ai/robot-suggestion";
import { addCentralAssociation, addCustomRule, decideCentralAssociation, decideRule, loadRuleFeedback, type Admin } from "./central-advice";

/**
 * Les propositions nées des suggestions du robot — la console de la pharmacienne de PharmaBoost (« Suggestions du robot »).
 *
 * Chaque produit que le robot a proposé pour un médicament arrive ici, une fois, quel que soit le nombre de pharmacies.
 * « Valider pour toutes les pharmacies » le transforme en conseil central (ou en association commune) ; « Refuser » l'écarte
 * pour toujours : le robot ne le propose plus jamais pour ce médicament, et les cartes déjà affichées se taisent.
 */

type Failure = { ok: false; error: string };

export type RobotProposalView = {
  id: string;
  status: "PENDING" | "VALIDATED" | "REFUSED";
  drugLabel: string;
  atcCode: string | null;
  substance: string | null;
  productName: string;
  productBrand: string | null;
  categoryLabel: string;
  productTags: string[];
  needLabel: string;
  reason: string;
  /** La phrase de comptoir, le nom du produit écrit à la place de {product}. */
  script: string;
  pharmacies: string[];
  occurrences: number;
  /** Modifiée dans la console : un autre produit conseil a pris sa place (le produit du robot ne revient plus). */
  replaced: boolean;
  /** Ce qu'elle deviendra (ou est devenue) pour toutes les pharmacies. */
  central: { kind: "CUSTOM_RULE" | "ASSOCIATION" | "MANUAL"; summary: string };
  decidedBy: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  /** Ce que les comptoirs en ont fait (proposée, retenue, achetée). Vide : pas encore tranchée au comptoir. */
  feedback: RuleFeedback | null;
};

type Row = Awaited<ReturnType<typeof prisma.robotRuleProposal.findMany>>[number];

const factsOf = (row: Row): RobotProposalFacts => ({
  drugLabel: row.drugLabel,
  atcCode: row.atcCode,
  substance: row.substance,
  productName: row.productName,
  productEan: row.productEan,
  productCategory: row.productCategory as ProductCategoryCode,
  productTags: row.productTags,
  need: row.need,
  reason: row.reason,
  counterScript: row.counterScript,
});

export async function listRobotProposals(): Promise<{ pending: RobotProposalView[]; recent: RobotProposalView[] }> {
  const [pending, recent] = await Promise.all([
    prisma.robotRuleProposal.findMany({ where: { status: "PENDING" }, orderBy: [{ occurrences: "desc" }, { createdAt: "asc" }], take: 200 }),
    prisma.robotRuleProposal.findMany({ where: { status: { not: "PENDING" } }, orderBy: { decidedAt: "desc" }, take: 30 }),
  ]);
  const pharmacyIds = [...new Set(pending.flatMap((row) => row.pharmacyIds))];
  const [pharmacies, feedback] = await Promise.all([
    pharmacyIds.length > 0 ? prisma.pharmacy.findMany({ where: { id: { in: pharmacyIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    pending.length + recent.length > 0 ? loadRuleFeedback().catch(() => new Map<string, RuleFeedback>()) : Promise.resolve(new Map<string, RuleFeedback>()),
  ]);
  const names = new Map(pharmacies.map((pharmacy) => [pharmacy.id, pharmacy.name]));
  const view = (row: Row): RobotProposalView => {
    const draft = robotCentralDraft(factsOf(row));
    return {
      id: row.id,
      status: row.status,
      drugLabel: row.drugLabel,
      atcCode: row.atcCode,
      substance: row.substance,
      productName: row.productName,
      productBrand: row.productBrand,
      categoryLabel: PRODUCT_CATEGORY_LABELS[row.productCategory as ProductCategoryCode] ?? row.productCategory,
      productTags: row.productTags,
      needLabel: ROBOT_NEED_LABELS[row.need] ?? row.need,
      reason: row.reason,
      script: row.counterScript.replaceAll("{product}", row.productName.replace(/,.*$/, "").trim()).replaceAll("{drug}", row.drugLabel.replace(/,.*$/, "").trim()),
      pharmacies: row.pharmacyIds.map((id) => names.get(id)).filter((name): name is string => Boolean(name)),
      occurrences: row.occurrences,
      replaced: row.status === "REFUSED" && row.centralKind === "ASSOCIATION",
      central: row.status === "VALIDATED" && row.centralKind ? { kind: row.centralKind as "CUSTOM_RULE" | "ASSOCIATION", summary: draft.summary } : { kind: draft.kind, summary: draft.summary },
      decidedBy: row.decidedByName,
      decidedAt: row.decidedAt,
      createdAt: row.createdAt,
      feedback: feedback.get(robotRuleKey(row.id)) ?? null,
    };
  };
  return { pending: pending.map(view), recent: recent.map(view) };
}

/**
 * Valide une proposition pour toutes les pharmacies : elle devient un conseil ajouté (validé, signé par la pharmacienne) ou
 * une association commune validée. La proposition est réservée AVANT d'écrire la règle : deux clics ne font pas deux règles.
 */
export async function validateRobotProposal(admin: Admin, id: string): Promise<{ ok: true; label: string; summary: string } | Failure> {
  const row = await prisma.robotRuleProposal.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "Proposition introuvable." };
  if (row.status !== "PENDING") return { ok: false, error: "Cette proposition a déjà été tranchée." };
  const draft = robotCentralDraft(factsOf(row));
  if (draft.kind === "MANUAL") return { ok: false, error: draft.summary };

  const won = await prisma.robotRuleProposal.updateMany({ where: { id, status: "PENDING" }, data: { status: "VALIDATED", decidedAt: new Date(), decidedByAdminId: admin.id, decidedByName: admin.fullName } });
  if (won.count === 0) return { ok: false, error: "Cette proposition a déjà été tranchée." };
  const release = () => prisma.robotRuleProposal.update({ where: { id }, data: { status: "PENDING", decidedAt: null, decidedByAdminId: null, decidedByName: null } });

  let centralRef: string;
  if (draft.kind === "CUSTOM_RULE") {
    const created = await addCustomRule(admin, draft.definition);
    if (!created.ok) {
      await release();
      return { ok: false, error: created.error };
    }
    await decideRule(admin, created.ruleKey, "VALIDATE");
    centralRef = created.ruleKey;
  } else {
    const created = await addCentralAssociation(admin, { trigger: { kind: "MEDICINE", name: draft.trigger }, advice: { ean: draft.ean, name: row.productName }, sentence: draft.sentence });
    if (!created.ok) {
      await release();
      return { ok: false, error: created.error };
    }
    await decideCentralAssociation(admin, created.id, "VALIDATE");
    centralRef = `association:${created.id}`;
  }
  await prisma.robotRuleProposal.update({ where: { id }, data: { centralKind: draft.kind, centralRef } });
  await recordAudit({ action: "knowledge.proposal_decided", entityType: "RobotRuleProposal", entityId: id, platformAdminId: admin.id, metadata: { decision: "VALIDATE", drugKey: row.drugKey, productKey: row.productKey, central: draft.kind, centralRef } });
  return { ok: true, label: `${row.drugLabel.replace(/,.*$/, "").trim()} → ${row.productName}`, summary: draft.summary };
}

/**
 * « Modifier » (fondateur, 21 oct. 2026) : on garde la base du robot — le médicament, la phrase du comptoir — mais avec un AUTRE
 * produit conseil. Le produit du robot est écarté pour ce médicament (il ne revient plus) et le produit choisi devient une
 * association commune validée, pour toutes les pharmacies. Réservée avant d'écrire : deux clics ne font pas deux associations.
 */
export async function modifyRobotProposal(admin: Admin, id: string, input: { product: { ean: string; name: string }; sentence: string | null }): Promise<{ ok: true; label: string } | Failure> {
  const ean = input.product.ean.replace(/\D/g, "");
  const name = input.product.name.trim();
  if (!/^\d{7,14}$/.test(ean) || !name) return { ok: false, error: "Choisissez le produit à proposer." };
  const row = await prisma.robotRuleProposal.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "Proposition introuvable." };
  if (row.status !== "PENDING") return { ok: false, error: "Cette proposition a déjà été tranchée." };
  const drugShort = row.drugLabel.replace(/,.*$/, "").trim();
  const sentence = (input.sentence?.trim() || row.counterScript.replaceAll("{product}", name.replace(/,.*$/, "").trim()).replaceAll("{drug}", drugShort)).slice(0, 280);

  const won = await prisma.robotRuleProposal.updateMany({ where: { id, status: "PENDING" }, data: { status: "REFUSED", decidedAt: new Date(), decidedByAdminId: admin.id, decidedByName: admin.fullName } });
  if (won.count === 0) return { ok: false, error: "Cette proposition a déjà été tranchée." };
  const created = await addCentralAssociation(admin, { trigger: { kind: "MEDICINE", name: row.drugLabel }, advice: { ean, name }, sentence });
  if (!created.ok) {
    await prisma.robotRuleProposal.update({ where: { id }, data: { status: "PENDING", decidedAt: null, decidedByAdminId: null, decidedByName: null } });
    return { ok: false, error: created.error };
  }
  await decideCentralAssociation(admin, created.id, "VALIDATE");
  const centralRef = `association:${created.id}`;
  await prisma.robotRuleProposal.update({ where: { id }, data: { centralKind: "ASSOCIATION", centralRef } });
  await recordAudit({ action: "knowledge.proposal_decided", entityType: "RobotRuleProposal", entityId: id, platformAdminId: admin.id, metadata: { decision: "MODIFY", drugKey: row.drugKey, productKey: row.productKey, central: "ASSOCIATION", centralRef, ean } });
  return { ok: true, label: `${drugShort} → ${name}` };
}

/** Refuse une proposition : ce produit n'est plus jamais suggéré pour ce médicament, dans aucune pharmacie. */
export async function refuseRobotProposal(admin: Admin, id: string): Promise<{ ok: true; label: string } | Failure> {
  const row = await prisma.robotRuleProposal.findUnique({ where: { id }, select: { drugLabel: true, productName: true, drugKey: true, productKey: true } });
  if (!row) return { ok: false, error: "Proposition introuvable." };
  const won = await prisma.robotRuleProposal.updateMany({ where: { id, status: "PENDING" }, data: { status: "REFUSED", decidedAt: new Date(), decidedByAdminId: admin.id, decidedByName: admin.fullName } });
  if (won.count === 0) return { ok: false, error: "Cette proposition a déjà été tranchée." };
  await recordAudit({ action: "knowledge.proposal_decided", entityType: "RobotRuleProposal", entityId: id, platformAdminId: admin.id, metadata: { decision: "REFUSE", drugKey: row.drugKey, productKey: row.productKey } });
  return { ok: true, label: `${row.drugLabel.replace(/,.*$/, "").trim()} → ${row.productName}` };
}

export async function countPendingRobotProposals(): Promise<number> {
  return prisma.robotRuleProposal.count({ where: { status: "PENDING" } });
}
