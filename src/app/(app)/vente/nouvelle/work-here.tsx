"use client";

import { useTransition } from "react";
import { Monitor } from "lucide-react";
import { claimComptoirAction, releaseComptoirAction } from "@/server/actions/team-access";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type WorkHereComptoir = { id: string; name: string; assignee: string | null; mine: boolean };

/**
 * « Je travaille ici » : le collaborateur s'identifie au comptoir où il s'installe, d'un clic, sans rien réinstaller. Ses conseils et ses
 * ventes lui sont alors attribués (et non à l'ordinateur). Il n'est qu'à un comptoir à la fois ; le titulaire voit qui est où dans
 * « Mes comptoirs ».
 */
export function WorkHere({ comptoirs }: { comptoirs: WorkHereComptoir[] }) {
  const [pending, start] = useTransition();
  const { push } = useToast();
  if (comptoirs.length === 0) return null;
  const mine = comptoirs.filter((comptoir) => comptoir.mine);

  const run = (action: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const result = await action();
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Fait") : (result.error ?? "Erreur") });
    });

  return (
    <section aria-label="Mon comptoir" className="rounded-xl border border-border-subtle bg-surface-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-[13.5px] font-medium text-text-primary">{mine.length > 0 ? "Vous travaillez à" : "Où travaillez-vous ?"}</p>
        <ul className="flex flex-wrap gap-2">
          {comptoirs.map((comptoir) => (
            <li key={comptoir.id}>
              <button
                type="button"
                disabled={pending}
                aria-pressed={comptoir.mine}
                onClick={() => run(() => (comptoir.mine ? releaseComptoirAction({ postId: comptoir.id }) : claimComptoirAction({ postId: comptoir.id })))}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none disabled:opacity-60",
                  comptoir.mine ? "border-brand-600 bg-brand-600 text-white" : "border-border-default bg-surface-card text-text-primary hover:bg-surface-sunken",
                )}
              >
                <Monitor className="size-3.5" aria-hidden />
                {comptoir.name}
                {!comptoir.mine && <span className={cn("font-normal", comptoir.assignee ? "text-text-secondary" : "text-text-tertiary")}>· {comptoir.assignee ?? "libre"}</span>}
                {comptoir.mine && <span className="font-normal opacity-90">· vous</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-1.5 text-[12.5px] text-text-secondary">
        {mine.length > 0 ? "Vos conseils et vos ventes sont attribués à votre compte. Cliquez sur un autre comptoir pour y changer, ou sur le vôtre pour le libérer." : "Cliquez sur votre comptoir : vos conseils et vos ventes seront attribués à votre compte, pas à l'ordinateur."}
      </p>
    </section>
  );
}
