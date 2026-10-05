import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { pickActiveReferralOffer } from "@/core/billing/referral";

/**
 * Les offres de parrainage : pendant sa durée, une offre fait apporter à
 * chaque NOUVEAU filleul un montant par mois autre que le montant standard.
 * Ce montant est copié sur la fiche du filleul à son inscription
 * (`Pharmacy.referralAmountCents`) : une offre qui change, se termine ou est
 * annulée ne modifie jamais ce qu'un filleul déjà inscrit apporte.
 *
 * Plusieurs offres peuvent se chevaucher : la plus récemment démarrée
 * l'emporte. Si elle est annulée, la précédente, si elle court encore,
 * redevient celle qu'on applique (rien ne l'a supprimée).
 */

type OfferRow = { id: string; label: string; amountCents: number; startsAt: Date; endsAt: Date | null; canceledAt: Date | null };

const OFFER_SELECT = { id: true, label: true, amountCents: true, startsAt: true, endsAt: true, canceledAt: true } as const;

const snapshot = (offer: Pick<OfferRow, "id" | "label" | "amountCents" | "startsAt" | "endsAt">) => ({ id: offer.id, label: offer.label, amountCents: offer.amountCents, startsAt: offer.startsAt.toISOString(), endsAt: offer.endsAt?.toISOString() ?? null });

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

/** L'offre en cours à cette date, ou `null` : le montant standard s'applique. */
export async function activeReferralOffer(now: Date = new Date()): Promise<{ id: string; label: string; amountCents: number; startsAt: Date; endsAt: Date | null } | null> {
  const rows = await prisma.referralOffer.findMany({
    // La date de fin se tranche dans la règle pure ; la base écarte seulement ce qui ne peut pas être en cours.
    where: { canceledAt: null, startsAt: { lte: now } },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    select: OFFER_SELECT,
  });
  const offer = pickActiveReferralOffer(rows, now);
  return offer ? { id: offer.id, label: offer.label, amountCents: offer.amountCents, startsAt: offer.startsAt, endsAt: offer.endsAt } : null;
}

/**
 * Démarre une offre. `endsAt` est le premier instant où elle ne s'applique plus
 * (exclu) : pour « jusqu'au 31 octobre inclus », minuit le 1er novembre. L'audit
 * garde l'avant (l'offre qu'elle remplace, ou rien) et l'après. Rejouée pour la
 * même campagne (reprise après interruption), elle rend l'offre déjà créée sans
 * rien écrire de plus : une campagne n'a qu'une offre.
 */
export async function startReferralOffer(input: { label: string; amountCents: number; startsAt: Date; endsAt: Date | null; campaignId: string | null; adminId: string | null }): Promise<{ id: string }> {
  const label = input.label.trim();
  if (!label) throw new Error("Une offre de parrainage porte un nom.");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error("Le montant d'une offre de parrainage est un nombre entier de centimes, supérieur à zéro.");
  if (input.endsAt && input.endsAt.getTime() <= input.startsAt.getTime()) throw new Error("La fin d'une offre de parrainage suit son début.");

  const replaced = await activeReferralOffer(input.startsAt);
  let created: { id: string };
  try {
    created = await prisma.referralOffer.create({
      select: { id: true },
      data: { label, amountCents: input.amountCents, startsAt: input.startsAt, endsAt: input.endsAt, campaignId: input.campaignId, createdByAdminId: input.adminId },
    });
  } catch (error) {
    if (input.campaignId && isUniqueViolation(error)) {
      const existing = await prisma.referralOffer.findUnique({ where: { campaignId: input.campaignId }, select: { id: true } });
      if (existing) return existing;
    }
    throw error;
  }
  await recordAudit({
    action: "campaign.referral_offer_started",
    entityType: "ReferralOffer",
    entityId: created.id,
    platformAdminId: input.adminId,
    metadata: {
      campaignId: input.campaignId,
      before: replaced ? snapshot(replaced) : null,
      after: snapshot({ id: created.id, label, amountCents: input.amountCents, startsAt: input.startsAt, endsAt: input.endsAt }),
    },
  });
  return { id: created.id };
}

/**
 * Arrête l'offre d'une campagne (annulation de la campagne). Idempotente : une
 * offre déjà arrêtée, ou inexistante, ne fait rien et n'écrit rien. Les filleuls
 * inscrits pendant l'offre gardent leur montant.
 */
export async function endReferralOffer(where: { campaignId: string }, adminId: string | null): Promise<void> {
  const offer = await prisma.referralOffer.findUnique({ where: { campaignId: where.campaignId }, select: OFFER_SELECT });
  if (!offer || offer.canceledAt) return;
  const canceledAt = new Date();
  // Conditionnelle : si deux arrêts se croisent, un seul écrit, un seul audit.
  const claimed = await prisma.referralOffer.updateMany({ where: { id: offer.id, canceledAt: null }, data: { canceledAt } });
  if (claimed.count === 0) return;
  await recordAudit({
    action: "campaign.referral_offer_ended",
    entityType: "ReferralOffer",
    entityId: offer.id,
    platformAdminId: adminId,
    metadata: { campaignId: where.campaignId, before: { ...snapshot(offer), canceledAt: null }, after: { ...snapshot(offer), canceledAt: canceledAt.toISOString() } },
  });
}

/** Le montant à figer sur un filleul qui s'inscrit maintenant : celui de l'offre en cours, ou `null` (montant standard). */
export async function referralAmountForNewFilleul(now: Date = new Date()): Promise<number | null> {
  const offer = await activeReferralOffer(now);
  return offer ? offer.amountCents : null;
}
