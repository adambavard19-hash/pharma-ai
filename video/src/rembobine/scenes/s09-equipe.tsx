import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { Check } from "lucide-react";
import { Mention } from "../../presentation/motion/kit/mention";
import {
  AdnBackdrop,
  Bokeh,
  Burst,
  Camera,
  ChapterTitle,
  DotGrid,
  Dust,
  F,
  IN_OUT,
  JAKARTA,
  LINEAR,
  LiveDot,
  PB,
  POP,
  Ring,
  SCREEN_UI,
  SNAP,
  SoldCounterCard,
  Sparks,
  TeamRank,
  WHIP,
  clamp01,
  cue,
  keys,
  lerp,
  prog,
  pulse,
  rgba,
  tween,
  wobble,
  type Cue,
} from "../kit";

/* ==========================================================================
 * S9 · L'ÉQUIPE (44,8 → 49,0) — N8 : « Pour l'équipe : chaque conseil vendu se compte, en direct. »
 *
 *   ENTRÉE      sous le balayage citron de S8 : le chapitre « 1/3 · POUR L'ÉQUIPE » (ChapterTitle du kit, même
 *               gabarit que S10 et S12), « L'ÉQUIPE » monte sur le mot (45,22).
 *   « chaque »  le panneau file à gauche, le titre se range en étiquette en haut à gauche ; sur le noir vivant de
 *               l'hélice, la carte du compteur des conseils vendus arrive (127, Aujourd'hui · Cette semaine · Ce mois-ci,
 *               CA ajouté, objectif 10 % des ventes).
 *   « vendu »   une pastille « ✓ Vendu » (le bouton de la bannière) arrive en arc, plonge dans le grand nombre : il
 *               ROULE à 128 au mot (46,70), « +1 » citron, onde, étincelles, secousse ; le CA ajouté suit (+ 1 267 €).
 *   « compte »  la carte glisse à gauche, le classement de l'équipe arrive à droite.
 *   « direct »  « EN DIRECT » pulse ; JD prend +1 et passe 2e (« +1 place »).
 *   SORTIE      48,57 → 48,91 : la scène est DÉCOUPÉE par le balayage du chapitre de S10 (même géométrie, même
 *               courbe que ChapterTitle à S10_CHAPTER) — elle recule et disparaît derrière la bande citron.
 *   Mention « Illustration · exemples » dès que les chiffres sont là.
 * ======================================================================== */

// ---- Les temps (secondes du film, voix mesurée : mots.json N8) -------------------------------------------------------
const CH_AT = 44.88; // ChapterTitle : « POUR » monte à 45,04 (dit à 44,99), « L'ÉQUIPE » à 45,12 (dit à 45,22)
const CH_EXIT = 45.92; // le panneau file, le titre se range (« chaque » 46,03)
const CARD_AT = 46.04; // la carte du compteur
const TOKEN0 = 46.36; // la pastille « ✓ Vendu » part
const LAND = 46.72; // « vendu » (46,70) : 127 → 128
const CA0 = 46.8; // le chiffre d'affaires ajouté suit
const SHIFT = 47.02; // la carte glisse à gauche (« se compte » 47,15)
const RANK_AT = 47.8; // TeamRank : arrive à 47,2, JD +1 à 47,8, passe 2e de 47,92 à 48,42, « +1 place » à 48,25
const LIVE = 47.7; // « direct » (47,74)
/** Le chapitre de S10 (s10-patient.tsx, CH_AT) : sa bande citron découpe cette scène à la sortie. GARDER ÉGAUX. */
const S10_CHAPTER = 48.62;

// ---- Géométrie ------------------------------------------------------------------------------------------------------
const CARD0 = { x: 960, y: 474, s: 1 };
const CARD1 = { x: 700, y: 380, s: 0.8 };
/** Le centre du grand nombre quand la carte est à CARD0 (mesuré sur planche). */
const NUM = { x: 548, y: 440 };
const RANK = { x: 1400, y: 720, s: 0.92 };
const LIVE_POS = { x: 1400, y: 526 };

const beat = (t: number) => {
  const u = (((t - 20) % 0.5) + 0.5) % 0.5;
  return Math.exp(-u * 9);
};

