"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { BURST_PIECES, CounterIsland, type IslandAdvice } from "@/components/island/counter-island";
import { MixIsland } from "@/components/island/mix-island";
import { IslandShell, ISLAND_CSS } from "@/components/island/island-shell";
import { AURORE_CSS } from "@/components/island/island-aurore";
import { Robot } from "@/components/robot";
import { INITIAL_ISLAND, type IslandStage } from "@/core/island/banner-flow";
import { ESSAI_ENTRY } from "@/core/poste/island-fixtures";
import { readCounterSheet } from "../../../../../agent/src/counter-sheet";

/**
 * La bannière EN LIGNE (la « mix » sur l'ADN, le scan aux lignes cochées, la fin d'avant), avec la même vente d'exemple que la
 * page de la version néon, pour comparer image par image. Ce sont les vrais composants, dans leur réglage d'avant.
 */
const ITEMS: IslandAdvice[] = ESSAI_ENTRY.items.map((item) => ({
  name: item.name,
  price: item.price || undefined,
  margin: item.margin || undefined,
  drug: item.drug || undefined,
  reason: item.reason || undefined,
  challenge: Boolean(item.challenge),
  challengeLabel: item.challenge || undefined,
  shortDate: item.shortDate || undefined,
  stock: item.availability as IslandAdvice["stock"],
  quantity: item.quantity ? Number(item.quantity) : undefined,
  image: item.image || undefined,
  sheet: readCounterSheet(item.sheet) ?? undefined,
}));
const TEAM = [{ id: "lea", name: "Léa M." }, { id: "thomas", name: "Thomas D." }, { id: "elodie", name: "Élodie R." }];
const GOLD = "#F5A623";
const LIME = "#E8FF9C";
const noop = () => undefined;

function Frame({ n, title, text, children, tall }: { n: string; title: string; text: string; children: ReactNode; tall?: boolean }) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-[#DCE7E2] bg-white p-5">
      <div>
        <p className="text-[12px] font-bold tracking-[0.12em] text-[#4D6B64] uppercase">{n}</p>
        <h3 className="text-[18px] font-bold text-[#0F2F2A]">{title}</h3>
        <p className="mt-1 text-[13.5px] leading-6 text-[#4D6B64]">{text}</p>
      </div>
      <div className={`screen flex ${tall ? "min-h-[460px]" : "min-h-[150px]"} flex-col items-center gap-2 rounded-xl px-3 pt-4 pb-6`}>{children}</div>
    </article>
  );
}

/** Une étape de l'ancienne bannière (lignes cochées, carte de l'e-mail, Bravo du robot), figée. */
function Stage({ stage, stepsDone = 0, sold = false }: { stage: IslandStage; stepsDone?: number; sold?: boolean }) {
  const [email, setEmail] = useState("");
  return (
    <div data-isl="">
      <CounterIsland
        state={{ ...INITIAL_ISLAND, stage, stepsDone, outcomes: sold ? ["SOLD"] : [], email }}
        items={stage === "scan" || stage === "analyzing" ? [] : ITEMS}
        drug="CURACNÉ 20 mg"
        alert={null}
        pills={[{ key: "poste", label: "Comptoir 1", value: "Connecté", dot: LIME }]}
        onAnswer={noop}
        onEmail={setEmail}
        onSendEmail={noop}
        onAddEmail={noop}
        onFinishWithoutEmail={noop}
        onFinish={noop}
        onDismissAlert={noop}
        look={null}
        movable
      />
    </div>
  );
}

/** Le « Bonjour » du robot au démarrage du poste, tel qu'en ligne. */
function Greeting() {
  return (
    <IslandShell width={420} tone="success" contentKey="bonjour" label="Bonjour du robot PharmaBoost">
      <div className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        <span className="isl-cheer relative shrink-0">
          <Robot size={60} mood="happy" look={null} label="Le robot PharmaBoost" />
          <span className="isl-burst" aria-hidden="true">
            {BURST_PIECES.map((piece, index) => (
              <i key={index} style={{ "--a": `${piece.angle}deg`, "--d": `${piece.distance}px`, "--c": piece.color, animationDelay: `${piece.delay}ms` } as CSSProperties} />
            ))}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="isl-pop block text-[17px] leading-[22px] font-bold" style={{ color: GOLD }}>Bonjour Léa !</span>
          <span className="mt-0.5 block text-[13.5px] leading-[19px] text-white">Comment vas-tu ? Bon courage pour tes conseils ! N’hésite pas si tu as besoin de quoi que ce soit 😊</span>
        </span>
        <button type="button" className="h-9 shrink-0 self-center rounded-xl px-4 text-[13.5px] font-bold" style={{ background: "#1FBF8F", color: "#04261A" }}>
          OK
        </button>
      </div>
    </IslandShell>
  );
}

/** La capsule « ✓ Vente validée · fin dans 12 s », telle qu'en ligne. */
function Validated() {
  return (
    <IslandShell width={360} tone="success" contentKey="valide" label="Vente validée dans LGPI">
      <div className="px-3 py-1.5 text-left">
        <p className="flex items-baseline justify-between gap-2 text-[12px] leading-[16px]">
          <span className="font-bold" style={{ color: LIME }}>✓ Vente validée</span>
          <span className="text-white/60">fin dans 9 s</span>
        </p>
        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/10">
          <span className="block h-full rounded-full" style={{ width: "75%", background: LIME }} />
        </span>
      </div>
    </IslandShell>
  );
}

