import { prisma } from "@/server/db/client";
import { publicUrl } from "@/server/public-url";
import { randomBytes } from "node:crypto";
import { REFERRAL_DISCOUNT_CENTS, normalizeReferralCode, referralDiscountCents } from "@/core/billing/referral";
import { contractualPrice } from "@/core/billing/contract-price";

export { REFERRAL_DISCOUNT_CENTS, normalizeReferralCode };

/**
 * Le parrainage : chaque officine a un code. Une officine qui s'abonne avec
 * ce code est son filleul, et chaque filleul actif réduit l'abonnement du
 * parrain d'un montant fixe par mois, jusqu'à l'abonnement gratuit.
 *
 * Le montant est une règle de la plateforme (core/billing/referral). La
 * remise est appliquée au prélèvement à partir de ce calcul : l'écran du
 * titulaire et la console lisent la même somme.
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
  discountPerReferralCents: number;
  monthlyPriceCents: number | null;
  referrals: { name: string; city: string | null; active: boolean; since: Date }[];
  activeCount: number;
  discountCents: number;
  referredBy: string | null;
};

/** Ce que le titulaire voit : son code, son lien, ses filleuls, et ce que ça lui fait gagner. */
export async function referralSummary(pharmacyId: string): Promise<ReferralSummary> {
  const code = await ensureReferralCode(pharmacyId);
  const pharmacy = await prisma.pharmacy.findUniqueOrThrow({
    where: { id: pharmacyId },
    select: {
      referredBy: { select: { name: true } },
      referrals: { orderBy: { createdAt: "asc" }, select: { name: true, city: true, isActive: true, createdAt: true, organization: { select: { subscription: { select: { status: true } } } } } },
      organization: { select: { subscription: { select: { contractPriceCents: true, plan: { select: { monthlyPriceCents: true } } } } } },
    },
  });
  const referrals = pharmacy.referrals.map((r) => ({
    name: r.name,
    city: r.city,
    // Un filleul compte quand son officine est active ; l'abonnement, s'il est suivi, doit l'être aussi.
    active: r.isActive && (!r.organization.subscription || ["TRIALING", "ACTIVE", "PAST_DUE"].includes(r.organization.subscription.status)),
    since: r.createdAt,
  }));
  const activeCount = referrals.filter((r) => r.active).length;
  // Le plafond de la remise est le tarif contractuel de l'officine (ce qu'elle paie), pas le prix catalogue de l'offre.
  const subscription = pharmacy.organization.subscription;
  const monthlyPriceCents = subscription ? contractualPrice(subscription, subscription.plan).cents : null;
  return {
    code,
    link: publicUrl(`/decouvrir/abonnement?parrain=${encodeURIComponent(code)}`),
    discountPerReferralCents: REFERRAL_DISCOUNT_CENTS,
    monthlyPriceCents,
    referrals,
    activeCount,
    discountCents: referralDiscountCents(activeCount, monthlyPriceCents),
    referredBy: pharmacy.referredBy?.name ?? null,
  };
}
