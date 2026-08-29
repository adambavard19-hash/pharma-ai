import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PatientDocument } from "@/components/document/patient-document";
import { getDocumentByToken, recordDocumentView } from "@/server/services/documents";
import type { DocumentContent } from "@/core/documents/types";
import { PrintButton } from "./print-button";

export const metadata: Metadata = {
  title: "Votre fiche conseil",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Page patient sécurisée.
 *
 * Accessible uniquement par un jeton long, aléatoire, révocable et daté. Aucune
 * authentification n'est demandée au patient — l'accès est réservé par la
 * connaissance du lien, distribué par QR code, impression ou envoi.
 */
export default async function PublicDocumentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const document = await getDocumentByToken(token);

  if (!document) notFound();

  await recordDocumentView(document.id);

  const content = document.contentJson as unknown as DocumentContent;

  return (
    <div className="min-h-dvh bg-ink-100 py-6 print:bg-white print:py-0 dark:bg-ink-950">
      <div className="mx-auto max-w-[900px] px-4 print:max-w-none print:px-0">
        <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-[15px] font-semibold text-white">
              ✚
            </span>
            <p className="text-[14px] font-semibold text-text-primary">
              Pharma<span className="text-brand-600 dark:text-brand-400">.ai</span>
            </p>
          </div>
          <PrintButton />
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-lg sm:p-10 print:rounded-none print:p-0 print:shadow-none dark:bg-ink-900">
          <PatientDocument content={content} />
        </div>

        <p className="no-print mt-6 text-center text-[11.5px] leading-5 text-text-tertiary">
          Ce lien est personnel. Il expire automatiquement et peut être révoqué par votre
          pharmacie à tout moment.
        </p>
      </div>
    </div>
  );
}
