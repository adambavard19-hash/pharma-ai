import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { noise2D } from "@remotion/noise";
import { Users } from "lucide-react";
import {
  ACT1,
  Camera,
  DotGrid,
  Dust,
  EXIT,
  F,
  IN_OUT,
  LINEAR,
  MotionBlur,
  Odometer,
  POP,
  SNAP,
  WHIP,
  clamp01,
  cue,
  digits,
  every,
  hash,
  hero,
  keys,
  label,
  lerp,
  prog,
  pulse,
  rgba,
  rnd,
  type Shake,
} from "./kit";
import type { Time } from "./time";
import type { SceneCues, SceneProps } from "./types";

/* ==========================================================================
 * S1 · La cadence — voix P1 (« Au comptoir, tout va très vite. ») et P2 (« Une boîte. Une autre. La file s'allonge. »).
 * Fenêtre : time.win.S1 (0 → P3.start). Direction : DIRECTION-PRESENTATION.json → buildNotes « S1 ».
 *
 *   0,00 → 0,55   croix néon GRISE qui s'allume par à-coups (tube éteint visible, halo, poussière, trait anamorphique)
 *   0,55 → 0,78   PLONGÉE dans la croix (zoom 1 → 18, WHIP, flou de mouvement) : la barre remplit le cadre…
 *   0,78          … et s'écrase en LIGNE DU COMPTOIR (y 640, x 160 → 1760) avec un éclat qui court sur la ligne
 *   A(P1,0)       COMPTOIR sort de la ligne (masque, lettres à 2 images) + reflet à 15 % ; horloge 08:59 qui s'emballe
 *   A(P1,1)       COMPTOIR part en 3 tranches ; TRÈS VITE en fouet (penché, étiré, accordéon), lignes de vitesse,
 *                 compteur de CADENCE dont l'aiguille claque dans le corail ; la ligne descend à 700 et devient TAPIS
 *   P2 « boîte »  BOÎTE 1 : chute étirée, écrasement, rebond, ombre, poussière ; compteur BOÎTES 01
 *   P2 « autre »  UNE AUTRE en écho stroboscopique ; pluie de boîtes (12, 12, 6, 6, 6, 3… images) qui s'empilent ;
 *                 compteur jusqu'à 17 ; panoramique + roulis ±0,6°
 *   P2 « file »   travelling arrière (zoom → .55) : 14 silhouettes qui piétinent en S jusqu'hors champ, bulles « … »,
 *                 ticket N° 042 → 057 qui se balance, jauge ATTENTE corail
 *   Sortie        tout se compresse en BARRE 600×24 (960, 540), qui saute et retombe ; fondu de relais sur les
 *                 0,05 s communes avec S2 (dont la barre est identique, au même endroit)
 *
 * Couleurs de l'acte 1 seulement (gris sur encre, corail d'alerte). Aucun mot interdit, aucun prénom.
 * ======================================================================== */

const V = 900; // vitesse du tapis, px/s (monde)
const LINE_Y = 640;
const BELT_Y = 700;
const BELT_END = 1760;
const BOX_W = 140;
const BOX_H = 90;
const ORIGIN: [number, number] = [960, 600];
/** Position de la ligne de base dans une ligne de texte de hauteur 1em (Plus Jakarta Sans), réglée à l'œil. */
const ASC = 0.93;
const G = ACT1;

/* --------------------------------------------------------------------------
 * ANCRAGES
 * ------------------------------------------------------------------------ */

function anchorsOf(time: Time) {
  const p1 = time.A("P1", 0);
  const tres = time.A("P1", 1);
  const p1end = time.Z("P1");
  const p2 = time.A("P2", 0);
  let autre = time.A("P2", 1);
  let file = time.A("P2", 2);
  // GARDE-FOU : la courte pause après « Une boîte. » (0,11 s) passe sous MIN_PAUSE ; le calage des segments accroche
  // alors « Une autre » à la pause suivante (qui précède en réalité « La file »). Symptôme : un 1er segment de plus
  // de 1,25 s suivi d'un 2e de moins de 0,55 s. On recale alors sur la voix réelle (mesurée : « Une autre » à 52 %
  // du temps qui sépare « Une boîte » de « La file »). Si la timeline est corrigée, ce bloc ne s'applique plus.
  if (autre - p2 > 1.25 && file - autre < 0.55) {
    file = autre;
    autre = p2 + 0.52 * (file - p2);
  }
  const p2end = time.Z("P2");
  const p3 = time.A("P3", 0);
  const plunge = 0.55;
  const lineAt = plunge + 14 * F;
  const tresIn = tres + 0.08;
  const tresLand = tresIn + 12 * F;
  const tresOut = Math.max(tresLand + 0.4, p1end + 0.04);
  const box1Fall = p2 - 0.1;
  const sq0 = Math.min(p2end + 0.05, p3 - 0.46);
  const sqEnd = sq0 + 10 * F;
  const handoff = time.win.S2.start;
  const hopLand = Math.min(handoff - 0.075, sqEnd + 0.17);
  return {
    p1,
    tres,
    p1end,
    p2,
    autre,
    file,
    p2end,
    p3,
    plunge,
    lineAt,
    tresIn,
    tresLand,
    tresOut,
    gauge: tres + 0.2,
    belt: tres + 0.3,
    box1Fall,
    clock0: p1 + 0.12,
    sq0,
    sqEnd,
    hopLand,
    handoff,
    end: time.win.S1.end,
  };
}
type Anchors = ReturnType<typeof anchorsOf>;

const inRange = (t: number, a: number, b: number) => t >= a && t <= b;

/* --------------------------------------------------------------------------
 * CAMÉRA DU MONDE
 * ------------------------------------------------------------------------ */

function zoomAt(t: number, a: Anchors) {
  return keys(t, [
    [a.lineAt, 1],
    [a.p2, 1.03, LINEAR],
    [a.box1Fall + 0.3, 1.032, LINEAR],
    [a.box1Fall + 0.75, 1.085, SNAP],
    [a.autre, 1.09, LINEAR],
    [a.autre + 0.45, 1.035, IN_OUT],
    [a.file, 1.035, LINEAR],
    [a.file + 24 * F, 0.55, IN_OUT],
    [a.sq0, 0.565, LINEAR],
  ]);
}

function panAt(t: number, a: Anchors) {
  const u = Math.max(0, Math.min(t, a.sq0) - a.autre);
  // départ adouci (0,2 s), puis −120 px/s
  return -120 * (u < 0.2 ? (u * u) / 0.4 : u - 0.1);
}

type Cam = { x: number; y: number; zoom: number; rot: number; origin: [number, number]; shakes: Shake[] };

function worldCam(t: number, a: Anchors, boxes: Box[]): Cam {
  const rollK = prog(t, a.autre, 0.3, SNAP) * (1 - prog(t, a.sq0, 8 * F, SNAP));
  const shakes: Shake[] = [{ at: a.tresLand, amp: 12, frames: 12 }, { at: a.p2 + 0.02 + 5 * F, amp: 7, frames: 10 }];
  boxes.forEach((b, i) => shakes.push(i === 0 ? { at: b.land, amp: 9, frames: 12 } : { at: b.land, amp: b.land > a.file ? 1.5 : 2.5, frames: 8 }));
  return {
    x: panAt(t, a),
    y: 0,
    zoom: zoomAt(t, a),
    rot: 0.6 * rollK * Math.sin(2 * Math.PI * 1.5 * (t - a.autre)),
    origin: ORIGIN,
    shakes,
  };
}

/* --------------------------------------------------------------------------
 * LES BOÎTES — horaire d'atterrissage, place sur le tapis, empilement (calculés, déterministes)
 * ------------------------------------------------------------------------ */

type Box = { k: number; fall: number; land: number; wx: number; s: number; level: number; y0: number; tilt: number; twin: boolean };

