import Link from "next/link";
import { FileText } from "lucide-react";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/admin/status-badge";
import { CONTRACT_STATUS_LABELS, type ContractStatusCode } from "@/core/sales/pipeline";
import { contractStage } from "@/core/billing/subscription";

/** Éléments communs aux onglets de la fiche 360°. */

export const TAB_KEYS = ["apercu", "abonnement", "performance", "contrats", "paiements", "utilisateurs", "technique", "communication", "commercial", "historique", "notes"] as const;
export type TabKey = (typeof TAB_KEYS)[number];

export function parseTab(value: string | null): TabKey {
  return (TAB_KEYS as readonly string[]).includes(value ?? "") ? (value as TabKey) : "apercu";
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
