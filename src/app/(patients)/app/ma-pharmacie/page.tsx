import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { Robot } from "@/components/robot";
import { Card, Dna, GRAD, PageTitle } from "../_components/ui";

export const metadata: Metadata = { title: "Mon espace" };

/**
 * « Je viens de ma pharmacie » : en phase 1, rien n'est encore relié (aucun compte, aucune donnée de santé tant que
 * l'hébergement de santé agréé n'est pas en place). L'écran annonce ce qui arrive.
 */
export default function MyPharmacyPage() {
  return (
    <div className="relative px-5 pt-4">
      <Dna />
      <div className="relative">
        <PageTitle sub="Votre bilan, vos cures et votre pharmacie, au même endroit.">Mon espace</PageTitle>
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
      </div>
    </div>
  );
}
