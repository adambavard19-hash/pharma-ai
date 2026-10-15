import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, Img, spring, staticFile } from "remotion";
import { noise2D } from "@remotion/noise";
import { Mascot, simulate, type Track } from "../mascot";
import {
  Backdrop,
  Camera,
  DotGrid,
  Dust,
  F,
  FPS,
  GOLD_METAL,
  INK,
  IN_OUT,
  JAKARTA,
  MONO,
  Odometer,
  PB,
  SNAP,
  SlotDigits,
  Spot,
  WHIP,
  ballistic,
  clamp01,
  cue,
  digits,
  hash,
  label,
  lerp,
  mix2,
  prog,
  pulse,
  ressort,
  rgba,
  shake,
  tween,
  type Shake,
} from "./kit";
import type { Time } from "./time";
import type { SceneCues, SceneProps } from "./types";

/* ==========================================================================
 * S7 · À LA LOUPE — voix P9 « Un produit de votre stock, son prix, et le challenge du moment. »
 * Fenêtre : P9.start − 0,1 → P10.start (fouet de sortie compris). Direction : buildNotes S7.
 *
 * La carte Ultra-Levure (relais de S6 : 1400×560 centrée en (960, 480)) s'ÉCLATE en 4 calques EN VRAIE 3D :
 *   L0 plaque de fond (plan technique)   L1 feuille produit (vignette, nom, raison)
 *   L2 verre « stock et prix »           L3 verre « challenge » (badge, ruban, jauge)
 * Chaque calque est un plan à sa profondeur (dz), décalé de côté (dx, dy), que la caméra contourne (orbite ±17° en 3 s,
 * perspective 1400 px). Le CSS (layerCss) et le JS (proj) font EXACTEMENT le même calcul : les objets dessinés hors
 * calque (étiquette suspendue, crochets de visée, laser, paillettes) relisent proj() pour viser juste.
 *
 * La caméra fait la visite, un arrêt par segment : a1 la photo (×1,3) · a2 « EN STOCK · 29 » · a3 l'étiquette de prix ·
 * a4 le badge Challenge · a5 retour au plan large, puis recollement et fouet.
 *
 * Ancrages : a1..a5 = time.A("P9", 0..4) (segments « Un produit » / « de votre stock » / « son prix » /
 * « et le challenge » / « du moment »). Le fouet part avec l'entrée de S8 (time.win.S8.start) : aucune image vide.
 * ======================================================================== */

/**
 * LE RELAIS DE S6, AU PIXEL : la dernière image de S6 est sa carte « Conseil associé » (980 px de large, bloc intérieur
 * 980×300 centré dans une carte 980×392) poussée ×1400/980 jusqu'à 1400×560 centrée en (960, 480). La carte de S7 en
 * reprend EXACTEMENT la mise en page (vignette carrée, libellé, nom, prix à droite, pastille sous le nom, raison sur une
 * ligne) : à la coupe, rien ne bouge ; c'est l'éclatement qui démarre.
 */
const Z6 = 1400 / 980;
const CARD = { x: 260, y: 200, w: 1400, h: 560, cx: 960, cy: 480, r: 24 * Z6 } as const;
/** Coordonnées du bloc intérieur de la carte de S6 → écran (carte poussée). */
const s6x = (x: number) => CARD.x + x * Z6;
const s6y = (y: number) => CARD.y + (46 + y) * Z6;

/** Perspective de la vue éclatée (px). */
const PERSP = 1400;
/** Échelle d'ensemble de la pile éclatée (la perspective grossit les calques avant). */
const STACK_SCALE = 0.76;
/** Les 4 calques : décalage latéral (40 à 60 px de l'un à l'autre), profondeur, flou de profondeur. */
const LAYERS = [
  { dx: -84, dy: -30, dz: -300, blur: 2.5 },
  { dx: -28, dy: -10, dz: -100, blur: 0 },
  { dx: 28, dy: 10, dz: 100, blur: 0 },
  { dx: 84, dy: 30, dz: 300, blur: 0 },
] as const;
/** L'écartement : ressort un peu vif (léger dépassement, la pile « respire » en s'ouvrant). */
const EXPLODE_SPRING = { damping: 13, stiffness: 150, mass: 0.8 };

/* Géométrie des objets, en coordonnées de la carte RECOLLÉE (= écran au repos). */
const THUMB = { x: s6x(44), y: s6y(50), w: 200 * Z6, h: 200 * Z6 };
const LABEL = { x: s6x(290), y: s6y(40) };
const NAME = { x: s6x(290), y: s6y(64), w: 520, h: 64 };
/** Le prix de S6 (bord droit, haut), posé sur le verre L2 : il cède sa place à l'étiquette suspendue sur « son prix ». */
const PRICE = { right: CARD.x + CARD.w - 44 * Z6, y: s6y(60), w: 210, h: 64 };
const REASON = { x: s6x(290), y: s6y(178), w: (980 - 290 - 44) * Z6 };
const PILL = { x: s6x(290), y: s6y(122), w: 172, h: 34 * Z6 };
/** Centre du point vert de la pastille, depuis son bord gauche (marge 14 + rayon 5, × Z6). */
const PILL_DOT = 19 * Z6;
/** Ligne du challenge : sous la raison (bas de la raison ≈ 565), dans la carte (bas 760). */
const BADGE = { x: s6x(290), y: 604, w: 240, h: 64 };
/** Le badge entre par la droite, sur sa propre ligne (hors du verre, donc hors cadre pendant le gros plan). */
const BADGE_FROM_X = 1760;
const RIBBON = { x: BADGE.x + BADGE.w + 20, y: 608, w: 520, h: 56 };
/** La jauge : tuile basse à droite du ruban (haut 597 > bas de la raison 565, bas 747 < bas de la carte 760). */
const GAUGE = { cx: 1564, cy: 672, tileW: 168, tileH: 150 };
/** L'étiquette de prix : point d'accroche (trou) dans le calque L2, juste au-dessus du prix qu'elle remplace ; la
 * ficelle part d'un clou posé SOUS la mention. */
const TAG_ANCHOR = { x: PRICE.right - PRICE.w / 2, y: PRICE.y - 22 };
const TAG = { w: 300, h: 140 };
const NAIL_Y = 122;
/** L'annotation « EN STOCK · 29 » (calque L2) : à droite de la pastille, sur la feuille blanche (entre le nom et la raison). */
const STOCK_LABEL = { x: PILL.x + PILL.w + 56, y: PILL.y + 2, w: 300, h: 44 };

const NAME_TEXT = "Ultra-Levure 200 mg";
const REASON_TEXT = "Antibiotique : la flore intestinale peut être perturbée";

type Pt = [number, number];
type Rect = { x: number; y: number; w: number; h: number };
/** L'état de la vue éclatée à l'instant t : écartement de chaque calque, angle d'orbite. */
type View = { E: number[]; theta: number };

const DEG = Math.PI / 180;

function anchors(time: Time) {
  const a1 = time.A("P9", 0);
  const a2 = time.A("P9", 1);
  const a3 = time.A("P9", 2);
  const a4 = time.A("P9", 3);
  const a5 = time.A("P9", 4);
  const end = time.Z("P9");
  // Le fouet part AVEC l'entrée de S8 (S8 arrive de la droite en fouet à win.S8.start) : jamais d'image sans scène
  // dessous. Il doit être sorti avant le démontage de S7 (win.S7.end).
  const whip = Math.max(end + 0.1, time.win.S8.start);
  const whipDur = Math.max(6 * F, Math.min(10 * F, time.win.S7.end - whip));
  // Le recollement « sur le temps suivant » (snap(seg5 + .5)) tomberait dans le fouet : on le garde juste avant.
  const glue = Math.min(time.snap(a5 + 0.5), whip - 0.16);
  // Atterrissage du badge (20 images de pièce qui roule).
  const land = a4 + 20 * F;
  // Le ruban se déroule dès que le badge est posé (au plus tard sur « du moment ») : il faut le temps de le lire.
  const ribbon = Math.min(a5, land + 0.05);
  // Les rouleaux du prix : 0,38 s, 3 images d'écart, trois chiffres.
  const slotDur = 0.38;
  const slotLock = a3 + slotDur + 2 * 3 * F;
  return { a1, a2, a3, a4, a5, end, whip, whipDur, glue, land, ribbon, slotDur, slotLock };
}

type Anchors = ReturnType<typeof anchors>;

/** Orbite de la caméra (degrés) : 17°·sin(2π(t − a1)/3) — un tour complet d'ici le recollement. */
const orbit = (t: number, a1: number) => 17 * Math.sin((2 * Math.PI * (t - a1)) / 3);

