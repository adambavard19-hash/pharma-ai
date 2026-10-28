"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, Check, Layers, ScanLine, Settings2, Sparkles } from "lucide-react";
import { MixIsland } from "@/components/island/mix-island";
import type { IslandAdvice } from "@/components/island/counter-island";
import { ISLAND_CSS } from "@/components/island/island-shell";
import { AURORE_CSS } from "@/components/island/island-aurore";
import { ROUTINE_CSS, RoutineIsland, RoutineThumbs, type IslandRoutine } from "@/components/island/routine-island";
import { HelixBackdrop } from "@/components/app/helix/helix-backdrop";
import { Robot } from "@/components/robot/robot";
import { cn } from "@/lib/utils";
import { FeatureCarousel, type FeatureSlide } from "../_components/feature-carousel";
import { FeatureTabs, type FeatureTab } from "../apercu-accueil/limova";

/**
 * L'exemple des quatre essais : une vente de Curacné, de vrais produits du stock local avec leur photo studio. C'est un
 * EXEMPLE d'écran, jamais une vraie vente (le site le dit sous chaque visuel).
 */
const ADVICE: IslandAdvice = {
  name: "Cicaplast Lèvres baume réparateur",
  price: "7,95 €",
  margin: "2,27 €",
  drug: "CURACNÉ 20 mg",
  stock: "IN_STOCK",
  quantity: 12,
  image: "/produits-studio/0000030106659.jpg",
};

const ROUTINE: IslandRoutine = {
  title: "Routine peau sous isotrétinoïne",
  drug: "CURACNÉ 20 mg",
  steps: [
    { label: "Nettoyer", name: "Cleanance gel nettoyant", price: "15,70 €", margin: "4,34 €", stock: "IN_STOCK", image: "/produits-studio/3282770207774.jpg" },
    { label: "Hydrater", name: "Effaclar H Iso-Biome", price: "16,50 €", margin: "4,44 €", stock: "IN_STOCK", image: "/produits-studio/3337875777797.jpg" },
    { label: "Boutons", name: "Effaclar Duo+M", stock: "IN_STOCK", image: "/produits-studio/3337875863377.jpg" },
    { label: "Protéger", name: "Anthelios UVMune 400", price: "17,95 €", margin: "4,44 €", stock: "IN_STOCK", image: "/produits-studio/3337875797665.jpg" },
  ],
};

/** La vraie bannière du comptoir : le conseil en haut, les photos de la routine qui clignotent, la routine ouverte dessous. */
function BannerVisual({ routineOpen = true, width = 400, interactive = false }: { routineOpen?: boolean; width?: number; interactive?: boolean }) {
  const [open, setOpen] = useState(routineOpen);
  const toggle = () => interactive && setOpen((value) => !value);
  return (
    <div data-ile-style="aurore" className="flex flex-col items-center gap-2 [&_section]:mx-auto">
      <style>{`${ISLAND_CSS}\n${AURORE_CSS}\n${ROUTINE_CSS}`}</style>
      <MixIsland
        items={[ADVICE]}
        outcomes={[]}
        open={false}
        onOpen={() => undefined}
        onFinish={() => undefined}
        onAnswer={() => undefined}
        headAside={<RoutineThumbs routine={ROUTINE} open={open} blink onToggle={toggle} onHover={() => interactive && setOpen(true)} />}
      />
      {open && <RoutineIsland routine={ROUTINE} width={width} cards onClose={() => interactive && setOpen(false)} />}
      <p className="text-[11px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">Exemple d&apos;écran</p>
    </div>
  );
}

/** Un seul produit : ce que fait un comptoir sans routine. */
function SingleVisual() {
  return (
    <div data-ile-style="aurore" className="flex flex-col items-center gap-2 [&_section]:mx-auto">
      <style>{`${ISLAND_CSS}\n${AURORE_CSS}`}</style>
      <MixIsland items={[ADVICE]} outcomes={[]} open={false} onOpen={() => undefined} onFinish={() => undefined} onAnswer={() => undefined} />
      <p className="text-[11px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">Exemple d&apos;écran</p>
    </div>
  );
}

