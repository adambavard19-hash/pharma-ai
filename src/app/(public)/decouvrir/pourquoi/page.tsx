import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, CalendarCheck, CheckCircle2, FileText, HelpCircle, Home, XCircle } from "lucide-react";
import { KeyCell, SectionHead } from "../_components/site-shell";
import { ExampleTag } from "../_components/visuals";
import { VideoButton } from "../_components/video-dialog";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pourquoi PharmaBoost",
  description: "Et si chaque délivrance révélait tout son potentiel de conseil ? Au comptoir, PharmaBoost propose le bon conseil et le bon produit pour chaque ordonnance. À la maison, le patient a son plan conseil.",
};

/**
 * Pourquoi PharmaBoost : deux problèmes, chacun montré sur la même ordonnance
 * « sans » et « avec », côte à côte, pour se comprendre d'un coup d'œil.
 * Aucun jugement sur l'équipe : le sujet est ce qu'on ne peut pas avoir en
 * tête, pas la compétence de ceux qui conseillent.
 */

const SOLAIRE = "/site/produits/creme-solaire-spf50.webp";

export default function WhyPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <div className="max-w-3xl">
        <SectionHead as="h1" kicker="Pourquoi PharmaBoost" title="Et si chaque délivrance révélait tout son potentiel de conseil ?">
          Comment ne manquer aucune opportunité de conseil au comptoir ? Votre équipe officinale peut-elle penser à tout le potentiel de conseil, à chaque délivrance ? <span className="font-semibold text-text-primary">PharmaBoost, oui.</span> Au comptoir pour l&apos;équipe, à la maison pour le patient.
        </SectionHead>
        <VideoButton film="pourquoi" label="Voir en vidéo" className="mt-8" />
      </div>

      {/* ---- 01 · Au comptoir ------------------------------------------ */}
      <section className="mt-20 md:mt-28">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-14">
          <SectionHead n="01" kicker="Au comptoir" title="Des milliers de produits. Un patient à la fois." />
          <div className="space-y-4 text-[17px] leading-7 lg:pt-10">
            <p className="text-text-secondary">
              En rayon, des milliers de références. Sur chaque ordonnance, des médicaments qui appellent un conseil ou une précaution. Avec la file qui attend, impossible de tout avoir en tête : le bon conseil passe parfois à la trappe.
            </p>
            <p className="font-medium text-text-primary">
              PharmaBoost y pense avec vous. Au moment du scan, il propose les meilleures références de votre officine pour ce patient, cette ordonnance et ces médicaments. Vous décidez.
            </p>
          </div>
        </div>

        <Compare
          context={<Context icon={<FileText className="size-4" />} label="Ordonnance du patient" value="DOXYCYCLINE 100 mg · PARACÉTAMOL 1000 mg" />}
          without={
            <>
              <p className="text-[13.5px] text-text-tertiary">Ce que le pharmacien doit se rappeler, seul :</p>
              <Questions items={["Cet antibiotique rend-il la peau sensible au soleil ?", "Une protection solaire en rayon ? Laquelle ?", "Une précaution à rappeler ?", "Trois patients attendent…"]} />
            </>
          }
          withPb={
            <>
              <p className="text-[13.5px] text-text-secondary">Au scan, l&apos;écran affiche :</p>
              <div className="mt-2 rounded-xl border border-border-subtle bg-surface-card p-3.5">
                <p className="font-mono text-[10.5px] tracking-[0.12em] text-brand-700 uppercase">Conseil associé</p>
                <div className="mt-2 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- vignette locale déjà à la bonne taille */}
                  <img src={SOLAIRE} alt="" width={60} height={60} className="shrink-0 rounded-xl bg-surface-app object-contain" />
                  <div className="min-w-0">
                    <p className="text-[15px] leading-tight font-semibold text-text-primary">Crème solaire SPF 50+</p>
                    <p className="mt-0.5 text-[13px] text-text-secondary">Protection solaire · avant chaque exposition</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 text-[12px] font-medium">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-2.5 py-1 text-success-700 ring-1 ring-success-100 ring-inset"><span className="size-1.5 rounded-full bg-success-600" /> En rayon · 18</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-brand-800 ring-1 ring-brand-200 ring-inset"><CheckCircle2 className="size-3.5" /> Précautions vérifiées</span>
                </div>
                <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-[13px] leading-5 text-brand-900">« Pendant tout le traitement, la doxycycline rend la peau plus sensible au soleil. Évitez l&apos;exposition directe : cette crème protège les zones découvertes. »</p>
              </div>
            </>
          }
          withoutResult="Le patient repart sans conseil."
          withResult="Le patient repart avec le bon conseil."
        />

        <dl className="mt-6 grid gap-px overflow-hidden rounded-3xl border border-border-subtle bg-border-subtle sm:grid-cols-3">
          <KeyCell label="Chaque patient" value="Les précautions à vérifier" className="bg-surface-card" />
          <KeyCell label="Chaque ordonnance" value="Le traitement lu en entier" className="bg-surface-card" />
          <KeyCell label="Chaque médicament" value="Le conseil qui l'accompagne" className="bg-surface-card" />
        </dl>
      </section>

      {/* ---- 02 · À la maison ------------------------------------------ */}
      <section className="mt-24 md:mt-32">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-14">
          <SectionHead n="02" kicker="À la maison" title="Plusieurs boîtes. Et beaucoup de questions." />
          <div className="space-y-4 text-[17px] leading-7 lg:pt-10">
            <p className="text-text-secondary">
              Une fois rentré, le patient ne se souvient plus de tout : quel médicament le matin, lequel le soir, pendant combien de jours, et à quoi sert chacun. Il hésite, oublie une prise ou arrête trop tôt.
            </p>
            <p className="font-medium text-text-primary">
              Avec PharmaBoost, il repart avec son plan conseil : la posologie, l&apos;indication de chaque médicament et vos conseils. Sur son téléphone via un QR code, par e-mail ou en version imprimée, avec des rappels.
            </p>
          </div>
        </div>

        <Compare
          context={<Context icon={<Home className="size-4" />} label="De retour à la maison" value="3 boîtes sur la table" />}
          without={
            <>
              <div className="flex flex-wrap gap-2">
                {["DOXYCYCLINE 100 mg", "PARACÉTAMOL 1000 mg", "Crème solaire SPF 50+"].map((box) => (
                  <span key={box} className="rounded-lg border border-border-default bg-surface-card px-2.5 py-1.5 font-mono text-[12px] text-text-primary shadow-sm">{box}</span>
                ))}
              </div>
              <p className="mt-4 text-[13.5px] text-text-tertiary">Les questions du patient, seul :</p>
              <Questions items={["C'est le matin ou le soir ?", "Pendant combien de jours ?", "Celui-là, il sert à quoi ?"]} />
            </>
          }
          withPb={
            <div className="mx-auto w-full max-w-[330px] rounded-[26px] border-[5px] border-ink-900 bg-surface-card p-3.5 shadow-sm">
              <p className="font-mono text-[10.5px] tracking-[0.12em] text-brand-700 uppercase">Plan conseil patient · votre pharmacie</p>
              <ul className="mt-2.5 divide-y divide-border-subtle">
                <Med name="DOXYCYCLINE 100 mg" why="Antibiotique : traite l'infection" when={["Matin · 1", "Soir · 1"]} until="10 jours" />
                <Med name="PARACÉTAMOL 1000 mg" why="Contre la douleur et la fièvre" when={["Si besoin"]} />
                <Med name="Crème solaire SPF 50+" why="Conseil : protège la peau du soleil pendant le traitement" when={["Avant chaque sortie"]} until="10 jours" advice />
              </ul>
              <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 py-1.5 text-[12px] font-medium text-white">
                <CalendarCheck className="size-3.5" /> 08:00 · Rappel de prise
              </div>
            </div>
          }
          withoutResult="Il hésite, oublie une prise ou arrête trop tôt."
          withResult="Il sait quoi prendre, quand, et pourquoi."
        />

        <dl className="mt-6 grid gap-px overflow-hidden rounded-3xl border border-border-subtle bg-border-subtle sm:grid-cols-2 lg:grid-cols-4">
          <KeyCell label="Posologie" value="Matin, midi, soir et durée" className="bg-surface-card" />
          <KeyCell label="Explication" value="À quoi sert chaque médicament" className="bg-surface-card" />
          <KeyCell label="Rappels" value="Dans l'agenda du téléphone" className="bg-surface-card" />
          <KeyCell label="Données" value="Aucune conservée" className="bg-surface-card" />
        </dl>
      </section>

      {/* ---- Appel ----------------------------------------------------- */}
      <section className="mt-24 rounded-[32px] border border-border-subtle bg-surface-card px-7 py-12 sm:px-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <h2 className="text-[30px] leading-[1.08] font-semibold tracking-[-0.03em] text-text-primary text-balance md:text-[40px]">L&apos;information utile, au bon moment.</h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/decouvrir/demo" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 px-7 text-[15px] font-semibold text-white hover:bg-brand-700">Réserver une démo <ArrowRight className="size-4" /></Link>
          </div>
        </div>
      </section>
    </div>
  );
}

