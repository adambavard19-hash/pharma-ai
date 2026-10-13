"use client";

import Link from "next/link";
import type { OverviewSnapshot } from "@/server/actions/stock-sync";
import { CountersStep } from "@/app/(app)/connexion/counters-step";
import { useLiveSnapshot } from "@/app/(app)/connexion/use-live-snapshot";

/**
 * Les ordinateurs du comptoir, relus tout seuls (dix secondes, quatre pendant qu'une installation est attendue) : un poste y
 * apparaît « Connecté » sous les yeux du titulaire, et seulement quand il s'est vraiment présenté.
 */
export function PostsPanel({ initial, installerAvailable, members, assignments }: { initial: OverviewSnapshot; installerAvailable: boolean; members: { id: string; name: string }[]; assignments: Record<string, string | null> }) {
  const { snapshot, refresh } = useLiveSnapshot(initial);
  return (
    <div className="space-y-3">
      <CountersStep counters={snapshot.overview.counters} installerAvailable={installerAvailable} members={members} assignments={assignments} onChanged={() => void refresh()} />
      <p className="text-[13px] leading-5 text-text-tertiary">
        Votre stock s&apos;envoie depuis{" "}
        <Link href="/stock/mise-a-jour" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">
          Mon stock → Mettre à jour mon stock
        </Link>
        . Le robot de délivrance n&apos;a rien à régler ici : il se connecte seul.
      </p>
    </div>
  );
}
