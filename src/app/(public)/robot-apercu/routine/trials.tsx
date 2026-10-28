"use client";

import { useState } from "react";
import { MixIsland } from "@/components/island/mix-island";
import type { IslandAdvice } from "@/components/island/counter-island";
import { ISLAND_CSS } from "@/components/island/island-shell";
import { AURORE_CSS } from "@/components/island/island-aurore";
import { ROUTINE_CSS, RoutineBlink, RoutineChip, RoutineIsland, RoutineLine, RoutineMiniIsland, RoutineThumbs, type IslandRoutine } from "@/components/island/routine-island";

type Look = "A" | "B" | "C" | "D" | "E" | "F";

/**
 * Deux ventes d'exemple, jamais de vraies ventes : des produits du stock local, leurs photos studio et leurs prix. La marge
 * est calculée sur le prix d'achat local. Sans photo studio (allergie), la case reste vide.
 */
const SCENARIOS: Record<"acne" | "allergie", { advice: IslandAdvice; routine: IslandRoutine }> = {
  acne: {
    advice: {
      name: "Cicaplast Lèvres baume réparateur",
      price: "7,95 €",
      margin: "2,27 €",
      drug: "CURACNÉ 20 mg",
      reason: "L'isotrétinoïne dessèche fortement les lèvres dès les premières semaines.",
      stock: "IN_STOCK",
      quantity: 12,
      image: "/produits-studio/0000030106659.jpg",
    },
    routine: {
      title: "Routine peau sous isotrétinoïne",
      drug: "CURACNÉ 20 mg",
      steps: [
        { label: "Nettoyer", name: "Cleanance gel nettoyant 400 ml", price: "15,70 €", margin: "4,34 €", stock: "IN_STOCK", quantity: 6, image: "/produits-studio/3282770207774.jpg", benefit: "Lave sans dessécher" },
        { label: "Hydrater", name: "Effaclar H Iso-Biome 40 ml", price: "16,50 €", margin: "4,44 €", stock: "IN_STOCK", quantity: 4, image: "/produits-studio/3337875777797.jpg", benefit: "Apaise la peau asséchée par le traitement" },
        { label: "Boutons", name: "Effaclar Duo+M 40 ml", stock: "LOW_STOCK", quantity: 2, image: "/produits-studio/3337875863377.jpg", benefit: "Soin local des imperfections" },
      ],
    },
  },
  allergie: {
    advice: {
      name: "Sterimar Rhinite Allergie",
      price: "10,50 €",
      margin: "3,28 €",
      drug: "CÉTIRIZINE 10 mg",
      reason: "Sous antihistaminique, le nez de l'allergie se lave pour chasser les pollens.",
      stock: "IN_STOCK",
      quantity: 8,
    },
    routine: {
      title: "Prise en charge globale de l'allergie",
      drug: "CÉTIRIZINE 10 mg",
      steps: [
        { label: "Yeux", name: "Bloxallergi flacon 5 ml", price: "9,40 €", margin: "2,83 €", stock: "IN_STOCK", quantity: 5, benefit: "Yeux qui piquent ou qui pleurent" },
        { label: "Nez", name: "Sterimar Rhinite Allergie 20 ml", price: "10,50 €", margin: "3,28 €", stock: "IN_STOCK", quantity: 8, benefit: "Lave le nez des pollens" },
        { label: "Complément", name: "Complément allergie (à choisir)", stock: "UNKNOWN", benefit: "En cure pendant la saison" },
      ],
    },
  },
};

const LOOKS: { look: Look; title: string; text: string }[] = [
  { look: "E", title: "E · Le mot qui clignote (survol)", text: "« ROUTINE » clignote doucement juste après le nom du conseil. La souris passe dessus : la deuxième bannière s'ouvre, sans clic." },
  { look: "F", title: "F · La pastille qui clignote (survol)", text: "Même idée en pastille violette pleine, plus visible. Survol = la deuxième bannière s'ouvre ; elle se referme quand la souris en sort." },
  { look: "A", title: "A · Une pastille", text: "« Routine · 3 » parmi les repères du conseil (stock, marge). Au clic, la deuxième bannière." },
  { look: "B", title: "B · Une ligne à part", text: "Une fine ligne violette sous le conseil : les étapes et le prix total. Au clic, la deuxième bannière." },
  { look: "C", title: "C · Les photos en petit", text: "Les trois produits en éventail à droite, avec le mot « Routine ». Au clic, les étapes en petites cartes." },
  { look: "D", title: "D · Une 2e petite bannière", text: "Une petite bannière à part, toujours visible sous la première. Au clic, elle s'ouvre." },
];

