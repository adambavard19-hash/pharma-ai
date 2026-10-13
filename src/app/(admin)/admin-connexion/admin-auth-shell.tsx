import type { ReactNode } from "react";
import { Building2, LifeBuoy, ShieldCheck } from "lucide-react";
import { HelixAuthLayout } from "@/components/app/helix/helix-auth-layout";

/**
 * L'écran commun des pages d'accès de la console super admin (connexion, oubli, mot de passe) : le gabarit de la
 * connexion de l'officine — hélice d'ADN vivante en fond, présentation à gauche, formulaire en verre à droite.
 */
const HIGHLIGHTS = [
  {
    icon: Building2,
    title: "Toutes les officines, en un endroit",
    body: "Les pharmacies clientes, leurs postes, leurs abonnements et leur activité, d'un coup d'œil.",
  },
  {
    icon: LifeBuoy,
    title: "L'équipe PharmaBoost au même endroit",
    body: "Les commerciaux, les conseils relus par la pharmacienne, le support et la facturation.",
  },
  {
    icon: ShieldCheck,
    title: "Aucune donnée de santé",
    body: "La console administre des clients, pas des patients : aucun accès aux données médicales des officines.",
  },
] as const;

export function AdminAuthShell({ title, intro, children }: { title: ReactNode; intro?: ReactNode; children: ReactNode }) {
  return (
    <HelixAuthLayout
      space="Centre de contrôle"
      headline="Le centre de contrôle de PharmaBoost."
      lead="L'espace de l'éditeur du logiciel : piloter les officines clientes, l'équipe commerciale et les conseils, depuis un seul écran."
      highlights={HIGHLIGHTS}
      footnote="Accès réservé à l'équipe PharmaBoost. Chaque connexion est journalisée."
      cardTitle={title}
      cardIntro={intro}
    >
      {children}
    </HelixAuthLayout>
  );
}
