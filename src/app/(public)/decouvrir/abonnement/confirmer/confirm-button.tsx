"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { confirmSubscriptionAction } from "@/server/actions/site-leads";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

export function ConfirmButton({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<{ status: string; email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (done) {
    return (
      <div className="space-y-3">
        <CheckCircle2 className="mx-auto size-10 text-success-600" aria-hidden="true" />
        <p className="text-[16px] leading-7 text-text-primary">
          {done.status === "ALREADY_SIGNED" ? "Votre contrat est déjà signé : merci." : done.status === "ALREADY_SENT" ? `Votre contrat vous a déjà été adressé à ${done.email}.` : `Votre contrat vient de partir à ${done.email}.`}
        </p>
        {done.status !== "ALREADY_SIGNED" && <p className="text-[14px] text-text-secondary">Ouvrez l&apos;e-mail « Votre contrat PharmaBoost est prêt à être signé » et signez-le en ligne.</p>}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {error && <Alert tone="warning">{error}</Alert>}
      <Button size="lg" loading={pending} onClick={() => start(async () => {
        setError(null);
        const result = await confirmSubscriptionAction(token);
        if (!result.ok) return setError(result.error);
        setDone(result.data);
      })}>Confirmer et recevoir mon contrat</Button>
    </div>
  );
}
