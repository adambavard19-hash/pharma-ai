import "server-only";
import { prisma } from "@/server/db/client";
import type { Prisma } from "@/generated/prisma";
import { formatPriceEuros } from "@/core/pricing/official-offer";
import { planProgressiveSync, rankActivations, rankLabel, rateForRank, type BonusTier, type PlanActivation } from "@/core/sales/progressive-commission";
import { recordProspectEvent, type SalesActor } from "./events";
import { notifyAdmins, notifySalesRep } from "./notifications";

/**
 * La grille progressive appliquée aux vraies données d'un commercial.
 *
 * « Pharmacie activée » : la PREMIÈRE activation d'un dossier, posée une fois
 * pour toutes sur le dossier (`activatedAt`) avec le commercial qui le suivait
 * à cet instant (`activationSalesRepId`). Elle reste acquise à ce commercial :
 * un dossier perdu, une officine résiliée ou une réaffectation ensuite ne font
 * ni baisser son total historique, ni bouger un rang, un montant ou un bonus.
 * Le rang suit l'ordre d'activation (puis l'identifiant à date égale).
 */

type Db = Prisma.TransactionClient | typeof prisma;

const SYSTEM: SalesActor = { type: "SYSTEM", label: "Grille progressive" };

/**
 * Pose la PREMIÈRE activation d'un dossier, une seule fois : l'instant et le
 * commercial qui le suit à ce moment-là. Sans effet si elle est déjà posée
 * (dossier réactivé, deux chemins d'activation l'un après l'autre).
 * L'écriture est conditionnée au commercial relu : une réaffectation glissée
 * entre la lecture et l'écriture fait relire, jamais créditer le mauvais.
 * À appeler dans la même transaction que le passage au statut « Activé ».
 */
export async function stampActivation(prospectId: string, db: Db = prisma, at: Date = new Date()): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await db.prospect.findUnique({ where: { id: prospectId }, select: { activatedAt: true, salesRepId: true } });
    if (!current || current.activatedAt) return false;
    const written = await db.prospect.updateMany({ where: { id: prospectId, activatedAt: null, salesRepId: current.salesRepId }, data: { activatedAt: at, activationSalesRepId: current.salesRepId } });
    if (written.count === 1) return true;
  }
  return false;
}

/**
 * Passe un dossier au statut « Activé » et pose sa première activation, d'un
 * seul bloc : un recalcul ne peut jamais voir l'un sans l'autre.
 */
export async function markProspectActivated(prospectId: string, data: Prisma.ProspectUpdateInput = {}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.prospect.update({ where: { id: prospectId }, data: { ...data, status: "ACTIVATED" } });
    await stampActivation(prospectId, tx);
  });
}

export type ActivatedPharmacy = PlanActivation & { rank: number; name: string; organizationId: string | null };

/** Les pharmacies activées créditées à un commercial, dans l'ordre d'activation (rang 1, 2…). */
export async function activatedPharmaciesOf(salesRepId: string, db: Db = prisma): Promise<ActivatedPharmacy[]> {
  const rows = await db.prospect.findMany({ where: { activationSalesRepId: salesRepId, activatedAt: { not: null } }, select: { id: true, name: true, activatedAt: true, pharmacy: { select: { organizationId: true } } } });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return rankActivations(rows.map((row) => ({ prospectId: row.id, at: row.activatedAt! }))).map((ranked) => {
    const row = byId.get(ranked.prospectId)!;
    return { ...ranked, name: row.name, organizationId: row.pharmacy?.organizationId ?? null };
  });
}

/** Ce qui compte comme un paiement reçu : le même critère pour le recalcul et pour le webhook qui le déclenche. */
export const FIRST_PAYMENT = { status: "PAID", paidAt: { not: null }, amountCents: { gt: 0 } } satisfies Prisma.BillingPaymentWhereInput;

/**
 * Les dossiers dont l'officine a fait son PREMIER paiement : une facture
 * Stripe payée (date de paiement connue) d'un montant non nul ; une facture
 * d'essai à 0 € ne compte pas. Chaque dossier crée sa propre organisation à la
 * création de l'officine : un paiement de cette organisation est donc
 * forcément celui de la pharmacie du dossier, après sa création.
 */
async function paidProspectIds(prospects: { prospectId: string; organizationId: string | null }[], db: Db): Promise<Set<string>> {
  const orgIds = [...new Set(prospects.flatMap((prospect) => (prospect.organizationId ? [prospect.organizationId] : [])))];
  if (orgIds.length === 0) return new Set();
  const paid = await db.billingPayment.groupBy({ by: ["organizationId"], where: { organizationId: { in: orgIds }, ...FIRST_PAYMENT }, _count: { _all: true } });
  const paidOrgs = new Set(paid.map((row) => row.organizationId));
  return new Set(prospects.filter((prospect) => prospect.organizationId && paidOrgs.has(prospect.organizationId)).map((prospect) => prospect.prospectId));
}

