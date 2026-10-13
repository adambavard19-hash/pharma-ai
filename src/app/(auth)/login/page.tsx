import type { Metadata } from "next";
import Link from "next/link";
import { getInstallState } from "@/server/services/install-state";
import { LoginForm } from "./login-form";
import { ShieldCheck, Sparkles, Stethoscope } from "lucide-react";
import { Alert } from "@/components/ui/feedback";
import { AUTH_LINK_STRONG, HelixAuthLayout } from "@/components/app/helix/helix-auth-layout";

export const metadata: Metadata = { title: "Connexion" };

const HIGHLIGHTS = [
  {
    icon: Stethoscope,
    title: "Le pharmacien décide",
    body: "Chaque conseil proposé est accepté, modifié, remplacé ou retiré par un professionnel avant d'atteindre le patient.",
  },
  {
    icon: ShieldCheck,
    title: "La sécurité passe avant tout",
    body: "Le moteur écarte une proposition contre-indiquée avant même de regarder le catalogue. La marge n'intervient jamais dans cet arbitrage.",
  },
  {
    icon: Sparkles,
    title: "La valeur créée se mesure",
    body: "Chaque vente issue d'un conseil est rattachée à sa recommandation : le chiffre d'affaires additionnel est constaté, pas estimé.",
  },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ defini?: string }> }) {
  const [install, { defini }] = await Promise.all([getInstallState(), searchParams]);

  return (
    // L'espace pharmacie (globals.css : vert de marque, boutons en pilule, verre) et, en fond de toute la fenêtre,
    // l'hélice d'ADN de Dantora qui suit la souris — le gabarit commun des pages d'accès.
    <HelixAuthLayout
      headline="Le copilote intelligent de l'officine."
      lead="De l'ordonnance au conseil personnalisé : PharmaBoost assiste votre équipe, structure l'information remise au patient et mesure précisément ce que cela apporte à votre officine."
      highlights={HIGHLIGHTS}
      footnote="PharmaBoost est un outil d'assistance. Il ne prescrit pas et ne se substitue à aucun avis médical ou pharmaceutique."
      cardTitle="Connexion à votre officine"
      cardIntro="Accédez au comptoir, au catalogue et au pilotage de votre pharmacie."
    >
      {defini === "1" && <Alert tone="success">Mot de passe enregistré. Connectez-vous avec votre adresse e-mail et ce nouveau mot de passe.</Alert>}

      <LoginForm install={install} initialError={null} />

      <p className="text-center text-[13.5px] text-text-secondary">
        Votre titulaire ne vous a pas encore invité ?{" "}
        <Link href="/rejoindre" className={AUTH_LINK_STRONG}>
          Rejoindre mon officine
        </Link>
      </p>
    </HelixAuthLayout>
  );
}
