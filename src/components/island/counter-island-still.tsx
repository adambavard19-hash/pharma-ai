"use client";

import { useCallback, useReducer } from "react";
import { INITIAL_ISLAND, islandReducer, type IslandAction, type IslandStage, type IslandState } from "@/core/island/banner-flow";
import { CounterIsland, type IslandAdvice } from "./counter-island";
import { MixIsland } from "./mix-island";
import { useDemoHelp } from "./use-demo-help";
import { ISLAND_CSS } from "./island-shell";
import { AURORE_CSS } from "./island-aurore";

/**
 * L'île du comptoir posée sur une étape parlante (les conseils, par défaut) : pour les visuels du site et de la plaquette.
 * Notre robot y est vivant ; le visiteur peut cliquer Vendu / Non vendu, ajouter l'e-mail, terminer la vente. Exemple,
 * aucune donnée réelle. `mix` : aux conseils, la bannière du comptoir telle qu'elle est aujourd'hui (la « mix », papier ADN,
 * fondateur 20 oct. 2026) au lieu de l'ancienne liste.
 */
export function CounterIslandStill({ items, drug, alert = null, stage = "advice", mix = false, className }: { items: IslandAdvice[]; drug: string; alert?: { title: string; text: string } | null; stage?: IslandStage; mix?: boolean; className?: string }) {
  const count = items.length;
  const reducer = useCallback((state: IslandState, action: IslandAction) => islandReducer(state, action, count), [count]);
  const [state, dispatch] = useReducer(reducer, null, () => islandReducer(INITIAL_ISLAND, { type: "go", stage }, count));
  const help = useDemoHelp(items);
  return (
    <div className={className} data-ile-style="aurore">
      <style>{`${ISLAND_CSS}\n${AURORE_CSS}`}</style>
      {mix && state.stage === "advice" ? (
        <MixIsland items={items} outcomes={state.outcomes} open onOpen={() => undefined} onFinish={() => dispatch({ type: "go", stage: "done" })} onAnswer={(index, outcome) => dispatch({ type: "answer", index, outcome })} help={help} />
      ) : (
        <CounterIsland
          state={state}
          items={items}
          drug={drug}
          alert={alert}
          pills={[]}
          listMaxHeight={380}
          hoverOpen={false}
          onAnswer={(index, outcome) => dispatch({ type: "answer", index, outcome })}
          onEmail={(value) => dispatch({ type: "email", value })}
          onSendEmail={() => dispatch({ type: "go", stage: "emailSent" })}
          onAddEmail={() => dispatch({ type: "go", stage: "email" })}
          onFinish={() => dispatch({ type: "go", stage: "done" })}
          onDismissAlert={() => dispatch({ type: "go", stage: "advice" })}
        />
      )}
    </div>
  );
}
