import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { HAIRLINE, KeyCell, Kicker, SectionHead } from "./_components/site-shell";
import { HeroVisual, RequestVisual, StepConseil, StepScan, StepSuivi, StockMarginVisual } from "./_components/visuals";
import { VideoButton } from "./_components/video-dialog";
import { loadLiveProof, loadPublicOffer } from "@/server/services/site-leads";
import { formatEuros } from "@/core/billing/subscription";
import { cn } from "@/lib/utils";

/**
 * Le site public. Peu de texte : des mots-clés, les vrais écrans, de l'air.
 * Tout ce qui est affirmé ici existe dans l'application ; les montants des
 * visuels sont ceux du catalogue de démonstration et sont marqués « exemple ».
 */

/** L'offre affichée quand la console n'en a pas encore publié : à régler dans Admin → Offres. */
const FALLBACK_OFFER = { name: "PharmaBoost Officine", description: "", monthlyPriceCents: 6900, trialDays: 30 };

/** Des conseils réels du moteur (probiotique et vitamines sous antibiotique, routine peau sous isotrétinoïne). */
const EXAMPLES = [
  { rx: "Antibiotique", advice: "Probiotique", why: "L'antibiotique peut déséquilibrer la flore intestinale." },
  { rx: "Antibiotique, patient fatigué", advice: "Vitamines", why: "Pour accompagner la convalescence." },
  { rx: "Traitement contre l'acné", advice: "Crème hydratante et baume à lèvres", why: "Ce traitement assèche la peau et les lèvres." },
];

const STEPS = [
  { n: "01", title: "Vous scannez l'ordonnance", line: "Comme d'habitude, dans votre logiciel de gestion.", Visual: StepScan },
  { n: "02", title: "Les conseils apparaissent", line: "Les produits qui accompagnent le traitement, pris dans votre rayon. Vous les proposez, ou non.", Visual: StepConseil },
  { n: "03", title: "Le patient repart avec son bilan", line: "La posologie, le rôle de chaque médicament et vos conseils, sur papier ou sur son téléphone.", Visual: StepSuivi },
];

const STOCK_POINTS = [
  { label: "Stock", value: "Uniquement des produits en rayon" },
  { label: "Marge", value: "Affichée avec la suggestion" },
  { label: "Laboratoires", value: "Vos préférences, à conseil égal" },
  { label: "Résultats", value: "Proposés, acceptés, par collaborateur" },
];

const SAFETY = [
  { label: "Vigilances", value: "100 règles écrites par un pharmacien" },
  { label: "Réglementation", value: "Ordonnance d'exception signalée" },
  { label: "Décision", value: "Le pharmacien valide chaque conseil" },
  { label: "Données", value: "Aucune donnée patient conservée" },
];

const FAQ: { q: string; a: string }[] = [
  { q: "Compatible avec mon logiciel ?", a: "PharmaBoost fonctionne à côté de votre logiciel de gestion, sans le modifier. Premier déploiement : LGPI ; les autres logiciels s'installent avec nous." },
  { q: "Qui décide du conseil ?", a: "Le pharmacien. Chaque suggestion est proposée, remplacée ou ignorée par un membre de l'équipe." },
  { q: "Une IA choisit-elle les produits ?", a: "Non. L'IA analyse l'ordonnance et repère les besoins. Les produits viennent de règles écrites, de la sécurité et de votre stock." },
  { q: "Quelles données sont conservées ?", a: "Aucune donnée patient. Le bilan est chiffré et remis au patient." },
  { q: "Est-ce un dispositif médical ?", a: "Non. C'est un outil d'aide au conseil : il ne diagnostique pas et ne prescrit pas." },
  { q: "Quel engagement ?", a: "Aucun. Abonnement mensuel, résiliable à tout moment." },
];

const INCLUDED = ["Tous les postes de comptoir", "Analyse d'ordonnance", "Conseil au scan", "Demande sans ordonnance", "Stock et marge", "Bilan patient et rappels", "Pilotage par collaborateur"];

