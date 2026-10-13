import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Thermometer, TriangleAlert } from "lucide-react";
import { fr, KeyCell, Kicker, SectionHead } from "./_components/site-shell";
import { HERO_ITEMS, HeroVisual, QuestionVisual, RequestVisual, StockMarginVisual, TeamVisual, ExampleTag } from "./_components/visuals";
import { BannerPillsInline } from "./_components/banner-mock";
import { VideoButton } from "./_components/video-dialog";
import { CounterIslandScene } from "@/components/island/counter-island-scene";
import { VIGILANCE_RULES } from "@/core/ai/engines/vigilance";
import { loadLiveProof } from "@/server/services/site-leads";
import { loadPublicPricing } from "@/server/services/public-pricing";
import { formatEuros } from "@/core/billing/subscription";
import { PricingSection } from "./_components/pricing-section";
import { EXAMPLES, FAQ, SAFETY, STOCK_POINTS, TEAM_POINTS } from "./_components/site-content";
import { cn } from "@/lib/utils";
import { HelixBackdrop } from "@/components/app/helix/helix-backdrop";

/**
 * Le site public. Peu de texte : des mots-clés, les vrais écrans, de l’air.
 * Tout ce qui est affirmé ici existe dans l'application ; les montants des
 * visuels sont ceux du catalogue de démonstration et sont marqués « exemple ».
 * Les ventes au comptoir sont DÉCLARÉES (Vendu / Non vendu) : jamais présentées
 * comme lues dans le logiciel de gestion.
 */

/**
 * Une ligne « libellé · valeur » des sections Stock et Équipe. Sous 360 px, la colonne de la valeur ne gardait que 110 px
 * (deux mots par ligne) : le libellé passe au-dessus. À 360 px et au-delà, rien ne change.
 */
const POINT_ROW = "grid grid-cols-[8.5rem_1fr] items-baseline gap-4 py-4 max-[359px]:grid-cols-1 max-[359px]:gap-1.5";

/**
 * L'adresse de référence de l'accueil. Posée ici et non dans le layout : le layout la transmettrait à chaque page du site,
 * qui se déclarerait alors copie de l'accueil. Titre, description et image de partage viennent du layout.
 */
export const metadata: Metadata = { alternates: { canonical: "/decouvrir" } };

