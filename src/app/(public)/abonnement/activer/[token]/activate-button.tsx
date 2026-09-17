"use client";

import { useState, useTransition } from "react";
import { startCheckoutAction } from "@/server/actions/subscription-activation";

export function ActivateButton({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-6">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await startCheckoutAction(token);
            if (result && !result.ok) setError(result.error);
          })
        }
        className="inline-flex w-full items-center justify-center rounded-xl bg-[#0F766E] px-5 py-3.5 text-[16px] font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Ouverture du paiement sécurisé…" : "Continuer vers le paiement sécurisé"}
      </button>
      {error && <p className="mt-3 rounded-xl bg-[#fef2f2] px-4 py-3 text-[14px] leading-6 text-[#991b1b]">{error}</p>}
    </div>
  );
}
