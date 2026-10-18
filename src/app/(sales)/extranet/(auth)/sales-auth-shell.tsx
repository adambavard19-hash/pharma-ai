import type { ReactNode } from "react";
import { FileSignature, FolderOpen, Wallet } from "lucide-react";
import { HelixAuthLayout } from "@/components/app/helix/helix-auth-layout";

/**
 * L'écran commun des pages d'accès de l'extranet commercial (connexion, oubli, mot de passe) : le gabarit de la
 * connexion de l'officine — hélice d'ADN vivante en fond, présentation de l'espace à gauche, formulaire en verre à
 * droite.
 */
const HIGHLIGHTS = [
  {
    icon: FolderOpen,
    title: "Vos dossiers",
    body: "Les pharmacies que vous accompagnez, vos rendez-vous et vos démonstrations.",
  },
  {
    icon: FileSignature,
    title: "Vos contrats",
    body: "Les contrats à faire signer et ceux déjà signés, au même endroit.",
  },
  {
    icon: Wallet,
    title: "Vos commissions",
    body: "Ce que vous avez gagné, pharmacie par pharmacie.",
  },
] as const;

export function SalesAuthShell({ title, intro, children }: { title: ReactNode; intro?: ReactNode; children: ReactNode }) {
  return (
    <HelixAuthLayout
      space="Espace affilié"
      headline="L'espace des commerciaux PharmaBoost."
      lead="Tout ce qu'il faut pour accompagner les pharmacies : vos dossiers, vos contrats, vos commissions — depuis l'ordinateur ou le téléphone."
      highlights={HIGHLIGHTS}
      footnote="Accès personnel. Chaque connexion est journalisée."
      cardTitle={title}
      cardIntro={intro}
    >
      {children}
    </HelixAuthLayout>
  );
}