/** La même situation, sans puis avec PharmaBoost, côte à côte, avec ce qu'il en résulte pour le patient. */
function Compare({ context, without, withPb, withoutResult, withResult }: { context: ReactNode; without: ReactNode; withPb: ReactNode; withoutResult: string; withResult: string }) {
  return (
    <div className="mt-10 rounded-[28px] border border-border-subtle bg-surface-card p-4 sm:p-6">
      {context}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Side tone="without" result={withoutResult}>{without}</Side>
        <Side tone="with" result={withResult}>{withPb}</Side>
      </div>
    </div>
  );
}

function Side({ tone, result, children }: { tone: "without" | "with"; result: string; children: ReactNode }) {
  const withPb = tone === "with";
  return (
    <div className={cn("flex flex-col rounded-2xl border p-4 sm:p-5", withPb ? "border-brand-200 bg-brand-50/50" : "border-border-subtle bg-surface-app")}>
      <span className={cn("w-fit rounded-full px-3 py-1 text-[12.5px] font-semibold text-white", withPb ? "bg-brand-600" : "bg-ink-700")}>{withPb ? "Avec PharmaBoost" : "Sans PharmaBoost"}</span>
      <div className="mt-4 flex-1">{children}</div>
      <p className={cn("mt-5 flex items-start gap-2 border-t pt-4 text-[15.5px] leading-snug font-semibold", withPb ? "border-brand-200 text-success-700" : "border-border-subtle text-danger-700")}>
        {withPb ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" /> : <XCircle className="mt-0.5 size-5 shrink-0" />}
        {result}
      </p>
    </div>
  );
}

function Context({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-app px-4 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-800" aria-hidden="true">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px] tracking-[0.12em] text-text-tertiary uppercase">{label}</p>
        <p className="truncate font-mono text-[13.5px] text-text-primary">{value}</p>
      </div>
      <ExampleTag />
    </div>
  );
}

function Questions({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {items.map((text) => (
        <li key={text} className="flex items-center gap-2.5 rounded-xl bg-surface-card px-3 py-2.5 text-[14px] text-text-secondary">
          <HelpCircle className="size-4 shrink-0 text-warning-600" /> {text}
        </li>
      ))}
    </ul>
  );
}

function Med({ name, why, when, until, advice = false }: { name: string; why: string; when: string[]; until?: string; advice?: boolean }) {
  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <p className={cn("text-[13px] font-semibold", advice ? "text-brand-800" : "font-mono text-text-primary")}>{name}</p>
      <p className="text-[12px] text-text-secondary">{why}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11.5px]">
        {when.map((w) => (
          <span key={w} className="rounded-md bg-brand-50 px-2 py-0.5 text-brand-900">{w}</span>
        ))}
        {until && <span className="text-text-tertiary">· {until}</span>}
      </div>
    </li>
  );
}
