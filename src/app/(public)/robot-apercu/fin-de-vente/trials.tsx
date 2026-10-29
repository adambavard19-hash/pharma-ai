"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Check, Mail, RotateCcw, Send, Sparkles, Star, Trophy } from "lucide-react";
import { MixIsland } from "@/components/island/mix-island";
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
const SOLD = ITEMS[0];
const TEAM = ["Léa M.", "Thomas D.", "Élodie R."];
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

/** Un petit compte à rebours qui tourne en boucle : « la vente se termine seule ». */
function Countdown({ light = false }: { light?: boolean }) {
  return (
    <span className={`block h-1 overflow-hidden rounded-full ${light ? "bg-[#0F2F2A]/10" : "bg-white/10"}`}>
      <span className="countdown block h-full rounded-full bg-[#E8FF9C]" />
    </span>
  );
}

function Photo({ src, size = 36 }: { src?: string; size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- photo studio locale, essais seulement */}
      {src && <img src={src} alt="" className="size-full object-contain p-0.5" />}
    </span>
  );
}

const CONFETTI = Array.from({ length: 14 }, (_, i) => ({ a: (360 / 14) * i, d: 38 + (i % 3) * 12, c: ["#E8FF9C", "#3DDC84", "#7BE0B0", "#FFE58A", "#FF9C8F"][i % 5], delay: (i % 4) * 40 }));

function Confetti({ run }: { run: number }) {
  return (
    <span className="confetti" aria-hidden="true">
      {CONFETTI.map((piece, i) => (
        <i key={`${run}-${i}`} style={{ "--a": `${piece.a}deg`, "--d": `${piece.d}px`, "--c": piece.c, animationDelay: `${piece.delay}ms` } as CSSProperties} />
      ))}
    </span>
  );
}

/* ---------------------------------------- Aujourd'hui (pour comparer) */
function CurrentEnd({ run }: { run: number }) {
  return (
    <>
      <section className="crd-glass relative w-[330px] max-w-full overflow-hidden px-3 py-1.5">
        <p className="flex items-baseline justify-between text-[12px]">
          <span className="font-bold text-[#E8FF9C]">✓ Vente validée</span>
          <span className="text-white/60">fin dans 12 s</span>
        </p>
        <span className="mt-1 block"><Countdown /></span>
      </section>
      <section className="crd-glass relative w-[330px] max-w-full overflow-hidden px-2.5 py-2">
        <div className="flex items-center gap-2">
          <Robot size={22} mood="happy" label="" />
          <p className="text-[12.5px] font-bold text-white">Le bilan au patient ?</p>
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <span className="flex h-8 flex-1 items-center rounded-lg border border-white/10 bg-white/[0.06] px-2.5 text-[12.5px] text-white/35">e-mail du patient</span>
          <span className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#E8FF9C] px-2.5 text-[12px] font-bold text-[#04261A]"><Send className="size-3.5" /> Envoyer</span>
        </div>
        <p className="mt-1.5 text-center text-[11.5px] font-semibold text-white/70">✓ Terminer sans e-mail</p>
      </section>
      <section key={run} className="crd-glass relative w-[330px] max-w-full overflow-hidden px-3 py-2">
        <div className="flex items-center gap-3">
          <span className="relative"><Robot size={52} mood="happy" label="" /><Confetti run={run} /></span>
          <div className="min-w-0 flex-1">
            <p className="pop text-[17px] font-bold text-[#F5A623]">Bravo !</p>
            <p className="truncate text-[12.5px] text-white/80">1 conseil vendu · 7,95 €</p>
            <p className="text-[11.5px] text-white/55">Vente terminée — résultats enregistrés</p>
          </div>
        </div>
      </section>
    </>
  );
}