function boxesOf(a: Anchors): Box[] {
  // boîte 1 seule sur « Une boîte. », puis PLUIE dès « Une autre » : une boîte toutes les 4 à 6 images jusqu'à la
  // compression (≈ 24 sur le tapis, + 4 au premier plan — ForeBoxes)
  // + de temps en temps une 2e boîte 2 images après (doublé, muet) pour épaissir l'averse
  const lands = [a.box1Fall + 0.3];
  const twin = new Set<number>();
  let L = a.autre + 0.1;
  for (let k = 1; L < a.sq0 - 0.12; k++) {
    lands.push(L);
    if (k > 2 && hash("S1-dbl", k) < 0.32) {
      twin.add(lands.length);
      lands.push(L + 2 * F);
    }
    L += (k === 1 ? 7 : 4 + Math.floor(hash("S1-gap", k) * 3)) * F;
  }
  const out: Box[] = [];
  lands.forEach((land, k) => {
    const Z = zoomAt(land, a);
    const pan = panAt(land, a);
    const fallDur = k === 0 ? 0.3 : 0.24;
    const target = k === 0 ? 1150 : land < a.file ? rnd("S1-box", k, 660, 1420) : rnd("S1-box", k, 420, 1040);
    let s = 960 + (target - 960 - pan) / Z + V * land; // coordonnée « tapis » (constante une fois posée)
    let level = 0;
    for (let attempt = 0; attempt < 5; attempt++) {
      const under = out.filter((b) => Math.abs(b.s - s) < BOX_W - 16);
      if (!under.length) {
        level = 0;
        break;
      }
      const top = under.reduce((m, b) => (b.level > m.level ? b : m));
      if (top.level < 2) {
        level = top.level + 1;
        s = top.s + rnd("S1-jit", k, -12, 12);
        break;
      }
      s += BOX_W + 40;
    }
    const visibleTop = ORIGIN[1] - ORIGIN[1] / Z;
    out.push({ k, fall: land - fallDur, land, wx: s - V * land, s, level, y0: k === 0 ? -30 : visibleTop - 40, tilt: rnd("S1-tilt", k, -9, 9), twin: twin.has(k) });
  });
  return out;
}

const boxCount = (t: number, boxes: Box[]) => boxes.reduce((n, b) => n + clamp01((t - b.land) / (2 * F)), 0);

/* --------------------------------------------------------------------------
 * LA FILE — 14 silhouettes sur une LIGNE DE SOL horizontale (y = tapis), qui rapetissent et s'éteignent avec la
 * distance (perspective : l'écart se resserre aussi), vers un point de fuite au bout. La plus lointaine reste à
 * x ≤ 1840 à l'écran une fois le travelling arrière fini.
 * ------------------------------------------------------------------------ */

const GROUND_Y = BELT_Y;
const QUEUE_X0 = 1900;
const VP: [number, number] = [2960, GROUND_Y];
const QUEUE = (() => {
  const out: { x: number; y: number; s: number }[] = [];
  let x = QUEUE_X0;
  for (let i = 0; i < 14; i++) {
    const s = 1 / (1 + 0.1 * i);
    out.push({ x, y: GROUND_Y, s });
    x += 104 * s;
  }
  return out;
})();

/* --------------------------------------------------------------------------
 * LA SCÈNE
 * ------------------------------------------------------------------------ */

export function Scene01({ t: tScene, time }: SceneProps) {
  const a = anchorsOf(time);
  const boxes = boxesOf(a);
  const blurOn =
    inRange(tScene, a.plunge + 3 * F, a.lineAt + 2 * F) ||
    inRange(tScene, a.tresIn, a.tresLand + 3 * F) ||
    inRange(tScene, a.tresOut, a.tresOut + 12 * F) ||
    inRange(tScene, a.box1Fall + 0.12, a.box1Fall + 0.3 + F) ||
    inRange(tScene, a.sq0, a.sqEnd + 2 * F);
  // Relais : sur les 0,05 s communes avec S2, la scène s'efface (S2 a la même barre au même endroit, dessous).
  const fade = 1 - prog(tScene, a.handoff, a.end - a.handoff, LINEAR);
  // Le fond et la grille restent HORS du flou : le flou additionne des couches à 1/n d'opacité, ce qui quantifie
  // l'encre (#0B0F14 → #081010) et ferait virer le fond au vert sur les images floutées.
  return (
    <AbsoluteFill style={{ opacity: fade, background: G.ink }}>
      <DotGrid t={tScene} opacity={time.look(tScene).dots} />
      {/* arrière-plan (dégradés très doux) : hors du flou lui aussi, pour éviter les anneaux de quantification */}
      {tScene >= a.lineAt && (
        <Camera t={tScene} {...worldCam(tScene, a, boxes)} depth={0.3} blur={2}>
          <FarLayer t={tScene} a={a} boxes={boxes} />
        </Camera>
      )}
      <MotionBlur on={blurOn} samples={inRange(tScene, a.plunge, a.lineAt + 2 * F) ? 12 : 8}>
        {(t) => <Frame t={t} a={a} boxes={boxes} time={time} />}
      </MotionBlur>
      {/* boîtes de PREMIER PLAN (×2,5) qui traversent le cadre sur « Une autre » : leur propre flou de mouvement */}
      <MotionBlur on={FORE.some((f) => inRange(tScene, a.autre + f.d - F, a.autre + f.d + f.dur + F))} samples={10} shutter={260}>
        {(t) => <ForeBoxes t={t} a={a} />}
      </MotionBlur>
    </AbsoluteFill>
  );
}

function Frame({ t, a, boxes, time }: { t: number; a: Anchors; boxes: Box[]; time: Time }) {
  const cam = worldCam(t, a, boxes);
  const pre = t < a.lineAt;
  const hudCam = { x: cam.x, rot: cam.rot, shakes: cam.shakes, origin: ORIGIN };
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {pre ? (
        <CrossWorld t={t} a={a} />
      ) : (
        <>
          <Squeeze t={t} a={a}>
            <Camera t={t} {...cam}>
              <Floor t={t} a={a} />
              <Belt t={t} a={a} />
              <Comptoir t={t} a={a} />
              <TresVite t={t} a={a} />
              <Queue t={t} a={a} />
            </Camera>
            <Camera t={t} {...cam} depth={0.6}>
              <UneBoite t={t} a={a} />
              <UneAutre t={t} a={a} />
            </Camera>
            <Camera t={t} {...cam}>
              <Boxes t={t} a={a} boxes={boxes} />
            </Camera>
          </Squeeze>
        </>
      )}
      <CollapseBand t={t} a={a} />
      <Camera t={t} {...hudCam} depth={1.6}>
        <FrontLayer t={t} a={a} />
      </Camera>
      <Camera t={t} {...hudCam} depth={0.3}>
        <Hud t={t} a={a} boxes={boxes} />
      </Camera>
      <HandoffBar t={t} a={a} />
    </AbsoluteFill>
  );
}

/* --------------------------------------------------------------------------
 * 0 → 0,78 · LA CROIX NÉON GRISE, PUIS LA PLONGÉE
 * ------------------------------------------------------------------------ */

function neonFlicker(t: number) {
  const f = t * 60;
  if (f < 18) return keys(f, [[0, 0], [4, 1, LINEAR], [7, 0.3, LINEAR], [10, 1, LINEAR], [14, 0.5, LINEAR], [18, 1, LINEAR]]);
  // le néon bourdonne : petites baisses au bruit, une saute à l'image 27
  const dip = f >= 27 && f < 29 ? 0.35 : 0;
  return 1 - dip - 0.07 * (0.5 + 0.5 * noise2D("S1-neon", t * 14, 0));
}

function CrossShape({ fill, stroke, strokeWidth = 0 }: { fill: string; stroke?: string; strokeWidth?: number }) {
  return (
    <>
      <rect x={850} y={434} width={220} height={72} rx={14} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <rect x={924} y={360} width={72} height={220} rx={14} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
    </>
  );
}

