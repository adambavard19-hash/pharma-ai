import type { Metadata } from "next";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { listPublicPharmacies } from "@/server/services/patient-app";
import { ACCENT, Card, Dna, PageTitle } from "../_components/ui";

export const metadata: Metadata = { title: "Pharmacies PharmaBoost" };

/** Les pharmacies PharmaBoost : un conseil personnalisé au comptoir et un bilan après chaque visite. */
export default async function PharmaciesPage() {
  const pharmacies = await listPublicPharmacies();
  return (
    <div className="relative px-5 pt-4">
      <Dna />
      <div className="relative">
        <PageTitle sub="Un conseil personnalisé au comptoir, et votre bilan après chaque visite.">Pharmacies PharmaBoost</PageTitle>
        {pharmacies.length === 0 ? (
          <Card className="mt-4 text-[14px] text-[#4B6A62]">Les premières pharmacies PharmaBoost arrivent bientôt près de chez vous.</Card>
        ) : (
          <div className="mt-4 space-y-2.5">
            {pharmacies.map((pharmacy) => (
              <Card key={pharmacy.id}>
                <p className="text-[15.5px] font-bold">{pharmacy.name}</p>
                {(pharmacy.address || pharmacy.city) && (
                  <p className="mt-0.5 flex items-start gap-1 text-[13px] text-[#4B6A62]">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" style={{ color: ACCENT }} aria-hidden="true" />
                    {[pharmacy.address, [pharmacy.postalCode, pharmacy.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
        <Link href="/app/ma-pharmacie" data-app-reclamer="" className="mt-4 block rounded-[20px] border-2 border-dashed border-[#B9D8CF] bg-white/60 p-4">
          <p className="text-[15px] font-bold">Votre pharmacie n&apos;est pas dans la liste ?</p>
          <p className="mt-0.5 text-[13px] leading-5 text-[#4B6A62]">Dites-nous laquelle : nous lui proposerons de rejoindre PharmaBoost.</p>
        </Link>
      </div>
    </div>
  );
}
