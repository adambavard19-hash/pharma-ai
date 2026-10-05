import Link from "next/link";
import { Briefcase } from "lucide-react";
import { loadCommercialTab, type Pharmacy360 } from "@/server/services/admin/pharmacy-360";
import { AdminSection, FactList } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Timeline } from "@/components/admin/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { REFERRAL_DISCOUNT_CENTS, referralAmountFor } from "@/core/billing/referral";
import { formatEuros, formatFrenchDate } from "@/core/billing/subscription";
import { ORIGIN_LABELS } from "@/core/contracts/journey";
import { PROSPECT_STATUS_LABELS, PROSPECT_STATUS_TONES, type ProspectStatusCode } from "@/core/sales/pipeline";
import { onboardingStage } from "@/core/onboarding/stage";
import { describeMissing, missingContractFields } from "@/core/contracts/requirements";
import { prospectEventEntry } from "@/core/admin/clients";
import { formatDateTime } from "@/lib/format";
import { When } from "../client-ui";
import { EmptyLine } from "./shared";

/** Ce que le montant apporté au parrain dit de son origine : standard, ou une offre en cours à l'inscription. */
function referralAmountNote(amountCents: number | null): string {
  if (amountCents === null) return "Montant standard : aucune offre n'était en cours à son inscription.";
  return amountCents === REFERRAL_DISCOUNT_CENTS ? "Montant standard, figé à son inscription." : "Montant d'une offre de parrainage en cours à son inscription : figé, il ne change plus.";
}

