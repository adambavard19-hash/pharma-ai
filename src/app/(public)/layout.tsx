import type { ReactNode } from "react";

/** Périmètre public : aucune session, aucune donnée d'officine exposée. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
