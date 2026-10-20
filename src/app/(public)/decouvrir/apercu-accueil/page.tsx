import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, HeartPulse, MessageCircleQuestion, Package, ScanLine, ShieldCheck, Stethoscope, Users } from "lucide-react";
import { HelixBackdrop } from "@/components/app/helix/helix-backdrop";
import { Robot } from "@/components/robot/robot";
import { loadPublicPricing } from "@/server/services/public-pricing";
import { PricingSection } from "../_components/pricing-section";
import { CureReminderVisual, ExampleTag, HeroVisual, QuestionVisual, RequestVisual, StockMarginVisual, TeamVisual } from "../_components/visuals";
import { VideoButton } from "../_components/video-dialog";
import { EXAMPLES, FAQ, SAFETY, STOCK_POINTS, TEAM_POINTS } from "../_components/site-content";
import { fr } from "../_components/site-shell";
import { AutoVideo, FaqTabs, FeatureTabs, ScanPrompt, Steps, type FeatureTab } from "./limova";

export const metadata: Metadata = { title: "Essai d'accueil", robots: { index: false, follow: false } };

/**
 * Un essai de l'accueil inspiré de limova.ai (fondateur, 20 oct. 2026 : « la vidéo de présentation qui s'affiche direct, les
 * onglets, le texte… en gardant PharmaBoost avec son contenu ») : grand titre centré avec le robot, la boîte où s'écrit un scan,
 * la présentation qui se lance seule, les fonctions en onglets, trois étapes, les questions par thème. Tous les textes sont
 * ceux du site actuel (`site-content.ts`, page d'accueil). Développement seulement.
 */
