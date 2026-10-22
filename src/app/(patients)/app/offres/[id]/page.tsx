import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Crown, Lock } from "lucide-react";
import { listMemberOffers } from "@/server/services/app-members";
import { PLUS_PRICE_LABEL } from "@/core/patient-app/offers";
import { Card, Dna, GRAD } from "../../_components/ui";
import { getAppMember } from "../../_components/member";
import { OfferCode } from "./offer-code";

export const metadata: Metadata = { title: "Mon offre" };

const day = (date: Date) => date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

/** Une offre : ce qu'elle donne, où, jusqu'à quand — et son code-barres à faire biper au comptoir. */
export default async function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  const member = await getAppMember();
  if (!member) redirect("/app/connexion");
  const { id } = await params;
  const offer = (await listMemberOffers(member)).find((row) => row.id === id);
  if (!offer) notFound();
  return (
    <div className="relative px-5 pt-4">
      <Dna />
      <div className="relative">
        <Link href="/app/offres" className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-[#4B6A62]"><ArrowLeft className="size-4" aria-hidden="true" /> Mes offres</Link>
        <div className="mt-3 rounded-[24px] p-5 text-white shadow-lg" style={{ background: offer.access === "locked" ? "linear-gradient(135deg,#7C8B88,#5E6E6A)" : GRAD }}>
          <p className="text-[44px] leading-none font-extrabold tracking-[-0.03em]">-{offer.discountPercent} %</p>
          <p className="mt-2 text-[18px] font-bold">{offer.title}</p>
          <p className="text-[14px] text-white/85">{offer.rangeLabel}</p>
          <p className="mt-3 text-[12.5px] text-white/80">{offer.where} · jusqu&apos;au {day(offer.endsAt)}</p>
        </div>
        {offer.details && <p className="mt-3 px-1 text-[13.5px] leading-5 text-[#4B6A62]">{offer.details}</p>}
        {offer.access === "locked" ? (
          <Card className="mt-4 text-center">
            <Lock className="mx-auto size-7 text-[#8A5300]" aria-hidden="true" />
            <p className="mt-2 text-[16px] font-extrabold">Réservée aux abonnés PharmaBoost+</p>
            <p className="mt-1 text-[13.5px] leading-5 text-[#4B6A62]">Abonnez-vous pour obtenir votre code et profiter de toutes les offres.</p>
            <Link href="/app/abonnement" className="mt-3 inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-[14px] font-bold text-white" style={{ background: GRAD }}>
              <Crown className="size-4" aria-hidden="true" /> PharmaBoost+ · {PLUS_PRICE_LABEL}
            </Link>
          </Card>
        ) : (
          <OfferCode offerId={offer.id} initial={offer.code ? { code: offer.code.code, redeemedAt: offer.code.redeemedAt?.toISOString() ?? null } : null} />
        )}
        <p className="mt-4 text-center text-[11.5px] leading-4 text-[#94A3A0]">Offre sur la parapharmacie et les produits conseil, jamais sur un médicament. Une seule utilisation.</p>
      </div>
    </div>
  );
}