/** L'état de la vue éclatée : chaque calque s'écarte (ressort, 1,5 image d'écart du fond vers l'avant), recollement en 6 images. */
function viewAt(t: number, A: Anchors): View {
  const eOut = prog(t, A.glue, 6 * F, IN_OUT);
  const E = [0, 1, 2, 3].map((i) => ressort(t, A.a1 + i * 1.5 * F, EXPLODE_SPRING) * (1 - eOut));
  return { E, theta: t < A.a1 ? 0 : orbit(t, A.a1) };
}

/**
 * Projection d'un point (x, y) du calque i : échelle autour du centre de la carte, décalage (dx, dy, dz), rotation Y
 * autour du centre, perspective PERSP. Même calcul que layerCss (transformations CSS appliquées de droite à gauche).
 */
function proj(v: View, i: number, x: number, y: number): Pt {
  const L = LAYERS[i];
  const e = v.E[i];
  const s = lerp(1, STACK_SCALE, e);
  const X = (x - CARD.cx) * s + L.dx * e;
  const Y = (y - CARD.cy) * s + L.dy * e;
  const Z = L.dz * e;
  const th = v.theta * e * DEG;
  const X2 = X * Math.cos(th) + Z * Math.sin(th);
  const Z2 = -X * Math.sin(th) + Z * Math.cos(th);
  const w = 1 - Z2 / PERSP;
  return [CARD.cx + X2 / w, CARD.cy + Y / w];
}

function layerCss(v: View, i: number) {
  const L = LAYERS[i];
  const e = v.E[i];
  const s = lerp(1, STACK_SCALE, e);
  const th = v.theta * e;
  return (
    `translate(${CARD.cx}px, ${CARD.cy}px) perspective(${PERSP}px) rotateY(${th.toFixed(4)}deg) ` +
    `translate3d(${(L.dx * e).toFixed(3)}px, ${(L.dy * e).toFixed(3)}px, ${(L.dz * e).toFixed(3)}px) scale(${s.toFixed(5)}) translate(${-CARD.cx}px, ${-CARD.cy}px)`
  );
}

/** Boîte englobante (écran) d'un rectangle d'un calque. */
function mapRect(v: View, i: number, r: Rect): Rect {
  const pts = [proj(v, i, r.x, r.y), proj(v, i, r.x + r.w, r.y), proj(v, i, r.x, r.y + r.h), proj(v, i, r.x + r.w, r.y + r.h)];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

const unionRect = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

const rectC = (r: Rect): Pt => [r.x + r.w / 2, r.y + r.h / 2];

/** Ressort générique (secondes), 0 avant `at`. */
const springAt = (t: number, at: number, damping: number, stiffness: number, mass = 1) =>
  t < at ? 0 : spring({ frame: (t - at) * FPS, fps: FPS, config: { damping, stiffness, mass } });

/* ------------------------------------------------------------------------------------------------------------
 * LA CAMÉRA : la visite (un arrêt par segment), calculée en JS pour que les objets « écran » (laser) visent juste.
 * ---------------------------------------------------------------------------------------------------------- */

type Cam = { zoom: number; x: number; y: number; origin: [number, number]; drift: number; shakes: Shake[] };

const CAM_EASE = Easing.bezier(0.62, 0, 0.14, 1);
const CAM_O: [number, number] = [960, 540];

function cameraAt(t: number, A: Anchors, foci: { photo: Pt; stock: Pt; tag: Pt; badge: Pt }): Cam {
  const stops: { at: number; dur: number; f: Pt; z: number; tau: Pt }[] = [
    // Les zooms compensent le recul de la pile (feuille produit ≈ ×0,71, verre stock ≈ ×0,82, verre challenge ≈ ×0,97) :
    // à l'écran, chaque élément visé paraît ≈ 1,2 à 1,3 fois sa taille au repos. Les cadrages laissent libre le rectangle
    // de la mention (x > 1600, y < 90) : la feuille et les verres restent sous y ≈ 110.
    { at: A.a1 - 0.02, dur: 0.4, f: foci.photo, z: 1.7, tau: [640, 470] },
    { at: A.a2 - 0.08, dur: 0.34, f: foci.stock, z: 1.5, tau: [1000, 470] },
    { at: A.a3 - 0.06, dur: 0.36, f: foci.tag, z: 1.3, tau: [1080, 540] },
    { at: A.a4 - 0.04, dur: 0.34, f: foci.badge, z: 1.25, tau: [740, 690] },
    { at: A.a5 + 0.02, dur: 0.42, f: [960, 480], z: 1, tau: [960, 480] },
  ];
  let f: Pt = [960, 480];
  let z = 1;
  let tau: Pt = [960, 480];
  for (const s of stops) {
    const k = prog(t, s.at, s.dur, CAM_EASE);
    if (k <= 0) break;
    f = mix2(f, s.f, k);
    z = lerp(z, s.z, k);
    tau = mix2(tau, s.tau, k);
  }
  // Respiration pendant les arrêts : la caméra n'est jamais figée (dérive douce au bruit, ±5 px, +1 % de zoom).
  const live = prog(t, A.a1, 0.3) * (1 - prog(t, A.a5, 0.4));
  z += 0.012 * live * Math.sin((t - A.a1) * 2.2);
  const wx = 5 * live * noise2D("s7-cam-x", t * 0.6, 0);
  const wy = 4 * live * noise2D("s7-cam-y", 0, t * 0.6 + 3.1);
  return {
    zoom: z,
    x: tau[0] - (CAM_O[0] + z * (f[0] - CAM_O[0])) + wx,
    y: tau[1] - (CAM_O[1] + z * (f[1] - CAM_O[1])) + wy,
    origin: CAM_O,
    drift: 0,
    shakes: [
      { at: A.a3 + 0.2, amp: 5, frames: 10 },
      { at: A.land, amp: 9, frames: 12 },
      { at: A.glue + 6 * F, amp: 6, frames: 10 },
    ],
  };
}

/** Position écran d'un point du monde vu par la caméra (même calcul que cameraTransform du kit, dérive 0). */
function camScreen(cam: Cam, t: number, p: Pt, depth = 1): Pt {
  let sx = 0;
  let sy = 0;
  for (const s of cam.shakes) {
    const o = shake(t, s.at, s.amp, s.frames);
    sx += o.x;
    sy += o.y;
  }
  const Z = 1 + (cam.zoom - 1) * depth;
  const [ox, oy] = cam.origin;
  return [ox + Z * (p[0] - ox) + (cam.x + sx) * depth, oy + Z * (p[1] - oy) + (cam.y + sy) * depth];
}

/* ------------------------------------------------------------------------------------------------------------
 * LE ROBOT : la piste, et la pointe du stylo de poche (pour le stylo-laser), mesurée dans le SVG de mascot.tsx.
 * ---------------------------------------------------------------------------------------------------------- */

const ROBOT_SIZE = 340;
/** Parallaxe du robot : il est au premier plan, presque fixe pendant que la caméra visite la carte. */
const ROBOT_DEPTH = 0.12;
/** La pointe du stylo dans la poche de la blouse (mascot.tsx : rect x 64, y 66, largeur 2,6). */
const PEN_TIP: Pt = [65.3, 65.6];

function hostTrack(time: Time): Track {
  const { a2, a3, a4, a5, win } = { ...anchors(time), win: time.win.S7 };
  return {
    id: `S7-host-${Math.round(a2 * 600)}`,
    seed: 707,
    until: win.end + 0.3,
    events: [
      { t: a2 - 0.15, kind: "burst", burst: "wave" },
      { t: a2 + 0.32, kind: "glance", x: 0.8, y: -0.45, dur: 0.75 },
      { t: a3 + 0.04, kind: "glance", x: 1, y: -0.85, dur: 0.6 },
      { t: a4 + 0.02, kind: "emote", emote: "surprised", dur: 0.3 },
      { t: a4 + 0.34, kind: "emote", emote: "proud", dur: 0.55 },
      { t: a4 + 0.34, kind: "glance", x: 0.9, y: -0.3, dur: 0.6 },
      { t: a5 + 0.1, kind: "emote", emote: "wink", dur: 0.6 },
    ],
  };
}

/** Position (monde du robot) de la pointe du stylo, d'après la pose de l'image (même transformation que le corps du SVG). */
function penPoint(track: Track, t: number, left: number, top: number): Pt {
  const frames = simulate(track);
  const f = frames[Math.max(0, Math.min(frames.length - 1, Math.round(t * FPS)))];
  const p = f.pose;
  let x = 50 + (PEN_TIP[0] - 50) * p.sx;
  let y = 84 + (PEN_TIP[1] - 84) * p.sy;
  const rot = (px: number, py: number, cx: number, cy: number, a: number): Pt => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [cx + (px - cx) * c - (py - cy) * s, cy + (px - cx) * s + (py - cy) * c];
  };
  [x, y] = rot(x, y, 50, 46, p.roll);
  [x, y] = rot(x, y, 50, 84, p.tilt);
  x += p.ox;
  y += p.oy;
  const k = ROBOT_SIZE / 100;
  return [left + x * k, top + (y + 4) * k];
}

