"use client";

import { useState, useTransition } from "react";
import { startCheckoutAction } from "@/server/actions/subscription-activation";

/**
 * « Continuer vers le paiement sécurisé ». Le code de parrainage est facultatif et
 * proposé seulement quand l'officine n'a pas encore de parrain : il ne change rien
 * au prix de l'officine, il fait baisser celui de l'officine qui l'a recommandée.
 */
export function ActivateButton({ token, askReferral = false }: { token: string; askReferral?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  return (
    <div className="mt-6 space-y-4">
      {askReferral && (
        <label className="block">
          <span className="text-[13.5px] font-medium text-[#374151]">Une officine vous a recommandé PharmaBoost ? Son code (facultatif)</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="PB-XXXXXX"
            autoComplete="off"
            maxLength={20}
            className="mt-1.5 block w-full max-w-[220px] rounded-xl border border-[#d1d5db] px-3.5 py-2.5 text-[15px] tracking-[0.06em] text-[#111827] focus:border-[#0F766E] focus:outline-none"
          />
        </label>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await startCheckoutAction(token, code.trim() || null);
            if (result && !result.ok) setError(result.error);
          })
        }
        className="inline-flex w-full items-center justify-center rounded-xl bg-[#0F766E] px-5 py-3.5 text-[16px] font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Ouverture du paiement sécurisé…" : "Continuer vers le paiement sécurisé"}
      </button>
      {error && <p className="rounded-xl bg-[#fef2f2] px-4 py-3 text-[14px] leading-6 text-[#991b1b]">{error}</p>}
    </div>
  );
}
