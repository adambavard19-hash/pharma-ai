import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { fr, KeyCell, Kicker, SectionHead } from "./_components/site-shell";
import { HERO_ITEMS, HeroVisual, RequestVisual, TeamVisual, ExampleTag, CureReminderVisual } from "./_components/visuals";
import { VideoButton } from "./_components/video-dialog";
import { AutoVideo } from "./_components/auto-video";
import { CounterIslandScene } from "@/components/island/counter-island-scene";
import { VIGILANCE_RULES } from "@/core/ai/engines/vigilance";
import { loadLiveProof } from "@/server/services/site-leads";
import { loadPublicPricing } from "@/server/services/public-pricing";
import { formatEuros } from "@/core/billing/subscription";
import { PricingSection } from "./_components/pricing-section";
import { BannerPillsInline } from "./_components/banner-mock";
import { ChoiceVisual, FlowSteps, LoadVisual, Reveal } from "./_components/story";
import { FAQ, SAFETY, STOCK_POINTS } from "./_components/site-content";
import { HelixBackdrop } from "@/components/app/helix/helix-backdrop";

/**
 * Le site public. Peu de texte : des mots-clés, les vrais écrans, de l’air.
 * Tout ce qui est affirmé ici existe dans l'application ; les montants des
 * visuels sont ceux du catalogue de démonstration et sont marqués « exemple ».
 * Les ventes au comptoir sont DÉCLARÉES (Vendu / Non vendu) : jamais présentées
 * comme lues dans le logiciel de gestion.
 */

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
      <section id="accueil" className="relative -mt-16 overflow-hidden pt-16 lg:flex lg:min-h-[min(100dvh,1000px)] lg:flex-col lg:justify-center dark:bg-transparent">
        {/* Une seule encre pour tout le site (consigne du fondateur, 13 oct. 2026) : fixe sous la page, elle reste derrière chaque section jusqu'au bas ; globals.css rend les sections translucides. */}
        <HelixBackdrop framing="hero" lightWhenStill className="max-lg:opacity-70" />
        {/* Le bas du héros se fond dans la page (pas de coupure nette de l'encre sur la section suivante). */}
        <div className="mx-auto grid w-full grid-cols-1 max-w-6xl items-center gap-14 px-5 pt-14 pb-16 md:pt-24 md:pb-24 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/60 px-3 py-1.5 text-[13px] font-medium text-text-secondary backdrop-blur-md dark:border-border-subtle dark:bg-surface-card">
              <span className="size-1.5 rounded-full bg-brand-500" /> À côté de votre logiciel de gestion
            </p>
            {/* Le fondateur, 17 oct. 2026 : « le premier logiciel à créer un suivi pharmaceutique — ce n'est pas assez visible ». */}
            <a href="#suivi" className="mt-3 flex w-fit items-center gap-2 rounded-full bg-gradient-to-r from-brand-700 to-[#0796b4] px-4 py-2 text-[14px] font-semibold text-white shadow-sm hover:opacity-95" data-badge-suivi="">
              <span aria-hidden="true">★</span> Le premier logiciel de suivi pharmaceutique
            </a>
            {/* Le robot vit désormais à côté du nom « PharmaBoost », dans l'en-tête : le titre se lit seul. */}
            <h1 className="mt-5 pb-1 text-[50px] leading-[0.98] font-bold tracking-[-0.04em] text-text-primary min-[390px]:text-[54px] md:text-[80px] lg:mt-4">
              Scan.
              <br />
              Conseil.
              <br />
              <span className="bg-gradient-to-r from-brand-600 to-[#0796b4] bg-clip-text text-transparent">Bilan.</span>
            </h1>
            <p className="mt-7 max-w-xl text-[18px] leading-7 text-text-secondary">
              Au comptoir, vous <span className="bg-gradient-to-r from-brand-600 to-[#0796b4] bg-clip-text font-semibold text-transparent">scannez</span> les boîtes comme d&apos;habitude. PharmaBoost vous souffle les <span className="bg-gradient-to-r from-brand-600 to-[#0796b4] bg-clip-text font-semibold text-transparent">conseils</span> parfaits, et le patient repart avec son <span className="bg-gradient-to-r from-brand-600 to-[#0796b4] bg-clip-text font-semibold text-transparent">bilan</span>.
            </p>
            {/* Plus de bouton « Voir la présentation » ici : elle se lance seule juste en dessous (fondateur, 20 oct. 2026). */}
          </div>
          <HeroVisual glass />
        </div>
        {/* La présentation se lance seule sous le héros, sans le son (fondateur, 20 oct. 2026, d'après limova.ai). */}
        <div className="px-5 pb-16 md:pb-24">
          <AutoVideo src="/video/pharmaboost-presentation.mp4" poster="/video/pharmaboost-presentation.jpg" />
        </div>
      </section>

      {/* ---- Le fil de l'accueil (fondateur, 20 oct. 2026) : le problème, ce qu'est PharmaBoost, ce que le pharmacien y gagne,
           le bilan du patient. Peu de texte, une animation par idée. ---- */}

      {/* ---- 1. Le problème ------------------------------------------ */}
      <section id="probleme" className="scroll-mt-20 border-t border-border-subtle">
        <div className="mx-auto grid grid-cols-1 max-w-6xl gap-12 px-5 py-20 md:py-28 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-16">
          <Reveal>
            <SectionHead kicker="Le constat" title="Au comptoir, on ne peut pas penser à tout.">
              Une ordonnance chargée, un patient pressé, la file qui s&apos;allonge : le pharmacien est vite débordé. Le conseil qui accompagnerait le traitement passe à la trappe. PharmaBoost est là pour l&apos;accompagner et le soulager.
            </SectionHead>
          </Reveal>
          <LoadVisual />
        </div>
      </section>

      {/* ---- 2. Qu'est-ce que PharmaBoost ? ---------------------------- */}
      <section id="banniere" className="scroll-mt-20 border-t border-border-subtle bg-surface-card">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <Reveal>
            <SectionHead kicker="Qu'est-ce que PharmaBoost ?" title="Un scan. Le bon conseil. Tout de suite." center>
              La bannière PharmaBoost vous montre, dans la foulée du scan, ce qu&apos;il est utile de conseiller en plus, pris dans votre rayon. Chaque médicament est suivi d&apos;un ou plusieurs conseils, et de vos associations.
            </SectionHead>
          </Reveal>
          <FlowSteps />
          {/* Réduite de près de moitié à partir de la tablette (`zoom` : tout rétrécit ensemble, rien n'est coupé), centrée. */}
          <div className="mx-auto mt-12 max-w-[1100px] md:[zoom:0.6]">
            <CounterIslandScene framed items={HERO_ITEMS} drug={HERO_DRUG} alert={heroAlert()} />
          </div>
          {/* Pas « fidèle » : l'île n'a pas encore été vue dessinée sur un poste Windows. */}
          <p className="mt-4 text-center text-[13px] text-text-tertiary">Animation de la bannière PharmaBoost, reproduite pour le site. Touchez Vendu, Non vendu ou Vente terminée pour l&apos;essayer. Médicaments, produits et prix : exemples.</p>
        </div>
      </section>

      {/* ---- 3. Pour le pharmacien ------------------------------------- */}
      <section id="stock-marge" className="scroll-mt-20 border-t border-border-subtle">
        <div className="mx-auto grid grid-cols-1 max-w-6xl gap-12 px-5 py-20 md:py-28 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-16">
          <div className="order-last lg:order-none">
            <ChoiceVisual />
            {/* Ce que la bannière montre du même produit, au comptoir : les pastilles, dans leur ordre. */}
            <div className="mx-auto mt-4 flex max-w-[520px] flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border-subtle bg-surface-card px-5 py-3.5">
              <span className="text-[13px] text-text-secondary">Au comptoir, sur la bannière :</span>
              <BannerPillsInline item={{ challenge: true, shortDate: "30/11/26", stock: "IN_STOCK", quantity: 29 }} />
            </div>
          </div>
          <Reveal>
            <SectionHead kicker="Pour le pharmacien" title="Le produit conseil parfait, directement au scan.">
              Parmi les produits qui répondent au besoin du patient, PharmaBoost met en premier celui qui arrange votre pharmacie.
            </SectionHead>
            <ul className="mt-8 grid gap-2.5 sm:grid-cols-2">
              {["En stock, avec la quantité", "Vos laboratoires préférés", "Vos dates courtes", "Vos challenges en cours"].map((t) => (
                <li key={t} className="flex items-center gap-2.5 rounded-2xl border border-border-subtle bg-surface-card px-4 py-3 text-[15px] font-semibold text-text-primary">
                  <Check className="size-4 shrink-0 text-brand-600" /> {t}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-[14px] leading-6 text-text-secondary">
              {fr(STOCK_POINTS[0].value)}. {fr(STOCK_POINTS[2].value)}. {fr(STOCK_POINTS[2].hint ?? "")}
            </p>
            {live && (
              <div className="mt-8 grid grid-cols-3 gap-4">
                <Figure label="Officines" value={String(live.pharmacies)} />
                <Figure label="Conseils acceptés" value={live.acceptedAdvices.toLocaleString("fr-FR")} />
                <Figure label="Ventes additionnelles" value={formatEuros(live.attributedCents)} />
              </div>
            )}
            <VideoButton film="avantages" label="Voir les avantages" className="mt-8" />
          </Reveal>
        </div>
      </section>

      {/* ---- 4. Le suivi : le bilan du patient, une première ----------- */}
      <section id="suivi" className="scroll-mt-20 border-t border-border-subtle bg-surface-card">
        <div className="mx-auto grid grid-cols-1 max-w-6xl gap-12 px-5 py-20 md:py-28 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-16">
          <Reveal>
            <SectionHead kicker="Suivi pharmaceutique · une première" title="Pour la première fois, le patient repart avec un vrai bilan.">
              Ses médicaments, les conseils qui les accompagnent, comment les prendre : tout est dans son bilan, envoyé par e-mail au nom de votre pharmacie. Et pour une cure, il sait quand revenir : PharmaBoost lui écrit sept jours avant la fin.
            </SectionHead>
            <ul className="mt-8 flex flex-wrap gap-2">
              {["Bilan par e-mail, avec l'accord du patient", "Rappel 7 jours avant la fin de la cure", "Le patient revient à la pharmacie"].map((t) => (
                <li key={t} className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-app px-4 py-2 text-[14px] font-medium text-text-primary">
                  <Check className="size-4 text-brand-600" /> {fr(t)}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={2}>
            <CureReminderVisual />
            <p className="mt-4 text-center text-[12.5px] text-text-tertiary">
              Le bilan et le rappel, envoyés au nom de la pharmacie · <ExampleTag className="text-[10.5px]" />
            </p>
          </Reveal>
        </div>
      </section>

      {/* ---- 5. L'équipe : les résultats de chacun, pour motiver (fondateur, 20 oct. 2026) ---- */}
      <section id="equipe" className="scroll-mt-20 border-t border-border-subtle">
        <div className="mx-auto grid grid-cols-1 max-w-6xl gap-12 px-5 py-20 md:py-28 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:gap-16">
          <Reveal>
            <SectionHead kicker="Votre équipe" title="Les résultats de chacun. Toute l'équipe motivée." />
          </Reveal>
          <Reveal delay={2}>
            <TeamVisual />
          </Reveal>
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
      <section id="appel-final" className="relative overflow-hidden">
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
