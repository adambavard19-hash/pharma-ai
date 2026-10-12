"use client";

import { useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";
import { openBillingPortalAction } from "@/server/actions/billing";
import { Button } from "@/components/ui/button";

/** « Gérer mon moyen de paiement et mes factures » : ouvre le portail client Stripe de l'officine (sans résiliation en libre-service). */
export function ManageSubscriptionButton({ disabled }: { disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        loading={pending}
        disabled={disabled}
        leadingIcon={<ExternalLink className="size-4" />}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await openBillingPortalAction();
            if (result && !result.ok) setError(result.error);
          })
        }
      >
        Gérer mon moyen de paiement et mes factures
      </Button>
      {error && <p className="text-[13px] text-danger-700">{error}</p>}
    </div>
  );
}