/* ------------------------------------------------------------------------------------------------------------
 * PETITS COMPOSANTS
 * ---------------------------------------------------------------------------------------------------------- */

function Abs({ style, children }: { style: CSSProperties; children?: ReactNode }) {
  return <div style={{ position: "absolute", ...style }}>{children}</div>;
}

/** Le style du nom dans la carte de S6 (36 px × Z6), pour que la coupe soit invisible. */
const NAME_STYLE: CSSProperties = { fontFamily: JAKARTA, fontWeight: 800, fontSize: 36 * Z6, letterSpacing: "-0.02em", color: INK, whiteSpace: "nowrap" };

/**
 * Le nom, DÉJÀ écrit en S6 : il reste en place, en un seul bloc de texte (même crénage que S6 : aucune lettre ne bouge
 * à la coupe). Seule une vague menthe le parcourt de gauche à droite (texte rempli par un dégradé qui glisse, 0,5 s),
 * au rythme de la lame de scan.
 */
function NameCascade({ t, at }: { t: number; at: number }) {
  const u = (t - at) / 0.5;
  if (u <= 0 || u >= 1) return <div style={NAME_STYLE}>{NAME_TEXT}</div>;
  const c = lerp(-18, 118, IN_OUT(u));
  const hot = "#0FA58E";
  return (
    <div
      style={{
        ...NAME_STYLE,
        color: "transparent",
        backgroundImage: `linear-gradient(90deg, ${INK} 0%, ${INK} ${(c - 16).toFixed(1)}%, ${hot} ${(c - 4).toFixed(1)}%, #36E8C8 ${c.toFixed(1)}%, ${hot} ${(c + 4).toFixed(1)}%, ${INK} ${(c + 16).toFixed(1)}%, ${INK} 100%)`,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
      }}
    >
      {NAME_TEXT}
    </div>
  );
}

/** Largeur estimée de chaque légende (Mono 20 px, espacement .14em, marges) : sert à la faire disparaître avant qu'un
 * gros plan ne la coupe au bord gauche du cadre. */
const TAG_TEXT = ["", "PRODUIT", "STOCK · PRIX", "CHALLENGE"] as const;
const tagWidth = (i: number) => (2 + TAG_TEXT[i].length) * 14.8 + 12 + 31;

/** La légende d'un calque (pastille sombre, numéro menthe), à GAUCHE de la carte, reliée au bord par un trait. */
function LayerTag({ e, idx, y, gold = 0, fade = 1 }: { e: number; idx: number; y: number; gold?: number; fade?: number }) {
  const text = TAG_TEXT[idx];
  const k = clamp01(e) * fade;
  if (k <= 0.02) return null;
  const col = gold > 0.5 ? PB.goldHi : PB.mint2;
  return (
    <>
      <Abs style={{ left: CARD.x - 60, top: y + 21, width: 60 * k, height: 2, background: rgba(col, 0.7) }} />
      <Abs style={{ left: CARD.x - 7, top: y + 16, width: 12, height: 12, borderRadius: 6, background: col, boxShadow: `0 0 10px ${rgba(col, 0.9)}`, opacity: k }} />
      <Abs
        style={{
          right: 1920 - (CARD.x - 64),
          top: y,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 14px",
          borderRadius: 10,
          background: "rgba(8,14,18,.82)",
          border: `1.5px solid ${rgba(col, 0.45)}`,
          ...digits(20, 600),
          letterSpacing: "0.14em",
          color: "rgba(255,255,255,.9)",
          whiteSpace: "pre",
          opacity: k,
          transform: `translateX(${((1 - k) * 30).toFixed(1)}px)`,
        }}
      >
        <span style={{ color: col }}>{`0${idx}`}</span>
        <span>{text}</span>
      </Abs>
    </>
  );
}

/** Un verre de calque : vitre dépolie bien visible, bord menthe, coins en L épais, ombre portée. */
function Pane({ e, gold = 0 }: { e: number; gold?: number }) {
  const k = clamp01(e);
  if (k <= 0.01) return null;
  const arm = 40;
  const col = gold > 0.5 ? PB.goldHi : PB.mint2;
  const corner = (x: number, y: number, sx: number, sy: number, n: number) => (
    <path key={n} d={`M ${x} ${y + sy * arm} L ${x} ${y} L ${x + sx * arm} ${y}`} fill="none" stroke={col} strokeWidth={5} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${rgba(col, 0.8)})` }} />
  );
  const { x, y, w, h } = CARD;
  return (
    <>
      <Abs
        style={{
          left: x,
          top: y,
          width: w,
          height: h,
          borderRadius: CARD.r,
          border: `2px solid ${rgba(col, 0.55 * k)}`,
          background: `linear-gradient(135deg, rgba(255,255,255,${(0.2 * k).toFixed(3)}) 0%, rgba(255,255,255,${(0.06 * k).toFixed(3)}) 30%, rgba(170,255,240,${(0.05 * k).toFixed(3)}) 100%)`,
          boxShadow: `0 40px 70px rgba(0,0,0,${(0.3 * k).toFixed(3)}), inset 0 0 50px ${rgba(PB.mint, 0.1 * k)}, inset 0 2px 0 rgba(255,255,255,${(0.35 * k).toFixed(3)})`,
          boxSizing: "border-box",
        }}
      />
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity: k }}>
        {corner(x - 8, y - 8, 1, 1, 0)}
        {corner(x + w + 8, y - 8, -1, 1, 1)}
        {corner(x - 8, y + h + 8, 1, -1, 2)}
        {corner(x + w + 8, y + h + 8, -1, -1, 3)}
      </svg>
    </>
  );
}

/** Étoile à 4 branches (paillettes, centre de la jauge). */
const star4 = (r: number) => `M 0 ${-r} L ${r * 0.28} ${-r * 0.28} L ${r} 0 L ${r * 0.28} ${r * 0.28} L 0 ${r} L ${-r * 0.28} ${r * 0.28} L ${-r} 0 L ${-r * 0.28} ${-r * 0.28} Z`;
const star5 = (r: number) => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(Math.cos(a) * rr).toFixed(2)} ${(Math.sin(a) * rr).toFixed(2)}`);
  }
  return `M ${pts.join(" L ")} Z`;
};

/* ------------------------------------------------------------------------------------------------------------
 * LA SCÈNE
 * ---------------------------------------------------------------------------------------------------------- */

