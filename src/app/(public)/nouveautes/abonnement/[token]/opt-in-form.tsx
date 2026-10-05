"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { confirmNewsOptInAction } from "@/server/actions/patient-news";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

/** L'abonnement n'a lieu qu'ici, sur une action explicite du patient : le bouton. Rien n'est coché d'avance. */
export function OptInForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(confirmNewsOptInAction, null);

  if (state?.ok) {
    return (
      <Alert tone="success" role="status" title="C'est noté" icon={<CheckCircle2 className="size-[18px]" />}>
        Vous recevrez les nouveautés de {state.data.pharmacyName}. Chaque message contient un lien pour vous désinscrire, à tout moment.
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state?.ok === false && <Alert tone="danger">{state.error}</Alert>}
      <Button type="submit" size="lg" loading={pending} className="w-full">
        Oui, tenez-moi informé(e)
      </Button>
      <p className="text-[12px] leading-4 text-text-tertiary">Vous pouvez simplement fermer cette page : sans votre confirmation, rien n&apos;est enregistré.</p>
    </form>
  );
}
