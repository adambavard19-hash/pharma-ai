"use client";

import { useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";
import { openBillingPortalAction } from "@/server/actions/billing";
import { Button } from "@/components/ui/button";

/** « Gérer mon abonnement » : ouvre le portail client Stripe de l'officine. */
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
        Gérer mon abonnement
      </Button>
      {error && <p className="text-[13px] text-danger-700">{error}</p>}
    </div>
  );
}
