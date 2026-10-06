import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText } from "lucide-react";
import { requireDirectorSession } from "@/server/auth/director-session";
import { getSalesApplication } from "@/server/services/sales-applications/admin";
import { getStandardCommissionCents } from "@/server/services/standard-commission";
import { currentStatusLabel } from "@/core/sales-applications/status";
import { formatPriceEuros } from "@/core/pricing/official-offer";
import { AdminPageHeader, AdminSection, FactList } from "@/components/admin/page-header";
import { Timeline } from "@/components/admin/timeline";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime } from "@/lib/format";
import { SalesApplicationStatusBadge } from "@/app/(admin)/admin/candidatures-commerciales/_components/status";
import { StatusActions } from "./status-actions";
import { NoteForm } from "./note-form";
import { ConvertPanel } from "./convert-panel";

export const metadata: Metadata = { title: "Candidature commerciale" };

/** « 412 Ko », « 1,2 Mo » : la taille du CV, lisible. */
function formatFileSize(bytes: number | null): string | null {
  if (bytes === null || bytes < 0) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

/**
 * Une candidature, comme dans la console : tout ce que la personne a déclaré,
 * son CV (téléchargement tracé à votre nom), le statut à faire avancer, la
 * création du commercial une fois la candidature acceptée, les notes internes
 * et l'historique daté de chaque geste.
 */
export default async function SalesApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireDirectorSession();
  const { id } = await params;
  const application = await getSalesApplication(id, { repBasePath: "/directeur/commerciaux" });
  if (!application) notFound();

  const name = `${application.firstName} ${application.lastName}`.trim();
  const canConvert = application.status === "ACCEPTED" && !application.salesRep;
  const commissionLabel = canConvert ? formatPriceEuros(await getStandardCommissionCents()) : null;
  const cvSize = application.cv ? formatFileSize(application.cv.sizeBytes) : null;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        parent={{ label: "Candidatures", href: "/directeur/candidatures" }}
        title={name}
        badge={<SalesApplicationStatusBadge status={application.status} />}
        description={`Candidature reçue le ${formatDate(application.createdAt)}.`}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <aside className="space-y-4 lg:col-start-3 lg:row-start-1">
          <AdminSection title="Avancement" description="Chaque changement de statut est inscrit dans l'historique.">
            <StatusActions id={application.id} status={application.status} locked={application.salesRep !== null} />
          </AdminSection>

          <AdminSection title="Commercial">
            {application.salesRep ? (
              <div className="space-y-2">
                <p className="text-[13px] text-text-secondary">Cette candidature est devenue un commercial.</p>
                <p className="flex flex-wrap items-center gap-2">
                  <Link href={`/directeur/commerciaux/${application.salesRep.id}`} className="text-[14px] font-medium text-text-primary hover:underline">
                    {application.salesRep.name}
                  </Link>
                  {!application.salesRep.isActive && <Badge tone="neutral">Désactivé</Badge>}
                </p>
              </div>
            ) : canConvert && commissionLabel ? (
              <ConvertPanel id={application.id} name={name} email={application.email} commissionLabel={commissionLabel} />
            ) : (
              <p className="text-[13px] leading-5 text-text-secondary">La transformation en commercial est proposée une fois la candidature acceptée.</p>
            )}
          </AdminSection>

          <AdminSection title="CV">
            {application.cv ? (
              <div className="space-y-3">
                <p className="flex items-start gap-2 text-[13px] text-text-primary">
                  <FileText className="mt-0.5 size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
                  <span className="min-w-0 break-words">
                    {application.cv.fileName}
                    {cvSize ? <span className="text-text-tertiary"> · {cvSize}</span> : null}
                  </span>
                </p>
                <Button asChild variant="outline" size="sm" leadingIcon={<Download className="size-3.5" />}>
                  <a href={`/api/directeur/candidatures/${application.id}/cv`}>Télécharger le CV</a>
                </Button>
                <p className="text-[12px] text-text-tertiary">Chaque téléchargement est inscrit dans le journal d&apos;audit, à votre nom.</p>
              </div>
            ) : (
              <p className="text-[13px] text-text-secondary">Aucun CV déposé.</p>
            )}
          </AdminSection>

          <AdminSection title="Consentement et accusé">
            <FactList
              className="sm:grid-cols-1"
              items={[
                { label: "Consentement donné le", value: formatDateTime(application.consentAt) },
                { label: "Accusé de réception", value: application.acknowledgedAt ? `Envoyé le ${formatDateTime(application.acknowledgedAt)}` : <span className="text-text-secondary">Non envoyé</span> },
              ]}
            />
          </AdminSection>
        </aside>

        <div className="space-y-4 lg:col-span-2 lg:col-start-1 lg:row-start-1">
          <AdminSection title="Identité et contact">
            <FactList
              items={[
                { label: "Prénom", value: application.firstName },
                { label: "Nom", value: application.lastName },
                {
                  label: "E-mail",
                  value: (
                    <a href={`mailto:${application.email}`} className="break-all text-brand-700 hover:underline dark:text-brand-400">
                      {application.email}
                    </a>
                  ),
                },
                { label: "Téléphone", value: application.phone },
                { label: "Ville ou secteur", value: application.city },
                { label: "Zone souhaitée", value: application.zone },
                { label: "Situation actuelle", value: currentStatusLabel(application.currentStatus) },
              ]}
            />
          </AdminSection>

          <AdminSection title="Expérience">
            <div className="space-y-4">
              <div>
                <p className="text-[12px] font-medium text-text-tertiary">Expérience commerciale</p>
                <p className="mt-0.5 text-[14px] leading-6 break-words whitespace-pre-wrap text-text-primary">{application.salesExperience}</p>
              </div>
              <div>
                <p className="text-[12px] font-medium text-text-tertiary">Expérience avec les pharmacies ou la santé</p>
                {application.healthExperience ? (
                  <p className="mt-0.5 text-[14px] leading-6 break-words whitespace-pre-wrap text-text-primary">{application.healthExperience}</p>
                ) : (
                  <p className="mt-0.5 text-[13px] text-text-tertiary">Non précisée.</p>
                )}
              </div>
            </div>
          </AdminSection>

          <AdminSection title="Message">
            <p className="text-[14px] leading-6 break-words whitespace-pre-wrap text-text-primary">{application.message}</p>
          </AdminSection>

          <AdminSection title="Historique" description="Dans l'ordre chronologique : réception, changements de statut, notes internes, création du commercial.">
            <div className="space-y-5">
              <Timeline entries={application.timeline} />
              <div className="border-t border-border-subtle pt-4">
                <NoteForm id={application.id} />
              </div>
            </div>
          </AdminSection>
        </div>
      </div>
    </div>
  );
}