/**
 * Le montant de la commission PROGRESSIVE d'un dossier, aujourd'hui : la
 * commission de son rang s'il est activé, sinon la prévision (rang n + 1).
 */
export async function progressiveAmountFor(salesRepId: string, prospectId: string, db: Db = prisma): Promise<number> {
  const activations = await activatedPharmaciesOf(salesRepId, db);
  const mine = activations.find((activation) => activation.prospectId === prospectId);
  return rateForRank(mine ? mine.rank : activations.length + 1);
}

function endOfNextMonth(from: Date): Date {
  return new Date(from.getFullYear(), from.getMonth() + 2, 0, 12, 0, 0);
}

type CommissionFacts = { id: string; prospectId: string; type: string; status: string; amountCents: number; invoiceId: string | null; bonusTier: number | null; prospect: { name: string; activatedAt: Date | null; activationSalesRepId: string | null; pharmacy: { organizationId: string } | null } };

/** Tout ce que le plan lit pour un commercial : ses activations, ses commissions, les premiers paiements. */
async function readPlanInput(salesRepId: string, db: Db) {
  const activations = await activatedPharmaciesOf(salesRepId, db);
  const commissions: CommissionFacts[] = await db.commission.findMany({
    where: { salesRepId },
    select: { id: true, prospectId: true, type: true, status: true, amountCents: true, invoiceId: true, bonusTier: true, prospect: { select: { name: true, activatedAt: true, activationSalesRepId: true, pharmacy: { select: { organizationId: true } } } } },
  });
  // Les officines à regarder pour le premier paiement : celles des pharmacies activées, et celles des bonus déjà rattachés.
  const candidates = [
    ...activations.map((activation) => ({ prospectId: activation.prospectId, organizationId: activation.organizationId })),
    ...commissions.filter((row) => row.type === "BONUS").map((row) => ({ prospectId: row.prospectId, organizationId: row.prospect.pharmacy?.organizationId ?? null })),
  ];
  const paid = await paidProspectIds(candidates, db);
  // Activées, mais créditées à un autre commercial (dossier réaffecté AVANT son activation) : leur montant n'est jamais recalculé ici.
  const activatedElsewhere = new Set(commissions.filter((row) => row.prospect.activatedAt && row.prospect.activationSalesRepId !== salesRepId).map((row) => row.prospectId));
  const names = new Map<string, string>([...activations.map((activation) => [activation.prospectId, activation.name] as const), ...commissions.map((row) => [row.prospectId, row.prospect.name] as const)]);
  return { activations, commissions, paid, activatedElsewhere, names };
}

type Effect =
  | { kind: "AMOUNT"; prospectId: string; commissionId: string; fromCents: number; toCents: number; rank: number | null }
  | { kind: "BONUS_CREATED"; prospectId: string; commissionId: string; tier: BonusTier; earned: boolean }
  | { kind: "BONUS_RELINKED"; prospectId: string; commissionId: string; tier: BonusTier }
  | { kind: "BONUS_EARNED"; prospectId: string; commissionId: string; tier: BonusTier };

export type ProgressiveSyncReport = {
  /** Pourquoi rien n'a été fait : commercial inconnu. */
  skipped: "NOT_FOUND" | null;
  /** Faux pour un commercial sorti de la grille (ou jamais dessus) : seuls ses bonus déjà débloqués ont pu devenir acquis. */
  gridActive: boolean;
  activated: number;
  amountUpdates: number;
  bonusesCreated: string[];
  bonusesEarned: string[];
  bonusesRelinked: number;
  /** Paliers atteints avant le passage à la grille, laissés sans bonus (rattrapage explicite seulement). */
  preGridBonuses: string[];
};

