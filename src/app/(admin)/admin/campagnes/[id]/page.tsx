import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Inbox } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { getMessagingProvider } from "@/server/ai/registry";
import { listCampaignRecipients, loadCampaign, previewAudience } from "@/server/services/admin/campaigns";
import { CAMPAIGN_AUDIENCES, CAMPAIGN_BUTTON_TARGETS, CAMPAIGN_KINDS, describeSchedule } from "@/core/admin/campaigns";
import { formatEuros, formatFrenchDate } from "@/core/billing/subscription";
import { calendarDay } from "@/core/challenges/dates";
import { TIME_ZONE } from "@/config/constants";
import { AdminPageHeader, AdminSection, FactList } from "@/components/admin/page-header";
import { FilterChips, hrefWith } from "@/components/admin/filters";
import { KpiTile } from "@/components/admin/kpis";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/format";
import { CampaignActions } from "../detail-actions";
import { loadBonusRecipients } from "../loaders";
import { describeExcluded, audienceOf, kindOf, parseAudienceParams } from "../wizard-logic";
import {
  RECIPIENTS_PER_PAGE,
  RECIPIENT_STATUS_PARAMS,
  campaignStatusLabel,
  codeFromParam,
  firstParam,
  hasNextPage,
  kindLabel,
  offerHeadline,
  pageParam,
  paramFromCode,
  recipientStatusLabel,
  recipientsLabel,
  referralOfferExpectation,
  referralOfferState,
} from "../view";

export const metadata: Metadata = { title: "Campagne" };

/** L'envoi, sa reprise et la programmation partent d'ici (startCampaignAction, resumeCampaignAction, scheduleCampaignAction) : un envoi consomme jusqu'à 45 s. */
export const maxDuration = 60;

/** Une lecture annexe qui échoue est dite, pas cachée : le reste de la page reste lisible. */
async function attempt<T>(label: string, work: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    console.error(`[campagnes] ${label} impossible`, error);
    return { ok: false, error: error instanceof Error ? error.message : "Erreur inconnue." };
  }
}

const dash = <span className="text-text-tertiary">—</span>;

/**
 * La fiche d'une campagne : son état, ce qui a été envoyé, l'offre et ses
 * suites, les destinataires un par un. Les compteurs sont ceux de la base :
 * envoyés, simulés, échecs et ignorés sont distincts, et « — » dit qu'une
 * valeur n'existe pas encore (rien n'a été tenté).
 */