/** La pastille « ✓ Vendu » (bouton choisi de la bannière) qui vole en arc jusqu'au grand nombre. */
function VenduToken({ t }: { t: number }) {
  if (t < TOKEN0 - F || t > LAND + 2 * F) return null;
  const P0 = { x: -120, y: 860 };
  const P1 = { x: 180, y: 120 };
  const P2 = NUM;
  const at = (k: number) => {
    const a = (1 - k) * (1 - k);
    const b = 2 * k * (1 - k);
    const c = k * k;
    return { x: a * P0.x + b * P1.x + c * P2.x, y: a * P0.y + b * P1.y + c * P2.y };
  };
  const k = prog(t, TOKEN0, LAND - TOKEN0, IN_OUT);
  const pill = (kk: number, alpha: number, key: string) => {
    const p = at(kk);
    const s = lerp(1.25, 0.42, kk * kk);
    const r = lerp(-28, 6, kk);
    return (
      <div key={key} style={{ position: "absolute", left: p.x, top: p.y, transform: `translate(-50%, -50%) rotate(${r}deg) scale(${s})`, opacity: alpha }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 12, height: 76, padding: "0 30px 0 14px", borderRadius: 22, background: SCREEN_UI.pick, boxShadow: `0 0 0 3px ${rgba(PB.citron, 0.85)}, 0 24px 40px -18px rgba(0,0,0,.7)`, whiteSpace: "nowrap" }}>
          <span style={{ display: "inline-flex", width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 14, background: PB.citron }}>
            <Check size={30} color={PB.green} strokeWidth={3.4} />
          </span>
          <span style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 34, color: "#FFF", letterSpacing: "-0.01em" }}>Vendu</span>
        </div>
      </div>
    );
  };
  // Traînée : trois copies en retard (flou de mouvement bon marché).
  return (
    <>
      {[0.16, 0.1, 0.05].map((d, i) => (k - d > 0 ? pill(clamp01(k - d), 0.12 + i * 0.08, `g${i}`) : null))}
      {pill(k, 1, "main")}
    </>
  );
}

/** Le chiffre d'affaires ajouté (exemple) : 1 254 → 1 267 € juste après la vente. */
function revenue(tt: number) {
  const v = Math.round(tween(tt, CA0, 0.42, 1254, 1267, IN_OUT));
  const s = String(v);
  return `+ ${s.slice(0, -3)} ${s.slice(-3)} €`;
}

/** Le fond : le noir vivant de la bannière, l'hélice qui dérive, une lueur sarcelle qui bat avec le groove. */
function Backdrop({ t }: { t: number }) {
  const b = beat(t);
  return (
    <AbsoluteFill style={{ background: SCREEN_UI.night }}>
      <AdnBackdrop t={t} tone="night" focus={[0.58, 0.52]} width={1700} opacity={0.75} />
      <AbsoluteFill style={{ background: `radial-gradient(60% 70% at 42% 44%, ${rgba(PB.brand, 0.28 + 0.06 * b)} 0%, ${rgba(PB.green, 0.55)} 55%, ${rgba("#030606", 0.85)} 100%)` }} />
      <DotGrid t={t} opacity={0.06} />
    </AbsoluteFill>
  );
}

/**
 * CONTOURNEMENT de deux défauts de ChapterTitle (kit/screens.tsx), par une feuille de style limitée à ce titre :
 *   1. avant que « L’ÉQUIPE » ne monte, l'accent du « É » dépasse déjà sous la ligne (le mot n'est descendu que de
 *      115 % de sa hauteur, l'accent est plus haut) : le mot reste caché jusqu'à son départ ;
 *   2. la lueur citron du mot (text-shadow) est coupée net par son masque (un rectangle clair se voit autour de
 *      « L’ÉQUIPE ») : elle est remplacée par un drop-shadow posé sur le masque, qui n'est pas coupé.
 */
function ChapterFix({ t, hideUntil, children }: { t: number; hideUntil: number; children: ReactNode }) {
  const w = `.s9-chapitre span[style*="overflow: hidden"]`;
  const css = `${w} > span { text-shadow: none !important; } ${w}:nth-child(2) { filter: drop-shadow(0 0 22px ${rgba(PB.citron, 0.38)}); }${t < hideUntil ? ` ${w}:nth-child(2) > span { visibility: hidden; }` : ""}`;
  return (
    <AbsoluteFill className="s9-chapitre">
      <style>{css}</style>
      {children}
    </AbsoluteFill>
  );
}

/** Une entrée par la droite pour le classement (le kit ne fait qu'une montée). */
function FromRight({ t, at, children }: { t: number; at: number; children: ReactNode }) {
  const e = prog(t, at, 0.5, SNAP);
  return <AbsoluteFill style={{ transform: `translateX(${(1 - e) * 260}px) rotate(${(1 - e) * 3}deg)`, transformOrigin: `${RANK.x}px ${RANK.y}px` }}>{children}</AbsoluteFill>;
}

