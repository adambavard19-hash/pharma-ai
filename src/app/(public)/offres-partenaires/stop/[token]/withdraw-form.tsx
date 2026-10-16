"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { partnerWithdrawAction } from "@/server/actions/partner-consent";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

export function WithdrawForm({ token, unsubscribed }: { token: string; unsubscribed: boolean }) {
  const [state, formAction, pending] = useActionState(partnerWithdrawAction, null);
  if (unsubscribed || state?.ok) {
    return (
      <Alert tone="success" title="C'est fait" icon={<CheckCircle2 className="size-[18px]" />}>
        Vous ne recevrez plus d&apos;offres de nos marques partenaires. Votre adresse est effacée.
      </Alert>
    );
  }
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state?.ok === false && <Alert tone="danger">{state.error}</Alert>}
      <Button type="submit" size="lg" variant="outline" loading={pending} className="w-full">
        Ne plus recevoir d&apos;offres partenaires
      </Button>
    </form>
  );
}