export function Scene07(props: SceneProps) {
  const { t, time } = props;
  const A = anchors(time);
  // Le fouet de sortie : toute la scène part à gauche, avec un VRAI flou directionnel (gaussien horizontal piloté par
  // la vitesse) — pas d'échantillons empilés, donc pas de copies en pelure d'oignon.
  const whipX = tween(t, A.whip, A.whipDur, 0, -1920, WHIP);
  const vel = Math.abs(whipX - tween(t - F, A.whip, A.whipDur, 0, -1920, WHIP));
  const sd = Math.min(110, vel * 0.32);
  return (
    // Pas de fond sur la racine : pendant le fouet, S8 (dessous) doit apparaître derrière la scène qui part.
    <AbsoluteFill>
      {sd > 0.5 && (
        <svg width={0} height={0} style={{ position: "absolute" }}>
          <defs>
            <filter id="s7-whip-blur" x="-25%" y="0%" width="150%" height="100%" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation={`${sd.toFixed(1)} 0`} edgeMode="none" />
            </filter>
          </defs>
        </svg>
      )}
      <AbsoluteFill style={{ transform: `translateX(${whipX.toFixed(1)}px)`, filter: sd > 0.5 ? "url(#s7-whip-blur)" : undefined }}>
        <World {...props} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function World({ t, time }: SceneProps) {
  const A = anchors(time);
  const { a1, a2, a3, glue, land, slotDur, slotLock } = A;
  const track = hostTrack(time);

  const v = viewAt(t, A);
  const E = v.E;
  const e = E[3];

  // ---- Repères (monde, avant caméra).
  const photoC = rectC(mapRect(v, 1, THUMB));
  const stockR = mapRect(v, 2, unionRect(PILL, STOCK_LABEL));
  const pillDot = proj(v, 2, PILL.x + PILL_DOT, PILL.y + PILL.h / 2);
  const tagAnchor = proj(v, 2, TAG_ANCHOR.x, TAG_ANCHOR.y);
  const tagR: Rect = { x: tagAnchor[0] - TAG.w / 2, y: tagAnchor[1] - 26, w: TAG.w, h: TAG.h + 62 };
  const badgeR = mapRect(v, 3, BADGE);
  const badgeC = rectC(badgeR);

  const cam = cameraAt(t, A, { photo: photoC, stock: rectC(stockR), tag: rectC(tagR), badge: badgeC });
  // Le clou de l'étiquette : toujours à y = NAIL_Y À L'ÉCRAN (sous la mention « Illustration · exemples », quel que soit
  // le cadrage) ; en x, il suit l'accroche avec un temps de retard (la ficelle penche quand la pile tourne, puis revient).
  const lagX = [0.07, 0.14, 0.21].reduce((acc, d) => acc + proj(viewAt(t - d, A), 2, TAG_ANCHOR.x, TAG_ANCHOR.y)[0], 0) / 3;
  const nail: Pt = [lagX, CAM_O[1] + (NAIL_Y - CAM_O[1] - cam.y) / cam.zoom];

  // ---- Le robot qui surgit en bas à gauche (RESSORT) : centre x 40 → 380, haut de la tête y 1100 → 680 (on voit la
  // tête, le bras et le stylo de poche).
  const rk = ressort(t, a2 - 0.15);
  const robotCx = lerp(40, 380, rk);
  const robotTop = lerp(1100, 680, rk) + 4 * Math.sin((t - a2) * 2.6);
  const robotLeft = robotCx - ROBOT_SIZE / 2;
  const penS = camScreen(cam, t, penPoint(track, t, robotLeft, robotTop), ROBOT_DEPTH);
  const pillS = camScreen(cam, t, pillDot);
  // Les légendes des calques s'effacent quand un gros plan les pousserait hors du cadre (jamais de texte coupé au bord).
  const tagFade = (i: number, y: number) => clamp01((camScreen(cam, t, proj(v, i, CARD.x - 64 - tagWidth(i), y + 20))[0] - 12) / 48);

  return (
    <AbsoluteFill>
      <Backdrop t={t} />
      <DotGrid t={t} opacity={time.look(t).dots} wave={{ at: a1, x: 960, y: 480, speed: 1800, width: 160, strength: 0.55 }} />
      {/* Arrière-plan lointain : poussière menthe et lueur derrière la carte, en parallaxe 0,3. */}
      <Camera t={t} {...cam} depth={0.3} blur={2}>
        <Spot x={960 + 30 * Math.sin(t * 0.9)} y={470} r={760} color={PB.teal} alpha={0.28} />
        <Spot x={1500} y={260} r={420} color={PB.mint} alpha={0.07 + 0.08 * pulse(t, a2, 0.1, 0.2, 0.6)} />
        <Spot x={1120} y={560} r={520} color={PB.gold} alpha={0.16 * prog(t, land, 0.25) * (1 - prog(t, glue, 0.3))} />
        <Dust t={t} count={46} seed="s7-dust" color={PB.mint2} alpha={0.22} size={[1.5, 3.5]} />
      </Camera>

      <Camera t={t} {...cam}>
        {/* L0 · la plaque de fond : un plan technique (quadrillage menthe), caché sous la feuille au repos. */}
        <Layer css={layerCss(v, 0)} blur={LAYERS[0].blur * clamp01(E[0])}>
          <BlueprintPlate e={E[0]} />
        </Layer>

        {/* L1 · la feuille produit. */}
        <Layer css={layerCss(v, 1)}>
          <L1Sheet t={t} A={A} />
          <LayerTag e={E[1]} idx={1} y={250} fade={tagFade(1, 250)} />
        </Layer>

        {/* Lignes de construction de la vue éclatée : les coins des calques reliés en pointillés. */}
        <ExplodeGuides v={v} e={e} />

        {/* L2 · verre stock et prix : pastille, anneaux radar, annotation « EN STOCK · 29 » et prix de S6, tous dans le plan. */}
        <Layer css={layerCss(v, 2)}>
          <Pane e={E[2]} />
          <StockPill t={t} a2={a2} />
          <RadarRings t={t} at={a2} until={a3 + 0.1} x={PILL.x + PILL_DOT} y={PILL.y + PILL.h / 2} />
          <StockCallout t={t} a2={a2} />
          <CardPrice t={t} a3={a3} e={E[2]} />
          <LayerTag e={E[2]} idx={2} y={420} fade={tagFade(2, 420)} />
        </Layer>

        {/* L3 · verre challenge. */}
        <Layer css={layerCss(v, 3)}>
          <Pane e={E[3]} gold={prog(t, land, 0.2)} />
          <ChallengeLayer t={t} A={A} />
          <LayerTag e={E[3]} idx={3} y={590} gold={prog(t, land, 0.2)} fade={tagFade(3, 590)} />
        </Layer>

        {/* L'étiquette de prix suspendue à son clou, et la puce Marge. */}
        <PriceTag t={t} a3={a3} nail={nail} anchor={tagAnchor} slotDur={slotDur} slotLock={slotLock} glue={glue} />

        {/* Crochets de visée : la « loupe » qui passe d'un élément à l'autre. */}
        <FocusBrackets t={t} A={A} v={v} stockR={stockR} tagR={tagR} badgeR={badgeR} />

        {/* Paillettes dorées à l'atterrissage du badge. */}
        <Sparkles t={t} at={land} x={badgeC[0]} y={badgeC[1]} />

        {/* Éclair menthe sur le bord au recollement. */}
        <GlueFlash t={t} at={glue + 5 * F} />
      </Camera>

      {/* Le robot, au premier plan (parallaxe faible : il reste dans le cadre pendant la visite). */}
      <Camera t={t} {...cam} depth={ROBOT_DEPTH}>
        <Abs style={{ left: robotLeft, top: robotTop, width: ROBOT_SIZE, opacity: t < a2 - 0.15 ? 0 : 1 }}>
          <Mascot track={track} t={t} size={ROBOT_SIZE} />
        </Abs>
      </Camera>

      {/* Le stylo-laser (en coordonnées écran : de la poche du robot à la pastille, quelle que soit la caméra). */}
      <PenLaser t={t} on={a2 + 0.08} off={a3 - 0.08} from={penS} to={pillS} />
      <PenGlow t={t} on={a2 + 0.08} off={a3 - 0.08} at={penS} />
    </AbsoluteFill>
  );
}

function Layer({ css, blur = 0, children }: { css: string; blur?: number; children: ReactNode }) {
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "0 0", transform: css, filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : undefined }}>
      {children}
    </div>
  );
}

/** L0 : plaque sombre quadrillée, bord menthe — on ne la voit qu'en vue éclatée (la feuille opaque la couvre au repos). */
function BlueprintPlate({ e }: { e: number }) {
  const k = clamp01(e);
  return (
    <Abs
      style={{
        left: CARD.x,
        top: CARD.y,
        width: CARD.w,
        height: CARD.h,
        borderRadius: CARD.r,
        background: `linear-gradient(160deg, #12474A 0%, #0A2A2E 100%)`,
        backgroundImage: `linear-gradient(${rgba(PB.mint2, 0.14)} 1.5px, transparent 1.5px), linear-gradient(90deg, ${rgba(PB.mint2, 0.14)} 1.5px, transparent 1.5px), linear-gradient(160deg, #12474A 0%, #0A2A2E 100%)`,
        backgroundSize: "56px 56px, 56px 56px, 100% 100%",
        border: `2px solid ${rgba(PB.mint2, 0.5 * k)}`,
        boxShadow: "0 30px 80px rgba(0,0,0,.5)",
        boxSizing: "border-box",
      }}
    />
  );
}

