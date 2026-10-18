"use client";

import { openIsland } from "@/components/island/platform-island";
import { FloatingRobot } from "./floating-robot";

/** Le robot du logo : un clic ouvre la bannière de l'île (jamais au survol). Le nom « PharmaBoost », à côté, mène à l'accueil. */
export function LogoRobotButton() {
  return (
    <button type="button" onClick={() => openIsland("home")} className="flex shrink-0 cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500" aria-label="Ouvrir la bannière PharmaBoost" title="Voir PharmaBoost au comptoir">
      <FloatingRobot className="h-[40px] w-[34px]" track greet="once" greetKey="site" />
    </button>
  );
}
