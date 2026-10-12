"use client";

import { PlatformIsland, type IslandSearchResult } from "@/components/island/platform-island";
import { ASSISTANT_SUGGESTIONS, looksLikeLookup, safeConsoleHref } from "@/core/admin-assistant/assistant";

const GROUPS: Record<string, string> = { pharmacy: "Officine", prospect: "Dossier", contract: "Contrat", user: "Compte", rep: "Commercial" };

/** La recherche instantanée de la console (nom, ville, SIRET, e-mail), dans la discussion de l'île. */
async function searchConsole(query: string, signal: AbortSignal): Promise<IslandSearchResult[]> {
  const response = await fetch(`/api/admin/recherche?q=${encodeURIComponent(query)}`, { signal });
  if (!response.ok) return [];
  const data = (await response.json()) as { results: { type: string; id: string; title: string; subtitle: string | null; badge: string | null; href: string }[] };
  return data.results.map((r) => ({ key: `${r.type}-${r.id}`, title: r.title, subtitle: r.subtitle, badge: r.badge, group: GROUPS[r.type] ?? r.type, href: r.href }));
}

/**
 * L'île de la console Super Admin, à la place de la barre de recherche : l'Accueil du centre de contrôle (revenu,
 * officines, démos, impayés, support, mises en service, soucis techniques…) et la Discussion avec le robot de la
 * console, qui garde la recherche instantanée. ⌘K / Ctrl+K l'ouvre sur la discussion.
 */
export function AdminIsland() {
  return (
    <PlatformIsland
      label="L'île du centre de contrôle"
      homeEndpoint="/api/ile/admin"
      hotkey
      chat={{
        endpoint: "/api/admin/assistant",
        suggestions: ASSISTANT_SUGGESTIONS,
        safeHref: safeConsoleHref,
        search: searchConsole,
        looksLikeLookup,
        placeholder: "Une question, ou un nom, un SIRET, un e-mail…",
        footnote: "Je lis les données de la plateforme sans rien modifier, et je donne le lien de l'écran où agir. Aucune donnée patient.",
      }}
    />
  );
}