/** L1 : feuille blanche, vignette, nom (vague menthe), raison tenue ; bord doré quand le challenge arrive. */
function L1Sheet({ t, A }: { t: number; A: Anchors }) {
  const { a1, land, glue } = A;
  // Bord doré : tiret qui court sur le contour (un tour en 0,5 s), puis bord doré tenu.
  const gIn = prog(t, land, 0.18, SNAP) * (1 - prog(t, glue, 6 * F));
  const run = clamp01((t - land) / 0.5);
  // La boîte de la vignette se met à flotter une fois l'éclatement lancé (immobile à la coupe, comme dans S6).
  const bobK = prog(t, a1 + 0.15, 0.4, IN_OUT);
  const bob = 5 * bobK * Math.sin((t - a1 - 0.15) * 2.1);
  return (
    <>
      <Abs style={{ left: CARD.x, top: CARD.y, width: CARD.w, height: CARD.h, borderRadius: CARD.r, background: "#FFFFFF", boxShadow: `0 ${30 * Z6}px ${80 * Z6}px rgba(0,0,0,.45), 0 ${2 * Z6}px 0 rgba(255,255,255,.6) inset`, overflow: "hidden" }}>
        {/* Reflet qui traverse la feuille (vie permanente). */}
        <div style={{ position: "absolute", top: -200, bottom: -200, width: 220, left: -400 + ((t - a1) * 900) % 2600, transform: "rotate(18deg)", background: "linear-gradient(90deg, rgba(54,232,200,0) 0%, rgba(54,232,200,.07) 50%, rgba(54,232,200,0) 100%)" }} />
      </Abs>
      {/* Plan de scan : une lame de lumière menthe traverse la feuille à l'éclatement. */}
      {t > a1 && t < a1 + 0.5 && (
        <Abs style={{ left: CARD.x, top: CARD.y, width: CARD.w, height: CARD.h, borderRadius: CARD.r, overflow: "hidden", zIndex: 5 }}>
          <div style={{ position: "absolute", top: 0, bottom: 0, width: 160, left: tween(t, a1 + 2 * F, 0.42, -200, CARD.w + 40, IN_OUT), background: `linear-gradient(90deg, rgba(54,232,200,0) 0%, rgba(54,232,200,.22) 70%, ${rgba(PB.mint2, 0.9)} 96%, rgba(255,255,255,0) 100%)`, mixBlendMode: "multiply" }} />
        </Abs>
      )}
      {/* Vignette produit (celle de S6 : carré 200 × Z6, image 180 × Z6). */}
      <Abs style={{ left: THUMB.x, top: THUMB.y, width: THUMB.w, height: THUMB.h, borderRadius: 20 * Z6, background: "linear-gradient(160deg, #F2F8F7, #E3EFEC)", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 50, right: 50, bottom: 22, height: 18, borderRadius: "50%", background: "rgba(11,15,20,.10)", filter: "blur(7px)", opacity: bobK, transform: `scaleX(${(1 - bob / 60).toFixed(3)})` }} />
        <Img src={staticFile("produits/boites/ultra-levure-200-mg.webp")} style={{ position: "absolute", left: 10 * Z6, top: 10 * Z6 + bob, width: 180 * Z6, height: 180 * Z6, objectFit: "contain" }} />
      </Abs>
      {/* Libellé, nom et raison : déjà écrits en S6, ils restent en place, au même pixel. */}
      <Abs style={{ left: LABEL.x, top: LABEL.y, fontFamily: JAKARTA, fontWeight: 700, fontSize: 15 * Z6, letterSpacing: "0.14em", textTransform: "uppercase", color: "#0F766E" }}>Conseil associé</Abs>
      <Abs style={{ left: NAME.x, top: NAME.y }}>
        <NameCascade t={t} at={a1 + 2 * F} />
      </Abs>
      <Abs style={{ left: REASON.x, top: REASON.y, width: REASON.w, fontFamily: JAKARTA, fontWeight: 600, fontSize: 24 * Z6, lineHeight: 1.32, color: "#2A333D" }}>{REASON_TEXT}</Abs>
      {/* Bord doré. */}
      {gIn > 0.01 && (
        <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
          <defs>
            <linearGradient id="s7-gold-edge" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={PB.goldHi} />
              <stop offset="0.55" stopColor={PB.gold} />
              <stop offset="1" stopColor={PB.goldLo} />
            </linearGradient>
          </defs>
          <rect x={CARD.x - 1.5} y={CARD.y - 1.5} width={CARD.w + 3} height={CARD.h + 3} rx={CARD.r + 1.5} fill="none" stroke="url(#s7-gold-edge)" strokeWidth={4} opacity={gIn * (0.35 + 0.65 * run)} style={{ filter: `drop-shadow(0 0 10px ${rgba(PB.gold, 0.7)})` }} />
          <rect x={CARD.x - 1.5} y={CARD.y - 1.5} width={CARD.w + 3} height={CARD.h + 3} rx={CARD.r + 1.5} fill="none" stroke="#FFF4D6" strokeWidth={6} strokeLinecap="round" pathLength={1000} strokeDasharray="90 910" strokeDashoffset={-1000 * SNAP(run) - 120} opacity={gIn * (run < 1 ? 1 : Math.max(0, 1 - (t - A.land - 0.5) / 0.2))} style={{ filter: `drop-shadow(0 0 12px ${rgba(PB.goldHi, 0.95)})` }} />
        </svg>
      )}
    </>
  );
}

/** Pastille « En stock » (L2) : présente depuis S6 ; elle s'allume sur « votre stock ». */
function StockPill({ t, a2 }: { t: number; a2: number }) {
  const hot = prog(t, a2, 6 * F, SNAP);
  const beat = pulse(t, a2, 3 * F, 0, 14 * F) + pulse(t, a2 + 10 * F, 3 * F, 0, 14 * F) * 0.6;
  return (
    <Abs
      style={{
        left: PILL.x,
        top: PILL.y,
        height: PILL.h,
        borderRadius: 17 * Z6,
        background: rgba(PB.stock, 0.12 + 0.1 * hot),
        boxShadow: hot > 0 ? `0 0 0 ${(2 * hot).toFixed(1)}px ${rgba(PB.stock, 0.6)}, 0 0 ${(30 * beat).toFixed(0)}px ${rgba(PB.stock, 0.55 * beat)}` : undefined,
        display: "flex",
        alignItems: "center",
        gap: 8 * Z6,
        padding: `0 ${14 * Z6}px`,
        boxSizing: "border-box",
        transform: `scale(${(1 + 0.06 * beat).toFixed(3)})`,
        transformOrigin: "0 50%",
      }}
    >
      <span style={{ flex: "none", width: 10 * Z6, height: 10 * Z6, borderRadius: 5 * Z6, background: PB.stock, boxShadow: hot > 0 ? `0 0 ${(6 + 10 * beat).toFixed(0)}px ${rgba(PB.stock, 0.9)}` : undefined }} />
      <span style={{ fontFamily: JAKARTA, fontWeight: 600, fontSize: 18 * Z6, color: "#1B794A", whiteSpace: "nowrap" }}>En stock</span>
    </Abs>
  );
}

/** Le prix de la carte de S6 (Mono 40 × Z6, bord droit) : tenu tel quel, il s'envole sur « son prix » (montée, grossit,
 * s'efface en 6 images) au moment où l'étiquette suspendue tombe à sa place. Sur le verre L2, il sort de la feuille
 * blanche : une plaquette blanche apparaît derrière lui avec l'écartement (invisible à la coupe), sinon il serait noir
 * sur fond sombre. */
function CardPrice({ t, a3, e }: { t: number; a3: number; e: number }) {
  const k = prog(t, a3 - 2 * F, 6 * F, SNAP);
  if (k >= 1) return null;
  const plate = clamp01(e * 1.6);
  return (
    <Abs
      style={{
        right: 1920 - PRICE.right - 16,
        top: PRICE.y - 8,
        padding: "8px 16px",
        borderRadius: 16,
        background: plate > 0.01 ? `rgba(255,255,255,${(0.97 * plate).toFixed(3)})` : undefined,
        boxShadow: plate > 0.01 ? `0 18px 40px rgba(0,0,0,${(0.35 * plate).toFixed(3)}), 0 0 0 1.5px ${rgba(PB.mint2, 0.45 * plate)}` : undefined,
        fontFamily: MONO,
        fontWeight: 700,
        fontSize: 40 * Z6,
        color: INK,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        opacity: 1 - k,
        transform: k > 0 ? `translateY(${(-30 * k).toFixed(1)}px) scale(${(1 + 0.25 * k).toFixed(3)})` : undefined,
        transformOrigin: "50% 50%",
        filter: k > 0 ? `blur(${(4 * k).toFixed(1)}px)` : undefined,
      }}
    >
      8,90 €
    </Abs>
  );
}

