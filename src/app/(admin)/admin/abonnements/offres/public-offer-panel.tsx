"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveStandardCommissionAction, publishOfficialOfferAction } from "@/server/actions/admin-pricing";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatPriceEuros } from "@/core/pricing/official-offer";

export type PublicOfferPanelData = {
  source: "PLAN" | "OFFICIAL_DEFAULT";
  planName: string;
  monthlyPriceCents: number;
  monthlySetupFeeCents: number;
  annualPriceCents: number;
  annualSetupFeeCents: number;
  commitmentMonths: number;
  commissionCents: number;
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
 * Ce que le site affiche, d'où cela vient, et la commission standard : les cinq
 * montants de l'offre au même endroit, avec le geste pour publier l'offre officielle.
 */
export function PublicOfferPanel({ data }: { data: PublicOfferPanelData }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [commission, setCommission] = useState(String(data.commissionCents / 100).replace(".", ","));
  const annualSetup = data.annualSetupFeeCents === 0 ? "Offerte" : `${formatPriceEuros(data.annualSetupFeeCents)} HT`;

  const saveCommission = () =>
    start(async () => {
      const result = await saveStandardCommissionAction({ amountEuros: commission });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Enregistré.") : result.error });
      if (result.ok) router.refresh();
    });

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
              "99 € HT par mois, mise en service 390 € HT ; 1 188 € HT par an, mise en service offerte, aucun essai.",
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Item label="Tarif mensuel" value={`${formatPriceEuros(data.monthlyPriceCents)} HT`} hint="par mois et par officine" />
        <Item label="Mise en service mensuelle" value={`${formatPriceEuros(data.monthlySetupFeeCents)} HT`} hint="une seule fois" />
        <Item label="Tarif annuel" value={`${formatPriceEuros(data.annualPriceCents)} HT`} hint={`par an, engagement ${data.commitmentMonths} mois`} />
        <Item label="Mise en service annuelle" value={annualSetup} />
        <Item label="Commission standard" value={formatPriceEuros(data.commissionCents)} hint="par pharmacie activée" />
      </div>

      {data.gaps.length > 0 && <p className="text-[12.5px] text-warning-700 dark:text-warning-400">{data.gaps.join(" ")}</p>}

      <div className="flex flex-wrap items-end gap-2 border-t border-border-subtle pt-4">
        <label className="space-y-1" htmlFor="commission-standard">
          <span className="block text-[12px] font-medium text-text-secondary">Commission standard (€ par pharmacie activée)</span>
          <Input id="commission-standard" inputMode="decimal" value={commission} onChange={(e) => setCommission(e.target.value)} className="w-40" />
        </label>
        <Button variant="outline" size="sm" loading={pending} onClick={saveCommission}>Enregistrer la commission</Button>
        <p className="basis-full text-[12px] text-text-tertiary">Ces tarifs sont ceux du catalogue : ils ne s&apos;appliquent qu&apos;aux nouveaux abonnements et aux nouveaux commerciaux. Le prix d&apos;une officine cliente et la commission d&apos;un commercial existant ne changent jamais.</p>
      </div>
    </section>
  );
}
