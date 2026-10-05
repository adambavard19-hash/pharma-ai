import { prisma } from "@/server/db/client";
import { publicUrl } from "@/server/public-url";
import { randomBytes } from "node:crypto";
import { normalizeReferralCode, referralBenefit, referralOfferAmountFor, type ReferralBenefit } from "@/core/billing/referral";
import { contractualPrice } from "@/core/billing/contract-price";
import { activeReferralOffer } from "@/server/services/referral-offers";

export { normalizeReferralCode };

/**
 * Le parrainage : chaque officine a un code. Une officine qui s'abonne avec
 * ce code (ou que l'équipe a rattachée à son parrain) est son filleul. Dès
 * qu'un filleul est actif, l'abonnement du parrain passe à 20 % de moins par
 * mois, une seule fois : deux filleuls ne font pas 40 %.
 *
 * La règle vit dans core/billing/referral. Seule exception : le montant par
 * filleul d'une offre de parrainage de la console, figé sur la fiche du filleul
 * à son inscription ; le parrain a alors le plus avantageux des deux. La remise
 * est calculée et affichée ici, l'écran du titulaire et la console lisent le même
 * calcul ; elle est appliquée à l'abonnement par l'équipe PharmaBoost (aucune
 * remise Stripe n'est créée).
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newCode(): string {
  const bytes = randomBytes(6);
  return `PB-${[...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("")}`;
}

/** Le code de l'officine, créé à la première demande. */
export async function ensureReferralCode(pharmacyId: string): Promise<string> {
  const pharmacy = await prisma.pharmacy.findUniqueOrThrow({ where: { id: pharmacyId }, select: { referralCode: true } });
  if (pharmacy.referralCode) return pharmacy.referralCode;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = newCode();
    const taken = await prisma.pharmacy.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (taken) continue;
    await prisma.pharmacy.update({ where: { id: pharmacyId }, data: { referralCode: code } });
    return code;
  }
  throw new Error("Impossible d'attribuer un code de parrainage.");
}

/** L'officine marraine derrière un code, ou null. */
export async function resolveReferralCode(value: string | null | undefined): Promise<{ id: string; name: string } | null> {
  const code = normalizeReferralCode(value);
  if (!code) return null;
  return prisma.pharmacy.findUnique({ where: { referralCode: code }, select: { id: true, name: true } });
}

export type ReferralSummary = {
  code: string;
  link: string;
  /** L'offre de parrainage en cours : un montant par filleul inscrit pendant sa durée, exception aux 20 %. */
  currentOffer: { amountCents: number; endsAt: Date | null; label: string } | null;
  /** Le tarif contractuel de l'officine, ou `null` sans abonnement suivi. */
  monthlyPriceCents: number | null;
  /** `offerAmountCents` : le montant d'offre figé à l'inscription de CE filleul, `null` hors offre. */
  referrals: { name: string; city: string | null; active: boolean; since: Date; offerAmountCents: number | null }[];
  activeCount: number;
  /** La remise mensuelle appliquée aujourd'hui : 0 sans filleul actif ou sans abonnement. */
  discountCents: number;
  /** D'où vient la remise : les 20 %, ou les montants d'offre quand ils sont plus avantageux. */
  discountBasis: ReferralBenefit["basis"];
  referredBy: string | null;
};

/** Ce que le titulaire voit : son code, son lien, ses filleuls, et ce que ça lui fait gagner. */
export async function referralSummary(pharmacyId: string): Promise<ReferralSummary> {
  const code = await ensureReferralCode(pharmacyId);
  const pharmacy = await prisma.pharmacy.findUniqueOrThrow({
    where: { id: pharmacyId },
    select: {
      referredBy: { select: { name: true } },
      referrals: { orderBy: { createdAt: "asc" }, select: { name: true, city: true, isActive: true, createdAt: true, referralAmountCents: true, organization: { select: { subscription: { select: { status: true } } } } } },
      organization: { select: { subscription: { select: { contractPriceCents: true, plan: { select: { monthlyPriceCents: true } } } } } },
    },
  });
  const referrals = pharmacy.referrals.map((r) => ({
    name: r.name,
    city: r.city,
    // Un filleul compte quand son officine est active ; l'abonnement, s'il est suivi, doit l'être aussi.
    active: r.isActive && (!r.organization.subscription || ["TRIALING", "ACTIVE", "PAST_DUE"].includes(r.organization.subscription.status)),
    since: r.createdAt,
    offerAmountCents: referralOfferAmountFor(r),
  }));
  // Le plafond de la remise est le tarif contractuel de l'officine (ce qu'elle paie), pas le prix catalogue de l'offre.
  const subscription = pharmacy.organization.subscription;
  const monthlyPriceCents = subscription ? contractualPrice(subscription, subscription.plan).cents : null;
  const offer = await activeReferralOffer();
  // 20 % dès un filleul actif, ou la somme des montants d'offre si elle est plus avantageuse : ce que l'équipe applique.
  const benefit = referralBenefit(referrals, monthlyPriceCents);
  return {
    code,
    link: publicUrl(`/decouvrir/abonnement?parrain=${encodeURIComponent(code)}`),
    currentOffer: offer ? { amountCents: offer.amountCents, endsAt: offer.endsAt, label: offer.label } : null,
    monthlyPriceCents,
    referrals,
    activeCount: referrals.filter((r) => r.active).length,
    discountCents: benefit.discountCents,
    discountBasis: benefit.basis,
    referredBy: pharmacy.referredBy?.name ?? null,
  };
}
