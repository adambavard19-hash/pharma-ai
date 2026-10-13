import type { ReactNode } from "react";
import { HandCoins, Trophy, Users } from "lucide-react";
import { HelixAuthLayout } from "@/components/app/helix/helix-auth-layout";

/**
 * L'écran commun des pages d'accès du directeur (connexion, oubli, mot de passe) : le gabarit de la connexion de
 * l'officine — hélice d'ADN vivante en fond, présentation de l'espace à gauche, formulaire en verre à droite.
 */
const HIGHLIGHTS = [
  {
    icon: Users,
    title: "Votre équipe",
    body: "Les commerciaux, leurs dossiers et leurs rendez-vous, au même endroit.",
  },
  {
    icon: HandCoins,
    title: "Commissions et factures",
    body: "Ce que chacun a gagné, ce qui reste à valider et à régler.",
  },
  {
    icon: Trophy,
    title: "Les challenges",
    body: "Les objectifs de l'équipe et le classement, pour avancer ensemble.",
  },
] as const;

export function DirectorAuthShell({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <HelixAuthLayout
      space="Direction commerciale"
      headline="Pilotez votre équipe commerciale."
      lead="L'espace du directeur commercial de PharmaBoost : votre équipe, ses commissions, ses factures et ses challenges."
      highlights={HIGHLIGHTS}
      footnote="Accès personnel. Chaque connexion est journalisée."
      cardTitle={title}
      cardIntro={intro}
    >
      {children}
    </HelixAuthLayout>
  );
}
