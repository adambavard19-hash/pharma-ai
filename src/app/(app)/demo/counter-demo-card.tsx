import Link from "next/link";
import { MonitorPlay } from "lucide-react";

/** Le mode à montrer en rendez-vous : l'écran du comptoir, la bannière par-dessus le logiciel, puis le bilan du patient. */
export function CounterDemoCard() {
  return (
    <Link href="/demo/comptoir" className="group flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-300 bg-brand-50 px-5 py-4 transition-colors hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-950/30">
      <div className="min-w-0 space-y-1">
        <p className="text-[16px] font-semibold text-text-primary">Démo au comptoir, comme devant le logiciel de la pharmacie</p>
        <p className="text-[13px] text-text-secondary">Plein écran : vous cliquez sur les boîtes pour les biper, la bannière PharmaBoost s&apos;ouvre avec les conseils, vous bipez le produit vendu, vous terminez avec l&apos;e-mail du patient… et le bilan arrive dans sa boîte mail.</p>
      </div>
      <span className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-4 text-[14px] font-semibold text-white group-hover:bg-brand-700"><MonitorPlay className="size-4" aria-hidden="true" /> Lancer la démo comptoir</span>
    </Link>
  );
}
