import { useId, type CSSProperties } from "react";
import { AbsoluteFill, Easing } from "remotion";
import { evolvePath } from "@remotion/paths";
import { Candy, Droplets, Pill, type LucideIcon } from "lucide-react";
import { Mascot, type Track } from "../mascot";
import {
  Burst,
  Camera,
  DotGrid,
  Dust,
  Halos,
  MotionBlur,
  Ring,
  Sparks,
  Word,
  EXIT,
  F,
  IN_OUT,
  LINEAR,
  POP,
  SNAP,
  clamp01,
  cue,
  digits,
  flight,
  hash,
  hero,
  keys,
  label,
  lerp,
  makeShards,
  prog,
  pulse,
  ressort,
  rgba,
  squash,
  INK,
  JAKARTA,
  PB,
  MENTION_POS,
  MENTION_TEXT,
  type CameraProps,
  type Shard,
} from "./kit";
import type { Time } from "./time";
import type { SceneCues, SceneProps } from "./types";

/* ==========================================================================
 * S5 · LA RÉVÉLATION — voix P6 « Voici PharmaBoost : | le robot pharmacien | de votre comptoir. »
 * Fenêtre : DROP → P7.start (time.win.S5). Direction : DIRECTION-PRESENTATION.json, buildNotes « S5 », et .md §S5.
 *
 *  DROP          (voix.json → marks.drop : la fricative de « Pharma », 80 ms avant la voyelle) le monde gris de l'acte 1
 *                (relais de S4, à 35 %) vole en 60 éclats vers la caméra (flou de mouvement) ; iris de couleur, onde de
 *                choc, rayons, flash de 3 images, grille en vague, secousse de 14 px, coup de zoom. Le robot de S4
 *                (accroupi au centre) plonge hors cadre par le bas.
 *  DROP + 0,03   « Pharma » claque lettre par lettre depuis la profondeur, « Boost » suit sur le mot dit ; un voile
 *                sombre derrière le logo le détache des rayons ; reflet + étincelles à + 0,55.
 *  DROP + 0,45   le robot (400 px) jaillit de sous le cadre en cloche (étiré 1,25 en vol, écrasé 0,8 à l'atterrissage,
 *                poussière) sur un socle lumineux ; il lève les yeux vers le logo ; vague de lettres juste avant que le
 *                logo ne monte.
 *  seg 2 − 0,15  le logo monte et rapetisse ; seg 2 : FICHE — le robot grandit d'un bond, de trois quarts et fier ;
 *                « PHARMACIEN » en contour entre le logo et sa tête ; 4 traits de repère qui disent ce qu'il FAIT (LIT LA
 *                BOÎTE, CONNAÎT VOTRE STOCK, TROUVE LE CONSEIL, VOUS LAISSE DÉCIDER) ; badge « ROBOT PHARMACIEN ».
 *  seg 3         les traits se rétractent ; l'écran « Caisse · Comptoir 1 » monte en basculant, NET, avec une vraie
 *                vente (3 lignes, total) ; étiquette « Sur l'écran de votre caisse » ; la capsule s'ouvre en haut et
 *                s'écrit « En attente d'une boîte… » ; le robot saute en cloche (salto, traînée) et s'y pose à
 *                P6.end − 0,1 (flash, anneau) : sa tête de 92 px, celle de S6.
 *  P6.end        PLONGÉE (12 images, flou) : relais à S6, capsule 1040×132 centrée (1200, 260), tête de 92 px à
 *                x = 740, état à x = 818, écran de caisse ×1,15, flou 8 px, assombri à 40 %.
 * ======================================================================== */

// ---- Le temps de la scène ----------------------------------------------------------------------------------------

type Beats = ReturnType<typeof beats>;

function beats(time: Time) {
  const D = time.DROP;
  const s2 = time.A("P6", 1);
  const s3 = time.A("P6", 2);
  const pEnd = time.Z("P6");
  // La plongée part pile à la fin de la voix ; le robot se pose dans la capsule 0,1 s avant (flash, anneau).
  const plunge = pEnd;
  const arrive = pEnd - 0.1;
  const jump = Math.min(arrive - 0.35, Math.max(s3 + 0.1, arrive - 0.6));
  const pop = D + 0.45;
  const peak = pop + 0.22;
  const logoUp = s2 - 0.15;
  return {
    D,
    s2,
    s3,
    plunge,
    end: time.win.S5.end,
    pop,
    peak,
    land: peak + 0.14,
    /** Le reflet et ses étincelles : quand le robot touche le socle, dans le silence après « Boost ». */
    shine: peak + 0.18,
    /** La vague de lettres : sur le temps DROP + 1,0 (120 BPM) si la voix en laisse le temps, sinon avant la montée du logo. */
    wave: Math.min(time.beat(2), logoUp - 0.2),
    logoUp,
    sheet: s2,
    hopLand: s2 + 0.3,
    lines: s2 + 0.14,
    stamp: s2 + 0.35,
    erase: s3 - 0.12,
    winUp: s3 - 0.05,
    /** L'étiquette « Sur l'écran de votre caisse ». */
    tag: s3 + 0.1,
    capOpen: s3 + 0.2,
    /** « En attente d'une boîte » s'écrit dans la capsule. */
    type: s3 + 0.3,
    jump,
    arrive,
    /** La mention « Illustration · exemples » (prix à l'écran) : posée ici, relayée par l'orchestrateur à P7 − 0,3. */
    mention: s3 - 0.2,
    mentionOut: time.A("P7") - 0.3,
    P7: time.A("P7"),
  };
}

const plungeP = (t: number, b: Beats) => prog(t, b.plunge, 12 * F, IN_OUT);

function cam(t: number, b: Beats): Omit<CameraProps, "t" | "children"> {
  const zoom = keys(t, [
    [b.D, 0.96],
    [b.D + 6 * F, 1.045],
    [b.D + 0.7, 1, IN_OUT],
    [b.logoUp, 1.012, LINEAR],
    [b.sheet + 0.35, 1, SNAP],
    [b.s3, 1.018, LINEAR],
    [b.s3 + 0.45, 1, SNAP],
  ]);
  return {
    zoom,
    drift: 1 - prog(t, b.s3, 0.6, IN_OUT),
    shakes: [
      { at: b.D, amp: 14, frames: 12 },
      { at: b.land, amp: 6, frames: 10 },
      { at: b.hopLand, amp: 4, frames: 8 },
      { at: b.stamp, amp: 6, frames: 9 },
      { at: b.arrive, amp: 3, frames: 8 },
    ],
  };
}

// ---- Le robot : géométrie mesurée dans le SVG du Mascot (viewBox 0 -4 100 92) ----------------------------------------

const RS = 480;
const RH = RS * 0.92;
/** Le socle : le bas de la blouse s'y pose. */
const PED_Y = 905;
/** Le robot du seg 1 (sous le logo) : 400 px. */
const SEG1_S = 400 / RS;
/** La hauteur du bond en cloche au-dessus du socle. */
const APEX = 110;
/** Le robot de S4 au DROP : size 520, yeux de visière (y 24,6 du dessin) sur y = 520. */
const S4_BOTTOM = 520 - (24.6 + 4) * 5.2 + 520 * 0.92;
const S4_S = 520 / RS;
const TAN4 = Math.tan((-4 * Math.PI) / 180);

/** La capsule (île) posée sur le haut de l'écran de caisse, et son relais à S6 (même hauteur : la plongée l'élargit). */
const CAP = { x: 1000, y: 260, w: 600, h: 132 };
const HANDOFF = { x: 1200, y: 260, w: 1040, h: 132, headX: 740 };
/** La tête dans la capsule : celle de S6 (Mascot 44 px × 2,1). */
const HEAD = 44 * 2.1;
/** L'emplacement de la tête dans la capsule. */
const SLOT = { x: CAP.x - CAP.w / 2 + CAP.h / 2, y: CAP.y };
/** Échelle du buste dont la tête (oreilles comprises, 81,6 % de la largeur) mesure celle de la capsule : ~113 px. */
const S_END = HEAD / 0.816 / RS;
/** Du centre du buste au centre de la tête (y 26,6 du dessin). */
const HEAD_FROM_CENTER = RH / 2 - ((26.6 + 4) / 100) * RS;
const ARC0: [number, number] = [960, PED_Y - RH / 2];
/** Le sommet du saut part à gauche : l'étiquette « Sur l'écran de votre caisse » est à droite. */
const ARC1: [number, number] = [640, -250];
const ARC2: [number, number] = [SLOT.x, SLOT.y + HEAD_FROM_CENTER * S_END];
const JUMP_EASE = Easing.bezier(0.42, 0.05, 0.36, 1);
const smooth = (x: number) => x * x * (3 - 2 * x);

function arcAt(u: number): [number, number] {
  const a = (1 - u) * (1 - u);
  const c = 2 * u * (1 - u);
  const d = u * u;
  return [a * ARC0[0] + c * ARC1[0] + d * ARC2[0], a * ARC0[1] + c * ARC1[1] + d * ARC2[1]];
}