export default async function CampaignDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformSession();
  const { id } = await params;
  const query = await searchParams;
  const campaign = await loadCampaign(id);
  if (!campaign) notFound();

  const now = new Date();
  const base = `/admin/campagnes/${id}`;
  const recipientStatus = codeFromParam(RECIPIENT_STATUS_PARAMS, firstParam(query.statut));
  const recipientStatusParam = paramFromCode(RECIPIENT_STATUS_PARAMS, recipientStatus);
  const page = pageParam(query.page);
  const hasRun = campaign.startedAt !== null;
  const kind = kindOf(campaign.kind);
  const audience = audienceOf(campaign.audience);
  const definition = kind ? CAMPAIGN_KINDS[kind] : null;
  const audienceParams = parseAudienceParams(campaign.audienceParams);
  const messagingLive = getMessagingProvider().info.capability === "LIVE";
  const open = campaign.status === "DRAFT" || campaign.status === "SCHEDULED";

  const [recipients, bonus, projected] = await Promise.all([
    attempt("destinataires", () => listCampaignRecipients(id, { status: recipientStatus ?? undefined, page })),
    campaign.kind === "BONUS_OFFER" && hasRun ? attempt("liste du bonus", () => loadBonusRecipients(id)) : Promise.resolve(null),
    open && audience ? attempt("public", () => previewAudience(audience, audienceParams)) : Promise.resolve(null),
  ]);
  const counts = recipients.ok ? recipients.value.counts : null;
  const status = campaignStatusLabel(campaign);
  const scheduledOn = campaign.scheduledFor ? calendarDay(campaign.scheduledFor, TIME_ZONE) : null;
  const selection = audience && CAMPAIGN_AUDIENCES[audience].needsSelection ? (CAMPAIGN_AUDIENCES[audience].side === "PHARMACY" ? audienceParams.pharmacyIds : audienceParams.partnerIds) : null;
  const selectionHint = selection && audience ? `${selection.length} ${CAMPAIGN_AUDIENCES[audience].side === "PHARMACY" ? `officine${selection.length > 1 ? "s choisies" : " choisie"}` : `partenaire${selection.length > 1 ? "s" : ""} choisi${selection.length > 1 ? "s" : ""}`}` : undefined;
  const handled = campaign.sentCount + campaign.failedCount;
  const isReferral = campaign.kind === "REFERRAL_OFFER";
  const offerLine = offerHeadline(campaign.kind, campaign.offerAmountCents);
  const expectation = referralOfferExpectation(campaign);
  const counter = (value: number | undefined) => (hasRun && value !== undefined ? value : "—");
  const buttonTarget = campaign.buttonTarget && Object.hasOwn(CAMPAIGN_BUTTON_TARGETS, campaign.buttonTarget) ? CAMPAIGN_BUTTON_TARGETS[campaign.buttonTarget as keyof typeof CAMPAIGN_BUTTON_TARGETS].label : campaign.buttonTarget;

  return (
    <>
      <AdminPageHeader
        space={{ label: "Communication", href: "/admin/communications" }}
        parent={{ label: "Campagnes", href: "/admin/campagnes" }}
        title={campaign.name}
        badge={
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={status} />
            {campaign.simulated && campaign.status !== "SENT" && campaign.status !== "SENDING" && <Badge tone="warning">Simulée</Badge>}
          </span>
        }
        description={`${kindLabel(campaign.kind)} · créée le ${formatDate(campaign.createdAt)}`}
        actions={kind && audience ? <CampaignActions campaign={{ id, status: campaign.status, kind, name: campaign.name, audience, audienceParams, offerAmountCents: campaign.offerAmountCents, hasEnd: campaign.offerEndsAt !== null, scheduledOn }} messagingLive={messagingLive} nowIso={now.toISOString()} /> : undefined}
      />

      {campaign.simulated && (
        <Alert tone="warning" title="Envoi simulé : aucun e-mail n'est parti">
          La messagerie n&apos;était pas configurée au moment de l&apos;envoi. Les destinataires sont marqués « simulé », pas « envoyé » : aucun destinataire n&apos;a reçu de message, et aucune notification dans l&apos;application n&apos;a été créée.
        </Alert>
      )}
      {campaign.status === "SENDING" && (
        <Alert tone="info" title="Envoi en cours">
          {handled.toLocaleString("fr-FR")} destinataire{handled > 1 ? "s" : ""} traité{handled > 1 ? "s" : ""} sur {campaign.recipientCount.toLocaleString("fr-FR")}. Si l&apos;envoi s&apos;est interrompu, « Reprendre l&apos;envoi » continue sans écrire deux fois à la même personne ; le passage quotidien du matin reprend aussi les envois restés en plan.
        </Alert>
      )}
      {campaign.status === "SCHEDULED" && campaign.scheduledFor && (
        <Alert tone="info" title="Programmée">
          {describeSchedule(campaign.scheduledFor, now)} Nombre de destinataires confirmé : {campaign.recipientCount.toLocaleString("fr-FR")}. Il est recalculé au moment de l&apos;envoi.
        </Alert>
      )}
      {campaign.status === "CANCELED" && (
        <Alert tone="warning" title="Campagne annulée">
          {campaign.canceledAt ? `Annulée le ${formatDateTime(campaign.canceledAt)}. ` : ""}Les destinataires encore en attente n&apos;ont rien reçu ; les messages déjà partis ne se rappellent pas.
        </Alert>
      )}
      {!recipients.ok && (
        <Alert tone="danger" title="Les destinataires n'ont pas pu être chargés">
          {recipients.error}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiTile label="Destinataires" value={recipientsLabel(campaign)} hint={open ? (campaign.status === "SCHEDULED" ? "Confirmés à la programmation" : "Calculés à l'envoi") : "Hors désinscrits, sans adresse et doublons"} />
        <KpiTile label="Envoyés" value={counter(counts?.SENT)} hint="Messages réellement partis" tone={(counts?.SENT ?? 0) > 0 ? "success" : "default"} />
        <KpiTile label="Simulés" value={counter(counts?.SIMULATED)} hint="Non partis : messagerie non configurée" tone={(counts?.SIMULATED ?? 0) > 0 ? "warning" : "default"} />
        <KpiTile label="Échecs" value={counter(counts?.FAILED)} hint="Refusés par le prestataire, ou à vérifier" tone={(counts?.FAILED ?? 0) > 0 ? "danger" : "default"} />
        <KpiTile label="Ignorés" value={counter(counts?.SKIPPED)} hint="Désinscrits, ou annulés avant l'envoi" />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <AdminSection title="Résumé">
          <FactList
            items={[
              { label: "Type", value: kindLabel(campaign.kind) },
              { label: "Public", value: audience ? CAMPAIGN_AUDIENCES[audience].label : campaign.audience, hint: selectionHint },
              { label: "État", value: <StatusBadge status={status} /> },
              { label: "Programmée pour", value: campaign.scheduledFor ? formatDate(campaign.scheduledFor) : null },
              { label: "Envoi démarré le", value: campaign.startedAt ? formatDateTime(campaign.startedAt) : null },
              { label: "Terminé le", value: campaign.completedAt ? formatDateTime(campaign.completedAt) : null },
              { label: "Annulée le", value: campaign.canceledAt ? formatDateTime(campaign.canceledAt) : null },
              ...(audience && CAMPAIGN_AUDIENCES[audience].side === "PHARMACY" ? [{ label: "Notification dans l'application", value: campaign.alsoInApp ? "Oui, pour un message réellement parti" : "Non" }] : []),
            ]}
          />
        </AdminSection>

        {definition?.needsAmount ? (
          <AdminSection title="Offre" description={isReferral ? "Montant appliqué aux filleuls inscrits pendant l'offre." : "Application manuelle par l'équipe : aucun crédit automatique."}>
            <div className="space-y-4">
              <FactList
                items={[
                  { label: definition.amountLabel ?? "Montant", value: offerLine },
                  { label: "Dernier jour de l'offre", value: campaign.offerEndsAt ? formatFrenchDate(campaign.offerEndsAt) : "Sans date de fin" },
                  { label: "Conditions", value: campaign.offerConditions },
                ]}
              />
              {isReferral && campaign.referralOffer && (
                <div className="space-y-2 rounded-xl border border-border-subtle p-3.5">
                  <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium text-text-primary">
                    Offre de parrainage liée <StatusBadge status={referralOfferState(campaign.referralOffer, now)} />
                  </p>
                  <FactList
                    items={[
                      { label: "Montant par filleul et par mois", value: formatEuros(campaign.referralOffer.amountCents) },
                      { label: "Début", value: formatDateTime(campaign.referralOffer.startsAt) },
                      { label: "Fin", value: campaign.referralOffer.endsAt ? formatDateTime(campaign.referralOffer.endsAt) : "Sans date de fin" },
                      { label: "Arrêtée le", value: campaign.referralOffer.canceledAt ? formatDateTime(campaign.referralOffer.canceledAt) : null },
                    ]}
                  />
                  <p className="text-[12.5px] leading-5 text-text-secondary">Les filleuls inscrits pendant l&apos;offre gardent ce montant, même après sa fin ou son arrêt ; les filleuls déjà inscrits avant elle gardent le leur.</p>
                </div>
              )}
              {expectation && <p className="text-[13px] leading-5 text-text-secondary">{expectation}</p>}
            </div>
          </AdminSection>
        ) : (
          <AdminSection title="Offre">
            <p className="text-[13.5px] leading-5 text-text-secondary">Ce type de campagne ne porte aucune offre chiffrée.</p>
          </AdminSection>
        )}
      </div>

      <AdminSection title="Message" description="Le texte tel qu'enregistré : les variables entre doubles accolades sont remplacées pour chaque destinataire à l'envoi.">
        <div className="space-y-4">
          <FactList
            items={[
              { label: "Objet", value: campaign.subject },
              { label: "Titre", value: campaign.title },
              { label: "Bouton", value: campaign.buttonLabel ? `« ${campaign.buttonLabel} » (mène à : ${buttonTarget ?? "destination inconnue"})` : "Aucun" },
            ]}
          />
          <div>
            <p className="text-[12px] font-medium text-text-tertiary">Texte</p>
            <p className="mt-1 max-w-3xl text-[14px] leading-6 whitespace-pre-line text-text-primary">{campaign.body}</p>
          </div>
        </div>
      </AdminSection>

      {bonus && (
        <AdminSection title="À appliquer par l'équipe" description="Aucun crédit automatique n'existe : ce bonus s'applique à la main, officine par officine.">
          {!bonus.ok ? (
            <Alert tone="danger" title="La liste n'a pas pu être chargée">
              {bonus.error}
            </Alert>
          ) : (
            <div className="space-y-4">
              <FactList
                items={[
                  { label: "Bonus à appliquer", value: offerLine },
                  { label: "Valable jusqu'au", value: campaign.offerEndsAt ? formatFrenchDate(campaign.offerEndsAt) : "Sans date de fin" },
                  { label: "Conditions annoncées", value: campaign.offerConditions },
                ]}
              />
              {bonus.value.rows.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border-subtle px-3 py-3 text-[13px] text-text-tertiary">Aucune officine n&apos;a reçu le message : il n&apos;y a rien à appliquer pour l&apos;instant.</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-[12.5px] font-medium text-text-secondary">
                    {(counts?.SENT ?? bonus.value.rows.length).toLocaleString("fr-FR")} officine{(counts?.SENT ?? bonus.value.rows.length) > 1 ? "s" : ""} à qui le message est réellement parti
                  </p>
                  <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                    {bonus.value.rows.map((row) => (
                      <li key={row.id} className="min-w-0 truncate text-[13.5px]">
                        <Link href={`/admin/pharmacies/${row.pharmacyId}`} className="text-brand-700 hover:underline dark:text-brand-400">
                          {row.name ?? "Officine"}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {bonus.value.truncated && <p className="text-[12px] text-text-tertiary">La liste est limitée aux premières officines par ordre alphabétique ; les destinataires ci-dessous les listent toutes.</p>}
                </div>
              )}
              {(counts?.SIMULATED ?? 0) > 0 && <p className="text-[12.5px] text-text-secondary">{counts?.SIMULATED} destinataire{(counts?.SIMULATED ?? 0) > 1 ? "s ont" : " a"} reçu un message simulé : rien n&apos;est parti pour eux, il n&apos;y a rien à appliquer.</p>}
            </div>
          )}
        </AdminSection>
      )}

      <AdminSection
        id="destinataires"
        padded={false}
        title="Destinataires"
        description={hasRun ? "Figés au démarrage de l'envoi : une adresse, un message." : "Les destinataires sont figés au démarrage de l'envoi."}
        action={
          <Link href="/admin/communications?nature=campagne&periode=12m" className="text-[12.5px] font-medium text-brand-700 hover:underline dark:text-brand-400">
            E-mails de campagne dans l&apos;historique
          </Link>
        }
      >
        {hasRun && counts && (
          <div className="border-b border-border-subtle px-5 py-3">
            <FilterChips
              basePath={base}
              param="statut"
              label="Statut du destinataire"
              current={recipientStatusParam}
              options={[{ value: null, label: "Tous", count: Object.values(counts).reduce((sum, n) => sum + n, 0) }, ...Object.entries(RECIPIENT_STATUS_PARAMS).map(([value, code]) => ({ value, label: recipientStatusLabel(code).label, count: counts[code] ?? 0 }))]}
            />
          </div>
        )}
        {!hasRun ? (
          <div className="px-5 py-6">
            {projected?.ok ? (
              <p className="text-[13.5px] leading-6 text-text-secondary">
                Si l&apos;envoi partait maintenant : <strong className="text-text-primary">{projected.value.count.toLocaleString("fr-FR")} destinataire{projected.value.count > 1 ? "s" : ""}</strong>
                {describeExcluded(projected.value.excluded) ? ` (écartés : ${describeExcluded(projected.value.excluded)})` : ""}. Ce nombre est calculé à l&apos;instant ; il est recalculé et confirmé au moment de l&apos;envoi.
              </p>
            ) : projected && !projected.ok ? (
              <p className="text-[13px] text-danger-600" role="alert">
                Le nombre de destinataires n&apos;a pas pu être calculé : {projected.error}
              </p>
            ) : (
              <p className="text-[13.5px] text-text-secondary">Aucun destinataire : rien n&apos;a été envoyé.</p>
            )}
          </div>
        ) : !recipients.ok ? null : recipients.value.rows.length === 0 ? (
          <EmptyState icon={<Inbox className="size-5" />} title={recipientStatus ? "Aucun destinataire pour ce filtre" : "Aucun destinataire"} description={recipientStatus ? "Retirez le filtre pour voir tous les destinataires." : "Aucune ligne n'a été figée pour cette campagne."} />
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[860px]">
              <THead>
                <TR>
                  <TH>Destinataire</TH>
                  <TH>Adresse</TH>
                  <TH>Statut</TH>
                  <TH>Détail</TH>
                  <TH>Envoyé le</TH>
                </TR>
              </THead>
              <TBody>
                {recipients.value.rows.map((row) => (
                  <TR key={row.id}>
                    <TD className="max-w-[240px] truncate text-[13.5px]">{row.name ?? dash}</TD>
                    <TD className="font-mono text-[12.5px] text-text-secondary">{row.email}</TD>
                    <TD>
                      <StatusBadge status={recipientStatusLabel(row.status)} />
                    </TD>
                    <TD className="max-w-[320px] whitespace-normal text-[12.5px] text-text-secondary">{row.detail ?? dash}</TD>
                    <TD className="text-[12.5px] whitespace-nowrap text-text-secondary">{row.sentAt ? formatDateTime(row.sentAt) : dash}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
        {hasRun && recipients.ok && (page > 1 || hasNextPage(page, RECIPIENTS_PER_PAGE, recipients.value.total)) && (
          <nav aria-label="Pagination des destinataires" className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-5 py-3">
            <span className="text-[12.5px] text-text-tertiary">
              Page {page} sur {Math.max(1, Math.ceil(recipients.value.total / RECIPIENTS_PER_PAGE))} · {recipients.value.total.toLocaleString("fr-FR")} destinataire{recipients.value.total > 1 ? "s" : ""}
            </span>
            <span className="flex gap-2">
              {page > 1 && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`${hrefWith(base, { statut: recipientStatusParam }, { page: page > 2 ? String(page - 1) : null })}#destinataires`}>
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    Précédents
                  </Link>
                </Button>
              )}
              {hasNextPage(page, RECIPIENTS_PER_PAGE, recipients.value.total) && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`${hrefWith(base, { statut: recipientStatusParam }, { page: String(page + 1) })}#destinataires`}>
                    Suivants
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
              )}
            </span>
          </nav>
        )}
      </AdminSection>
    </>
  );
}
