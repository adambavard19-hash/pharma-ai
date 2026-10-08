import Link from "next/link";
import { FileText } from "lucide-react";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/admin/status-badge";
import { CONTRACT_STATUS_LABELS, type ContractStatusCode } from "@/core/sales/pipeline";
import { contractStage } from "@/core/billing/subscription";

/** Éléments communs aux onglets de la fiche 360°. */

/**
 * Les ONGLETS de la fiche : sept, au lieu de onze. Chacun réunit des SECTIONS qui étaient des onglets (leurs adresses
 * `?onglet=paiements`, `?onglet=notes`… répondent toujours : on ouvre l'onglet qui les contient et on descend à la section).
 */
export const TAB_GROUPS = [
  { key: "apercu", label: "Aperçu", sections: [] },
  { key: "equipe", label: "Équipe & accès", sections: ["utilisateurs"] },
  { key: "technique", label: "Technique & stock", sections: ["technique", "stock"] },
  { key: "facturation", label: "Facturation", sections: ["abonnement", "contrats", "paiements"] },
  { key: "communication", label: "Communication", sections: ["communication", "support"] },
  { key: "commercial", label: "Commercial & notes", sections: ["commercial", "notes"] },
  { key: "activite", label: "Activité", sections: ["performance", "historique"] },
] as const;

export type TabGroupKey = (typeof TAB_GROUPS)[number]["key"];

/** Toutes les clés acceptées dans `?onglet=` : les sept onglets, et les sections qu'ils contiennent. */
export const TAB_KEYS = ["apercu", "equipe", "facturation", "activite", "stock", "support", "abonnement", "performance", "contrats", "paiements", "utilisateurs", "technique", "communication", "commercial", "historique", "notes"] as const;
export type TabKey = (typeof TAB_KEYS)[number];

export function parseTab(value: string | null): TabKey {
  return (TAB_KEYS as readonly string[]).includes(value ?? "") ? (value as TabKey) : "apercu";
}

/** L'onglet qui contient cette clé : l'onglet lui-même, ou celui qui a repris la section. */
export function tabGroupOf(tab: TabKey): TabGroupKey {
  const direct = TAB_GROUPS.find((group) => group.key === tab);
  if (direct) return direct.key;
  return TAB_GROUPS.find((group) => (group.sections as readonly string[]).includes(tab))?.key ?? "apercu";
}

/** La section où descendre à l'ouverture : seulement quand la clé demandée est une section qui n'ouvre pas son onglet. */
export function sectionToOpen(tab: TabKey): string | null {
  const group = TAB_GROUPS.find((entry) => (entry.sections as readonly string[]).includes(tab));
  return group && group.sections[0] !== tab ? tab : null;
}

export function tabHref(pharmacyId: string, tab: TabKey, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(tab === "apercu" ? extra : { onglet: tab, ...extra });
  const query = params.toString();
  return `/admin/pharmacies/${pharmacyId}${query ? `?${query}` : ""}`;
}

export function ContractStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={{ label: CONTRACT_STATUS_LABELS[status as ContractStatusCode] ?? status, tone: contractStage({ status }).tone }} />;
}

/** Le PDF du contrat, dans un nouvel onglet (aperçu interne, session console exigée). */
export function ContractPdfLink({ contractId, children = "Aperçu PDF" }: { contractId: string; children?: ReactNode }) {
  return (
    <a href={`/api/contrats/apercu/${contractId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-700 hover:underline dark:text-brand-400">
      <FileText className="size-3.5" aria-hidden="true" />
      {children}
    </a>
  );
}

/** Une ligne vide honnête, dans une section. */
export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="py-2 text-[13px] leading-5 text-text-tertiary">{children}</p>;
}

/** Un lien discret en pied de section (« Tout l'historique »). */
export function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} scroll={false} className="text-[12.5px] font-medium text-brand-700 hover:underline dark:text-brand-400">
      {children}
    </Link>
  );
}