/** Un point du dessin du robot → écran, dans la pose de la fiche (pieds (960, 905), size 480, trois quarts). */
function sheetPoint(u: number, v: number): [number, number] {
  const px = (u / 100) * RS - RS / 2;
  const py = ((v + 4) / 100) * RS - RH;
  const x = 0.94 * px;
  return [960 + x, PED_Y + py + TAN4 * x];
}

type Pose = { X: number; Y: number; origin: "bottom" | "center"; s: number; sx: number; sy: number; skew: number; rot: number; o: number; mask: number; brand: boolean };

function robotPose(t: number, b: Beats): Pose | null {
  // 1. Le relais de S4 (accroupi, size 520), puis le plongeon hors cadre.
  if (t < b.D + 12 * F) {
    const x = clamp01((t - b.D) / (9 * F));
    if (x >= 1) return null;
    const u = x * x * (1.6 - 0.6 * x);
    const rel = prog(t, b.D, 4 * F, SNAP);
    return { X: 960, Y: S4_BOTTOM + 1050 * u, origin: "bottom", s: S4_S, sx: lerp(1, 0.86, rel), sy: lerp(0.94, 1.22, rel), skew: 0, rot: 0, o: 1, mask: 0, brand: t >= b.D };
  }
  if (t < b.pop) return null;
  // 2. Il rejaillit du bas et se pose sur le socle.
  if (t < b.sheet) {
    let Y = PED_Y;
    let sx = 1;
    let sy = 1;
    if (t < b.peak) {
      // Départ sous le cadre, étiré à 1,25 ; il ralentit jusqu'au sommet de la cloche.
      const u = clamp01((t - b.pop) / (b.peak - b.pop));
      Y = lerp(1520, PED_Y - APEX, 1 - Math.pow(1 - u, 2.4));
      ({ sx, sy } = flight(Math.pow(1 - u, 1.4)));
    } else if (t < b.land) {
      // Retombée accélérée, étiré de nouveau avant le contact.
      const u = clamp01((t - b.peak) / (b.land - b.peak));
      Y = lerp(PED_Y - APEX, PED_Y, u * u);
      ({ sx, sy } = flight(u * 0.85));
    } else {
      ({ sx, sy } = squash(t, b.land, 5 * F));
    }
    return { X: 960, Y, origin: "bottom", s: SEG1_S, sx, sy, skew: 0, rot: 0, o: 1, mask: 1, brand: true };
  }
  // 3. La fiche de personnage : il grandit d'un bond, se met de trois quarts, fier (et respire).
  if (t < b.jump) {
    const g = ressort(t, b.sheet);
    const hop = Math.sin(Math.PI * clamp01((t - b.sheet) / (b.hopLand - b.sheet)));
    const turn = prog(t, b.sheet, 0.3, SNAP);
    const q = squash(t, b.hopLand, 5 * F);
    const crouch = IN_OUT(clamp01((t - (b.jump - 7 * F)) / (6 * F)));
    const breathe = 1 + 0.012 * Math.sin((t - b.sheet) * Math.PI * 1.8);
    return {
      X: 960,
      Y: PED_Y - 46 * hop,
      origin: "bottom",
      s: lerp(SEG1_S, 1, g) * breathe,
      sx: lerp(1, 0.94, turn) * q.sx * (1 + 0.06 * crouch),
      sy: q.sy * (1 - 0.1 * crouch),
      skew: -4 * turn,
      rot: 0,
      o: 1,
      mask: 1,
      brand: true,
    };
  }
  // 4. Le saut en cloche jusqu'à la capsule : salto, il rétrécit jusqu'à la taille de la tête de l'île.
  const fade = prog(t, b.arrive, 6 * F, LINEAR);
  if (fade >= 1) return null;
  const u = JUMP_EASE(clamp01((t - b.jump) / (b.arrive - b.jump)));
  const [X, Y] = arcAt(u);
  const f = flight(0.7 * Math.sin(Math.PI * u));
  return { X, Y, origin: "center", s: lerp(1, S_END, smooth(u)), sx: lerp(0.94, 1, u) * f.sx, sy: f.sy, skew: -4 * (1 - prog(t, b.jump, 0.15)), rot: -360 * IN_OUT(u), o: 1 - fade, mask: 1 - clamp01(u * 4), brand: true };
}

/** La poussière de l'atterrissage : des bouffées qui fusent au ras du socle, de part et d'autre des pieds. */
function DustPuffs({ t, b }: { t: number; b: Beats }) {
  const u = t - b.land;
  if (u < 0 || u > 0.6) return null;
  return (
    <>
      {Array.from({ length: 14 }, (_, i) => {
        const r = (k: number) => hash("S5-poussiere", i * 7 + k);
        const side = i % 2 === 0 ? -1 : 1;
        const life = 0.38 + 0.2 * r(1);
        const k = u / life;
        if (k >= 1) return null;
        const e = 1 - Math.pow(1 - k, 2.6);
        const x = 960 + side * (60 + 30 * r(2) + (150 + 160 * r(3)) * e);
        const y = PED_Y - 6 - (18 + 40 * r(4)) * e + 30 * k * k;
        const d = (14 + 22 * r(5)) * (0.6 + 0.9 * e);
        return <div key={i} style={{ position: "absolute", left: x - d / 2, top: y - d / 2, width: d, height: d, borderRadius: "50%", background: `radial-gradient(circle, ${rgba("#E6FFF9", 0.55)} 0%, ${rgba(PB.mint2, 0.18)} 55%, transparent 72%)`, opacity: 1 - k }} />;
      })}
    </>
  );
}

function Robot({ t, b, track }: { t: number; b: Beats; track: Track }) {
  const p = robotPose(t, b);
  if (!p) return null;
  const oy = p.origin === "bottom" ? RH : RH / 2;
  const m = p.mask > 0.01 ? `linear-gradient(to bottom, black ${100 - 7 * p.mask}%, transparent 100%)` : undefined;
  return (
    <div
      style={{
        position: "absolute",
        left: p.X - RS / 2,
        top: p.Y - oy,
        width: RS,
        height: RH,
        transformOrigin: `${RS / 2}px ${oy}px`,
        transform: `rotate(${p.rot.toFixed(2)}deg) skewY(${p.skew.toFixed(2)}deg) scale(${(p.s * p.sx).toFixed(4)}, ${(p.s * p.sy).toFixed(4)})`,
        opacity: p.o,
        WebkitMaskImage: m,
        maskImage: m,
        filter: p.brand ? `drop-shadow(0 26px 34px rgba(0,0,0,.4)) drop-shadow(0 0 28px ${rgba(PB.mint, 0.22)})` : undefined,
      }}
    >
      <Mascot track={track} t={t} size={RS} />
    </div>
  );
}

function hostTrack(b: Beats): Track {
  return {
    id: `S5-hote-${b.D.toFixed(3)}-${b.s2.toFixed(3)}-${b.s3.toFixed(3)}-${b.plunge.toFixed(3)}`,
    seed: 505,
    until: b.end + 0.2,
    events: [
      { t: Math.max(0, b.D - 2.2), kind: "mood", mood: "happy" },
      { t: b.pop, kind: "burst", burst: "jump" },
      { t: b.land, kind: "squash" },
      { t: b.land + 0.06, kind: "glance", x: 0.1, y: -0.95, dur: 0.42 },
      { t: b.land + 0.55, kind: "blink" },
      { t: b.sheet, kind: "burst", burst: "jump" },
      { t: b.sheet + 0.14, kind: "emote", emote: "proud", dur: 1.0 },
      { t: b.sheet + 0.3, kind: "glance", x: -0.85, y: -0.25, dur: 0.3 },
      { t: b.sheet + 0.68, kind: "glance", x: 0.85, y: 0.1, dur: 0.3 },
      { t: b.s3 - 0.06, kind: "blink" },
      { t: b.jump - 0.02, kind: "burst", burst: "jump" },
      { t: b.arrive, kind: "squash" },
      { t: b.arrive + 0.14, kind: "blink" },
      { t: b.plunge - 0.06, kind: "glance", x: 0.6, y: 0.15, dur: 0.4 },
    ],
  };
}

function badgeTrack(b: Beats): Track {
  return {
    id: `S5-badge-${b.stamp.toFixed(3)}`,
    seed: 55,
    until: b.end + 0.2,
    events: [
      { t: b.stamp + 0.04, kind: "mood", mood: "happy" },
      { t: b.stamp + 0.75, kind: "blink" },
    ],
  };
}

// ---- Le monde gris de l'acte 1 (relais de S4), léger : il est dessiné une fois par éclat -------------------------------

const G1 = "#1A2129";
const G2 = "#2A333D";
const G3 = "#8A94A3";
const G4 = "#C9D1DA";

