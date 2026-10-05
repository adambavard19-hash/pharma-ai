"use client";

import { useState } from "react";
import { Copy, Check, Gift, Users } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCents, formatDate } from "@/lib/format";
import { REFERRAL_DISCOUNT_PERCENT, referralPercentDiscountCents } from "@/core/billing/referral";

type Referral = { name: string; city: string | null; active: boolean; since: string; offerAmountCents: number | null };
type CurrentOffer = { amountCents: number; endsAt: Date | string | null };

/**
 * Parrainage, vu du titulaire : son code, son lien à partager, ses filleuls et ce
 * que ça change sur son abonnement. Dès qu'une officine qu'il parraine s'abonne, son
 * abonnement passe à 20 % de moins par mois, une seule fois (deux filleuls ne font
 * pas 40 %). Seule exception : une offre de parrainage en cours à l'inscription d'un
 * filleul lui fait apporter un montant fixe, et le titulaire a le plus avantageux.
 * La remise est appliquée à l'abonnement par l'équipe PharmaBoost.
 */
export function ReferralCard({ referral }: { referral: { code: string; link: string; currentOffer: CurrentOffer | null; monthlyPriceCents: number | null; referrals: Referral[]; activeCount: number; discountCents: number; discountBasis: "PERCENT" | "OFFERS" | null; referredBy: string | null } }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const copy = async (what: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(what === "code" ? referral.code : referral.link);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* le navigateur refuse : le texte reste sélectionnable */
    }
  };
  const price = referral.monthlyPriceCents;
  const after = price === null ? null : Math.max(0, price - referral.discountCents);
  const percent = REFERRAL_DISCOUNT_PERCENT;
  const offer = referral.currentOffer;
  // La date de fin est le premier instant où l'offre ne s'applique plus : le dernier jour d'inscription est celui de l'instant d'avant.
  const lastOfferDay = offer?.endsAt ? new Date(new Date(offer.endsAt).getTime() - 1) : null;
  const covered = referral.discountCents > 0 && after !== null && price !== null;
  const description = covered
    ? referral.discountBasis === "OFFERS"
      ? `Une offre de parrainage vous est plus favorable que les ${percent} % : votre abonnement est à ${formatCents(after!)} HT au lieu de ${formatCents(price!)} HT par mois.`
      : `Une officine que vous parrainez est abonnée : votre abonnement est à ${percent} % de moins, ${formatCents(after!)} HT au lieu de ${formatCents(price!)} HT par mois.`
    : price !== null
      ? `Dès qu'une officine que vous parrainez s'abonne, votre abonnement passe à ${percent} % de moins : ${formatCents(Math.max(0, price - referralPercentDiscountCents(price)))} HT au lieu de ${formatCents(price)} HT par mois.`
      : `Dès qu'une officine que vous parrainez s'abonne, votre abonnement passe à ${percent} % de moins par mois.`;

  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Gift className="size-4 text-brand-600 dark:text-brand-400" />
            Parrainage : parrainez un confrère, payez {percent} % de moins
          </span>
        }
        description={description}
      />
      <CardContent className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-border-subtle bg-surface-sunken p-4">
            <p className="text-[12px] font-semibold tracking-[0.08em] text-text-tertiary uppercase">Votre code</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <span className="text-[26px] leading-none font-semibold tracking-[0.04em] text-text-primary tabular">{referral.code}</span>
              <button type="button" onClick={() => copy("code")} className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-card px-2.5 py-1.5 text-[12.5px] font-medium text-text-primary hover:bg-surface-sunken">
                {copied === "code" ? <Check className="size-3.5 text-success-600" /> : <Copy className="size-3.5" />} {copied === "code" ? "Copié" : "Copier"}
              </button>
            </div>
            <p className="mt-3 text-[12px] font-semibold tracking-[0.08em] text-text-tertiary uppercase">Votre lien à partager</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-surface-card px-2 py-1.5 text-[12.5px] text-text-secondary">{referral.link}</code>
              <button type="button" onClick={() => copy("link")} className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-card px-2.5 py-1.5 text-[12.5px] font-medium text-text-primary hover:bg-surface-sunken">
                {copied === "link" ? <Check className="size-3.5 text-success-600" /> : <Copy className="size-3.5" />} {copied === "link" ? "Copié" : "Copier"}
              </button>
            </div>
          </div>
          <p className="text-[13px] leading-5 text-text-secondary">Un confrère s&apos;abonne avec votre code ou votre lien : il devient votre filleul dès que son espace est créé. La remise est appliquée à votre abonnement par l&apos;équipe PharmaBoost, une seule fois : {percent} % de moins, que vous ayez un ou plusieurs filleuls.</p>
          {offer && (
            <p className="rounded-xl border border-border-subtle bg-surface-sunken p-3 text-[13px] leading-5 text-text-secondary">
              Offre de parrainage en cours : chaque officine que vous parrainez et qui s&apos;inscrit{lastOfferDay ? ` jusqu'au ${formatDate(lastOfferDay)} inclus` : ""} retire {formatCents(offer.amountCents)} HT par mois de votre abonnement, tant qu&apos;elle est abonnée. Vous bénéficiez du plus avantageux entre la somme de ces montants et les {percent} % de moins.
            </p>
          )}
          {referral.referredBy && <p className="text-[12.5px] text-text-tertiary">Vous avez été parrainé par {referral.referredBy}.</p>}
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Filleuls actifs" value={String(referral.activeCount)} />
            <Stat label="Remise par mois" value={referral.discountCents > 0 ? `− ${formatCents(referral.discountCents)}` : "—"} />
            <Stat label="Votre abonnement" value={after === null ? "—" : after === 0 ? "0 €" : `${formatCents(after)} HT`} />
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.08em] text-text-tertiary uppercase"><Users className="size-3.5" /> Vos filleuls</p>
            {referral.referrals.length === 0 ? (
              <p className="mt-1.5 text-[13px] text-text-secondary">Aucun pour l&apos;instant. Partagez votre lien à un confrère.</p>
            ) : (
              <ul className="mt-1.5 divide-y divide-border-subtle">
                {referral.referrals.map((r) => (
                  <li key={`${r.name}-${r.since}`} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                    <span className="min-w-0 truncate text-text-primary">{r.name}{r.city ? <span className="text-text-tertiary"> · {r.city}</span> : null}</span>
                    <span className="flex shrink-0 items-center gap-2 text-text-tertiary">
                      {r.offerAmountCents !== null && (
                        <>
                          <span className="tabular">offre {formatCents(r.offerAmountCents)} HT/mois</span>
                          <span aria-hidden="true">·</span>
                        </>
                      )}
                      depuis le {formatDate(r.since)}
                      <Badge tone={r.active ? "success" : "neutral"}>{r.active ? "active" : "inactive"}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border-subtle p-3">
      <p className="text-[11.5px] text-text-tertiary">{label}</p>
      <p className="mt-1 text-[18px] leading-tight font-semibold text-text-primary tabular">{value}</p>
    </div>
  );
}
