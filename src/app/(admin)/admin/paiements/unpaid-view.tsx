import Link from "next/link";
import { ArrowRight, BellRing, CircleCheck, ExternalLink, Settings2 } from "lucide-react";
import { stripeConfigState } from "@/server/billing/stripe-client";
import { loadAllTemplates } from "@/server/services/admin/email-templates";
import { listUnpaid, paymentAutomationRules } from "@/server/services/admin/billing-admin";
import { describeOffset } from "@/core/admin/automations";
import { dispatchStatusLabel } from "@/core/admin/statuses";
import { formatEuros, formatFrenchDate } from "@/core/billing/subscription";
import { AdminSection } from "@/components/admin/page-header";
import { KpiTile } from "@/components/admin/kpis";
import { ContactDialog } from "@/components/admin/contact-dialog";
import { StatusBadge, SubscriptionStatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from "@/components/ui/table";
import { DateText, RowLink, StripeNotConfigured } from "../abonnements/billing-ui";

const RULE_SHORT: Record<string, string> = {
  "payment.reminder_1": "1re relance",
  "payment.reminder_2": "2e relance",
  "payment.internal_alert": "Alerte équipe",
};

/**
 * Les impayés — une vue de la page « Paiements » : abonnements en retard (statut Stripe d'impayé) ou dont le dernier échec n'a
 * pas été suivi d'un paiement réussi. Pour chacun : le montant, le retard, les relances déjà parties (lecture seule), et le
 * geste « Relancer » — un e-mail du centre de modèles, ajustable, tracé. Rien n'est suspendu automatiquement.
 */
export async function UnpaidView({ rows }: { rows: Awaited<ReturnType<typeof listUnpaid>> }) {
  const [rules, templates] = await Promise.all([paymentAutomationRules(), loadAllTemplates()]);
  const stripe = stripeConfigState();
  const reminderTemplates = templates.filter((t) => t.key === "payment.failed_reminder" || t.key === "payment.unpaid_final" || t.key === "generic.message");
  const totalCents = rows.reduce((sum, r) => sum + (r.failedCents ?? 0), 0);
  const over7 = rows.filter((r) => (r.daysLate ?? 0) >= 7).length;
  const enabledRules = rules.filter((r) => r.enabled).length;

  return (
    <div className="space-y-6">
      {!stripe.configured && <StripeNotConfigured detail={stripe.detail}>Les échecs de paiement ne peuvent pas être signalés tant que Stripe n&apos;est pas branché.</StripeNotConfigured>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile label="Abonnements impayés" value={rows.length} tone={rows.length > 0 ? "danger" : "default"} hint={rows.length > 0 ? "À relancer ou à régulariser" : "Aucun impayé"} />
        <KpiTile label="Montant en échec" value={formatEuros(totalCents)} hint="Dernière facture non réglée de chaque abonnement" tone={totalCents > 0 ? "warning" : "default"} />
        <KpiTile label="Retard de 7 jours ou plus" value={over7} tone={over7 > 0 ? "danger" : "default"} hint="Depuis le dernier échec" />
      </div>

      <AdminSection
        title="Relances automatiques de paiement"
        description={enabledRules === 0 ? "Aucune relance automatique de paiement n'est active : seules les relances manuelles partent." : `${enabledRules} règle${enabledRules > 1 ? "s" : ""} active${enabledRules > 1 ? "s" : ""} sur ${rules.length}.`}
        action={
          <Button asChild variant="ghost" size="sm" leadingIcon={<Settings2 className="size-4" />}>
            <Link href="/admin/relances">Régler les relances</Link>
          </Button>
        }
      >
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {rules.map((rule) => (
            <li key={rule.key} className="flex items-start justify-between gap-3 rounded-xl border border-border-subtle px-4 py-3">
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium text-text-primary">{rule.label}</p>
                <p className="text-[12.5px] text-text-secondary">
                  {describeOffset(rule.offsetDays)} après l&apos;échec · {rule.channel === "EMAIL" ? "e-mail au titulaire" : "alerte interne"}
                </p>
              </div>
              <Badge tone={rule.enabled ? "success" : "neutral"}>{rule.enabled ? "Active" : "Désactivée"}</Badge>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] text-text-tertiary">Le titulaire reçoit en plus un e-mail système à chaque échec signalé par Stripe.</p>
      </AdminSection>

      <AdminSection title="Abonnements impayés" padded={false}>
        {rows.length === 0 ? (
          <EmptyState icon={<CircleCheck className="size-6" />} title="Aucun impayé pour l'instant" description="Tous les paiements échoués ont été régularisés, ou aucun échec n'a été signalé par Stripe." />
        ) : (
          <TableWrapper className="rounded-none border-0">
            <Table>
              <THead>
                <TR>
                  <TH>Officine</TH>
                  <TH numeric>Montant échoué</TH>
                  <TH>Échec du</TH>
                  <TH numeric>Retard</TH>
                  <TH>Statut</TH>
                  <TH>Relances parties</TH>
                  <TH className="text-right">Gestes</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.subscriptionId} interactive>
                    <TD>
                      {r.pharmacyId ? <RowLink href={`/admin/abonnements/${r.pharmacyId}`}>{r.pharmacyName}</RowLink> : <span className="text-text-secondary">{r.pharmacyName}</span>}
                      <p className="text-[12px] text-text-tertiary">{[r.city, r.planName].filter(Boolean).join(" · ")}</p>
                    </TD>
                    <TD numeric className="font-medium">
                      {r.failedCents !== null ? formatEuros(r.failedCents) : <span className="text-text-tertiary">—</span>}
                      {r.hostedInvoiceUrl && (
                        <a href={r.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="ml-1.5 inline-flex align-middle text-brand-700 dark:text-brand-300" aria-label="Voir la facture chez Stripe">
                          <ExternalLink className="size-3.5" aria-hidden="true" />
                        </a>
                      )}
                      {r.attemptCount ? <p className="text-[11.5px] font-normal text-text-tertiary">{r.attemptCount} tentative{r.attemptCount > 1 ? "s" : ""}</p> : null}
                    </TD>
                    <TD><DateText date={r.failedAt} /></TD>
                    <TD numeric>
                      {r.daysLate !== null ? <Badge tone={r.daysLate >= 7 ? "danger" : "warning"}>{r.daysLate} j</Badge> : <span className="text-text-tertiary">—</span>}
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        <SubscriptionStatusBadge status={r.status} />
                        {r.suspended && <Badge tone="danger">Accès suspendu</Badge>}
                      </div>
                    </TD>
                    <TD>
                      {r.dispatches.length === 0 && r.manualReminders === 0 ? (
                        <span className="text-[12.5px] text-text-tertiary">Aucune</span>
                      ) : (
                        <ul className="space-y-1">
                          {r.dispatches.map((d) => (
                            <li key={d.id} className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                              <BellRing className="size-3.5 text-text-tertiary" aria-hidden="true" />
                              <span className="text-text-primary">{RULE_SHORT[d.ruleKey] ?? d.ruleKey}</span>
                              <span className="text-text-tertiary tabular-nums">{formatFrenchDate(d.createdAt)}</span>
                              <StatusBadge status={d.status === "INTERNAL" ? { label: "Interne", tone: "info" } : d.status === "SKIPPED" ? { label: "Ignorée", tone: "neutral" } : dispatchStatusLabel(d.status)} />
                            </li>
                          ))}
                          {r.manualReminders > 0 && (
                            <li className="text-[12.5px] text-text-secondary">
                              {r.manualReminders} relance{r.manualReminders > 1 ? "s" : ""} manuelle{r.manualReminders > 1 ? "s" : ""}
                            </li>
                          )}
                        </ul>
                      )}
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1.5">
                        {r.pharmacyId && <ContactDialog pharmacyId={r.pharmacyId} templates={reminderTemplates} defaultTemplateKey={(r.daysLate ?? 0) >= 7 || r.dispatches.some((d) => d.ruleKey === "payment.reminder_1") ? "payment.unpaid_final" : "payment.failed_reminder"} label="Relancer" />}
                        {r.pharmacyId && (
                          <Link href={`/admin/abonnements/${r.pharmacyId}`} className="flex size-8 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-text-primary" aria-label={`Ouvrir l'abonnement de ${r.pharmacyName}`}>
                            <ArrowRight className="size-4" aria-hidden="true" />
                          </Link>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        )}
      </AdminSection>
    </div>
  );
}
