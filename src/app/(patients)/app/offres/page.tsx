import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Crown, Lock, Tag } from "lucide-react";
import { listMemberOffers } from "@/server/services/app-members";
import { PLUS_PRICE_LABEL } from "@/core/patient-app/offers";
import { ACCENT, Card, Dna, GRAD, PageTitle, SectionTitle } from "../_components/ui";
import { getAppMember } from "../_components/member";

export const metadata: Metadata = { title: "Mes offres" };

const day = (date: Date) => date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });

/**
 * Mes offres : celles de ma pharmacie, puis celles des laboratoires (valables dans toutes les pharmacies PharmaBoost).
 * Une offre réservée aux abonnés se voit, avec son cadenas : c'est elle qui donne envie de s'abonner.
 */
export default async function OffersPage() {
  const member = await getAppMember();
  if (!member) {
    return (
      <div className="relative px-5 pt-4">
        <Dna />
        <div className="relative">
          <PageTitle sub="Les remises de votre pharmacie et des laboratoires partenaires, à montrer au comptoir.">Mes offres</PageTitle>
          <Link href="/app/connexion" className="mt-5 flex items-center gap-3 rounded-[20px] p-4 text-white shadow-lg" style={{ background: GRAD }}>
            <Tag className="size-6 shrink-0" aria-hidden="true" />
            <span className="flex-1 text-[15px] font-bold">Me connecter pour voir mes offres</span>
            <ChevronRight className="size-5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    );
  }
  const offers = await listMemberOffers(member);
  const mine = offers.filter((offer) => offer.funding === "PHARMACY");
  const labs = offers.filter((offer) => offer.funding === "LAB");
  const locked = offers.some((offer) => offer.access === "locked");
  const card = (offer: (typeof offers)[number]) => (
    <Link key={offer.id} href={`/app/offres/${offer.id}`} data-app-offre={offer.id}>
      <Card className="flex items-center gap-3">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl text-[17px] font-extrabold text-white" style={{ background: offer.access === "locked" ? "#94A3A0" : GRAD }}>
          -{offer.discountPercent}%
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold">{offer.title}</span>
          <span className="block truncate text-[12.5px] text-[#4B6A62]">{offer.rangeLabel} · jusqu&apos;au {day(offer.endsAt)}</span>
          {offer.access === "locked" ? (
            <span className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-bold text-[#8A5300]"><Lock className="size-3" aria-hidden="true" /> Réservé aux abonnés PharmaBoost+</span>
          ) : offer.code?.redeemedAt ? (
            <span className="mt-1 inline-block text-[11.5px] font-bold text-[#94A3A0]">Déjà utilisée</span>
          ) : null}
        </span>
        <ChevronRight className="size-5 shrink-0 text-[#94A3A0]" aria-hidden="true" />
      </Card>
    </Link>
  );
  return (
    <div className="relative px-5 pt-4">
      <Dna />
      <div className="relative">
        <PageTitle sub="À montrer au comptoir : la pharmacie bipe le code, la remise est faite en caisse.">Mes offres</PageTitle>
        {locked && (
          <Link href="/app/abonnement" className="mt-4 flex items-center gap-3 rounded-[20px] p-4 text-white shadow-lg" style={{ background: GRAD }}>
            <Crown className="size-6 shrink-0" aria-hidden="true" />
            <span className="flex-1">
              <span className="block text-[15px] font-bold">Débloquez toutes les offres</span>
              <span className="block text-[12.5px] text-white/80">PharmaBoost+ · {PLUS_PRICE_LABEL}, sans engagement</span>
            </span>
            <ChevronRight className="size-5" aria-hidden="true" />
          </Link>
        )}
        <SectionTitle>{member.homePharmacy ? `Chez ${member.homePharmacy.name}` : "Ma pharmacie"}</SectionTitle>
        {!member.homePharmacy && member.declared ? (
          <Card className="text-[14px] leading-6 text-[#4B6A62]">
            {member.declared.pharmacyName} n&apos;est pas encore PharmaBoost{member.declared.wantsJoin ? " : nous lui proposons de rejoindre le réseau" : ""}. Les offres des laboratoires ci-dessous valent dans <Link href="/app/pharmacies" className="font-bold" style={{ color: ACCENT }}>toutes les pharmacies PharmaBoost</Link>.
          </Card>
        ) : !member.homePharmacy ? (
          <Card className="text-[14px] leading-6 text-[#4B6A62]">
            Choisissez votre pharmacie PharmaBoost dans <Link href="/app/ma-pharmacie" className="font-bold" style={{ color: ACCENT }}>Mon espace</Link> pour recevoir ses offres.
          </Card>
        ) : mine.length === 0 ? (
          <Card className="text-[14px] text-[#4B6A62]">Pas d&apos;offre en ce moment. Vous serez prévenu de la prochaine.</Card>
        ) : (
          <div className="space-y-2.5">{mine.map(card)}</div>
        )}
        <SectionTitle>Offres des laboratoires</SectionTitle>
        {labs.length === 0 ? (
          <Card className="text-[14px] text-[#4B6A62]">Pas d&apos;offre de laboratoire en ce moment.</Card>
        ) : (
          <>
            <p className="-mt-1 mb-2 text-[12.5px] text-[#4B6A62]">Valables dans toutes les pharmacies PharmaBoost.</p>
            <div className="space-y-2.5">{labs.map(card)}</div>
          </>
        )}
      </div>
    </div>
  );
}
