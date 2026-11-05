"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { directorDemoDoneAction, directorSendWelcomeAction } from "@/server/actions/director-demos";

/** « Démo faite » puis « Envoyer le lien de bienvenue », pour une démonstration. */
export function DemoActions({ prospectId, done, mine, spaceOpened }: { prospectId: string; done: boolean; mine: boolean; spaceOpened: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  const run = (action: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const result = await action();
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "C'est fait.") : (result.error ?? "Impossible.") });
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(!done || !mine) && (
        <Button size="sm" variant={done ? "outline" : "primary"} loading={pending} leadingIcon={<CheckCircle2 className="size-4" />} onClick={() => run(() => directorDemoDoneAction({ prospectId }))}>
          {done ? "C'est moi qui l'ai faite" : "Démo faite"}
        </Button>
      )}
      {done && !spaceOpened && (
        <Button size="sm" variant="outline" loading={pending} leadingIcon={<Mail className="size-4" />} onClick={() => run(() => directorSendWelcomeAction({ prospectId }))}>
          Envoyer le lien de bienvenue
        </Button>
      )}
    </div>
  );
}
