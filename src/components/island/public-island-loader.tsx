"use client";

import dynamic from "next/dynamic";
import type { PublicIslandDemo } from "./public-island";

/**
 * L'île du site se charge APRÈS la page (le premier affichage reste léger) : en attendant, une capsule immobile de la
 * même taille tient sa place dans l'en-tête, sans décalage.
 */
const PublicIsland = dynamic(() => import("./public-island").then((m) => m.PublicIsland), {
  ssr: false,
  loading: () => <span aria-hidden="true" className="block h-11 w-[52px] rounded-full bg-[#0B0F14] sm:w-[236px]" />,
});

export function PublicIslandLoader({ demo }: { demo: PublicIslandDemo }) {
  return <PublicIsland demo={demo} />;
}