const SLIDES: FeatureSlide[] = [
  {
    tab: "Le conseil parfait",
    name: "le conseil parfait",
    tagline: "Parmi les produits qui répondent au besoin du patient, je mets en premier celui qui arrange votre pharmacie.",
    mood: "happy",
    ask: "Curacné pour ce patient : je lui propose quoi ?",
    answers: ["Un baume pour les lèvres : l'isotrétinoïne les dessèche dès les premières semaines. Il est en stock.", "Il est en premier dans la bannière. Bipez-le s'il le prend : je le compte comme vendu."],
    points: ["En stock, avec la quantité", "Vos gammes prioritaires d'abord", "Vos dates courtes, vos challenges, votre surstock"],
  },
  {
    tab: "La routine",
    name: "la routine",
    tagline: "Plutôt qu'un seul produit, une prise en charge complète : plusieurs produits qui vont ensemble, étape par étape.",
    mood: "celebrate",
    ask: "Et pour la peau, pendant tout le traitement ?",
    answers: ["Une routine en quatre étapes : nettoyer, hydrater, traiter les boutons, protéger du soleil.", "Passez la souris sur les photos qui clignotent dans la bannière : la routine s'ouvre, avec le prix et la marge de l'ensemble."],
    points: ["Un produit de votre stock à chaque étape", "Vos gammes prioritaires, étape par étape", "Le prix et la marge de toute la routine"],
  },
  {
    tab: "Vos routines",
    name: "vos routines",
    tagline: "Composez vos propres routines par médicament et par thème, avec la gamme de votre choix à chaque étape.",
    mood: "thinking",
    ask: "Sous antihistaminique, je veux toujours proposer les yeux, le nez et un complément.",
    answers: ["C'est fait : une routine « Allergie » pour tous les antihistaminiques, avec un collyre, un spray nasal et le complément de votre choix.", "Chaque pharmacie la propose avec les produits de son stock."],
    points: ["Par médicament ou par famille", "Une gamme différente à chaque étape", "Les garde-fous du patient restent : âge, grossesse, allergies"],
  },
];

const TABS: FeatureTab[] = [
  {
    id: "conseil",
    label: "Le conseil",
    icon: <ScanLine />,
    title: "Le bon produit, au bon moment",
    text: "Au scan de la boîte, la bannière montre le produit utile à conseiller en plus, pris dans votre rayon : en stock, de vos gammes prioritaires, avec sa marge.",
    points: ["Au scan, sans rien taper", "En stock, avec la quantité", "Vendu au bip du produit"],
    visual: <SingleVisual />,
  },
  {
    id: "routine",
    label: "La routine",
    icon: <Layers />,
    title: "Une prise en charge complète",
    text: "Quand le traitement le demande, PharmaBoost propose une routine : plusieurs produits qui vont ensemble. Les photos clignotent dans la bannière ; au survol, la routine s'ouvre à côté du conseil.",
    points: ["Nettoyer, hydrater, traiter, protéger…", "Un produit de votre stock par étape", "Le prix et la marge de l'ensemble"],
    visual: <BannerVisual interactive />,
  },
  {
    id: "vos-routines",
    label: "Vos routines",
    icon: <Settings2 />,
    title: "Vos routines, vos gammes",
    text: "Créez vos routines par médicament et par thème : le lavant d'une gamme, la crème d'une autre, le soin d'une troisième. Vos gammes prioritaires passent toujours devant.",
    points: ["Par médicament ou par famille de médicaments", "Une gamme par étape", "Valable dans toutes vos pharmacies"],
    visual: <StepsListVisual />,
  },
];

