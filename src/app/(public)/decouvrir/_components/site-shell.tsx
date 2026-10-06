import Link from "next/link";
import type { ReactNode } from "react";
import { PharmaLogo } from "@/components/app/logo";
import { cn } from "@/lib/utils";
import { MobileMenu } from "./mobile-menu";

const NAV = [
  { href: "/decouvrir#fonctionnement", label: "Fonctionnement" },
  { href: "/decouvrir#stock-marge", label: "Stock et marge" },
  { href: "/decouvrir/pourquoi", label: "Pourquoi" },
  { href: "/decouvrir#tarif", label: "Tarif" },
];

/** Le filet de la marque : du vert au bleu du symbole. */
export const HAIRLINE = "bg-gradient-to-r from-brand-500 via-[#0796b4] to-transparent";

export function SiteWordmark({ className }: { className?: string }) {
  return (
    <Link href="/decouvrir" className={cn("flex items-center gap-2.5 rounded-md", className)} aria-label="PharmaBoost, accueil">
      <PharmaLogo size={30} />
      <span className="text-[17px] font-semibold tracking-[-0.01em] text-text-primary">
        Pharma<span className="text-brand-600">Boost</span>
      </span>
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-40 border-b border-border-subtle bg-surface-app/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-5">
        <SiteWordmark />
        <nav className="ml-6 hidden items-center gap-0.5 xl:flex" aria-label="Sections">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-full px-3 py-2 text-[13.5px] font-medium whitespace-nowrap text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <Link href="/login" className="hidden rounded-full px-3 py-2 text-[13.5px] font-medium whitespace-nowrap text-text-secondary hover:bg-surface-sunken hover:text-text-primary xl:inline-block">
            Se connecter
          </Link>
          <Link href="/decouvrir/abonnement" className="hidden rounded-full border border-border-default px-4 py-2 text-[13.5px] font-semibold whitespace-nowrap text-text-primary hover:border-brand-400 md:inline-block">
            S&apos;abonner
          </Link>
          <Link href="/decouvrir/demo" className="rounded-full bg-brand-600 px-4 py-2 text-[13.5px] font-semibold whitespace-nowrap text-white shadow-sm hover:bg-brand-700">
            Réserver une démo
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
            <Link href="/decouvrir/commercial" className="block rounded-xl px-3.5 py-2.5 text-[15px] font-medium text-text-secondary hover:bg-surface-sunken">Devenir commercial</Link>
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
            { href: "/decouvrir/commercial", label: "Devenir commercial" },
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

export function SectionHead({ n, kicker, title, children, center = false, as: Heading = "h2" }: { n?: string; kicker: string; title: ReactNode; children?: ReactNode; center?: boolean; as?: "h1" | "h2" }) {
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
      <Kicker n={n} className={center ? "justify-center" : undefined}>{kicker}</Kicker>
      <Heading className="mt-4 text-[34px] leading-[1.05] font-semibold tracking-[-0.03em] text-text-primary text-balance md:text-[48px]">{title}</Heading>
      {children && <p className="mt-4 text-[17px] leading-7 text-text-secondary">{children}</p>}
    </div>
  );
}

/** Un mot-clé et sa ligne : la brique de base de la page. */
export function KeyCell({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("p-5 sm:p-6", className)}>
      <p className="font-mono text-[11.5px] tracking-[0.14em] text-text-tertiary uppercase">{label}</p>
      <p className="mt-2 text-[17px] leading-snug font-semibold text-text-primary">{value}</p>
    </div>
  );
}
