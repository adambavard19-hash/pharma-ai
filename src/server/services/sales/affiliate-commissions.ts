import "server-only";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/server/db/client";
import { AFFILIATE_RECURRING_RATE, AFFILIATE_SIGNUP_BONUS_CENTS, affiliateRateFor, monthlyCommissionApplies, rateLabel } from "@/core/affiliation/terms";
import { DIRECTOR_SIGNUP_BONUS_CENTS } from "@/core/affiliation/director-terms";
import { AFFILIATION_PROGRAM_START, ONE_OFF_COMMISSION_TYPES, SIGNUP_BONUS_KEY, affiliateCommissionForMonth, signupBonusDue, monthPeriodOf, monthlySubscriptionCents, previousMonthPeriod, subscribedAtMonthEnd, type MonthPeriod, type SubscriptionFacts } from "@/core/affiliation/monthly";
import { formatCents } from "@/lib/format";
import { recordProspectEvent, type SalesActor } from "./events";
import { notifySalesRep } from "./notifications";

/**
 * Les commissions mensuelles d'affiliation (18 oct. 2026), sur les vraies données.
 *
 * Chaque mois écoulé, pour chaque pharmacie apportée par un affilié ACTIF (règle AFFILIATE) et abonnée à la fin de ce
 * mois, une commission au taux du PALIER de l'affilié (10, 12, 15 ou 20 % de son abonnement mensuel HT, `terms.ts`), au
 * statut « Acquise » : elle suit ensuite le circuit existant (Valider → à payer → Payée, ou facture de l'affilié).
 *
 * Le palier se lit sur le nombre de pharmacies ACTIVES apportées par l'affilié à la fin du mois commissionné : celles
 * qui lui sont créditées, hors démonstration, abonnées à la fin du mois (y compris celles payées par l'ancienne règle,
 * qui restent des pharmacies qu'il a apportées, sans commission mensuelle en plus). Le taux du palier vaut pour TOUTES
 * ses pharmacies ce mois-là, et il est inscrit sur chaque ligne (`ratePercent`).
 *
 * « Apportée par l'affilié » : la pharmacie dont la première activation lui est créditée (`activationSalesRepId`), ou,
 * pas encore activée, celle dont il suit le dossier. Une réaffectation après l'activation ne déplace pas la commission.
 *
 * Une seule commission par pharmacie et par mois : l'index unique (dossier, mois) l'impose au niveau de la base, et
 * chaque création passe par `skipDuplicates` ; deux passages simultanés ou rejoués n'en créent jamais deux.
 * Aucune rétroactivité : seul le mois écoulé est commissionné, jamais les précédents.
 *
 * Pas de double rémunération : une pharmacie déjà payée par l'ancienne règle (commission de grille, montant fixe,
 * pourcentage ou mensuel sur 12 mois, non annulée) n'ouvre pas, en plus, la commission mensuelle. Les anciennes
 * commissions ne sont jamais lues pour être modifiées : ce service n'écrit que des lignes AFFILIATE neuves.
 */

type Db = Prisma.TransactionClient | typeof prisma;

const SYSTEM: SalesActor = { type: "SYSTEM", label: "Affiliation mensuelle" };

const SUBSCRIPTION_SELECT = {
  status: true,
  createdAt: true,
  trialEndsAt: true,
  endedAt: true,
  canceledAt: true,
  contractPriceCents: true,
  referralDiscountCents: true,
  plan: { select: { monthlyPriceCents: true } },
} satisfies Prisma.SubscriptionSelect;

/** Les dossiers apportés par ces affiliés, avec ce que la règle lit de l'officine et de son abonnement. */
async function broughtPharmacies(repIds: string[], db: Db) {
  if (repIds.length === 0) return [];
  return db.prospect.findMany({
    where: {
      pharmacyId: { not: null },
      OR: [{ activationSalesRepId: { in: repIds } }, { activatedAt: null, salesRepId: { in: repIds } }],
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      salesRepId: true,
      activatedAt: true,
      activationSalesRepId: true,
      pharmacy: { select: { isDemo: true, organization: { select: { subscription: { select: SUBSCRIPTION_SELECT } } } } },
      commissions: { where: { type: { in: [...ONE_OFF_COMMISSION_TYPES] }, status: { not: "CANCELLED" } }, select: { id: true }, take: 1 },
    },
  });
}

