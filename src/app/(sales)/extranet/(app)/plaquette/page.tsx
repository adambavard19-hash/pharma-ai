import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { requireSalesSession } from "@/server/auth/sales-session";
import { loadPublicPricing } from "@/server/services/public-pricing";
import { Plaquette } from "@/components/plaquette/plaquette";
import { PLAQUETTE_GENERIC_PDF, PLAQUETTE_SALES_GUIDE_PDF } from "@/components/plaquette/contact";
import { PrintButton } from "./print-button";

/** Le titre de l'onglet est aussi le nom proposé pour le fichier PDF. */
export const metadata: Metadata = { title: { absolute: "PharmaBoost — Plaquette de présentation" } };

/**
 * « Plaquette » : la plaquette de présentation à envoyer aux pharmacies, avec les coordonnées du commercial connecté (nom,
 * e-mail, et téléphone s'il est renseigné sur sa fiche). « Télécharger en PDF » ouvre l'impression du navigateur ; l'extranet
 * est caché à l'impression, seules les six feuilles A4 partent.
 */
export default async function SalesBrochurePage() {
  const session = await requireSalesSession();
  const pricing = await loadPublicPricing();
  const { fullName, email, phone } = session.rep;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div className="max-w-xl">
          <h1 className="text-[26px] leading-8 font-bold tracking-[-0.025em] text-text-primary">Plaquette</h1>
          <p className="mt-1 text-[14px] text-text-secondary">Votre plaquette, avec vos coordonnées : à envoyer aux pharmacies que vous rencontrez.</p>
          <p className="mt-2 text-[12.5px] text-text-tertiary">
            Dans la fenêtre qui s&apos;ouvre, choisissez « Enregistrer au format PDF ».
            {!phone && " Votre téléphone n'est pas renseigné sur votre fiche : la plaquette donne votre e-mail."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PrintButton />
          <a
            href={PLAQUETTE_GENERIC_PDF}
            download
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border-default px-4 text-sm font-medium text-text-primary hover:bg-surface-sunken"
          >
            <FileText className="size-[18px]" aria-hidden="true" />
            Plaquette de présentation (PDF)
          </a>
          <a
            href={PLAQUETTE_SALES_GUIDE_PDF}
            download
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border-default px-4 text-sm font-medium text-text-primary hover:bg-surface-sunken"
          >
            <FileText className="size-[18px]" aria-hidden="true" />
            Guide du commercial (PDF)
          </a>
        </div>
      </div>
      <Plaquette pricing={pricing} contact={{ name: fullName, email, phone }} />
    </>
  );
}
