"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { confirmNewsUnsubscribeAction } from "@/server/actions/patient-news";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

/** La désinscription n'a lieu qu'ici, sur une action explicite du patient. */
export function UnsubscribeForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(confirmNewsUnsubscribeAction, null);

  if (state?.ok) {
    return (
      <Alert tone="success" role="status" title="C'est fait" icon={<CheckCircle2 className="size-[18px]" />}>
        Vous ne recevrez plus les nouveautés de {state.data.pharmacyName}, et votre adresse est effacée de sa liste.
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state?.ok === false && <Alert tone="danger">{state.error}</Alert>}
      <Button type="submit" size="lg" variant="outline" loading={pending} className="w-full">
        Ne plus recevoir les nouveautés
      </Button>
    </form>
  );
}