export function Scene({ t }: { t: number }) {
  // La sortie : la bande citron du chapitre de S10 (ChapterTitle : L = 2400 → −320, WHIP, 0,34 s depuis at − 0,05).
  const kOut = prog(t, S10_CHAPTER - 0.05, 0.34, WHIP);
  const Ln = lerp(2400, -320, kOut);
  const clip = kOut > 0 ? `polygon(-400px 0, ${Ln - 70}px 0, ${Ln - 330}px 1080px, -400px 1080px)` : undefined;
  const push = kOut > 0 ? -150 * kOut : 0;

  const shiftK = prog(t, SHIFT, 0.55, SNAP);
  const card = { x: lerp(CARD0.x, CARD1.x, shiftK), y: lerp(CARD0.y, CARD1.y, shiftK), s: lerp(CARD0.s, CARD1.s, shiftK) };
  const value = (tt: number) => tween(tt, LAND - 0.36, 0.36, 127, 128, IN_OUT);
  const cam = {
    zoom: 1 + 0.035 * prog(t, CARD_AT, 2.8, LINEAR) + 0.012 * pulse(t, LAND, 0.04, 0.02, 0.4),
    x: push,
    shakes: [{ at: LAND, amp: 9, frames: 16 }],
  };
  // Le grand nombre, en coordonnées du cadre (il suit la carte).
  const num = { x: card.x + (NUM.x - CARD0.x) * card.s, y: card.y + (NUM.y - CARD0.y) * card.s };
  const ghost = prog(t, LAND, 0.9, SNAP);

  return (
    <AbsoluteFill style={{ clipPath: clip, overflow: "hidden" }}>
      <Camera t={t} {...cam} depth={0.35}>
        <Backdrop t={t} />
      </Camera>
      <Camera t={t} {...cam} depth={0.5}>
        <Bokeh t={t} count={7} seed={9} colors={[PB.mint, PB.citron, PB.brand]} alpha={0.22} />
        {/* « +1 » géant en contour, au fond, qui jaillit au mot « vendu ». */}
        {ghost > 0 && ghost < 1 && (
          <div style={{ position: "absolute", left: 960, top: 500, transform: `translate(-50%, -50%) scale(${lerp(0.7, 1.5, ghost)})`, fontFamily: JAKARTA, fontWeight: 800, fontSize: 620, letterSpacing: "-0.05em", lineHeight: 1, color: "transparent", WebkitTextStroke: `4px ${rgba(PB.citron, 0.4 * (1 - ghost))}`, whiteSpace: "nowrap" }}>+1</div>
        )}
      </Camera>
      <Camera t={t} {...cam}>
        <SoldCounterCard t={t} at={CARD_AT} x={card.x} y={card.y} scale={card.s} value={value} revenue={revenue} goal={0.8} />
        <Ring t={t} at={LAND} x={num.x} y={num.y} max={520} color={PB.citron} width={6} />
        <Burst t={t} at={LAND} x={num.x} y={num.y} count={18} radius={260} seed="s9-vendu" colors={[PB.citron, PB.mint, "#FFFFFF"]} size={16} life={0.55} />
        <Sparks t={t} at={LAND} x={num.x} y={num.y} count={20} seed="s9-sp" speed={1100} spread={180} color={PB.citron} len={30} life={0.45} />
        <FromRight t={t} at={RANK_AT - 0.62}>
          <TeamRank t={t} at={RANK_AT} x={RANK.x} y={RANK.y} scale={RANK.s} />
        </FromRight>
        <LiveDot t={t} at={LIVE} x={LIVE_POS.x} y={LIVE_POS.y + wobble(t, 4, 3, 1.2)} scale={1.3} />
      </Camera>
      <VenduToken t={t} />
      <Camera t={t} {...cam} depth={1.4}>
        <Dust t={t} count={26} seed="s9-dust" color={PB.citron} size={[1.5, 3.5]} alpha={0.3} speed={0.08} />
      </Camera>
      <Mention t={t} from={CARD_AT + 0.1} to={49.2} />
      <ChapterFix t={t} hideUntil={CH_AT + 0.16 + 0.08}>
        <ChapterTitle t={t} at={CH_AT} n="1/2" text="POUR *L’ÉQUIPE*" exitAt={CH_EXIT} />
      </ChapterFix>
      {/* La bande de la sortie, côté S9 : un liseré sombre qui ombre le bord découpé. */}
      {kOut > 0 && kOut < 1 && <AbsoluteFill style={{ background: `rgba(0,0,0,${0.35 * kOut})` }} />}
    </AbsoluteFill>
  );
}

export const cues: Cue[] = [
  cue("pop-sec", 45.0, 0.4), // la pastille « 1/3 »
  cue("swoosh", 45.9, 0.4), // le panneau file à gauche
  cue("carte-depliee", 46.04, 0.45), // la carte du compteur
  cue("whoosh-pb", 46.34, 0.28), // la pastille « ✓ Vendu » en arc
  cue("machine-a-sous", 46.38, 0.4, 1, 0.42), // le nombre roule
  cue("ui-ding", 46.71, 0.55), // 128, « +1 »
  cue("compteur", 46.8, 0.22, 1.1, 0.45), // le CA ajouté suit
  cue("balayage-mini", 47.16, 0.35), // le classement arrive, la carte glisse
  cue("radar", 47.68, 0.4), // EN DIRECT
  cue("orbite", 47.9, 0.32), // JD monte
  cue("ui-pop", 48.25, 0.5), // « +1 place »
];
