"use client";

import { useState } from "react";
import type { HelpAdvice } from "@/core/poste/island-bridge";
import type { IslandAdvice } from "./counter-island";
import type { HelpExchange } from "./mix-island";

/**
 * L'exemple d'« Aide » du site, sur l'Ultra-Levure des conseils d'exemple : ce que dit son RCP (BDPM, rubrique 4.5 — une levure,
 * que l'antibiotique n'atteint pas ; les antifongiques, eux, la rendent inefficace).
 */
const DEMO_HELP = {
  question: "Peut-on la prendre en même temps que l'antibiotique ?",
  answer: "Oui : Ultra-Levure est une levure, l'antibiotique ne l'atteint pas. Elle se prend pendant la cure. Seuls les antifongiques la rendent inefficace.",
};

/** L'onglet « Aide » des bannières d'exemple du site : une question déjà posée ; une nouvelle dit seulement où la réponse s'affiche. */
export function useDemoHelp(items: IslandAdvice[]): { log: HelpExchange[]; onAsk: (question: string, advice: HelpAdvice) => void } {
  const [log, setLog] = useState<HelpExchange[]>(() => {
    const levure = items.find((item) => /ultra-?levure/i.test(item.sheet?.name || item.name));
    return levure ? [{ advice: levure.sheet?.name || levure.name, question: DEMO_HELP.question, answer: DEMO_HELP.answer }] : [];
  });
  return {
    log,
    onAsk: (question, advice) => setLog((current) => [...current, { advice: advice.name, question, answer: "Au comptoir, la réponse de l'aide s'affiche ici, en quelques phrases." }].slice(-4)),
  };
}
