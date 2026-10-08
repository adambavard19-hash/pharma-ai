import type { ReactNode } from "react";

/**
 * L'écran commun des pages d'accès du directeur : fond sombre, repère de la
 * marque, titre et une phrase. Même allure que l'extranet des commerciaux.
 */
export function DirectorAuthShell({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#0b1f1c] px-5 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <span aria-hidden="true" className="mx-auto flex size-11 items-center justify-center rounded-xl bg-brand-500 text-lg font-semibold text-white">✚</span>
          <h1 className="text-[20px] font-bold text-white">{title}</h1>
          {intro && <p className="text-[13px] leading-5 text-white/60">{intro}</p>}
        </div>
        {children}
      </div>
    </main>
  );
}
