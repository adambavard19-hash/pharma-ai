import type { Metadata } from "next";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { countSiteVisitors, siteVisitorCities } from "@/server/services/site-visitors";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { EmptyState } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Visiteurs du site" };

const NUMBER = new Intl.NumberFormat("fr-FR");
const COUNTRY = new Intl.DisplayNames(["fr"], { type: "region" });

function countryName(code: string | null): string | null {
  if (!code) return null;
  try {
    return COUNTRY.of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Les visiteurs du site public : combien de personnes différentes (une par adresse IP) et de quelles villes. La ville est
 * celle que Vercel devine d'après l'adresse : approximative (souvent la ville du fournisseur d'accès, pas celle du visiteur).
 */
export default async function SiteVisitorsPage() {
  await requirePlatformSession();
  const [counts, { cities, unknown, total }] = await Promise.all([countSiteVisitors(), siteVisitorCities()]);
  const max = cities[0]?.visitors ?? 1;

  return (
    <>
      <AdminPageHeader
        parent={{ label: "Accueil", href: "/admin" }}
        title="Visiteurs du site"
        description={`${NUMBER.format(counts.total)} ${counts.total > 1 ? "personnes différentes" : "personne"} (une par adresse internet)${counts.today > 0 ? ` · ${NUMBER.format(counts.today)} aujourd’hui` : ""}`}
      />
      <AdminSection title="D'où viennent-ils ?" description="Ville approximative, devinée d'après l'adresse internet : c'est souvent la ville de l'opérateur (Orange, Free…), pas toujours celle du visiteur.">
        {cities.length === 0 ? (
          <EmptyState title="Pas encore de ville connue" description="Les villes apparaissent avec les prochains visiteurs du site." />
        ) : (
          <ol data-villes-visiteurs="" className="space-y-2.5">
            {cities.map((row) => (
              <li key={`${row.city}-${row.country}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1">
                <span className="truncate text-[14px] text-text-primary">
                  <span className="font-semibold">{row.city}</span>
                  {row.country && row.country !== "FR" && <span className="text-text-tertiary"> · {countryName(row.country)}</span>}
                </span>
                <span className="text-[14px] font-semibold tabular-nums text-text-primary">{NUMBER.format(row.visitors)}</span>
                <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                  <span className="block h-full rounded-full bg-brand-500" style={{ width: `${Math.max(4, Math.round((row.visitors / max) * 100))}%` }} />
                </span>
              </li>
            ))}
          </ol>
        )}
        {unknown > 0 && total > 0 && (
          <p className="mt-4 text-[12.5px] text-text-tertiary">
            {NUMBER.format(unknown)} {unknown > 1 ? "visiteurs" : "visiteur"} sans ville connue (comptés avant l&apos;ajout des villes, ou adresse que l&apos;hébergeur ne sait pas situer).
          </p>
        )}
      </AdminSection>
    </>
  );
}
