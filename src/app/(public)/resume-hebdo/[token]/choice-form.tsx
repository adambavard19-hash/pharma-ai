"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { weeklyDigestChoiceAction } from "@/server/actions/weekly-digest";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

/** Le choix n'a lieu qu'ici, sur un clic du titulaire. */
export function DigestChoiceForm({ token, subscribed: initial }: { token: string; subscribed: boolean }) {
  const [state, formAction, pending] = useActionState(weeklyDigestChoiceAction, null);
  const subscribed = state?.ok ? state.data.subscribed : initial;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="choice" value={subscribed ? "unsubscribe" : "subscribe"} />
      {state?.ok === false && <Alert tone="danger">{state.error}</Alert>}
      {state?.ok && (
        <Alert tone="success" title="C'est fait" icon={<CheckCircle2 className="size-[18px]" />}>
          {state.data.subscribed ? "Vous recevrez de nouveau le résumé chaque lundi." : "Vous ne recevrez plus le résumé de la semaine."}
        </Alert>
      )}
      {!state?.ok && !subscribed && <p className="text-[13.5px] text-text-secondary">Vous ne recevez plus ce résumé.</p>}
      <Button type="submit" size="lg" variant={subscribed ? "outline" : "primary"} loading={pending} className="w-full">
        {subscribed ? "Ne plus recevoir le résumé" : "Recevoir de nouveau le résumé"}
      </Button>
    </form>
  );
}
