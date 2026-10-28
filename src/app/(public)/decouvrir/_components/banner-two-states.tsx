"use client";

import type { ReactNode } from "react";
import { HelixBackdrop } from "@/components/app/helix/helix-backdrop";
import { MixIsland } from "@/components/island/mix-island";
import type { IslandAdvice } from "@/components/island/counter-island";
import { ISLAND_CSS } from "@/components/island/island-shell";
import { AURORE_CSS } from "@/components/island/island-aurore";
import { ROUTINE_CSS, RoutineIsland, RoutineThumbs, type IslandRoutine } from "@/components/island/routine-island";
import { examplePitch } from "./visuals";

/**
 * « PharmaBoost en trois étapes » (fondateur, 28 oct. 2026) : la bannière d'aujourd'hui, deux conseils, avec la routine, le
 * challenge et la date courte, en trois temps séparés (au scan, le conseil ouvert, la routine au survol), sur le fond clair du site. Une vente d'EXEMPLE : de vrais produits du stock local et leurs photos studio.
 */
const LIPS: IslandAdvice = {
  name: "Cicaplast Lèvres baume réparateur",
  price: "7,95 €",
  margin: "2,27 €",
  drug: "CURACNÉ 20 mg",
  challenge: true,
  stock: "IN_STOCK",
  quantity: 12,
  image: "/produits-studio/0000030106659.jpg",
  sheet: {
    ...examplePitch(
      "Cicaplast Lèvres baume réparateur",
      ["Vos lèvres sont-elles déjà sèches ou gercées ?", "Avez-vous déjà un baume à la maison ?"],
      "L'isotrétinoïne dessèche les lèvres dès les premières semaines. Ce baume les répare : à appliquer plusieurs fois par jour, pendant tout le traitement.",
      [
        { ask: 0, label: "Oui, déjà", say: "Appliquez-le dès ce soir, en couche épaisse avant de dormir." },
        { ask: 0, label: "Pas encore", say: "Commencez dès maintenant : la sécheresse arrive vite sous ce traitement." },
      ],
    ),
    reasons: ["L'isotrétinoïne dessèche fortement les lèvres dès les premières semaines."],
    description: "Appliquer sur les lèvres plusieurs fois par jour, aussi souvent que nécessaire.",
  },
};

const FLORA: IslandAdvice = {
  name: "Lactibiane Imedia",
  price: "10,80 €",
  margin: "4,42 €",
  drug: "IMODIUM 2 mg",
  shortDate: "30/11/26",
  stock: "IN_STOCK",
  quantity: 7,
  image: "/produits-studio/3401528534805.jpg",
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

const ITEMS = [LIPS, FLORA];

/** Un temps de la bannière : l'explication à gauche, la bannière à droite, sur le fond clair du site (l'hélice d'ADN, douce). */
function Moment({ n, title, text, chips, children }: { n: number; title: string; text: string; chips: { label: string; tone: string }[]; children: ReactNode }) {
  return (
    <div className="grid items-center gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-10">
      <div>
        <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-brand-600 text-[17px] font-bold text-white">{n}</span>
        <h3 className="mt-4 text-[26px] leading-tight font-bold tracking-[-0.03em] text-text-primary">{title}</h3>
        <p className="mt-2 text-[16px] leading-7 text-text-secondary">{text}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span key={chip.label} className="rounded-full px-3 py-1 text-[12.5px] font-bold" style={{ background: chip.tone, color: "#14302A" }}>
              {chip.label}
            </span>
          ))}
        </div>
      </div>
      <div className="relative overflow-hidden rounded-[28px] border border-border-subtle bg-[radial-gradient(90%_80%_at_20%_10%,#FFFFFF_0%,#EEF5F2_55%,#E2EEEA_100%)] px-4 py-8 sm:px-8">
        <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden="true">
          <HelixBackdrop position="contained" framing="app" lazy />
        </div>
        <div className="relative flex flex-col items-center gap-2 [&_section]:max-w-full">
          {children}
          <p className="mt-1 text-[11px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">Exemple d&apos;écran</p>
        </div>
      </div>
    </div>
  );
}

const noop = () => undefined;

/**
 * Trois temps, chacun à part (fondateur, 28 oct. 2026 : « quand le conseil s'ouvre, la routine ne doit pas s'ouvrir aussi,
 * c'est deux choses différentes ») : au scan, la petite bannière ; un clic, le conseil s'ouvre ; au survol des photos, la routine.
 */
export function BannerTwoStates() {
  const thumbs = (open: boolean) => <RoutineThumbs routine={ROUTINE} open={open} blink={!open} onToggle={noop} />;
  return (
    <div data-ile-style="aurore" className="space-y-14">
      <style>{`${ISLAND_CSS}\n${AURORE_CSS}\n${ROUTINE_CSS}`}</style>
      <Moment
        n={1}
        title="Au scan, la petite bannière"
        text="Vous scannez les boîtes. En haut de l'écran, une ligne par conseil, avec tout ce qui compte avant même de l'ouvrir. Les photos qui clignotent à droite : une routine est prête."
        chips={[{ label: "Stock", tone: "#7BE0B0" }, { label: "Marge", tone: "#FFE58A" }, { label: "★ Challenge", tone: "#E8FF9C" }, { label: "Date courte", tone: "#FF8A80" }, { label: "Routine", tone: "#E4DDFF" }]}
      >
        <MixIsland items={ITEMS} outcomes={[]} open={false} onOpen={noop} onFinish={noop} onAnswer={noop} headAside={thumbs(false)} />
      </Moment>
      <Moment
        n={2}
        title="Un clic : le conseil s'ouvre"
        text="Un clic sur un conseil, et sa fiche s'ouvre : pourquoi le proposer, la posologie, les deux questions à poser au patient. Les flèches passent au conseil suivant."
        chips={[{ label: "Fiche", tone: "#DDF3EC" }, { label: "Questions", tone: "#DDF3EC" }, { label: "Aide", tone: "#DDF3EC" }]}
      >
        <MixIsland items={ITEMS} outcomes={[]} open startAt={0} onOpen={noop} onFinish={noop} onAnswer={noop} headAside={thumbs(false)} />
      </Moment>
      <Moment
        n={3}
        title="Au survol des photos : la routine"
        text="La souris passe sur les photos qui clignotent : la routine s'ouvre dans une deuxième bannière, à part du conseil. Un produit de votre stock par étape, le prix et la marge de l'ensemble."
        chips={[{ label: "Nettoyer", tone: "#E4DDFF" }, { label: "Hydrater", tone: "#E4DDFF" }, { label: "Boutons", tone: "#E4DDFF" }, { label: "Protéger", tone: "#E4DDFF" }]}
      >
        <MixIsland items={ITEMS} outcomes={[]} open={false} onOpen={noop} onFinish={noop} onAnswer={noop} headAside={thumbs(true)} />
        <RoutineIsland routine={ROUTINE} width={400} cards onClose={noop} />
      </Moment>
    </div>
  );
}