export default async function SitePage() {
  const [pricing, live] = await Promise.all([loadPublicPricing(), loadLiveProof()]);

  return (
    <>
      {/* ---- Accueil ------------------------------------------------- */}
      {/* L'encre ADN de Dantora en fond du héros, comme sur la page de connexion : l'hélice à droite, son nuage qui déborde
          derrière le texte et les visuels, déformée par la souris. La section remonte sous l'en-tête translucide (-mt-16)
          pour que le fond commence en haut de la fenêtre ; `isolate` garde la couche (z-index négatif) dans la section.
          Le fond menthe est celui de la scène : rien ne bouge quand elle apparaît, après la première peinture. `lazy` :
          libérée à plus d'un écran de distance, elle ne coexiste jamais avec celle du bas de page. Sur téléphone, une
          image fixe allégée. */}
      <section id="accueil" className="relative isolate -mt-16 overflow-hidden bg-mint-50 pt-16 lg:flex lg:min-h-[min(100dvh,1000px)] lg:flex-col lg:justify-center dark:bg-transparent">
        <HelixBackdrop framing="hero" position="contained" lazy lightWhenStill className="max-lg:opacity-70" />
        {/* Le bas du héros se fond dans la page (pas de coupure nette de l'encre sur la section suivante). */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-32 bg-gradient-to-b from-transparent to-surface-app dark:hidden" aria-hidden="true" />
        <div className="mx-auto grid w-full grid-cols-1 max-w-6xl items-center gap-14 px-5 pt-14 pb-16 md:pt-24 md:pb-24 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/60 px-3 py-1.5 text-[13px] font-medium text-text-secondary backdrop-blur-md dark:border-border-subtle dark:bg-surface-card">
              <span className="size-1.5 rounded-full bg-brand-500" /> À côté de votre logiciel de gestion
            </p>
            {/* Le robot vit désormais à côté du nom « PharmaBoost », dans l'en-tête : le titre se lit seul. */}
            <h1 className="mt-5 pb-1 text-[50px] leading-[0.98] font-bold tracking-[-0.04em] text-text-primary min-[390px]:text-[54px] md:text-[80px] lg:mt-4">
              Scan.
              <br />
              Conseil.
              <br />
              <span className="bg-gradient-to-r from-brand-600 to-[#0796b4] bg-clip-text text-transparent">Bilan.</span>
            </h1>
            <p className="mt-7 max-w-xl text-[17px] leading-7 text-text-secondary">
              Au comptoir, vous scannez les boîtes comme d&apos;habitude. La bannière PharmaBoost vous montre, dans la foulée du scan, ce qu&apos;il est utile de conseiller en plus, pris dans votre rayon. Et le patient repart avec ses conseils.
            </p>
            {/* « Réserver une démo » est déjà en haut de page : ici, la présentation seule, en vert, comme bouton principal. */}
            <div className="mt-9">
              <VideoButton tone="brand" />
            </div>
          </div>
          <HeroVisual glass />
        </div>
      </section>

      {/* ---- La bannière du comptoir, vivante -------------------------- */}
      <section id="banniere" className="scroll-mt-20 border-t border-border-subtle">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <SectionHead kicker="Au comptoir" title="Une petite île, à côté de votre logiciel.">
            Notre robot y vit : il attend votre prochain scan, coche son analyse, montre les conseils pris dans votre rayon, rappelle les mises en garde — comme les minéraux à prendre à distance d&apos;une cycline — et reste là jusqu&apos;à la fin de la vente. Elle ne prend jamais la main sur votre logiciel de gestion.
          </SectionHead>
          {/* Réduite d'un cinquième à partir de la tablette (`zoom` : tout rétrécit ensemble, rien n'est coupé), centrée. */}
          <div className="mx-auto mt-10 max-w-[1100px] md:[zoom:0.78]">
            <CounterIslandScene framed items={HERO_ITEMS} drug={HERO_DRUG} alert={heroAlert()} />
          </div>
          {/* Pas « fidèle » : l'île n'a pas encore été vue dessinée sur un poste Windows. */}
          <p className="mt-4 text-center text-[13px] text-text-tertiary">Animation de la bannière PharmaBoost, reproduite pour le site. Touchez Vendu, Non vendu ou Vente terminée pour l&apos;essayer. Médicaments, produits et prix : exemples.</p>
        </div>
      </section>

      {/* ---- La bonne question --------------------------------------- */}
      <section id="questions" className="scroll-mt-20 border-y border-border-subtle bg-surface-card">
        <div className="mx-auto grid grid-cols-1 max-w-6xl gap-12 px-5 py-20 md:py-28 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16">
          <div>
            <SectionHead kicker="Une question, puis le conseil" title="Le bon conseil commence par la bonne question.">
              Un paracétamol ne dit pas pourquoi le patient le prend. PharmaBoost vous fait poser la question : fièvre, mal de tête, douleur ? Où a-t-il mal ? Le produit vient ensuite : la poche chaud/froid pour le dos, pas un produit au hasard.
            </SectionHead>
            <ul className="mt-8 flex flex-wrap gap-2">
              {["Pourquoi ?", "Où ?", "Puis le produit"].map((t) => (
                <li key={t} className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-app px-4 py-2 text-[14px] font-medium text-text-primary">
                  <Check className="size-4 text-brand-600" /> {t}
                </li>
              ))}
            </ul>
            <p className="mt-6 flex items-center gap-2.5 text-[15px] text-text-secondary">
              <Thermometer className="size-4 shrink-0 text-brand-600" aria-hidden="true" /> Fièvre ? Un thermomètre, s&apos;il n&apos;en a pas à la maison.
            </p>
          </div>
          <div>
            <QuestionVisual />
            <p className="mt-3 text-center text-[12.5px] text-text-tertiary">
              La bannière, telle qu&apos;elle pose la question · <ExampleTag className="text-[10.5px]" />
            </p>
          </div>
        </div>
      </section>

      {/* ---- Le conseil qui va avec le traitement --------------------- */}
      <section>
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHead kicker="Exemples" title="Le conseil qui va avec le traitement.">
              Le médecin prescrit. PharmaBoost vous rappelle ce qui accompagne le traitement, et ce qu&apos;il ne faut pas y ajouter.
            </SectionHead>
            <Link href="/decouvrir/pourquoi" className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-brand-700 hover:text-brand-800">
              Pourquoi PharmaBoost <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="mt-10 overflow-hidden rounded-3xl border border-border-subtle bg-surface-card">
            <div className="hidden grid-cols-[0.85fr_1.15fr_1.2fr] gap-6 border-b border-border-subtle px-6 py-3 md:grid">
              {["Au scan", "PharmaBoost vous montre", "Pourquoi"].map((h) => (
                <span key={h} className="font-mono text-[11px] tracking-[0.14em] text-text-tertiary uppercase">{h}</span>
              ))}
            </div>
            <ul className="divide-y divide-border-subtle">
              {EXAMPLES.map((e) => (
                <li key={e.scan} className="grid gap-1.5 px-6 py-5 md:grid-cols-[0.85fr_1.15fr_1.2fr] md:items-baseline md:gap-6">
                  <p className="font-mono text-[13px] tracking-[0.02em] text-text-secondary">
                    {e.scan}
                    {e.context && <span className="mt-0.5 block font-sans text-[13.5px] tracking-normal text-text-tertiary">{fr(e.context)}</span>}
                  </p>
                  <div>
                    <p className={cn("flex items-baseline gap-2 text-[16px] leading-snug font-semibold", e.warning ? "text-warning-800" : "text-text-primary")}>
                      {e.warning ? <TriangleAlert className="size-4 shrink-0 translate-y-0.5 text-warning-600" aria-hidden="true" /> : <span className="text-brand-600" aria-hidden="true">+</span>}
                      {e.warning && <span className="sr-only">Mise en garde :</span>}
                      <span>{fr(e.shows)}</span>
                    </p>
                    {e.note && <p className="mt-0.5 pl-5 text-[13.5px] text-text-tertiary">{fr(e.note)}</p>}
                  </div>
                  <p className="text-[14.5px] leading-6 text-text-secondary">{fr(e.why)}</p>
                </li>
              ))}
            </ul>
            <p className="border-t border-border-subtle px-6 py-3.5 text-[13px] text-text-tertiary">Au comptoir, vous notez Vendu ou Non vendu. Le conseil reste votre décision.</p>
          </div>
        </div>
      </section>

      {/* ---- Stock et marge ----------------------------------------- */}
      <section id="stock-marge" className="scroll-mt-20">
        <div className="mx-auto grid grid-cols-1 max-w-6xl gap-12 px-5 py-20 md:py-28 lg:grid-cols-[1.05fr_0.95fr]">
          {/* Le texte est bien plus haut que le visuel : centré, le visuel flottait au milieu d'un grand vide. Il accompagne
              désormais la lecture (collant) ; sur téléphone, il vient après le titre de la section, comme partout ailleurs. */}
          <div className="order-last lg:order-none">
            <div className="lg:sticky lg:top-28">
              <StockMarginVisual />
              {/* Ce que la bannière montre du même produit, au comptoir : les pastilles, dans leur ordre. */}
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border-subtle bg-surface-card px-5 py-3.5">
                <span className="text-[13px] text-text-secondary">Au comptoir, sur la bannière :</span>
                <BannerPillsInline item={{ challenge: true, shortDate: "30/11/26", stock: "IN_STOCK", quantity: 29 }} />
              </div>
            </div>
          </div>
          <div>
            <SectionHead kicker="Stock et marge" title="Votre rayon. Votre marge. Sous les yeux." />
            <dl className="mt-8 divide-y divide-border-subtle border-y border-border-subtle">
              {STOCK_POINTS.map((p) => (
                <div key={p.label} className={POINT_ROW}>
                  <dt className="font-mono text-[11.5px] tracking-[0.14em] text-text-tertiary uppercase">{p.label}</dt>
                  <dd>
                    <span className="block text-[16px] font-semibold text-text-primary">{fr(p.value)}</span>
                    {p.hint && <span className="mt-1.5 block text-[14px] leading-6 font-normal text-text-secondary">{fr(p.hint)}</span>}
                  </dd>
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
            <VideoButton film="avantages" label="Voir les avantages" className="mt-8" />
          </div>
        </div>
      </section>

      {/* ---- Votre équipe ------------------------------------------- */}
      <section id="equipe" className="scroll-mt-20 border-y border-border-subtle bg-surface-card">
        <div className="mx-auto grid grid-cols-1 max-w-6xl gap-12 px-5 py-20 md:py-28 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <SectionHead kicker="Votre équipe" title="Un comptoir, une personne. Les résultats de chacun." />
            <dl className="mt-8 divide-y divide-border-subtle border-y border-border-subtle">
              {TEAM_POINTS.map((p) => (
                <div key={p.label} className={POINT_ROW}>
                  <dt className="font-mono text-[11.5px] tracking-[0.14em] text-text-tertiary uppercase">{p.label}</dt>
                  <dd className="text-[16px] font-semibold text-text-primary">{fr(p.value)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-[13.5px] leading-6 text-text-tertiary">Au comptoir, les ventes sont déclarées : Vendu ou Non vendu, en un clic sur la bannière.</p>
          </div>
          <TeamVisual />
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
          <VideoButton film="sansOrdonnance" label="Voir en vidéo" className="mt-8" />
        </div>
        <RequestVisual />
      </section>

      {/* ---- Sécurité ------------------------------------------------- */}
      <section id="securite" className="scroll-mt-20 border-y border-border-subtle bg-surface-card">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <SectionHead kicker="Sécurité" title="La sécurité avant la suggestion." />
          <dl className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-border-subtle bg-border-subtle sm:grid-cols-2 lg:grid-cols-3">
            {SAFETY.map((s) => (
              <KeyCell key={s.label} label={s.label} value={s.value} className="bg-surface-app" />
            ))}
          </dl>
        </div>
      </section>

      {/* ---- Tarif : deux formules, une source (console ou offre officielle) ---- */}
      <PricingSection pricing={pricing} />

      {/* ---- Questions ------------------------------------------------ */}
      <section id="faq" className="scroll-mt-20 border-y border-border-subtle bg-surface-card">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <SectionHead kicker="Questions" title="L'essentiel, en bref." />
          <dl className="mt-12 grid gap-x-16 gap-y-10 md:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.q}>
                <dt className="text-[17px] font-semibold text-text-primary">{fr(item.q)}</dt>
                <dd className="mt-2 text-[15px] leading-6 text-text-secondary">{fr(item.a)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---- Appel final ---------------------------------------------- */}
      {/* La seconde apparition de l'encre, sur grand écran seulement (comme le bloc Contact de Dantora) : la scène ne se
          monte qu'à moins d'un écran de la vue et se démonte en s'éloignant — elle ne coexiste jamais avec celle du héros.
          La carte, en verre dépoli, se range à gauche : l'hélice se tient à sa droite, son encre passe derrière. */}
      <section id="appel-final" className="relative isolate overflow-hidden">
        <HelixBackdrop framing="hero" position="contained" lazy desktopOnly className="max-lg:hidden" />
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 hidden h-32 bg-gradient-to-t from-transparent to-surface-app lg:block dark:hidden" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 hidden h-32 bg-gradient-to-b from-transparent to-surface-app lg:block dark:hidden" aria-hidden="true" />
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28 lg:py-36">
          <div className="relative overflow-hidden rounded-[32px] border border-border-subtle bg-surface-card px-7 py-14 text-center sm:px-14 lg:max-w-[38rem] lg:border-white/70 lg:text-left lg:bg-white/55 lg:backdrop-blur-xl dark:lg:border-border-subtle dark:lg:bg-surface-card">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_50%_0%,var(--color-brand-100),transparent_70%)] opacity-70" aria-hidden="true" />
            <div className="relative">
              <Kicker className="justify-center lg:justify-start">PharmaBoost</Kicker>
              <h2 className="mx-auto mt-4 max-w-2xl text-[34px] lg:mx-0 leading-[1.05] font-semibold tracking-[-0.03em] text-text-primary text-balance md:text-[48px]">Voyez-le sur votre comptoir.</h2>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
                <Link href="/decouvrir/demo" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 px-7 text-[15px] font-semibold text-white hover:bg-brand-700">
                  Réserver une démo <ArrowRight className="size-4" />
                </Link>
              </div>
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

const HERO_DRUG = "DOXYCYCLINE 100 mg";

/** La mise en garde jouée dans l'île : une vraie règle de vigilance du moteur (cyclines et minéraux). */
function heroAlert(): { title: string; text: string } | null {
  const rule = VIGILANCE_RULES.find((r) => r.key === "cycline-quinolone-chelation");
  return rule ? { title: rule.title, text: rule.explanationTemplate.replaceAll("{drug}", HERO_DRUG) } : null;
}