export default async function SitePage() {
  const [offerRow, live] = await Promise.all([loadPublicOffer(), loadLiveProof()]);
  const offer = offerRow ?? FALLBACK_OFFER;
  const trial = offer.trialDays >= 28 ? "Premier mois offert" : offer.trialDays > 0 ? `${offer.trialDays} jours offerts` : null;

  return (
    <>
      {/* ---- Accueil ------------------------------------------------- */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--color-border-subtle)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border-subtle)_1px,transparent_1px)] [mask-image:radial-gradient(70%_70%_at_30%_30%,black,transparent_75%)] bg-[size:64px_64px] opacity-70"
          aria-hidden="true"
        />
        <div className="mx-auto grid grid-cols-1 max-w-6xl items-center gap-14 px-5 pt-14 pb-16 md:pt-24 md:pb-24 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-card px-3 py-1.5 text-[13px] font-medium text-text-secondary">
              <span className="size-1.5 rounded-full bg-brand-500" /> À côté de votre logiciel de gestion
            </p>
            <h1 className="mt-7 text-[56px] leading-[0.98] font-semibold tracking-[-0.04em] text-text-primary md:text-[80px]">
              Scan.
              <br />
              Conseil.
              <br />
              <span className="bg-gradient-to-r from-brand-600 to-[#0796b4] bg-clip-text text-transparent">Bilan.</span>
            </h1>
            <p className="mt-7 max-w-xl text-[17px] leading-7 text-text-secondary">
              Au comptoir, vous scannez les médicaments de l&apos;ordonnance. PharmaBoost vous montre aussitôt ce qu&apos;il est utile de conseiller en plus : probiotique, vitamines, crème… Et le patient repart avec le bilan de son traitement.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/decouvrir/demo" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 px-7 text-[15px] font-semibold text-white shadow-sm hover:bg-brand-700">
                Réserver une démo <ArrowRight className="size-4" />
              </Link>
              <VideoButton />
            </div>
          </div>
          <HeroVisual />
        </div>
      </section>

      {/* ---- Le conseil qui va avec l'ordonnance --------------------- */}
      <section className="border-y border-border-subtle bg-surface-card">
        <div className="mx-auto grid grid-cols-1 max-w-6xl gap-12 px-5 py-20 md:py-28 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <SectionHead kicker="Exemples" title="Le conseil qui va avec l'ordonnance.">
              Le médecin prescrit le traitement. PharmaBoost vous rappelle ce qui l&apos;accompagne, avec les produits de votre rayon.
            </SectionHead>
            <Link href="/decouvrir/pourquoi" className="mt-6 inline-flex items-center gap-1.5 text-[15px] font-semibold text-brand-700 hover:text-brand-800">
              Pourquoi PharmaBoost <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="overflow-hidden rounded-3xl border border-border-subtle bg-surface-app">
            <div className="hidden grid-cols-[1fr_1fr_1.3fr] gap-5 border-b border-border-subtle px-6 py-3 sm:grid">
              {["Sur l'ordonnance", "Vous conseillez", "Pourquoi"].map((h) => (
                <span key={h} className="font-mono text-[11px] tracking-[0.14em] text-text-tertiary uppercase">{h}</span>
              ))}
            </div>
            <ul className="divide-y divide-border-subtle">
              {EXAMPLES.map((e) => (
                <li key={e.advice} className="grid gap-1 px-6 py-5 sm:grid-cols-[1fr_1fr_1.3fr] sm:items-baseline sm:gap-5">
                  <p className="text-[15px] text-text-secondary">{e.rx}</p>
                  <p className="text-[16px] font-semibold text-text-primary"><span className="text-brand-600">+</span> {e.advice}</p>
                  <p className="text-[14.5px] leading-6 text-text-secondary">{e.why}</p>
                </li>
              ))}
            </ul>
            <p className="border-t border-border-subtle px-6 py-3.5 text-[13px] text-text-tertiary">Vous choisissez toujours : proposer, remplacer ou ignorer.</p>
          </div>
        </div>
      </section>

      {/* ---- Comment ça marche -------------------------------------- */}
      <section id="fonctionnement" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHead kicker="Comment ça marche" title="Du scan au bilan, en trois étapes." />
            <VideoButton />
          </div>
          <ol className="relative mt-14 grid gap-8 md:grid-cols-3 md:gap-5">
            <div className={cn("absolute top-[-1px] right-0 left-0 hidden h-px md:block", HAIRLINE)} aria-hidden="true" />
            {STEPS.map(({ n, title, line, Visual }) => (
              <li key={n} className="flex flex-col">
                <div className="flex aspect-[5/4] items-center justify-center overflow-hidden rounded-3xl border border-border-subtle bg-surface-card p-5 md:mt-6">
                  <Visual />
                </div>
                <span className="mt-5 font-mono text-[13px] text-brand-700">{n}</span>
                <h3 className="mt-1 text-[21px] leading-tight font-semibold tracking-[-0.02em] text-text-primary text-balance">{title}</h3>
                <p className="mt-2 text-[15px] leading-6 text-text-secondary">{line}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---- Stock et marge ----------------------------------------- */}
      <section id="stock-marge" className="scroll-mt-20 border-y border-border-subtle bg-surface-card">
        <div className="mx-auto grid grid-cols-1 max-w-6xl gap-12 px-5 py-20 md:py-28 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <StockMarginVisual />
          <div>
            <SectionHead kicker="Stock et marge" title="Votre rayon. Votre marge. Sous les yeux." />
            <dl className="mt-8 divide-y divide-border-subtle border-y border-border-subtle">
              {STOCK_POINTS.map((p) => (
                <div key={p.label} className="grid grid-cols-[8.5rem_1fr] items-baseline gap-4 py-4">
                  <dt className="font-mono text-[11.5px] tracking-[0.14em] text-text-tertiary uppercase">{p.label}</dt>
                  <dd className="text-[16px] font-semibold text-text-primary">{p.value}</dd>
                </div>
              ))}
            </dl>
            {live && (
              <div className="mt-8 grid grid-cols-3 gap-4">
                <Figure label="Officines" value={String(live.pharmacies)} />
                <Figure label="Conseils acceptés" value={live.acceptedAdvices.toLocaleString("fr-FR")} />
                <Figure label="Ventes additionnelles" value={formatEuros(live.attributedCents)} />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ---- Sans ordonnance ----------------------------------------- */}
      <section className="mx-auto grid grid-cols-1 max-w-6xl gap-12 px-5 py-20 md:py-28 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div>
          <SectionHead kicker="Sans ordonnance" title="Le client décrit. Vous conseillez." />
          <ul className="mt-8 flex flex-wrap gap-2">
            {["Besoin reconnu", "Questions à poser", "Produits en rayon", "Orientation médecin si nécessaire"].map((t) => (
              <li key={t} className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-card px-4 py-2 text-[14px] font-medium text-text-primary">
                <Check className="size-4 text-brand-600" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <RequestVisual />
      </section>

      {/* ---- Sécurité ------------------------------------------------- */}
      <section id="securite" className="scroll-mt-20 border-y border-border-subtle bg-surface-card">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <SectionHead kicker="Sécurité" title="La sécurité avant la suggestion." />
          <dl className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-border-subtle bg-border-subtle sm:grid-cols-2 lg:grid-cols-4">
            {SAFETY.map((s) => (
              <KeyCell key={s.label} label={s.label} value={s.value} className="bg-surface-app" />
            ))}
          </dl>
        </div>
      </section>

      {/* ---- Tarif ---------------------------------------------------- */}
      <section id="tarif" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 md:py-28">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <SectionHead kicker="Tarif" title="Un abonnement. Tout compris." />
            <p className="mt-6 text-[15px] text-text-secondary">
              <span className="font-semibold text-text-primary">Parrainage</span> · chaque officine parrainée réduit votre abonnement.
            </p>
          </div>
          <div className="relative rounded-[28px] border border-border-subtle bg-surface-card p-7 sm:p-9">
            <div className={cn("absolute inset-x-8 top-0 h-px", HAIRLINE)} aria-hidden="true" />
            <p className="font-mono text-[11.5px] tracking-[0.14em] text-text-tertiary uppercase">{offer.name}</p>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="text-[52px] leading-none font-semibold tracking-[-0.04em] text-text-primary tabular">{formatEuros(offer.monthlyPriceCents)}</span>
              <span className="text-[15px] text-text-secondary">HT / mois</span>
            </p>
            <p className="mt-2 text-[14px] font-medium text-brand-700">{[trial, "Sans engagement"].filter(Boolean).join(" · ")}</p>
            <ul className="mt-7 grid gap-x-6 gap-y-2.5 text-[14.5px] text-text-primary sm:grid-cols-2">
              {INCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-brand-600" /> {item}</li>
              ))}
            </ul>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/decouvrir/abonnement" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 px-7 text-[15px] font-semibold text-white hover:bg-brand-700">
                S&apos;abonner <ArrowRight className="size-4" />
              </Link>
              <Link href="/decouvrir/demo" className="inline-flex h-12 items-center justify-center rounded-full border border-border-default px-7 text-[15px] font-semibold text-text-primary hover:border-brand-400">
                Réserver une démo
              </Link>
            </div>
            <p className="mt-5 text-[13px] text-text-tertiary">Prélèvement mensuel, résiliable à tout moment.</p>
          </div>
        </div>
      </section>

      {/* ---- Questions ------------------------------------------------ */}
      <section className="border-y border-border-subtle bg-surface-card">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <SectionHead kicker="Questions" title="L'essentiel, en bref." />
          <dl className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
            {FAQ.map((item) => (
              <div key={item.q}>
                <dt className="text-[17px] font-semibold text-text-primary">{item.q}</dt>
                <dd className="mt-2 text-[15px] leading-6 text-text-secondary">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---- Appel final ---------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <div className="relative overflow-hidden rounded-[32px] border border-border-subtle bg-surface-card px-7 py-14 text-center sm:px-14">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_50%_0%,var(--color-brand-100),transparent_70%)] opacity-70" aria-hidden="true" />
          <div className="relative">
            <Kicker className="justify-center">PharmaBoost</Kicker>
            <h2 className="mx-auto mt-4 max-w-2xl text-[34px] leading-[1.05] font-semibold tracking-[-0.03em] text-text-primary text-balance md:text-[48px]">Voyez-le sur votre comptoir.</h2>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/decouvrir/demo" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 px-7 text-[15px] font-semibold text-white hover:bg-brand-700">
                Réserver une démo <ArrowRight className="size-4" />
              </Link>
              <VideoButton />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[26px] font-semibold tracking-[-0.02em] text-text-primary tabular">{value}</p>
      <p className="mt-1 font-mono text-[11px] tracking-[0.12em] text-text-tertiary uppercase">{label}</p>
    </div>
  );
}
