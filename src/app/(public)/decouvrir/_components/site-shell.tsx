import Link from "next/link";
import type { ReactNode } from "react";
import { LogoRobotButton } from "./logo-robot-button";
import { cn } from "@/lib/utils";
import { MobileMenu } from "./mobile-menu";

const NAV = [
  // La bannière du poste de caisse d'abord : c'est ce que l'équipe voit au comptoir.
  { href: "/decouvrir#banniere", label: "Au comptoir" },
  // « Suivi pharmaceutique » retiré du menu (fondateur, 21 oct. 2026) : la section reste sur l'accueil.
  // « Stock et marge » retiré du menu (fondateur, 20 oct. 2026) : la section reste sur l'accueil.
  { href: "/decouvrir/pourquoi", label: "Pourquoi" },
  { href: "/decouvrir#tarif", label: "Offre" },
  // Le programme d'affiliation, dans le menu principal : 100 € par pharmacie apportée et signée (20 oct. 2026).
  { href: "/decouvrir/affiliation", label: "Affiliation" },
];

/**
 * La typographie française à l'écran : une espace insécable avant « ? ! : ; » et à l'intérieur des guillemets. Sans elle, à
 * 320 px, le « ? » d'une question de la FAQ ou le « : » d'une ligne partait seul en début de ligne suivante.
 */
export function fr(text: string): string {
  return text.replace(/ ([?!:;»])/g, "\u00a0$1").replace(/« /g, "«\u00a0");
}

/** Le filet de la marque : du vert au bleu du symbole. */
export const HAIRLINE = "bg-gradient-to-r from-brand-500 via-[#0796b4] to-transparent";

export function SiteWordmark({ className, robot = true }: { className?: string; robot?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {/* Le robot du logo, sans son fond : il flotte, vivant, salue une fois par visite, et c'est LUI qui ouvre la bannière
          de l'île (un clic, jamais au survol ; fondateur 18 oct. 2026). Le nom « PharmaBoost » mène toujours à l'accueil. */}
      {robot && (
        // Le masquage sur une enveloppe : la feuille du robot (hors couches) fixe son `display` et l'emporterait sur `hidden`.
        <LogoRobotButton />
      )}
      <Link href="/decouvrir" className="rounded-md text-[17px] font-semibold tracking-[-0.01em] text-text-primary max-[419px]:text-[16px]" aria-label="PharmaBoost, accueil">
        Pharma<span className="text-brand-600">Boost</span>
      </Link>
    </div>
  );
}

/**
 * Sous 420 px, l'île, la marque, l'appel et le menu ne tenaient plus (à 390 px, l'en-tête débordait encore de 10 px : la
 * page défilait de côté) et, à 320 px, le menu sortait de l'écran. Sous 420 px, marges, appel et marque se resserrent ;
 * sous 390 px (360 px débordait encore de 7 px), l'appel se réduit à « Démo » (le lien garde son nom entier pour les
 * lecteurs d'écran). À 420 px et au-delà, rien ne change. Le fond est un peu plus transparent : l'encre ADN du héros, qui commence sous l'en-tête, s'y devine.
 */
