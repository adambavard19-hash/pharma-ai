import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Crown, LogIn, Mail, Pill, Tag } from "lucide-react";
import { Robot } from "@/components/robot";
import { listPublicPharmacies } from "@/server/services/patient-app";
import { PLUS_PRICE_LABEL } from "@/core/patient-app/offers";
import { ACCENT, Card, Dna, GRAD, PageTitle, SectionTitle } from "../_components/ui";
import { getAppMember } from "../_components/member";
import { PharmacyPicker } from "./pharmacy-picker";
import { AccountActions } from "./account-actions";

export const metadata: Metadata = { title: "Mon espace" };

/**
 * « Mon espace » : le bilan (bientôt relié, tant que l'hébergement de santé agréé n'est pas en place), puis, une fois connecté
 * par e-mail, sa pharmacie (PharmaBoost, ou déclarée hors réseau), l'abonnement PharmaBoost+, ses offres et son armoire.
 */
export default async function MyPharmacyPage({ searchParams }: { searchParams: Promise<{ bienvenue?: string }> }) {
  const [member, { bienvenue }] = await Promise.all([getAppMember(), searchParams]);
  const pharmacies = member ? await listPublicPharmacies() : [];
  return (
    <div className="relative px-5 pt-4">
      <Dna />
      <div className="relative">
        <PageTitle sub={member ? `Connecté avec ${member.emailMasked}` : "Votre bilan, vos cures et votre pharmacie, au même endroit."}>Mon espace</PageTitle>
        {bienvenue && member && <p className="mt-4 rounded-2xl bg-[#E8F3EF] px-4 py-3 text-[13.5px] font-semibold text-[#0B6B5F]">Bienvenue ! Choisissez votre pharmacie pour voir ses offres.</p>}

        <Card className="mt-5 text-center">
          <div className="flex justify-center">
            <Robot size={80} mood="happy" label="Le robot PharmaBoost" />
          </div>
          <p className="mt-3 text-[17px] font-extrabold">Bientôt : retrouvez votre bilan ici</p>
          <p className="mt-1.5 text-[14px] leading-6 text-[#4B6A62]">
            Après votre passage dans une pharmacie PharmaBoost, le lien de votre bilan reçu par e-mail ouvrira votre espace : vos produits, vos rappels de fin de cure et les nouveautés de votre pharmacie.
          </p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold text-white" style={{ background: GRAD }}>
            <Mail className="size-4" aria-hidden="true" /> En attendant, gardez l&apos;e-mail de votre bilan
          </p>
        </Card>

        {!member ? (
          <Link href="/app/connexion" data-app-connexion="" className="mt-4 flex items-center gap-3 rounded-[20px] p-4 text-white shadow-lg" style={{ background: GRAD }}>
            <LogIn className="size-6 shrink-0" aria-hidden="true" />
            <span className="flex-1">
              <span className="block text-[16px] font-bold">Me connecter avec mon e-mail</span>
              <span className="block text-[12.5px] text-white/80">Pour choisir ma pharmacie et voir ses offres</span>
            </span>
            <ChevronRight className="size-5" aria-hidden="true" />
          </Link>
        ) : (
          <>
            <SectionTitle>Ma pharmacie</SectionTitle>
            <PharmacyPicker
              current={member.homePharmacy}
              declared={member.declared}
              pharmacies={pharmacies.map((pharmacy) => ({ id: pharmacy.id, name: pharmacy.name, city: [pharmacy.postalCode, pharmacy.city].filter(Boolean).join(" ") }))}
            />

            <SectionTitle>PharmaBoost+</SectionTitle>
            <Link href="/app/abonnement">
              <Card className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl text-white" style={{ background: GRAD }}>
                  <Crown className="size-5" aria-hidden="true" />
                </span>
                <span className="flex-1">
                  <span className="block text-[15px] font-bold">{member.plan === "PLUS" ? "Vous êtes abonné" : "Les offres réservées aux abonnés"}</span>
                  <span className="block text-[12.5px] text-[#4B6A62]">{member.plan === "PLUS" ? "Toutes les offres de votre pharmacie et des laboratoires" : PLUS_PRICE_LABEL + ", sans engagement"}</span>
                </span>
                <ChevronRight className="size-5 text-[#94A3A0]" aria-hidden="true" />
              </Card>
            </Link>

            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
              <Link href="/app/offres">
                <Card className="h-full">
                  <Tag className="size-5" style={{ color: ACCENT }} aria-hidden="true" />
                  <p className="mt-2 text-[14.5px] font-bold">Mes offres</p>
                  <p className="text-[12px] text-[#4B6A62]">À montrer au comptoir</p>
                </Card>
              </Link>
              <Link href="/app/armoire">
                <Card className="h-full">
                  <Pill className="size-5" style={{ color: ACCENT }} aria-hidden="true" />
                  <p className="mt-2 text-[14.5px] font-bold">Mon armoire</p>
                  <p className="text-[12px] text-[#4B6A62]">Les dates de péremption</p>
                </Card>
              </Link>
            </div>

            <AccountActions offersConsent={member.offersConsent} />
          </>
        )}
      </div>
    </div>
  );
}
