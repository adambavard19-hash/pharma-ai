import Link from "next/link";
import { ChevronRight, Mail, MapPin, Pill, ScanLine, Search, Tag } from "lucide-react";
import { Robot } from "@/components/robot";
import { ACCENT, Card, Dna, GRAD, SectionTitle } from "./_components/ui";

/** L'accueil : deux portes (« Je viens de ma pharmacie », le grand public), le scan et la recherche toujours à portée. */
export default function PatientHome() {
  return (
    <div className="relative px-5 pt-4">
      <Dna className="h-80 opacity-50" />
      <div className="relative">
        <div className="flex items-center gap-2.5">
          <Robot size={46} mood="happy" label="Le robot PharmaBoost" />
          <p className="text-[16px] font-bold">
            Pharma<span style={{ color: ACCENT }}>Boost</span>
          </p>
        </div>
        <h1 className="mt-6 text-[32px] leading-[1.08] font-extrabold tracking-[-0.03em]">
          Votre pharmacie,
          <br />
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: GRAD }}>
            dans la poche.
          </span>
        </h1>
        <p className="mt-2 text-[15px] leading-6 text-[#4B6A62]">Scannez un médicament ou un produit : sa fiche officielle, et le conseil qui l&apos;accompagne.</p>

        <div className="mt-5 flex gap-2.5">
          <Link href="/app/scanner#saisie" className="flex h-12 flex-1 items-center gap-2 rounded-2xl bg-white px-4 text-[14px] text-[#94A3A0] shadow-sm">
            <Search className="size-4" aria-hidden="true" /> Doliprane, amoxicilline…
          </Link>
          <Link href="/app/scanner" aria-label="Scanner une boîte" className="grid size-12 place-items-center rounded-2xl text-white shadow-md" style={{ background: GRAD }}>
            <ScanLine className="size-6" aria-hidden="true" />
          </Link>
        </div>

        <SectionTitle>Je viens de ma pharmacie</SectionTitle>
        <Link href="/app/ma-pharmacie" className="flex items-center gap-3 rounded-[20px] p-4 text-white shadow-lg" style={{ background: GRAD }}>
          <Mail className="size-6 shrink-0" aria-hidden="true" />
          <span className="flex-1">
            <span className="block text-[16px] font-bold">Mon bilan et mes cures</span>
            <span className="block text-[12.5px] text-white/80">Le lien reçu par e-mail de ma pharmacie</span>
          </span>
          <ChevronRight className="size-5" aria-hidden="true" />
        </Link>

        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <Link href="/app/offres">
            <Card className="h-full">
              <Tag className="size-5" style={{ color: ACCENT }} aria-hidden="true" />
              <p className="mt-2 text-[14.5px] font-bold">Mes offres</p>
              <p className="text-[12px] text-[#4B6A62]">Les remises de ma pharmacie</p>
            </Card>
          </Link>
          <Link href="/app/armoire">
            <Card className="h-full">
              <Pill className="size-5" style={{ color: ACCENT }} aria-hidden="true" />
              <p className="mt-2 text-[14.5px] font-bold">Mon armoire</p>
              <p className="text-[12px] text-[#4B6A62]">Ce qui périme bientôt</p>
            </Card>
          </Link>
        </div>

        <SectionTitle>Près de chez vous</SectionTitle>
        <Link href="/app/pharmacies">
          <Card className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-[#E8F3EF]">
              <MapPin className="size-5" style={{ color: ACCENT }} aria-hidden="true" />
            </span>
            <span className="flex-1">
              <span className="block text-[15px] font-bold">Trouver une pharmacie PharmaBoost</span>
              <span className="block text-[12.5px] text-[#4B6A62]">Un conseil personnalisé et un bilan après chaque visite</span>
            </span>
            <ChevronRight className="size-5 text-[#94A3A0]" aria-hidden="true" />
          </Card>
        </Link>
        <p className="mt-6 pb-2 text-center text-[11.5px] leading-4 text-[#94A3A0]">Rien n&apos;est enregistré quand vous scannez, et votre armoire reste sur votre téléphone : PharmaBoost ne garde aucune donnée de santé.</p>
      </div>
    </div>
  );
}
