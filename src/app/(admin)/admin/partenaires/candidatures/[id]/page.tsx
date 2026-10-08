import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Building2, CircleDot, ExternalLink, Inbox, MailCheck, StickyNote } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { getApplication, type TimelineEntry } from "@/server/services/partners/applications";
import { universeLabel } from "@/config/universes";
import { DataItem } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { ApplicationStatusBadge } from "../_components/status-badge";
import { PublicationBadge } from "../../liste/_components/publication-badge";
import { ApplicationWorkflow } from "./application-workflow";
import { ApplicationNoteForm } from "./application-note-form";

export const metadata: Metadata = { title: "Candidature partenaire" };

const API_ANSWER = { YES: "Oui", NO: "Non", UNKNOWN: "Ne sait pas" } as const;

function yesNo(value: boolean | null): string {
  if (value === null) return "Non précisé";
  return value ? "Oui" : "Non";
}

function hostOf(url: string): string {
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function hrefOf(url: string): string | null {
  try {
    const parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function TimelineItem({ entry }: { entry: TimelineEntry }) {
  const icon =
    entry.kind === "RECEIVED" ? <Inbox className="size-3.5" /> :
    entry.kind === "ACKNOWLEDGED" ? <MailCheck className="size-3.5" /> :
    entry.kind === "NOTE" ? <StickyNote className="size-3.5" /> :
    entry.kind === "PARTNER_CREATED" ? <Building2 className="size-3.5" /> :
    <CircleDot className="size-3.5" />;
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      <span className="relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-text-tertiary ring-4 ring-surface-card">{icon}</span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-text-primary">
          {entry.kind === "RECEIVED" && <span>Candidature reçue depuis le site</span>}
          {entry.kind === "ACKNOWLEDGED" && <span>Accusé de réception envoyé au contact</span>}
          {entry.kind === "NOTE" && <span className="font-medium">Note interne</span>}
          {entry.kind === "PARTNER_CREATED" && <span>Fiche partenaire créée</span>}
          {entry.kind === "STATUS_CHANGED" && (
            <>
              <span>Statut :</span>
              {entry.fromStatus ? <ApplicationStatusBadge status={entry.fromStatus} /> : <span className="text-text-tertiary">—</span>}
              <ArrowRight className="size-3.5 text-text-tertiary" aria-label="vers" />
              {entry.toStatus ? <ApplicationStatusBadge status={entry.toStatus} /> : <span className="text-text-tertiary">—</span>}
            </>
          )}
          {entry.kind === "OTHER" && <span>{entry.rawKind}</span>}
        </div>
        {entry.note && entry.kind !== "PARTNER_CREATED" && <p className="text-[13px] leading-5 break-words whitespace-pre-wrap text-text-secondary">{entry.note}</p>}
        {entry.note && entry.kind === "PARTNER_CREATED" && <p className="text-[12.5px] text-text-secondary">{entry.note}</p>}
        <p className="text-[12px] text-text-tertiary">
          {formatDateTime(entry.at)}
          {entry.author ? ` · ${entry.author}` : ""}
        </p>
      </div>
    </li>
  );
}

/**
 * Une candidature : tout ce que le laboratoire a déclaré, le chemin de la
 * candidature (seules les transitions permises sont proposées), les notes
 * internes et l'historique daté de chaque geste.
 */
export default async function PartnerApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePlatformSession();
  const application = await getApplication(id);
  if (!application) notFound();

  const website = application.website ? hrefOf(application.website) : null;

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href="/admin/partenaires/candidatures">Candidatures</Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl leading-8 font-bold tracking-[-0.025em] break-words text-text-primary">{application.brand}</h1>
          <p className="text-[13.5px] text-text-secondary">
            {application.company} · reçue le {formatDate(application.createdAt)}
          </p>
        </div>
        <ApplicationStatusBadge status={application.status} />
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <aside className="space-y-4 lg:col-start-3 lg:row-start-1">
          <Card>
            <CardHeader title="Avancement" description="Seules les étapes permises depuis le statut actuel sont proposées." />
            <CardContent>
              <ApplicationWorkflow id={application.id} status={application.status} partner={application.partner ? { id: application.partner.id, name: application.partner.name } : null} />
            </CardContent>
          </Card>

          {application.partner && (
            <Card>
              <CardHeader title="Fiche partenaire" />
              <CardContent className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/partenaires/liste/${application.partner.id}`} className="text-[14px] font-medium text-text-primary hover:underline">
                    {application.partner.name}
                  </Link>
                  <PublicationBadge status={application.partner.status} />
                </div>
                <p className="text-[12.5px] text-text-tertiary">Rien n&apos;est publié aux officines tant que le partenaire et ses marques ne sont pas passés en Test ou Actif.</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader title="Consentement et accusé" />
            <CardContent>
              <dl className="grid grid-cols-1 gap-3">
                <DataItem label="Consentement donné le">{formatDateTime(application.consentAt)}</DataItem>
                <DataItem label="Accusé de réception">
                  {application.acknowledgedAt ? `Envoyé le ${formatDateTime(application.acknowledgedAt)}` : <span className="text-text-secondary">Non envoyé</span>}
                </DataItem>
              </dl>
            </CardContent>
          </Card>
        </aside>

        <div className="space-y-4 lg:col-span-2 lg:col-start-1 lg:row-start-1">
          <Card>
            <CardHeader title="Société et contact" />
            <CardContent>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <DataItem label="Société">{application.company}</DataItem>
                <DataItem label="Marque">{application.brand}</DataItem>
                <DataItem label="Contact">
                  {application.contactFirstName} {application.contactLastName}
                  {application.contactRole ? <span className="block text-[12.5px] text-text-tertiary">{application.contactRole}</span> : null}
                </DataItem>
                <DataItem label="E-mail">
                  <a href={`mailto:${application.email}`} className="break-all text-brand-700 hover:underline dark:text-brand-400">
                    {application.email}
                  </a>
                </DataItem>
                <DataItem label="Téléphone">{application.phone ?? "—"}</DataItem>
                <DataItem label="Site">
                  {application.website ? (
                    website ? (
                      <a href={website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-brand-700 hover:underline dark:text-brand-400">
                        {hostOf(application.website)}
                        <ExternalLink className="size-3" aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="break-all">{application.website}</span>
                    )
                  ) : (
                    "—"
                  )}
                </DataItem>
                <DataItem label="Univers" className="sm:col-span-2">
                  {application.universes.length === 0 ? (
                    "—"
                  ) : (
                    <span className="flex flex-wrap gap-1.5">
                      {application.universes.map((key) => (
                        <Badge key={key} tone="neutral">
                          {universeLabel(key)}
                        </Badge>
                      ))}
                    </span>
                  )}
                </DataItem>
                <DataItem label="Références (environ)">{application.approxReferences !== null ? formatNumber(application.approxReferences) : "—"}</DataItem>
                <DataItem label="Distribution">{application.distribution ?? "—"}</DataItem>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Ce que la marque déclare" description="Déclaratif : rien n'est branché tant qu'une intégration n'est pas configurée sur la fiche partenaire." />
            <CardContent>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <DataItem label="API">{API_ANSWER[application.hasApi]}</DataItem>
                <DataItem label="Portail B2B">{yesNo(application.hasB2bPortal)}</DataItem>
                <DataItem label="Catalogue numérique">{yesNo(application.hasCatalog)}</DataItem>
                <DataItem label="Formations">{yesNo(application.hasTrainings)}</DataItem>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Message" />
            <CardContent>
              {application.message ? (
                <p className="text-[13.5px] leading-6 break-words whitespace-pre-wrap text-text-primary">{application.message}</p>
              ) : (
                <p className="text-[13px] text-text-tertiary">Aucun message.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Historique" description="Dans l'ordre chronologique : réception, changements de statut, notes internes." />
            <CardContent className="space-y-5">
              <ol className="relative before:absolute before:top-1 before:bottom-1 before:left-3 before:w-px before:bg-border-subtle">
                {application.timeline.map((entry) => (
                  <TimelineItem key={entry.id} entry={entry} />
                ))}
              </ol>
              <div className="border-t border-border-subtle pt-4">
                <ApplicationNoteForm id={application.id} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