/* ---------------------------------------- 1 · Récap et e-mail en une seule carte */
function EndRecap({ run }: { run: number }) {
  const [sent, setSent] = useState(false);
  return sent ? (
    <section key={run} className="crd-glass bravo-in relative w-[360px] max-w-full overflow-hidden px-4 py-3.5">
      <div className="flex items-center gap-3.5">
        <span className="relative inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-[#E8FF9C]">
          <Check className="size-8 text-[#04261A]" strokeWidth={3.5} />
          <Confetti run={run} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="pop text-[20px] leading-6 font-bold text-white">Bravo Léa !</p>
          <p className="text-[12.5px] text-white/75">1 conseil vendu · <b className="text-[#E8FF9C]">+2,27 €</b> de marge</p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#E8FF9C]"><Star className="size-3 fill-current" /> 3e conseil vendu aujourd&apos;hui</p>
        </div>
      </div>
      <p className="mt-2.5 flex items-center gap-1.5 text-[11.5px] text-white/55"><Mail className="size-3.5" /> Bilan envoyé à m***@gmail.com</p>
      <button type="button" onClick={() => setSent(false)} className="mt-2 text-[11px] font-semibold text-white/45 underline-offset-2 hover:underline">Revoir l&apos;étape d&apos;avant</button>
    </section>
  ) : (
    <section className="crd-glass relative w-[360px] max-w-full overflow-hidden p-3">
      <p className="flex items-center justify-between text-[12px]">
        <span className="font-bold text-[#E8FF9C]">✓ Vente validée dans LGPI</span>
        <span className="text-white/55">fin dans 12 s</span>
      </p>
      <div className="mt-2 flex items-center gap-2.5 rounded-xl bg-white/[0.06] p-2">
        <Photo src={SOLD.image} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold text-white">{SOLD.name}</span>
          <span className="text-[11px] text-white/55">Vendu · {SOLD.price}</span>
        </span>
        <span className="text-[12px] font-bold text-[#E8FF9C]">+{SOLD.margin}</span>
      </div>
      <p className="mt-2.5 text-[12.5px] font-bold text-white">Ses conseils par e-mail ?</p>
      <p className="text-[11px] text-white/55">Le patient reçoit les produits, comment les prendre et vos coordonnées.</p>
      <form className="mt-1.5 flex gap-1.5" onSubmit={(event) => { event.preventDefault(); setSent(true); }}>
        <input type="email" placeholder="e-mail du patient" className="h-9 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-[13px] text-white placeholder:text-white/35 focus:border-[#E8FF9C] focus:outline-none" />
        <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#E8FF9C] px-3 text-[12.5px] font-bold text-[#04261A]"><Send className="size-3.5" /> Envoyer</button>
      </form>
      <button type="button" onClick={() => setSent(true)} className="mt-1.5 w-full text-center text-[11.5px] font-semibold text-white/55 hover:text-white">Pas d&apos;e-mail</button>
      <span className="mt-2 block"><Countdown /></span>
    </section>
  );
}

/* ---------------------------------------- 2 · L'aperçu du mail que reçoit le patient */
function EndPreview({ run }: { run: number }) {
  const [sent, setSent] = useState(false);
  return sent ? (
    <section key={run} className="crd-glass bravo-in relative w-[360px] max-w-full overflow-hidden px-4 py-3.5 text-center">
      <span className="relative mx-auto inline-flex"><Robot size={64} mood="happy" label="" /><Confetti run={run} /></span>
      <p className="pop mt-1 text-[22px] font-bold text-[#E8FF9C]">Bravo !</p>
      <p className="text-[12.5px] text-white/75">Cicaplast Lèvres vendu · +2,27 €</p>
      {/* La journée : un objectif d'EXEMPLE (5 conseils par jour), la jauge avance. */}
      <div className="mx-auto mt-2.5 max-w-[260px]">
        <p className="flex justify-between text-[11px] text-white/60"><span>Aujourd&apos;hui</span><span><b className="text-white">3</b> / 5 conseils</span></p>
        <span className="mt-1 block h-2 overflow-hidden rounded-full bg-white/10"><span className="gauge block h-full rounded-full bg-gradient-to-r from-[#3DDC84] to-[#E8FF9C]" style={{ width: "60%" }} /></span>
      </div>
      <button type="button" onClick={() => setSent(false)} className="mt-2 text-[11px] font-semibold text-white/45 underline-offset-2 hover:underline">Revoir l&apos;étape d&apos;avant</button>
    </section>
  ) : (
    <section className="crd-glass relative w-[360px] max-w-full overflow-hidden p-3">
      <p className="text-[12px] font-bold text-[#E8FF9C]">✓ Vente validée · le bilan au patient ?</p>
      {/* L'aperçu du mail, en petit : ce que le patient va recevoir. */}
      <div className="mt-2 rounded-xl bg-white p-2.5 text-[#0F2F2A]">
        <p className="flex items-center gap-1.5 text-[10.5px] font-bold text-[#0E7C5A]">
          <svg viewBox="0 0 20 20" className="size-3"><path d="M7 1h6v6h6v6h-6v6H7v-6H1V7h6z" fill="#0E7C5A" /></svg>
          Pharmacie Saint-Michel · vos conseils
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <Photo src={SOLD.image} size={30} />
          <span className="min-w-0 flex-1 text-[11.5px] leading-4"><b>{SOLD.name}</b><br /><span className="text-[#4D6B64]">Plusieurs fois par jour, pendant le traitement</span></span>
        </div>
        <p className="mt-1.5 text-[10px] text-[#7C948D]">+ l&apos;adresse et le téléphone de la pharmacie</p>
      </div>
      <form className="mt-2 flex gap-1.5" onSubmit={(event) => { event.preventDefault(); setSent(true); }}>
        <input type="email" placeholder="e-mail du patient" className="h-9 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-[13px] text-white placeholder:text-white/35 focus:border-[#E8FF9C] focus:outline-none" />
        <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#E8FF9C] px-3 text-[12.5px] font-bold text-[#04261A]"><Send className="size-3.5" /> Envoyer</button>
      </form>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="flex-1"><Countdown /></span>
        <button type="button" onClick={() => setSent(true)} className="text-[11.5px] font-semibold text-white/55 hover:text-white">Pas d&apos;e-mail</button>
      </div>
    </section>
  );
}