function RadarRings({ t, at, until, x, y }: { t: number; at: number; until: number; x: number; y: number }) {
  // Deux anneaux francs (20 images, 10 d'écart), puis un écho doux toutes les 0,5 s tant que le stock est désigné.
  const rings: { d: number; a: number; w: number }[] = [
    { d: 0, a: 0.8, w: 3 },
    { d: 10 * F, a: 0.8, w: 3 },
  ];
  for (let d = 0.5; at + d < until; d += 0.5) rings.push({ d, a: 0.35, w: 2 });
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
      {rings.map(({ d, a, w }, k) => {
        const u = (t - at - d) / (20 * F);
        if (u < 0 || u > 1) return null;
        const r = 18 * (1 + 1.2 * SNAP(u)) * 1.6;
        return <circle key={k} cx={x} cy={y} r={r} fill="none" stroke={PB.stock} strokeWidth={w} opacity={a * (1 - u)} />;
      })}
    </svg>
  );
}

/** « EN STOCK · 29 » (dans le plan L2) : un trait d'annotation se trace (10 images), l'étiquette glisse et le 29 roule. */
function StockCallout({ t, a2 }: { t: number; a2: number }) {
  if (t < a2) return null;
  const glow = 0.5 + 0.5 * Math.sin((t - a2) * 9);
  const k = prog(t, a2, 10 * F, SNAP);
  const x0 = PILL.x + PILL.w + 10;
  const y0 = PILL.y + PILL.h / 2;
  const x1 = STOCK_LABEL.x - 14;
  const y1 = STOCK_LABEL.y + 18;
  const L = Math.hypot(x1 - x0, y1 - y0);
  const lab = prog(t, a2 + 6 * F, 12 * F, SNAP);
  return (
    <>
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <line x1={x0} y1={y0} x2={x1} y2={y1} stroke={PB.stock} strokeWidth={2.5} strokeDasharray={`${L} ${L}`} strokeDashoffset={L * (1 - k)} strokeLinecap="round" />
        <circle cx={x0} cy={y0} r={5 * k} fill={PB.stock} />
        <circle cx={x1} cy={y1} r={4 * prog(t, a2 + 9 * F, 4 * F)} fill={PB.stock} />
      </svg>
      <Abs style={{ left: STOCK_LABEL.x, top: STOCK_LABEL.y, textShadow: `0 0 ${(8 + 10 * glow).toFixed(1)}px ${rgba(PB.stock, 0.35)}`, display: "flex", alignItems: "center", gap: 14, opacity: lab, transform: `translateX(${((1 - lab) * -24).toFixed(1)}px)`, clipPath: `inset(-20px ${((1 - lab) * 100).toFixed(1)}% -20px -20px)` }}>
        <span style={{ ...label(30), color: "#16A36F", whiteSpace: "nowrap" }}>En stock ·</span>
        <Odometer t={t} value={(tt) => tween(tt, a2 + 0.1, 0.5, 0, 29, IN_OUT)} digits={2} size={34} color="#16A36F" />
      </Abs>
    </>
  );
}

/**
 * L'étiquette de prix au bout de sa ficelle : un clou menthe apparaît sous la mention, l'étiquette se déroule de lui
 * en yoyo (RESSORT), balancement 22° → 0 amorti, rouleaux « 8,90 € », puce Marge. La ficelle relie toujours le clou à
 * l'accroche (qui suit le calque L2 dans l'orbite).
 */
