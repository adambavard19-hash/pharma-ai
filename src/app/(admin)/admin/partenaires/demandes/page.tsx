import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, ShieldCheck } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { INFO_REQUEST_STATUSES, listInfoRequests, type InfoRequestStatus } from "@/server/services/mobile/sponsoring-admin";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PROFESSION_LABELS, isProfession } from "@/core/mobile/profile";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { InfoRequestButtons } from "./status-buttons";

export const metadata: Metadata = { title: "Demandes d'information" };

const LABELS: Record<InfoRequestStatus, string> = { NEW: "À transmettre", TRANSMITTED: "Transmise", HANDLED: "Traitée", CANCELLED: "Annulée" };
const TONES = { NEW: "warning", TRANSMITTED: "info", HANDLED: "success", CANCELLED: "neutral" } as const;

/**
 * Les demandes « Demander des informations » envoyées depuis l'application mobile, avec la PREUVE du consentement :
 * le texte exact affiché et l'instant où la case a été cochée. Seules les données listées dans ce texte peuvent être
 * transmises au partenaire.
 */
export default async function InfoRequestsPage({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  await requirePlatformSession();
  const { statut } = await searchParams;
  const status = (INFO_REQUEST_STATUSES as readonly string[]).includes(statut ?? "") ? (statut as InfoRequestStatus) : null;
  const requests = await listInfoRequests({ status });
  const chip = (active: boolean) => cn("rounded-full border px-3 py-1 text-[12.5px] font-medium", active ? "border-brand-600 bg-brand-50 text-brand-700" : "border-border-default text-text-secondary");

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="font-bold tracking-[-0.02em] text-text-primary">Demandes d&apos;information</h1>
        <p className="max-w-2xl text-[14px] text-text-secondary">
          Envoyées depuis l&apos;onglet Découvertes. Transmises automatiquement par e-mail quand le partenaire a un contact avec une adresse ; sinon, à transmettre par l&apos;équipe.
        </p>
      </div>
      <nav aria-label="Filtrer par statut" className="flex flex-wrap gap-1.5">
        <Link href="/admin/partenaires/demandes" className={chip(!status)}>
          Toutes
        </Link>
        {INFO_REQUEST_STATUSES.map((entry) => (
          <Link key={entry} href={`/admin/partenaires/demandes?statut=${entry}`} className={chip(status === entry)}>
            {LABELS[entry]}
          </Link>
        ))}
      </nav>
      {requests.length === 0 ? (
        <Card>
          <EmptyState icon={<Inbox className="size-5" />} title="Aucune demande" description="Les demandes d'information des professionnels, avec leur consentement, apparaîtront ici." />
        </Card>
      ) : (
        <ul className="space-y-3">
          {requests.map((request) => (
            <li key={request.id}>
              <Card>
                <CardContent className="space-y-3 pt-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={TONES[request.status]}>{LABELS[request.status]}</Badge>
                        <span className="text-[14.5px] font-semibold text-text-primary">
                          {request.brand.name} <span className="font-normal text-text-tertiary">· {request.partner.name}</span>
                        </span>
                      </div>
                      <p className="text-[13px] text-text-secondary">
                        {request.user.firstName} {request.user.lastName} · {request.user.email}
                        {request.user.profession && isProfession(request.user.profession) ? ` · ${PROFESSION_LABELS[request.user.profession]}` : ""}
                        {request.pharmacy ? ` · ${request.pharmacy.name}` : ""}
                      </p>
                      <p className="text-[12px] text-text-tertiary">
                        Reçue le {formatDateTime(request.createdAt)}
                        {request.launch ? ` · depuis « ${request.launch.title} »` : ""}
                        {request.transmittedAt ? ` · transmise le ${formatDateTime(request.transmittedAt)}` : ""}
                        {request.partner.contacts.length === 0 ? " · le partenaire n'a aucun contact avec e-mail" : ""}
                      </p>
                    </div>
                    <InfoRequestButtons id={request.id} status={request.status} />
                  </div>
                  {request.message && <p className="rounded-lg bg-surface-sunken px-3 py-2 text-[13.5px] whitespace-pre-line text-text-primary">{request.message}</p>}
                  <div className="flex items-start gap-2 rounded-lg border border-border-subtle px-3 py-2 text-[12.5px] text-text-secondary">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success-700" aria-hidden="true" />
                    <p>
                      <span className="font-semibold text-text-primary">Consentement coché le {formatDateTime(request.consentAt)} :</span> « {request.consentText} »
                    </p>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
