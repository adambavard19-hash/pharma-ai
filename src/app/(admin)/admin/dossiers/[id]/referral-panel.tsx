import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { REFERRAL_DISCOUNT_PERCENT } from "@/core/billing/referral";
import { loadReferralPanel, REFERRAL_LEAD_STATUS_LABELS, type ReferralLeadStatus } from "@/server/services/referral-leads";
import { ReferralLeadActions } from "./referral-lead-actions";

const STATUS_TONES: Record<ReferralLeadStatus, "neutral" | "info" | "success" | "warning"> = { NEW: "warning", CONTACTED: "info", LINKED: "success", DECLINED: "neutral" };

/**
 * Le parrainage, sur la fiche du dossier : les confrères que ce dossier a proposé de
 * parrainer (l'équipe les contacte, rien ne leur est envoyé), et, pour un dossier
 * parrainé, par qui. Si la personne ouvre son dossier avec la même adresse e-mail, il
 * est rapproché ici ; une fois son officine créée, le parrain passe à 20 % de moins.
 */
export async function ReferralPanel({ prospectId }: { prospectId: string }) {
  const { proposed, referredBy } = await loadReferralPanel(prospectId);
  const hasReferrer = Boolean(referredBy.viaLead || referredBy.viaCode);

  if (proposed.length === 0 && !hasReferrer) {
    return (
      <Card>
        <CardHeader title="Parrainage" />
        <CardContent className="pb-5">
          <p className="text-[13px] text-text-secondary">Aucun confrère proposé au parrainage, et ce dossier n&apos;est parrainé par personne.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Parrainage" description={`Une officine parrainée qui s'abonne fait passer son parrain à ${REFERRAL_DISCOUNT_PERCENT} % de moins par mois, une seule fois.`} />
      <CardContent className="space-y-5 pb-5">
        {hasReferrer && (
          <div className="space-y-1">
            <p className="text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase">Parrainé par</p>
            {referredBy.viaLead && (
              <p className="text-[13.5px] text-text-primary">
                <Link href={`/admin/dossiers/${referredBy.viaLead.prospectId}`} className="text-brand-700 hover:underline dark:text-brand-400">{referredBy.viaLead.name}</Link>
                <span className="text-text-tertiary"> · l&apos;a proposé comme confrère à parrainer</span>
              </p>
            )}
            {referredBy.viaCode && (
              <p className="text-[13.5px] text-text-primary">
                <Link href={`/admin/pharmacies/${referredBy.viaCode.pharmacyId}`} className="text-brand-700 hover:underline dark:text-brand-400">{referredBy.viaCode.name}</Link>
                <span className="text-text-tertiary"> · code de parrainage {referredBy.viaCode.code}</span>
              </p>
            )}
          </div>
        )}

        {proposed.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase">Confrères proposés au parrainage</p>
            <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
              {proposed.map((lead) => (
                <li key={lead.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
                  <span className="min-w-0 flex-1 text-[13.5px]">
                    <span className="block truncate font-medium text-text-primary">{lead.name ?? lead.email}</span>
                    <span className="block truncate text-[12.5px] text-text-secondary">{lead.name ? `${lead.email} · ` : ""}{lead.phone}</span>
                    <span className="block text-[12px] text-text-tertiary">
                      Proposé le {formatDate(lead.createdAt)}
                      {lead.linkedProspect && (
                        <>
                          {" · dossier ouvert : "}
                          <Link href={`/admin/dossiers/${lead.linkedProspect.id}`} className="text-brand-700 hover:underline dark:text-brand-400">{lead.linkedProspect.name}</Link>
                        </>
                      )}
                    </span>
                  </span>
                  <Badge tone={STATUS_TONES[lead.status]}>{REFERRAL_LEAD_STATUS_LABELS[lead.status]}</Badge>
                  {lead.status !== "LINKED" && <ReferralLeadActions leadId={lead.id} status={lead.status} />}
                </li>
              ))}
            </ul>
            <p className="text-[12px] text-text-tertiary">L&apos;équipe contacte ces personnes : rien ne leur est envoyé automatiquement.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
