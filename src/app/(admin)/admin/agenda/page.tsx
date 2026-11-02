import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { agendaFeedUrls, agendaToken, loadDemoBlocks, upcomingDemos } from "@/server/services/demo-agenda";
import { blockDemoSlotsAction, renewAgendaLinkAction, unblockDemoSlotsAction } from "@/server/actions/admin-demo-agenda";
import { formatDemoSlot } from "@/core/site/demo-slots";
import { toParisInput } from "@/core/sales/board";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { EmptyState } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Agenda des démos" };

const RANGE = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const HOUR = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });

/**
 * L'agenda PharmaBoost (fondateur, 2 nov. 2026) : les démos réservées par les pharmaciens sur le site, l'abonnement
 * qui les met dans l'appli Calendrier des téléphones d'Adam et de Donna, et les plages à bloquer quand l'équipe n'est
 * pas disponible (elles s'affichent « Réservé » sur le site).
 */
export default async function DemoAgendaPage() {
  await requirePlatformSession();
  const [demos, blocks, token] = await Promise.all([upcomingDemos(), loadDemoBlocks(), agendaToken()]);
  const feed = agendaFeedUrls(token);
  const today = toParisInput(new Date()).slice(0, 10);

  return (
    <>
      <AdminPageHeader parent={{ label: "Accueil", href: "/admin" }} title="Agenda des démos" description="Les démos que les pharmaciens réservent eux-mêmes sur le site, en direct. Ajoutez l'agenda à votre téléphone une fois : chaque nouvelle démo y apparaît, avec un rappel un quart d'heure avant." />

      <div className="space-y-6">
        <AdminSection title="Sur votre téléphone" description="À faire une seule fois, par Adam et par Donna, depuis l'iPhone.">
          <div data-agenda-abonnement="" className="space-y-4">
            <a href={feed.webcal} className="inline-flex h-11 items-center rounded-xl bg-brand-600 px-5 text-[15px] font-semibold text-white hover:bg-brand-700">
              Ajouter l&apos;agenda PharmaBoost à mon téléphone
            </a>
            <ol className="list-decimal space-y-1.5 pl-5 text-[14px] leading-6 text-text-secondary">
              <li>Ouvrez cette page sur votre iPhone et touchez le bouton vert, puis « S&apos;abonner ».</li>
              <li>L&apos;agenda « PharmaBoost · Démos » apparaît dans l&apos;appli Calendrier, à côté de vos rendez-vous.</li>
              <li>Chaque nouvelle démo y arrive toute seule ; vous recevez aussi un e-mail avec l&apos;invitation à chaque réservation.</li>
            </ol>
            <details className="text-[13.5px] text-text-secondary">
              <summary className="cursor-pointer font-medium text-text-primary">Google Agenda, ou à la main</summary>
              <p className="mt-2">Dans Google Agenda (ordinateur) : « Autres agendas » → « + » → « À partir de l&apos;URL », et collez ce lien. Sur iPhone : Réglages → Calendrier → Comptes → Ajouter un compte → Autre → « Ajouter un calendrier avec abonnement ».</p>
              <p className="mt-2 rounded-lg bg-surface-subtle px-3 py-2 font-mono text-[12.5px] break-all select-all">{feed.https}</p>
              <p className="mt-2">Ce lien est secret : il montre les coordonnées des pharmacies. S&apos;il a circulé, renouvelez-le (l&apos;ancien cesse de marcher, chacun se réabonne).</p>
              <form action={renewAgendaLinkAction} className="mt-2">
                <button type="submit" className="text-[13.5px] font-semibold text-danger-600 underline underline-offset-2">Renouveler le lien secret</button>
              </form>
            </details>
          </div>
        </AdminSection>

        <AdminSection title={`Démos à venir (${demos.length})`} description="Réservées par les pharmaciens sur la page « Réserver une démo » du site.">
          {demos.length === 0 ? (
            <EmptyState title="Aucune démo réservée pour l'instant" description="Dès qu'un pharmacien choisit un créneau sur le site, il apparaît ici, sur vos téléphones, et vous recevez un e-mail." />
          ) : (
            <ul data-agenda-demos="" className="divide-y divide-border-subtle">
              {demos.map((demo) => (
                <li key={demo.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-[15px] font-semibold text-text-primary">{demo.demoAt ? formatDemoSlot(demo.demoAt) : "—"}</p>
                    <p className="text-[13.5px] text-text-secondary">
                      {demo.name}
                      {demo.city ? ` · ${demo.city}` : ""}
                      {demo.ownerName ? ` · ${demo.ownerName}` : ""}
                      {demo.phone ? ` · ${demo.phone}` : ""}
                      {demo.demoDoneAt ? " · faite ✓" : ""}
                    </p>
                  </div>
                  <Link href={`/admin/dossiers/${demo.id}`} className="text-[13.5px] font-semibold text-brand-700 hover:underline">Ouvrir le dossier</Link>
                </li>
              ))}
            </ul>
          )}
        </AdminSection>

        <AdminSection title="Bloquer des créneaux" description="Quand vous n'êtes pas disponibles : les créneaux de la plage s'affichent « Réservé » sur le site et ne peuvent plus être pris. Laissez les heures vides pour bloquer toute la journée.">
          <form action={blockDemoSlotsAction} data-agenda-bloquer="" className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-[13px] font-medium text-text-secondary">
              Jour
              <input type="date" name="day" required min={today} defaultValue={today} className="h-10 rounded-lg border border-border-default bg-surface-card px-3 text-[14px] text-text-primary" />
            </label>
            <label className="grid gap-1 text-[13px] font-medium text-text-secondary">
              De
              <input type="time" name="from" step={1800} className="h-10 rounded-lg border border-border-default bg-surface-card px-3 text-[14px] text-text-primary" />
            </label>
            <label className="grid gap-1 text-[13px] font-medium text-text-secondary">
              À
              <input type="time" name="to" step={1800} className="h-10 rounded-lg border border-border-default bg-surface-card px-3 text-[14px] text-text-primary" />
            </label>
            <label className="grid min-w-[180px] flex-1 gap-1 text-[13px] font-medium text-text-secondary">
              Pourquoi (pour vous seulement)
              <input type="text" name="label" maxLength={80} placeholder="Ex. : rendez-vous, congés" className="h-10 rounded-lg border border-border-default bg-surface-card px-3 text-[14px] text-text-primary" />
            </label>
            <button type="submit" className="h-10 rounded-lg bg-brand-600 px-4 text-[14px] font-semibold text-white hover:bg-brand-700">Bloquer</button>
          </form>
          {blocks.length > 0 && (
            <ul data-agenda-blocages="" className="mt-5 divide-y divide-border-subtle">
              {blocks.map((block) => (
                <li key={block.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <p className="text-[14px] text-text-primary">
                    {RANGE.format(new Date(block.start))} → {HOUR.format(new Date(block.end))}
                    {block.label ? <span className="text-text-secondary"> · {block.label}</span> : null}
                  </p>
                  <form action={unblockDemoSlotsAction}>
                    <input type="hidden" name="id" value={block.id} />
                    <button type="submit" className="text-[13.5px] font-semibold text-text-secondary underline underline-offset-2 hover:text-text-primary">Débloquer</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </AdminSection>
      </div>
    </>
  );
}
