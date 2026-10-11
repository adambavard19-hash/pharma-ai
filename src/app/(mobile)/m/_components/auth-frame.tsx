import type { ReactNode } from "react";
import { FloatingRobot } from "@/app/(public)/decouvrir/_components/floating-robot";
import { Wordmark } from "./ui";

/**
 * Le cadre des écrans d'entrée (connexion, inscription, bienvenue) : un ciel teal avec le robot qui flotte, puis une
 * feuille blanche qui remonte par-dessus, comme l'écran d'accueil d'une application native. Au grand écran, la même
 * composition reste centrée.
 */
export function AuthFrame({ title, subtitle, children, footer }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[linear-gradient(165deg,oklch(0.42_0.07_190)_0%,oklch(0.5_0.085_178)_45%,oklch(0.56_0.1_163)_100%)] lg:items-center lg:justify-center lg:py-12">
      <div className="relative overflow-hidden px-6 pt-[calc(env(safe-area-inset-top,0px)+2.25rem)] pb-14 text-white lg:w-full lg:max-w-[460px] lg:px-2 lg:pb-10">
        {/* Deux halos discrets : la lumière du ciel, pas un motif. */}
        <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-20 size-72 rounded-full bg-white/10 blur-3xl lg:hidden" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 -left-16 size-56 rounded-full bg-leaf-500/30 blur-3xl lg:hidden" />
        <div className="relative mx-auto flex max-w-[440px] items-center gap-4">
          <FloatingRobot className="h-[86px] w-[74px] drop-shadow-[0_10px_18px_rgba(0,0,0,0.18)]" />
          <div className="min-w-0 space-y-1.5">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11.5px] font-semibold tracking-wide backdrop-blur">
              <Wordmark className="text-[12px] text-white [&>span]:text-[#9ff3e1]" /> <span className="opacity-80">Mobile</span>
            </p>
            <h1 className="text-[26px] leading-[1.15] font-bold tracking-[-0.03em] text-balance">{title}</h1>
            {subtitle && <p className="text-[14px] leading-5 text-white/85">{subtitle}</p>}
          </div>
        </div>
      </div>

      <div className="relative -mt-6 flex-1 rounded-t-[28px] bg-[#f6fafa] px-5 pt-7 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.25)] lg:mt-0 lg:w-full lg:max-w-[460px] lg:flex-none lg:rounded-[28px] lg:px-8 lg:pt-8 lg:pb-7">
        <div className="m-page mx-auto w-full max-w-[440px] space-y-6">{children}</div>
        {footer && <div className="mx-auto mt-6 w-full max-w-[440px]">{footer}</div>}
      </div>
    </div>
  );
}
