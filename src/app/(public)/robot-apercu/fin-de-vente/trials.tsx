"use client";

import { useState, type ReactNode } from "react";
import { Check, Sparkles, Trophy } from "lucide-react";
import { MixIsland } from "@/components/island/mix-island";
import { CounterIsland } from "@/components/island/counter-island";
import { INITIAL_ISLAND } from "@/core/island/banner-flow";
import type { IslandAdvice } from "@/components/island/counter-island";
import { ISLAND_CSS } from "@/components/island/island-shell";
import { ScanCapsule, SCAN_CSS, type ScanLook, type ScanPhase } from "@/components/island/scan-capsule";
import { Robot } from "@/components/robot";
import { ESSAI_ENTRY } from "@/core/poste/island-fixtures";
import { readCounterSheet } from "../../../../../agent/src/counter-sheet";

/**
 * La vente d'EXEMPLE du poste (core/poste/island-fixtures.ts : vrais produits du stock local, photos studio), image par image.
 * Chaque image est la vraie bannière, figée ; seule la fin de vente (e-mail, Bravo) est dessinée ici, en propositions.
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
const noop = () => undefined;

/** Le haut d'un écran de comptoir, clair : la bannière se pose en haut, au centre. */
function Screen({ children, tall = false }: { children: ReactNode; tall?: boolean }) {
  return <div className={`scan-screen flex ${tall ? "min-h-[460px]" : "min-h-[150px]"} flex-col items-center gap-2 rounded-xl px-3 pt-4 pb-6`}>{children}</div>;
}

function Frame({ n, title, text, children, tall }: { n: string; title: string; text: string; children: ReactNode; tall?: boolean }) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-[#DCE7E2] bg-white p-5">
      <div>
        <p className="text-[12px] font-bold tracking-[0.12em] text-[#4D6B64] uppercase">{n}</p>
        <h3 className="text-[18px] font-bold text-[#0F2F2A]">{title}</h3>
        <p className="mt-1 text-[13.5px] leading-6 text-[#4D6B64]">{text}</p>
      </div>
      <Screen tall={tall}>{children}</Screen>
    </article>
  );
}

/** Une capsule de scan figée sur une phase, dans le verre vert de la bannière. */
function Capsule({ look, phase, done }: { look: ScanLook; phase: ScanPhase; done: number }) {
  return (
    <section className="crd-glass relative w-[340px] max-w-full overflow-hidden">
      <ScanCapsule look={look} phase={phase} done={done} drug="CURACNÉ 20 mg" count={2} />
    </section>
  );
}

/** La capsule « En attente de scan… » sur l'ADN, telle quelle (on n'y touche pas). */
function Waiting() {
  return (
    <section className="relative flex h-10 w-[252px] items-center gap-2 overflow-hidden rounded-full bg-[#07090A] pr-3.5 pl-1.5 shadow-[0_18px_40px_-14px_rgba(0,0,0,.55),0_0_0_1px_rgba(232,255,156,.18)]">
      <span aria-hidden="true" className="adn-bg absolute -inset-[20%]" />
      <span className="relative"><Robot size={28} mood="idle" label="Le robot PharmaBoost" /></span>
      <span className="relative flex-1 text-[14px] leading-[18px] font-bold whitespace-nowrap text-white [text-shadow:0_1px_6px_rgba(0,0,0,.7)]">En attente de scan…</span>
      <span className="relative size-2 rounded-full bg-[#E8FF9C] shadow-[0_0_8px_#E8FF9C]" />
    </section>
  );
}

/* ================================================================== LA FIN DE LA VENTE */

/* ---------------------------------------- La vraie fin de vente du poste (fin 3), figée */
function RealEnd({ stage }: { stage: "email" | "done" }) {
  const [chosen, setChosen] = useState("lea");
  const [email, setEmail] = useState("");
  return (
    <div data-isl="">
      <CounterIsland
        state={{ ...INITIAL_ISLAND, stage, outcomes: ["SOLD"], email }}
        items={ITEMS}
        drug="CURACNÉ 20 mg"
        alert={null}
        pills={[]}
        compactEnd
        emailCountdown={stage === "email" ? { seconds: 9, ratio: 0.75 } : null}
        served={stage === "done" ? { team: TEAM_IDS, chosen, done: false, onPick: setChosen } : null}
        onAnswer={noop}
        onEmail={setEmail}
        onSendEmail={noop}
        onAddEmail={noop}
        onFinishWithoutEmail={noop}
        onFinish={noop}
        onDismissAlert={noop}
        look={null}
      />
    </div>
  );
}

