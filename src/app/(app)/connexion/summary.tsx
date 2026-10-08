import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ConnectionOverview } from "@/core/stock/connection-overview";
import { cn } from "@/lib/utils";
import { TONE_STYLES } from "./status";

/**
 * Les trois états de la connexion, en une ligne, pour les pages qui ne sont pas
 * l'assistant (le stock, par exemple). Mêmes mots, mêmes couleurs que l'assistant :
 * l'état se lit partout pareil, parce qu'il est calculé une seule fois.
 */
export function ConnectionSummary({ overview, canOpen }: { overview: ConnectionOverview; canOpen: boolean }) {
  // « Connecté » ne cache pas un appareil muet : s'il y en a un, on le dit à côté.
  const silent = overview.agent.items.filter((item) => !item.online).length;
  const parts = [
    { label: "PharmaBoost Connect", tone: overview.agent.tone, title: overview.agent.state === "ONLINE" && silent > 0 ? `${overview.agent.title} · ${silent} hors ligne` : overview.agent.title },
    { label: "Stock reçu", tone: overview.stock.tone, title: overview.stock.title },
    { label: "Ventes", tone: overview.sales.tone, title: overview.sales.title },
  ] as const;
  const attention = overview.headline.tone !== "success";
  return (
    <section aria-label="État de la connexion" className={cn("flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border px-4 py-3", attention ? TONE_STYLES.warning.box : "border-border-subtle bg-surface-card")}>
      <ul className="flex flex-1 flex-wrap gap-x-6 gap-y-2">
        {parts.map((part) => (
          <li key={part.label} className="flex items-center gap-2 text-[13.5px]">
            <span className={cn("size-2.5 shrink-0 rounded-full", TONE_STYLES[part.tone].dot)} aria-hidden="true" />
            <span className="text-text-tertiary">{part.label}</span>
            <span className="font-medium text-text-primary">{part.title}</span>
          </li>
        ))}
      </ul>
      {overview.stock.state !== "NONE" && <span className="basis-full text-[12.5px] text-text-secondary sm:basis-auto">{overview.stock.detail}</span>}
      {canOpen && (
        <Link href="/connexion" className="inline-flex items-center gap-1 text-[13.5px] font-medium text-brand-700 hover:underline dark:text-brand-400">
          Voir le détail
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}
