import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * La pastille des essais du fondateur : passer de la version actuelle à la version améliorée d'un écran, et des vrais
 * chiffres aux chiffres d'exemple (signalés comme tels) quand la base n'a pas encore de ventes (23 oct. 2026).
 */
export function VersionSwitch({ current, note, example = false, exampleHref }: { current: string; note?: string; example?: boolean; exampleHref?: string }) {
  return (
    <div className="space-y-2">
      <nav aria-label="Version" className="flex w-fit flex-wrap items-center gap-1 rounded-2xl border border-dashed border-warning-400 bg-warning-50 p-1 text-[13px] sm:rounded-full dark:bg-warning-950/30">
        <span className="px-2 py-1.5 font-semibold text-warning-800 dark:text-warning-300">Essai à comparer :</span>
        <Link href={current} className="rounded-full px-3 py-1.5 font-medium text-text-secondary hover:bg-white/60">Version actuelle</Link>
        <span className="rounded-full bg-white px-3 py-1.5 font-medium text-text-primary shadow-sm">Version améliorée</span>
        {exampleHref && (
          <>
            <span className="mx-1 h-4 w-px bg-warning-300" aria-hidden="true" />
            <Link href={exampleHref} className={cn("rounded-full px-3 py-1.5 font-medium", !example ? "bg-white text-text-primary shadow-sm" : "text-text-secondary hover:bg-white/60")}>Vrais chiffres</Link>
            <Link href={`${exampleHref}?exemple`} className={cn("rounded-full px-3 py-1.5 font-medium", example ? "bg-white text-text-primary shadow-sm" : "text-text-secondary hover:bg-white/60")}>Chiffres d&apos;exemple</Link>
          </>
        )}
      </nav>
      {note && <p className="text-[13px] text-text-secondary">{note}</p>}
      {example && <p className="w-fit rounded-full bg-warning-100 px-3 py-1 text-[12.5px] font-semibold text-warning-800 dark:bg-warning-950/40 dark:text-warning-300">EXEMPLE : chiffres inventés pour montrer l&apos;écran, pas ceux de l&apos;officine</p>}
    </div>
  );
}
