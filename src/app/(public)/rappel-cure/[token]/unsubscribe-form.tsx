"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { cureUnsubscribeAction } from "@/server/actions/cure-reminders";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

/** La désinscription n'a lieu qu'ici, sur un clic. */
export function CureUnsubscribeForm({ token, optedOut }: { token: string; optedOut: boolean }) {
  const [state, formAction, pending] = useActionState(cureUnsubscribeAction, null);
  if (optedOut || state?.ok) {
    return (
      <Alert tone="success" title="C'est fait" icon={<CheckCircle2 className="size-[18px]" />}>
        Vous ne recevrez plus de rappels de fin de cure. Les rappels déjà prévus sont annulés et leurs adresses effacées.
      </Alert>
    );
  }
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state?.ok === false && <Alert tone="danger">{state.error}</Alert>}
      <Button type="submit" size="lg" variant="outline" loading={pending} className="w-full">
        Ne plus recevoir de rappels de cure
      </Button>
    </form>
  );
}
