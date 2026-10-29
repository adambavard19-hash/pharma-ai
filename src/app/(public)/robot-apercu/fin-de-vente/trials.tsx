"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Hourglass, Sparkles, Star, Trophy } from "lucide-react";
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

/* ================================================================== ÉTAPE 1 : PROPOSITIONS */

/** La petite croix de pharmacie (celle du scan A), au repos : elle respire doucement. */
function IdleCross({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 40" style={{ width: size, height: size }} className="shrink-0" aria-hidden="true">
      {[
        { x: 14, y: 2 },
        { x: 26, y: 14 },
        { x: 14, y: 26 },
        { x: 2, y: 14 },
      ].map((arm, i) => (
        <rect key={i} x={arm.x} y={arm.y} width="12" height="12" rx="2.5" fill="#3DDC84" className="idle-arm" style={{ animationDelay: `${i * 0.35}s` }} />
      ))}
      <rect x="14" y="14" width="12" height="12" rx="2.5" fill="#3DDC84" />
    </svg>
  );
}

/** A · Le verre vert des cartes, sans ADN : le robot, la phrase, un point citron qui respire. */
function WaitGlass() {
  return (
    <section className="crd-glass relative flex h-11 w-[270px] items-center gap-2 overflow-hidden pr-4 pl-2">
      <Robot size={28} mood="idle" label="" />
      <span className="flex-1 text-[14px] leading-[18px] font-bold whitespace-nowrap text-white">En attente de scan…</span>
      <span className="breathe size-2 rounded-full bg-[#E8FF9C] shadow-[0_0_8px_#E8FF9C]" />
    </section>
  );
}

/** B · La croix du scan, déjà là au repos : elle respire, et s'allumera au scan. */
function WaitCross() {
  return (
    <section className="crd-glass relative flex h-11 w-[270px] items-center gap-2.5 overflow-hidden pr-4 pl-3">
      <IdleCross />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] leading-[17px] font-bold whitespace-nowrap text-white">En attente de scan…</span>
        <span className="block text-[10.5px] leading-[13px] text-[#9FCBBB]">Comptoir 1 · connecté</span>
      </span>
    </section>
  );
}

/** C · Un laser qui balaie doucement le bas de la capsule, comme une douchette prête. */
function WaitLaser() {
  return (
    <section className="crd-glass relative flex h-11 w-[270px] items-center gap-2.5 overflow-hidden pr-4 pl-3">
      <span className="flex h-5 items-stretch gap-[1.5px] rounded bg-white/90 px-1 py-[3px]" aria-hidden="true">
        {[2, 1, 3, 1, 2, 1, 3, 2, 1].map((w, i) => <i key={i} className="block bg-[#0F2F2A]" style={{ width: w }} />)}
      </span>
      <span className="flex-1 text-[14px] leading-[18px] font-bold whitespace-nowrap text-white">En attente de scan…</span>
      <span className="idle-laser absolute bottom-0 h-[2px] w-1/3" aria-hidden="true" />
    </section>
  );
}

/** D · Toute petite : la croix et « Prêt » ; au survol, elle s'élargit sur la phrase entière. */
function WaitMini() {
  return (
    <section className="crd-glass group relative flex h-10 w-[120px] items-center gap-2 overflow-hidden pr-3 pl-3 transition-[width] duration-300 hover:w-[250px]">
      <IdleCross size={20} />
      <span className="text-[14px] font-bold whitespace-nowrap text-white group-hover:hidden">Prêt</span>
      <span className="hidden text-[14px] font-bold whitespace-nowrap text-white group-hover:inline">En attente de scan…</span>
    </section>
  );
}

/** E · L'ADN gardé, plus doux : sur le verre vert, l'hélice en transparence. */
function WaitSoftDna() {
  return (
    <section className="crd-glass relative flex h-11 w-[270px] items-center gap-2 overflow-hidden pr-4 pl-2">
      <span aria-hidden="true" className="adn-bg absolute -inset-[20%] opacity-35" />
      <span className="relative"><Robot size={28} mood="idle" label="" /></span>
      <span className="relative flex-1 text-[14px] leading-[18px] font-bold whitespace-nowrap text-white">En attente de scan…</span>
      <span className="breathe relative size-2 rounded-full bg-[#E8FF9C] shadow-[0_0_8px_#E8FF9C]" />
    </section>
  );
}

const WAITS: { key: string; title: string; text: string; View: () => ReactNode }[] = [
  { key: "Aujourd'hui", title: "Sur l'ADN", text: "Ce qui s'affiche maintenant : fond noir, l'hélice d'ADN qui bouge.", View: Waiting },
  { key: "A", title: "Le verre vert, sans ADN", text: "Le même verre vert que les cartes et la croix : tout le parcours a le même habit. Un point citron respire.", View: WaitGlass },
  { key: "B", title: "La croix, déjà là", text: "Sans ADN. La croix du scan A attend au repos et respire ; au scan, ce sont ses bras qui s'allument. Le comptoir est rappelé dessous.", View: WaitCross },
  { key: "C", title: "Le laser prêt", text: "Sans ADN. Un petit code-barres et un trait de laser qui balaie doucement le bas : « scannez ».", View: WaitLaser },
  { key: "D", title: "Toute petite", text: "Sans ADN. Juste la croix et « Prêt » : elle ne cache presque rien de LGPI. Au survol, elle s'élargit sur la phrase.", View: WaitMini },
  { key: "E", title: "L'ADN plus doux", text: "Avec l'ADN, mais sur le verre vert et en transparence : plus calme que le fond noir.", View: WaitSoftDna },
];

/* ================================================================== ÉTAPE 1, AUTOUR DE LA D (plus moderne) */

/** La capsule de base des propositions : verre vert, centrée au pixel, taille fixe. */
const pod = "crd-glass relative inline-flex items-center justify-center overflow-hidden";

/** D1 · Une pastille ronde, la croix seule qui respire ; au survol, « Scannez une boîte ». */
function PodCross() {
  const [over, setOver] = useState(false);
  return (
    <section onMouseEnter={() => setOver(true)} onMouseLeave={() => setOver(false)} className={`${pod} h-11 gap-2 transition-[width] duration-300 ease-out`} style={{ width: over ? 200 : 44 }}>
      <IdleCross size={20} />
      {over && <span className="pop text-[13.5px] font-bold whitespace-nowrap text-white">Scannez une boîte</span>}
    </section>
  );
}

/** D2 · La tête du robot et la croix, séparées d'un trait : la marque, et la pharmacie. Aucun texte. */
function PodRobotCross() {
  return (
    <section className={`${pod} h-11 gap-2.5 px-3`}>
      <Robot size={26} mood="idle" label="" />
      <span className="h-5 w-px bg-white/15" />
      <IdleCross size={18} />
    </section>
  );
}

/** D3 · Façon « Dynamic Island » : une capsule noire très fine, la croix, et un petit signal qui écoute la douchette. */
function PodIsland() {
  return (
    <section className="relative inline-flex h-9 w-[150px] items-center justify-between rounded-full bg-[#050807] px-3 shadow-[0_10px_30px_-10px_rgba(0,0,0,.6),0_0_0_1px_rgba(232,255,156,.12)]">
      <IdleCross size={16} />
      <span className="flex h-3.5 items-end gap-[3px]" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => <i key={i} className="eq block w-[3px] rounded-full bg-[#3DDC84]" style={{ animationDelay: `${i * 0.15}s` }} />)}
      </span>
    </section>
  );
}