/**
 * Recalcule les commissions d'un commercial : rangs, montants des commissions
 * de grille encore modifiables, bonus atteints, bonus dont la pharmacie du
 * palier a payé.
 *
 * - commercial à la grille : tout ce qui précède ; un palier atteint AVANT son
 *   passage à la grille (`progressiveSince`) n'est créé qu'avec
 *   `includePreGridBonuses` (script de rattrapage, décision du fondateur) ;
 * - commercial hors grille (pourcentage, mensuel, montant fixe) : seuls les
 *   bonus déjà débloqués du temps de la grille deviennent acquis au premier
 *   paiement ; rien n'est créé ni recalculé.
 *
 * Idempotent (deux appels de suite : le second n'écrit rien) et sûr sous
 * appels simultanés : tout se passe dans une transaction qui verrouille
 * d'abord la ligne du commercial (`FOR UPDATE`), si bien que deux recalculs du
 * même commercial passent l'un après l'autre et que le second relit ce que le
 * premier a écrit. L'index unique (commercial, palier) interdit en plus, au
 * niveau de la base, tout second bonus pour un même palier. Chaque écriture
 * est conditionnée à l'état relu : un geste du directeur arrivé entre-temps
 * n'est jamais écrasé.
 *
 * Les traces (événements du dossier) et les notifications partent après la
 * validation, une fois par changement réellement écrit.
 */
export async function syncProgressiveCommissions(salesRepId: string, options: { includePreGridBonuses?: boolean } = {}): Promise<ProgressiveSyncReport> {
  const effects: Effect[] = [];
  const now = new Date();
  const outcome = await prisma.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<{ commissionType: string; progressiveSince: Date | null }[]>`SELECT "commissionType"::text AS "commissionType", "progressiveSince" FROM "sales_reps" WHERE "id" = ${salesRepId} FOR UPDATE`;
      if (locked.length === 0) return { skipped: "NOT_FOUND" as const, gridActive: false, activated: 0, preGrid: [] as string[], names: new Map<string, string>() };
      const gridActive = locked[0].commissionType === "PROGRESSIVE";
      let gridSince = locked[0].progressiveSince;
      if (gridActive && !gridSince) {
        // Un commercial mis à la grille sans date de passage (écriture directe en base) : la grille commence maintenant.
        await tx.salesRep.update({ where: { id: salesRepId }, data: { progressiveSince: now } });
        gridSince = now;
      }

      // Une seule connexion dans une transaction : les lectures se suivent.
      const input = await readPlanInput(salesRepId, tx);
      const plan = planProgressiveSync({ activations: input.activations, commissions: input.commissions, paidProspectIds: input.paid, activatedElsewhere: input.activatedElsewhere, gridSince, gridActive, includePreGridBonuses: options.includePreGridBonuses });

      for (const update of plan.amountUpdates) {
        const written = await tx.commission.updateMany({
          where: { id: update.id, type: "PROGRESSIVE", amountCents: update.fromCents, invoiceId: null, status: { in: ["FORECAST", "EARNED", "PAYABLE"] } },
          data: { amountCents: update.toCents },
        });
        if (written.count === 1) effects.push({ kind: "AMOUNT", prospectId: update.prospectId, commissionId: update.id, fromCents: update.fromCents, toCents: update.toCents, rank: update.rank });
      }

      for (const creation of plan.bonusCreations) {
        const created = await tx.commission.createMany({
          data: [{ prospectId: creation.prospectId, salesRepId, type: "BONUS", bonusTier: creation.tier.at, amountCents: creation.tier.cents, status: creation.earned ? "EARNED" : "FORECAST", dueAt: creation.earned ? endOfNextMonth(now) : null, earnedAt: creation.earned ? now : null }],
          skipDuplicates: true,
        });
        if (created.count !== 1) continue;
        const row = await tx.commission.findUniqueOrThrow({ where: { salesRepId_bonusTier: { salesRepId, bonusTier: creation.tier.at } }, select: { id: true } });
        effects.push({ kind: "BONUS_CREATED", prospectId: creation.prospectId, commissionId: row.id, tier: creation.tier, earned: creation.earned });
      }

      for (const relink of plan.bonusRelinks) {
        const written = await tx.commission.updateMany({ where: { id: relink.id, type: "BONUS", status: "FORECAST", invoiceId: null, prospectId: relink.fromProspectId }, data: { prospectId: relink.toProspectId } });
        if (written.count === 1) effects.push({ kind: "BONUS_RELINKED", prospectId: relink.toProspectId, commissionId: relink.id, tier: relink.tier });
      }

      for (const promotion of plan.bonusPromotions) {
        const written = await tx.commission.updateMany({ where: { id: promotion.id, type: "BONUS", status: "FORECAST", invoiceId: null }, data: { status: "EARNED", dueAt: endOfNextMonth(now), earnedAt: now } });
        if (written.count === 1) effects.push({ kind: "BONUS_EARNED", prospectId: promotion.prospectId, commissionId: promotion.id, tier: promotion.tier });
      }

      return { skipped: null, gridActive, activated: input.activations.length, preGrid: plan.preGridBonuses.map((bonus) => bonus.tier.name), names: input.names };
    },
    { maxWait: 10_000, timeout: 30_000 },
  );

  for (const effect of effects) await announce(salesRepId, effect, outcome.names.get(effect.prospectId) ?? "l'officine");

  return {
    skipped: outcome.skipped,
    gridActive: outcome.gridActive,
    activated: outcome.activated,
    amountUpdates: effects.filter((effect) => effect.kind === "AMOUNT").length,
    bonusesCreated: effects.flatMap((effect) => (effect.kind === "BONUS_CREATED" ? [effect.tier.name] : [])),
    bonusesEarned: effects.flatMap((effect) => (effect.kind === "BONUS_EARNED" || (effect.kind === "BONUS_CREATED" && effect.earned) ? [effect.tier.name] : [])),
    bonusesRelinked: effects.filter((effect) => effect.kind === "BONUS_RELINKED").length,
    preGridBonuses: outcome.preGrid,
  };
}

