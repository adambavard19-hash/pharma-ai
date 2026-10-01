import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bell, Boxes, Brain, CalendarCheck, Check, HelpCircle, Home, Pill, QrCode, ShieldCheck, Users } from "lucide-react";
import { BeforeAfter } from "../_components/before-after";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Pourquoi PharmaBoost", description: "Deux problèmes de tous les jours au comptoir, et ce que PharmaBoost y change : pour le pharmacien, pour le patient." };

/**
 * Pourquoi ce projet existe : deux scènes « sans / avec », presque sans
 * texte. Le pharmacien qui n'est pas un vendeur, et le patient qui rentre
 * chez lui sans se rappeler.
 */
export default function WhyPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      <div className="max-w-2xl">
        <p className="text-[12.5px] font-semibold tracking-[0.1em] text-brand-700 uppercase dark:text-brand-400">Pourquoi PharmaBoost</p>
        <h1 className="mt-2 text-[36px] leading-[1.1] font-semibold tracking-[-0.025em] text-text-primary text-balance md:text-[44px]">Deux problèmes de tous les jours. Une réponse au comptoir, une à la maison.</h1>
      </div>

      {/* ---- Problème 1 ---------------------------------------------- */}
      <section className="mt-14 grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
        <div>
          <p className="text-[12.5px] font-semibold tracking-[0.1em] text-text-tertiary uppercase">Problème 1 · au comptoir</p>
          <h2 className="mt-2 text-[28px] leading-[1.15] font-semibold tracking-[-0.02em] text-text-primary text-balance">Un pharmacien n&apos;est pas un vendeur. Et il n&apos;a pas tout le stock en tête.</h2>
          <p className="mt-3 text-[15px] leading-6 text-text-secondary">Trente patients par heure, des ordonnances, des questions. Penser à chaque fois au bon produit complémentaire, à sa place en rayon, à ce qui est contre-indiqué : personne ne tient ce rythme.</p>
          <p className="mt-3 text-[15px] leading-6 font-medium text-text-primary">PharmaBoost y pense à sa place, et lui laisse le dernier mot.</p>
        </div>
        <BeforeAfter
          before={
            <Counter
              bubbles={["Un probiotique ? Il m'en reste ?", "Interaction avec son traitement ?", "La file d'attente…"]}
              tone="before"
              footer="Le conseil n'est pas donné. Le patient repart avec son ordonnance, rien de plus."
            />
          }
          after={
            <Counter
              bubbles={["Probiotique 30 gélules · 14,90 € · 8 en rayon", "Vérifié : aucune interaction", "Phrase prête : « votre antibiotique peut perturber la flore… »"]}
              tone="after"
              footer="Le conseil arrive au bip, déjà vérifié, avec le produit en rayon. Le pharmacien accepte, ou pas."
            />
          }
        />
      </section>

      <ul className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { icon: Brain, t: "Il pense au conseil", d: "Pour chaque ordonnance, le besoin que le patient va avoir." },
          { icon: Boxes, t: "Il connaît le rayon", d: "Seulement ce qui est en stock, avec le prix et la marge." },
          { icon: ShieldCheck, t: "Il vérifie avant", d: "Interactions, contre-indications, réglementation." },
        ].map((item) => (
          <li key={item.t} className="flex items-start gap-3 rounded-2xl border border-border-subtle bg-surface-card p-4">
            <item.icon className="mt-0.5 size-5 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            <span><span className="block text-[14.5px] font-semibold text-text-primary">{item.t}</span><span className="block text-[13px] text-text-secondary">{item.d}</span></span>
          </li>
        ))}
      </ul>

      {/* ---- Problème 2 ---------------------------------------------- */}
      <section className="mt-20 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <div className="order-2 lg:order-1">
          <BeforeAfter
            before={
              <HomeScene
                tone="before"
                items={["Celui-là, c'est matin ou soir ?", "Pourquoi deux boîtes ?", "J'ai oublié de dire mon allergie…"]}
                footer="À la maison, le sac de boîtes. Plus personne pour répondre."
              />
            }
            after={
              <HomeScene
                tone="after"
                items={["Matin : AMOXICILLINE 1 g · 1 comprimé", "Soir : AMOXICILLINE 1 g · 1 comprimé", "Jusqu'au 7 octobre, même si ça va mieux"]}
                footer="Son plan sur son téléphone, les rappels dans son agenda, et un signe de la pharmacie le dernier jour."
              />
            }
          />
        </div>
        <div className="order-1 lg:order-2">
          <p className="text-[12.5px] font-semibold tracking-[0.1em] text-text-tertiary uppercase">Problème 2 · à la maison</p>
          <h2 className="mt-2 text-[28px] leading-[1.15] font-semibold tracking-[-0.02em] text-text-primary text-balance">Le patient sort avec cinq boîtes. Dix minutes plus tard, il a oublié.</h2>
          <p className="mt-3 text-[15px] leading-6 text-text-secondary">Quand, combien, pourquoi, avec quoi. Et ce qu&apos;il n&apos;a pas pensé à dire au comptoir.</p>
          <p className="mt-3 text-[15px] leading-6 font-medium text-text-primary">PharmaBoost lui remet son plan, et son téléphone lui rappelle. Au comptoir, les questions à poser sont rappelées au pharmacien.</p>
        </div>
      </section>

      <ul className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { icon: QrCode, t: "Le plan de prise", d: "Par QR code, e-mail ou papier. Aux couleurs de l'officine." },
          { icon: Bell, t: "Les rappels", d: "Chaque prise, dans l'agenda du téléphone. Rien à installer." },
          { icon: CalendarCheck, t: "Le dernier jour", d: "« Passez nous voir si ça ne va pas. » Sérieux, et sans effort." },
        ].map((item) => (
          <li key={item.t} className="flex items-start gap-3 rounded-2xl border border-border-subtle bg-surface-card p-4">
            <item.icon className="mt-0.5 size-5 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            <span><span className="block text-[14.5px] font-semibold text-text-primary">{item.t}</span><span className="block text-[13px] text-text-secondary">{item.d}</span></span>
          </li>
        ))}
      </ul>

      {/* ---- Résultat ----------------------------------------------- */}
      <section className="mt-20 rounded-3xl bg-brand-800 px-8 py-12 text-white md:px-14">
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="text-[28px] leading-[1.15] font-semibold tracking-[-0.02em] text-balance md:text-[34px]">La pharmacie vend plus. Le patient est mieux conseillé. Les deux à la fois.</h2>
            <ul className="mt-5 grid gap-2 text-[15px] sm:grid-cols-2">
              {["Le conseil juste, à chaque ordonnance", "Le chiffre d'affaires constaté, à l'euro près", "Un patient qui sait quoi prendre, et quand", "Une officine qui a l'air de ce qu'elle est : sérieuse"].map((item) => (
                <li key={item} className="flex items-center gap-2 text-brand-50"><Check className="size-4 shrink-0 text-accent-300" /> {item}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            <Link href="/decouvrir/demo" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-[15px] font-semibold text-brand-800 hover:bg-brand-50">Voir en 20 minutes <ArrowRight className="size-4" /></Link>
            <Link href="/decouvrir#preuve" className="inline-flex h-12 items-center justify-center rounded-xl border border-white/30 px-6 text-[15px] font-medium text-white hover:bg-white/10">Comment ça marche</Link>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Le comptoir : une file, un pharmacien, ses pensées. */
function Counter({ bubbles, tone, footer }: { bubbles: string[]; tone: "before" | "after"; footer: string }) {
  const after = tone === "after";
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-end gap-1.5" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={cn("flex size-8 items-center justify-center rounded-full", i === 0 ? "bg-brand-100 text-brand-800" : "bg-surface-sunken text-text-tertiary")}><Users className="size-4" /></span>
          ))}
          <span className="ml-1 text-[11px] text-text-tertiary">la file</span>
        </div>
        <div className="flex items-center gap-2" aria-hidden="true">
          <span className="text-[11px] text-text-tertiary">le pharmacien</span>
          <span className={cn("flex size-10 items-center justify-center rounded-full", after ? "bg-brand-600 text-white" : "bg-ink-200 text-ink-700")}><Pill className="size-5" /></span>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {bubbles.map((text, i) => (
          <li key={text} className={cn("ml-auto flex w-[92%] items-center gap-2 rounded-2xl rounded-tr-sm px-4 py-2.5 text-[13.5px] sm:w-[80%]", after ? "bg-brand-50 text-brand-900 dark:bg-brand-950/40 dark:text-brand-100" : "bg-surface-sunken text-text-secondary italic")} style={{ animationDelay: `${i * 120}ms` }}>
            {after ? <Check className="size-4 shrink-0 text-success-600" /> : <HelpCircle className="size-4 shrink-0 text-warning-600" />}
            {text}
          </li>
        ))}
      </ul>
      <p className={cn("mt-4 text-[13px] leading-5", after ? "font-medium text-text-primary" : "text-text-secondary")}>{footer}</p>
    </div>
  );
}

