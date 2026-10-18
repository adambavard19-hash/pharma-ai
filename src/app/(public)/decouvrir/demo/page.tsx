import type { Metadata, ResolvingMetadata } from "next";
import { LeadForm } from "../_components/lead-form";
import { pageShare } from "../_components/share-metadata";
import { connection } from "next/server";
import { loadDemoSlots } from "@/server/services/site-leads";
import { prisma } from "@/server/db/client";

const DESCRIPTION = "Une démonstration de PharmaBoost sur votre poste : la bannière au comptoir, les questions avant le conseil, stock et marge, votre équipe.";

export async function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return {
    title: "Réserver une démo",
    description: DESCRIPTION,
    // Le lien de cette page, partagé, disait « Scan. Conseil. Bilan. » comme l'accueil : il dit maintenant ce qu'il ouvre.
    ...(await pageShare(parent, { path: "/decouvrir/demo", title: "Réserver une démo de PharmaBoost", description: DESCRIPTION })),
  };
}

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ commercial?: string }> }) {
  const { commercial } = await searchParams;
  // Les créneaux libres, lus à chaque visite : un créneau réservé par une autre officine disparaît aussitôt.
  await connection();
  const days = await loadDemoSlots();
  // Le lien d'un commercial (« /decouvrir/demo?commercial=… ») : son nom s'affiche, la demande lui est attribuée.
  const rep = typeof commercial === "string" && commercial.length <= 40 ? await prisma.salesRep.findFirst({ where: { id: commercial, isActive: true }, select: { id: true, firstName: true, lastName: true } }) : null;

  return (
    <div className="mx-auto max-w-6xl px-5 pt-10 pb-16 md:pt-14 md:pb-24">
      <div className="mb-7 max-w-2xl">
        <p className="font-mono text-[12px] tracking-[0.14em] text-brand-700 uppercase">Démonstration</p>
        <h1 className="mt-2 text-[30px] leading-[1.08] font-bold tracking-[-0.03em] text-text-primary text-balance md:text-[38px]">Réserver une démo.</h1>
        <p className="mt-3 text-[15.5px] leading-7 text-text-secondary">Quelques questions, une minute, et vous choisissez le jour et l&apos;heure : votre démo est confirmée aussitôt par e-mail.</p>
        {rep && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-4 py-2 text-[14px] font-medium text-brand-900" data-conseiller="">
            Votre conseiller PharmaBoost : {rep.firstName} {rep.lastName}
          </p>
        )}
      </div>
      <LeadForm days={days} salesRepCode={rep?.id ?? ""} />
    </div>
  );
}