/** D4 · La tête du robot seule, dans un rond de verre ; un anneau citron tourne doucement autour. */
function PodRobotRing() {
  return (
    <span className="relative inline-flex size-12 items-center justify-center">
      <span className="ring-spin absolute inset-0 rounded-full" aria-hidden="true" />
      <section className="crd-glass relative inline-flex size-[42px] items-center justify-center overflow-hidden">
        <Robot size={28} mood="idle" label="" />
      </section>
    </span>
  );
}

/** D5 · Un liseré de lumière qui fait le tour de la capsule ; la croix et « PharmaBoost » au centre. */
function PodGlow() {
  return (
    <span className="glow-border relative inline-flex h-10 items-center justify-center rounded-full p-[1.5px]">
      <span className="relative inline-flex h-full items-center gap-2 rounded-full bg-[linear-gradient(180deg,#072A25,#03171A)] px-3.5">
        <IdleCross size={16} />
        <span className="text-[13px] font-bold tracking-[-0.01em] text-white">Pharma<span className="text-[#E8FF9C]">Boost</span></span>
      </span>
    </span>
  );
}

/** D6 · Le robot dans une pastille, et au survol la capsule s'ouvre sur « Comptoir 1 » et « Demander un conseil ». */
function PodExpand() {
  const [over, setOver] = useState(false);
  return (
    <section onMouseEnter={() => setOver(true)} onMouseLeave={() => setOver(false)} className="crd-glass relative inline-flex h-11 items-center gap-2 overflow-hidden pl-[7px] transition-[width] duration-300 ease-out" style={{ width: over ? 260 : 44 }}>
      <span className="shrink-0"><Robot size={30} mood="idle" label="" /></span>
      <span className={`${over ? "pop flex" : "hidden"} min-w-0 flex-1 items-center justify-between gap-2`}>
        <span className="text-[12.5px] leading-4 font-bold whitespace-nowrap text-white">Comptoir 1<br /><span className="font-medium text-[#9FCBBB]">scannez une boîte</span></span>
        <span className="mr-1.5 rounded-full bg-[#E8FF9C] px-2.5 py-1 text-[11px] font-bold whitespace-nowrap text-[#04261A]">Une question ?</span>
      </span>
    </section>
  );
}

const PODS: { key: string; title: string; text: string; View: () => ReactNode }[] = [
  { key: "D1", title: "La pastille croix", text: "Un rond de 44 px, la croix seule qui respire. Au survol : « Scannez une boîte ». Le plus discret.", View: PodCross },
  { key: "D2", title: "Robot et croix", text: "La tête du robot (la marque) et la croix (la pharmacie), séparées d'un trait. Aucun texte.", View: PodRobotCross },
  { key: "D3", title: "Façon Dynamic Island", text: "Une capsule noire très fine, comme sur l'iPhone : la croix, et un petit signal qui bouge, prêt à recevoir le bip.", View: PodIsland },
  { key: "D4", title: "Le robot et son anneau", text: "La tête du robot seule dans un rond de verre, un anneau citron tourne doucement autour : il veille.", View: PodRobotRing },
  { key: "D5", title: "Le liseré de lumière", text: "Une lumière fait le tour de la capsule ; au centre, la croix et « PharmaBoost ». La marque, en moderne.", View: PodGlow },
  { key: "D6", title: "Le robot qui s'ouvre", text: "Une pastille avec le robot ; au survol, elle s'ouvre sur « Comptoir 1 · scannez une boîte » et « Une question ? ».", View: PodExpand },
];

/* ================================================================== ÉTAPE 1, MÉLANGE D3 + D5 */

/** Le petit signal qui écoute la douchette (D3). */
function Signal({ bars = 5, tone = "#3DDC84" }: { bars?: number; tone?: string }) {
  return (
    <span className="flex h-3.5 items-end gap-[3px]" aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => <i key={i} className="eq block w-[3px] rounded-full" style={{ animationDelay: `${i * 0.15}s`, background: tone }} />)}
    </span>
  );
}

/** « PharmaBoost » (D5) : Boost en citron. */
function Wordmark({ size = 13 }: { size?: number }) {
  return <span className="font-bold tracking-[-0.01em] whitespace-nowrap text-white" style={{ fontSize: size }}>Pharma<span className="text-[#E8FF9C]">Boost</span></span>;
}

/** La capsule noire de l'île, avec la lumière qui en fait le tour (épaisseur et vitesse réglables). */
function Island({ children, height = 36, ring = 1.5, slow = false, className = "" }: { children: ReactNode; height?: number; ring?: number; slow?: boolean; className?: string }) {
  return (
    <span className={`glow-border relative inline-flex items-center justify-center rounded-full ${slow ? "glow-slow" : ""}`} style={{ padding: ring, height }}>
      <span className={`relative inline-flex h-full items-center rounded-full bg-[#050807] ${className}`}>{children}</span>
    </span>
  );
}

/** M1 · Tout ensemble : la croix, « PharmaBoost », le signal ; la lumière fait le tour. */
function MixAll() {
  return (
    <Island className="gap-2.5 px-3.5">
      <IdleCross size={15} />
      <Wordmark />
      <Signal />
    </Island>
  );
}

/** M2 · Sans texte : la croix et le signal, la lumière autour. Le plus petit. */
function MixMini() {
  return (
    <Island className="w-[120px] justify-between px-3">
      <IdleCross size={15} />
      <Signal />
    </Island>
  );
}

/** M3 · Le nom seul au centre, le signal remplace la croix ; une lumière lente, très calme. */
function MixName() {
  return (
    <Island slow className="gap-2.5 px-4">
      <Signal bars={4} tone="#E8FF9C" />
      <Wordmark size={13.5} />
    </Island>
  );
}

/** M4 · La lumière ne court qu'en bas, comme un rayon de douchette ; la croix et le nom au-dessus. */
function MixScanline() {
  return (
    <span className="relative inline-flex h-9 items-center gap-2.5 overflow-hidden rounded-full bg-[#050807] px-3.5 shadow-[0_10px_30px_-10px_rgba(0,0,0,.6),0_0_0_1px_rgba(232,255,156,.12)]">
      <IdleCross size={15} />
      <Wordmark />
      <Signal bars={4} />
      <span className="idle-laser absolute bottom-0 h-[1.5px] w-1/3" style={{ background: "linear-gradient(90deg,transparent,#E8FF9C,transparent)", boxShadow: "0 0 6px rgba(232,255,156,.8)" }} aria-hidden="true" />
    </span>
  );
}

/** M5 · L'île qui s'ouvre au survol : « Scannez une boîte » et « Une question ? » apparaissent. */
function MixExpand() {
  const [over, setOver] = useState(false);
  return (
    <span onMouseEnter={() => setOver(true)} onMouseLeave={() => setOver(false)}>
      <Island height={over ? 44 : 36} className="gap-2.5 px-3.5 transition-all duration-300">
        <IdleCross size={over ? 18 : 15} />
        {over ? (
          <>
            <span className="pop text-[12.5px] leading-4 font-bold whitespace-nowrap text-white">Scannez une boîte</span>
            <span className="pop ml-1 rounded-full bg-[#E8FF9C] px-2.5 py-1 text-[11px] font-bold whitespace-nowrap text-[#04261A]">Une question ?</span>
          </>
        ) : (
          <>
            <Wordmark />
            <Signal />
          </>
        )}
      </Island>
    </span>
  );
}

/** M6 · Deux lignes : le nom, et le comptoir dessous ; le signal à droite, la lumière autour. */
function MixTwoLines() {
  return (
    <Island height={44} className="gap-2.5 pr-4 pl-3">
      <IdleCross size={18} />
      <span className="flex flex-col leading-none">
        <Wordmark size={13} />
        <span className="mt-1 text-[10px] font-medium text-[#9FCBBB]">Comptoir 1 · connecté</span>
      </span>
      <span className="ml-1"><Signal /></span>
    </Island>
  );
}

