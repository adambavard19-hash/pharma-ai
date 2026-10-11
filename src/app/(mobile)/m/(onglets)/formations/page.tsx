import type { Metadata } from "next";
import { GraduationCap } from "lucide-react";
import { requireUser } from "@/server/auth/user-session";
import { ScreenTitle } from "../../_components/ui";
import { ComingSoonCard, SegmentsPreview } from "../../_components/coming-soon";

export const metadata: Metadata = { title: "Formations" };

/**
 * L'Académie — construite par l'étape « Formations » du chantier mobile. Ses composants vont dans
 * `formations/_components` ; le schéma est prêt (TrainingContent enrichi, TrainingModule, QuizQuestion, QuizAttempt,
 * SkillBadge, progression hors officine).
 */
export default async function FormationsPage() {
  const session = await requireUser();
  return (
    <div className="space-y-5">
      <ScreenTitle title="Formations" subtitle="Des vidéos courtes et des parcours, relus par des pharmaciens." />
      <SegmentsPreview segments={["Pour vous", "Parcours", "Passeport"]} />
      <ComingSoonCard
        icon={<GraduationCap className="size-6" aria-hidden="true" />}
        title="L'Académie PharmaBoost arrive"
        body={session.isClientStaff ? "Les formations de votre officine et celles de PharmaBoost, au même endroit, avec votre progression." : "Les formations ouvertes aux comptes gratuits, avec votre progression et vos badges."}
        items={["Micro-vidéos verticales de 1 à 3 minutes", "Un quiz pour valider chaque notion", "Des parcours : bien démarrer au comptoir, dermocosmétique…", "Votre passeport de compétences, qui vous suit d'une officine à l'autre"]}
      />
    </div>
  );
}