type Brought = Awaited<ReturnType<typeof broughtPharmacies>>[number];

/** L'affilié crédité d'un dossier : celui de la première activation, sinon celui qui suit le dossier. */
const creditedRep = (prospect: Pick<Brought, "activatedAt" | "activationSalesRepId" | "salesRepId">): string | null => (prospect.activatedAt ? prospect.activationSalesRepId : prospect.salesRepId);

/** Le dernier jour du mois qui suit le mois commissionné, à midi : l'échéance de paiement annoncée. */
function dueAtFor(period: MonthPeriod): Date {
  const next = monthPeriodOf(new Date(period.end.getTime() + 12 * 3_600_000));
  return new Date(next.end.getTime() - 12 * 3_600_000);
}

export type MonthlyAffiliateRun = {
  month: string;
  affiliates: number;
  pharmacies: number;
  created: number;
  alreadyThere: number;
  totalCreatedCents: number;
  /** `newRule` : pharmacie activée depuis la fin du pourcentage mensuel (20 oct. 2026), payée par la seule prime de 100 €. */
  skipped: { notSubscribed: number; oldRule: number; demo: number; otherRep: number; newRule: number };
  /** Le taux appliqué à chaque affilié ce mois-là, en pourcentage entier (par identifiant d'affilié). */
  ratePercentByRep: Record<string, number>;
};

/** Une pharmacie apportée compte-t-elle dans le palier de l'affilié : non démo, abonnée à la fin de la période ? */
function countsForTier(prospect: Brought, period: Pick<MonthPeriod, "end">): boolean {
  return Boolean(prospect.pharmacy && !prospect.pharmacy.isDemo && subscribedAtMonthEnd(prospect.pharmacy.organization.subscription, period));
}