const MIXES: { key: string; title: string; text: string; View: () => ReactNode }[] = [
  { key: "M1", title: "Tout ensemble", text: "La capsule noire de la D3, la lumière qui fait le tour de la D5 : la croix, « PharmaBoost » et le signal qui écoute le bip.", View: MixAll },
  { key: "M2", title: "La plus petite", text: "Sans texte : la croix et le signal, la lumière autour. Elle ne cache presque rien de LGPI.", View: MixMini },
  { key: "M3", title: "Le nom et le signal", text: "Le signal citron à la place de la croix, « PharmaBoost » au centre ; la lumière tourne lentement, très calme.", View: MixName },
  { key: "M4", title: "Le rayon de douchette", text: "La lumière ne court qu'en bas de la capsule, comme le rayon d'une douchette ; la croix, le nom et le signal au-dessus.", View: MixScanline },
  { key: "M5", title: "Elle s'ouvre au survol", text: "Comme M1 ; au survol, elle grandit un peu : « Scannez une boîte » et « Une question ? » pour demander un conseil sans scan.", View: MixExpand },
  { key: "M6", title: "Deux lignes", text: "Le nom, et « Comptoir 1 · connecté » dessous : on voit d'un coup d'œil que le poste est branché.", View: MixTwoLines },
];

/* ================================================================== ÉTAPE 1, BASE M3 QUI S'OUVRE, ET SUITE */

/** Ce qui apparaît à l'ouverture, partout pareil : « Scannez une boîte » et « Une question ? ». */
function Opened({ tone = "#E8FF9C" }: { tone?: string }) {
  return (
    <>
      <span className="text-in text-[12.5px] font-bold whitespace-nowrap text-white">Scannez une boîte</span>
      <span className="text-in ml-1 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap text-[#04261A]" style={{ background: tone, animationDelay: "80ms" }}>Une question ?</span>
    </>
  );
}

/** Une capsule qui s'ouvre au survol : fermée, `closed` ; ouverte, la croix (ou `lead`) puis « Scannez une boîte ». */
function useOver() {
  const [over, setOver] = useState(false);
  return { over, bind: { onMouseEnter: () => setOver(true), onMouseLeave: () => setOver(false) } };
}

/** BASE · M3 qui s'ouvre comme M5 : le signal citron et « PharmaBoost », la lumière lente ; au survol, l'île grandit. */
function BaseM3() {
  const { over, bind } = useOver();
  return (
    <span {...bind}>
      <Island slow height={over ? 44 : 36} className="gap-2.5 px-4 transition-all duration-300">
        <Signal bars={4} tone="#E8FF9C" />
        {over ? <Opened /> : <Wordmark size={13.5} />}
      </Island>
    </span>
  );
}

/** F1 · Verre fumé : la capsule transparente et floue, un liseré d'un pixel qui tourne très lentement. */
function F1Smoked() {
  const { over, bind } = useOver();
  return (
    <span {...bind} className="smoke-wrap relative inline-flex rounded-full p-px" style={{ height: over ? 44 : 36 }}>
      <span className="relative inline-flex h-full items-center gap-2.5 rounded-full bg-[rgba(8,14,12,.72)] px-4 backdrop-blur-xl transition-all duration-300">
        <Signal bars={4} tone="#E8FF9C" />
        {over ? <Opened /> : <Wordmark size={13.5} />}
      </span>
    </span>
  );
}

/** F2 · Aurore : une lueur verte et citron qui dérive lentement DANS la capsule, derrière le nom. */
function F2Aurora() {
  const { over, bind } = useOver();
  return (
    <span {...bind} className="relative inline-flex items-center gap-2.5 overflow-hidden rounded-full bg-[#050807] px-4 shadow-[0_10px_30px_-10px_rgba(0,0,0,.6),0_0_0_1px_rgba(232,255,156,.14)] transition-all duration-300" style={{ height: over ? 44 : 36 }}>
      <span className="aurora absolute inset-0" aria-hidden="true" />
      <span className="relative"><Signal bars={4} tone="#E8FF9C" /></span>
      <span className="relative inline-flex items-center gap-2.5">{over ? <Opened /> : <Wordmark size={13.5} />}</span>
    </span>
  );
}

/** F3 · Néon fin : un contour citron qui respire, le nom en petites capitales espacées, le signal en points. */
function F3Neon() {
  const { over, bind } = useOver();
  return (
    <span {...bind} className="neon inline-flex items-center gap-3 rounded-full bg-[#030504] px-4 transition-all duration-300" style={{ height: over ? 44 : 36 }}>
      <span className="flex items-center gap-[3px]" aria-hidden="true">
        {[0, 1, 2].map((i) => <i key={i} className="dot block size-[5px] rounded-full bg-[#E8FF9C]" style={{ animationDelay: `${i * 0.2}s` }} />)}
      </span>
      {over ? <Opened /> : <span className="text-[11px] font-bold tracking-[0.32em] whitespace-nowrap text-white uppercase">Pharma<span className="text-[#E8FF9C]">boost</span></span>}
    </span>
  );
}

/** F4 · Holographique : un liseré irisé (vert, turquoise, citron, une pointe de violet), un reflet qui traverse le nom. */
function F4Holo() {
  const { over, bind } = useOver();
  return (
    <span {...bind} className="holo-border relative inline-flex rounded-full p-[1.5px] transition-all duration-300" style={{ height: over ? 44 : 36 }}>
      <span className="relative inline-flex h-full items-center gap-2.5 overflow-hidden rounded-full bg-[#050807] px-4">
        <Signal bars={4} tone="#7BE0D0" />
        {over ? <Opened tone="#B8F5E6" /> : <span className="shine text-[13.5px] font-bold tracking-[-0.01em] whitespace-nowrap">PharmaBoost</span>}
      </span>
    </span>
  );
}

/** F5 · Sobre, façon Apple : noir pur, aucun liseré, un seul point citron qui respire ; l'ouverture se fait en fondu. */
function F5Pure() {
  const { over, bind } = useOver();
  return (
    <span {...bind} className="inline-flex items-center gap-2.5 rounded-full bg-black px-4 shadow-[0_12px_32px_-12px_rgba(0,0,0,.7)] transition-all duration-500 ease-[cubic-bezier(.2,.9,.3,1)]" style={{ height: over ? 44 : 34 }}>
      <span className="breathe size-[7px] rounded-full bg-[#E8FF9C] shadow-[0_0_10px_#E8FF9C]" aria-hidden="true" />
      {over ? <Opened /> : <span className="text-[13px] font-semibold tracking-[-0.01em] whitespace-nowrap text-white/90">PharmaBoost</span>}
    </span>
  );
}

/** F6 · Le radar : un petit cercle balayé comme un radar, qui guette le prochain bip, à la place du signal. */
function F6Radar() {
  const { over, bind } = useOver();
  return (
    <span {...bind}>
      <Island slow height={over ? 44 : 36} className="gap-2.5 px-3.5 transition-all duration-300">
        <span className="relative inline-flex size-4 shrink-0 overflow-hidden rounded-full border border-[#E8FF9C]/40" aria-hidden="true">
          <span className="radar absolute inset-0" />
          <span className="absolute top-1/2 left-1/2 size-1 -translate-1/2 rounded-full bg-[#E8FF9C]" />
        </span>
        {over ? <Opened /> : <Wordmark size={13.5} />}
      </Island>
    </span>
  );
}

