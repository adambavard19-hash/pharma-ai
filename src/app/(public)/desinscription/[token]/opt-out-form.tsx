"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { confirmOptOutAction } from "@/server/actions/reminders";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

/** La désinscription n'a lieu qu'ici, sur une action explicite du patient. */
export function OptOutForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(confirmOptOutAction, null);

  if (state?.ok) {
    return (
      <Alert tone="success" title="C'est fait" icon={<CheckCircle2 className="size-[18px]" />}>
        Vous ne recevrez plus de message de suivi. Vous pouvez à tout moment en redemander
        auprès de votre pharmacien.
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state?.ok === false && <Alert tone="danger">{state.error}</Alert>}
      <Button type="submit" size="lg" variant="outline" loading={pending} className="w-full">
        Ne plus recevoir de suivi
      </Button>
    </form>
  );
}
