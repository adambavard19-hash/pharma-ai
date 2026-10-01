"use client";

import { useState } from "react";
import { Copy, Check, Gift, Users } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCents, formatDate } from "@/lib/format";

type Referral = { name: string; city: string | null; active: boolean; since: string };

/**
 * Parrainage, vu du titulaire : son code, son lien à partager, ses filleuls
 * et ce que ça change sur son abonnement. Chaque filleul actif retire une
 * somme fixe par mois ; à partir d'assez de filleuls, l'abonnement est à zéro.
 */
export function ReferralCard({ referral }: { referral: { code: string; link: string; discountPerReferralCents: number; monthlyPriceCents: number | null; referrals: Referral[]; activeCount: number; discountCents: number; referredBy: string | null } }) {
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
  const toFree = price === null ? null : Math.max(0, Math.ceil(price / referral.discountPerReferralCents) - referral.activeCount);

  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Gift className="size-4 text-brand-600 dark:text-brand-400" />
            Parrainage : plus vous recommandez, moins vous payez
          </span>
        }
        description={`Chaque officine que vous parrainez retire ${formatCents(referral.discountPerReferralCents)} HT par mois de votre abonnement, tant qu'elle est abonnée. Jusqu'à l'abonnement gratuit.`}
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
          <p className="text-[13px] leading-5 text-text-secondary">Un confrère s&apos;abonne avec votre code ou votre lien : il devient votre filleul dès que son espace est créé. La remise s&apos;applique à votre prochain prélèvement, et elle apparaît sur votre facture.</p>
          {referral.referredBy && <p className="text-[12.5px] text-text-tertiary">Vous avez été parrainé par {referral.referredBy}.</p>}
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Filleuls actifs" value={String(referral.activeCount)} />
            <Stat label="Remise par mois" value={`− ${formatCents(referral.discountCents)}`} />
            <Stat label="Votre abonnement" value={after === null ? "—" : after === 0 ? "0 €" : `${formatCents(after)} HT`} />
          </div>
          {toFree !== null && (
            <p className="text-[13px] leading-5 text-text-secondary">
              {toFree === 0 ? "Votre abonnement est entièrement couvert par vos parrainages." : `Encore ${toFree} filleul${toFree > 1 ? "s" : ""} actif${toFree > 1 ? "s" : ""} et votre abonnement est gratuit.`}
            </p>
          )}
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