function CrossWorld({ t, a }: { t: number; a: Anchors }) {
  // zoom géométrique (vitesse perçue régulière), avec la courbe WHIP sur l'exposant
  const zoom = t < a.plunge ? lerp(1, 1.045, t / a.plunge) : Math.exp(lerp(Math.log(1.045), Math.log(18), prog(t, a.plunge, a.lineAt - a.plunge, WHIP)));
  const fl = neonFlicker(t);
  const cx = 960;
  const cy = 470;
  return (
    <Camera t={t} zoom={zoom} origin={[cx, cy]}>
      {/* lumière diffuse du néon */}
      <div style={{ position: "absolute", left: cx - 620, top: cy - 620, width: 1240, height: 1240, borderRadius: "50%", background: `radial-gradient(circle, ${rgba(G.g4, 0.13 * fl)} 0%, ${rgba(G.g4, 0.04 * fl)} 40%, transparent 70%)` }} />
      {/* trait anamorphique */}
      <div style={{ position: "absolute", left: cx - 820, top: cy - 1, width: 1640, height: 2, background: `linear-gradient(90deg, transparent, ${rgba("#E6EBF0", 0.38 * fl)} 50%, transparent)` }} />
      <div style={{ position: "absolute", left: cx - 560, top: cy - 9, width: 1120, height: 18, filter: "blur(8px)", background: `linear-gradient(90deg, transparent, ${rgba("#E6EBF0", 0.12 * fl)} 50%, transparent)` }} />
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <defs>
          <linearGradient id="S1-neon-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F1F4F7" />
            <stop offset="0.55" stopColor="#D3DAE2" />
            <stop offset="1" stopColor="#AEB8C4" />
          </linearGradient>
        </defs>
        {/* le tube éteint reste visible */}
        <CrossShape fill={G.g1} stroke={G.g2} strokeWidth={2} />
        <g opacity={fl} style={{ filter: `drop-shadow(0 0 30px ${rgba(G.g4, 0.45)}) drop-shadow(0 0 8px ${rgba("#FFFFFF", 0.35)})` }}>
          <CrossShape fill="url(#S1-neon-fill)" />
        </g>
        {/* reflet de tube : liseré intérieur */}
        <g opacity={0.55 * fl}>
          <rect x={862} y={442} width={196} height={6} rx={3} fill="#FFFFFF" opacity={0.55} />
          <rect x={932} y={370} width={6} height={200} rx={3} fill="#FFFFFF" opacity={0.4} />
        </g>
      </svg>
      {/* poussière dans le halo (rayon 260) */}
      {Array.from({ length: 30 }, (_, i) => {
        const ang = hash("S1-dust-a", i) * Math.PI * 2 + 0.6 * noise2D("S1-dust", i * 0.7, t * 0.25);
        const r = 60 + 200 * Math.sqrt(hash("S1-dust-r", i)) + 30 * noise2D("S1-dust-r", i * 1.3, t * 0.3);
        const s = 1 + 2 * hash("S1-dust-s", i);
        const tw = 0.55 + 0.45 * Math.sin(t * (2 + 3 * hash("S1-dust-t", i)) + i);
        return <div key={i} style={{ position: "absolute", left: cx + Math.cos(ang) * r, top: cy + Math.sin(ang) * r, width: s, height: s, borderRadius: "50%", background: "#FFFFFF", opacity: 0.25 * tw * (0.3 + 0.7 * fl) }} />;
      })}
    </Camera>
  );
}

/** La barre qui remplit le cadre s'écrase en ligne du comptoir (raccord de forme). Écran, hors caméra. */
function CollapseBand({ t, a }: { t: number; a: Anchors }) {
  if (t < a.lineAt - 0.5 * F || t > a.lineAt + 14 * F) return null;
  const k = prog(t, a.lineAt, 9 * F, SNAP);
  const top = lerp(-40, LINE_Y - 1.5, k);
  const bottom = lerp(1120, LINE_Y + 1.5, k);
  const left = lerp(-60, 160, k);
  const right = lerp(1980, BELT_END, k);
  const op = 1 - prog(t, a.lineAt + 9 * F, 5 * F, LINEAR);
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: right - left,
        height: bottom - top,
        borderRadius: lerp(0, 2, k),
        background: k < 0.6 ? "linear-gradient(180deg, #F1F4F7, #C9D1DA)" : G.g4,
        boxShadow: `0 0 ${lerp(120, 26, k)}px ${rgba(G.g4, 0.55)}`,
        opacity: op,
      }}
    />
  );
}

/* --------------------------------------------------------------------------
 * ARRIÈRE-PLAN (parallaxe .3) : grand cadran fantôme qui file, bokeh gris
 * ------------------------------------------------------------------------ */

function minutesAt(t: number, a: Anchors) {
  const n = Math.max(0, Math.floor((t - a.clock0) / (4 * F)));
  const within = t < a.clock0 ? 1 : SNAP(clamp01((t - a.clock0 - n * 4 * F) / (2.2 * F)));
  return { m: 539 + n, n, p: n === 0 ? 1 : within };
}

function FarLayer({ t, a, boxes }: { t: number; a: Anchors; boxes: Box[] }) {
  const k = prog(t, a.lineAt, 0.5, SNAP);
  const out = 1 - prog(t, a.sq0, 8 * F, EXIT);
  const { m, p } = minutesAt(t, a);
  const mm = m - 1 + p;
  const cx = 960;
  const cy = 470;
  const R = 520;
  return (
    <AbsoluteFill style={{ opacity: k * out }}>
      {/* bokeh */}
      {Array.from({ length: 9 }, (_, i) => {
        const r = rnd("S1-bokeh-r", i, 40, 130);
        const x = rnd("S1-bokeh-x", i, -100, 2020) + 40 * noise2D("S1-bokeh", i, t * 0.2);
        const y = rnd("S1-bokeh-y", i, 80, 1000) + 30 * noise2D("S1-bokeh", i + 9, t * 0.2);
        return <div key={i} style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: "50%", background: `radial-gradient(circle, ${rgba(G.g4, 0.07)} 0%, ${rgba(G.g4, 0.03)} 55%, transparent 72%)` }} />;
      })}
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, opacity: 0.075, transform: `scale(${1.12 - 0.12 * k})`, transformOrigin: `${cx}px ${cy}px` }}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#FFFFFF" strokeWidth={2} />
        {Array.from({ length: 60 }, (_, i) => {
          const ang = (i / 60) * Math.PI * 2;
          const L = i % 5 === 0 ? 34 : 12;
          return <line key={i} x1={cx + Math.sin(ang) * (R - 8)} y1={cy - Math.cos(ang) * (R - 8)} x2={cx + Math.sin(ang) * (R - 8 - L)} y2={cy - Math.cos(ang) * (R - 8 - L)} stroke="#FFFFFF" strokeWidth={i % 5 === 0 ? 4 : 2} strokeLinecap="round" />;
        })}
        <line x1={cx} y1={cy} x2={cx + Math.sin((mm * 6 * Math.PI) / 180) * (R - 70)} y2={cy - Math.cos((mm * 6 * Math.PI) / 180) * (R - 70)} stroke="#FFFFFF" strokeWidth={6} strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={cx + Math.sin((mm * 0.5 * Math.PI) / 180) * (R - 220)} y2={cy - Math.cos((mm * 0.5 * Math.PI) / 180) * (R - 220)} stroke="#FFFFFF" strokeWidth={10} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={12} fill="#FFFFFF" />
      </svg>
      {/* compteur fantôme géant (contour), qui s'emballe avec les boîtes */}
      {t >= boxes[0].land - 0.05 && (
        <div style={{ position: "absolute", left: 0, width: 1920, top: 300 - 560 * 0.55, display: "flex", justifyContent: "center", opacity: 0.17 * prog(t, boxes[0].land - 0.05, 0.25, SNAP), transform: `scale(${1.06 - 0.06 * prog(t, boxes[0].land - 0.05, 0.4, SNAP)})` }}>
          <Odometer t={t} value={(tt) => boxCount(tt, boxes)} digits={2} roll={1} size={560} weight={700} color="transparent" style={{ WebkitTextStroke: `3px ${rgba(G.g4, 0.55)}` }} />
        </div>
      )}
    </AbsoluteFill>
  );
}

/* --------------------------------------------------------------------------
 * LA LIGNE DU COMPTOIR, PUIS LE TAPIS ROULANT
 * ------------------------------------------------------------------------ */

const mod = (x: number, m: number) => ((x % m) + m) % m;

