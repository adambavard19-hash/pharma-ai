import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { countSiteVisitors } from "@/server/services/site-visitors";
import { loadNudgeStore } from "@/server/services/site-nudge";
import { NUDGE_PROFILES, PROFILE_LABEL, TRIGGER_LABEL, formatSeconds } from "@/core/site/site-nudge";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { EmptyState } from "@/components/ui/feedback";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Site internet" };

const NUMBER = new Intl.NumberFormat("fr-FR");
const STATUS = { PROFIL: "Profil choisi", REPONSE: "A répondu", CONTACT: "Coordonnées laissées" } as const;

/**
 * Le site internet dans la console (fondateur, 30 oct. 2026) : le compteur des visiteurs, et tout ce que la bulle « Vous êtes
 * plutôt… ? » a recueilli — profils, intérêts, coordonnées —, la plus récente en premier.
 */
export default async function SiteInternetPage() {
  await requirePlatformSession();
  const [visitors, store] = await Promise.all([countSiteVisitors(), loadNudgeStore()]);
  const items = [...store.items].reverse();
  const contacts = items.filter((item) => item.status === "CONTACT").length;
  const byProfile = NUDGE_PROFILES.map((profile) => ({ profile, count: items.filter((item) => item.profile === profile).length }));
  const cards = [
    { label: "Visiteurs du site", value: visitors.total, hint: visitors.today > 0 ? `${NUMBER.format(visitors.today)} aujourd'hui` : "une personne par adresse internet", href: "/admin/visiteurs" },
    { label: "Bulles affichées", value: store.shown, hint: `${NUMBER.format(store.closed)} fermées sans réponse` },
    { label: "Profils choisis", value: items.length, hint: store.shown ? `${Math.round((items.length / store.shown) * 100)} % des bulles affichées` : "—" },
    { label: "Coordonnées laissées", value: contacts, hint: items.length ? `${Math.round((contacts / items.length) * 100)} % des profils choisis` : "—" },
  ];

  return (
    <>
      <AdminPageHeader parent={{ label: "Accueil", href: "/admin" }} title="Site internet" description="Les visiteurs du site, et ce que la bulle « Vous êtes plutôt… ? » a recueilli. Chaque réponse avec un message ou des coordonnées vous est aussi envoyée par e-mail." />
      <div data-site-chiffres="" className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => {
          const body = (
            <>
              <p className="text-[12.5px] font-medium text-text-tertiary">{card.label}</p>
              <p className="mt-1 text-[28px] leading-none font-bold tabular-nums text-text-primary">{NUMBER.format(card.value)}</p>
              <p className="mt-1.5 text-[12px] text-text-tertiary">{card.hint}</p>
            </>
          );
          return card.href ? (
            <Link key={card.label} href={card.href} className="rounded-2xl border border-border-subtle bg-surface-card p-4 hover:border-brand-400">{body}</Link>
          ) : (
            <div key={card.label} className="rounded-2xl border border-border-subtle bg-surface-card p-4">{body}</div>
          );
        })}
      </div>

      <AdminSection title="Qui sont-ils ?" description="Le profil choisi d'un clic dans la bulle.">
        <div className="flex flex-wrap gap-2">
          {byProfile.map((row) => (
            <span key={row.profile} className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-card px-3.5 py-1.5 text-[13.5px] font-semibold text-text-primary">
              {PROFILE_LABEL[row.profile]} <span className="rounded-full bg-brand-50 px-2 text-brand-800 tabular-nums">{NUMBER.format(row.count)}</span>
            </span>
          ))}
        </div>
      </AdminSection>

      <AdminSection title="Toutes les réponses" description="La plus récente en premier. La ville est approximative (devinée d'après l'adresse internet).">
        {items.length === 0 ? (
          <EmptyState title="Pas encore de réponse" description="La bulle s'affiche aux visiteurs après 1 min 30 sur le site, ou dès 30 s s'ils regardent le tarif, la vidéo ou la page Partenaires." />
        ) : (
          <ul data-site-reponses="" className="divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border-subtle bg-surface-card">
            {items.map((item) => (
              <li key={item.id} className="grid gap-1.5 p-4 sm:grid-cols-[180px_minmax(0,1fr)]">
                <div>
                  <p className="text-[14px] font-semibold text-text-primary">{PROFILE_LABEL[item.profile]}</p>
                  <p className="text-[12px] text-text-tertiary">{formatDateTime(new Date(item.at))}</p>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.status === "CONTACT" ? "bg-success-50 text-success-800" : item.status === "REPONSE" ? "bg-brand-50 text-brand-800" : "bg-surface-sunken text-text-secondary"}`}>{STATUS[item.status]}</span>
                </div>
                <div className="min-w-0 space-y-1 text-[13.5px] text-text-primary">
                  {(item.name || item.email || item.phone) && (
                    <p className="font-semibold">
                      {item.name}
                      {item.email && <> · <a href={`mailto:${item.email}`} className="text-brand-700 underline">{item.email}</a></>}
                      {item.phone && <> · <a href={`tel:${item.phone.replace(/\s/g, "")}`} className="text-brand-700 underline">{item.phone}</a></>}
                    </p>
                  )}
                  {item.interest && <p>Intéressé par : <span className="font-semibold">{item.interest}</span></p>}
                  {item.message && <p className="text-text-secondary">« {item.message} »</p>}
                  <p className="text-[12.5px] text-text-tertiary">
                    {formatSeconds(item.seconds)} sur le site · {TRIGGER_LABEL[item.trigger]}
                    {item.city ? ` · ${item.city}` : ""}
                    {item.pages.length ? ` · pages : ${item.pages.join(", ")}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>
    </>
  );
}
