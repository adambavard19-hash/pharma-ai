"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Menu } from "lucide-react";

/**
 * État du menu mobile, partagé entre la barre supérieure (qui porte le
 * déclencheur) et la barre latérale (qui porte le tiroir).
 *
 * Le déclencheur vivait auparavant en position fixe en haut à gauche de la
 * fenêtre ; il recouvrait alors le bandeau de démonstration. Le placer dans le
 * flux de la barre supérieure supprime tout risque de chevauchement, quelle que
 * soit la hauteur des bandeaux affichés au-dessus.
 */
type MobileNavState = {
  open: boolean;
  openNav: () => void;
  closeNav: () => void;
};

const MobileNavContext = createContext<MobileNavState | null>(null);

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openNav = useCallback(() => setOpen(true), []);
  const closeNav = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ open, openNav, closeNav }), [open, openNav, closeNav]);

  return <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>;
}

export function useMobileNav(): MobileNavState {
  const context = useContext(MobileNavContext);
  if (!context) {
    throw new Error("useMobileNav doit être utilisé dans un MobileNavProvider");
  }
  return context;
}

/** Déclencheur du menu, affiché uniquement sous le point de rupture `lg`. */
export function MobileNavTrigger() {
  const { openNav } = useMobileNav();

  return (
    <button
      type="button"
      onClick={openNav}
      className="-ml-1 rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary lg:hidden"
      aria-label="Ouvrir la navigation"
    >
      <Menu className="size-[18px]" />
    </button>
  );
}