/** Le visuel de « Vos routines » : les étapes d'une routine composée, chacune avec sa gamme. */
function StepsListVisual() {
  const steps = [
    ["Nettoyer", "CeraVe"],
    ["Hydrater", "Eucerin"],
    ["Traiter les boutons", "La Roche-Posay"],
    ["Protéger", "Avène"],
  ];
  return (
    <div className="rounded-3xl border border-border-subtle bg-white p-5 shadow-[0_20px_50px_-30px_rgba(15,47,42,0.5)]">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-[#E4DDFF] text-[#3B2A86]">
          <Layers className="size-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-[11px] font-bold tracking-[0.12em] text-[#6B55D6] uppercase">Thème · Acné</p>
          <p className="text-[15px] font-bold text-text-primary">Routine sous isotrétinoïne</p>
        </div>
      </div>
      <ol className="mt-4 space-y-2">
        {steps.map(([label, brand], index) => (
          <li key={label} className="flex items-center gap-3 rounded-2xl border border-border-subtle px-3 py-2.5">
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-[#6B55D6] text-[11px] font-bold text-white">{index + 1}</span>
            <span className="flex-1 text-[14px] font-semibold text-text-primary">{label}</span>
            <span className="rounded-full bg-surface-app px-3 py-1 text-[12.5px] font-semibold text-text-secondary">{brand}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-center text-[11px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">Exemple</p>
    </div>
  );
}

function Trial({ letter, title, text, children, tone = "light" }: { letter: string; title: string; text: string; children: ReactNode; tone?: "light" | "helix" }) {
  return (
    <section className={cn("relative overflow-hidden border-t border-border-subtle py-20", tone === "light" ? "bg-surface-app" : "bg-[#EFF3F1]")}>
      {tone === "helix" && (
        <div className="pointer-events-none absolute inset-0 opacity-60" aria-hidden="true">
          <HelixBackdrop position="contained" framing="app" lazy />
        </div>
      )}
      <div className="relative">
        <div className="mx-auto mb-10 max-w-3xl px-5 text-center">
          <span className="inline-flex rounded-full bg-[#FFE58A] px-3 py-1 text-[12px] font-bold text-[#4A3500]">Essai {letter}</span>
          <p className="mt-2 text-[13px] text-text-tertiary">{text}</p>
        </div>
        <h2 className="mx-auto max-w-3xl px-5 text-center text-[36px] leading-[1.05] font-bold tracking-[-0.035em] text-text-primary md:text-[48px]">{title}</h2>
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}

/** D. Pas à pas : du bip à la routine, en quatre temps. */
function Timeline() {
  const steps: { title: string; text: string; icon: ReactNode }[] = [
    { title: "Vous scannez", text: "La boîte de Curacné, comme d'habitude, dans votre logiciel.", icon: <ScanLine className="size-5" /> },
    { title: "Le conseil", text: "La bannière propose le baume pour les lèvres, en stock.", icon: <Sparkles className="size-5" /> },
    { title: "La routine", text: "Les photos clignotent : au survol, les quatre étapes s'ouvrent.", icon: <Layers className="size-5" /> },
    { title: "Le patient repart", text: "Avec sa routine complète et son bilan par e-mail.", icon: <Check className="size-5" /> },
  ];
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-4 rounded-3xl border border-border-subtle bg-white/85 p-5 backdrop-blur">
            <span className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-2xl", index === 2 ? "bg-[#6B55D6] text-white" : "bg-brand-50 text-brand-700")}>{step.icon}</span>
            <div>
              <p className="text-[12px] font-bold tracking-[0.12em] text-text-tertiary uppercase">Étape {index + 1}</p>
              <p className="text-[18px] font-bold text-text-primary">{step.title}</p>
              <p className="mt-0.5 text-[15px] leading-6 text-text-secondary">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <BannerVisual interactive />
    </div>
  );
}

export function RoutinePresentations() {
  return (
    <main className="min-h-screen bg-surface-app">
      <div className="mx-auto max-w-4xl px-5 pt-14 pb-6 text-center">
        <Robot size={64} mood="happy" />
        <h1 className="mt-4 text-[28px] font-bold text-text-primary">Le conseil et la routine — quatre présentations</h1>
        <p className="mt-2 text-[15px] text-text-secondary">Essais pour le site, façon Limova, avec la vraie bannière du comptoir. Faites défiler : A, B, C, D.</p>
      </div>

      <Trial letter="A" title="Un conseil. Et maintenant, une routine." text="Le carrousel de l'accueil, façon Limova : une carte par fonction, la conversation à gauche, « Découvrez… » à droite." tone="helix">
        <FeatureCarousel slides={SLIDES} />
      </Trial>

      <Trial letter="B" title="Tout ce que voit votre comptoir." text="Les onglets façon Limova : la vraie bannière à gauche, ce qu'elle fait à droite. Dans « La routine », passez la souris sur les photos.">
        <div className="px-5">
          <FeatureTabs tabs={TABS} />
        </div>
      </Trial>

      <Trial letter="C" title="Avant : un produit. Avec PharmaBoost : une routine." text="Avant / après, côte à côte : le même patient, un produit seul, puis la prise en charge complète." tone="helix">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 lg:grid-cols-2">
          <div className="rounded-[30px] border border-border-subtle bg-white/80 p-7 backdrop-blur">
            <p className="text-[13px] font-bold tracking-[0.12em] text-text-tertiary uppercase">Un conseil</p>
            <p className="mt-1 text-[22px] font-bold text-text-primary">Un produit, une vente</p>
            <div className="mt-6"><SingleVisual /></div>
          </div>
          <div className="rounded-[30px] border-2 border-[#6B55D6]/40 bg-white/90 p-7 shadow-[0_30px_80px_-40px_rgba(107,85,214,0.6)] backdrop-blur">
            <p className="text-[13px] font-bold tracking-[0.12em] text-[#6B55D6] uppercase">Une routine</p>
            <p className="mt-1 text-[22px] font-bold text-text-primary">Quatre produits, une prise en charge</p>
            <div className="mt-6"><BannerVisual width={380} /></div>
          </div>
        </div>
        <div className="mt-10 flex justify-center">
          <span className="inline-flex h-12 items-center gap-2 rounded-full bg-brand-600 px-7 text-[15px] font-semibold text-white">
            Essayer PharmaBoost <ArrowRight className="size-4" />
          </span>
        </div>
      </Trial>

      <Trial letter="D" title="Du bip à la routine, en quatre temps." text="Pas à pas, comme les étapes de Limova : les quatre temps à gauche, la vraie bannière à droite.">
        <Timeline />
      </Trial>
    </main>
  );
}
