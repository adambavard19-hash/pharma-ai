import type { Metadata } from "next";
import Link from "next/link";
import { ACCENT, Card, GRAD, PageTitle } from "../_components/ui";
import { getAppMember } from "../_components/member";
import { bloodReadingAvailable } from "@/server/services/blood-test";
import { BloodTestPatient } from "./blood-test-patient";

export const metadata: Metadata = { title: "Ma prise de sang" };

/**
 * « Ma prise de sang » (fondateur, 14 nov. 2026) : l'inscrit dépose ses résultats ; l'appli dit ce qui est signalé hors normes,
 * propose les compléments sans ordonnance validés par la pharmacienne de PharmaBoost, et lui donne une fiche à présenter dans
 * sa pharmacie PharmaBoost. Rien n'est enregistré : ni l'image, ni les valeurs (pas d'hébergement HDS).
 */
export default async function PatientBloodTestPage() {
  const member = await getAppMember();
  return (
    <div className="px-5 pt-4 pb-6">
      <PageTitle sub="Vos résultats lus en quelques secondes, et les compléments à demander à votre pharmacien.">Ma prise de sang</PageTitle>
      {!member ? (
        <Card className="mt-5">
          <p className="text-[14.5px] leading-6">Connectez-vous pour faire lire votre prise de sang. C&apos;est gratuit, et rien n&apos;est enregistré.</p>
          <Link href="/app/connexion" className="mt-3 inline-flex h-11 items-center rounded-full px-5 text-[14px] font-bold text-white" style={{ background: GRAD }}>Me connecter</Link>
        </Card>
      ) : !bloodReadingAvailable() ? (
        <Card className="mt-5"><p className="text-[14.5px]" style={{ color: ACCENT }}>La lecture des prises de sang n&apos;est pas disponible pour le moment.</p></Card>
      ) : (
        <BloodTestPatient pharmacy={member.homePharmacy ? { name: member.homePharmacy.name, city: member.homePharmacy.city } : null} />
      )}
    </div>
  );
}
