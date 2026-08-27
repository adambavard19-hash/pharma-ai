import { FlaskConical } from "lucide-react";

/**
 * Bandeau de mode démonstration.
 *
 * Exigence produit : le mode démonstration doit être identifiable
 * immédiatement et sans ambiguïté. Ce bandeau est toujours visible lorsque les
 * données affichées sont fictives.
 */
export function DemoBanner({ providersSimulated }: { providersSimulated: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-accent-200 bg-accent-50 px-4 py-1.5 text-[12px] text-accent-900 dark:border-accent-800/60 dark:bg-accent-900/25 dark:text-accent-100">
      <FlaskConical className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="font-semibold">Mode démonstration</span>
      <span className="text-accent-800/90 dark:text-accent-200/90">
        Patients, ordonnances, produits et ventes sont entièrement fictifs.
        {providersSimulated && " L'extraction d'ordonnance et les explications sont simulées."}{" "}
        Aucune information affichée ne constitue un conseil médical.
      </span>
    </div>
  );
}
