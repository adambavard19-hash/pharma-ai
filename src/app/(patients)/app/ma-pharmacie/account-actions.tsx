"use client";

import { useState, useTransition } from "react";
import { deleteAppAccountAction, logoutAppAction, setOffersConsentAction } from "@/server/actions/app-members";
import { Card } from "../_components/ui";

/** L'accord pour recevoir les offres (retirable d'un geste), la déconnexion et la suppression du compte. */
export function AccountActions({ offersConsent }: { offersConsent: boolean }) {
  const [consent, setConsent] = useState(offersConsent);
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Card className="mt-5">
        <label className="flex items-start gap-3 text-[13.5px] leading-5">
          <input
            type="checkbox"
            checked={consent}
            disabled={pending}
            onChange={(event) => {
              const on = event.target.checked;
              setConsent(on);
              start(async () => { await setOffersConsentAction(on); });
            }}
            className="mt-0.5 size-4 accent-[#0E8A7B]"
          />
          <span>
            <b>Me prévenir des nouvelles offres</b> de ma pharmacie et des laboratoires partenaires, par e-mail. Retirable à tout moment.
          </span>
        </label>
      </Card>
      <button type="button" onClick={() => start(async () => { await logoutAppAction(); })} className="mt-4 w-full pb-2 text-center text-[13px] font-semibold text-[#94A3A0]">
        Me déconnecter
      </button>
      {confirming ? (
        <Card className="mt-3">
          <p className="text-[14px] font-bold">Supprimer votre compte ?</p>
          <p className="mt-1 text-[13px] leading-5 text-[#4B6A62]">Votre adresse, votre pharmacie choisie et vos codes d&apos;offre seront effacés pour de bon.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="h-11 flex-1 rounded-2xl border border-[#E3ECE9] text-[14px] font-semibold">
              Annuler
            </button>
            <button type="button" disabled={pending} data-app-supprimer="" onClick={() => start(async () => { await deleteAppAccountAction(); })} className="h-11 flex-1 rounded-2xl bg-[#B42318] text-[14px] font-bold text-white disabled:opacity-50">
              {pending ? "Suppression…" : "Supprimer"}
            </button>
          </div>
        </Card>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="w-full pb-4 text-center text-[13px] font-semibold text-[#B42318]">
          Supprimer mon compte
        </button>
      )}
    </>
  );
}