const SHELF_BOXES = [205, 360, 515].map((y, j) => {
  const out: { x: number; y: number; w: number; h: number; c: string }[] = [];
  let x = 600;
  for (let i = 0; x < 1920; i++) {
    const w = 46 + 64 * hash("S5-boite", j * 50 + i);
    const h = 54 + 66 * hash("S5-boiteh", j * 50 + i);
    const r = hash("S5-boitec", j * 50 + i);
    out.push({ x, y: y - h, w, h, c: r < 0.18 ? G3 : r < 0.6 ? G2 : "#36414C" });
    x += w + 8 + 14 * hash("S5-boitex", j * 50 + i);
  }
  return { y, boxes: out };
});

const QUEUE = [
  { x: 1090, s: 1 },
  { x: 1262, s: 0.9 },
  { x: 1414, s: 0.82 },
  { x: 1548, s: 0.75 },
  { x: 1668, s: 0.7 },
];

function GreyWorld() {
  return (
    <g>
      <rect width={1920} height={1080} fill={INK} />
      <rect width={1920} height={700} fill={G1} />
      {SHELF_BOXES.map((sh, j) => (
        <g key={j}>
          {sh.boxes.map((bx, i) => (
            <rect key={i} x={bx.x} y={bx.y} width={bx.w} height={bx.h} rx={5} fill={bx.c} />
          ))}
          <rect x={560} y={sh.y} width={1360} height={12} fill={G2} />
        </g>
      ))}
      {/* La croix de pharmacie, éteinte. */}
      <g transform="translate(280 200)">
        <rect x={-30} y={-96} width={60} height={192} rx={10} fill={G2} stroke={G3} strokeWidth={3} />
        <rect x={-96} y={-30} width={192} height={60} rx={10} fill={G2} stroke={G3} strokeWidth={3} />
      </g>
      {/* La file d'attente, derrière le comptoir. */}
      {QUEUE.map((p, i) => (
        <g key={i} transform={`translate(${p.x} 700) scale(${p.s})`}>
          <path d="M -92 0 C -92 -110 -60 -150 0 -150 C 60 -150 92 -110 92 0 Z" fill={G2} stroke={G3} strokeOpacity={0.5} strokeWidth={3} />
          <circle cx={0} cy={-212} r={48} fill={G2} stroke={G3} strokeOpacity={0.5} strokeWidth={3} />
        </g>
      ))}
      {/* Le comptoir, le poste de caisse et le tapis. */}
      <rect x={0} y={700} width={1920} height={380} fill={G2} />
      <rect x={0} y={692} width={1920} height={16} fill={G3} opacity={0.85} />
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={i * 220 + 100} y={830} width={4} height={250} fill={G1} />
      ))}
      <rect x={430} y={600} width={36} height={96} fill={G1} />
      <rect x={300} y={430} width={300} height={186} rx={14} fill={G1} stroke={G3} strokeWidth={4} />
      <rect x={330} y={470} width={180} height={14} rx={7} fill={G2} />
      <rect x={330} y={505} width={240} height={14} rx={7} fill={G2} />
      <rect x={330} y={540} width={140} height={14} rx={7} fill={G2} />
      <rect x={640} y={736} width={1280} height={60} rx={8} fill={G1} />
      {Array.from({ length: 32 }, (_, i) => (
        <rect key={i} x={660 + i * 40} y={744} width={3} height={44} fill={G2} />
      ))}
      <rect x={760} y={650} width={150} height={96} rx={8} fill={G3} />
      <rect x={1050} y={630} width={120} height={116} rx={8} fill={G4} opacity={0.8} />
      <rect x={1380} y={664} width={170} height={82} rx={8} fill={G3} />
      <rect x={782} y={680} width={90} height={12} rx={6} fill={G2} />
      <rect x={1070} y={664} width={70} height={12} rx={6} fill={G3} />
    </g>
  );
}

const SHARDS = makeShards({ seed: "S5-eclats", cols: 10, rows: 6, jitter: 0.32 });
const shardPts = (s: Shard) => s.pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

/** Un éclat à u s du DROP : fêlure de 2 images, puis vers la caméra (×2,5 à 3,5), rotation ±90 à 240°, 24 images. */
function shardState(s: Shard, u: number) {
  const r = (k: number) => hash("S5-eclat", s.i * 11 + k);
  const dx = s.cx - 960;
  const dy = s.cy - 540;
  const dist = Math.max(1, Math.hypot(dx, dy));
  const nx = dx / dist;
  const ny = dy / dist;
  const crack = 2 * F;
  const gap = 5 * clamp01(u / crack);
  const w = Math.max(0, u - crack);
  const k = clamp01(w / (24 * F));
  const v = 900 + 700 * r(1);
  const sc = 1 + (1.5 + r(2)) * Math.pow(k, 1.5);
  const spread = (sc - 1) * 0.5;
  const tx = nx * (gap + v * w) + dx * spread;
  const ty = ny * (gap + v * w) + dy * spread + 300 * w * w;
  const rot = (r(3) < 0.5 ? -1 : 1) * (90 + 150 * r(4)) * k;
  const flip = Math.cos(Math.PI * k * (0.5 + 0.8 * r(5)));
  const fx = (flip < 0 ? -1 : 1) * Math.max(0.18, Math.abs(flip));
  const lit = u < F ? lerp(0.35, 0.8, u / F) : 0.8;
  return {
    tf: `translate(${(s.cx + tx).toFixed(1)} ${(s.cy + ty).toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${(sc * fx).toFixed(3)} ${sc.toFixed(3)}) translate(${(-s.cx).toFixed(1)} ${(-s.cy).toFixed(1)})`,
    o: lit * (1 - Math.pow(k, 1.1)),
    sc,
    edge: (1 - k) * 0.8 * clamp01(u / F),
  };
}

function ShardLayer({ t, b }: { t: number; b: Beats }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const u = t - b.D;
  if (u > 0.46) return null;
  const whole = u < 0;
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <defs>
        <g id={`${id}w`}>
          <GreyWorld />
        </g>
        {!whole &&
          SHARDS.map((s) => (
            <clipPath id={`${id}c${s.i}`} key={s.i}>
              <polygon points={shardPts(s)} />
            </clipPath>
          ))}
      </defs>
      {whole ? (
        <use href={`#${id}w`} opacity={0.35} style={{ filter: "blur(2px)" }} />
      ) : (
        SHARDS.map((s) => {
          const st = shardState(s, u);
          if (st.o <= 0.005) return null;
          return (
            <g key={s.i} transform={st.tf} opacity={st.o}>
              <g clipPath={`url(#${id}c${s.i})`}>
                <use href={`#${id}w`} />
              </g>
              <polygon points={shardPts(s)} fill="none" stroke="#E6FFF9" strokeWidth={2.2 / st.sc} strokeOpacity={st.edge} strokeLinejoin="round" />
            </g>
          );
        })
      )}
    </svg>
  );
}

// ---- Le monde de couleur : iris, rayons, onde de choc --------------------------------------------------------------------

function ColorWorld({ t, b }: { t: number; b: Beats }) {
  const r = 1320 * prog(t, b.D, 18 * F, SNAP);
  if (r <= 0) return null;
  const dim = keys(t, [
    [b.logoUp, 0],
    [b.sheet + 0.3, 0.36, IN_OUT],
    [b.s3, 0.36],
    [b.s3 + 0.4, 0.2, IN_OUT],
  ]);
  const cy = lerp(540, 660, prog(t, b.logoUp, 0.6, IN_OUT));
  const p = plungeP(t, b);
  return (
    <AbsoluteFill style={{ clipPath: r < 1300 ? `circle(${r.toFixed(1)}px at 960px 540px)` : undefined }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 960px ${cy}px, ${PB.teal2} 0%, ${PB.teal} 40%, #0C3B3A 70%, ${INK} 96%)` }} />
      <Halos t={t} seed="S5-halos" />
      <AbsoluteFill style={{ background: INK, opacity: dim + 0.3 * p }} />
    </AbsoluteFill>
  );
}

function Rays({ t, b }: { t: number; b: Beats }) {
  if (t < b.D) return null;
  const a =
    prog(t, b.D, 8 * F, SNAP) *
    keys(t, [
      [b.D, 1],
      [b.D + 0.9, 0.75, IN_OUT],
      [b.sheet, 0.5, IN_OUT],
      [b.s3, 0.42],
      [b.s3 + 0.35, 0, EXIT],
    ]);
  if (a <= 0.002) return null;
  const sc = lerp(0.45, 1, prog(t, b.D, 22 * F, SNAP));
  const cy = lerp(LOGO_Y, 650, prog(t, b.logoUp, 0.6, IN_OUT));
  const ang = 20 * (t - b.D) + 7;
  const R = 1500;
  const c = (al: number) => rgba(PB.mint, al);
  // Ils meurent avec la distance : pleins près du cœur, à moitié à 520 px, éteints à 1 150 px.
  const mask = `radial-gradient(circle at 50% 50%, transparent 60px, black 240px, rgba(0,0,0,.5) 520px, transparent 1150px)`;
  return (
    <div
      style={{
        position: "absolute",
        left: 960 - R,
        top: cy - R,
        width: 2 * R,
        height: 2 * R,
        borderRadius: "50%",
        transform: `scale(${sc.toFixed(4)})`,
        opacity: a,
        background: `repeating-conic-gradient(from ${ang.toFixed(2)}deg at 50% 50%, ${c(0.11)} 0deg, ${c(0.11)} 5deg, ${c(0)} 7.5deg, ${c(0)} 15deg)`,
        WebkitMaskImage: mask,
        maskImage: mask,
      }}
    />
  );
}

function Shock({ t, b }: { t: number; b: Beats }) {
  const rings = [
    { at: b.D, max: 2400, w0: 6 },
    { at: b.D + 4 * F, max: 1700, w0: 3 },
  ];
  return (
    <>
      {rings.map((rg, i) => {
        const p = prog(t, rg.at, 20 * F, SNAP);
        if (p <= 0 || p >= 1) return null;
        const d = rg.max * p;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 960 - d / 2,
              top: 540 - d / 2,
              width: d,
              height: d,
              borderRadius: "50%",
              border: `${lerp(rg.w0, 1, p).toFixed(2)}px solid ${PB.mint2}`,
              opacity: 1 - p,
              boxShadow: `0 0 30px ${rgba(PB.mint, 0.6)}, inset 0 0 30px ${rgba(PB.mint, 0.35)}`,
            }}
          />
        );
      })}
    </>
  );
}

