"use client";

import { useState, useTransition } from "react";
import { logoutAppAction, setOffersConsentAction } from "@/server/actions/app-members";
import { Card } from "../_components/ui";

/** L'accord pour recevoir les offres (retirable d'un geste), et la déconnexion. */
export function AccountActions({ offersConsent }: { offersConsent: boolean }) {
  const [consent, setConsent] = useState(offersConsent);
  const [pending, start] = useTransition();
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
    </>
  );
}
