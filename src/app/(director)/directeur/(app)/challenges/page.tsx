import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Trophy } from "lucide-react";
import { requireDirectorSession } from "@/server/auth/director-session";
import { listChallenges, type ChallengeListItem } from "@/server/services/sales/challenges";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { ChallengeCard } from "./_components/challenge-ui";

export const metadata: Metadata = { title: "Challenges" };

function Section({ title, hint, items, now, empty }: { title: string; hint?: string; items: ChallengeListItem[]; now: Date; empty?: string }) {
  // Une rubrique vide n'est montrée que si elle a quelque chose d'honnête à dire.
  if (items.length === 0 && !empty) return null;
  // Un identifiant sans espace ni accent : « À venir » devient « challenges-a-venir ».
  const headingId = `challenges-${title.normalize("NFD").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 id={headingId} className="text-[15px] font-semibold text-text-primary">
          {title}
          <span className="ml-1.5 text-[13px] font-normal text-text-tertiary tabular">{items.length}</span>
        </h2>
        {hint && <p className="text-[12.5px] text-text-tertiary">{hint}</p>}
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-default px-4 py-5 text-[13.5px] text-text-secondary">{empty}</p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <ChallengeCard key={item.challenge.id} challenge={item.challenge} state={item.state} stoppedEarly={item.stoppedEarly} totals={item.totals} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Les challenges de l'équipe : en cours, à venir, terminés. Un challenge est un
 * objectif par commercial sur une période ; son avancement se calcule tout seul
 * à partir des dossiers.
 */
export default async function DirectorChallengesPage() {
  await requireDirectorSession();
  const now = new Date();
  const { running, upcoming, ended, total } = await listChallenges(now);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Challenges"
        description="Un objectif par commercial sur une période, pour toute l'équipe. L'avancement se calcule tout seul, à partir des dossiers : personne n'a rien à saisir."
        actions={
          <Button asChild leadingIcon={<Plus className="size-[18px]" />}>
            <Link href="/directeur/challenges/nouveau">Nouveau challenge</Link>
          </Button>
        }
      />

      {total === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-surface-card">
          <EmptyState
            icon={<Trophy className="size-5" />}
            title="Aucun challenge pour l'instant"
            description="Lancez un premier défi : un nombre de démonstrations, de contrats ou d'activations à atteindre sur une période. Vos commerciaux sont prévenus et suivent leur avancement."
            action={
              <Button asChild leadingIcon={<Plus className="size-[18px]" />}>
                <Link href="/directeur/challenges/nouveau">Lancer le premier challenge</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <Section title="En cours" items={running} now={now} empty="Aucun challenge en cours." />
          <Section title="À venir" items={upcoming} now={now} />
          <Section title="Terminés" hint={ended.length >= 30 ? "Les 30 plus récents." : undefined} items={ended} now={now} />
        </>
      )}
    </div>
  );
}
