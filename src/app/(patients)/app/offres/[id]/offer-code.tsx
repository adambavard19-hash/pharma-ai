"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { issueOfferCodeAction, offerCodeStateAction } from "@/server/actions/app-members";
import { Barcode } from "../../_components/barcode";
import { Card, GRAD } from "../../_components/ui";

const time = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

/**
 * Le code de l'offre : obtenu d'un geste, puis montré en code-barres. Tant qu'il n'est pas utilisé, l'écran demande toutes les
 * trois secondes si la pharmacie l'a bipé : il passe alors à « Offre utilisée », sous les yeux du patient et du pharmacien.
 */
export function OfferCode({ offerId, initial }: { offerId: string; initial: { code: string; redeemedAt: string | null } | null }) {
  const [code, setCode] = useState(initial);
  const [where, setWhere] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!code || code.redeemedAt) return;
    const id = setInterval(async () => {
      const result = await offerCodeStateAction(offerId);
      if (result.ok && result.data.redeemedAt) {
        setCode((current) => (current ? { ...current, redeemedAt: result.data.redeemedAt } : current));
        setWhere(result.data.pharmacyName);
      }
    }, 3000);
    return () => clearInterval(id);
  }, [code, offerId]);

  if (!code) {
    return (
      <Card className="mt-4 text-center">
        <p className="text-[14px] leading-5 text-[#4B6A62]">Au comptoir, montrez votre code : la pharmacie le bipe et fait la remise.</p>
        {error && <p className="mt-2 text-[13px] text-[#B42318]">{error}</p>}
        <button
          type="button"
          data-app-obtenir-code=""
          disabled={pending}
          onClick={() => start(async () => {
            const result = await issueOfferCodeAction(offerId);
            if (result.ok) setCode(result.data);
            else setError(result.error);
          })}
          className="mt-3 h-12 w-full rounded-2xl text-[15px] font-bold text-white disabled:opacity-50"
          style={{ background: GRAD }}
        >
          {pending ? "…" : "Obtenir mon code"}
        </button>
      </Card>
    );
  }
  if (code.redeemedAt) {
    return (
      <Card className="mt-4 text-center" >
        <div data-app-offre-utilisee="">
          <CheckCircle2 className="mx-auto size-12 text-[#0E8A7B]" aria-hidden="true" />
          <p className="mt-2 text-[18px] font-extrabold">Offre utilisée</p>
          <p className="mt-1 text-[13.5px] text-[#4B6A62]">Le {time(code.redeemedAt)}{where ? ` chez ${where}` : ""}. Merci !</p>
        </div>
      </Card>
    );
  }
  return (
    <div className="mt-4">
      <Barcode code={code.code} />
      <p className="mt-2 text-center text-[12.5px] leading-4 text-[#4B6A62]">Montrez ce code au comptoir. Montez la luminosité de l&apos;écran si la douchette ne le lit pas.</p>
    </div>
  );
}