function PriceTag({ t, a3, nail, anchor, slotDur, slotLock, glue }: { t: number; a3: number; nail: Pt; anchor: Pt; slotDur: number; slotLock: number; glue: number }) {
  const n0 = a3 - 4 * F;
  if (t < n0) return null;
  const nailK = ressort(t, n0);
  const dx = anchor[0] - nail[0];
  const dy = anchor[1] - nail[1];
  const full = Math.hypot(dx, dy);
  const fall = ressort(t, a3, { damping: 10, stiffness: 190 });
  const len = full * fall;
  const base = -Math.atan2(dx, dy) / DEG;
  // Départ penché vers la droite (+22°) : le coin haut de l'étiquette reste sous le clou, loin de la mention.
  const swing = 22 * (1 - springAt(t, a3, 6, 120));
  const pop = prog(t, a3, 5 * F, SNAP);
  // Au recollement, l'étiquette rapetisse un peu.
  const g = prog(t, glue, 6 * F, IN_OUT);
  const chip = prog(t, slotLock + 4 * F, 12 * F, SNAP);
  const bar = prog(t, slotLock + 10 * F, 0.3, SNAP);
  return (
    <>
      {t >= a3 && (
        <div style={{ position: "absolute", left: nail[0], top: nail[1], width: 0, height: 0, transformOrigin: "0 0", transform: `rotate(${(base + swing).toFixed(2)}deg) scale(${(1 - 0.12 * g).toFixed(3)})` }}>
          {/* La ficelle. */}
          {len > 8 && <div style={{ position: "absolute", left: -1, top: 0, width: 2, height: len - 6, background: "#C9D1DA", boxShadow: "0 0 4px rgba(0,0,0,.35)" }} />}
          {/* L'étiquette. */}
          <div style={{ position: "absolute", left: -TAG.w / 2, top: len - 18, width: TAG.w, height: TAG.h, borderRadius: 20, background: "linear-gradient(180deg, #FFFFFF 0%, #F1F5F7 100%)", boxShadow: "0 24px 50px rgba(0,0,0,.45), 0 0 0 1px rgba(11,15,20,.06)", opacity: pop, transform: `scale(${lerp(0.4, 1, pop).toFixed(3)})`, transformOrigin: "50% 0" }}>
            {/* Le trou, avec son œillet. */}
            <div style={{ position: "absolute", left: TAG.w / 2 - 11, top: 8, width: 22, height: 22, borderRadius: 11, background: INK, boxShadow: `0 0 0 4px #D5DDE3, inset 0 2px 3px rgba(0,0,0,.6)` }} />
            <div style={{ position: "absolute", left: 18, top: 14, ...label(14), letterSpacing: "0.16em", color: "#8A94A3" }}>Prix</div>
            <div style={{ position: "absolute", left: 0, right: 0, top: 46, display: "flex", justifyContent: "center" }}>
              <SlotDigits t={t} at={a3} text="8,90 €" dur={slotDur} stagger={3 * F} spins={2} size={68} color={INK} />
            </div>
          </div>
          {/* Puce « Marge » : glisse de derrière l'étiquette VERS LA DROITE (jamais sur la raison, à gauche dessous),
              mini-jauge qui se remplit, sans chiffre. */}
          <div style={{ position: "absolute", left: lerp(TAG.w / 2 - 170, TAG.w / 2 + 10, chip), top: len - 18 + TAG.h - 58, width: 160, height: 44, borderRadius: 999, background: "#E2F3F0", opacity: chip, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, boxShadow: "0 10px 24px rgba(0,0,0,.3)", zIndex: -1 }}>
            <span style={{ fontFamily: JAKARTA, fontWeight: 600, fontSize: 20, color: INK }}>Marge</span>
            <span style={{ position: "relative", width: 60, height: 6, borderRadius: 3, background: "rgba(11,15,20,.12)", overflow: "hidden" }}>
              <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(bar * 78).toFixed(1)}%`, borderRadius: 3, background: PB.mint, boxShadow: `0 0 8px ${rgba(PB.mint, 0.8)}` }} />
            </span>
          </div>
        </div>
      )}
      {/* Le clou (au-dessus de la ficelle). */}
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <circle cx={nail[0]} cy={nail[1]} r={13 * nailK} fill={rgba(PB.mint2, 0.22)} />
        <circle cx={nail[0]} cy={nail[1]} r={6.5 * nailK} fill="#E9FFFA" stroke={PB.mint2} strokeWidth={2.5} style={{ filter: `drop-shadow(0 0 6px ${PB.mint2})` }} />
      </svg>
    </>
  );
}

/** L3 : badge « ★ Challenge » qui entre PAR LA DROITE sur sa ligne en pièce qui roule (2 tours), ruban, jauge 142 / 200. */
function ChallengeLayer({ t, A }: { t: number; A: Anchors }) {
  const { a4, a5, land, ribbon } = A;
  const els: ReactNode[] = [];
  if (t >= a4) {
    const u = clamp01((t - a4) / (20 * F));
    const slide = 1 - Math.pow(1 - u, 3);
    const x = lerp(BADGE_FROM_X, BADGE.x, slide);
    const speed = 3 * Math.pow(1 - u, 2); // dérivée de la glissade (1 = vitesse moyenne)
    const flip = Math.cos(4 * Math.PI * (1 - Math.pow(1 - u, 2)));
    const settle = ressort(t, land);
    const sq = t >= land ? 1 + 0.12 * Math.sin(Math.min(1, (t - land) / 0.25) * Math.PI) * Math.exp(-(t - land) * 6) : 1;
    const scaleIn = t < land ? 1.12 - 0.12 * u : 0.94 + 0.06 * settle;
    const roll = t < land ? -14 * (1 - u) : 0;
    const sheen = clamp01((t - land) / (14 * F));
    const back = flip < 0;
    // Traînée : trois filets dorés derrière la pièce (à sa droite), tant qu'elle file.
    if (speed > 0.08 && t < land) {
      els.push(
        <svg key="trail" width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
          {[-18, 0, 18].map((oy, k) => (
            <line key={k} x1={x + BADGE.w - 20} y1={BADGE.y + BADGE.h / 2 + oy} x2={x + BADGE.w - 20 + Math.min(420, 150 * speed) * (k === 1 ? 1 : 0.65)} y2={BADGE.y + BADGE.h / 2 + oy} stroke={k === 1 ? PB.goldHi : PB.gold} strokeWidth={k === 1 ? 5 : 3} strokeLinecap="round" opacity={clamp01(speed * 0.5) * (k === 1 ? 0.9 : 0.55)} style={{ filter: `drop-shadow(0 0 6px ${rgba(PB.gold, 0.8)})` }} />
          ))}
        </svg>,
      );
    }
    els.push(
      <Abs key="badge" style={{ left: x, top: BADGE.y, width: BADGE.w, height: BADGE.h, transform: `rotate(${roll.toFixed(2)}deg) scale(${(scaleIn * Math.max(0.05, Math.abs(flip)) * sq).toFixed(3)}, ${(scaleIn / sq).toFixed(3)})`, transformOrigin: "50% 50%" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 999, background: back ? `linear-gradient(160deg, ${PB.gold} 0%, ${PB.goldLo} 100%)` : GOLD_METAL, boxShadow: `0 14px 30px rgba(0,0,0,.35), inset 0 2px 0 rgba(255,255,255,.55), inset 0 -3px 0 rgba(120,60,0,.35), 0 0 ${(40 * pulse(t, land, 0.05, 0.1, 0.6)).toFixed(0)}px ${rgba(PB.gold, 0.8)}`, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          {back && (
            <svg width={30} height={30} viewBox="-15 -15 30 30">
              <path d={star5(13)} fill="none" stroke="#FFF4D6" strokeWidth={2.5} strokeLinejoin="round" />
            </svg>
          )}
          {!back && (
            <>
              <svg width={28} height={28} viewBox="-14 -14 28 28">
                <path d={star5(13)} fill={INK} />
              </svg>
              <span style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 28, color: INK, letterSpacing: "-0.01em" }}>Challenge</span>
            </>
          )}
          {/* Reflet métallique à l'atterrissage. */}
          {sheen > 0 && sheen < 1 && <div style={{ position: "absolute", top: -20, bottom: -20, width: 40, left: -60 + sheen * (BADGE.w + 120), transform: "skewX(-20deg)", background: "rgba(255,255,255,.5)", filter: "blur(2px)" }} />}
        </div>
      </Abs>,
    );
  }
  if (t >= ribbon) {
    const k = prog(t, ribbon, 0.32, SNAP);
    const edge = RIBBON.w * k;
    els.push(
      <Abs key="ribbon" style={{ left: RIBBON.x, top: RIBBON.y, width: RIBBON.w + 30, height: RIBBON.h + 16 }}>
        {/* Bouts repliés (sous le ruban). */}
        <svg width={RIBBON.w + 40} height={RIBBON.h + 20} style={{ position: "absolute", left: -10, top: 0, overflow: "visible" }}>
          <path d={`M 10 ${RIBBON.h} L 22 ${RIBBON.h + 12} L 22 ${RIBBON.h} Z`} fill={PB.goldLo} opacity={k > 0.02 ? 1 : 0} />
          <path d={`M ${10 + RIBBON.w} ${RIBBON.h} L ${RIBBON.w - 2} ${RIBBON.h + 12} L ${RIBBON.w - 2} ${RIBBON.h} Z`} fill={PB.goldLo} opacity={k > 0.97 ? 1 : 0} />
        </svg>
        <div style={{ position: "absolute", left: 0, top: 0, width: RIBBON.w, height: RIBBON.h, clipPath: `inset(-10px ${(RIBBON.w - edge).toFixed(1)}px -10px -10px)` }}>
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${PB.goldHi} 0%, ${PB.gold} 45%, #DC9008 100%)`, borderRadius: 8, boxShadow: "0 12px 26px rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", clipPath: "polygon(0 0, 100% 0, 97% 50%, 100% 100%, 0 100%, 3% 50%)" }}>
            <span style={{ fontFamily: JAKARTA, fontWeight: 700, fontSize: 28, color: INK, whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>1 € par boîte dès 200 boîtes</span>
          </div>
        </div>
        {/* Le rouleau qui se déroule, au bord de la découpe. */}
        {k < 0.995 && <div style={{ position: "absolute", left: edge - 9, top: -4, width: 18, height: RIBBON.h + 8, borderRadius: 9, background: `linear-gradient(90deg, ${PB.goldLo} 0%, ${PB.goldHi} 45%, ${PB.gold} 70%, ${PB.goldLo} 100%)`, boxShadow: "0 6px 14px rgba(0,0,0,.4)" }} />}
      </Abs>,
    );
  }
  // La jauge (tuile sombre) : apparaît avec le ruban, se remplit sur « du moment ».
  if (t >= ribbon + 4 * F) {
    const pop = ressort(t, ribbon + 4 * F);
    const g0 = ribbon + 4 * F;
    const g1 = Math.max(g0 + 0.3, a5 + 0.25);
    const fill = tween(t, g0, g1 - g0, 0, 0.71, IN_OUT);
    const R = 36;
    const C = 2 * Math.PI * R;
    const starPop = 0.8 + 0.2 * pop + 0.25 * pulse(t, g1, 0.05, 0.05, 0.3);
    els.push(
      <Abs key="gauge" style={{ left: GAUGE.cx - GAUGE.tileW / 2, top: GAUGE.cy - GAUGE.tileH / 2, width: GAUGE.tileW, height: GAUGE.tileH, borderRadius: 26, background: "rgba(14,20,27,.94)", border: `1.5px solid ${rgba(PB.gold, 0.45)}`, boxShadow: `0 20px 40px rgba(0,0,0,.45), 0 0 ${(34 * pulse(t, g1, 0.06, 0.1, 0.4)).toFixed(0)}px ${rgba(PB.gold, 0.6)}`, transform: `scale(${pop.toFixed(3)})`, boxSizing: "border-box" }}>
        <svg width={GAUGE.tileW} height={100} style={{ position: "absolute", left: 0, top: 6 }} viewBox={`${-GAUGE.tileW / 2} -50 ${GAUGE.tileW} 100`}>
          <circle r={R} fill="none" stroke="rgba(255,255,255,.15)" strokeWidth={9} />
          <circle r={R} fill="none" stroke={PB.gold} strokeWidth={9} strokeLinecap="round" strokeDasharray={`${(C * fill).toFixed(2)} ${C.toFixed(2)}`} transform="rotate(-90)" style={{ filter: `drop-shadow(0 0 8px ${rgba(PB.gold, 0.8)})` }} />
          <path d={star5(19)} fill={PB.gold} transform={`scale(${starPop.toFixed(3)}) rotate(${(8 * Math.sin(t * 3)).toFixed(2)})`} style={{ filter: `drop-shadow(0 0 6px ${rgba(PB.goldHi, 0.8)})` }} />
        </svg>
        <div style={{ position: "absolute", left: 0, right: 0, top: 112, display: "flex", justifyContent: "center", alignItems: "center", ...digits(22, 600), color: "#FFFFFF" }}>
          <Odometer t={t} value={(tt) => tween(tt, g0, g1 - g0, 0, 142, IN_OUT)} digits={3} size={22} weight={600} color="#FFFFFF" />
          <span style={{ color: "rgba(255,255,255,.55)", whiteSpace: "pre" }}> / 200</span>
        </div>
      </Abs>,
    );
  }
  return <>{els}</>;
}

/** Les lignes de construction : chaque coin, de L0 à L3, en pointillés menthe (elles s'évasent avec la perspective). */
function ExplodeGuides({ v, e }: { v: View; e: number }) {
  const k = clamp01(e);
  if (k <= 0.02) return null;
  const corners: Pt[] = [
    [CARD.x, CARD.y],
    [CARD.x + CARD.w, CARD.y],
    [CARD.x, CARD.y + CARD.h],
    [CARD.x + CARD.w, CARD.y + CARD.h],
  ];
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity: k * 0.75 }}>
      {corners.map(([x, y], n) => (
        <g key={n}>
          <polyline points={[0, 1, 2, 3].map((i) => proj(v, i, x, y).map((c) => c.toFixed(1)).join(",")).join(" ")} fill="none" stroke={PB.mint2} strokeWidth={2} strokeDasharray="4 8" />
          {[0, 1, 2, 3].map((i) => {
            const [px, py] = proj(v, i, x, y);
            return <circle key={i} cx={px} cy={py} r={3.5} fill={PB.mint2} />;
          })}
        </g>
      ))}
    </svg>
  );
}

