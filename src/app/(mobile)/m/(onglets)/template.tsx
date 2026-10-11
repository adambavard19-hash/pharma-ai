import type { ReactNode } from "react";

/**
 * Rejoué à chaque changement d'écran (un « template » reçoit une clé par route) : l'écran qui arrive glisse
 * légèrement vers le haut. Animation CSS seule ; rien ne bouge pour qui a demandé moins d'animations.
 */
export default function MobileTabsTemplate({ children }: { children: ReactNode }) {
  return <div className="m-page">{children}</div>;
}