/** « Qui a servi ce patient ? », la capsule à part, telle qu'en ligne. */
function Served() {
  const [chosen, setChosen] = useState("lea");
  const [done, setDone] = useState(false);
  return (
    <IslandShell width={380} tone="success" contentKey={`servi-${done ? "ok" : "q"}`} label="Qui a servi ce patient ?">
      {done ? (
        <p className="flex items-center gap-2 px-4 py-3 text-[13px] font-semibold text-white">
          <span className="inline-flex size-6 items-center justify-center rounded-full text-[12px] font-extrabold" style={{ background: LIME, color: "#0F2F2A" }}>✓</span>
          Vente comptée pour {TEAM.find((member) => member.id === chosen)?.name}.
          <button type="button" onClick={() => setDone(false)} className="ml-auto text-[11px] text-white/50 underline-offset-2 hover:underline">revoir</button>
        </p>
      ) : (
        <div className="px-3 pt-2 pb-2.5 text-left">
          <p className="text-[13px] leading-[17px] font-bold text-white">Qui a servi ce patient ?</p>
          <div className="mt-1.5 grid grid-cols-3 gap-1">
            {TEAM.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => {
                  setChosen(member.id);
                  setDone(true);
                }}
                className="flex min-w-0 items-center rounded-lg border px-2 py-1 text-left"
                style={{ background: chosen === member.id ? "rgba(232,255,156,0.12)" : "rgba(255,255,255,0.05)", borderColor: chosen === member.id ? LIME : "transparent" }}
              >
                <span className="min-w-0 truncate text-[11.5px] leading-[15px] font-bold text-white">{member.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </IslandShell>
  );
}

/* La capsule au repos était en 13 px, sans gras, avant le 29 oct. : on la remet comme en ligne. */
const PAGE_CSS = `
.screen{background:linear-gradient(180deg,#E9EEF0 0%,#F5F7F8 60%),#F5F7F8;box-shadow:inset 0 1px 0 #fff,inset 0 0 0 1px #DCE3E6}
.en-ligne [data-ile-repos] span.whitespace-nowrap{font-size:13px!important;font-weight:400!important;opacity:.85}
`;

export function OnlineBanner() {
  return (
    <main className="min-h-screen bg-[#F4F8F6] px-4 py-10">
      <style>{`${ISLAND_CSS}\n${AURORE_CSS}\n${PAGE_CSS}`}</style>
      <div className="mx-auto max-w-6xl">
        <p className="inline-flex rounded-full bg-[#0F2F2A] px-3 py-1 text-[12px] font-bold tracking-[0.1em] text-white uppercase">En ligne aujourd&apos;hui</p>
        <h1 className="mt-3 text-[28px] font-bold tracking-[-0.02em] text-[#0F2F2A]">Ta bannière actuelle, image par image</h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-7 text-[#4D6B64]">
          Celle qui tourne sur pharmaboost.app, avec la même vente d&apos;exemple que la version néon, pour comparer. Les cartes se survolent et se cliquent comme au poste. À comparer avec{" "}
          <a href="/robot-apercu/fin-de-vente" className="font-semibold text-[#0E7C5A] underline underline-offset-2">la version néon</a>.
        </p>
        <div data-ile-style="aurore" className="en-ligne mt-8 grid gap-5 lg:grid-cols-2">
          <Frame n="Étape 1" title="Bonjour, puis l'attente" text="Au démarrage : « Bonjour Léa ! » avec OK. Ensuite, la capsule sur l'ADN : le robot, « En attente de scan… », le point citron.">
            <Greeting />
            <Stage stage="idle" />
          </Frame>
          <Frame n="Étape 2" title="Le scan" text="Le robot, « Scan », le petit code-barres et la barre qui file en bas.">
            <Stage stage="scan" />
          </Frame>
          <Frame n="Étape 3" title="L'analyse, puis « N conseils »" text="Les lignes qui se cochent une à une avec la barre de progression, puis le nombre de conseils dans une pastille.">
            <Stage stage="analyzing" stepsDone={2} />
            <Stage stage="ready" />
          </Frame>
          <Frame n="Étape 4" title="La bannière des conseils" text="Sur l'ADN : une ligne par boîte, le robot, les pastilles (stock, marge, challenge, date courte), les photos de la routine, « Terminer → »." tall>
            <MixIsland items={ITEMS} outcomes={[]} open={false} onOpen={noop} onFinish={noop} onAnswer={noop} />
          </Frame>
          <Frame n="Étape 5" title="Au survol : la grande carte" text="La carte blanche : photo, nom et prix, la raison, les onglets Fiche, Questions, Aide, et « Autre alternative en stock »." tall>
            <MixIsland items={ITEMS} outcomes={[]} open startAt={0} onOpen={noop} onFinish={noop} onAnswer={noop} help={{ log: [], onAsk: noop }} />
          </Frame>
          <Frame n="Étape 6" title="Le produit est bipé" text="La carte dit « Vendu », avec « Conseil suivant » et « Annuler »." tall>
            <MixIsland items={ITEMS} outcomes={["SOLD"]} open startAt={0} onOpen={noop} onFinish={noop} onAnswer={noop} help={{ log: [], onAsk: noop }} />
          </Frame>
          <Frame n="Étape 7" title="Vente validée : l'e-mail" text="« ✓ Vente validée · fin dans 12 s » et sa barre, puis la carte « Le bilan au patient ? » : le champ, « Envoyer », « Terminer sans e-mail ».">
            <Validated />
            <Stage stage="email" sold />
          </Frame>
          <Frame n="Étape 8" title="Bravo, puis « Qui a servi ? »" text="« Bravo ! » avec le robot qui saute et ses confettis, « 1 conseil vendu · 7,95 € » ; puis la capsule à part avec les prénoms en grille.">
            <Stage stage="done" sold />
            <Served />
          </Frame>
        </div>
        <p className="mt-6 text-[13px] text-[#4D6B64]">Vente et prénoms d&apos;exemple.</p>
      </div>
    </main>
  );
}