/** Le reflet anamorphique du DROP : une ligne de lumière horizontale qui s'ouvre et s'éteint. */
function Flare({ t, b }: { t: number; b: Beats }) {
  const o = pulse(t, b.D, 2 * F, 4 * F, 0.35);
  if (o <= 0) return null;
  const w = 1900 * prog(t, b.D, 10 * F, SNAP);
  return (
    <div
      style={{
        position: "absolute",
        left: 960 - w / 2,
        top: 538,
        width: w,
        height: 4,
        borderRadius: 4,
        opacity: o,
        background: `linear-gradient(90deg, transparent, ${rgba(PB.mint2, 0.8)} 25%, #FFFFFF 50%, ${rgba(PB.mint2, 0.8)} 75%, transparent)`,
        boxShadow: `0 0 24px ${rgba(PB.mint, 0.9)}, 0 0 60px ${rgba(PB.mint, 0.5)}`,
      }}
    />
  );
}

// ---- Le logotype --------------------------------------------------------------------------------------------------------

const LOGO = Array.from("PharmaBoost").map((ch, i) => ({ ch, boost: i >= 6 }));
/** Le centre du logo au DROP : assez haut pour laisser 30 px d'air au-dessus de la tête du robot. */
const LOGO_Y = 418;
/** « Boost » claque sur le mot dit : 4 images après « Pharma ». */
const letterAt = (b: Beats, i: number) => b.D + 0.03 + i * 2 * F + (i >= 6 ? 4 * F : 0);

function Logo({ t, b }: { t: number; b: Beats }) {
  if (t < b.D) return null;
  const mv = prog(t, b.logoUp, 0.4, SNAP);
  // Il s'efface avec les traits de la fiche : la place est libre pour l'étiquette « Sur l'écran de votre caisse ».
  const out = prog(t, b.erase, 0.22, EXIT);
  if (out >= 1) return null;
  const y = lerp(LOGO_Y, 172, mv) - 90 * out;
  const sc = lerp(1, 0.42, mv) * (1 - 0.1 * out);
  const breath = 0.5 + 0.18 * Math.sin((t - b.D) * 5.2);
  const appear = prog(t, b.D + 0.03, 0.4, SNAP);
  // Deux reflets : le grand au DROP + 0,55, un plus discret quand le logo est petit (vie pendant la fiche).
  const shineAt = t < b.sheet + 0.6 ? b.shine : b.sheet + 0.75;
  const shineK = (t - shineAt) / (14 * F);
  const letters = (shine: boolean) =>
    LOGO.map((l, i) => {
      const at = letterAt(b, i);
      const u = clamp01((t - at) / (9 * F));
      const s = shine ? 1 : 3 - 2 * POP(u);
      const bl = shine ? 0 : 16 * (1 - SNAP(u));
      // La vague : −30 px, 35 ms d'une lettre à l'autre, un léger gonflement au passage.
      const wv = clamp01((t - (b.wave + i * 2.1 * F)) / (14 * F));
      const bob = wv > 0 && wv < 1 ? -30 * Math.sin(Math.PI * wv) : 0;
      const swell = wv > 0 && wv < 1 ? 1 + 0.06 * Math.sin(Math.PI * wv) : 1;
      const style: CSSProperties = { display: "inline-block", whiteSpace: "pre", transform: `translateY(${bob.toFixed(2)}px) scale(${(s * swell).toFixed(4)})`, opacity: shine ? 1 : t < at ? 0 : clamp01(u * 2.2) };
      const blur = bl > 0.2 ? `blur(${bl.toFixed(2)}px) ` : "";
      if (shine) Object.assign(style, { color: "#FFFFFF", textShadow: "0 0 26px rgba(255,255,255,.95)" });
      else if (l.boost)
        Object.assign(style, {
          backgroundImage: "linear-gradient(170deg, #58F2D8 12%, #C8FFF4 96%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          filter: `${blur}drop-shadow(0 8px 28px rgba(3,28,26,.65)) drop-shadow(0 0 16px ${rgba(PB.mint, 0.3 * breath)})`,
        });
      else
        Object.assign(style, {
          backgroundImage: "linear-gradient(180deg, #FFFFFF 30%, #CFE3E0 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          filter: `${blur}drop-shadow(0 8px 28px rgba(3,28,26,.6))`,
        });
      return (
        <span key={i} style={style}>
          {l.ch}
        </span>
      );
    });
  const p = IN_OUT(clamp01(shineK)) * 130 - 15;
  const band = `linear-gradient(105deg, transparent ${(p - 8).toFixed(1)}%, black ${p.toFixed(1)}%, transparent ${(p + 8).toFixed(1)}%)`;
  return (
    <div style={{ position: "absolute", left: 960, top: y, transform: `translate(-50%, -50%) scale(${sc.toFixed(4)})`, opacity: 1 - out, filter: out > 0.01 ? `blur(${(8 * out).toFixed(2)}px)` : undefined }}>
      {/* Le voile sombre qui détache le logo des rayons, puis un soupçon de lueur menthe. */}
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 1900, height: 840, transform: "translate(-50%, -50%)", opacity: appear * (1 - 0.4 * mv), background: "radial-gradient(ellipse 950px 420px at 50% 50%, rgba(4,34,32,.6), transparent 70%)" }} />
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 1500, height: 600, transform: "translate(-50%, -50%)", background: `radial-gradient(closest-side, ${rgba(PB.mint, 0.1 * breath * appear)}, transparent)` }} />
      <div style={{ position: "relative", whiteSpace: "pre", ...hero(200) }}>{letters(false)}</div>
      {shineK > 0 && shineK < 1 && <div style={{ position: "absolute", inset: 0, whiteSpace: "pre", ...hero(200), opacity: 0.9, WebkitMaskImage: band, maskImage: band }}>{letters(true)}</div>}
    </div>
  );
}

/** Quarante étincelles qui partent des bords des lettres, au reflet. */
function LogoSparks({ t, b }: { t: number; b: Beats }) {
  if (t < b.shine || t > b.shine + 0.7) return null;
  return (
    <>
      {Array.from({ length: 8 }, (_, j) => {
        const top = j % 2 === 0;
        return <Sparks key={j} t={t} at={b.shine + j * F} x={420 + j * 154} y={top ? LOGO_Y - 78 : LOGO_Y + 78} count={5} seed={`S5-etincelle${j}`} speed={680} spread={60} angle={top ? -90 : 90} len={22} life={0.6} color={PB.mint2} />;
      })}
    </>
  );
}

// ---- Le socle lumineux (seg 1 et 2) ---------------------------------------------------------------------------------------

