import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { listPatientEmails } from "@/server/services/patient-emails";
import { EMAIL_PERIODS, EMAIL_STATE_FILTERS, PATIENT_EMAIL_STATES, resolveEmailFilters } from "@/core/counter/patient-emails";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "E-mails aux patients" };

const when = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * « E-mails aux patients » : les bilans envoyés par e-mail depuis le comptoir. Au comptoir, c'est la seule chose qui part au
 * patient. Réservé au titulaire (une vue de toute l'officine, tous comptoirs confondus). Aucune adresse : elle est effacée après
 * l'envoi ; aucune ouverture : elle n'est pas suivie.
 */
export default async function PatientEmailsPage({ searchParams }: { searchParams: Promise<{ periode?: string; etat?: string }> }) {
  const session = await requirePermission(PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE);
  const params = await searchParams;
  const { period, state } = resolveEmailFilters(params);
  const { rows, truncated } = await listPatientEmails(session.scope, { days: period.days, states: state.states });
  const href = (next: { periode?: string; etat?: string }) => {
    const query = new URLSearchParams({ periode: next.periode ?? period.key, etat: next.etat ?? state.key });
    return `/emails-patients?${query.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="E-mails aux patients"
        description="Les bilans envoyés par e-mail à vos patients depuis le comptoir, avec leur accord : quand, par quel comptoir, avec quels produits, et si l'envoi a réussi. L'adresse du patient est effacée après l'envoi : elle n'apparaît jamais ici."
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <FilterGroup label="Période" items={EMAIL_PERIODS.map((item) => ({ key: item.key, label: item.label, href: href({ periode: item.key }), active: item.key === period.key }))} />
        <FilterGroup label="État" items={EMAIL_STATE_FILTERS.map((item) => ({ key: item.key, label: item.label, href: href({ etat: item.key }), active: item.key === state.key }))} />
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MailCheck className="size-5" />}
            title={state.key === "tous" ? "Aucun bilan envoyé sur cette période" : "Aucun bilan dans cet état sur cette période"}
            description="Au comptoir, quand le patient accepte de recevoir son bilan, saisissez son adresse avant « Terminer la vente » : le bilan part avec les produits déclarés vendus, puis l'adresse est effacée."
          />
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[14px]">
                <thead className="border-b border-border-subtle text-[12px] font-semibold tracking-wide text-text-tertiary uppercase">
                  <tr>
                    <th scope="col" className="px-4 py-3">Date</th>
                    <th scope="col" className="px-4 py-3">Comptoir · personne</th>
                    <th scope="col" className="px-4 py-3">Produits dans le bilan</th>
                    <th scope="col" className="px-4 py-3">État</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {rows.map((row) => {
                    const meta = PATIENT_EMAIL_STATES[row.state];
                    return (
                      <tr key={row.saleId} className="align-top">
                        <td className="px-4 py-3 whitespace-nowrap text-text-primary tabular-nums">{when.format(row.at)}</td>
                        <td className="px-4 py-3">
                          <span className="block text-text-primary">{row.comptoir ?? "—"}</span>
                          {row.person && <span className="block text-[12.5px] text-text-tertiary">{row.person}</span>}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{row.products.length > 0 ? row.products.join(", ") : <span className="text-text-tertiary">Aucun produit déclaré vendu</span>}</td>
                        <td className="px-4 py-3">
                          <Badge tone={meta.tone} title={meta.detail}>{meta.label}</Badge>
                          <span className="mt-1 block max-w-[16rem] text-[12px] leading-4 text-text-tertiary">{meta.detail}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
      <p className="text-[12.5px] text-text-tertiary">
        {truncated ? "Seuls les 200 plus récents sont affichés. " : ""}L&apos;ouverture des e-mails n&apos;est pas suivie : PharmaBoost ne sait pas si le patient a lu son bilan.
      </p>
    </div>
  );
}

function FilterGroup({ label, items }: { label: string; items: { key: string; label: string; href: string; active: boolean }[] }) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[12.5px] font-medium text-text-tertiary">{label}</span>
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none",
            item.active ? "border-brand-700 bg-brand-700 text-white" : "border-border-default bg-surface-card text-text-secondary hover:bg-surface-sunken hover:text-text-primary",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
