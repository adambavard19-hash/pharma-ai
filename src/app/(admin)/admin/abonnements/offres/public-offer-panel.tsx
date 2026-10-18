"use client";

import { useRouter } from "next/navigation";
import { publishOfficialOfferAction } from "@/server/actions/admin-pricing";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { OFFICIAL_OFFER, formatPriceEuros } from "@/core/pricing/official-offer";
import { AFFILIATE_MAX_RATE_LABEL, AFFILIATE_RATE_LABEL, AFFILIATE_SIGNUP_BONUS_CENTS, AFFILIATE_TIERS_SENTENCE, affiliateRateFor, monthlyAffiliateCommissionCents } from "@/core/affiliation/terms";

export type PublicOfferPanelData = {
  source: "PLAN" | "OFFICIAL_DEFAULT";
  planName: string;
  monthlyPriceCents: number;
  setupFeeCents: number;
  commitmentMonths: number;
  referralDiscountPercent: number;
  gaps: string[];
  /** L'offre officielle est déjà celle du site (rien à publier). */
  officialIsLive: boolean;
  previousDefaultName: string | null;
};

function Item({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-card px-4 py-3">
      <p className="text-[11.5px] font-semibold tracking-[0.04em] text-text-tertiary uppercase">{label}</p>
      <p className="mt-1 text-[20px] leading-6 font-semibold text-text-primary tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[12px] text-text-secondary">{hint}</p>}
    </div>
  );
}

/**
 * Ce que le site affiche, d'où cela vient, et la rémunération des affiliés : les
 * montants de l'offre au même endroit, avec le geste pour publier l'offre officielle.
 * Depuis le 18 oct. 2026, plus de « commission standard » par pharmacie : l'affilié
 * touche de 10 à 20 % de l'abonnement chaque mois selon son palier, plus une prime
 * d'arrivée par pharmacie (paliers et prime fixés dans `core/affiliation/terms.ts`).
 */
export function PublicOfferPanel({ data }: { data: PublicOfferPanelData }) {
  const router = useRouter();
  const exampleCents = monthlyAffiliateCommissionCents(data.monthlyPriceCents);
  const maxExampleCents = monthlyAffiliateCommissionCents(data.monthlyPriceCents, affiliateRateFor(Number.MAX_SAFE_INTEGER));

  return (
    <section className="space-y-4 rounded-2xl border border-border-subtle bg-surface-sunken/40 p-5" aria-labelledby="offre-publique">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="offre-publique" className="text-[16px] font-semibold text-text-primary">Offre affichée sur le site</h2>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {data.source === "PLAN" ? `Offre par défaut de la console : « ${data.planName} ».` : "Valeurs officielles du code : aucune offre complète n'est publiée dans la console."}
          </p>
        </div>
        {!data.officialIsLive && (
          <ConfirmAction
            label="Publier l'offre officielle"
            variant="primary"
            title="Publier l'offre officielle ?"
            description="L'offre « PharmaBoost Officine » devient l'offre par défaut : le site et les nouveaux contrats l'utilisent."
            consequences={[
              `Un seul abonnement : ${formatPriceEuros(OFFICIAL_OFFER.monthlyPriceCents)} HT par mois, engagement de ${OFFICIAL_OFFER.commitmentMonths} mois, mise en service ${formatPriceEuros(OFFICIAL_OFFER.setupFeeCents)} HT, aucun essai.`,
              data.previousDefaultName ? `« ${data.previousDefaultName} » n'est plus l'offre par défaut.` : "Aucune autre offre par défaut n'est remplacée.",
              "Aucun abonnement existant n'est modifié : chaque officine garde le tarif de son contrat.",
            ]}
            confirmLabel="Publier"
            onConfirm={async () => {
              const result = await publishOfficialOfferAction();
              if (result.ok) router.refresh();
              return result;
            }}
            successMessage="Offre officielle publiée."
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Item label="Abonnement mensuel" value={`${formatPriceEuros(data.monthlyPriceCents)} HT`} hint={`par mois, engagement de ${data.commitmentMonths} mois`} />
        <Item label="Mise en service" value={`${formatPriceEuros(data.setupFeeCents)} HT`} hint="une seule fois" />
        <Item label="Remise de parrainage" value={`${data.referralDiscountPercent} %`} hint="par mois, dès que la personne parrainée s'abonne" />
        <Item label="Affiliation" value={`${AFFILIATE_RATE_LABEL} à ${AFFILIATE_MAX_RATE_LABEL} / mois`} hint={`de l'abonnement de chaque pharmacie apportée, à vie, selon le palier (${AFFILIATE_TIERS_SENTENCE}) : de ${formatPriceEuros(exampleCents)} à ${formatPriceEuros(maxExampleCents)} par mois ici, + ${formatPriceEuros(AFFILIATE_SIGNUP_BONUS_CENTS)} de prime par pharmacie`} />
      </div>

      {data.gaps.length > 0 && <p className="text-[12.5px] text-warning-700 dark:text-warning-400">{data.gaps.join(" ")}</p>}

      <p className="border-t border-border-subtle pt-4 text-[12px] text-text-tertiary">Ces tarifs sont ceux du catalogue : ils ne s&apos;appliquent qu&apos;aux nouveaux abonnements. Le prix d&apos;une officine cliente ne change jamais. La commission des affiliés se calcule chaque mois sur l&apos;abonnement réellement facturé à chaque pharmacie (tarif de son contrat, remise de parrainage déduite).</p>
    </section>
  );
}