const FUTURES: { key: string; title: string; text: string; View: () => ReactNode }[] = [
  { key: "Base", title: "M3 qui s'ouvre", text: "La base retenue : le signal citron et « PharmaBoost », la lumière lente. Au survol, l'île grandit : « Scannez une boîte » et « Une question ? ».", View: BaseM3 },
  { key: "F1", title: "Verre fumé", text: "La capsule devient transparente et floue, comme du verre fumé ; un liseré d'un pixel tourne très lentement. Très classe sur l'écran de LGPI.", View: F1Smoked },
  { key: "F2", title: "Aurore", text: "Une lueur verte et citron dérive lentement à l'intérieur de la capsule, derrière le nom. Vivant, sans bouger le texte.", View: F2Aurora },
  { key: "F3", title: "Néon fin", text: "Un contour citron qui respire, le nom en petites capitales très espacées, trois points à la place du signal. Futuriste.", View: F3Neon },
  { key: "F4", title: "Holographique", text: "Un liseré irisé (vert, turquoise, citron, une pointe de violet) et un reflet qui traverse le nom de temps en temps.", View: F4Holo },
  { key: "F5", title: "Sobre, façon Apple", text: "Noir pur, sans liseré, un seul point citron qui respire ; l'ouverture se fait lentement, en douceur. Le plus « luxe ».", View: F5Pure },
  { key: "F6", title: "Le radar", text: "Comme la base, mais un petit radar qui balaie à la place du signal : il guette le prochain bip.", View: F6Radar },
];

/* ================================================================== ÉTAPE 1, AUTOUR DU NÉON (F3) */

/** Le nom en petites capitales espacées, « boost » en citron (F3). */
function NeonName({ spacing = "0.32em" }: { spacing?: string }) {
  return <span className="text-[11px] font-bold whitespace-nowrap text-white uppercase" style={{ letterSpacing: spacing }}>Pharma<span className="text-[#E8FF9C]">boost</span></span>;
}

/** L'ouverture dans l'esprit néon : « Scannez une boîte » en capitales, « Une question ? » au contour citron. */
function NeonOpened() {
  return (
    <>
      <span className="text-in text-[10.5px] font-bold tracking-[0.2em] whitespace-nowrap text-white uppercase">Scannez une boîte</span>
      <span className="text-in ml-1 rounded-full border border-[#E8FF9C] px-2.5 py-[3px] text-[10.5px] font-bold tracking-[0.08em] whitespace-nowrap text-[#E8FF9C] uppercase" style={{ animationDelay: "80ms" }}>Une question ?</span>
    </>
  );
}

function NeonDots({ step = false }: { step?: boolean }) {
  return (
    <span className="flex items-center gap-[3px]" aria-hidden="true">
      {[0, 1, 2].map((i) => <i key={i} className={`${step ? "dot-step" : "dot"} block size-[5px] rounded-full bg-[#E8FF9C]`} style={{ animationDelay: `${i * (step ? 0.25 : 0.2)}s` }} />)}
    </span>
  );
}

/** La capsule néon de base, qui s'ouvre au survol. */
function NeonPill({ lead, extra, className = "neon", spacing, width }: { lead: ReactNode; extra?: ReactNode; className?: string; spacing?: string; width?: number }) {
  const { over, bind } = useOver();
  return (
    <span {...bind} className={`${className} relative inline-flex items-center gap-3 overflow-hidden rounded-full bg-[#030504] px-4 transition-all duration-300`} style={{ height: over ? 44 : width ? 40 : 36, ...(width && !over ? { width, justifyContent: "center" } : {}) }}>
      {lead}
      {over ? <NeonOpened /> : <><NeonName spacing={spacing} />{extra}</>}
    </span>
  );
}

/** N1 · La croix au néon : la croix de pharmacie, en contour citron, à la place des points. */
function N1Cross() {
  return (
    <NeonPill
      lead={
        <svg viewBox="0 0 20 20" className="size-[15px] shrink-0 drop-shadow-[0_0_4px_rgba(232,255,156,.8)]" aria-hidden="true">
          <path d="M7 1.5h6v5.5h5.5v6H13v5.5H7V13H1.5V7H7z" fill="none" stroke="#E8FF9C" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      }
    />
  );
}

/** N2 · Le néon en dégradé : un contour qui passe du turquoise au citron en tournant, le nom en dégradé lui aussi. */
function N2Gradient() {
  const { over, bind } = useOver();
  return (
    <span {...bind} className="neon-grad relative inline-flex rounded-full p-px transition-all duration-300" style={{ height: over ? 44 : 36 }}>
      <span className="relative inline-flex h-full items-center gap-3 rounded-full bg-[#030504] px-4">
        <NeonDots />
        {over ? <NeonOpened /> : <span className="grad-text text-[11px] font-bold tracking-[0.32em] whitespace-nowrap uppercase">Pharmaboost</span>}
      </span>
    </span>
  );
}

/** N3 · Les points qui avancent l'un après l'autre (« … »), et un trait citron qui file sous le nom. */
function N3Sweep() {
  return (
    <NeonPill
      lead={<NeonDots step />}
      extra={<span className="underline-sweep absolute right-4 bottom-[7px] left-[44px] h-px" aria-hidden="true" />}
    />
  );
}

/** N4 · Double contour : un trait fin dedans, la lueur dehors, comme un écran de science-fiction. */
function N4Double() {
  return <NeonPill className="neon neon-double" lead={<NeonDots />} spacing="0.4em" />;
}

/** N5 · Avec le comptoir : « Comptoir 1 », en tout petit, séparé d'un trait. */
function N5Counter() {
  return (
    <NeonPill
      lead={<NeonDots />}
      extra={
        <>
          <span className="h-3.5 w-px bg-[#E8FF9C]/30" />
          <span className="text-[9.5px] font-semibold tracking-[0.2em] whitespace-nowrap text-[#9FCBBB] uppercase">Comptoir 1</span>
        </>
      }
    />
  );
}

/** N6 · Le battement : le contour bat comme un cœur (deux battements rapprochés, puis une pause). */
function N6Heart() {
  return <NeonPill className="neon-heart" lead={<NeonDots />} />;
}

/** N7 · Néon sur verre fumé : le contour citron de F3 sur la capsule transparente et floue de F1. */
function N7Glass() {
  return <NeonPill className="neon bg-[rgba(3,5,4,.6)]! backdrop-blur-xl" lead={<NeonDots />} />;
}

const NEONS: { key: string; title: string; text: string; View: () => ReactNode }[] = [
  { key: "F3", title: "Néon fin (rappel)", text: "Celle que tu as aimée : contour citron qui respire, le nom en capitales espacées, trois points. Elle s'ouvre maintenant en capitales, avec « Une question ? » au contour citron.", View: () => <NeonPill lead={<NeonDots />} /> },
  { key: "N1", title: "La croix au néon", text: "La croix de pharmacie dessinée en néon citron à la place des trois points : on sait tout de suite que c'est la pharmacie.", View: N1Cross },
  { key: "N2", title: "Néon en dégradé", text: "Le contour passe du turquoise au citron en tournant lentement ; le nom est en dégradé lui aussi.", View: N2Gradient },
  { key: "N3", title: "Les points qui avancent", text: "Les trois points s'allument l'un après l'autre, et un trait citron file sous le nom : elle attend le bip.", View: N3Sweep },
  { key: "N4", title: "Double contour", text: "Un trait fin à l'intérieur, la lueur à l'extérieur, le nom encore plus espacé : très science-fiction.", View: N4Double },
  { key: "N5", title: "Avec le comptoir", text: "« Comptoir 1 » en tout petit à droite, séparé d'un trait : on sait sur quel poste on est.", View: N5Counter },
  { key: "N6", title: "Le battement", text: "Le contour bat comme un cœur : deux battements rapprochés, puis une pause. Vivant, et santé.", View: N6Heart },
  { key: "N7", title: "Néon sur verre fumé", text: "Le contour citron de F3 sur la capsule transparente et floue de F1 : le logiciel se devine derrière.", View: N7Glass },
];

