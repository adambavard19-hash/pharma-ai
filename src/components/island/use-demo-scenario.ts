"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { demoScenario, INITIAL_ISLAND, islandReducer, type IslandAction, type IslandState } from "@/core/island/banner-flow";

/**
 * Le scénario de démonstration de l'île (scan → analyse → conseils → Vendu / Non vendu → e-mail → vente terminée, puis
 * une mise en garde, puis une vente sans conseil), joué en boucle tant que `playing` est vrai. Un geste à la main met en
 * pause ; `restart` reprend du début.
 */
export function useDemoScenario(count: number, playing: boolean) {
  const reducer = useCallback((state: IslandState, action: IslandAction) => islandReducer(state, action, count), [count]);
  const [state, dispatch] = useReducer(reducer, INITIAL_ISLAND);
  const [auto, setAuto] = useState(true);
  const [step, setStep] = useState(0);
  const scenario = useRef(demoScenario(count));

  useEffect(() => {
    if (!auto || !playing) return;
    const current = scenario.current[step];
    const id = setTimeout(() => {
      const action = current.action;
      if (action.type === "type") dispatch({ type: "email", value: action.value });
      else dispatch(action);
      setStep((i) => (i + 1) % scenario.current.length);
    }, current.wait);
    return () => clearTimeout(id);
  }, [auto, playing, step]);

  const manual = useCallback((action: IslandAction) => {
    setAuto(false);
    dispatch(action);
  }, []);
  const restart = useCallback(() => {
    setStep(0);
    dispatch({ type: "reset" });
    setAuto(true);
  }, []);

  return { state, auto, manual, restart };
}
