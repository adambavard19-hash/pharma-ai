import { Award, Download } from "lucide-react";

/** Le bouton de la fiche « Conseiller certifié PharmaBoost » : un PDF à jour à chaque téléchargement, pour un CV ou un entretien. */
export function AdvisorSheetCard({ firstName }: { firstName: string }) {
  return (
    <div data-fiche-conseiller="" className="flex flex-col gap-4 rounded-2xl border border-brand-200 bg-brand-50/60 p-5 sm:flex-row sm:items-center">
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
        <Award className="size-6" aria-hidden="true" />
      </span>
      <div className="flex-1">
        <p className="text-[16px] font-semibold text-text-primary">Ma fiche Conseiller certifié PharmaBoost</p>
        <p className="text-[14px] text-text-secondary">{firstName}, vos chiffres de conseil, vos domaines et les avis de vos patients, sur un PDF vérifiable. À joindre à un CV ou à montrer en entretien. Elle se met à jour à chaque téléchargement.</p>
      </div>
      <a href="/api/ma-fiche-conseiller" className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-brand-600 px-5 text-[14.5px] font-semibold text-white hover:bg-brand-700">
        <Download className="size-4" aria-hidden="true" /> Télécharger ma fiche
      </a>
    </div>
  );
}
