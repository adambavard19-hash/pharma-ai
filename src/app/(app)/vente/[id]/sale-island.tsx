"use client";

import { useState } from "react";
import { CounterIsland, type IslandAdvice } from "@/components/island/counter-island";
import { IslandPortal } from "@/components/island/platform-island";
import { adviceOutcome, saleIslandState } from "@/core/island/sale";
import type { IslandOutcome } from "@/core/island/banner-flow";
import { formatCents } from "@/lib/format";
import { isCounterAlert } from "@/core/counter/notice";
import type { AdviceView, SafetyFindingView } from "./types";

/**
 * L'île de l'écran de vente : la bannière du comptoir, jouée avec la VRAIE vente (scan, analyse étape par étape,
 * mises en garde, conseils avec Vendu / Non vendu, vente terminée). Elle prend la place de l'île du logiciel, en haut
 * de l'écran, le temps de la vente. Ses gestes passent par les mêmes fonctions que l'écran (mêmes actions serveur).
 */
export function SaleIsland({
  editing,
  analysing,
  analysisStep,
  liveScan,
  lineNames,
  findings,
  advice,
  basketIds,
  hasSale,
  look,
  canDecide,
  onSold,
  onNotSold,
  onReopen,
  onFinish,
}: {
  editing: boolean;
  analysing: boolean;
  analysisStep: number | null;
  liveScan: boolean;
  lineNames: string[];
  findings: SafetyFindingView[];
  advice: AdviceView[];
  basketIds: Set<string>;
  hasSale: boolean;
  look: number | null;
  canDecide: boolean;
  onSold: (recommendation: AdviceView) => void;
  onNotSold: (recommendation: AdviceView) => void;
  onReopen: (recommendation: AdviceView) => void;
  onFinish: () => void;
}) {
  const [alertDismissed, setAlertDismissed] = useState(false);
  // Les conseils qu'on peut trancher d'un geste dans l'île : un produit, pas de question en attente, pas de validation exigée.
  const shown = advice.filter((r) => r.product && r.status !== "REMOVED" && !r.requiresValidation && !(r.opportunity?.question && r.opportunity.answer === null)).slice(0, 4);
  const outcomes: IslandOutcome[] = shown.map((r) => adviceOutcome(r.status, basketIds.has(r.id)));
  // Comme la bannière du poste : seules les vraies mises en garde passent dans l'île (pas les notes de couverture des données).
  const alerts = findings.filter(isCounterAlert);
  const state = saleIslandState({ editing, analysing, analysisStep, liveScan, lineCount: lineNames.length, warnings: alerts.length, alertDismissed, outcomes, hasSale, emailStage: null, emailValue: "" });
  const first = alerts[0];
  const items: IslandAdvice[] = shown.map((r) => ({
    name: r.product!.name,
    price: formatCents(r.unitPriceCents || r.product!.salePriceCents),
    reason: r.shortReason ?? r.opportunity?.title ?? undefined,
    shortDate: r.shortDate ? `${r.shortDate.daysLeft} j` : undefined,
    stock: r.product!.quantity <= 0 ? "OUT_OF_STOCK" : r.product!.quantity <= r.product!.alertThreshold ? "LOW_STOCK" : "IN_STOCK",
    quantity: r.product!.quantity,
    image: r.product!.imageUrl ?? undefined,
  }));

  return (
    <IslandPortal>
      <CounterIsland
        state={state}
        items={items}
        drug={lineNames[lineNames.length - 1] ?? "Ordonnance"}
        alert={first ? { title: first.details?.title ?? "À lire avant de conseiller", text: first.details?.explanation ?? first.message } : null}
        pills={[]}
        hoverOpen={false}
        look={look}
        emailEnabled={false}
        collapsible
        readOnly={!canDecide}
        finishLabel="Valider la vente"
        onAnswer={(index, outcome) => {
          const r = shown[index];
          if (!r || !canDecide) return;
          if (outcome === "SOLD") onSold(r);
          else if (outcome === "NOT_SOLD") onNotSold(r);
          else onReopen(r);
        }}
        onEmail={() => undefined}
        onSendEmail={() => undefined}
        onAddEmail={() => undefined}
        onFinish={onFinish}
        onDismissAlert={() => setAlertDismissed(true)}
      />
    </IslandPortal>
  );
}
