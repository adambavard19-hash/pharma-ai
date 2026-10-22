import type { Metadata } from "next";
import Link from "next/link";
import { Check, Crown } from "lucide-react";
import { PLUS_PRICE_LABEL } from "@/core/patient-app/offers";
import { Card, Dna, GRAD, PageTitle } from "../_components/ui";
import { getAppMember } from "../_components/member";
import { PlusButton } from "./plus-button";

export const metadata: Metadata = { title: "PharmaBoost+" };

const INCLUDED = ["Le scan et la fiche de chaque médicament", "Votre bilan conseil après chaque visite", "Votre armoire et les rappels de péremption", "L'offre de bienvenue de votre pharmacie"];
const PLUS = ["Toutes les offres de votre pharmacie : nouvelles gammes, ventes privées", "Les offres des laboratoires partenaires, dans toutes les pharmacies PharmaBoost", "Prévenu en premier des nouveautés"];

/** PharmaBoost+ (2,99 € par mois) : ce que l'appli donne à tous, et ce que l'abonnement ajoute. */
export default async function PlusPage() {
  const member = await getAppMember();
  return (
    <div className="relative px-5 pt-4">
      <Dna />
      <div className="relative">
        <PageTitle sub="Les remises de votre pharmacie et des laboratoires, réservées aux abonnés.">PharmaBoost+</PageTitle>
        <div className="mt-5 rounded-[24px] p-5 text-white shadow-lg" style={{ background: GRAD }}>
          <Crown className="size-7" aria-hidden="true" />
          <p className="mt-2 text-[34px] leading-none font-extrabold tracking-[-0.03em]">2,99 €<span className="text-[16px] font-bold"> / mois</span></p>
          <p className="mt-1 text-[13.5px] text-white/85">Sans engagement, arrêt à tout moment.</p>
          <ul className="mt-4 space-y-2 text-[14px] leading-5">
            {PLUS.map((line) => (
              <li key={line} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {line}</li>
            ))}
          </ul>
        </div>
        {member ? (
          <PlusButton plan={member.plan} price={PLUS_PRICE_LABEL} preview={process.env.NODE_ENV !== "production"} />
        ) : (
          <Link href="/app/connexion" className="mt-4 flex h-12 items-center justify-center rounded-2xl text-[15px] font-bold text-white" style={{ background: GRAD }}>Me connecter pour m&apos;abonner</Link>
        )}
        <Card className="mt-5">
          <p className="text-[13px] font-extrabold">Pour tous, sans abonnement</p>
          <ul className="mt-2 space-y-1.5 text-[14px] leading-5 text-[#23413B]">
            {INCLUDED.map((line) => (
              <li key={line} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-[#0E8A7B]" aria-hidden="true" /> {line}</li>
            ))}
          </ul>
        </Card>
        <p className="mt-4 text-center text-[11.5px] leading-4 text-[#94A3A0]">Les offres portent sur la parapharmacie et les produits conseil, jamais sur les médicaments.</p>
      </div>
    </div>
  );
}