function Belt({ t, a }: { t: number; a: Anchors }) {
  const slide = prog(t, a.tres, 10 * F, SNAP);
  const y = lerp(LINE_Y, BELT_Y, slide);
  const conv = prog(t, a.belt, 8 * F, SNAP);
  const ext = prog(t, a.belt, 0.45, SNAP);
  const left = lerp(160, -4200, ext);
  const run = Math.max(0, t - a.belt) * V;
  const show = prog(t, a.lineAt + 6 * F, 3 * F, LINEAR);
  const glint = t - a.lineAt;
  const gp = SNAP(clamp01(glint / 0.45));
  return (
    <AbsoluteFill style={{ opacity: show }}>
      {/* meuble du comptoir (corps du tapis) */}
      <div style={{ position: "absolute", left, top: y + 3, width: BELT_END - left, height: 250, opacity: 0.9 * conv, background: "linear-gradient(180deg, #141A21 0%, rgba(20,26,33,.55) 40%, rgba(20,26,33,0) 100%)", borderTopRightRadius: 10, maskImage: "linear-gradient(90deg, #000 calc(100% - 140px), rgba(0,0,0,.25))", WebkitMaskImage: "linear-gradient(90deg, #000 calc(100% - 140px), rgba(0,0,0,.25))" }} />
      <div style={{ position: "absolute", left, top: y + 26, width: BELT_END - left, height: 2, background: G.g2, opacity: conv }} />
      {/* rouleaux */}
      {conv > 0 &&
        Array.from({ length: 21 }, (_, i) => {
          const x = BELT_END - 60 - i * 120;
          if (x < left) return null;
          const ang = (run / 9) * (180 / Math.PI);
          return (
            <div key={i} style={{ position: "absolute", left: x - 9, top: y + 5, width: 18, height: 18, borderRadius: "50%", border: `2px solid ${G.g2}`, boxSizing: "border-box", background: "#10151B", opacity: conv, transform: `rotate(${-ang}deg)` }}>
              <div style={{ position: "absolute", left: 6, top: 1, width: 2, height: 12, background: G.g3, opacity: 0.6 }} />
            </div>
          );
        })}
      {/* ligne pleine (comptoir) */}
      <div style={{ position: "absolute", left, top: y - 1.5, width: BELT_END - left, height: 3, borderRadius: 2, background: G.g4, opacity: 1 - conv, boxShadow: `0 0 18px ${rgba(G.g4, 0.35)}` }} />
      {/* tirets 24/16 qui défilent à 900 px/s */}
      <div
        style={{
          position: "absolute",
          left,
          top: y - 1.5,
          width: BELT_END - left,
          height: 3,
          opacity: conv,
          backgroundImage: `repeating-linear-gradient(90deg, ${G.g3} 0 24px, transparent 24px 40px)`,
          backgroundPosition: `${-mod(left + run, 40)}px 0`,
        }}
      />
      {/* butée du tapis */}
      <div style={{ position: "absolute", left: BELT_END - 14, top: y - 2, width: 28, height: 28, borderRadius: "50%", border: `2px solid ${G.g3}`, boxSizing: "border-box", background: G.ink, opacity: conv, transform: `rotate(${(-run / 14) * (180 / Math.PI)}deg)` }}>
        <div style={{ position: "absolute", left: 11, top: 3, width: 2, height: 18, background: G.g3 }} />
      </div>
      {/* éclat qui court sur la ligne quand elle naît */}
      {glint > 0 && glint < 0.55 &&
        [-1, 1].map((d) => (
          <div key={d} style={{ position: "absolute", left: 960 + d * 800 * gp - 60, top: LINE_Y - 30, width: 120, height: 60, borderRadius: "50%", background: `radial-gradient(ellipse, rgba(255,255,255,${0.85 * (1 - gp)}) 0%, rgba(255,255,255,0) 60%)` }} />
        ))}
    </AbsoluteFill>
  );
}

/* --------------------------------------------------------------------------
 * COMPTOIR (sort de la ligne, reflet) puis TRÈS VITE (fouet)
 * ------------------------------------------------------------------------ */

function Letters({ text, size, baseline, letterStyle, color = "#FFFFFF", wordStyle }: { text: string; size: number; baseline: number; letterStyle: (i: number) => CSSProperties; color?: string; wordStyle?: CSSProperties }) {
  return (
    <div style={{ position: "absolute", left: 0, width: 1920, top: baseline - size * ASC, display: "flex", justifyContent: "center", ...hero(size), lineHeight: 1, color, whiteSpace: "pre", ...wordStyle }}>
      {Array.from(text).map((ch, i) =>
        // espace FIXE : en inline-block dans un flex, l'espace s'écrasait (« UNEAUTRE »)
        ch === " " ? (
          <span key={i} style={{ display: "inline-block", width: "0.32em", flexShrink: 0 }} />
        ) : (
          <span key={i} style={{ display: "inline-block", ...letterStyle(i) }}>
            {ch}
          </span>
        ),
      )}
    </div>
  );
}

function Comptoir({ t, a }: { t: number; a: Anchors }) {
  if (t < a.p1 - F || t > a.tres + 17 * F) return null;
  const S = 300;
  const base = 620;
  const rise = (i: number): CSSProperties => {
    const k = prog(t, a.p1 + i * 2 * F, 18 * F, SNAP);
    return { transform: `translateY(${(1 - k) * 110}%)` };
  };
  const word = <Letters text="COMPTOIR" size={S} baseline={base} letterStyle={rise} wordStyle={{ textShadow: "0 18px 50px rgba(0,0,0,.5)" }} />;
  const slicing = t >= a.tres;
  const bands: [number, number, number][] = [
    [300, 476, 10],
    [476, 556, 13],
    [556, 634, 16],
  ];
  const reflOp = 0.15 * (1 - prog(t, a.tres, 5 * F, LINEAR));
  return (
    <>
      {/* reflet sous la ligne */}
      {reflOp > 0.001 && (
        <AbsoluteFill style={{ opacity: reflOp, maskImage: `linear-gradient(180deg, transparent 0, transparent ${LINE_Y + 4}px, #000 ${LINE_Y + 8}px, transparent ${LINE_Y + 190}px)`, WebkitMaskImage: `linear-gradient(180deg, transparent 0, transparent ${LINE_Y + 4}px, #000 ${LINE_Y + 8}px, transparent ${LINE_Y + 190}px)` }}>
          <AbsoluteFill style={{ transform: "scaleY(-1)", transformOrigin: `50% ${LINE_Y}px` }}>{word}</AbsoluteFill>
        </AbsoluteFill>
      )}
      {!slicing ? (
        <AbsoluteFill style={{ clipPath: `inset(0 0 ${1080 - 634}px 0)` }}>{word}</AbsoluteFill>
      ) : (
        bands.map(([y0, y1, d], j) => {
          const p = prog(t, a.tres, d * F, EXIT);
          return (
            <AbsoluteFill key={j} style={{ clipPath: `inset(${y0}px 0 ${1080 - y1}px 0)`, transform: `translateX(${-2200 * p}px)`, opacity: 1 - 0.3 * p }}>
              {word}
            </AbsoluteFill>
          );
        })
      )}
    </>
  );
}

function TresVite({ t, a }: { t: number; a: Anchors }) {
  if (t < a.tresIn - F || t > a.tresOut + 16 * F) return null;
  const S = 260;
  const base = BELT_Y - 16;
  const k = prog(t, a.tresIn, 12 * F, WHIP);
  const u = t - a.tresLand;
  const over = u > 0 ? -50 * Math.exp(-7 * u) * Math.sin(2 * Math.PI * 2.6 * u) : 0;
  const ko = prog(t, a.tresOut, 11 * F, WHIP);
  const x = (1 - k) * 1400 + over - 2400 * ko;
  const skew = -12 * (1 - k) + over * 0.08 + 12 * ko;
  const sx = 1 + 0.4 * (1 - k) + 0.3 * ko;
  const letter = (i: number): CSSProperties => {
    // accordéon : les lettres de droite traînent à l'arrivée, celles de gauche partent les premières à la sortie
    const ki = prog(t, a.tresIn + i * 0.6 * F, 12 * F, WHIP);
    const ko2 = prog(t, a.tresOut + (8 - i) * 0.5 * F, 11 * F, WHIP);
    return { transform: `translateX(${(k - ki) * 1400 - (ko2 - ko) * 2400}px)` };
  };
  const wordStyle: CSSProperties = { transform: `translateX(${x}px) skewX(${skew}deg) scaleX(${sx})`, transformOrigin: "50% 80%" };
  return (
    <>
      <AbsoluteFill style={{ opacity: 0.1, maskImage: `linear-gradient(180deg, transparent ${BELT_Y + 2}px, #000 ${BELT_Y + 6}px, transparent ${BELT_Y + 150}px)`, WebkitMaskImage: `linear-gradient(180deg, transparent ${BELT_Y + 2}px, #000 ${BELT_Y + 6}px, transparent ${BELT_Y + 150}px)` }}>
        <AbsoluteFill style={{ transform: "scaleY(-1)", transformOrigin: `50% ${BELT_Y}px` }}>
          <Letters text="TRÈS VITE" size={S} baseline={base} letterStyle={letter} wordStyle={wordStyle} />
        </AbsoluteFill>
      </AbsoluteFill>
      <Letters text="TRÈS VITE" size={S} baseline={base} letterStyle={letter} wordStyle={{ ...wordStyle, textShadow: "0 20px 60px rgba(0,0,0,.55)" }} />
    </>
  );
}

/* --------------------------------------------------------------------------
 * UNE BOÎTE — même place que UNE AUTRE, 220 px : claque à A(P2,0) + 0,02 (échelle 1,9 → 1, flou, onde en contour),
 * respire, puis part en 3 tranches à A(P2,1) − 0,05
 * ------------------------------------------------------------------------ */

const WORD_BASE = 432; // ligne de base commune à UNE BOÎTE et UNE AUTRE