/** Les étapes 2 à 8 du parcours retenu (scan A, cartes, fin 3), la vraie bannière figée : partagées par les variantes de couleur. */
function JourneyRest({ from = 2 }: { from?: number }) {
  return (
    <>
            {from <= 2 && (
              <>
                <Frame n="Étape 2" title="Scan : la croix s'allume" text="Le nom de la boîte et l'étape en cours ; un bras de la croix s'allume à chaque étape.">
                  <Capsule look="croix" phase="analyse" done={2} />
                </Frame>
                <Frame n="Étape 3" title="C'est prêt" text="Toute la croix s'allume : le nombre de conseils.">
                  <Capsule look="croix" phase="found" done={4} />
                </Frame>
              </>
            )}
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
    </>
  );
}

/* ================================================================== LE PARCOURS, VERSION RETENUE (néon) */

/** La largeur commune de la petite bannière : l'attente et le scan font exactement la même taille. */
const PILL_WIDTH = 214;

/** La croix de pharmacie en citron, la couleur de la bannière : ses bras s'allument un à un pendant l'analyse. */
function LimeCross({ lit, size = 24, glow = false }: { lit: number; size?: number; glow?: boolean }) {
  return (
    <svg viewBox="0 0 40 40" style={{ width: size, height: size }} className={`shrink-0 ${glow ? "drop-shadow-[0_0_6px_rgba(232,255,156,.9)]" : ""}`} aria-hidden="true">
      {[
        { x: 14, y: 2 },
        { x: 26, y: 14 },
        { x: 14, y: 26 },
        { x: 2, y: 14 },
      ].map((arm, i) => (
        <rect key={i} x={arm.x} y={arm.y} width="12" height="12" rx="2.5" fill={i < lit ? "#E8FF9C" : "rgba(232,255,156,.16)"} style={{ transition: "fill .25s" }} />
      ))}
      <rect x="14" y="14" width="12" height="12" rx="2.5" fill="#E8FF9C" className="scn-heart" />
    </svg>
  );
}

/** Le scan dans la petite bannière néon, à la même taille que l'attente : la croix citron et la boîte (ou « 2 conseils »). */
function NeonScan({ lit, found = false }: { lit: number; found?: boolean }) {
  return (
    <span className="neon neon-adn relative inline-flex h-10 items-center justify-center gap-2.5 overflow-hidden rounded-full bg-[#030504] px-4" style={{ width: PILL_WIDTH }}>
      <LimeCross lit={found ? 4 : lit} glow={found} />
      {found ? (
        <span className="pop text-[11px] font-bold tracking-[0.2em] whitespace-nowrap text-[#E8FF9C] uppercase">Les 2 conseils</span>
      ) : (
        <span className="text-[11px] font-bold tracking-[0.14em] whitespace-nowrap text-white uppercase">Curacné 20 mg</span>
      )}
    </span>
  );
}

/* ================================================================== LE SCAN COMPLET, QUI SE JOUE */

const PLAY_STEPS = [
  { title: "En attente", text: "PharmaBoost attend le bip, sur l'ADN.", ms: 4000 },
  { title: "Scan", text: "La boîte est bipée : la croix s'allume bras par bras.", ms: 3200 },
  { title: "C'est prêt", text: "Toute la croix s'allume : les 2 conseils, avec leur repère (challenge, date courte).", ms: 3200 },
  { title: "Les cartes", text: "Les conseils de la vente, la routine dessous.", ms: 5000 },
  { title: "Carte ouverte", text: "« À dire au patient » et les questions.", ms: 6000 },
  { title: "Bipé", text: "Cicaplast Lèvres passé en caisse : « Vendu ».", ms: 4500 },
  { title: "E-mail", text: "Vente validée dans LGPI : le bilan par e-mail.", ms: 4500 },
  { title: "Bravo", text: "Bravo, et qui a servi ce patient ?", ms: 5000 },
] as const;

/** Le scan qui s'allume : un bras de la croix de plus toutes les 0,7 s (repart de zéro à chaque passage). */
function LightingScan() {
  const [lit, setLit] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLit((value) => Math.min(4, value + 1)), 700);
    return () => clearInterval(id);
  }, []);
  return <NeonScan lit={lit} />;
}

/** La petite bannière en blanc sur l'ADN : la croix verte, PHARMABOOST, et au survol l'ouverture. */
function WhitePill({ lead, label, found = false, hover = true, fit = false }: { lead: ReactNode; label: ReactNode; found?: boolean; hover?: boolean; fit?: boolean }) {
  const { over, bind } = useOver();
  const open = hover && over;
  return (
    <span {...(hover ? bind : {})} className="white-pill white-adn relative inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-full bg-white px-4 transition-all duration-300" style={{ height: open ? 44 : 40, ...(open || fit ? {} : { width: PILL_WIDTH }) }}>
      {lead}
      {open ? (
        <>
          <span className="text-in text-[10.5px] font-bold tracking-[0.2em] whitespace-nowrap text-[#0F2B26] uppercase">Scannez une boîte</span>
          <span className="text-in ml-1 rounded-full bg-[#0E8A7B] px-2.5 py-[3px] text-[10.5px] font-bold tracking-[0.08em] whitespace-nowrap text-white uppercase" style={{ animationDelay: "80ms" }}>Une question ?</span>
        </>
      ) : (
        <span className={`${found ? "pop text-[#0E8A7B]" : "text-[#0F2B26]"} text-[11px] font-bold tracking-[0.22em] whitespace-nowrap uppercase`}>{label}</span>
      )}
    </span>
  );
}

/** La croix verte de la bannière blanche : ses bras s'allument un à un. */
function GreenCross({ lit, size = 24 }: { lit: number; size?: number }) {
  return (
    <svg viewBox="0 0 40 40" style={{ width: size, height: size }} className="shrink-0" aria-hidden="true">
      {[
        { x: 14, y: 2 },
        { x: 26, y: 14 },
        { x: 14, y: 26 },
        { x: 2, y: 14 },
      ].map((arm, i) => (
        <rect key={i} x={arm.x} y={arm.y} width="12" height="12" rx="2.5" fill={i < lit ? "#0E8A7B" : "rgba(14,138,123,.16)"} style={{ transition: "fill .25s" }} />
      ))}
      <rect x="14" y="14" width="12" height="12" rx="2.5" fill="#0E8A7B" className="scn-heart" />
    </svg>
  );
}

/**
 * Étape 3 (fondateur, 29 oct. 2026 : « à la place de 2 conseils, écris-les avec leur émoticône ») : le nom de chaque conseil,
 * avec son repère — l'étoile du challenge, le sablier de la date courte.
 */
function FoundNames({ dark = false }: { dark?: boolean }) {
  const heads = ITEMS.filter((item) => !item.sheet?.routine);
  return (
    <span className="pop flex items-center gap-3 tracking-normal whitespace-nowrap normal-case">
      {heads.map((item, i) => (
        <span key={item.name} className="inline-flex items-center gap-1.5">
          {i > 0 && <span className={`mr-1.5 h-3.5 w-px ${dark ? "bg-[#E8FF9C]/30" : "bg-[#0E8A7B]/25"}`} />}
          {item.challenge ? (
            <Star className={`size-3.5 ${dark ? "fill-[#E8FF9C] text-[#E8FF9C]" : "fill-[#B8D400] text-[#8AA000]"}`} aria-label="Challenge" />
          ) : item.shortDate ? (
            <Hourglass className={`size-3.5 ${dark ? "text-[#FF9C8F]" : "text-[#C23A2B]"}`} aria-label="Date courte" />
          ) : null}
          <span className={`text-[12px] font-bold ${dark ? "text-white" : "text-[#0F2B26]"}`}>{item.sheet?.name?.replace(/ baume réparateur$/i, "") || item.name}</span>
        </span>
      ))}
    </span>
  );
}

