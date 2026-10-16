"use client";

import { useActionState, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { partnerConsentAction } from "@/server/actions/partner-consent";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

/** La case n'est jamais cochée d'avance ; sans elle, le bouton ne fait rien. */
export function ConsentForm({ token, subscribed, consentText }: { token: string; subscribed: boolean; consentText: string }) {
  const [state, formAction, pending] = useActionState(partnerConsentAction, null);
  const [checked, setChecked] = useState(false);
  if (subscribed || state?.ok) {
    return (
      <Alert tone="success" title="C'est noté" icon={<CheckCircle2 className="size-[18px]" />}>
        Vous recevrez les offres de nos marques partenaires, au plus une fois par semaine. Chaque e-mail contient un lien pour vous désinscrire.
      </Alert>
    );
  }
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <label className="flex items-start gap-3 rounded-xl border border-border-subtle p-3 text-[13.5px] leading-5 text-text-primary">
        <input type="checkbox" name="accord" value="oui" checked={checked} onChange={(event) => setChecked(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-brand-600" />
        <span>{consentText}</span>
      </label>
      {state?.ok === false && <Alert tone="danger">{state.error}</Alert>}
      <Button type="submit" size="lg" loading={pending} disabled={!checked} className="w-full">
        Je confirme
      </Button>
    </form>
  );
}