/* ---------------------------------------- 3 · Compact, et l'équipe dans le Bravo */
function EndCompact({ run }: { run: number }) {
  const [sent, setSent] = useState(false);
  const [who, setWho] = useState(TEAM[0]);
  return sent ? (
    <section key={run} className="crd-glass bravo-in relative w-[360px] max-w-full overflow-hidden px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <span className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#E8FF9C]">
          <Trophy className="size-5 text-[#04261A]" />
          <Confetti run={run} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="pop text-[16px] font-bold text-white">Bravo ! <span className="text-[#E8FF9C]">+2,27 €</span></p>
          <p className="text-[11.5px] text-white/60">Qui a servi ce patient ?</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {TEAM.map((name) => (
          <button key={name} type="button" onClick={() => setWho(name)} className={`h-7 rounded-full px-3 text-[12px] font-semibold ${who === name ? "bg-[#E8FF9C] text-[#04261A]" : "border border-white/20 text-white"}`}>
            {who === name && <Check className="mr-1 inline size-3" strokeWidth={3} />}
            {name}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setSent(false)} className="mt-2 text-[11px] font-semibold text-white/45 underline-offset-2 hover:underline">Revoir l&apos;étape d&apos;avant</button>
    </section>
  ) : (
    <section className="crd-glass relative w-[360px] max-w-full overflow-hidden px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Mail className="size-4 text-[#E8FF9C]" />
        <p className="flex-1 text-[12.5px] font-bold text-white">Bilan par e-mail</p>
        <span className="text-[11px] text-white/50">12 s</span>
      </div>
      <form className="mt-1.5 flex gap-1.5" onSubmit={(event) => { event.preventDefault(); setSent(true); }}>
        <input type="email" placeholder="e-mail du patient" className="h-8 min-w-0 flex-1 rounded-full border border-white/10 bg-white/[0.06] px-3 text-[12.5px] text-white placeholder:text-white/35 focus:border-[#E8FF9C] focus:outline-none" />
        <button type="submit" aria-label="Envoyer" className="inline-flex size-8 items-center justify-center rounded-full bg-[#E8FF9C] text-[#04261A]"><Send className="size-3.5" /></button>
        <button type="button" onClick={() => setSent(true)} className="h-8 rounded-full px-2.5 text-[11.5px] font-semibold text-white/60 hover:text-white">Passer</button>
      </form>
      <span className="mt-2 block"><Countdown /></span>
    </section>
  );
}

const ENDS: { key: string; title: string; text: string; View: (props: { run: number }) => ReactNode }[] = [
  { key: "1", title: "Récap et e-mail en une seule carte", text: "Une seule carte après la validation dans LGPI : ce qui a été vendu (photo, prix, marge), puis l'e-mail. Le Bravo : grand rond citron, « Bravo Léa ! », la marge gagnée et le compte du jour.", View: EndRecap },
  { key: "2", title: "L'aperçu du mail du patient", text: "Le pharmacien voit, en petit, le mail que le patient va recevoir : il sait ce qu'il propose. Le Bravo : le robot, les confettis, et une jauge de la journée (objectif d'exemple : 5 conseils).", View: EndPreview },
  { key: "3", title: "Compact, l'équipe dans le Bravo", text: "L'e-mail tient en une ligne (Envoyer, Passer). Le Bravo pose tout de suite « Qui a servi ce patient ? » avec les prénoms de l'équipe : plus d'écran à part.", View: EndCompact },
];

function EndCard({ letter, title, text, View }: { letter: string; title: string; text: string; View: (props: { run: number }) => ReactNode }) {
  const [run, setRun] = useState(0);
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-[#DCE7E2] bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold tracking-[0.12em] text-[#4D6B64] uppercase">Fin {letter}</p>
          <h3 className="text-[18px] font-bold text-[#0F2F2A]">{title}</h3>
          <p className="mt-1 text-[13.5px] leading-6 text-[#4D6B64]">{text}</p>
        </div>
        <button type="button" onClick={() => setRun((value) => value + 1)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#DCE7E2] px-2.5 py-1.5 text-[12.5px] font-semibold text-[#0F2F2A] hover:bg-[#F4F8F6]">
          <RotateCcw className="size-3.5" /> Rejouer
        </button>
      </div>
      <Screen>
        <View key={run} run={run} />
      </Screen>
      <p className="text-center text-[11px] font-semibold tracking-[0.12em] text-[#7C948D] uppercase">Exemple · « Envoyer » ou « Pas d&apos;e-mail » montre le Bravo</p>
    </article>
  );
}

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
  const [runNow, setRunNow] = useState(0);
  return (
    <main className="min-h-screen bg-[#F4F8F6] px-4 py-10">
      <style>{`${ISLAND_CSS}\n${SCAN_CSS}\n${PAGE_CSS}`}</style>
      <div className="mx-auto max-w-6xl">
        <h1 className="text-[28px] font-bold tracking-[-0.02em] text-[#0F2F2A]">La vente au comptoir, image par image</h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-7 text-[#4D6B64]">
          Chaque étape de la vraie bannière, figée : prenez le temps de tout regarder. Les cartes et la routine se cliquent. Vente d&apos;exemple (vrais produits du stock, photos studio).
        </p>

        <h2 className="mt-8 text-[20px] font-bold text-[#0F2F2A]">1 · La vente</h2>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <Frame n="Étape 1" title="En attente de scan" text="Inchangée : la capsule sur l'ADN. Seule la police est celle des cartes.">
            <Waiting />
          </Frame>
          <Frame n="Étape 2 · scan C" title="La gélule se remplit" text="Pendant l'analyse : le nom de la boîte et l'étape en cours (ici « Contre-indications »).">
            <Capsule look="gelule" phase="analyse" done={1} />
          </Frame>
          <Frame n="Étape 3 · scan C" title="La gélule s'ouvre" text="Trouvé : le nombre de conseils sort de la gélule.">
            <Capsule look="gelule" phase="found" done={4} />
          </Frame>
          <Frame n="Étape 2 et 3 · scan A" title="La croix de pharmacie" text="L'autre scan gardé : les bras s'allument un à un, puis toute la croix.">
            <Capsule look="croix" phase="analyse" done={2} />
            <Capsule look="croix" phase="found" done={4} />
          </Frame>
          <Frame n="Étape 4" title="La bannière en cartes" text="Une carte par boîte scannée, la routine dessous (cliquez dessus pour l'ouvrir)." tall>
            <MixIsland cards items={ITEMS} outcomes={[]} open={false} onOpen={noop} onFinish={noop} onAnswer={noop} />
          </Frame>
          <Frame n="Étape 5" title="Une carte ouverte" text="« À dire au patient », les questions : touchez « Oui, il ne suffit plus » pour voir l'autre produit proposé." tall>
            <MixIsland cards items={ITEMS} outcomes={[]} open startAt={0} onOpen={noop} onFinish={noop} onAnswer={noop} />
          </Frame>
        </div>

        <h2 className="mt-12 text-[20px] font-bold text-[#0F2F2A]">2 · La fin de la vente : l&apos;e-mail et le Bravo</h2>
        <p className="mt-1 max-w-3xl text-[14.5px] leading-7 text-[#4D6B64]">
          Après « FIN · Valider » dans LGPI. D&apos;abord ce qui s&apos;affiche aujourd&apos;hui, puis trois propositions. Dans chacune, « Envoyer » ou « Pas d&apos;e-mail » montre le Bravo.
        </p>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <article className="flex flex-col gap-3 rounded-2xl border border-[#DCE7E2] bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-bold tracking-[0.12em] text-[#4D6B64] uppercase">Aujourd&apos;hui</p>
                <h3 className="text-[18px] font-bold text-[#0F2F2A]">Ce qui s&apos;affiche maintenant</h3>
                <p className="mt-1 text-[13.5px] leading-6 text-[#4D6B64]">« Vente validée » et son compte à rebours, la carte de l&apos;e-mail, puis « Bravo ! » avec le robot (et ensuite « Qui a servi ce patient ? »).</p>
              </div>
              <button type="button" onClick={() => setRunNow((value) => value + 1)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#DCE7E2] px-2.5 py-1.5 text-[12.5px] font-semibold text-[#0F2F2A] hover:bg-[#F4F8F6]">
                <RotateCcw className="size-3.5" /> Rejouer
              </button>
            </div>
            <Screen>
              <CurrentEnd run={runNow} />
            </Screen>
          </article>
          {ENDS.map((end) => (
            <EndCard key={end.key} letter={end.key} title={end.title} text={end.text} View={end.View} />
          ))}
        </div>
        <p className="mt-6 flex items-center gap-2 text-[13px] text-[#4D6B64]"><Sparkles className="size-4 text-[#0E7C5A]" /> Les chiffres du jour et l&apos;objectif sont des exemples.</p>
      </div>
    </main>
  );
}
