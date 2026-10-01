import Link from "next/link";
import type { ReactNode } from "react";
import { PharmaLogo } from "@/components/app/logo";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/decouvrir#preuve", label: "Vendre plus" },
  { href: "/decouvrir#bip", label: "Au bip" },
  { href: "/decouvrir#sans-ordonnance", label: "Sans ordonnance" },
  { href: "/decouvrir#securite", label: "Sécurité" },
  { href: "/decouvrir#pilotage", label: "Pilotage" },
  { href: "/decouvrir#tarifs", label: "Tarifs" },
  { href: "/decouvrir#faq", label: "FAQ" },
  { href: "/decouvrir/equipe", label: "Qui sommes-nous" },
];

export function SiteWordmark({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <Link href="/decouvrir" className={cn("flex items-center gap-2.5 rounded-md", className)} aria-label="PharmaBoost, accueil">
      <PharmaLogo size={30} />
      <span className={cn("text-[17px] font-semibold tracking-[-0.01em]", light ? "text-white" : "text-text-primary")}>
        Pharma<span className={light ? "text-accent-300" : "text-brand-600 dark:text-brand-400"}>Boost</span>
      </span>
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-surface-app/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
        <SiteWordmark />
        <nav className="hidden items-center gap-5 text-[13.5px] text-text-secondary lg:flex" aria-label="Sections">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-sm hover:text-text-primary">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <a href="mailto:contact@pharmaboost.app" className="hidden rounded-md px-3 py-2 text-[13.5px] text-text-secondary hover:text-text-primary md:inline-block">
            Contact
          </a>
          <Link href="/login" className="hidden rounded-md px-3 py-2 text-[13.5px] text-text-secondary hover:text-text-primary sm:inline-block">
            Se connecter
          </Link>
          <Link href="/decouvrir/demo" className="rounded-lg border border-border-default px-3.5 py-2 text-[13.5px] font-medium text-text-primary hover:bg-surface-sunken">
            Réserver une démo
          </Link>
          <Link href="/decouvrir/abonnement" className="rounded-lg bg-brand-600 px-3.5 py-2 text-[13.5px] font-medium text-white shadow-sm hover:bg-brand-700">
            S&apos;abonner
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ contactEmail }: { contactEmail: string }) {
  return (
    <footer className="border-t border-border-subtle bg-surface-card">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <SiteWordmark />
          <p className="max-w-sm text-[13.5px] leading-6 text-text-secondary">
            Le copilote de comptoir qui lit l&apos;ordonnance, vérifie avant de conseiller, et propose dans votre stock. Le pharmacien décide, toujours.
          </p>
          <p className="text-[13px] text-text-tertiary">
            <a href={`mailto:${contactEmail}`} className="hover:text-text-primary">{contactEmail}</a>
          </p>
        </div>
        <FooterColumn
          title="Produit"
          links={[
            { href: "/decouvrir#preuve", label: "Vendre plus, et le prouver" },
            { href: "/decouvrir#bip", label: "L'avis au bip" },
            { href: "/decouvrir#sans-ordonnance", label: "Demande sans ordonnance" },
            { href: "/decouvrir#securite", label: "Sécurité et réglementation" },
            { href: "/decouvrir#pilotage", label: "Pilotage" },
            { href: "/decouvrir#tarifs", label: "Tarifs" },
            { href: "/decouvrir#faq", label: "Questions fréquentes" },
          ]}
        />
        <FooterColumn
          title="PharmaBoost"
          links={[
            { href: "/decouvrir/equipe", label: "Qui sommes-nous" },
            { href: "/decouvrir/demo", label: "Réserver une démo" },
            { href: "/decouvrir/abonnement", label: "S'abonner" },
            { href: "/login", label: "Se connecter" },
            { href: "/decouvrir/mentions-legales", label: "Mentions légales" },
            { href: "/decouvrir/confidentialite", label: "Confidentialité et données" },
          ]}
        />
      </div>
      <div className="border-t border-border-subtle">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-[12.5px] text-text-tertiary">
          <p>© {new Date().getFullYear()} PharmaBoost. Outil d&apos;aide au conseil officinal : il ne prescrit pas et ne se substitue à aucun avis pharmaceutique.</p>
          <p>Conçu en France · Le pharmacien décide · Aucune donnée revendue</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <p className="mb-3 text-[12px] font-semibold tracking-[0.08em] text-text-tertiary uppercase">{title}</p>
      <ul className="space-y-2 text-[13.5px]">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-text-secondary hover:text-text-primary">{link.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Section({ id, eyebrow, title, lede, children, tone = "plain" }: { id?: string; eyebrow: string; title: string; lede?: ReactNode; children: ReactNode; tone?: "plain" | "sunken" }) {
  return (
    <section id={id} className={cn("scroll-mt-20 py-20", tone === "sunken" && "bg-surface-card")}>
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <p className="text-[12.5px] font-semibold tracking-[0.1em] text-brand-700 uppercase dark:text-brand-400">{eyebrow}</p>
          <h2 className="mt-2 text-[30px] leading-[1.15] font-semibold tracking-[-0.02em] text-text-primary text-balance md:text-[36px]">{title}</h2>
          {lede && <p className="mt-4 text-[16.5px] leading-7 text-text-secondary">{lede}</p>}
        </div>
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}

export function Feature({ title, body }: { title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span className="mt-[7px] size-2 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
      <div>
        <p className="text-[15px] font-semibold text-text-primary">{title}</p>
        <p className="mt-0.5 text-[14px] leading-6 text-text-secondary">{body}</p>
      </div>
    </li>
  );
}