const WIDTH = 400;

function Trial({ look, scenario }: { look: Look; scenario: keyof typeof SCENARIOS }) {
  const { advice, routine } = SCENARIOS[scenario];
  const [open, setOpen] = useState(false);
  const [routineOpen, setRoutineOpen] = useState(false);
  const toggle = () => setRoutineOpen((value) => !value);
  return (
    <div className="flex flex-col items-center gap-2">
      <MixIsland
        items={[advice]}
        outcomes={[]}
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        onFinish={() => {
          setOpen(false);
          setRoutineOpen(false);
        }}
        onAnswer={() => undefined}
        routineChip={look === "A" ? <RoutineChip routine={routine} open={routineOpen} onToggle={toggle} /> : undefined}
        belowHead={look === "B" ? <RoutineLine routine={routine} open={routineOpen} onToggle={toggle} /> : undefined}
        headAside={look === "C" ? <RoutineThumbs routine={routine} open={routineOpen} onToggle={toggle} /> : undefined}
        routineBeside={look === "E" || look === "F" ? <RoutineBlink open={routineOpen} badge={look === "F"} onHover={() => setRoutineOpen(true)} /> : undefined}
      />
      {look === "D" && <RoutineMiniIsland routine={routine} open={routineOpen} onToggle={toggle} width={WIDTH} />}
      {routineOpen && (
        <RoutineIsland
          routine={routine}
          width={WIDTH}
          cards={look === "C"}
          onClose={() => setRoutineOpen(false)}
          // Ouverte au survol : elle se referme quand la souris la quitte.
          onPointerLeave={look === "E" || look === "F" ? () => setRoutineOpen(false) : undefined}
        />
      )}
    </div>
  );
}

export function RoutineTrials() {
  const [scenario, setScenario] = useState<keyof typeof SCENARIOS>("acne");
  return (
    <main className="min-h-screen bg-[#DCE6E2] px-6 py-8" data-ile-style="aurore">
      <style>{`${ISLAND_CSS}\n${AURORE_CSS}\n${ROUTINE_CSS}`}</style>
      <div className="mx-auto max-w-[1760px]">
        <h1 className="text-[22px] font-bold text-[#0F2B26]">La routine sur la bannière — six essais</h1>
        <p className="mt-1 max-w-[900px] text-[14px] text-[#3F5E57]">
          Exemples, pas de vraies ventes. La bannière du conseil est la vraie. Passez la souris sur « Routine » (E, F) ou cliquez sur le repère violet (A à D) pour ouvrir la deuxième bannière, et sur le nom du conseil pour déployer la grande.
        </p>
        <div className="mt-4 inline-flex rounded-xl bg-white p-1 text-[13px] font-semibold">
          {(["acne", "allergie"] as const).map((key) => (
            <button key={key} type="button" onClick={() => setScenario(key)} className={scenario === key ? "rounded-lg bg-[#0E8A7B] px-3 py-1.5 text-white" : "rounded-lg px-3 py-1.5 text-[#3F5E57]"}>
              {key === "acne" ? "Curacné (isotrétinoïne)" : "Cétirizine (allergie)"}
            </button>
          ))}
        </div>
        <div className="mt-6 grid gap-x-6 gap-y-10 [grid-template-columns:repeat(auto-fill,minmax(420px,1fr))]">
          {LOOKS.map(({ look, title, text }) => (
            <div key={`${scenario}-${look}`} className="space-y-3">
              <div>
                <h2 className="text-[16px] font-bold text-[#0F2B26]">{title}</h2>
                <p className="text-[12.5px] text-[#3F5E57]">{text}</p>
              </div>
              <Trial look={look} scenario={scenario} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