export function SiteHeader({ island }: { island?: ReactNode }) {
  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-40 border-b border-border-subtle bg-surface-app/70 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-5 max-[419px]:px-3 xl:max-[1599px]:max-w-[1280px] min-[1600px]:max-w-[1520px]">
        {/* L'île PharmaBoost : au milieu de l'en-tête sur tablette et ordinateur. Sur téléphone, sa capsule noire n'est pas
            montrée (retour du fondateur, 13 oct. 2026) : seul le robot vivant, transparent, se tient devant le nom. */}
        {/* Avec le menu complet (à partir de 1280 px), marque + six onglets + île + boutons ne tenaient plus dans 1 152 px :
            « Réserver une démo » sortait de l'écran (mesuré à 1440 px, 18 oct. 2026). L'île s'efface donc entre 1280 et 1599 px
            (l'en-tête passe à 1 280 px), puis revient au milieu à partir de 1600 px, où tout tient. Sous 1280 px (menu replié), rien ne change. */}
        {/* Depuis le 18 oct. 2026, l'île n'a plus de capsule dans l'en-tête (largeur nulle) : elle s'ouvre d'un clic sur le robot du logo. */}
        {island && <div className="flex md:order-2 md:mx-auto">{island}</div>}
        {/* Le robot vivant à côté du nom, comme le fondateur l'a demandé : la marque se lit « robot + PharmaBoost ». */}
        <SiteWordmark className="md:order-1" />
        <nav className="ml-6 hidden items-center gap-0.5 md:order-1 xl:flex" aria-label="Sections">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-full px-3 py-2 text-[13.5px] font-medium whitespace-nowrap text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5 md:order-3 md:ml-0 max-[419px]:gap-1 xl:max-[1599px]:ml-auto">
          <Link href="/login" className="hidden rounded-full px-3 py-2 text-[13.5px] font-medium whitespace-nowrap text-text-secondary hover:bg-surface-sunken hover:text-text-primary xl:inline-block">
            Se connecter
          </Link>
          <Link href="/decouvrir/abonnement" className="hidden rounded-full border border-border-default px-4 py-2 text-[13.5px] font-semibold whitespace-nowrap text-text-primary hover:border-brand-400 md:inline-block">
            S&apos;abonner
          </Link>
          <Link href="/decouvrir/demo" className="rounded-full bg-brand-600 px-4 py-2 text-[13.5px] font-semibold whitespace-nowrap text-white shadow-sm hover:bg-brand-700 max-[419px]:px-3 max-[419px]:text-[12.5px]">
            <span className="max-[389px]:sr-only">Réserver une </span>
            <span className="max-[389px]:capitalize">démo</span>
          </Link>
          <MobileMenu>
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="block rounded-xl px-3.5 py-2.5 text-[15px] font-medium text-text-primary hover:bg-surface-sunken">
                {item.label}
              </Link>
            ))}
            <div className="my-1.5 h-px bg-border-subtle" />
            <Link href="/decouvrir/abonnement" className="block rounded-xl px-3.5 py-2.5 text-[15px] font-medium text-text-primary hover:bg-surface-sunken">S&apos;abonner</Link>
            <Link href="/login" className="block rounded-xl px-3.5 py-2.5 text-[15px] font-medium text-text-secondary hover:bg-surface-sunken">Se connecter</Link>
            <Link href="/decouvrir/partenaires" className="block rounded-xl px-3.5 py-2.5 text-[15px] font-medium text-text-secondary hover:bg-surface-sunken">Devenir partenaire</Link>
          </MobileMenu>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ contactEmail }: { contactEmail: string }) {
  return (
    <footer className="border-t border-border-subtle bg-surface-app">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          <SiteWordmark />
          <p className="max-w-sm text-[14px] leading-6 text-text-secondary">Le copilote du comptoir officinal. Le pharmacien décide.</p>
          <a href={`mailto:${contactEmail}`} className="inline-block text-[13.5px] text-text-secondary hover:text-text-primary">{contactEmail}</a>
        </div>
        <ul className="space-y-2 text-[13.5px]">
          {[
            { href: "/decouvrir/pourquoi", label: "Pourquoi PharmaBoost" },
            { href: "/decouvrir/partenaires", label: "Devenir partenaire" },
            { href: "/decouvrir/affiliation", label: "Affiliation" },
            { href: "/decouvrir/mentions-legales", label: "Mentions légales" },
            { href: "/decouvrir/confidentialite", label: "Confidentialité et données" },
          ].map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="text-text-secondary hover:text-text-primary">{link.label}</Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-border-subtle">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-[12.5px] text-text-tertiary">
          <p>© {new Date().getFullYear()} PharmaBoost · Outil d&apos;aide au conseil officinal. Il ne prescrit pas.</p>
          <p>Conçu en France</p>
        </div>
      </div>
    </footer>
  );
}

/** Le repère de section : un numéro et un mot, en chasse fixe, comme une étiquette d'instrument. */
export function Kicker({ n, children, className }: { n?: string; children: ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-center gap-3 font-mono text-[12px] tracking-[0.14em] text-brand-700 uppercase", className)}>
      {n && <span className="text-text-tertiary">{n}</span>}
      {n && <span className={cn("h-px w-8", HAIRLINE)} aria-hidden="true" />}
      {children}
    </p>
  );
}

export function SectionHead({ n, kicker, title, children, center = false, as: Heading = "h2", bodyClassName }: { n?: string; kicker?: string; title: ReactNode; children?: ReactNode; center?: boolean; as?: "h1" | "h2"; bodyClassName?: string }) {
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
      {kicker && <Kicker n={n} className={center ? "justify-center" : undefined}>{kicker}</Kicker>}
      <Heading className={cn(kicker && "mt-4", "text-[34px] leading-[1.05] font-semibold tracking-[-0.03em] text-text-primary text-balance md:text-[48px]")}>{title}</Heading>
      {children && <p className={cn("mt-4 text-[17px] leading-7 text-text-secondary", bodyClassName)}>{children}</p>}
    </div>
  );
}

/** Un mot-clé et sa ligne : la brique de base de la page. */
export function KeyCell({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("p-5 sm:p-6", className)}>
      <p className="font-mono text-[11.5px] tracking-[0.14em] text-text-tertiary uppercase">{label}</p>
      <p className="mt-2 text-[17px] leading-snug font-semibold text-text-primary">{fr(value)}</p>
    </div>
  );
}