export default async function AccueilEssaiPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const pricing = await loadPublicPricing();

  const tabs: FeatureTab[] = [
    {
      id: "comptoir",
      label: "Au comptoir",
      icon: <ScanLine />,
      title: "La bannière du comptoir",
      text: "Au comptoir, vous scannez les boîtes comme d'habitude. La bannière PharmaBoost vous montre, dans la foulée du scan, ce qu'il est utile de conseiller en plus, pris dans votre rayon. Elle ne prend jamais la main sur votre logiciel de gestion.",
      points: ["Le conseil apparaît au scan", "Pris dans votre rayon, avec la quantité en stock", "Vous notez Vendu ou Non vendu, en un clic"],
      visual: <HeroVisual glass />,
    },
    {
      id: "question",
      label: "La bonne question",
      icon: <MessageCircleQuestion />,
      title: "La bonne question, puis le conseil",
      text: "Un paracétamol ne dit pas pourquoi le patient le prend. PharmaBoost vous fait poser la question : fièvre, mal de tête, douleur ? Où a-t-il mal ? Le produit vient ensuite : la poche chaud/froid pour le dos, pas un produit au hasard.",
      points: ["Pourquoi ?", "Où ?", "Puis le produit"],
      visual: <QuestionVisual />,
    },
    {
      id: "stock",
      label: "Stock et marge",
      icon: <Package />,
      title: "Votre rayon, votre marge",
      text: fr(STOCK_POINTS[1].hint ?? ""),
      points: STOCK_POINTS.filter((p) => p.label !== "Laboratoires").map((p) => fr(p.value)),
      visual: <StockMarginVisual />,
      more: <VideoButton film="avantages" label="Voir les avantages" />,
    },
    {
      id: "suivi",
      label: "Suivi pharmaceutique",
      icon: <HeartPulse />,
      title: "Le premier logiciel de suivi pharmaceutique",
      text: "Le conseil ne s'arrête plus au comptoir. Avec son accord, le patient reçoit par e-mail le bilan de ses conseils, au nom de votre pharmacie. Pour une cure, PharmaBoost lui écrit sept jours avant la fin : il pense à revenir la renouveler chez vous.",
      points: ["Bilan par e-mail, avec l'accord du patient", "Rappel 7 jours avant la fin de la cure", "Adresse effacée après l'envoi"].map(fr),
      visual: <CureReminderVisual />,
    },
    {
      id: "sans-ordonnance",
      label: "Sans ordonnance",
      icon: <Stethoscope />,
      title: "Le client décrit, vous conseillez",
      text: "Sans ordonnance aussi : PharmaBoost reconnaît le besoin, vous donne les questions à poser et les produits de votre rayon, et vous dit quand orienter vers le médecin.",
      points: ["Besoin reconnu", "Questions à poser", "Produits en rayon", "Orientation médecin si nécessaire"],
      visual: <RequestVisual />,
      more: <VideoButton film="sansOrdonnance" label="Voir en vidéo" />,
    },
    {
      id: "equipe",
      label: "Votre équipe",
      icon: <Users />,
      title: "Un comptoir, une personne",
      text: "Chaque comptoir est attribué à un collaborateur : vous voyez les résultats de chacun, challenge par challenge.",
      points: TEAM_POINTS.slice(1, 4).map((p) => fr(p.value)),
      visual: <TeamVisual />,
    },
    {
      id: "securite",
      label: "Sécurité",
      icon: <ShieldCheck />,
      title: "La sécurité avant la suggestion",
      text: fr(SAFETY[3].value) + ".",
      points: [],
      visual: (
        <ul className="grid gap-3 sm:grid-cols-2">
          {SAFETY.map((s) => (
            <li key={s.label} className="rounded-2xl border border-border-subtle bg-white p-4">
              <p className="font-mono text-[11px] tracking-[0.14em] text-text-tertiary uppercase">{s.label}</p>
              <p className="mt-1.5 text-[14px] leading-5 font-semibold text-text-primary">{fr(s.value)}</p>
            </li>
          ))}
        </ul>
      ),
    },
  ];

  const faq = [
    { label: "Fonctionnement", items: FAQ.filter((f) => /logiciel|installe|paramétrer/i.test(f.q)) },
    { label: "Le conseil", items: FAQ.filter((f) => /décide|IA|dispositif/i.test(f.q)) },
    { label: "Données et abonnement", items: FAQ.filter((f) => /données|engagement/i.test(f.q)) },
  ].map((g) => ({ ...g, items: g.items.map((f) => ({ q: fr(f.q), a: fr(f.a) })) }));

  return (
    <>
      {/* ---- Accueil : titre centré, le robot dans la phrase, la boîte où s'écrit un scan ---- */}
      <section className="relative -mt-16 overflow-hidden pt-16">
        <HelixBackdrop framing="hero" lightWhenStill className="opacity-60" />
        <div className="mx-auto max-w-6xl px-5 pt-16 pb-10 text-center md:pt-24">
          <a href="#fonctions" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-700 to-[#0796b4] px-4 py-2 text-[14px] font-semibold text-white shadow-sm hover:opacity-95">
            <span aria-hidden="true">★</span> Le premier logiciel de suivi pharmaceutique
          </a>
          <h1 className="mx-auto mt-7 max-w-5xl text-[44px] leading-[1.02] font-bold tracking-[-0.045em] text-balance text-text-primary min-[390px]:text-[50px] md:text-[78px]">
            Le copilote{" "}
            <span className="inline-flex size-[0.95em] translate-y-[0.12em] items-center justify-center rounded-full border border-white bg-white/80 align-baseline shadow-[0_10px_30px_-12px_rgba(15,47,42,0.5)]">
              <Robot size={52} mood="happy" floating label="Le robot PharmaBoost" />
            </span>{" "}
            de votre <span className="bg-gradient-to-r from-brand-600 to-[#0796b4] bg-clip-text text-transparent">comptoir.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-[17.5px] leading-7 text-text-secondary">
            Scan. Conseil. Bilan. Vous scannez les boîtes comme d&apos;habitude : PharmaBoost montre ce qu&apos;il est utile de conseiller en plus, pris dans votre rayon. Le pharmacien décide.
          </p>
          <ScanPrompt examples={EXAMPLES.map(({ scan, shows, warning }) => ({ scan, shows: fr(shows), warning }))} />
          <p className="mt-4 text-[13px] text-text-tertiary">À côté de votre logiciel de gestion, sans le modifier · <ExampleTag className="text-[10.5px]" /></p>
          {/* ---- La présentation, qui se lance seule ---- */}
          <AutoVideo src="/video/pharmaboost-presentation.mp4" poster="/video/pharmaboost-presentation.jpg" />
        </div>
      </section>

      {/* ---- Tout ce que fait PharmaBoost, en onglets ---- */}
      <section id="fonctions" className="scroll-mt-20 py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-5 text-center">
          <p className="inline-flex rounded-full bg-brand-50 px-3.5 py-1.5 font-mono text-[12px] tracking-[0.12em] text-brand-700 uppercase">À chaque vente, au comptoir</p>
          <h2 className="mx-auto mt-5 max-w-3xl text-[38px] leading-[1.03] font-bold tracking-[-0.04em] text-balance text-text-primary md:text-[58px]">Tout ce que PharmaBoost fait pour votre comptoir</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/decouvrir/demo" className="inline-flex h-12 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-600 to-[#0796b4] px-6 text-[15px] font-semibold text-white hover:opacity-95">
              Réserver une démo <ArrowRight className="size-4" />
            </Link>
            <VideoButton label="Voir la présentation" />
          </div>
        </div>
        <div className="px-5">
          <FeatureTabs tabs={tabs} />
        </div>
      </section>

      {/* ---- Trois étapes ---- */}
      <section className="border-t border-border-subtle py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="mx-auto max-w-3xl text-center text-[36px] leading-[1.05] font-bold tracking-[-0.04em] text-balance text-text-primary md:text-[52px]">Commencez avec PharmaBoost en 3 étapes</h2>
          <Steps
            steps={[
              { title: "Mise en service avec vous", text: "Installation, paramétrage et formation de l'équipe : la mise en service est faite avec vous, facturée une seule fois." },
              { title: "Un fichier par poste", text: "Un fichier à télécharger par poste de comptoir, un double-clic. Les mises à jour arrivent ensuite automatiquement, jamais pendant une vente." },
              { title: "Scannez comme d'habitude", text: "La bannière montre le conseil pris dans votre rayon ; vous notez Vendu ou Non vendu. Le conseil reste votre décision." },
            ].map((s) => ({ title: fr(s.title), text: fr(s.text) }))}
          />
        </div>
      </section>

      <PricingSection pricing={pricing} />

      {/* ---- Questions, par thème ---- */}
      <section className="border-t border-border-subtle py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-center text-[36px] leading-[1.05] font-bold tracking-[-0.04em] text-text-primary md:text-[52px]">Les questions fréquentes</h2>
          <FaqTabs groups={faq} />
        </div>
      </section>

      {/* ---- Appel final ---- */}
      <section className="px-5 pb-24">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-[#0F2F2A] px-7 py-16 text-center">
          <h2 className="text-[36px] leading-[1.05] font-bold tracking-[-0.04em] text-white md:text-[52px]">Voyez-le sur votre comptoir.</h2>
          <Link href="/decouvrir/demo" className="mt-8 inline-flex h-12 items-center gap-1.5 rounded-full bg-[#E8FF9C] px-7 text-[15px] font-semibold text-[#0F2F2A] hover:brightness-95">
            Réserver une démo <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