/** La maison : le sac de boîtes, ou le téléphone avec le plan. */
function HomeScene({ items, tone, footer }: { items: string[]; tone: "before" | "after"; footer: string }) {
  const after = tone === "after";
  return (
    <div>
      <div className="flex items-center gap-2 text-[11px] text-text-tertiary" aria-hidden="true"><Home className="size-4" /> à la maison, le soir</div>
      <div className={cn("mt-3 rounded-2xl p-4", after ? "border border-brand-200 bg-white dark:border-brand-800 dark:bg-ink-900" : "bg-surface-sunken")}>
        {after && <p className="text-[11px] font-semibold tracking-[0.08em] text-brand-700 uppercase dark:text-brand-400">Votre plan · Pharmacie du Centre</p>}
        <ul className={cn("space-y-2", after && "mt-2")}>
          {items.map((text) => (
            <li key={text} className={cn("flex items-center gap-2 rounded-xl px-3 py-2 text-[13.5px]", after ? "bg-brand-50 text-text-primary dark:bg-brand-950/40" : "bg-white text-text-secondary italic dark:bg-ink-800")}>
              {after ? <Check className="size-4 shrink-0 text-success-600" /> : <HelpCircle className="size-4 shrink-0 text-warning-600" />}
              {text}
            </li>
          ))}
        </ul>
        {after && (
          <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
            <span className="rounded-full bg-brand-600 px-2.5 py-1 font-medium text-white">Rappels dans mon agenda</span>
            <span className="rounded-full border border-border-subtle px-2.5 py-1 text-text-secondary">7 oct. : fin du traitement, comment allez-vous ?</span>
          </div>
        )}
      </div>
      <p className={cn("mt-4 text-[13px] leading-5", after ? "font-medium text-text-primary" : "text-text-secondary")}>{footer}</p>
    </div>
  );
}
