"use client";

import type { RobotSetup } from "@/core/robot/integration";
import type { OverviewSnapshot } from "@/server/actions/stock-sync";
import { Badge } from "@/components/ui/badge";
import { CountersStep } from "./counters-step";
import { RobotStep } from "./robot-step";
import { StockStep } from "./stock-step";
import { useLiveSnapshot } from "./use-live-snapshot";

/**
 * « Installer PharmaBoost » : trois blocs, rien d'autre.
 *
 *   1. Installer sur mes comptoirs   2. Envoyer mon stock   3. Connecter mon robot (facultatif)
 *
 * La liste des comptoirs se relit toute seule (dix secondes, quatre pendant qu'une installation est attendue) : un
 * comptoir y apparaît « Connecté » sous les yeux de la personne, et seulement quand le poste s'est vraiment présenté.
 */
export function ConnectionSetup({ initial, robot, installerAvailable }: { initial: OverviewSnapshot; robot: RobotSetup | null; installerAvailable: boolean }) {
  const { snapshot, refresh } = useLiveSnapshot(initial);
  const { overview, lgo } = snapshot;

  return (
    <section aria-label="Installer PharmaBoost" className="space-y-4 rounded-3xl border border-border-subtle bg-surface-card p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0 space-y-1">
          <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.02em] text-text-primary sm:text-[32px] sm:leading-10">Installer PharmaBoost</h1>
          <p className="text-[15px] leading-6 text-text-secondary">Configurez votre pharmacie en 3 étapes.</p>
        </div>
        <Badge tone="success" className="mt-2">Configuration</Badge>
      </header>

      <CountersStep counters={overview.counters} installerAvailable={installerAvailable} onChanged={() => void refresh()} />
      <StockStep stock={overview.stock} />
      <RobotStep setup={robot} lgo={lgo} />
    </section>
  );
}