/**
 * Ce que `syncProgressiveCommissions` écrirait, sans rien écrire : pour le
 * script de rattrapage en mode simulation. Lecture seule, hors verrou.
 */
export async function previewProgressiveSync(salesRepId: string, options: { includePreGridBonuses?: boolean } = {}) {
  const rep = await prisma.salesRep.findUniqueOrThrow({ where: { id: salesRepId }, select: { commissionType: true, progressiveSince: true } });
  const gridActive = rep.commissionType === "PROGRESSIVE";
  const input = await readPlanInput(salesRepId, prisma);
  return {
    plan: planProgressiveSync({ activations: input.activations, commissions: input.commissions, paidProspectIds: input.paid, activatedElsewhere: input.activatedElsewhere, gridSince: rep.progressiveSince ?? (gridActive ? new Date() : null), gridActive, includePreGridBonuses: options.includePreGridBonuses }),
    gridActive,
    progressiveSince: rep.progressiveSince,
    names: input.names,
    /** Les commissions d'avant la grille (montant fixe…) : jamais recalculées, elles gardent la règle sous laquelle elles ont été acquises. */
    legacy: input.commissions.filter((row) => row.type !== "PROGRESSIVE" && row.type !== "BONUS" && row.status !== "CANCELLED"),
  };
}

/** La trace et la notification d'un changement écrit : une fois, après la validation. */
async function announce(salesRepId: string, effect: Effect, prospectName: string): Promise<void> {
  const euros = formatPriceEuros;
  switch (effect.kind) {
    case "AMOUNT":
      await recordProspectEvent({
        prospectId: effect.prospectId,
        type: "COMMISSION_UPDATED",
        summary: `Commission recalculée (grille progressive) : ${euros(effect.fromCents)} → ${euros(effect.toCents)}, ${effect.rank ? `${rankLabel(effect.rank)} pharmacie activée` : "prévision avant activation"}.`,
        actor: SYSTEM,
        metadata: { commissionId: effect.commissionId, before: { amountCents: effect.fromCents }, after: { amountCents: effect.toCents }, rank: effect.rank },
      });
      return;
    case "BONUS_CREATED":
      await recordProspectEvent({
        prospectId: effect.prospectId,
        type: "COMMISSION_CREATED",
        summary: `Bonus ${effect.tier.name} : palier de ${effect.tier.at} pharmacies atteint, +${euros(effect.tier.cents)} — ${effect.earned ? "acquis, premier paiement de l'officine reçu" : "acquis au premier paiement de l'officine"}.`,
        actor: SYSTEM,
        metadata: { commissionId: effect.commissionId, bonusTier: effect.tier.at, amountCents: effect.tier.cents, status: effect.earned ? "EARNED" : "FORECAST" },
      });
      await notifySalesRep({
        salesRepId,
        type: "BONUS_UNLOCKED",
        title: `Bonus ${effect.tier.name} débloqué : +${euros(effect.tier.cents)}`,
        body: effect.earned ? `${effect.tier.at} pharmacies activées. Bonus acquis : il sera versé avec vos commissions.` : `${effect.tier.at} pharmacies activées. Il sera acquis au premier paiement de ${prospectName}.`,
        linkUrl: "/extranet/commissions",
        severity: "SUCCESS",
      });
      if (effect.earned) await announceLargeBonus(salesRepId, effect.tier, effect.prospectId);
      return;
    case "BONUS_RELINKED":
      await recordProspectEvent({ prospectId: effect.prospectId, type: "COMMISSION_UPDATED", summary: `Bonus ${effect.tier.name} rattaché à ce dossier : c'est la ${effect.tier.at}e pharmacie activée du commercial.`, actor: SYSTEM, metadata: { commissionId: effect.commissionId, bonusTier: effect.tier.at } });
      return;
    case "BONUS_EARNED":
      await recordProspectEvent({ prospectId: effect.prospectId, type: "COMMISSION_UPDATED", summary: `Bonus ${effect.tier.name} acquis : +${euros(effect.tier.cents)}, premier paiement de l'officine reçu.`, actor: SYSTEM, metadata: { commissionId: effect.commissionId, bonusTier: effect.tier.at, status: "EARNED" } });
      await notifySalesRep({ salesRepId, type: "BONUS_EARNED", title: `Bonus ${effect.tier.name} acquis : +${euros(effect.tier.cents)}`, body: `${prospectName} a réglé son premier paiement : le bonus sera versé avec vos commissions.`, linkUrl: "/extranet/commissions", severity: "SUCCESS" });
      await announceLargeBonus(salesRepId, effect.tier, effect.prospectId);
      return;
  }
}