/** Le nombre de pharmacies actives par affilié crédité, pour la période. */
function activeCountByRep(prospects: Brought[], period: Pick<MonthPeriod, "end">): Map<string, number> {
  const counts = new Map<string, number>();
  for (const prospect of prospects) {
    const salesRepId = creditedRep(prospect);
    if (!salesRepId || !countsForTier(prospect, period)) continue;
    counts.set(salesRepId, (counts.get(salesRepId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Le passage mensuel : crée les commissions du mois écoulé (par rapport à `now`). Rejouable à volonté (chaque jour, la
 * tâche planifiée le relance : un passage manqué le 1er est rattrapé le 2), sans jamais créer de doublon.
 */
export async function createMonthlyAffiliateCommissions(now: Date = new Date()): Promise<MonthlyAffiliateRun> {
  const period = previousMonthPeriod(now);
  const reps = await prisma.salesRep.findMany({ where: { commissionType: "AFFILIATE", isActive: true }, select: { id: true } });
  const repIds = new Set(reps.map((rep) => rep.id));
  const run: MonthlyAffiliateRun = { month: period.key, affiliates: reps.length, pharmacies: 0, created: 0, alreadyThere: 0, totalCreatedCents: 0, skipped: { notSubscribed: 0, oldRule: 0, demo: 0, otherRep: 0, newRule: 0 }, ratePercentByRep: {} };
  const createdByRep = new Map<string, { count: number; cents: number; rate: number }>();
  // Les pharmacies déjà commissionnées pour ce mois : le passage quotidien ne réécrit rien pour elles (l'index unique
  // reste le seul vrai verrou, pour deux passages simultanés).
  const done = new Set((await prisma.commission.findMany({ where: { periodMonth: period.key }, select: { prospectId: true } })).map((row) => row.prospectId));

  const prospects = await broughtPharmacies([...repIds], prisma);
  // Le palier de chaque affilié, sur TOUTES ses pharmacies actives à la fin du mois (y compris celles déjà
  // commissionnées par un passage précédent) : un passage rejoué retrouve le même taux.
  const activeCounts = activeCountByRep(prospects, period);
  const rateOf = (salesRepId: string) => affiliateRateFor(activeCounts.get(salesRepId) ?? 0);
  for (const salesRepId of repIds) run.ratePercentByRep[salesRepId] = Math.round(rateOf(salesRepId) * 100);

  for (const prospect of prospects) {
    const salesRepId = creditedRep(prospect);
    // Activé pour un autre (commercial à l'ancienne règle, affilié désactivé) : le suivi actuel ne compte pas.
    if (!salesRepId || !repIds.has(salesRepId)) { run.skipped.otherRep += 1; continue; }
    run.pharmacies += 1;
    if (!prospect.pharmacy || prospect.pharmacy.isDemo) { run.skipped.demo += 1; continue; }
    if (done.has(prospect.id)) { run.alreadyThere += 1; continue; }
    if (prospect.commissions.length > 0) { run.skipped.oldRule += 1; continue; }
    if (!monthlyCommissionApplies(prospect.activatedAt)) { run.skipped.newRule += 1; continue; }
    const subscription: SubscriptionFacts | null = prospect.pharmacy.organization.subscription;
    const rate = rateOf(salesRepId);
    const ratePercent = Math.round(rate * 100);
    const amountCents = affiliateCommissionForMonth(subscription, period, rate);
    if (amountCents <= 0) { run.skipped.notSubscribed += 1; continue; }

    const created = await prisma.commission.createMany({
      data: [{ prospectId: prospect.id, salesRepId, type: "AFFILIATE", periodMonth: period.key, amountCents, ratePercent, status: "EARNED", earnedAt: now, dueAt: dueAtFor(period), note: `Affiliation ${rateLabel(rate)} — ${period.label}` }],
      skipDuplicates: true,
    });
    if (created.count !== 1) { run.alreadyThere += 1; continue; }
    run.created += 1;
    run.totalCreatedCents += amountCents;
    const total = createdByRep.get(salesRepId) ?? { count: 0, cents: 0, rate };
    createdByRep.set(salesRepId, { count: total.count + 1, cents: total.cents + amountCents, rate });
    const monthly = monthlySubscriptionCents(subscription!);
    await recordProspectEvent({
      prospectId: prospect.id,
      type: "COMMISSION_CREATED",
      summary: `Commission d'affiliation ${period.label} : ${formatCents(amountCents)} (${rateLabel(rate)} de l'abonnement de ${formatCents(monthly)} HT, palier de ${activeCounts.get(salesRepId) ?? 0} pharmacie${(activeCounts.get(salesRepId) ?? 0) > 1 ? "s" : ""} active${(activeCounts.get(salesRepId) ?? 0) > 1 ? "s" : ""}).`,
      actor: SYSTEM,
      metadata: { periodMonth: period.key, amountCents, ratePercent, activePharmacies: activeCounts.get(salesRepId) ?? 0, subscriptionCents: monthly, salesRepId },
    }).catch((error: unknown) => console.error("[affiliation] trace non écrite", error instanceof Error ? error.message : "erreur inconnue"));
  }

  for (const [salesRepId, total] of createdByRep) {
    await notifySalesRep({
      salesRepId,
      type: "AFFILIATE_MONTH",
      title: `Commissions de ${period.label} : ${formatCents(total.cents)}`,
      body: `${total.count} pharmacie${total.count > 1 ? "s" : ""} abonnée${total.count > 1 ? "s" : ""} : ${rateLabel(total.rate)} de leur abonnement.`,
      linkUrl: "/extranet/commissions",
      severity: "SUCCESS",
    }).catch((error: unknown) => console.error("[affiliation] notification non envoyée", error instanceof Error ? error.message : "erreur inconnue"));
  }
  return run;
}

export type AffiliatePharmacy = { prospectId: string; name: string; active: boolean; subscriptionCents: number | null; monthlyCommissionCents: number; oldRule: boolean };

/**
 * Ce que l'extranet d'un affilié montre de son affiliation : ses pharmacies apportées, celles abonnées aujourd'hui, son
 * palier actuel (sur ses pharmacies actives aujourd'hui, la même règle que le calcul mensuel) et ses revenus récurrents
 * actuels (somme, sur les pharmacies abonnées, du taux du palier de leur abonnement). Le périmètre est l'identifiant de
 * SA session, jamais un paramètre d'URL.
 */
export async function affiliateOverviewFor(salesRepId: string, now: Date = new Date()): Promise<{ pharmacies: AffiliatePharmacy[]; activeCount: number; tierCount: number; ratePercent: number; recurringCents: number }> {
  const today = { end: now };
  const brought = (await broughtPharmacies([salesRepId], prisma)).filter((prospect) => creditedRep(prospect) === salesRepId);
  const tierCount = activeCountByRep(brought, today).get(salesRepId) ?? 0;
  const rate = tierCount > 0 ? affiliateRateFor(tierCount) : AFFILIATE_RECURRING_RATE;
  const pharmacies = brought
    .filter((prospect) => prospect.pharmacy && !prospect.pharmacy.isDemo)
    .map((prospect): AffiliatePharmacy => {
      const subscription = prospect.pharmacy!.organization.subscription;
      const oldRule = prospect.commissions.length > 0;
      const active = subscribedAtMonthEnd(subscription, today);
      const monthlyCommissionCents = active && !oldRule && monthlyCommissionApplies(prospect.activatedAt) ? affiliateCommissionForMonth(subscription, today, rate) : 0;
      return { prospectId: prospect.id, name: prospect.name, active, subscriptionCents: subscription ? monthlySubscriptionCents(subscription) : null, monthlyCommissionCents, oldRule };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "fr"));
  const counted = pharmacies.filter((pharmacy) => pharmacy.monthlyCommissionCents > 0);
  return { pharmacies, activeCount: counted.length, tierCount, ratePercent: Math.round(rate * 100), recurringCents: counted.reduce((total, pharmacy) => total + pharmacy.monthlyCommissionCents, 0) };
}

// ---------------------------------------------------------------- Primes uniques

export type SignupBonusRun = {
  affiliateBonuses: number;
  directorBonuses: number;
  totalCreatedCents: number;
  /** Primes du directeur non créées faute d'un directeur commercial actif unique à qui les rattacher. */
  directorUnassigned: number;
};

/**
 * Les primes uniques, dues une fois la mise en service RÉELLEMENT réglée (et réglée depuis le début du programme) :
 *
 * - 100 € HT à l'affilié actif qui a apporté la pharmacie (ligne de commission AFFILIATE_SIGNUP, au statut « Acquise » :
 *   même circuit que ses commissions mensuelles). Une pharmacie déjà payée par l'ancienne règle n'y ouvre pas droit ;
 * - 50 € HT au directeur commercial pour toute pharmacie signée par l'équipe (dossier suivi ou activé par un commercial
 *   ou un affilié). Les commerciaux ne sont rattachés à aucun directeur en base : la prime va au SEUL directeur actif ;
 *   s'il n'y en a aucun, ou plusieurs, elle n'est pas créée (compteur `directorUnassigned`) et sera créée au passage
 *   suivant une fois la situation claire.
 *
 * Une seule prime par pharmacie, de chaque sorte : index uniques (dossier + « PRIME » ; dossier pour le directeur) et
 * `skipDuplicates`. Rejouable à volonté (passage quotidien), sûr sous passages simultanés.
 */
export async function createSignupBonuses(now: Date = new Date()): Promise<SignupBonusRun> {
  const run: SignupBonusRun = { affiliateBonuses: 0, directorBonuses: 0, totalCreatedCents: 0, directorUnassigned: 0 };
  const [affiliates, directors] = await Promise.all([
    prisma.salesRep.findMany({ where: { commissionType: "AFFILIATE", isActive: true }, select: { id: true } }),
    prisma.salesDirector.findMany({ where: { isActive: true }, select: { id: true }, take: 2 }),
  ]);
  const affiliateIds = new Set(affiliates.map((rep) => rep.id));
  const directorId = directors.length === 1 ? directors[0].id : null;

  const candidates = await prisma.prospect.findMany({
    where: {
      pharmacyId: { not: null },
      OR: [{ salesRepId: { not: null } }, { activationSalesRepId: { not: null } }],
      pharmacy: { isDemo: false, organization: { subscription: { setupFeeCents: { gt: 0 }, payments: { some: { status: "PAID", paidAt: { gte: AFFILIATION_PROGRAM_START } } } } } },
      // Seulement celles à qui il manque encore une prime.
      NOT: { AND: [{ directorBonus: { isNot: null } }, { commissions: { some: { type: "AFFILIATE_SIGNUP" } } }] },
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      salesRepId: true,
      activatedAt: true,
      activationSalesRepId: true,
      directorBonus: { select: { id: true } },
      pharmacy: { select: { organization: { select: { subscription: { select: { setupFeeCents: true, payments: { select: { status: true, paidAt: true, amountCents: true } } } } } } } },
      commissions: { where: { OR: [{ type: "AFFILIATE_SIGNUP" }, { type: { in: [...ONE_OFF_COMMISSION_TYPES] }, status: { not: "CANCELLED" } }] }, select: { type: true } },
    },
  });

  for (const prospect of candidates) {
    const subscription = prospect.pharmacy?.organization.subscription;
    if (!subscription || !signupBonusDue(subscription.setupFeeCents, subscription.payments)) continue;
    const credited = creditedRep(prospect) ?? prospect.salesRepId;

    // L'affilié : sa prime d'arrivée.
    const hasPrime = prospect.commissions.some((row) => row.type === "AFFILIATE_SIGNUP");
    const oldRule = prospect.commissions.some((row) => row.type !== "AFFILIATE_SIGNUP");
    if (credited && affiliateIds.has(credited) && !hasPrime && !oldRule) {
      const created = await prisma.commission.createMany({
        data: [{ prospectId: prospect.id, salesRepId: credited, type: "AFFILIATE_SIGNUP", periodMonth: SIGNUP_BONUS_KEY, amountCents: AFFILIATE_SIGNUP_BONUS_CENTS, status: "EARNED", earnedAt: now, dueAt: endOfNextMonth(now), note: "Prime d'arrivée : mise en service réglée" }],
        skipDuplicates: true,
      });
      if (created.count === 1) {
        run.affiliateBonuses += 1;
        run.totalCreatedCents += AFFILIATE_SIGNUP_BONUS_CENTS;
        await recordProspectEvent({ prospectId: prospect.id, type: "COMMISSION_CREATED", summary: `Prime d'arrivée de l'affilié : ${formatCents(AFFILIATE_SIGNUP_BONUS_CENTS)} (mise en service réglée).`, actor: SYSTEM, metadata: { amountCents: AFFILIATE_SIGNUP_BONUS_CENTS, salesRepId: credited } }).catch(() => undefined);
        await notifySalesRep({ salesRepId: credited, type: "AFFILIATE_SIGNUP", title: `Prime d'arrivée : +${formatCents(AFFILIATE_SIGNUP_BONUS_CENTS)}`, body: `${prospect.name} a réglé sa mise en service.`, linkUrl: "/extranet/commissions", severity: "SUCCESS" }).catch(() => undefined);
      }
    }

    // Le directeur commercial : sa prime pour une pharmacie signée par l'équipe.
    if (!prospect.directorBonus) {
      if (!directorId) { run.directorUnassigned += 1; continue; }
      const created = await prisma.directorBonus.createMany({
        data: [{ salesDirectorId: directorId, prospectId: prospect.id, amountCents: DIRECTOR_SIGNUP_BONUS_CENTS, status: "EARNED", earnedAt: now, dueAt: endOfNextMonth(now), note: "Pharmacie signée par l'équipe : mise en service réglée" }],
        skipDuplicates: true,
      });
      if (created.count === 1) {
        run.directorBonuses += 1;
        run.totalCreatedCents += DIRECTOR_SIGNUP_BONUS_CENTS;
        await recordProspectEvent({ prospectId: prospect.id, type: "COMMISSION_CREATED", summary: `Prime du directeur commercial : ${formatCents(DIRECTOR_SIGNUP_BONUS_CENTS)} (mise en service réglée).`, actor: SYSTEM, metadata: { amountCents: DIRECTOR_SIGNUP_BONUS_CENTS, salesDirectorId: directorId } }).catch(() => undefined);
      }
    }
  }
  return run;
}

function endOfNextMonth(from: Date): Date {
  const next = monthPeriodOf(new Date(monthPeriodOf(from).end.getTime() + 12 * 3_600_000));
  return new Date(next.end.getTime() - 12 * 3_600_000);
}