function UneBoite({ t, a }: { t: number; a: Anchors }) {
  const at = a.p2 + 0.02;
  const out = a.autre - 0.05;
  if (t < at - F || t > out + 16 * F) return null;
  const S = 220;
  const origin = `960px ${WORD_BASE - S * 0.35}px`;
  const kin = prog(t, at, 7 * F, EXIT);
  const u = t - at - 7 * F;
  const settle = u > 0 ? 0.06 * Math.exp(-9 * u) * Math.sin(2 * Math.PI * 3.2 * u) : 0;
  const push = 0.035 * prog(t, at + 7 * F, out - at, LINEAR); // lente poussée : rien de figé
  const sc = lerp(1.9, 1, kin) + settle + push;
  const op = clamp01((t - at) / (2 * F));
  const letter = (i: number): CSSProperties => {
    const ki = prog(t, at + 7 * F + i * 0.7 * F, 9 * F, SNAP);
    return { transform: `translateY(${-14 * Math.sin(Math.PI * ki)}px)` };
  };
  const word = (
    <Letters text="UNE BOÎTE" size={S} baseline={WORD_BASE} letterStyle={letter} wordStyle={{ transform: `scale(${sc})`, transformOrigin: origin, textShadow: "0 18px 50px rgba(0,0,0,.5)" }} />
  );
  // onde en contour à l'impact
  const ringAt = at + 6 * F;
  const ringP = prog(t, ringAt, 0.38, SNAP);
  // lueur derrière le mot à l'impact
  const flash = pulse(t, at + 5 * F, 0.03, 0.02, 0.35);
  const slicing = t >= out;
  const bands: [number, number, number, number][] = [
    [180, 330, 6, -1],
    [330, 395, 8, 1],
    [395, 500, 10, -1],
  ];
  return (
    <>
      {flash > 0.001 && <div style={{ position: "absolute", left: 60, top: WORD_BASE - 340, width: 1800, height: 520, borderRadius: "50%", background: `radial-gradient(closest-side, ${rgba(G.g4, 0.14 * flash)} 0%, ${rgba(G.g4, 0.05 * flash)} 45%, ${rgba(G.g4, 0)} 100%)` }} />}
      {t > ringAt && ringP < 1 && (
        <Letters
          text="UNE BOÎTE"
          size={S}
          baseline={WORD_BASE}
          color="transparent"
          letterStyle={() => ({})}
          wordStyle={{ WebkitTextStroke: `3px ${G.g4}`, opacity: 0.6 * (1 - ringP), transform: `scale(${1 + 0.32 * ringP})`, transformOrigin: origin }}
        />
      )}
      {!slicing ? (
        <AbsoluteFill style={{ opacity: op, filter: kin < 1 ? `blur(${(1 - kin) * 14}px)` : undefined }}>{word}</AbsoluteFill>
      ) : (
        bands.map(([y0, y1, d, dir], j) => {
          // départ franc (pas de lente mise en route) et fondu : la place est libre quand UNE AUTRE arrive
          const q = clamp01((t - out - j * F) / (d * F));
          const p = q * (0.35 + 0.65 * q);
          return (
            <AbsoluteFill key={j} style={{ clipPath: `inset(${y0}px 0 ${1080 - y1}px 0)`, transform: `translateX(${dir * 2300 * p}px) skewX(${-dir * 14 * q}deg)`, opacity: 1 - clamp01(q * 1.5) }}>
              {word}
            </AbsoluteFill>
          );
        })
      )}
    </>
  );
}

/* --------------------------------------------------------------------------
 * UNE AUTRE — écho stroboscopique (5 copies, −40 px, 1 / .5 / .3 / .18 / .1, à 2 images d'écart)
 * ------------------------------------------------------------------------ */

function UneAutre({ t, a }: { t: number; a: Anchors }) {
  const exitAt = a.file - 0.06;
  if (t < a.autre - F || t > exitAt + 24 * F) return null;
  const ops = [1, 0.5, 0.3, 0.18, 0.1];
  const S = 200;
  return (
    <>
      {ops
        .map((o, j) => {
          const at = a.autre + j * 2 * F;
          if (t < at) return null;
          const kin = prog(t, at, 8 * F, SNAP);
          const breathe = 1 + 0.18 * Math.sin(2 * Math.PI * 2.2 * (t - a.autre) - j * 0.5);
          const dx = -40 * j * breathe;
          const pOut = prog(t, exitAt + j * 2 * F, 12 * F, EXIT);
          const sc = j === 0 ? 1 + 0.22 * (1 - prog(t, at, 9 * F, POP)) : 1;
          return (
            <Letters
              key={j}
              text="UNE AUTRE"
              size={S}
              baseline={WORD_BASE}
              color={j === 0 ? "#FFFFFF" : "transparent"}
              letterStyle={() => ({})}
              wordStyle={{
                WebkitTextStroke: j === 0 ? undefined : `3px ${G.g4}`,
                opacity: o * clamp01(kin * 1.5) * (1 - pOut),
                transform: `translateX(${dx + (1 - kin) * -80 - 1700 * pOut}px) scale(${sc})`,
                filter: j === 0 && kin < 1 ? `blur(${(1 - kin) * 10}px)` : undefined,
                textShadow: j === 0 ? "0 18px 50px rgba(0,0,0,.5)" : undefined,
              }}
            />
          );
        })
        .reverse()}
    </>
  );
}

/* --------------------------------------------------------------------------
 * LES BOÎTES
 * ------------------------------------------------------------------------ */

function impact(t: number, at: number) {
  if (t < at) return { sx: 1, sy: 1 };
  const u = (t - at) / (5 * F);
  if (u > 5) return { sx: 1, sy: 1 };
  const k = Math.exp(-1.5 * u) * Math.cos(Math.PI * 0.5 * u);
  return { sx: 1 + 0.25 * k, sy: 1 - 0.2 * k };
}

function BoxShape({ glow = 0, deep = 0 }: { glow?: number; deep?: number }) {
  return (
    <div style={{ position: "absolute", inset: 0, borderRadius: 14, background: "linear-gradient(180deg, #38424E 0%, #2A333D 45%, #222A33 100%)", boxShadow: `inset 0 1px 0 rgba(255,255,255,${0.12 + 0.1 * deep}), inset 0 -2px 0 rgba(0,0,0,.25), 0 ${14 + 8 * deep}px ${26 + 14 * deep}px rgba(0,0,0,${0.4 + 0.25 * deep})${glow > 0 ? `, 0 0 30px ${rgba(G.g4, 0.3 * glow)}` : ""}` }}>
      <div style={{ position: "absolute", left: 55, top: 42, width: 30, height: 6, borderRadius: 2, background: "#FFFFFF" }} />
      <div style={{ position: "absolute", left: 67, top: 30, width: 6, height: 30, borderRadius: 2, background: "#FFFFFF" }} />
      <div style={{ position: "absolute", left: 10, right: 10, top: 6, height: 2, borderRadius: 1, background: "rgba(255,255,255,.07)" }} />
    </div>
  );
}

function Boxes({ t, a, boxes }: { t: number; a: Anchors; boxes: Box[] }) {
  return (
    <>
      {boxes.map((b) => {
        if (t < b.fall) return null;
        const restB = BELT_Y - b.level * BOX_H;
        const falling = t < b.land;
        const p = clamp01((t - b.fall) / (b.land - b.fall));
        const x = falling ? b.wx : b.s - V * t;
        if (x < -1400) return null;
        const bottom = falling ? lerp(b.y0, restB, EXIT(p)) : restB;
        const st = falling ? { sx: 1 - 0.15 * p * p, sy: 1 + 0.2 * p * p } : impact(t, b.land);
        // boîte 1 : tombe au PREMIER PLAN (×2,2, ombre portée), puis rapetisse sur le tapis avant « Une autre »
        const big = b.k === 0 ? (falling ? lerp(2.7, 2.2, EXIT(p)) : lerp(2.2, 1, prog(t, b.land + 0.16, 0.3, SNAP))) : 1;
        const deep = clamp01((big - 1) / 1.2);
        const u = t - b.land;
        const rot = falling ? b.tilt * (1 - p) : b.tilt * 0.25 * Math.exp(-9 * u) * Math.cos(2 * Math.PI * 4 * u) * -1;
        const flash = pulse(t, b.land, 0.02, 0, 0.25);
        return (
          <div key={b.k}>
            {/* ombre sur le tapis (ou sur la boîte du dessous) */}
            <div style={{ position: "absolute", left: x - 62, top: restB - 6, width: 124, height: 12, borderRadius: "50%", background: "rgba(0,0,0,.55)", filter: `blur(${4 + 6 * deep}px)`, opacity: falling ? 0.2 + 0.6 * p * p : 0.8, transform: `scale(${(falling ? 0.5 + 0.5 * p : 1) * big}, ${1 + 0.6 * deep})` }} />
            {/* onde de choc aplatie (boîte 1) */}
            {b.k === 0 && u > 0 && u < 0.5 && (() => {
              const q = SNAP(u / 0.5);
              const w = 220 + 820 * q;
              return <div style={{ position: "absolute", left: b.wx - w / 2, top: restB - w * 0.08, width: w, height: w * 0.16, borderRadius: "50%", border: `${1 + 3 * (1 - q)}px solid ${rgba(G.g4, 0.55 * (1 - q))}` }} />;
            })()}
            {/* poussière à l'impact */}
            {u > 0 &&
              u < 0.4 &&
              Array.from({ length: 6 }, (_, i) => {
                const side = i % 2 === 0 ? -1 : 1;
                const q = SNAP(u / 0.4);
                const px = x + side * (60 + rnd("S1-puff", b.k * 10 + i, 30, 120) * q);
                const py = restB - 4 - rnd("S1-puffy", b.k * 10 + i, 4, 30) * q;
                const r = rnd("S1-puffr", b.k * 10 + i, 3, 7) * (1 - 0.4 * q);
                return <div key={i} style={{ position: "absolute", left: px - r, top: py - r, width: r * 2, height: r * 2, borderRadius: "50%", background: G.g3, opacity: 0.55 * (1 - q) }} />;
              })}
            <div style={{ position: "absolute", left: x - BOX_W / 2, top: bottom - BOX_H, width: BOX_W, height: BOX_H, transformOrigin: "50% 100%", transform: `rotate(${rot}deg) scale(${st.sx * big}, ${st.sy * big})` }}>
              <BoxShape glow={flash} deep={deep} />
            </div>
          </div>
        );
      })}
    </>
  );
}