function Pedestal({ t, b, part }: { t: number; b: Beats; part: "back" | "front" }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const appear = prog(t, b.pop + 0.05, 0.3, POP);
  const out = prog(t, b.s3 + 0.06, 0.28, EXIT);
  if (appear <= 0 || out >= 1) return null;
  const rx = lerp(170, 262, prog(t, b.sheet, 0.4, SNAP)) * appear * (1 - 0.7 * out);
  const ry = rx * 0.12;
  const flash = pulse(t, b.land, 2 * F, 0, 0.45) + 0.7 * pulse(t, b.hopLand, 2 * F, 0, 0.4);
  const o = 1 - out;
  const cx = 960;
  const cy = PED_Y;
  if (part === "back") {
    const beam = prog(t, b.sheet, 0.35, SNAP) * o;
    return (
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <defs>
          <radialGradient id={`${id}d`}>
            <stop offset="0" stopColor={PB.mint} stopOpacity={0.45} />
            <stop offset="1" stopColor={PB.mint} stopOpacity={0} />
          </radialGradient>
          <linearGradient id={`${id}b`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor={PB.mint} stopOpacity={0.2} />
            <stop offset="1" stopColor={PB.mint} stopOpacity={0} />
          </linearGradient>
        </defs>
        {beam > 0 && <polygon points={`${cx - rx * 0.92},${cy} ${cx + rx * 0.92},${cy} ${cx + rx * 0.62},${cy - 560} ${cx - rx * 0.62},${cy - 560}`} fill={`url(#${id}b)`} opacity={beam} />}
        <ellipse cx={cx} cy={cy} rx={rx * 1.25} ry={ry * 1.6} fill={`url(#${id}d)`} opacity={o * (0.75 + 0.6 * flash)} />
        <path d={`M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx + rx} ${cy}`} fill="none" stroke={PB.mint} strokeWidth={2.5} opacity={0.7 * o} />
        <ellipse cx={cx} cy={cy} rx={rx * 1.22} ry={ry * 1.22} fill="none" stroke={PB.mint2} strokeWidth={2} strokeDasharray="3 16" strokeDashoffset={-(t - b.D) * 60} opacity={0.45 * o} />
      </svg>
    );
  }
  const rings = [b.land, b.hopLand].map((at) => {
    const p = prog(t, at, 0.45, SNAP);
    return p > 0 && p < 1 ? { p } : null;
  });
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <path d={`M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 0 ${cx + rx} ${cy}`} fill="none" stroke={PB.mint2} strokeWidth={3} opacity={o} style={{ filter: `drop-shadow(0 0 10px ${rgba(PB.mint, 0.9)})` }} />
      {rings.map((r, i) =>
        r ? <ellipse key={i} cx={cx} cy={cy} rx={rx * (1 + 1.2 * r.p)} ry={ry * (1 + 1.2 * r.p)} fill="none" stroke={PB.mint2} strokeWidth={lerp(4, 1, r.p)} opacity={(1 - r.p) * o} /> : null,
      )}
    </svg>
  );
}

// ---- La fiche de personnage (seg 2) ---------------------------------------------------------------------------------------

/** Ce qu'il FAIT (pas son costume) : la visière lit, la tablette connaît le stock, la blouse conseille, le stylo laisse
 * la main. Points mesurés sur le dessin ; cartouches à gauche (x < 600) et à droite (x > 1320), au-dessus de y = 860. */
const LEADERS = [
  { name: "Lit la boîte", n: "01", side: -1, pt: sheetPoint(31, 25), e: [700, 560], end: [608, 560] },
  { name: "Connaît votre stock", n: "02", side: -1, pt: sheetPoint(27, 77), e: [742, 790], end: [608, 790] },
  { name: "Trouve le conseil", n: "03", side: 1, pt: sheetPoint(57.9, 63), e: [1172, 660], end: [1312, 660] },
  { name: "Vous laisse décider", n: "04", side: 1, pt: sheetPoint(65.3, 69.5), e: [1186, 826], end: [1312, 826] },
] as const;
/** Écart entre deux traits (images). */
const LEAD_GAP = 5 * F;

