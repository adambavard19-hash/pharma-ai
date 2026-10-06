import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireDirectorSession } from "@/server/auth/director-session";
import { countActiveReps } from "@/server/services/sales/challenges";
import { defaultChallengeForm } from "@/core/sales/director/challenge";
import { PageHeader } from "@/components/ui/page";
import { AdminSection } from "@/components/admin/page-header";
import { ChallengeForm } from "../_components/challenge-form";

export const metadata: Metadata = { title: "Nouveau challenge" };

/** Lancer un challenge : proposé pour aujourd'hui et jusqu'à la fin du mois, tout se règle. */
export default async function NewChallengePage() {
  await requireDirectorSession();
  const activeReps = await countActiveReps();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nouveau challenge"
        description="Choisissez ce qu'on compte, l'objectif de chaque commercial et la période. Les commerciaux sont prévenus dès le lancement."
        breadcrumb={
          <Link href="/directeur/challenges" className="inline-flex items-center gap-1 text-[12.5px] text-text-tertiary hover:text-text-primary">
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            Tous les challenges
          </Link>
        }
      />
      <AdminSection className="max-w-3xl">
        <ChallengeForm mode="create" initial={defaultChallengeForm(new Date())} activeReps={activeReps} />
      </AdminSection>
    </div>
  );
}
