import type { ComponentType, ReactNode } from "react";
import { PharmaWordmark } from "@/components/app/logo";
import { Robot } from "@/components/robot";
import { HelixBackdrop } from "./helix-backdrop";

/**
 * Le gabarit commun des pages d'accès (connexion, mot de passe oublié, premier accès) : celui de la connexion de
 * l'officine, repris pour la console super admin, la direction commerciale et l'extranet des commerciaux.
 *
 *  - en fond de toute la fenêtre, l'hélice d'ADN de Dantora qui suit la souris (`HelixBackdrop framing="hero"`) ;
 *  - à gauche (grand écran), la présentation de l'espace posée sur le fond menthe, avec le robot vivant sans fond ;
 *  - à droite, le panneau du formulaire en verre dépoli.
 *
 * La classe `espace-pharmacie` apporte les jetons de l'espace (vert de marque, boutons en pilule, verre) — voir
 * globals.css. Ce gabarit ne porte aucune logique : chaque page garde sa garde de session, ses textes et son
 * formulaire.
 */

export type AuthHighlight = { icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>; title: string; body: string };

export function HelixAuthLayout({
  space,
  headline,
  lead,
  highlights = [],
  footnote,
  cardTitle,
  cardIntro,
  children,
}: {
  /** Le nom de l'espace, sous « PharmaBoost » (absent pour l'officine). */
  space?: string;
  headline: ReactNode;
  lead: ReactNode;
  highlights?: readonly AuthHighlight[];
  footnote?: ReactNode;
  cardTitle: ReactNode;
  cardIntro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main
      data-auth-layout=""
      className="espace-pharmacie relative grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-10 lg:px-10 xl:gap-16 xl:px-14"
    >
      <HelixBackdrop framing="hero" />

      <section className="hidden flex-col justify-between py-10 text-text-primary lg:flex xl:py-14">
        <div className="flex items-center gap-2.5">
          {/* Le robot vivant de l'espace (le même que dans le menu), sans carré derrière. */}
          <Robot size={42} track interactive label="Le robot PharmaBoost" />
          <div>
            <p className="text-[17px] font-semibold tracking-[-0.01em]">
              Pharma<span className="text-brand-700">Boost</span>
            </p>
            {space && <p className="text-[12.5px] leading-4 text-text-tertiary">{space}</p>}
          </div>
        </div>

        <div className="max-w-xl space-y-10">
          <div className="space-y-5">
            <h1 className="text-[44px] leading-[1.08] font-light tracking-[-0.03em] xl:text-[56px]">{headline}</h1>
            <p className="max-w-lg text-[16px] leading-7 text-text-secondary">{lead}</p>
          </div>

          {highlights.length > 0 && (
            <ul className="max-w-lg space-y-3">
              {highlights.map((item) => (
                <li key={item.title} className="flex gap-3.5 rounded-[24px] border border-white/70 bg-(--glass-soft) px-4 py-3.5 backdrop-blur-[10px]">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-citron-200 text-brand-800">
                    <item.icon className="size-[17px]" aria-hidden="true" />
                  </span>
                  <div className="space-y-0.5">
                    <p className="text-[14px] font-medium">{item.title}</p>
                    <p className="text-[13px] leading-5 text-text-secondary">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {footnote ? <p className="text-[12px] text-text-tertiary">{footnote}</p> : <span />}
      </section>

      <section className="flex flex-col justify-center px-4 py-10 sm:px-10 lg:px-0">
        <div className="mx-auto w-full max-w-md space-y-8 rounded-[32px] border border-white/70 bg-(--glass-soft) px-6 py-8 shadow-[0_24px_60px_-30px_rgb(5_64_56/0.35)] backdrop-blur-[12px] sm:px-9 sm:py-10">
          <div className="space-y-6 lg:hidden">
            <PharmaWordmark size={36} subtitle={space} />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-[24px] font-semibold tracking-[-0.015em] text-text-primary">{cardTitle}</h2>
            {cardIntro && <div className="text-[13.5px] leading-5 text-text-secondary">{cardIntro}</div>}
          </div>

          {children}
        </div>
      </section>
    </main>
  );
}

/** Les classes partagées des formulaires posés sur le verre (champs, libellés, liens discrets). */
export const AUTH_LINK = "text-text-tertiary underline underline-offset-2 hover:text-text-secondary";
export const AUTH_LINK_STRONG = "font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400";