function Leaders({ t, b }: { t: number; b: Beats }) {
  if (t < b.lines - F || t > b.erase + 0.5) return null;
  return (
    <>
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        {LEADERS.map((l, i) => {
          const d = `M ${l.pt[0].toFixed(1)} ${l.pt[1].toFixed(1)} L ${l.e[0]} ${l.e[1]} L ${l.end[0]} ${l.end[1]}`;
          const draw = prog(t, b.lines + i * LEAD_GAP, 10 * F, SNAP);
          const er = prog(t, b.erase + i * 3 * F, 8 * F, IN_OUT);
          const k = draw * (1 - er);
          if (k <= 0.001) return null;
          const ev = evolvePath(k, d);
          const dot = prog(t, b.lines + i * LEAD_GAP, 8 * F, POP) * (1 - er);
          const blink = 0.55 + 0.45 * Math.cos((t - b.lines) * Math.PI * 4);
          const halo = ((t - b.lines - i * 0.1) * 1.6) % 1;
          return (
            <g key={l.name}>
              <path d={d} fill="none" stroke={PB.mint} strokeWidth={2} strokeLinejoin="round" strokeDasharray={ev.strokeDasharray} strokeDashoffset={ev.strokeDashoffset} style={{ filter: `drop-shadow(0 0 6px ${rgba(PB.mint, 0.7)})` }} />
              <circle cx={l.pt[0]} cy={l.pt[1]} r={5 * dot} fill={PB.mint2} opacity={blink} />
              <circle cx={l.pt[0]} cy={l.pt[1]} r={6 + 16 * halo} fill="none" stroke={PB.mint2} strokeWidth={1.5} opacity={(1 - halo) * 0.8 * dot} />
              {draw >= 1 && <circle cx={l.end[0]} cy={l.end[1]} r={3.5 * (1 - er)} fill={PB.mint2} />}
            </g>
          );
        })}
      </svg>
      {LEADERS.map((l, i) => {
        const at = b.lines + i * LEAD_GAP + 7 * F;
        if (t < at) return null;
        const k = prog(t, at, 12 * F, SNAP);
        const ex = prog(t, b.erase + i * 3 * F, 8 * F, IN_OUT);
        if (ex >= 1) return null;
        const pos: CSSProperties = l.side > 0 ? { left: l.end[0] + 10 } : { right: 1920 - l.end[0] + 10 };
        // Le cartouche se déroule depuis le bout du trait, le texte monte dedans.
        const roll = prog(t, at - 2 * F, 12 * F, SNAP);
        return (
          <div
            key={l.name}
            style={{
              position: "absolute",
              top: l.end[1],
              ...pos,
              transform: "translateY(-50%)",
              overflow: "hidden",
              borderRadius: 999,
              padding: "11px 22px",
              background: "rgba(4,30,30,.62)",
              border: `1.5px solid ${rgba(PB.mint, 0.42)}`,
              boxShadow: `0 10px 30px rgba(0,0,0,.3), 0 0 18px ${rgba(PB.mint, 0.18)}`,
              clipPath: l.side > 0 ? `inset(0 ${((1 - roll) * 100).toFixed(1)}% 0 0 round 999px)` : `inset(0 0 0 ${((1 - roll) * 100).toFixed(1)}% round 999px)`,
              opacity: 1 - ex,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexDirection: l.side > 0 ? "row" : "row-reverse", transform: `translateY(${((1 - k) * 120 - ex * 120).toFixed(1)}%)` }}>
              <span style={{ ...digits(17, 700), color: PB.mint2, letterSpacing: "0.06em" }}>{l.n}</span>
              <span style={{ ...label(25), color: "#FFFFFF", whiteSpace: "nowrap" }}>{l.name}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}

/** Les coins de viseur autour du robot pendant la fiche. */
function Corners({ t, b }: { t: number; b: Beats }) {
  const k = prog(t, b.sheet + 0.1, 14 * F, POP);
  const ex = prog(t, b.erase, 10 * F, EXIT);
  if (k <= 0 || ex >= 1) return null;
  const box = { l: 712, r: 1208, t: 452, b: 916 };
  const grow = lerp(1.12, 1, k);
  const cx = 960;
  const cy = (box.t + box.b) / 2;
  const L = 30;
  const pts: [number, number, number, number][] = [
    [box.l, box.t, 1, 1],
    [box.r, box.t, -1, 1],
    [box.l, box.b, 1, -1],
    [box.r, box.b, -1, -1],
  ];
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, opacity: (1 - ex) * clamp01(k * 1.5) }}>
      {pts.map(([x, y, sx, sy], i) => {
        const X = cx + (x - cx) * grow;
        const Y = cy + (y - cy) * grow;
        return <path key={i} d={`M ${X} ${Y + sy * L} L ${X} ${Y} L ${X + sx * L} ${Y}`} fill="none" stroke="rgba(255,255,255,.5)" strokeWidth={2.5} strokeLinecap="round" />;
      })}
    </svg>
  );
}

/** Le badge, sous l'aplomb de « PHARMACIEN » (qui court entre le logo et la tête). */
const BADGE = { x: 1660, y: 476, d: 176 };

function Badge({ t, b, track }: { t: number; b: Beats; track: Track }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (t < b.stamp - F) return null;
  const k = prog(t, b.stamp, 14 * F, POP);
  const out = prog(t, b.erase + 4 * F, 11 * F, IN_OUT);
  if (out >= 1) return null;
  const sc = lerp(1.4, 1, k) * (1 - 0.8 * out);
  const rot = lerp(-30, 0, k) + 60 * out;
  const o = clamp01((t - b.stamp) / (3 * F)) * (1 - out);
  const spin = (t - b.stamp) * 16;
  const R = BADGE.d / 2;
  const rt = 65;
  const circ = 2 * Math.PI * rt;
  return (
    <div style={{ position: "absolute", left: BADGE.x - R, top: BADGE.y - R, width: BADGE.d, height: BADGE.d, transform: `rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(4)})`, opacity: o, filter: `drop-shadow(0 18px 30px rgba(0,0,0,.45)) drop-shadow(0 0 22px ${rgba(PB.mint, 0.35)})` }}>
      <svg width={BADGE.d} height={BADGE.d} viewBox={`0 0 ${BADGE.d} ${BADGE.d}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <defs>
          <path id={`${id}p`} d={`M ${R} ${R} m ${-rt} 0 a ${rt} ${rt} 0 1 1 ${2 * rt} 0 a ${rt} ${rt} 0 1 1 ${-2 * rt} 0`} />
        </defs>
        <circle cx={R} cy={R} r={R - 2} fill="rgba(11,15,20,.88)" stroke={PB.mint} strokeWidth={3} />
        <circle cx={R} cy={R} r={54} fill="none" stroke={rgba(PB.mint, 0.4)} strokeWidth={1.2} />
        <g transform={`rotate(${spin.toFixed(2)} ${R} ${R})`}>
          <text fontFamily={JAKARTA} fontWeight={700} fontSize={18} fill="#FFFFFF">
            <textPath href={`#${id}p`} textLength={circ - 4} lengthAdjust="spacing">
              ROBOT PHARMACIEN •{"\u00A0"}
            </textPath>
          </text>
        </g>
      </svg>
      <div style={{ position: "absolute", left: R - 20, top: R - 19.4 }}>
        <Mascot track={track} t={t} size={40} />
      </div>
    </div>
  );
}

// ---- Le comptoir (seg 3) : écran de caisse NET, vraie vente, capsule, saut ------------------------------------------------

/** La vente en cours sur l'écran de caisse (exemples ; la mention est posée). Pas de médicament du scan de S6 ici. */
const SALE: { name: string; qty: string; price: string; Icon: LucideIcon }[] = [
  { name: "Paracétamol 1 g", qty: "2", price: "2,32 €", Icon: Pill },
  { name: "Spray nasal eau de mer", qty: "1", price: "5,90 €", Icon: Droplets },
  { name: "Pastilles gorge miel-citron", qty: "1", price: "4,50 €", Icon: Candy },
];
const SALE_TOTAL = "12,72 €";
/** Le texte de la vente, à 70 % : la capsule reste la vedette. */
const REG_INK = "rgba(255,255,255,.7)";

function Register({ t, b }: { t: number; b: Beats }) {
  if (t < b.winUp) return null;
  const k = prog(t, b.winUp, 0.5, SNAP);
  const cy = lerp(1330, 600, k);
  const p = plungeP(t, b);
  const sc = lerp(1, 1.15, p);
  const top = cy - 360;
  const tilt = 14 * (1 - k);
  const sheen = ((t - b.winUp) * 0.55) % 1.6;
  const row = (j: number) => prog(t, b.winUp + 0.14 + j * 3 * F, 12 * F, SNAP);
  const cell: CSSProperties = { fontFamily: JAKARTA, fontWeight: 600, fontSize: 30, color: REG_INK, whiteSpace: "nowrap", wordSpacing: "0.08em" };
  const num: CSSProperties = { ...cell, fontVariantNumeric: "tabular-nums", position: "absolute", textAlign: "right" };
  return (
    <div
      style={{
        position: "absolute",
        left: 320,
        top,
        width: 1280,
        height: 720,
        borderRadius: 24,
        overflow: "hidden",
        transformOrigin: `640px ${(600 - top).toFixed(1)}px`,
        transform: `perspective(1600px) rotateX(${tilt.toFixed(2)}deg) scale(${sc.toFixed(4)})`,
        // Net pendant « de votre comptoir » : le flou n'existe qu'à la sortie (plongée).
        filter: p > 0.001 ? `blur(${(8 * p).toFixed(2)}px) brightness(${lerp(1, 0.4, p).toFixed(3)})` : undefined,
        background: "linear-gradient(160deg, rgba(255,255,255,.12) 0%, rgba(255,255,255,.04) 42%, rgba(255,255,255,.07) 100%), rgba(6,18,22,.74)",
        border: "1px solid rgba(255,255,255,.16)",
        boxShadow: "0 30px 80px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.14)",
      }}
    >
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(115deg, transparent ${(sheen * 100 - 30).toFixed(1)}%, rgba(255,255,255,.06) ${(sheen * 100 - 18).toFixed(1)}%, transparent ${(sheen * 100 - 6).toFixed(1)}%)` }} />
      {/* La barre du haut : trois pastilles, l'onglet « Caisse · Comptoir 1 ». La capsule se pose à sa droite. */}
      <div style={{ position: "absolute", left: 0, top: 0, right: 0, height: 52, background: "rgba(255,255,255,.05)", borderBottom: "1px solid rgba(255,255,255,.09)" }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ position: "absolute", left: 22 + i * 20, top: 20, width: 12, height: 12, borderRadius: 6, background: "rgba(255,255,255,.22)" }} />
        ))}
        <div style={{ position: "absolute", left: 92, top: 9, height: 34, padding: "0 16px", borderRadius: 10, background: "rgba(255,255,255,.1)", display: "flex", alignItems: "center", gap: 10, fontFamily: JAKARTA, fontWeight: 700, fontSize: 22, color: "rgba(255,255,255,.92)", whiteSpace: "nowrap" }}>
          Caisse
          <span style={{ color: "rgba(255,255,255,.45)", fontWeight: 600 }}>·</span>
          <span style={{ fontWeight: 600, color: "rgba(255,255,255,.75)" }}>Comptoir 1</span>
          <div style={{ position: "absolute", left: 14, right: 14, bottom: -9, height: 2, borderRadius: 2, background: PB.mint, transform: `scaleX(${prog(t, b.winUp + 0.3, 12 * F, SNAP).toFixed(3)})`, transformOrigin: "0 50%" }} />
        </div>
      </div>
      {/* La vente : en-tête de colonnes, trois lignes, le total. */}
      <div style={{ position: "absolute", left: 80, right: 80, top: 128, opacity: row(0) }}>
        <span style={{ ...label(17), color: "rgba(255,255,255,.42)" }}>Vente en cours</span>
        <span style={{ ...label(17), color: "rgba(255,255,255,.42)", position: "absolute", right: 300 }}>Qté</span>
        <span style={{ ...label(17), color: "rgba(255,255,255,.42)", position: "absolute", right: 0 }}>Prix</span>
      </div>
      {SALE.map((it, j) => {
        const g = row(j + 1);
        return (
          <div key={it.name} style={{ position: "absolute", left: 80, right: 80, top: 172 + j * 74, height: 60, opacity: g, transform: `translateX(${((1 - g) * 60).toFixed(1)}px)`, borderBottom: "1px solid rgba(255,255,255,.08)" }}>
            <div style={{ position: "absolute", left: 0, top: 10, width: 40, height: 40, borderRadius: 10, background: rgba(PB.mint, 0.12), border: `1.5px solid ${rgba(PB.mint, 0.35)}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <it.Icon size={22} strokeWidth={2.2} color={rgba(PB.mint2, 0.85)} />
            </div>
            <span style={{ ...cell, position: "absolute", left: 62, top: 12 }}>{it.name}</span>
            <span style={{ ...num, right: 300, top: 12 }}>×{it.qty}</span>
            <span style={{ ...num, right: 0, top: 12 }}>{it.price}</span>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 80, right: 80, top: 418, height: 60, opacity: row(4) }}>
        <span style={{ ...label(20), color: "rgba(255,255,255,.6)", position: "absolute", left: 0, top: 20 }}>Total</span>
        <span style={{ ...num, fontWeight: 800, fontSize: 40, color: "rgba(255,255,255,.82)", right: 0, top: 6 }}>{SALE_TOTAL}</span>
      </div>
      {/* Le pied : l'état de la vente et le bouton d'encaissement, muets. */}
      <div style={{ position: "absolute", left: 80, top: 520, opacity: 0.8 * row(5), display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 10, height: 10, borderRadius: 5, background: PB.mint }} />
        <span style={{ fontFamily: JAKARTA, fontWeight: 600, fontSize: 22, color: "rgba(255,255,255,.5)" }}>3 articles</span>
      </div>
      <div style={{ position: "absolute", right: 80, top: 504, width: 230, height: 58, borderRadius: 14, background: rgba(PB.mint, 0.16), border: `1.5px solid ${rgba(PB.mint, 0.45)}`, opacity: row(5), display: "flex", alignItems: "center", justifyContent: "center", fontFamily: JAKARTA, fontWeight: 700, fontSize: 24, color: "rgba(255,255,255,.78)" }}>
        Encaisser
      </div>
    </div>
  );
}

const STATUS = "En attente d'une boîte";

function Capsule({ t, b, track }: { t: number; b: Beats; track: Track }) {
  if (t < b.capOpen) return null;
  const p = plungeP(t, b);
  const h = CAP.h * prog(t, b.capOpen, 6 * F, SNAP);
  const wOpen = lerp(CAP.h, CAP.w, prog(t, b.capOpen + 3 * F, 20 * F, POP));
  const w = lerp(wOpen, HANDOFF.w, p);
  const cx = lerp(CAP.x, HANDOFF.x, p);
  const left = cx - w / 2;
  const bump = 0.08 * pulse(t, b.arrive, 4 * F, 0, 14 * F);
  const hs = h * (1 + bump);
  const ws = w * (1 + bump * 0.5);
  const glowA = 0.28 + 0.5 * pulse(t, b.arrive, 2 * F, 0, 0.5);
  const slotX = lerp(left + CAP.h / 2, HANDOFF.headX, p);
  const sweep = prog(t, b.capOpen + 4 * F, 22 * F, IN_OUT);
  const ang = (t * 160) % 360;
  // La tête : elle apparaît sous le flash à l'atterrissage, à la taille de celle de S6.
  const headO = prog(t, b.arrive, 5 * F, LINEAR);
  const headS = lerp(1.3, 1, prog(t, b.arrive, 12 * F, POP)) * (HEAD / 44);
  // La place qui attend le robot : un anneau pointillé qui tourne, éteint à son arrivée.
  const seat = prog(t, b.capOpen + 8 * F, 10 * F, POP) * (1 - prog(t, b.arrive, 4 * F, LINEAR));
  const flash = pulse(t, b.arrive, 2 * F, 0, 0.32);
  // L'état s'écrit, puis ses points battent comme dans S6 (même horloge : le relais ne saute pas).
  const typed = clamp01((t - b.type) / 0.42);
  const n = Math.floor(typed * STATUS.length);
  const dots = typed >= 1 ? ".".repeat(1 + (((Math.floor((t - b.P7) * 4) % 3) + 3) % 3)) : "";
  const statusO = prog(t, b.type - 4 * F, 6 * F, LINEAR);
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: cx - ws / 2,
          top: CAP.y - hs / 2,
          width: ws,
          height: hs,
          borderRadius: 999,
          overflow: "hidden",
          background: "linear-gradient(180deg, #18232D 0%, #0B0F14 52%, #06090C 100%)",
          border: `1.5px solid ${rgba(PB.mint, 0.4)}`,
          boxShadow: `0 0 40px ${rgba(PB.mint, glowA)}, 0 20px 50px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.14)`,
        }}
      >
        {sweep > 0 && sweep < 1 && <div style={{ position: "absolute", inset: 0, background: `linear-gradient(100deg, transparent ${(sweep * 140 - 40).toFixed(1)}%, ${rgba(PB.mint, 0.22)} ${(sweep * 140 - 20).toFixed(1)}%, transparent ${(sweep * 140).toFixed(1)}%)` }} />}
        {/* Le reflet qui court sur le liseré (celui de S6). */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 999,
            padding: 1.5,
            background: `conic-gradient(from ${ang.toFixed(1)}deg, transparent 0deg, ${rgba(PB.mint2, 0.9)} 30deg, transparent 70deg, transparent 180deg, ${rgba(PB.mint2, 0.5)} 210deg, transparent 250deg)`,
            WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
          }}
        />
        {flash > 0 && <div style={{ position: "absolute", left: slotX - (cx - ws / 2) - 120, top: hs / 2 - 120, width: 240, height: 240, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,.9) 0%, rgba(230,255,249,.4) 35%, transparent 70%)", opacity: flash }} />}
      </div>
      {seat > 0.01 && (
        <svg width={120} height={120} style={{ position: "absolute", left: slotX - 60, top: CAP.y - 60, overflow: "visible", opacity: seat }}>
          <circle cx={60} cy={60} r={42 * (0.8 + 0.2 * seat)} fill={rgba(PB.mint, 0.08)} stroke={PB.mint2} strokeWidth={2.5} strokeDasharray="6 9" strokeLinecap="round" transform={`rotate(${((t - b.capOpen) * 120).toFixed(1)} 60 60)`} />
        </svg>
      )}
      {statusO > 0 && (
        <div style={{ position: "absolute", left: slotX + 78, top: CAP.y - 16, height: 32, display: "flex", alignItems: "center", gap: 12, opacity: statusO }}>
          <div style={{ width: 10, height: 10, borderRadius: 5, background: PB.mint, boxShadow: `0 0 ${(10 + 8 * Math.sin(t * 6)).toFixed(1)}px ${PB.mint}` }} />
          <span style={{ fontFamily: JAKARTA, fontWeight: 600, fontSize: 26, color: "rgba(255,255,255,.62)", whiteSpace: "pre" }}>
            {STATUS.slice(0, n)}
            {dots}
            {typed < 1 && <span style={{ display: "inline-block", width: 2, height: 26, marginLeft: 2, verticalAlign: "-4px", background: PB.mint2, opacity: Math.floor(t * 8) % 2 === 0 ? 1 : 0.2 }} />}
          </span>
        </div>
      )}
      {headO > 0 && (
        <div style={{ position: "absolute", left: slotX - 22, top: CAP.y - 20, width: 44, height: 40, transform: `scale(${headS.toFixed(4)})`, opacity: headO }}>
          <Mascot track={track} t={t} size={44} />
        </div>
      )}
    </>
  );
}

