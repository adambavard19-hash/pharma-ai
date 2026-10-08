"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getConnectionOverviewAction, type OverviewSnapshot } from "@/server/actions/stock-sync";
import { useToast } from "@/components/ui/toast";

const POLL_MS = 10_000;
/** Un onglet oublié ne doit pas interroger le serveur toute la journée. */
const POLL_MAX_MS = 30 * 60 * 1000;

/**
 * L'état de la connexion, relu toutes les dix secondes : un poste qui vient de se relier, un stock
 * qui arrive. `refresh` relit tout de suite (après un choix, un essai). Aucun code ni aucune clé ne
 * passe par là : seulement l'état affichable.
 */
export function useLiveSnapshot(initial: OverviewSnapshot) {
  const [snapshot, setSnapshot] = useState(initial);
  const { push } = useToast();
  const online = useRef(new Set(initial.overview.agent.items.filter((item) => item.online).map((item) => item.id)));
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    const result = await getConnectionOverviewAction();
    if (!alive.current || !result.ok) return;
    const arrived = result.data.overview.agent.items.filter((item) => item.online && !online.current.has(item.id));
    online.current = new Set(result.data.overview.agent.items.filter((item) => item.online).map((item) => item.id));
    for (const item of arrived) push({ tone: "success", title: `${item.label} est relié.` });
    setSnapshot(result.data);
  }, [push]);

  useEffect(() => {
    alive.current = true;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > POLL_MAX_MS) return;
      void refresh();
    }, POLL_MS);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  return { snapshot, refresh };
}
