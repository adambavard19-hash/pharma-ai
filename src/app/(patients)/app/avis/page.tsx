import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, LogIn, Store } from "lucide-react";
import { teamForMember } from "@/server/services/patient-reviews";
import { Card, Dna, GRAD, PageTitle } from "../_components/ui";
import { getAppMember } from "../_components/member";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Mon avis" };

/**
 * « Mon avis » (18 nov. 2026) : le patient note son passage dans SA pharmacie PharmaBoost et dit qui l'a servi. L'avis arrive au
 * collaborateur et au titulaire ; puis l'appli l'invite à noter PharmaBoost sur l'App Store et sur Google.
 */
export default async function ReviewPage() {
  const member = await getAppMember();
  const team = member ? await teamForMember(member) : [];
  return (
    <div className="relative px-5 pt-4 pb-6">
      <Dna />
      <div className="relative">
        <PageTitle sub={member?.homePharmacy ? `Votre passage chez ${member.homePharmacy.name}` : "Votre passage dans votre pharmacie PharmaBoost"}>Mon avis</PageTitle>
        {!member ? (
          <Link href="/app/connexion" className="mt-5 flex items-center gap-3 rounded-[20px] p-4 text-white shadow-lg" style={{ background: GRAD }}>
            <LogIn className="size-6 shrink-0" aria-hidden="true" />
            <span className="flex-1">
              <span className="block text-[16px] font-bold">Me connecter avec mon e-mail</span>
              <span className="block text-[12.5px] text-white/80">Pour donner mon avis sur ma pharmacie</span>
            </span>
            <ChevronRight className="size-5" aria-hidden="true" />
          </Link>
        ) : !member.homePharmacy ? (
          <Link href="/app/ma-pharmacie">
            <Card className="mt-5 flex items-center gap-3">
              <Store className="size-6 shrink-0 text-[#0E8A7B]" aria-hidden="true" />
              <span className="flex-1">
                <span className="block text-[15px] font-bold">Choisir ma pharmacie</span>
                <span className="block text-[12.5px] text-[#4B6A62]">Votre avis ira à son équipe</span>
              </span>
              <ChevronRight className="size-5 text-[#94A3A0]" aria-hidden="true" />
            </Card>
          </Link>
        ) : (
          <ReviewForm pharmacyName={member.homePharmacy.name} team={team} />
        )}
      </div>
    </div>
  );
}