/** « Sur l'écran de votre caisse » : l'étiquette menthe au-dessus de l'écran, et sa flèche vers la capsule. */
function CaisseTag({ t, b }: { t: number; b: Beats }) {
  if (t < b.tag) return null;
  const out = prog(t, b.plunge, 8 * F, EXIT);
  if (out >= 1) return null;
  const k = prog(t, b.tag, 14 * F, SNAP);
  const draw = prog(t, b.tag + 5 * F, 14 * F, IN_OUT);
  const d = "M 1084 140 C 1036 140 1004 154 996 184";
  const ev = evolvePath(draw, d);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: 1 - out }}>
      <div style={{ position: "absolute", right: 1920 - 1600, top: 128, transform: `translateY(-50%) translateX(${((1 - k) * 40).toFixed(1)}px)`, opacity: k, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 9, height: 9, borderRadius: 5, background: PB.mint2, boxShadow: `0 0 12px ${PB.mint}` }} />
        <span style={{ ...label(24), color: PB.mint2, whiteSpace: "nowrap", textShadow: "0 2px 14px rgba(0,0,0,.45)" }}>Sur l'écran de votre caisse</span>
      </div>
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <path d={d} fill="none" stroke={PB.mint2} strokeWidth={3} strokeLinecap="round" strokeDasharray={ev.strokeDasharray} strokeDashoffset={ev.strokeDashoffset} style={{ filter: `drop-shadow(0 0 6px ${rgba(PB.mint, 0.8)})` }} />
        {draw >= 0.98 && <path d="M 984 174 L 996 190 L 1006 172" fill="none" stroke={PB.mint2} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
    </div>
  );
}

/** La mention « Illustration · exemples » tant que l'écran de caisse montre des prix ; l'orchestrateur la reprend à P7 − 0,3. */
function LocalMention({ t, b }: { t: number; b: Beats }) {
  const o = clamp01((t - b.mention) / (8 * F)) * (1 - clamp01((t - b.mentionOut) / (8 * F)));
  if (o <= 0) return null;
  return <div style={{ position: "absolute", ...MENTION_POS, fontFamily: JAKARTA, fontWeight: 600, fontSize: 22, color: "rgba(255,255,255,.55)", opacity: o, letterSpacing: "0.01em", textShadow: "0 1px 6px rgba(0,0,0,.45)" }}>{MENTION_TEXT}</div>;
}

