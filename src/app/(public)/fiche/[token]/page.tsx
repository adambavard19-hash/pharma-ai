import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PatientDocument } from "@/components/document/patient-document";
import { buildDocumentUrl, getDocumentByToken, recordDocumentView } from "@/server/services/documents";
import type { DocumentContent } from "@/core/documents/types";
import { PrintButton } from "./print-button";

export const metadata: Metadata = {
  title: { absolute: "Votre plan personnalisé" },
  // Le patient voit sa pharmacie, pas un logiciel : les métadonnées héritées
  // de l'application sont remplacées ici.
  description: "Le plan personnalisé préparé avec votre pharmacien.",
  applicationName: "Votre pharmacie",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Page patient sécurisée.
 *
 * Accessible uniquement par un jeton long, aléatoire, révocable et daté. Aucune
 * authentification n'est demandée au patient — l'accès est réservé par la
 * connaissance du lien, distribué par QR code, impression ou envoi. Le patient
 * voit sa pharmacie : aucun nom de logiciel n'apparaît sur cette page.
 *
 * `?format=pdf` : rendu papier, sans barre d'outils, utilisé par le
 * générateur de PDF de l'officine. Une lecture interne : elle n'est pas
 * comptée comme une consultation du patient.
 */
export default async function PublicDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ imprimer?: string; format?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const document = await getDocumentByToken(token);

  if (!document) notFound();

  const paper = query.format === "pdf";
  if (!paper) await recordDocumentView(document.id);

  const content = document.contentJson as unknown as DocumentContent;
  const url = buildDocumentUrl(token);

  if (paper) {
    return (
      <div className="bg-white px-[8mm] py-[6mm]">
        <PatientDocument content={content} variant="print" qrUrl={url} />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#eef1f4] py-4 sm:py-8 print:bg-white print:py-0">
      <div className="mx-auto max-w-[820px] px-3 sm:px-4 print:max-w-none print:px-0">
        <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
          <p className="text-[14px] font-semibold text-[#374151]">{content.pharmacy.name}</p>
          <PrintButton autoPrint={query.imprimer === "1"} />
        </div>

        <div className="rounded-[22px] bg-white p-4 shadow-lg sm:p-8 print:rounded-none print:p-0 print:shadow-none">
          <PatientDocument content={content} qrUrl={url} />
        </div>

        <p className="no-print mt-5 text-center text-[12px] leading-5 text-[#6b7280]">
          Ce lien est personnel. Il expire automatiquement et peut être désactivé par votre pharmacie à tout moment.
        </p>
      </div>
    </div>
  );
}
