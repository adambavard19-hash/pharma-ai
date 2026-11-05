import Link from "next/link";
import { sectionTabsFor, type SectionKey } from "@/config/navigation";
import { cn } from "@/lib/utils";

/**
 * Les onglets d'une rubrique regroupée du menu (fondateur, 5 nov. 2026) : « Résultats » (Performances, Ce que PharmaBoost
 * rapporte, Historique des ventes), « Patients », « Aide & formations », « Laboratoires & partenaires ». Une pastille en verre
 * au-dessus du titre de la page ; seuls les onglets que la personne peut ouvrir y figurent, et rien s'il n'en reste qu'un.
 */
export function SectionTabs({ section, active, permissions }: { section: SectionKey; active: string; permissions: Iterable<string> }) {
  const tabs = sectionTabsFor(section, permissions);
  if (tabs.length === 0) return null;
  return (
    <nav aria-label="Onglets de la rubrique" className="-mb-2 flex max-w-full overflow-x-auto">
      <div className="inline-flex gap-1 rounded-full border border-white/70 bg-white/60 p-1 shadow-[0_1px_2px_rgba(15,43,38,.06),0_8px_24px_-12px_rgba(15,43,38,.18)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
        {tabs.map((tab) => {
          const on = tab.href === active;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-2 text-[13.5px] font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none",
                on ? "bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-sm" : "text-text-secondary hover:bg-white/80 hover:text-text-primary dark:hover:bg-white/10",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