/** La traînée pointillée menthe du saut ; la queue rattrape la tête à l'arrivée. */
function Trail({ t, b }: { t: number; b: Beats }) {
  if (t < b.jump || t > b.arrive + 0.4) return null;
  const ub = JUMP_EASE(clamp01((t - b.jump) / (b.arrive - b.jump)));
  const ua = prog(t, b.arrive - 0.05, 0.32, SNAP);
  if (ub - ua < 0.01) return null;
  const pts = Array.from({ length: 48 }, (_, i) => arcAt(lerp(ua, ub, i / 47)))
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  // Des scintillements semés le long de la traînée, qui s'allument au passage du robot puis s'éteignent.
  const tw = Array.from({ length: 7 }, (_, i) => {
    const ui = (i + 0.6) / 8;
    const born = b.jump + (b.arrive - b.jump) * ui;
    const k = (t - born) / 0.32;
    if (k <= 0 || k >= 1 || ui < ua) return null;
    const [x, y] = arcAt(ui);
    const off = (hash("S5-scintille", i) - 0.5) * 36;
    const sc = Math.sin(Math.PI * k) * (0.7 + 0.5 * hash("S5-scintille", i + 9));
    return { x: x + off, y: y + off * 0.6, sc, rot: 90 * k };
  });
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={PB.mint} strokeWidth={3} strokeDasharray="2 12" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${rgba(PB.mint, 0.85)})` }} />
      {tw.map((s, i) =>
        s ? <path key={i} d="M 0 -9 L 2 -2 L 9 0 L 2 2 L 0 9 L -2 2 L -9 0 L -2 -2 Z" fill={PB.mint2} transform={`translate(${s.x.toFixed(1)} ${s.y.toFixed(1)}) rotate(${s.rot.toFixed(1)}) scale(${s.sc.toFixed(3)})`} style={{ filter: `drop-shadow(0 0 6px ${rgba(PB.mint, 0.9)})` }} /> : null,
      )}
    </svg>
  );
}

// ---- Les couches ------------------------------------------------------------------------------------------------------------

/** Le fond (monde de couleur, grille, rayons, mot contour) : hors du flou de mouvement (les dégradés y feraient des bandes). */
function BackStatic({ t, b }: { t: number; b: Beats }) {
  const fid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const c = cam(t, b);
  const act1 = t < b.D;
  return (
    <AbsoluteFill>
      {/* Le contour de « PHARMACIEN » : dilatation de la lettre pleine moins la lettre (pas de traits parasites aux
          recouvrements de contours de la police, comme avec -webkit-text-stroke), plus un voile blanc à 6 %. */}
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <filter id={`${fid}o`} x="-5%" y="-25%" width="110%" height="150%" colorInterpolationFilters="sRGB">
          <feMorphology in="SourceAlpha" operator="dilate" radius={3} result="d" />
          <feComposite in="d" in2="SourceAlpha" operator="out" result="ring" />
          <feFlood floodColor={PB.mint} floodOpacity={0.55} />
          <feComposite in2="ring" operator="in" result="stroke" />
          <feFlood floodColor="#FFFFFF" floodOpacity={0.06} />
          <feComposite in2="SourceAlpha" operator="in" result="fill" />
          <feMerge>
            <feMergeNode in="fill" />
            <feMergeNode in="stroke" />
          </feMerge>
        </filter>
      </svg>
      <Camera t={t} {...c} depth={0.3}>
        <AbsoluteFill style={{ transform: "scale(1.06)" }}>
          <ColorWorld t={t} b={b} />
        </AbsoluteFill>
      </Camera>
      <DotGrid t={t} opacity={act1 ? 0.04 : lerp(0.14, 0.08, prog(t, b.D + 0.4, 0.8, IN_OUT))} wave={{ at: b.D, x: 960, y: 540, speed: 2400, width: 280 }} />
      <Camera t={t} {...c} depth={0.6}>
        <Rays t={t} b={b} />
        {t >= b.sheet && (
          // Entre le logo et la tête du robot, entier et lisible : contour 3 px à 55 %, voile blanc à 6 %, dérive qui
          // accélère de 26 à 110 px/s.
          <Word
            t={t}
            at={b.sheet + 0.04}
            text="PHARMACIEN"
            x={1000 - 26 * (t - b.sheet) - 42 * (t - b.sheet) * (t - b.sheet)}
            y={334}
            size={138}
            tracking="0.1em"
            color="#FFFFFF"
            style={{ filter: `url(#${fid}o)` }}
            enter="slide"
            stagger={1.2}
            exit="slice"
            exitAt={b.erase}
          />
        )}
      </Camera>
    </AbsoluteFill>
  );
}

function Back({ t, b, host }: { t: number; b: Beats; host: Track }) {
  const c = cam(t, b);
  return (
    <AbsoluteFill>
      <Camera t={t} {...c}>
        <Shock t={t} b={b} />
        <Logo t={t} b={b} />
        <Pedestal t={t} b={b} part="back" />
        <Register t={t} b={b} />
        <Capsule t={t} b={b} track={host} />
        <Trail t={t} b={b} />
      </Camera>
    </AbsoluteFill>
  );
}

function Front({ t, b, badge }: { t: number; b: Beats; badge: Track }) {
  const c = cam(t, b);
  return (
    <AbsoluteFill>
      <Camera t={t} {...c}>
        <Pedestal t={t} b={b} part="front" />
        <DustPuffs t={t} b={b} />
        <Corners t={t} b={b} />
        <Leaders t={t} b={b} />
        <Badge t={t} b={b} track={badge} />
        <Burst t={t} at={b.stamp} x={BADGE.x} y={BADGE.y} count={14} radius={150} seed="S5-tampon" colors={[PB.mint, PB.mint2, "#FFFFFF"]} size={12} life={0.5} />
        <Ring t={t} at={b.stamp} x={BADGE.x} y={BADGE.y} max={320} color={PB.mint2} width={3} life={0.45} />
        <Ring t={t} at={b.capOpen} x={CAP.x} y={CAP.y} max={520} color={rgba(PB.mint2, 0.7)} width={2} life={0.4} echo={false} />
        <Ring t={t} at={b.arrive} x={SLOT.x} y={SLOT.y} max={180} color={PB.mint2} width={3} life={0.4} />
        <Burst t={t} at={b.arrive} x={SLOT.x} y={SLOT.y} count={10} radius={90} seed="S5-capsule" colors={[PB.mint, "#FFFFFF"]} size={9} life={0.45} />
        <LogoSparks t={t} b={b} />
        <CaisseTag t={t} b={b} />
        <ShardLayer t={t} b={b} />
      </Camera>
      {t >= b.D && (
        <Camera t={t} {...c} depth={1.6} blur={1.2}>
          <Dust t={t} count={26} seed="S5-bokeh" color={PB.mint2} size={[2, 6]} alpha={0.32 * prog(t, b.D, 0.5)} speed={0.05} />
        </Camera>
      )}
      <Flare t={t} b={b} />
    </AbsoluteFill>
  );
}

function Flash({ t, b }: { t: number; b: Beats }) {
  const o = keys(t, [
    [b.D - 1e-4, 0],
    [b.D, 0.9, LINEAR],
    [b.D + F, 0.5, LINEAR],
    [b.D + 3 * F, 0, LINEAR],
  ]);
  if (o <= 0) return null;
  return <AbsoluteFill style={{ background: "#FFFFFF", opacity: o }} />;
}

export function Scene05({ t, time }: SceneProps) {
  const b = beats(time);
  const host = hostTrack(b);
  const badge = badgeTrack(b);
  const heavy = (t >= b.D && t < b.D + 0.4) || (t >= b.plunge && t < b.plunge + 13 * F);
  const robotFast = (t >= b.D && t < b.D + 12 * F) || (t >= b.pop && t < b.peak) || (t >= b.jump && t < b.arrive);
  const fade = 1 - prog(t, b.plunge + 11 * F, 3 * F, LINEAR);
  return (
    <AbsoluteFill style={{ background: INK, opacity: fade }}>
      <BackStatic t={t} b={b} />
      <MotionBlur on={heavy}>{(tt) => <Back t={tt} b={b} host={host} />}</MotionBlur>
      <MotionBlur on={heavy || robotFast}>
        {(tt) => (
          <Camera t={tt} {...cam(tt, b)}>
            <Robot t={tt} b={b} track={host} />
          </Camera>
        )}
      </MotionBlur>
      <MotionBlur on={heavy}>{(tt) => <Front t={tt} b={b} badge={badge} />}</MotionBlur>
      <Flash t={t} b={b} />
      <LocalMention t={t} b={b} />
    </AbsoluteFill>
  );
}

/** Les effets sonores de la scène (secondes du film). La musique M2 démarre EXACTEMENT au DROP (sound.tsx). */
export const cues: SceneCues = (time) => {
  const b = beats(time);
  return [
    cue("impact_reveal", b.D, 1),
    cue("whoosh_heavy", b.D, 0.5, 1.2),
    // Le départ du bond tombe sur « Boost » : à peine audible ; l'atterrissage, lui, suit le mot.
    cue("robot_boing", b.pop, 0.22),
    cue("robot_boing", b.land, 0.45, 1.15),
    cue("sparkle_shimmer", b.shine, 0.4),
    cue("whoosh_fast", b.logoUp, 0.3, 1.1),
    cue("robot_boing", b.sheet, 0.32, 1.1),
    ...LEADERS.map((_, i) => cue("ui_click", b.lines + i * LEAD_GAP + 8 * F, 0.3)),
    cue("stamp_slam", b.stamp, 0.4, 1.3),
    // « de votre comptoir » : rien ne doit couvrir la voix.
    cue("whoosh_fast", b.winUp, 0.25, 0.9),
    cue("ui_pop", b.capOpen, 0.2),
    cue("whoosh_fast", b.jump, 0.25),
    cue("ui_pop", b.arrive, 0.42, 1.15),
    cue("whoosh_heavy", b.plunge, 0.6),
  ];
};