/* ---------------------------------------- « Qui a servi ce patient ? » : propositions */
const TEAM_IDS = [{ id: "lea", name: "Léa M." }, { id: "thomas", name: "Thomas D." }, { id: "elodie", name: "Élodie R." }];
const TODAY: Record<string, number> = { lea: 3, thomas: 1, elodie: 2 };
const TONES = ["#E8FF9C", "#7BE0B0", "#FFE58A"];

/** 1 · Des ronds avec les initiales, comme une équipe : le choisi a l'anneau citron. */
function ServedAvatars() {
  const [chosen, setChosen] = useState("lea");
  return (
    <section className="crd-glass relative w-[360px] max-w-full overflow-hidden px-3 py-3">
      <p className="text-[13px] font-bold text-white">Qui a servi ce patient ?</p>
      <div className="mt-2.5 flex justify-around">
        {TEAM_IDS.map((member, i) => {
          const on = chosen === member.id;
          return (
            <button key={member.id} type="button" onClick={() => setChosen(member.id)} className="flex flex-col items-center gap-1">
              <span className={`relative inline-flex size-11 items-center justify-center rounded-full text-[14px] font-extrabold text-[#04261A] transition-transform ${on ? "scale-110 ring-2 ring-[#E8FF9C] ring-offset-2 ring-offset-[#072A25]" : "opacity-70"}`} style={{ background: TONES[i] }}>
                {member.name.split(" ").map((part) => part[0]).join("")}
                {on && <span className="pop absolute -right-1 -bottom-1 inline-flex size-4 items-center justify-center rounded-full bg-white"><Check className="size-2.5 text-[#04261A]" strokeWidth={4} /></span>}
              </span>
              <span className={`text-[11.5px] font-semibold ${on ? "text-white" : "text-white/60"}`}>{member.name}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-center text-[11px] text-white/55">Vente comptée pour <b className="text-white">{TEAM_IDS.find((member) => member.id === chosen)?.name}</b></p>
    </section>
  );
}

/** 2 · Déjà choisi : zéro clic, « Pas moi ? » pour changer. */
function ServedPreset() {
  const [chosen, setChosen] = useState("lea");
  const [open, setOpen] = useState(false);
  return (
    <section className="crd-glass relative w-[360px] max-w-full overflow-hidden px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-[#E8FF9C] text-[12px] font-extrabold text-[#04261A]">{TEAM_IDS.find((member) => member.id === chosen)?.name.split(" ").map((part) => part[0]).join("")}</span>
        <p className="min-w-0 flex-1 text-[12.5px] text-white/75">Vente comptée pour <b className="text-white">{TEAM_IDS.find((member) => member.id === chosen)?.name}</b></p>
        <button type="button" onClick={() => setOpen((value) => !value)} className="text-[11.5px] font-semibold text-[#E8FF9C] underline-offset-2 hover:underline">{open ? "Fermer" : "Pas moi ?"}</button>
      </div>
      {open && (
        <div className="pop mt-2 flex flex-wrap gap-1.5">
          {TEAM_IDS.filter((member) => member.id !== chosen).map((member) => (
            <button key={member.id} type="button" onClick={() => { setChosen(member.id); setOpen(false); }} className="h-7 rounded-full border border-white/20 px-3 text-[12px] font-semibold text-white hover:border-white/40">{member.name}</button>
          ))}
        </div>
      )}
    </section>
  );
}

/** 3 · Avec le score du jour de chacun : le choisi prend +1, c'est le petit jeu de l'équipe. */
function ServedScores() {
  const [chosen, setChosen] = useState("lea");
  const ranked = [...TEAM_IDS].sort((a, b) => (TODAY[b.id] + (chosen === b.id ? 1 : 0)) - (TODAY[a.id] + (chosen === a.id ? 1 : 0)));
  return (
    <section className="crd-glass relative w-[360px] max-w-full overflow-hidden px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[13px] font-bold text-white"><Trophy className="size-4 text-[#E8FF9C]" /> Qui a servi ce patient ?</p>
      <div className="mt-2 space-y-1">
        {ranked.map((member, rank) => {
          const on = chosen === member.id;
          const score = TODAY[member.id] + (on ? 1 : 0);
          return (
            <button key={member.id} type="button" onClick={() => setChosen(member.id)} className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left transition-colors ${on ? "bg-[#E8FF9C]/15 ring-1 ring-[#E8FF9C]" : "bg-white/[0.05] hover:bg-white/[0.08]"}`}>
              <span className="w-4 text-[11px] font-bold text-white/45">{rank + 1}</span>
              <span className="flex-1 text-[12.5px] font-semibold text-white">{member.name}</span>
              <span key={`${member.id}-${score}`} className={`text-[12px] font-bold tabular-nums ${on ? "pop text-[#E8FF9C]" : "text-white/60"}`}>{score} aujourd&apos;hui</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

const SERVED: { key: string; title: string; text: string; View: () => ReactNode }[] = [
  { key: "1", title: "Les ronds de l'équipe", text: "Les initiales dans des ronds de couleur, comme une équipe : le prénom choisi grossit avec un anneau citron. Plus visuel que des pastilles de texte.", View: ServedAvatars },
  { key: "2", title: "Déjà choisi, zéro clic", text: "La personne du comptoir est déjà comptée : on ne voit qu'une ligne. « Pas moi ? » ouvre les collègues. Le plus discret.", View: ServedPreset },
  { key: "3", title: "Avec le score du jour", text: "Chaque prénom avec ses conseils vendus aujourd'hui ; le choisi prend +1 et le classement bouge. Le petit jeu de l'équipe, lié aux challenges.", View: ServedScores },
];

const PAGE_CSS = `
.scan-screen{background:linear-gradient(180deg,#E9EEF0 0%,#F5F7F8 60%),#F5F7F8;box-shadow:inset 0 1px 0 #fff,inset 0 0 0 1px #DCE3E6}
.adn-bg{background:url(/poste/adn-helice.jpg) 62% 40%/cover no-repeat;filter:invert(1) hue-rotate(180deg) brightness(1.15) contrast(1.25) saturate(1.3);mix-blend-mode:screen;opacity:.85}
.pop{animation:pop .4s cubic-bezier(.2,.9,.3,1.4) both}
@keyframes pop{from{opacity:0;transform:scale(.5)}to{opacity:1;transform:none}}
.bravo-in{animation:bravo .5s cubic-bezier(.2,.9,.3,1.2) both}
@keyframes bravo{from{opacity:0;transform:translateY(-10px) scale(.95)}to{opacity:1;transform:none}}
.countdown{animation:countdown 12s linear infinite}
@keyframes countdown{from{width:100%}to{width:0}}
.gauge{animation:gauge 1s ease-out both}
@keyframes gauge{from{width:0}}
.confetti{position:absolute;left:50%;top:50%;pointer-events:none}
.confetti i{position:absolute;width:6px;height:6px;margin:-3px;border-radius:2px;background:var(--c);opacity:0;animation:conf 1.1s cubic-bezier(.2,.8,.3,1) both}
@keyframes conf{0%{opacity:1;transform:rotate(var(--a)) translateY(0)}100%{opacity:0;transform:rotate(var(--a)) translateY(calc(var(--d) * -1)) rotate(180deg)}}
@media (prefers-reduced-motion:reduce){.pop,.bravo-in,.countdown,.gauge,.confetti i{animation:none}}
`;

export function SaleEndTrials() {
  return (
    <main className="min-h-screen bg-[#F4F8F6] px-4 py-10">
      <style>{`${ISLAND_CSS}\n${SCAN_CSS}\n${PAGE_CSS}`}</style>
      <div className="mx-auto max-w-6xl">
        <h1 className="text-[28px] font-bold tracking-[-0.02em] text-[#0F2F2A]">La vente au comptoir, du début à la fin</h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-7 text-[#4D6B64]">
          Chaque étape de la vraie bannière, figée : prenez le temps de tout regarder. Les cartes et la routine se cliquent. Vente d&apos;exemple (vrais produits du stock, photos studio).
        </p>

        <h2 className="mt-8 text-[20px] font-bold text-[#0F2F2A]">1 · Le parcours retenu, du début à la fin</h2>
        <p className="mt-1 max-w-3xl text-[14.5px] leading-7 text-[#4D6B64]">Scan A (la croix), la bannière en cartes, puis la fin 3. Chaque image est la vraie bannière du poste, figée.</p>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <Frame n="Étape 1" title="En attente de scan" text="Inchangée : la capsule sur l'ADN, dans la police des cartes.">
            <Waiting />
          </Frame>
          <Frame n="Étape 2" title="Scan : la croix s'allume" text="Le nom de la boîte et l'étape en cours ; un bras de la croix s'allume à chaque étape.">
            <Capsule look="croix" phase="analyse" done={2} />
          </Frame>
          <Frame n="Étape 3" title="C'est prêt" text="Toute la croix s'allume : le nombre de conseils.">
            <Capsule look="croix" phase="found" done={4} />
          </Frame>
          <Frame n="Étape 4" title="La bannière en cartes" text="Une carte par boîte scannée, la routine dessous (cliquez dessus pour l'ouvrir)." tall>
            <MixIsland cards enterFrom="croix" items={ITEMS} outcomes={[]} open={false} onOpen={noop} onFinish={noop} onAnswer={noop} />
          </Frame>
          <Frame n="Étape 5" title="Une carte ouverte" text="« À dire au patient », les questions : touchez « Oui, il ne suffit plus » pour voir l'autre produit proposé." tall>
            <MixIsland cards items={ITEMS} outcomes={[]} open startAt={0} onOpen={noop} onFinish={noop} onAnswer={noop} />
          </Frame>
          <Frame n="Étape 6" title="Le produit est bipé" text="Cicaplast Lèvres passé en caisse dans LGPI : la carte est cochée « Vendu »." tall>
            <MixIsland cards items={ITEMS} outcomes={["SOLD"]} open startAt={0} onOpen={noop} onFinish={noop} onAnswer={noop} />
          </Frame>
          <Frame n="Étape 7" title="Vente validée : l'e-mail du bilan" text="Après « FIN · Valider » dans LGPI : une ligne, Envoyer ou Passer. Sans réponse, la vente se termine seule à la fin du compte à rebours.">
            <RealEnd stage="email" />
          </Frame>
          <Frame n="Étape 8" title="Bravo, et qui a servi ce patient ?" text="La marge gagnée, et l'équipe en pastilles : la personne du comptoir est déjà choisie, un clic pour un collègue.">
            <RealEnd stage="done" />
          </Frame>
        </div>

        <h2 className="mt-12 text-[20px] font-bold text-[#0F2F2A]">2 · « Qui a servi ce patient ? » : propositions</h2>
        <p className="mt-1 max-w-3xl text-[14.5px] leading-7 text-[#4D6B64]">La même question, trois façons de la poser. Cliquez sur un prénom.</p>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          {SERVED.map((variant) => (
            <article key={variant.key} className="flex flex-col gap-3 rounded-2xl border border-[#DCE7E2] bg-white p-5">
              <div>
                <p className="text-[12px] font-bold tracking-[0.12em] text-[#4D6B64] uppercase">Proposition {variant.key}</p>
                <h3 className="text-[18px] font-bold text-[#0F2F2A]">{variant.title}</h3>
                <p className="mt-1 text-[13.5px] leading-6 text-[#4D6B64]">{variant.text}</p>
              </div>
              <Screen>
                <variant.View />
              </Screen>
            </article>
          ))}
        </div>
        <p className="mt-6 flex items-center gap-2 text-[13px] text-[#4D6B64]"><Sparkles className="size-4 text-[#0E7C5A]" /> Les prénoms et les chiffres du jour sont des exemples.</p>
      </div>
    </main>
  );
}
