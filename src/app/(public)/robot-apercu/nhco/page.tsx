import type { Metadata } from "next";
import { NhcoProposal } from "./proposal";

export const metadata: Metadata = { title: "NHCO × PharmaBoost", robots: { index: false, follow: false } };

/**
 * La proposition de partenariat présentée au directeur commercial de NHCO (fondateur et Donna, 11 nov. 2026) : le comptoir avec
 * la vraie bannière, l'appli des patients, le tableau de bord du laboratoire, la facturation, un simulateur et les formules.
 * Page sans lien depuis le site, fermée à Google (robots.txt refuse /robot-apercu).
 */
export default function NhcoPage() {
  return <NhcoProposal />;
}