/** Comme pour une commission : la console est prévenue d'un montant acquis de 500 € ou plus. */
async function announceLargeBonus(salesRepId: string, tier: BonusTier, prospectId: string): Promise<void> {
  if (tier.cents < 50_000) return;
  const rep = await prisma.salesRep.findUnique({ where: { id: salesRepId }, select: { firstName: true, lastName: true } });
  await notifyAdmins({ type: "COMMISSION_LARGE", title: `Bonus ${tier.name} acquis : ${formatPriceEuros(tier.cents)}`, body: `${rep ? `${rep.firstName} ${rep.lastName}` : "Commercial"} — ${tier.at} pharmacies activées.`, linkUrl: `/admin/dossiers/${prospectId}`, severity: "WARNING" });
}

/**
 * Le recalcul déclenché par un fait (activation, premier paiement, contrat,
 * réaffectation, changement de règle). Il ne fait jamais échouer le geste qui
 * l'appelle : une erreur est journalisée, et le passage quotidien
 * (`syncAllProgressiveCommissions`, tâche planifiée) rattrape, puisqu'il est
 * idempotent.
 */
export async function syncProgressiveCommissionsSafely(salesRepId: string | null | undefined, context: string): Promise<void> {
  if (!salesRepId) return;
  try {
    await syncProgressiveCommissions(salesRepId);
  } catch (error) {
    console.error(`[commissions] recalcul de la grille progressive non fait (${context})`, error instanceof Error ? error.message : "erreur inconnue");
  }
}

/**
 * Le passage quotidien : chaque commercial à la grille, et chaque commercial
 * qui garde un bonus en attente du premier paiement, est recalculé. Rattrape
 * un recalcul manqué (webhook interrompu, verrou trop long). Borné dans le
 * temps : ce qui n'est pas fait aujourd'hui l'est demain.
 */
export async function syncAllProgressiveCommissions(options: { budgetMs?: number } = {}): Promise<{ reps: number; synced: number; failed: number; bonusesCreated: number; bonusesEarned: number; amountUpdates: number }> {
  const startedAt = Date.now();
  const budget = options.budgetMs ?? 40_000;
  const reps = await prisma.salesRep.findMany({
    where: { OR: [{ commissionType: "PROGRESSIVE" }, { commissions: { some: { type: "BONUS", status: "FORECAST" } } }] },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  const totals = { reps: reps.length, synced: 0, failed: 0, bonusesCreated: 0, bonusesEarned: 0, amountUpdates: 0 };
  for (const rep of reps) {
    if (Date.now() - startedAt > budget) break;
    try {
      const report = await syncProgressiveCommissions(rep.id);
      totals.synced += 1;
      totals.bonusesCreated += report.bonusesCreated.length;
      totals.bonusesEarned += report.bonusesEarned.length;
      totals.amountUpdates += report.amountUpdates;
    } catch (error) {
      totals.failed += 1;
      console.error("[commissions] passage quotidien : recalcul non fait", rep.id, error instanceof Error ? error.message : "erreur inconnue");
    }
  }
  return totals;
}

/**
 * Les commerciaux concernés par un paiement d'une organisation : ceux qui
 * suivent ses dossiers, et ceux à qui leur activation est créditée.
 */
export async function salesRepsOfOrganization(organizationId: string): Promise<string[]> {
  const prospects = await prisma.prospect.findMany({ where: { pharmacy: { organizationId } }, select: { salesRepId: true, activationSalesRepId: true } });
  return [...new Set(prospects.flatMap((prospect) => [prospect.salesRepId, prospect.activationSalesRepId].filter((id): id is string => !!id)))];
}