/* --------------------------------------------------------------------------
 * PREMIER PLAN — 4 boîtes ×2,5 qui traversent le cadre (chute + dérive + rotation), hors mise au point, flou de
 * mouvement propre. d = décalage depuis A(P2,1). Décoratives : le compteur ne compte que le tapis.
 * ------------------------------------------------------------------------ */

const FORE = [
  { d: 0.04, dur: 0.36, x0: 1580, x1: 1240, r: 70 },
  { d: 0.3, dur: 0.34, x0: 260, x1: 520, r: -95 },
  { d: 0.56, dur: 0.4, x0: 1180, x1: 760, r: 120 },
  { d: 0.92, dur: 0.38, x0: 1720, x1: 1500, r: -60 },
];

function ForeBoxes({ t, a }: { t: number; a: Anchors }) {
  return (
    <AbsoluteFill>
      {FORE.map((f, i) => {
        const at = a.autre + f.d;
        const u = (t - at) / f.dur;
        if (u < 0 || u > 1) return null;
        const y = lerp(-320, 1420, u * (0.55 + 0.45 * u)); // accélère en tombant
        const x = lerp(f.x0, f.x1, u);
        const SC = 2.5;
        return (
          <div key={i} style={{ position: "absolute", left: x - (BOX_W * SC) / 2, top: y - (BOX_H * SC) / 2, width: BOX_W * SC, height: BOX_H * SC, transform: `rotate(${f.r * (u - 0.3)}deg)`, filter: "blur(2px)" }}>
            <div style={{ position: "absolute", left: 0, top: 0, width: BOX_W, height: BOX_H, transform: `scale(${SC})`, transformOrigin: "0 0" }}>
              <BoxShape deep={1} />
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

/* --------------------------------------------------------------------------
 * LA FILE — silhouettes qui piétinent, bulles « … »
 * ------------------------------------------------------------------------ */

/** Le sol de la file : ligne de sol, lueur au sol, 3 lignes de fuite vers le point de fuite (dessiné sous le tapis). */
function Floor({ t, a }: { t: number; a: Anchors }) {
  if (t < a.file - F) return null;
  const k = prog(t, a.file, 0.45, SNAP);
  const rays: [number, number][] = [
    [1700, 752],
    [1700, 830],
    [1700, 950],
  ];
  return (
    <svg width={4000} height={1400} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <defs>
        <linearGradient id="S1-ray" gradientUnits="userSpaceOnUse" x1={1700} y1={0} x2={VP[0]} y2={0}>
          <stop offset="0" stopColor={G.g3} stopOpacity={0} />
          <stop offset="0.16" stopColor={G.g3} stopOpacity={0.45} />
          <stop offset="1" stopColor={G.g3} stopOpacity={0} />
        </linearGradient>
        <radialGradient id="S1-floor" gradientUnits="userSpaceOnUse" cx={2280} cy={GROUND_Y + 10} r={720} gradientTransform={`translate(0 ${GROUND_Y + 10}) scale(1 .2) translate(0 ${-(GROUND_Y + 10)})`}>
          <stop offset="0" stopColor={G.g4} stopOpacity={0.12} />
          <stop offset="1" stopColor={G.g4} stopOpacity={0} />
        </radialGradient>
        <linearGradient id="S1-ground" gradientUnits="userSpaceOnUse" x1={1780} y1={0} x2={VP[0]} y2={0}>
          <stop offset="0" stopColor={G.g4} stopOpacity={0.9} />
          <stop offset="1" stopColor={G.g4} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* lueur au sol sous la file (ellipse douce, sans bord) */}
      <rect x={1500} y={GROUND_Y - 160} width={1600} height={320} fill="url(#S1-floor)" opacity={k} />
      {rays.map(([x, y], i) => {
        const kk = prog(t, a.file + 0.06 * i, 0.4, SNAP);
        // la ligne se dessine depuis le point de fuite vers le spectateur
        return <line key={i} x1={VP[0]} y1={VP[1]} x2={lerp(VP[0], x, kk)} y2={lerp(VP[1], y, kk)} stroke="url(#S1-ray)" strokeWidth={3 + i} strokeLinecap="round" />;
      })}
      <line x1={1780} y1={GROUND_Y + 1} x2={lerp(1780, VP[0], k)} y2={GROUND_Y + 1} stroke="url(#S1-ground)" strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}

function Queue({ t, a }: { t: number; a: Anchors }) {
  if (t < a.file - F) return null;
  const bubbles = new Set([1, 4, 7, 10]);
  return (
    <>
      {QUEUE.map((q, i) => ({ q, i }))
        .reverse()
        .map(({ q, i }) => {
          const at = a.file + i * 3 * F;
          if (t < at) return null;
          const d = i / (QUEUE.length - 1);
          const sc = q.s * prog(t, at, 14 * F, POP);
          const col = mixHex(G.g3, G.g1, 0.85 * d);
          const fade = lerp(1, 0.55, d);
          const phase = hash("S1-step", i) * Math.PI * 2;
          const step = Math.abs(Math.sin(2 * Math.PI * 2 * t + phase));
          const bounce = -8 * step;
          const tilt = 5 * noise2D("S1-tilt", i, t * 0.9);
          const bAt = at + 0.15;
          const bk = prog(t, bAt, 12 * F, POP);
          return (
            <div key={i} style={{ position: "absolute", left: q.x, top: q.y, width: 0, height: 0, opacity: fade }}>
              <div style={{ position: "absolute", left: -56, top: -8, width: 112, height: 16, borderRadius: "50%", background: "rgba(0,0,0,.5)", filter: "blur(5px)", transform: `scale(${sc * (1 - 0.15 * step)})` }} />
              <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `scale(${sc}) translateY(${bounce}px)` }}>
                {/* corps capsule 84×160 */}
                <div style={{ position: "absolute", left: -42, top: -160, width: 84, height: 160, borderRadius: 42, background: `linear-gradient(180deg, ${lighten(col, 0.12)} 0%, ${col} 60%, ${darken(col, 0.18)} 100%)`, transform: `scaleY(${1 - 0.04 * step})`, transformOrigin: "50% 100%" }} />
                {/* tête 56 */}
                <div style={{ position: "absolute", left: -28, top: -230, width: 56, height: 56, borderRadius: "50%", background: `linear-gradient(180deg, ${lighten(col, 0.16)}, ${col})`, transform: `rotate(${tilt}deg)`, transformOrigin: "50% 140%" }} />
                {bubbles.has(i) && bk > 0 && (
                  <div style={{ position: "absolute", left: 6, top: -318, width: 96, height: 48, borderRadius: 24, background: "rgba(255,255,255,.2)", transform: `scale(${bk * (1 + 0.07 * Math.sin(2 * Math.PI * 2 * t + i))})`, transformOrigin: "10% 100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}>
                    {[0, 1, 2].map((j) => (
                      <div key={j} style={{ width: 11, height: 11, borderRadius: "50%", background: "#FFFFFF", opacity: 0.35 + 0.6 * Math.max(0, Math.sin(2 * Math.PI * 2.2 * t - j * 0.9 + i)), transform: `translateY(${-3 * Math.max(0, Math.sin(2 * Math.PI * 2.2 * t - j * 0.9 + i))}px)` }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
    </>
  );
}

function hexToRgb(h: string) {
  const v = parseInt(h.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function rgbToHex(c: number[]) {
  return `#${c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("")}`;
}
function mixHex(a: string, b: string, k: number) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A.map((x, i) => lerp(x, B[i], k)));
}
const lighten = (c: string, k: number) => mixHex(c, "#FFFFFF", k);
const darken = (c: string, k: number) => mixHex(c, "#000000", k);

/* --------------------------------------------------------------------------
 * PREMIER PLAN (parallaxe 1,6) : lignes de vitesse, poussière
 * ------------------------------------------------------------------------ */

function FrontLayer({ t, a }: { t: number; a: Anchors }) {
  const out = 1 - prog(t, a.sq0, 8 * F, LINEAR);
  const lines = t >= a.tres && t < a.tres + 1.1;
  return (
    <AbsoluteFill style={{ opacity: out }}>
      {t >= a.lineAt && <Dust t={t} count={18} seed="S1-front" alpha={0.16} size={[1.5, 3.5]} speed={0.08} />}
      {lines &&
        Array.from({ length: 14 }, (_, i) => {
          const y = rnd("S1-speed-y", i, 120, 860);
          const len = rnd("S1-speed-l", i, 200, 600);
          const th = rnd("S1-speed-t", i, 2, 4);
          const delay = rnd("S1-speed-d", i, 0, 0.5);
          const x0 = 1940 + rnd("S1-speed-x", i, 0, 260);
          const x = x0 - 2400 * (t - a.tres - delay);
          if (t < a.tres + delay || x + len < -20) return null;
          const far = i % 3 === 0;
          return <div key={i} style={{ position: "absolute", left: x, top: y, width: len, height: th, borderRadius: th, background: `linear-gradient(90deg, rgba(255,255,255,${far ? 0.18 : 0.3}), rgba(255,255,255,0))`, filter: far ? "blur(2px)" : undefined }} />;
        })}
    </AbsoluteFill>
  );
}

/* --------------------------------------------------------------------------
 * HUD (parallaxe .3) : horloge, compteur BOÎTES, compteur de cadence, ticket, jauge ATTENTE
 * ------------------------------------------------------------------------ */

const pad2 = (n: number) => String(n).padStart(2, "0");
const hhmm = (m: number) => `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;

function RollChars({ prev, cur, p }: { prev: string; cur: string; p: number }) {
  const pc = Array.from(prev);
  return (
    <span style={{ display: "inline-flex", lineHeight: "1.1em" }}>
      {Array.from(cur).map((c, i) => {
        const o = pc[i] ?? c;
        if (o === c || p >= 1) return <span key={i} style={{ display: "inline-block", height: "1.1em" }}>{c}</span>;
        return (
          <span key={i} style={{ display: "inline-block", height: "1.1em", overflow: "hidden" }}>
            <span style={{ display: "block", transform: `translateY(${-p * 50}%)` }}>
              <span style={{ display: "block", height: "1.1em", opacity: 1 - p }}>{o}</span>
              <span style={{ display: "block", height: "1.1em" }}>{c}</span>
            </span>
          </span>
        );
      })}
    </span>
  );
}

function Hud({ t, a, boxes }: { t: number; a: Anchors; boxes: Box[] }) {
  const ex = (j: number) => prog(t, a.sq0 + j * F, 10 * F, EXIT);
  return (
    <AbsoluteFill>
      <ClockHud t={t} a={a} out={ex(0)} />
      <BoxCounter t={t} a={a} boxes={boxes} out={ex(1)} />
      <Gauge t={t} a={a} out={ex(2)} />
      <Ticket t={t} a={a} out={ex(1)} />
      <WaitBar t={t} a={a} out={ex(3)} />
    </AbsoluteFill>
  );
}

function ClockHud({ t, a, out }: { t: number; a: Anchors; out: number }) {
  if (t < a.p1) return null;
  const k = prog(t, a.p1, 16 * F, SNAP);
  const { m, n, p } = minutesAt(t, a);
  const prev = hhmm(n > 0 ? m - 1 : m);
  const cur = hhmm(m);
  const mm = m - 1 + p;
  const float = 3 * Math.sin(t * 2.1);
  return (
    <div style={{ position: "absolute", left: 120, top: 90 + float, display: "flex", alignItems: "center", gap: 16, opacity: k * (1 - out), transform: `translate(${(1 - k) * -60 - 0 * out}px, ${-170 * out}px)` }}>
      <svg width={40} height={40} viewBox="0 0 40 40">
        <circle cx={20} cy={20} r={17} fill="none" stroke={G.g3} strokeWidth={2.5} />
        <line x1={20} y1={20} x2={20 + Math.sin((mm * 6 * Math.PI) / 180) * 12} y2={20 - Math.cos((mm * 6 * Math.PI) / 180) * 12} stroke={G.g4} strokeWidth={2.5} strokeLinecap="round" />
        <line x1={20} y1={20} x2={20 + Math.sin((mm * 0.5 * Math.PI) / 180) * 8} y2={20 - Math.cos((mm * 0.5 * Math.PI) / 180) * 8} stroke={G.g4} strokeWidth={3} strokeLinecap="round" />
      </svg>
      <span style={{ ...digits(40, 600), color: G.g3 }}>
        <RollChars prev={prev} cur={cur} p={p} />
      </span>
    </div>
  );
}

function BoxCounter({ t, a, boxes, out }: { t: number; a: Anchors; boxes: Box[]; out: number }) {
  const first = boxes[0].land;
  if (t < first - 2 * F) return null;
  const k = prog(t, first - 2 * F, 14 * F, POP);
  const last = boxes.reduce((m, b) => (b.land <= t ? b.land : m), first);
  const flash = pulse(t, last, 0.02, 0, 0.18);
  const float = 3 * Math.sin(t * 2.1 + 1.3);
  return (
    <div style={{ position: "absolute", right: 120, top: 90 + float, display: "flex", alignItems: "center", gap: 18, opacity: clamp01(k * 1.4) * (1 - out), transform: `translateY(${(1 - k) * -50 - 170 * out}px)` }}>
      <div style={{ position: "relative", width: 34, height: 22, borderRadius: 5, background: G.g2, transform: `translateY(${-4 * flash}px)` }}>
        <div style={{ position: "absolute", left: 12, top: 9, width: 10, height: 3, background: "#FFFFFF", borderRadius: 1 }} />
        <div style={{ position: "absolute", left: 15.5, top: 5.5, width: 3, height: 10, background: "#FFFFFF", borderRadius: 1 }} />
      </div>
      <span style={{ ...label(26), color: G.g3 }}>BOÎTES</span>
      <span style={{ display: "inline-block", transform: `scale(${1 + 0.14 * flash})`, transformOrigin: "100% 50%", filter: flash > 0.05 ? `drop-shadow(0 0 ${10 * flash}px rgba(255,255,255,.6))` : undefined }}>
        <Odometer t={t} value={(tt) => boxCount(tt, boxes)} digits={2} roll={1} size={40} weight={600} color={flash > 0.3 ? "#FFFFFF" : G.g4} />
      </span>
    </div>
  );
}

function Gauge({ t, a, out }: { t: number; a: Anchors; out: number }) {
  if (t < a.tres) return null;
  const k = prog(t, a.tres, 14 * F, POP);
  const cx = 230;
  const cy = 880;
  const R = 110;
  const slamAt = a.gauge;
  const rise = 0.075;
  let ang: number;
  if (t < slamAt) ang = -90 + 2 * noise2D("S1-needle0", t * 6, 0);
  else if (t < slamAt + rise) ang = lerp(-90, 92, EXIT((t - slamAt) / rise));
  else {
    const u = t - slamAt - rise;
    ang = 70 + 22 * Math.exp(-6 * u) * Math.cos(2 * Math.PI * 5 * u) + 1.8 * noise2D("S1-needle", t * 9, 0);
  }
  const pt = (deg: number, r: number) => [cx + Math.sin((deg * Math.PI) / 180) * r, cy - Math.cos((deg * Math.PI) / 180) * r];
  const arc = (d0: number, d1: number, r: number) => {
    const [x0, y0] = pt(d0, r);
    const [x1, y1] = pt(d1, r);
    return `M ${x0} ${y0} A ${r} ${r} 0 ${d1 - d0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  const hot = clamp01((ang - 40) / 20);
  const [nx, ny] = pt(ang, 92);
  const [tx, ty] = pt(ang + 180, 18);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, opacity: clamp01(k * 1.5) * (1 - out), transform: `translate(${-260 * out}px, ${(1 - k) * 60 + 200 * out}px)` }}>
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0 }}>
        <path d={arc(-90, 90, R + 18)} fill="none" stroke="rgba(255,255,255,.04)" strokeWidth={26} />
        <path d={arc(-90, 45, R)} fill="none" stroke={G.g2} strokeWidth={10} strokeLinecap="round" />
        <path d={arc(45, 90, R)} fill="none" stroke={G.coral} strokeWidth={10} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 ${6 + 14 * hot}px ${rgba(G.coral, 0.35 + 0.45 * hot * (0.75 + 0.25 * Math.sin(t * 30)))})` }} />
        {Array.from({ length: 9 }, (_, i) => {
          const d = -90 + i * 22.5;
          const [x0, y0] = pt(d, R - 14);
          const [x1, y1] = pt(d, R - (i % 2 === 0 ? 30 : 22));
          return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={i >= 7 ? G.coral : G.g3} strokeWidth={i % 2 === 0 ? 3 : 2} strokeLinecap="round" opacity={0.8} />;
        })}
        <line x1={tx} y1={ty} x2={nx} y2={ny} stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" style={{ filter: "drop-shadow(0 0 6px rgba(255,255,255,.45))" }} />
        <circle cx={cx} cy={cy} r={11} fill={G.g4} />
        <circle cx={cx} cy={cy} r={4} fill={G.ink} />
      </svg>
      <div style={{ position: "absolute", left: cx - 100, width: 200, top: cy + 22, textAlign: "center", ...label(18), color: G.g3 }}>CADENCE</div>
    </div>
  );
}

function Ticket({ t, a, out }: { t: number; a: Anchors; out: number }) {
  if (t < a.file) return null;
  const k = prog(t, a.file, 16 * F, POP);
  const u = t - a.file;
  const swing = 7 * Math.exp(-3.2 * u) * Math.sin(2 * Math.PI * 1.4 * u) + 1.2 * Math.sin(t * 2.4);
  const W = 300;
  const H = 84;
  const notch = `radial-gradient(circle at 0 50%, transparent 13px, #000 13.5px), radial-gradient(circle at 100% 50%, transparent 13px, #000 13.5px)`;
  return (
    <div style={{ position: "absolute", left: 960 - W / 2, top: 110 - H / 2, width: W, height: H, opacity: clamp01(k * 1.5) * (1 - out), transformOrigin: "50% -60px", transform: `translateY(${(1 - k) * -200 - 220 * out}px) rotate(${swing}deg)` }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 14,
          background: "linear-gradient(180deg, #232B34, #1A2129)",
          boxShadow: "0 18px 40px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.08)",
          maskImage: notch,
          WebkitMaskImage: notch,
          maskComposite: "intersect",
          WebkitMaskComposite: "source-in",
        }}
      />
      <div style={{ position: "absolute", left: 76, top: 12, bottom: 12, width: 0, borderLeft: `2px dashed ${G.g2}` }} />
      <div style={{ position: "absolute", left: 24, top: H / 2 - 14 }}>
        <Users size={28} color={G.g3} strokeWidth={2.4} />
      </div>
      <div style={{ position: "absolute", left: 92, right: 18, top: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Odometer t={t} value={(tt) => lerp(42, 57, prog(tt, a.file + 0.1, Math.max(0.6, a.sq0 - a.file - 0.25), IN_OUT))} digits={3} prefix="N° " size={44} weight={600} color={G.g4} />
      </div>
    </div>
  );
}

function WaitBar({ t, a, out }: { t: number; a: Anchors; out: number }) {
  if (t < a.file + 0.05) return null;
  const k = prog(t, a.file + 0.05, 14 * F, SNAP);
  const fill = prog(t, a.file + 0.2, 0.9, SNAP);
  const full = clamp01((fill - 0.9) / 0.1);
  const W = 420;
  const alarm = full * (0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 3));
  return (
    <div style={{ position: "absolute", right: 120, top: 170, display: "flex", alignItems: "center", gap: 20, opacity: k * (1 - out), transform: `translateX(${(1 - k) * 80 + 600 * out}px)` }}>
      <span style={{ ...label(24), color: full > 0.5 ? mixHex(G.g3, G.coral, alarm * 0.8) : G.g3 }}>ATTENTE</span>
      <div style={{ position: "relative", width: W, height: 16, borderRadius: 8, background: G.g1, boxShadow: `inset 0 0 0 1px ${G.g2}` }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: Math.max(16, W * fill),
            opacity: fill > 0 ? 1 : 0,
            borderRadius: 8,
            backgroundColor: G.coral,
            backgroundImage: "repeating-linear-gradient(-45deg, rgba(255,255,255,.22) 0 8px, rgba(255,255,255,0) 8px 16px)",
            backgroundPosition: `${(t * 60) % 22.6}px 0`,
            boxShadow: `0 0 ${12 + 18 * alarm}px ${rgba(G.coral, 0.35 + 0.35 * alarm)}`,
          }}
        />
        {fill > 0 && fill < 1 && <div style={{ position: "absolute", left: W * fill - 10, top: -8, width: 20, height: 32, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(255,255,255,.85), rgba(255,255,255,0) 65%)" }} />}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
 * SORTIE — compression en barre, saut, relais
 * ------------------------------------------------------------------------ */

function Squeeze({ t, a, children }: { t: number; a: Anchors; children: ReactNode }) {
  const p = prog(t, a.sq0, 10 * F, IN_OUT);
  if (p >= 1) return null;
  if (p <= 0) return <AbsoluteFill>{children}</AbsoluteFill>;
  return (
    <AbsoluteFill style={{ transformOrigin: "960px 610px", transform: `translateY(${-70 * p}px) scale(${lerp(1, 0.31, p)}, ${lerp(1, 0.1, p)})`, opacity: 1 - clamp01((p - 0.5) / 0.5), filter: `brightness(${1 + 1.4 * p})` }}>
      {children}
    </AbsoluteFill>
  );
}

function HandoffBar({ t, a }: { t: number; a: Anchors }) {
  if (t < a.sq0) return null;
  const p = prog(t, a.sq0, 10 * F, IN_OUT);
  const op = clamp01((p - 0.25) / 0.5);
  let w = lerp(1500, 600, p);
  let h = lerp(220, 24, p);
  const cy = lerp(610, 540, p);
  let dy = 0;
  let glow = 0.5 * (1 - p) + 0.4;
  const hs = a.sqEnd;
  const hl = a.hopLand;
  if (t >= hs && t < hl) {
    const u = (t - hs) / (hl - hs);
    dy = -60 * 4 * u * (1 - u);
    const v = Math.abs(1 - 2 * u); // vitesse normalisée
    h *= 1 + 0.35 * v;
    w *= 1 - 0.05 * v;
  } else if (t >= hl) {
    const s = impact(t, hl);
    w *= 1 + (s.sx - 1) * 0.5;
    h *= 1 - (1 - s.sy) * 1.6;
    glow = 0.4 * (1 - prog(t, hl, 4 * F, LINEAR));
  }
  return (
    <div
      style={{
        position: "absolute",
        left: 960 - w / 2,
        top: cy + dy - h / 2,
        width: w,
        height: h,
        borderRadius: 12,
        background: G.g4,
        opacity: op,
        boxShadow: glow > 0.01 ? `0 0 ${30 * glow}px ${rgba(G.g4, 0.5 * glow)}` : undefined,
      }}
    />
  );
}

/* --------------------------------------------------------------------------
 * EFFETS SONORES (secondes du film)
 * ------------------------------------------------------------------------ */

export const cues: SceneCues = (time) => {
  const a = anchorsOf(time);
  const boxes = boxesOf(a);
  return [
    cue("neon_flicker_grey", 0, 0.8),
    cue("whoosh_heavy", a.plunge - 0.03, 0.7),
    ...every("tick_metronome", 0.8, a.p3, 0.5, 0.35),
    cue("whoosh_fast", a.tresIn - 0.03, 0.7),
    cue("gauge_slam", a.gauge + 0.075, 0.6),
    cue("whoosh_fast", a.tresOut, 0.4, 1.3),
    // une boîte sur deux à partir de la 7e, et plus rien sous « La file » : le murmure et counter_roll prennent le relais
    ...boxes
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => !b.twin && b.land < a.file - 0.05)
      .filter((_, n) => n < 6 || n % 2 === 0)
      .map(({ b, i }, n) => cue("box_drop", b.land, n < 6 ? 0.6 : 0.45, 1 + 0.02 * i)),
    cue("counter_roll", a.autre, 0.5),
    cue("queue_murmur", a.file - 0.2, 0.3),
    cue("counter_roll", a.file + 0.1, 0.35, 0.9),
    cue("whoosh_fast", a.sq0, 0.5, 1.2),
  ];
};