function WhiteLighting() {
  const [lit, setLit] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLit((value) => Math.min(4, value + 1)), 700);
    return () => clearInterval(id);
  }, []);
  return <WhitePill hover={false} lead={<GreenCross lit={lit} />} label="Curacné 20 mg" />;
}

/** Le scan complet en version néon, joué de bout en bout ; pause et étapes à la main. */
function ScanPlayer({ white = false }: { white?: boolean }) {
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => setAt((value) => (value + 1) % PLAY_STEPS.length), PLAY_STEPS[at].ms);
    return () => clearTimeout(id);
  }, [at, playing]);
  const step = PLAY_STEPS[at];
  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-[#0E7C5A] bg-white p-5 ring-1 ring-[#0E7C5A]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold tracking-[0.12em] text-[#4D6B64] uppercase">Étape {at + 1} sur 8</p>
          <h3 className="text-[19px] font-bold text-[#0F2F2A]">{step.title}</h3>
          <p className="text-[13.5px] text-[#4D6B64]">{step.text}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { setPlaying(false); setAt((value) => (value + PLAY_STEPS.length - 1) % PLAY_STEPS.length); }} className="h-9 rounded-lg border border-[#DCE7E2] px-3 text-[13px] font-semibold text-[#0F2F2A] hover:bg-[#F4F8F6]">← Précédente</button>
          <button type="button" onClick={() => setPlaying((value) => !value)} className="h-9 rounded-lg bg-[#0F2F2A] px-4 text-[13px] font-semibold text-white">{playing ? "Pause" : "Lecture"}</button>
          <button type="button" onClick={() => { setPlaying(false); setAt((value) => (value + 1) % PLAY_STEPS.length); }} className="h-9 rounded-lg border border-[#DCE7E2] px-3 text-[13px] font-semibold text-[#0F2F2A] hover:bg-[#F4F8F6]">Suivante →</button>
        </div>
      </div>
      <div className="flex gap-1.5">
        {PLAY_STEPS.map((item, i) => (
          <button key={item.title} type="button" onClick={() => { setPlaying(false); setAt(i); }} aria-label={`Étape ${i + 1} : ${item.title}`} className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#DCE7E2]">
            <span className="block h-full rounded-full bg-[#0E7C5A]" style={{ width: i < at ? "100%" : i === at ? "100%" : "0%", opacity: i === at ? 1 : i < at ? 0.5 : 0, transition: "opacity .3s" }} />
          </button>
        ))}
      </div>
      <div className={white ? "" : "theme-neon"}>
        <div className="scan-screen flex min-h-[520px] flex-col items-center gap-2 rounded-xl px-3 pt-5 pb-6">
          <div key={at} className="player-in flex flex-col items-center gap-2">
            {at === 0 && (white ? <WhitePill lead={<GreenCross lit={4} />} label={<>Pharma<span className="text-[#0E8A7B]">boost</span></>} /> : <NeonPill className="neon neon-adn" lead={<LimeCross lit={4} />} width={PILL_WIDTH} />)}
            {at === 1 && (white ? <WhiteLighting /> : <LightingScan />)}
            {at === 2 && (white ? <WhitePill hover={false} fit lead={<GreenCross lit={4} />} label={<FoundNames />} /> : <NeonScan lit={4} found />)}
            {at === 3 && <MixIsland cards enterFrom="croix" items={ITEMS} outcomes={[]} open={false} onOpen={noop} onFinish={noop} onAnswer={noop} />}
            {at === 4 && <MixIsland cards items={ITEMS} outcomes={[]} open startAt={0} onOpen={noop} onFinish={noop} onAnswer={noop} />}
            {at === 5 && <MixIsland cards items={ITEMS} outcomes={["SOLD"]} open startAt={0} onOpen={noop} onFinish={noop} onAnswer={noop} />}
            {at === 6 && <RealEnd stage="email" />}
            {at === 7 && <RealEnd stage="done" />}
          </div>
        </div>
      </div>
      <p className="text-center text-[11px] font-semibold tracking-[0.12em] text-[#7C948D] uppercase">Exemple · vente d&apos;exemple, produits du stock local</p>
    </article>
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
.white-pill{box-shadow:0 14px 32px -14px rgba(15,43,38,.45),0 0 0 1px rgba(14,138,123,.25)}
.white-adn{isolation:isolate}
.white-adn::after{content:"";position:absolute;inset:-60% -10%;z-index:-1;pointer-events:none;background:url(/poste/adn-helice.jpg) 62% 40%/cover no-repeat;mix-blend-mode:multiply;opacity:.42;animation:adn-vit 14s ease-in-out infinite alternate}
.player-in{animation:bravo .45s cubic-bezier(.2,.9,.3,1.1) both}
.eq{height:4px;animation:eq 1.1s ease-in-out infinite}
@keyframes eq{0%,100%{height:4px;opacity:.5}50%{height:14px;opacity:1}}
.ring-spin{background:conic-gradient(from 0deg,transparent 0 55%,#E8FF9C 75%,transparent 95%);animation:spin 3.2s linear infinite;-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px));mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px))}
@keyframes spin{to{transform:rotate(360deg)}}
.glow-border{background:conic-gradient(from var(--ang,0deg),rgba(95,165,148,.35),#E8FF9C 20%,rgba(95,165,148,.35) 40%,rgba(95,165,148,.35));animation:glow-rot 4s linear infinite;box-shadow:0 14px 34px -14px rgba(0,0,0,.6)}
@property --ang{syntax:"<angle>";inherits:false;initial-value:0deg}
@keyframes glow-rot{to{--ang:360deg}}
.glow-slow{animation-duration:9s}
.text-in{animation:text-in .35s ease both}
@keyframes text-in{from{opacity:0;filter:blur(4px);transform:translateX(-4px)}to{opacity:1;filter:none;transform:none}}
.smoke-wrap{background:conic-gradient(from var(--ang,0deg),rgba(255,255,255,.08),rgba(232,255,156,.7) 15%,rgba(255,255,255,.08) 35%);animation:glow-rot 12s linear infinite;box-shadow:0 14px 34px -14px rgba(0,0,0,.55)}
.aurora{background:radial-gradient(40% 120% at 20% 50%,rgba(61,220,132,.45),transparent 70%),radial-gradient(35% 120% at 80% 50%,rgba(232,255,156,.3),transparent 70%);filter:blur(6px);animation:aurora 7s ease-in-out infinite alternate}
@keyframes aurora{from{transform:translateX(-18%)}to{transform:translateX(18%)}}
.neon{box-shadow:0 0 0 1px rgba(232,255,156,.65),0 0 14px rgba(232,255,156,.25);animation:neon 3s ease-in-out infinite}
@keyframes neon{0%,100%{box-shadow:0 0 0 1px rgba(232,255,156,.65),0 0 14px rgba(232,255,156,.25)}50%{box-shadow:0 0 0 1px rgba(232,255,156,.35),0 0 4px rgba(232,255,156,.1)}}
.dot{animation:dot 1.4s ease-in-out infinite}
@keyframes dot{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}
.holo-border{background:conic-gradient(from var(--ang,0deg),#3DDC84,#5FD3E8,#E8FF9C,#B79CFF,#3DDC84);animation:glow-rot 6s linear infinite;box-shadow:0 14px 34px -14px rgba(0,0,0,.6)}
.shine{background:linear-gradient(100deg,#fff 40%,#E8FF9C 48%,#B8F5E6 52%,#fff 60%);background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:shine 4s ease-in-out infinite}
@keyframes shine{from{background-position:100% 0}to{background-position:-100% 0}}
.dot-step{animation:dot-step 1.5s ease-in-out infinite}
@keyframes dot-step{0%,60%,100%{opacity:.25}20%{opacity:1;box-shadow:0 0 6px #E8FF9C}}
.neon-grad{background:conic-gradient(from var(--ang,0deg),#5FD3E8,#E8FF9C,#3DDC84,#5FD3E8);animation:glow-rot 6s linear infinite;box-shadow:0 0 14px rgba(95,211,232,.25)}
.grad-text{background:linear-gradient(90deg,#9FF0F5,#E8FF9C);-webkit-background-clip:text;background-clip:text;color:transparent}
.underline-sweep{background:linear-gradient(90deg,transparent,#E8FF9C,transparent);background-size:40% 100%;background-repeat:no-repeat;animation:usweep 2.4s ease-in-out infinite}
@keyframes usweep{from{background-position:-40% 0}to{background-position:140% 0}}
.neon-double{box-shadow:inset 0 0 0 1px rgba(232,255,156,.35),0 0 0 3px #030504,0 0 0 4px rgba(232,255,156,.6),0 0 18px rgba(232,255,156,.3)!important;animation:none}
.neon-heart{box-shadow:0 0 0 1px rgba(232,255,156,.6),0 0 10px rgba(232,255,156,.2);animation:heartbeat 2.2s ease-in-out infinite}
@keyframes heartbeat{0%,40%,100%{box-shadow:0 0 0 1px rgba(232,255,156,.45),0 0 6px rgba(232,255,156,.15)}10%,30%{box-shadow:0 0 0 1.5px #E8FF9C,0 0 20px rgba(232,255,156,.5)}20%{box-shadow:0 0 0 1px rgba(232,255,156,.5),0 0 8px rgba(232,255,156,.2)}}
/* Le coloris « néon fin » appliqué à toutes les bannières d'un parcours : noir, contour citron qui respire. :not(#_) passe devant le verre vert. */
.theme-neon .scan-screen section:not(#_){background:#030504!important;box-shadow:0 14px 34px -14px rgba(0,0,0,.6)!important;isolation:isolate}
.theme-neon .scan-screen section:not(#_)::before{content:""!important;display:block!important;position:absolute;inset:0;border-radius:inherit;padding:0!important;background:none!important;-webkit-mask:none!important;mask:none!important;pointer-events:none;z-index:3;box-shadow:inset 0 0 0 1px rgba(232,255,156,.65),inset 0 0 12px rgba(232,255,156,.12);animation:neon-in 3s ease-in-out infinite}
@keyframes neon-in{0%,100%{box-shadow:inset 0 0 0 1px rgba(232,255,156,.7),inset 0 0 14px rgba(232,255,156,.14)}50%{box-shadow:inset 0 0 0 1px rgba(232,255,156,.3),inset 0 0 4px rgba(232,255,156,.05)}}
.theme-adn .scan-screen section:not(#_)::after,.neon-adn::after{content:"";position:absolute;inset:-20%;z-index:-1;pointer-events:none;background:url(/poste/adn-helice.jpg) 62% 40%/cover no-repeat;filter:invert(1) grayscale(1) brightness(1.1) contrast(1.4) sepia(1) hue-rotate(28deg) saturate(3.2);mix-blend-mode:screen;opacity:.42;animation:adn-vit 14s ease-in-out infinite alternate}
.neon-adn{isolation:isolate}
.neon-adn::after{opacity:.95;inset:-60% -10%;filter:invert(1) grayscale(1) brightness(1.35) contrast(1.5) sepia(1) hue-rotate(28deg) saturate(3.6)}
.neon-adn > *{position:relative;text-shadow:0 1px 4px rgba(0,0,0,.85)}
@keyframes adn-vit{from{transform:translate3d(-6%,-3%,0) scale(1.05) rotate(-2deg)}to{transform:translate3d(6%,3%,0) scale(1.15) rotate(2deg)}}
.radar{background:conic-gradient(from 0deg,rgba(232,255,156,.7),transparent 30%);animation:spin 1.8s linear infinite}
.breathe{animation:breathe 2.4s ease-in-out infinite}
@keyframes breathe{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}
.idle-arm{animation:idle-arm 2.8s ease-in-out infinite}
@keyframes idle-arm{0%,100%{opacity:.35}50%{opacity:1}}
.idle-laser{background:linear-gradient(90deg,transparent,#FF4D5E,transparent);box-shadow:0 0 6px rgba(255,77,94,.8);animation:idle-laser 2.6s ease-in-out infinite alternate}
@keyframes idle-laser{from{left:-10%}to{left:77%}}
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
@media (prefers-reduced-motion:reduce){.theme-neon .scan-screen section::before,.theme-adn .scan-screen section::after,.neon-adn::after,.dot-step,.neon-grad,.underline-sweep,.neon-heart,.text-in,.smoke-wrap,.aurora,.neon,.dot,.holo-border,.shine,.radar,.eq,.ring-spin,.glow-border,.breathe,.idle-arm,.idle-laser,.pop,.bravo-in,.countdown,.gauge,.confetti i{animation:none}}
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

        <h2 className="mt-8 text-[20px] font-bold text-[#0F2F2A]">Le scan complet, tout en blanc</h2>
        <p className="mt-1 mb-4 max-w-3xl text-[14.5px] leading-7 text-[#4D6B64]">Toutes les étapes en fond blanc sur l&apos;ADN, y compris la petite bannière du début. Elle se joue toute seule ; « Pause » et les flèches pour regarder. Passez la souris sur l&apos;étape 1.</p>
        <ScanPlayer white />

        <h2 className="mt-12 text-[20px] font-bold text-[#0F2F2A]">Un scan complet, de bout en bout (petite bannière noire)</h2>
        <p className="mt-1 mb-4 max-w-3xl text-[14.5px] leading-7 text-[#4D6B64]">La version retenue qui se joue toute seule, à un rythme lisible. « Pause » pour regarder, les flèches ou la barre pour aller à une étape.</p>
        <ScanPlayer />

        {/* La version retenue (fondateur, 29 oct. 2026) : l'ADN seulement sur la petite bannière ; le scan à la même taille, la croix en citron. */}
        <h2 className="mt-8 text-[20px] font-bold text-[#0F2F2A]">Le parcours, version retenue</h2>
        <p className="mt-1 max-w-3xl text-[14.5px] leading-7 text-[#4D6B64]">L&apos;ADN seulement sur la petite bannière ; le scan garde exactement sa taille, la croix s&apos;allume en citron ; ensuite, le néon sans ADN.</p>
        <div className="theme-neon mt-4 grid gap-5 lg:grid-cols-2">
          <Frame n="Étape 1" title="PharmaBoost sur l'ADN" text="La petite bannière : la croix de pharmacie en citron, PHARMABOOST, l'ADN en citron dedans. Au survol, « Scannez une boîte » et « Une question ? ».">
            <NeonPill className="neon neon-adn" lead={<LimeCross lit={4} />} width={PILL_WIDTH} />
          </Frame>
          <Frame n="Étape 2" title="Scan : la croix s'allume en citron" text="Même taille que l'étape 1. Le nom de la boîte, et un bras de la croix s'allume à chaque étape de l'analyse.">
            <NeonScan lit={2} />
          </Frame>
          <Frame n="Étape 3" title="C'est prêt" text="Toujours la même taille : toute la croix s'allume, « 2 conseils ».">
            <NeonScan lit={4} found />
          </Frame>
          <JourneyRest from={4} />
        </div>

        {/* Le parcours entier au coloris du néon fin (fondateur, 29 oct. 2026) : noir, contour citron qui respire. */}
        <h2 className="mt-8 text-[20px] font-bold text-[#0F2F2A]">Tout le parcours au néon fin, sans ADN</h2>
        <p className="mt-1 max-w-3xl text-[14.5px] leading-7 text-[#4D6B64]">Les huit étapes avec le même habit que la F3 : fond noir, contour citron qui respire. Passez la souris sur l&apos;étape 1.</p>
        <div className="theme-neon mt-4 grid gap-5 lg:grid-cols-2">
          <Frame n="Étape 1" title="Le néon fin" text="La F3 : PHARMABOOST en capitales espacées, trois points ; au survol, « Scannez une boîte » et « Une question ? ».">
            <NeonPill lead={<NeonDots />} />
          </Frame>
          <JourneyRest />
        </div>

        <h2 className="mt-12 text-[20px] font-bold text-[#0F2F2A]">Tout le parcours au néon fin, avec l&apos;ADN</h2>
        <p className="mt-1 max-w-3xl text-[14.5px] leading-7 text-[#4D6B64]">Le même coloris, avec l&apos;hélice d&apos;ADN en citron qui bouge doucement derrière chaque bannière.</p>
        <div className="theme-neon theme-adn mt-4 grid gap-5 lg:grid-cols-2">
          <Frame n="Étape 1" title="Le néon fin sur l'ADN" text="La F3 avec l'hélice d'ADN en citron dedans ; au survol, elle s'ouvre pareil.">
            <NeonPill className="neon neon-adn" lead={<NeonDots />} />
          </Frame>
          <JourneyRest />
        </div>

        <h2 className="mt-12 text-[20px] font-bold text-[#0F2F2A]">Étape 1 : autour du néon fin (F3)</h2>
        <p className="mt-1 max-w-3xl text-[14.5px] leading-7 text-[#4D6B64]">Toutes s&apos;ouvrent au survol : passez la souris dessus. Le fond gris clair imite l&apos;écran de LGPI.</p>
        <div className="mt-4 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {NEONS.map((item) => (
            <article key={item.key} className={`flex flex-col gap-3 rounded-2xl border bg-white p-5 ${item.key === "F3" ? "border-[#0E7C5A] ring-1 ring-[#0E7C5A]" : "border-[#DCE7E2]"}`}>
              <div>
                <p className="text-[12px] font-bold tracking-[0.12em] text-[#4D6B64] uppercase">{item.key === "F3" ? "Ta préférée" : `Proposition ${item.key}`}</p>
                <h3 className="text-[17px] font-bold text-[#0F2F2A]">{item.title}</h3>
                <p className="mt-1 text-[13px] leading-6 text-[#4D6B64]">{item.text}</p>
              </div>
              <Screen>
                <item.View />
              </Screen>
            </article>
          ))}
        </div>

        <h2 className="mt-12 text-[20px] font-bold text-[#0F2F2A]">Étape 1 : la base (M3 qui s&apos;ouvre) et de nouvelles pistes</h2>
        <p className="mt-1 max-w-3xl text-[14.5px] leading-7 text-[#4D6B64]">Toutes s&apos;ouvrent au survol, comme la M5 : passez la souris dessus.</p>
        <div className="mt-4 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FUTURES.map((item) => (
            <article key={item.key} className={`flex flex-col gap-3 rounded-2xl border bg-white p-5 ${item.key === "Base" ? "border-[#0E7C5A] ring-1 ring-[#0E7C5A]" : "border-[#DCE7E2]"}`}>
              <div>
                <p className="text-[12px] font-bold tracking-[0.12em] text-[#4D6B64] uppercase">{item.key === "Base" ? "La base retenue" : `Proposition ${item.key}`}</p>
                <h3 className="text-[17px] font-bold text-[#0F2F2A]">{item.title}</h3>
                <p className="mt-1 text-[13px] leading-6 text-[#4D6B64]">{item.text}</p>
              </div>
              <Screen>
                <item.View />
              </Screen>
            </article>
          ))}
        </div>

        <h2 className="mt-12 text-[20px] font-bold text-[#0F2F2A]">Étape 1 : le mélange D3 + D5</h2>
        <p className="mt-1 max-w-3xl text-[14.5px] leading-7 text-[#4D6B64]">La capsule noire très fine et le signal de la D3, la lumière qui fait le tour et « PharmaBoost » de la D5. Passez la souris sur M5.</p>
        <div className="mt-4 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {MIXES.map((item) => (
            <article key={item.key} className="flex flex-col gap-3 rounded-2xl border border-[#DCE7E2] bg-white p-5">
              <div>
                <p className="text-[12px] font-bold tracking-[0.12em] text-[#4D6B64] uppercase">Proposition {item.key}</p>
                <h3 className="text-[17px] font-bold text-[#0F2F2A]">{item.title}</h3>
                <p className="mt-1 text-[13px] leading-6 text-[#4D6B64]">{item.text}</p>
              </div>
              <Screen>
                <item.View />
              </Screen>
            </article>
          ))}
        </div>

        <h2 className="mt-12 text-[20px] font-bold text-[#0F2F2A]">Étape 1 : propositions autour de la D</h2>
        <p className="mt-1 max-w-3xl text-[14.5px] leading-7 text-[#4D6B64]">Plus de « En attente de scan », plus de « Prêt » : petites, centrées, modernes. Passez la souris sur D1 et D6.</p>
        <div className="mt-4 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {PODS.map((item) => (
            <article key={item.key} className="flex flex-col gap-3 rounded-2xl border border-[#DCE7E2] bg-white p-5">
              <div>
                <p className="text-[12px] font-bold tracking-[0.12em] text-[#4D6B64] uppercase">Proposition {item.key}</p>
                <h3 className="text-[17px] font-bold text-[#0F2F2A]">{item.title}</h3>
                <p className="mt-1 text-[13px] leading-6 text-[#4D6B64]">{item.text}</p>
              </div>
              <Screen>
                <item.View />
              </Screen>
            </article>
          ))}
        </div>

        <h2 className="mt-12 text-[20px] font-bold text-[#0F2F2A]">Étape 1 : les premières propositions</h2>
        <p className="mt-1 max-w-3xl text-[14.5px] leading-7 text-[#4D6B64]">Ce qui reste à l&apos;écran entre deux patients. D&apos;abord aujourd&apos;hui, puis cinq propositions, dont quatre sans ADN. Passez la souris sur la D.</p>
        <div className="mt-4 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {WAITS.map((wait) => (
            <article key={wait.key} className="flex flex-col gap-3 rounded-2xl border border-[#DCE7E2] bg-white p-5">
              <div>
                <p className="text-[12px] font-bold tracking-[0.12em] text-[#4D6B64] uppercase">{wait.key === "Aujourd'hui" ? wait.key : `Proposition ${wait.key}`}</p>
                <h3 className="text-[17px] font-bold text-[#0F2F2A]">{wait.title}</h3>
                <p className="mt-1 text-[13px] leading-6 text-[#4D6B64]">{wait.text}</p>
              </div>
              <Screen>
                <wait.View />
              </Screen>
            </article>
          ))}
        </div>

        <h2 className="mt-12 text-[20px] font-bold text-[#0F2F2A]">1 · Le parcours retenu, du début à la fin</h2>
        <p className="mt-1 max-w-3xl text-[14.5px] leading-7 text-[#4D6B64]">Scan A (la croix), la bannière en cartes, puis la fin 3. Chaque image est la vraie bannière du poste, figée.</p>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <Frame n="Étape 1" title="En attente de scan" text="Inchangée : la capsule sur l'ADN, dans la police des cartes.">
            <Waiting />
          </Frame>
          <JourneyRest />
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