/** Le dossier commercial dont l'officine est issue : étape, commercial, démo, relances, tâches. */
export async function CommercialTab({ base, now }: { base: Pharmacy360; now: Date }) {
  const { pharmacy } = base;
  const prospect = pharmacy.prospect;

  const referral = (
    <AdminSection title="Parrainage">
      <FactList
        items={[
          { label: "Code de parrainage", value: pharmacy.referralCode ?? "Attribué à la première ouverture de l'onglet Mon abonnement" },
          { label: "Parrainée par", value: pharmacy.referredBy ? <Link href={`/admin/pharmacies/${pharmacy.referredBy.id}`} className="text-brand-700 hover:underline dark:text-brand-400">{pharmacy.referredBy.name}</Link> : "—" },
          // Pour un filleul : ce qu'il apporte à son parrain chaque mois, tel que figé à son inscription.
          ...(pharmacy.referredBy ? [{ label: "Montant apporté à son parrain", value: `${formatEuros(referralAmountFor(pharmacy))} par mois`, hint: referralAmountNote(pharmacy.referralAmountCents) }] : []),
          {
            label: `Filleules (${pharmacy.referrals.length})`,
            value:
              pharmacy.referrals.length === 0 ? (
                "Aucune"
              ) : (
                <ul className="space-y-0.5">
                  {pharmacy.referrals.map((r) => (
                    <li key={r.id}>
                      <Link href={`/admin/pharmacies/${r.id}`} className="text-brand-700 hover:underline dark:text-brand-400">
                        {r.name}
                      </Link>
                      {r.city ? ` · ${r.city}` : ""}
                      {/* Le montant figé n'est dit que lorsqu'il diffère du standard : c'est lui qui change la remise du parrain. */}
                      {r.referralAmountCents !== null && r.referralAmountCents !== REFERRAL_DISCOUNT_CENTS ? ` · ${formatEuros(r.referralAmountCents)} par mois (offre à son inscription)` : ""}
                      {r.isActive ? "" : " · suspendue"}
                    </li>
                  ))}
                </ul>
              ),
          },
        ]}
      />
    </AdminSection>
  );

  if (!prospect) {
    return (
      <div className="space-y-5">
        <AdminSection>
          <EmptyState icon={<Briefcase className="size-5" />} title="Aucun dossier commercial" description="Cette officine a été créée sans dossier : il n'y a ni étape de pipeline ni commercial rattaché." />
        </AdminSection>
        {referral}
      </div>
    );
  }

  const data = await loadCommercialTab(base);
  const missing = missingContractFields(prospect);
  const stage = onboardingStage({ prospectStatus: prospect.status, contract: prospect.contracts[0] ?? null, missingCount: missing.length, now });
  const status = prospect.status as ProspectStatusCode;
  const late = prospect.nextActionAt && prospect.nextActionAt < now;

  return (
    <div className="space-y-5">
      <AdminSection
        title="Dossier commercial"
        description={`Ouvert le ${formatFrenchDate(prospect.createdAt)}.`}
        action={
          <Button asChild size="sm" variant={stage.stage === "CONTRACT_TO_SEND" ? "primary" : "outline"}>
            <Link href={`/admin/dossiers/${prospect.id}`}>{stage.stage === "CONTRACT_TO_SEND" ? "Envoyer le contrat" : "Ouvrir le dossier"}</Link>
          </Button>
        }
      >
        <div className="space-y-4">
          <FactList
            className="lg:grid-cols-3"
            items={[
              { label: "Étape du pipeline", value: <StatusBadge status={{ label: PROSPECT_STATUS_LABELS[status] ?? prospect.status, tone: PROSPECT_STATUS_TONES[status] ?? "neutral" }} /> },
              { label: "Inscription et contrat", value: <Badge tone={stage.tone === "brand" ? "brand" : stage.tone}>{stage.label}</Badge> },
              { label: "Commercial responsable", value: prospect.salesRep ? `${prospect.salesRep.firstName} ${prospect.salesRep.lastName}` : "Tenu par la console", hint: prospect.salesRep?.email },
              { label: "Origine", value: ORIGIN_LABELS[prospect.origin] ?? prospect.origin },
              { label: "Démonstration", value: prospect.demoDoneAt ? `Réalisée le ${formatFrenchDate(prospect.demoDoneAt)}` : prospect.demoAt ? `Programmée le ${formatDateTime(prospect.demoAt)}` : "Aucune" },
              { label: "Dernier contact", value: <When date={prospect.lastContactAt} empty="Aucun" /> },
              {
                label: "Prochaine action",
                value: prospect.nextActionAt ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    {prospect.nextActionLabel ?? "Relance"} · {formatFrenchDate(prospect.nextActionAt)}
                    {late && <Badge tone="warning">En retard</Badge>}
                  </span>
                ) : (
                  "Aucune"
                ),
              },
              { label: "Conditions proposées", value: prospect.monthlyPriceCents !== null ? `${formatEuros(prospect.monthlyPriceCents)} HT/mois` : null },
              { label: "Contact du dossier", value: prospect.ownerName ?? prospect.email, hint: prospect.ownerName ? prospect.email : undefined },
            ]}
          />
          {missing.length > 0 && <p className="text-[13px] text-text-secondary">Informations nécessaires au contrat à compléter : {describeMissing(missing)}.</p>}
          {prospect.duplicateWarning && <Alert tone="warning">{prospect.duplicateWarning}</Alert>}
          {prospect.blockedAt && <Alert tone="warning" title={`Dossier bloqué depuis le ${formatFrenchDate(prospect.blockedAt)}`}>{prospect.blockedReason ?? "Sans motif indiqué."}</Alert>}
          {prospect.lostReason && <Alert tone="danger" title="Dossier perdu">{prospect.lostReason}</Alert>}
        </div>
      </AdminSection>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <AdminSection title="Notes du dossier" description="Les notes commerciales courantes, visibles du commercial.">
          {prospect.notes?.trim() ? <p className="text-[13.5px] leading-6 whitespace-pre-line text-text-primary">{prospect.notes}</p> : <EmptyLine>Aucune note sur le dossier.</EmptyLine>}
        </AdminSection>

        <AdminSection title="Tâches commerciales">
          {data.tasks.length === 0 ? (
            <EmptyLine>Aucune tâche planifiée.</EmptyLine>
          ) : (
            <ul className="-my-2 divide-y divide-border-subtle">
              {data.tasks.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="min-w-0">
                    <span className={task.doneAt ? "block text-[13px] text-text-tertiary line-through" : "block text-[13px] font-medium text-text-primary"}>{task.label}</span>
                    <span className="block text-[12px] text-text-tertiary">
                      {formatFrenchDate(task.dueAt)} · {task.salesRep.firstName} {task.salesRep.lastName}
                    </span>
                  </span>
                  {task.doneAt ? <Badge tone="success">Faite</Badge> : task.dueAt < now ? <Badge tone="warning">En retard</Badge> : <Badge tone="info">À faire</Badge>}
                </li>
              ))}
            </ul>
          )}
        </AdminSection>
      </div>

      <AdminSection title="Derniers événements du dossier" action={<Link href={`/admin/dossiers/${prospect.id}`} className="text-[12.5px] font-medium text-brand-700 hover:underline dark:text-brand-400">Tout le dossier</Link>}>
        <Timeline entries={data.events.map(prospectEventEntry)} emptyText="Aucun événement sur le dossier." />
      </AdminSection>

      {referral}
    </div>
  );
}
