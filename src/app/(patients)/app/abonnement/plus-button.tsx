"use client";

import { useState, useTransition } from "react";
import { activatePlusAction, cancelPlusAction } from "@/server/actions/app-members";
import { GRAD } from "../_components/ui";

/**
 * S'abonner. Le paiement n'est pas encore branché : dans l'aperçu, l'abonnement s'active sans paiement pour essayer le
 * parcours ; ailleurs, le bouton dit qu'il ouvre bientôt.
 */
export function PlusButton({ plan, price, preview }: { plan: "FREE" | "PLUS"; price: string; preview: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (plan === "PLUS") {
    return (
      <div className="mt-4 text-center">
        <p className="rounded-2xl bg-[#E8F3EF] py-3 text-[14.5px] font-bold text-[#0B6B5F]">Vous êtes abonné à PharmaBoost+</p>
        <button type="button" disabled={pending} onClick={() => start(async () => { const r = await cancelPlusAction(); setMessage(r.ok ? (r.message ?? null) : r.error); })} className="mt-3 text-[13px] font-semibold text-[#94A3A0]">
          Arrêter mon abonnement
        </button>
        {message && <p className="mt-1 text-[13px] text-[#4B6A62]">{message}</p>}
      </div>
    );
  }
  return (
    <div className="mt-4">
      <button
        type="button"
        data-app-abonner=""
        disabled={pending || !preview}
        onClick={() => start(async () => { const r = await activatePlusAction(); setMessage(r.ok ? (r.message ?? null) : r.error); })}
        className="h-12 w-full rounded-2xl text-[15px] font-bold text-white disabled:opacity-60"
        style={{ background: GRAD }}
      >
        {preview ? `M'abonner · ${price} (aperçu, sans paiement)` : "L'abonnement ouvre bientôt"}
      </button>
      {message && <p className="mt-2 text-center text-[13px] text-[#4B6A62]">{message}</p>}
    </div>
  );
}