/** Crochets de visée qui sautent d'un élément à l'autre sur chaque segment (ressort, retard de suivi). */
function FocusBrackets({ t, A, v, stockR, tagR, badgeR }: { t: number; A: Anchors; v: View; stockR: Rect; tagR: Rect; badgeR: Rect }) {
  const { a1, a2, a3, a4, ribbon, glue } = A;
  const on = prog(t, a1 + 12 * F, 8 * F, SNAP) * (1 - prog(t, glue - 2 * F, 5 * F));
  if (on <= 0.01) return null;
  const thumbR = mapRect(v, 1, THUMB);
  const chalR = unionRect(mapRect(v, 3, RIBBON), mapRect(v, 3, { x: GAUGE.cx - GAUGE.tileW / 2, y: GAUGE.cy - GAUGE.tileH / 2, w: GAUGE.tileW, h: GAUGE.tileH }));
  const steps: { at: number; r: Rect }[] = [
    { at: a1, r: thumbR },
    { at: a2, r: stockR },
    { at: a3 + 0.12, r: tagR },
    { at: a4 + 0.22, r: badgeR },
    { at: ribbon + 0.12, r: chalR },
  ];
  let r = { ...steps[0].r };
  for (let i = 1; i < steps.length; i++) {
    const k = springAt(t, steps[i].at, 14, 170, 0.8);
    const p = steps[i - 1].r;
    const n = steps[i].r;
    // Chaque étape repart de l'étape précédente (les ressorts se chaînent).
    r = { x: r.x + (n.x - p.x) * k, y: r.y + (n.y - p.y) * k, w: r.w + (n.w - p.w) * k, h: r.h + (n.h - p.h) * k };
  }
  const gold = prog(t, a4 + 0.22, 0.2);
  const color = gold > 0.5 ? PB.goldHi : PB.mint2;
  const pad = 14 + 4 * Math.sin(t * 7);
  const x0 = r.x - pad;
  const y0 = r.y - pad;
  const x1 = r.x + r.w + pad;
  const y1 = r.y + r.h + pad;
  const arm = 24;
  const d = [
    `M ${x0} ${y0 + arm} L ${x0} ${y0} L ${x0 + arm} ${y0}`,
    `M ${x1 - arm} ${y0} L ${x1} ${y0} L ${x1} ${y0 + arm}`,
    `M ${x0} ${y1 - arm} L ${x0} ${y1} L ${x0 + arm} ${y1}`,
    `M ${x1 - arm} ${y1} L ${x1} ${y1} L ${x1} ${y1 - arm}`,
  ].join(" ");
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity: on }}>
      <path d={d} fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 8px ${rgba(color, 0.8)})` }} />
    </svg>
  );
}

/** Trente paillettes dorées (étoiles 4 branches), gravité légère, scintillement. */
function Sparkles({ t, at, x, y }: { t: number; at: number; x: number; y: number }) {
  const u = t - at;
  if (u < 0 || u > 1.1) return null;
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      {Array.from({ length: 30 }, (_, i) => {
        const life = 0.6 + 0.45 * hash("s7-spk-l", i);
        if (u > life) return null;
        const ang = (-90 + (hash("s7-spk-a", i) - 0.5) * 220) * DEG;
        const sp = 380 + 620 * hash("s7-spk-v", i);
        const p = ballistic(u, { x0: x + (hash("s7-spk-x", i) - 0.5) * 200, y0: y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: 900, drag: 2.2 });
        const size = 5 + 6 * hash("s7-spk-s", i);
        const tw = 0.6 + 0.4 * Math.sin(u * 30 + i);
        const k = u / life;
        const o = (k < 0.1 ? k / 0.1 : 1 - (k - 0.1) / 0.9) * tw;
        const fill = i % 3 === 0 ? "#FFFFFF" : i % 3 === 1 ? PB.goldHi : PB.gold;
        return <path key={i} d={star4(size)} fill={fill} opacity={Math.max(0, o)} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${(u * 260 + i * 40).toFixed(1)})`} style={{ filter: `drop-shadow(0 0 4px ${rgba(PB.goldHi, 0.9)})` }} />;
      })}
    </svg>
  );
}

/** Le stylo-laser : faisceau 3 px menthe (lueur 12 px) de la pointe du stylo à la pastille ; point final qui tremble. */
function PenLaser({ t, on, off, from, to }: { t: number; on: number; off: number; from: Pt; to: Pt }) {
  if (t < on || t > off + 8 * F) return null;
  const grow = prog(t, on, 5 * F, SNAP);
  const retract = prog(t, off, 6 * F, SNAP);
  const jx = 2 * noise2D("s7-laser-x", t * 9, 0);
  const jy = 2 * noise2D("s7-laser-y", 0, t * 9);
  const end: Pt = [to[0] + jx, to[1] + jy];
  // La tête du faisceau file vers la pastille, puis revient vers le stylo (longueur → 0 en 6 images).
  const sx = from[0];
  const sy = from[1];
  const ex = lerp(lerp(sx, end[0], grow), sx, retract);
  const ey = lerp(lerp(sy, end[1], grow), sy, retract);
  const flick = 0.85 + 0.15 * Math.sin(t * 60);
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={PB.mint2} strokeWidth={10} strokeLinecap="round" opacity={0.18 * flick} style={{ filter: "blur(4px)" }} />
      <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={PB.mint2} strokeWidth={3} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 12px ${rgba(PB.mint, 0.95)})` }} />
      <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="#E9FFFA" strokeWidth={1.2} strokeLinecap="round" />
      {grow > 0.98 && retract < 0.05 && (
        <>
          <circle cx={end[0]} cy={end[1]} r={14 + 3 * Math.sin(t * 40)} fill={rgba(PB.mint2, 0.25)} />
          <circle cx={end[0]} cy={end[1]} r={5} fill="#FFFFFF" style={{ filter: `drop-shadow(0 0 10px ${PB.mint2})` }} />
        </>
      )}
    </svg>
  );
}

function PenGlow({ t, on, off, at }: { t: number; on: number; off: number; at: Pt }) {
  const k = prog(t, on - 2 * F, 4 * F) * (1 - prog(t, off + 2 * F, 6 * F));
  if (k <= 0.01) return null;
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <circle cx={at[0]} cy={at[1]} r={10 + 2 * Math.sin(t * 50)} fill={rgba(PB.mint2, 0.35 * k)} />
      <circle cx={at[0]} cy={at[1]} r={3.5} fill="#FFFFFF" opacity={k} style={{ filter: `drop-shadow(0 0 8px ${PB.mint2})` }} />
    </svg>
  );
}

/** Éclair menthe sur le bord de la carte au recollement (box-shadow 4 px, 10 images). */
function GlueFlash({ t, at }: { t: number; at: number }) {
  const u = (t - at) / (10 * F);
  if (u < 0 || u > 1) return null;
  return (
    <Abs style={{ left: CARD.x, top: CARD.y, width: CARD.w, height: CARD.h, borderRadius: CARD.r, boxShadow: `0 0 0 4px ${rgba(PB.mint, 1 - u)}, 0 0 ${(40 + 40 * u).toFixed(0)}px ${rgba(PB.mint, 0.6 * (1 - u))}` }} />
  );
}

/** Les effets sonores de la scène (secondes du film). */
export const cues: SceneCues = (time) => {
  const { a1, a2, a3, a4, whip, glue, ribbon, slotLock } = anchors(time);
  return [
    cue("whoosh_fast", a1, 0.5, 0.8),
    // Un seul ping, en avance sur « de votre stock » et discret : la voix passe devant.
    cue("radar_ping", a2 - 0.08, 0.3),
    cue("scan_laser", a2 + 0.08, 0.25, 0.7),
    cue("counter_roll", a2 + 0.1, 0.3),
    cue("whoosh_fast", a3, 0.35, 1.4),
    cue("slot_lock", slotLock - 2 * 3 * F, 0.6),
    cue("coin_flip", a4, 0.6),
    cue("sparkle_shimmer", a4 + 0.33, 0.5),
    cue("paper_fold", ribbon, 0.3),
    cue("ui_click", glue, 0.5, 0.8),
    cue("whoosh_fast", whip, 0.6),
  ];
};
