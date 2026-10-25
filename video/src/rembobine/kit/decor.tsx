import { useId, type CSSProperties, type ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { clamp01, lerp, prog, ressort, wobble, EXIT, IN_OUT, POP, SNAP } from "../../presentation/motion/kit/ease";
import { hash, rnd } from "../../presentation/motion/kit/random";
import { A1, JAKARTA, PB, rgba } from "./brand";

/* ==========================================================================
 * LE DÉCOR PARTAGÉ — la pharmacie, le comptoir, la pharmacienne, le patient, les boîtes, l'ordonnance, le sac, la
 * douchette, les bulles, la carte de France, la croix verte. Illustration vectorielle plate (SVG/CSS : net en 4K).
 * Deux ambiances, prop `mood` : "act1" (néon froid, désaturé, gris-bleu : A1) · "pb" (lumineux, papier clair, vert
 * profond, citron : PB). Tout est fonction du temps du film `t` (s) : aucun état, aucun Math.random.
 *
 * SET — le plan large du comptoir, cadre 1920 × 1080 (TOUTES les scènes cadrent pareil ; rien d'important sous 930) :
 *   SET.counter        dessus du comptoir : bord arrière y 528 (x 176 → 1180), bord avant y 590 (x 140 → 1210),
 *                      face avant jusqu'au sol y 968. SET.topY = 568 : là où les objets POSENT sur le comptoir.
 *   SET.screen         l'écran du comptoir (centre de la dalle 432, 400 ; largeur 300 ; tourné de 18° vers la droite)
 *   SET.pharmacienne   { x 770, y 528 } = milieu du buste, coupé par le bord arrière du comptoir ; .head, .mouth,
 *                      .bubble = { x, y, side } : la pointe de bulle conseillée (au-dessus, à gauche de sa tête)
 *   SET.patient        { x 1340, y 1005 } = entre ses pieds, devant le comptoir ; .head, .mouth, .bubble
 *   SET.slots          rx (ordonnance à plat), box1 (l'antibiotique), box2 (le conseil, posé par la pharmacienne),
 *                      bag (le sac posé), douchette — des points de POSE (bas de l'objet) sur le comptoir
 *   SET.door           porte vitrée (bas au centre 1660, 735 ; 250 × 560) · SET.bell la clochette · SET.cross la croix
 *   SET.vitrine        la vitrine (la croix verte y est suspendue) · SET.floorY = 735 (pied du mur du fond)
 *
 * <Pharmacy t mood light? screen? screenPower? screenContent? doorOpen? chimeAt? douchette?>{…}</Pharmacy>
 *   Le fond COMPLET, opaque : mur d'étagères et boîtes, vitrine + croix verte (grésille en act1, nette en pb), porte
 *   vitrée et sa clochette, sol, comptoir et son écran. Les ENFANTS sont dessinés par-dessus le comptoir, dans le même
 *   repère 1920 × 1080, dans l'ordre : <Pharmacienne/> (elle se coupe seule au bord du comptoir), les objets posés,
 *   <Patient/> (devant). light 0..1 (défaut 1) assombrit TOUT, enfants compris (néon qui s'allume : à animer par la
 *   scène). screen "off" | "grey" | "pb" (défaut : grey en act1, off en pb) ; screenPower 0..1 allumage ; screenTilt
 *   (défaut 18°) : le redresser à 0 quand la caméra plonge dans l'écran ;
 *   screenContent = l'enfant de l'écran (voir CounterScreen). doorOpen 0..1 ; chimeAt = instant(s) du carillon (la
 *   clochette se balance). douchette (défaut true) : la douchette posée sur son socle — false si la scène la tient.
 *
 * <CounterScreen t mood state="off"|"grey"|"pb" power? x? y? w? tilt? stand?>{enfant}</CounterScreen>
 *   Le moniteur. Sans x/y : à sa place sur le comptoir (SET.screen, tourné de 18°). x, y = centre de la dalle ;
 *   w = largeur de la dalle (hauteur = w × 0,625). L'enfant est dessiné dans un cadre VIRTUEL de 1600 × 1000, réduit à
 *   la dalle : dessiner la bannière à pleine taille. "grey" = le vieux logiciel gris, sans vie ; "pb" = allumé (power
 *   0 → 1 : trait citron, ouverture, lumière ; sans enfant : l'accueil PharmaBoost).
 *
 * <Pharmacienne t mood expression="lasse"|"neutre"|"sourire" talk={[[de, à], …]} place? placeKind? placeTo? wink?
 *               x? y? scale? />
 *   Buste derrière le comptoir, blouse blanche, tournée vers le patient (vers la droite). Clignements, respiration,
 *   bouche qui parle pendant les fenêtres `talk` (temps du film). place 0..1 = le geste « poser une boîte » :
 *   0 → .25 la main monte avec la boîte, → .8 elle la pose en SET.slots.box2 (ou placeTo = point de pose dans le cadre),
 *   → 1 la main revient ; à 1 la boîte RESTE posée, dessinée par elle (ne pas la redessiner). wink = instant du clin d'œil.
 *
 * <Patient t mood expression="neutre"|"sourire" talk leave? back? boxesInBag? peek? bagXray? wave? grab? x? y? />
 *   Le client debout devant le comptoir, de trois quarts vers la pharmacienne, veste, écharpe, sac de pharmacie.
 *   leave 0..1 : il se retourne (0 → .12), marche jusqu'à la porte (→ .88) et la passe (→ 1, il s'efface) ; joué de 1
 *   à 0 = il revient à reculons (rembobinage). back 0..1 : se retourner sur place. grab 0..1 : il prend le sac posé en
 *   SET.slots.bag (0 = posé, 1 = à la main ; sans grab : à la main). boxesInBag 1 | 2 (les boîtes dépassent du sac si
 *   peek, défaut true). wave = instant du signe de la main (1,3 s). patientPose(leave) donne sa place, son échelle.
 *
 * <MedBox kind w? x? y? side? ghost? xray? t? rotate? shadow? mood?>{dans la place vide}</MedBox>
 *   Boîte générique (fond blanc, bandeau couleur, nom + dosage) : "amoxicilline" (Amoxicilline 1 g),
 *   "paracetamol" (Paracétamol 1 g), "probiotique" (Probiotique), "pastilles" (Pastilles gorge). AUCUNE marque.
 *   w = largeur de la face (défaut 220 ; hauteur w × 0,6). x, y = milieu du BAS de la boîte (sinon : bloc en flux).
 *   side 1 / −1 / 0 : flanc visible à droite / à gauche / de face. mood "act1" : passée au néon (défaut "pb").
 *   ghost = couleur → place vide en pointillés qui défilent avec t (les enfants s'y centrent : « ? ») ;
 *   xray 0..1 → vue radio (plaquette de comprimés visible). MED[kind] = { name, sub, form, color }.
 * <Ordonnance w? x? y? flat? rotate? write? mood? />   papier (x, y = centre ; w défaut 260) ; flat 0..1 = couchée sur
 *   le comptoir (à plat : w ≈ 150 en SET.slots.rx) ; write 0..1 = les lignes apparaissent, la signature se trace.
 * <PharmacyBag t? boxes? w? x? y? anchor? peek? xray? swing? mood? />   le sac à croix verte (w défaut 150).
 *   boxes = 1 | 2 | [kinds] (1 = l'antibiotique ; 2 = + le probiotique) ; peek : les boîtes dépassent (défaut true,
 *   false pour cacher le contenu avant la radio) ; anchor "handle" (défaut : x, y = la poignée) ou "base" ;
 *   swing = rotation autour de la poignée. bagSlot(i, w) = { x, y, w } de la boîte i dans le sac EN RADIO, par rapport
 *   à la poignée (la boîte seule est à la place 0 : la place 1, à sa droite, reste vide pour la « place vide »).
 * <Douchette t x y angle? size? beamAt? beamDur? beamLength? beamWidth? mood? />   le lecteur ; x, y = sa fenêtre ;
 *   angle 0 = pointe vers le bas (la poignée part à droite) ; le laser rouge s'allume à chaque beamAt (nombre ou
 *   liste) pendant beamDur (0,32 s), la diode verte confirme le bip ; beamLength = distance jusqu'à la ligne laser.
 * <Bubble t at text side mood x y size? exitAt? maxWidth? />   bulle qui pope (ressort) ; x, y = POINTE de la queue
 *   (près de la bouche) ; side = côté de la queue ("left" : la bulle s'étend à droite de la pointe) ; act1 : gris
 *   froid, pb : citron et vert. Une seule ligne, sauf maxWidth (px) donné. Préférer la réplique COURTE.
 * FRANCE_PATH (contour, boîte 1000 × 1000), FRANCE_DOTS (257 points {x, y} dans le contour, ordre mélangé à graine)
 * <FranceMap t x y size color dots? lit={(i) => 0..1} base? outline? />   x, y = centre ; lit(i) > 1 = dépassement.
 * <GreenCross t flicker? mood? size? x? y? />   la croix de pharmacie à LED (grésille si flicker).
 * coldGrade(hex)   la couleur passée au néon de l'acte 1 (pour qu'un objet de scène s'accorde au décor act1).
 * patientPose(leave, x?, y?) → { x, y, scale, back, opacity, phase, walk } : pour accrocher une bulle au patient qui part.
 *
 * Exemple (S1) :
 *   <Pharmacy t={t} mood="act1" light={néon} chimeAt={5.3} doorOpen={porte}>
 *     <Pharmacienne t={t} mood="act1" expression="lasse" talk={[[1.4, 3.8]]} />
 *     <Ordonnance x={SET.slots.rx.x} y={SET.slots.rx.y} w={150} flat={1} rotate={-8} mood="act1" />
 *     <MedBox kind="amoxicilline" x={SET.slots.box1.x} y={SET.slots.box1.y} w={110} mood="act1" />
 *     <Patient t={t} mood="act1" talk={[[4.3, 5.0]]} grab={prog(t, 4.6, 0.5, LINEAR)} leave={prog(t, 5.0, 1.4, LINEAR)} />
 *     <Bubble t={t} at={1.5} exitAt={3.9} text="Autre chose ?" mood="act1" {...SET.pharmacienne.bubble} />
 *   </Pharmacy>
 * ======================================================================== */

export type Mood = "act1" | "pb";
export type MedKind = "amoxicilline" | "paracetamol" | "probiotique" | "pastilles";
export type Expression = "lasse" | "neutre" | "sourire";
type Pt = { x: number; y: number };
type Win = [number, number];

/* ------------------------------------------------------------------ le plan */

export const SET = {
  W: 1920,
  H: 1080,
  floorY: 735,
  counter: { backY: 528, frontY: 590, baseY: 968, backLeft: 176, backRight: 1180, frontLeft: 140, frontRight: 1210 },
  topY: 568,
  screen: { x: 432, y: 400, w: 300, h: 187.5, tilt: 18 },
  pharmacienne: { x: 770, y: 528, head: { x: 776, y: 266 }, mouth: { x: 808, y: 301 }, bubble: { x: 742, y: 206, side: "right" as const } },
  patient: { x: 1340, y: 1005, head: { x: 1334, y: 337 }, mouth: { x: 1304, y: 370 }, bubble: { x: 1380, y: 256, side: "left" as const } },
  slots: { rx: { x: 1105, y: 561 }, box1: { x: 1012, y: 574 }, box2: { x: 898, y: 576 }, bag: { x: 1150, y: 582 }, douchette: { x: 612, y: 560 } },
  door: { x: 1660, y: 735, w: 250, h: 560 },
  bell: { x: 1584, y: 196 },
  vitrine: { x: 1296, y: 150, w: 208, h: 585 },
  cross: { x: 1400, y: 292, size: 118 },
} as const;

/* ------------------------------------------------------------------ couleurs */

const GRADE = new Map<string, string>();
function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const v = parseInt(n, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const toHex = (r: number, g: number, b: number) => "#" + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");

/** La couleur passée au néon froid de l'acte 1 : désaturée, tirée vers le gris-bleu, assombrie. */
export function coldGrade(hex: string, dark = 0.86): string {
  const key = `${hex}|${dark}`;
  const hit = GRADE.get(key);
  if (hit) return hit;
  const [r0, g0, b0] = hexRgb(hex);
  const l = 0.3 * r0 + 0.59 * g0 + 0.11 * b0;
  const s = 0.3;
  const cold = [122, 146, 160];
  const m = 0.2;
  const ch = (c: number, i: number) => ((l + (c - l) * s) * (1 - m) + cold[i] * m) * dark;
  const out = toHex(ch(r0, 0), ch(g0, 1), ch(b0, 2));
  GRADE.set(key, out);
  return out;
}
function tones<T extends Record<string, string>>(raw: T, mood: Mood, dark = 0.86): T {
  if (mood === "pb") return raw;
  const out: Record<string, string> = {};
  for (const k of Object.keys(raw)) out[k] = coldGrade(raw[k], dark);
  return out as T;
}
const useUid = () => useId().replace(/[^a-zA-Z0-9]/g, "");

/* ------------------------------------------------------------------ petits outils */

/** Deux segments (épaule → coude → poignet) : le coude plié vers l'EXTÉRIEUR et vers le BAS (out = −1 : vers la
 *  gauche, 1 : vers la droite). Le poignet s'arrête au bout du bras. */
function ik(s: Pt, target: Pt, a: number, b: number, out: 1 | -1): { elbow: Pt; wrist: Pt } {
  const dx = target.x - s.x;
  const dy = target.y - s.y;
  const d0 = Math.hypot(dx, dy) || 1e-6;
  const d = Math.min(d0, a + b - 0.5);
  const wrist = { x: s.x + (dx / d0) * d, y: s.y + (dy / d0) * d };
  const base = Math.atan2(dy, dx);
  const A = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const e1 = { x: s.x + a * Math.cos(base + A), y: s.y + a * Math.sin(base + A) };
  const e2 = { x: s.x + a * Math.cos(base - A), y: s.y + a * Math.sin(base - A) };
  const score = (e: Pt) => e.x * out + 2.5 * e.y;
  return { elbow: score(e1) >= score(e2) ? e1 : e2, wrist };
}
const mixP = (p: Pt, q: Pt, k: number): Pt => ({ x: lerp(p.x, q.x, k), y: lerp(p.y, q.y, k) });

/** Clignement : 0 → 1 → 0 en 0,15 s, toutes les ~3,6 s (graine propre au personnage). */
function blinkAt(t: number, seed: number) {
  const P = 3.6;
  const n = Math.floor(t / P);
  for (const m of [n - 1, n]) {
    const at = m * P + 0.4 + hash(`blink${seed}`, m + 50) * 2.2;
    const u = (t - at) / 0.15;
    if (u >= 0 && u <= 1) return Math.sin(Math.PI * u);
  }
  return 0;
}

/** Ouverture de la bouche pendant les fenêtres de parole (syllabes ~4 Hz, attaque et fin adoucies). */
function talkOpen(t: number, talk: Win[] | undefined, seed: number) {
  if (!talk) return 0;
  for (const [a, b] of talk) {
    if (t >= a && t <= b) {
      const env = clamp01(Math.min((t - a) / 0.06, (b - t) / 0.08));
      const syl = Math.abs(Math.sin((t - a) * Math.PI * 2 * 3.9 + seed));
      const v = 0.6 + 0.4 * Math.sin(t * 9.1 + seed * 2);
      return env * (0.12 + 0.88 * syl * v);
    }
  }
  return 0;
}

/** Néon qui grésille : niveau 0..1 (coupures brèves, par rafales). */
function buzz(t: number, seed: string) {
  const n = Math.floor(t * 24);
  const burst = hash(`${seed}b`, Math.floor(t * 1.6)) < 0.45;
  if (burst && hash(seed, n) < 0.38) return 0.12 + 0.25 * hash(`${seed}c`, n);
  return 0.78 + 0.1 * Math.sin(t * 13) * hash(`${seed}d`, n);
}

/* ================================================================== LA CROIX VERTE */

function CrossGlyph({ t, flicker, mood, size }: { t: number; flicker: boolean; mood: Mood; size: number }) {
  const uid = useUid();
  const a = size * 0.36;
  const h = size / 2;
  const on = flicker ? buzz(t, "croix") : 1;
  const base = mood === "act1" ? "#24453A" : "#0B8F5A";
  const led = mood === "act1" ? "#7DB596" : "#9BFFD0";
  const glow = mood === "act1" ? A1.cross : "#2EE59D";
  const step = a / 3.4;
  const dots: { x: number; y: number }[] = [];
  for (let gx = -h + step / 2; gx < h; gx += step)
    for (let gy = -h + step / 2; gy < h; gy += step) if (Math.abs(gx) < a / 2 - step * 0.2 || Math.abs(gy) < a / 2 - step * 0.2) dots.push({ x: gx, y: gy });
  const haloA = mood === "act1" ? 0.4 * on : 0.5 + 0.06 * Math.sin(t * 3);
  return (
    <g>
      <defs>
        <radialGradient id={`ch${uid}`}>
          <stop offset="0%" stopColor={glow} stopOpacity={0.85} />
          <stop offset="45%" stopColor={glow} stopOpacity={0.28} />
          <stop offset="100%" stopColor={glow} stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle r={size * 1.25} fill={`url(#ch${uid})`} opacity={haloA} />
      <rect x={-a / 2} y={-h} width={a} height={size} rx={a * 0.16} fill={base} />
      <rect x={-h} y={-a / 2} width={size} height={a} rx={a * 0.16} fill={base} />
      {dots.map((d, i) => {
        let k: number;
        if (mood === "act1") {
          const dead = d.x < -a / 2 && hash("croixMorte", Math.floor(t * 3)) < 0.7;
          k = on * (dead ? 0.22 : 0.85 + 0.15 * hash("croixLed", i));
        } else {
          const r = Math.hypot(d.x, d.y) / size;
          k = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 5.5 - r * 11));
        }
        return <circle key={i} cx={d.x} cy={d.y} r={step * 0.34} fill={led} opacity={k} />;
      })}
      <rect x={-a / 2} y={-h} width={a} height={size} rx={a * 0.16} fill="none" stroke={rgba("#FFFFFF", mood === "act1" ? 0.06 : 0.35)} strokeWidth={size * 0.012} />
    </g>
  );
}

export function GreenCross({ t, flicker, mood = "pb", size = 120, x, y }: { t: number; flicker?: boolean; mood?: Mood; size?: number; x?: number; y?: number }) {
  const S = size * 2.6;
  const abs = x !== undefined && y !== undefined;
  return (
    <svg
      width={S}
      height={S}
      viewBox={`${-S / 2} ${-S / 2} ${S} ${S}`}
      style={{ position: abs ? "absolute" : "relative", left: abs ? x - S / 2 : undefined, top: abs ? y - S / 2 : undefined, overflow: "visible", display: "block" }}
    >
      <CrossGlyph t={t} flicker={flicker ?? mood === "act1"} mood={mood} size={size} />
    </svg>
  );
}

/* ================================================================== LES BOÎTES */

export const MED: Record<MedKind, { name: string; sub: string; form: string; color: string }> = {
  amoxicilline: { name: "Amoxicilline", sub: "1 g", form: "comprimés", color: "#3550C8" },
  paracetamol: { name: "Paracétamol", sub: "1 g", form: "comprimés", color: "#8448D0" },
  probiotique: { name: "Probiotique", sub: "", form: "gélules", color: "#109C7C" },
  pastilles: { name: "Pastilles", sub: "gorge", form: "à sucer", color: "#238DD0" },
};

const XR = "#8FE9FF";

function MedIcon({ kind, color }: { kind: MedKind; color: string }) {
  if (kind === "amoxicilline")
    return (
      <g transform="rotate(-30)">
        <ellipse rx={15} ry={9.5} fill={color} />
        <line x1={0} y1={-8} x2={0} y2={8} stroke="#FFFFFF" strokeWidth={2.4} />
      </g>
    );
  if (kind === "paracetamol")
    return (
      <g>
        <circle r={12} fill={color} />
        <line x1={-8} y1={0} x2={8} y2={0} stroke="#FFFFFF" strokeWidth={2.4} />
      </g>
    );
  if (kind === "probiotique")
    return (
      <g transform="rotate(-35)">
        <rect x={-16} y={-7.5} width={32} height={15} rx={7.5} fill={rgba(color, 0.35)} />
        <path d="M-8.5,-7.5 L0,-7.5 L0,7.5 L-8.5,7.5 A7.5,7.5 0 0 1 -8.5,-7.5 Z" fill={color} transform="translate(-7.5 0)" />
      </g>
    );
  return <rect x={-10} y={-10} width={20} height={20} rx={5} fill={color} transform="rotate(45)" />;
}

/** La face avant d'une boîte, dessinée dans 300 × 180. */
function MedFront({ kind, mood = "pb" }: { kind: MedKind; mood?: Mood }) {
  const m = MED[kind];
  const c = tones({ K: m.color, white: "#FFFFFF", ink: "#0F2A26", form: "#6A7B77" }, mood, 0.94);
  const K = c.K;
  return (
    <g>
      <rect width={300} height={180} rx={4} fill={c.white} />
      <path d="M0,0 H300 V52 C230,70 150,38 0,62 Z" fill={K} />
      <path d="M0,68 C150,44 230,76 300,58 V64 C230,82 150,50 0,74 Z" fill={K} opacity={0.3} />
      <circle cx={258} cy={30} r={22} fill={c.white} />
      <g transform="translate(258 30)">
        <MedIcon kind={kind} color={K} />
      </g>
      <rect x={18} y={20} width={64} height={6} rx={3} fill="#FFFFFF" opacity={0.7} />
      <rect x={18} y={32} width={42} height={6} rx={3} fill="#FFFFFF" opacity={0.45} />
      <text x={18} y={m.sub ? 116 : 124} fontFamily={JAKARTA} fontWeight={800} fontSize={m.name.length > 11 ? 33 : 35} letterSpacing={-0.6} fill={c.ink}>
        {m.name}
      </text>
      {m.sub && (
        <text x={18} y={153} fontFamily={JAKARTA} fontWeight={800} fontSize={30} letterSpacing={-0.4} fill={K}>
          {m.sub}
        </text>
      )}
      <text x={282} y={155} textAnchor="end" fontFamily={JAKARTA} fontWeight={600} fontSize={16} fill={c.form}>
        {m.form}
      </text>
      <rect y={168} width={300} height={12} fill={K} />
      <rect x={1} y={1} width={298} height={178} rx={4} fill="none" stroke="rgba(15,47,42,0.12)" strokeWidth={2} />
    </g>
  );
}

/** Une boîte debout, origine = milieu du BAS de la face avant. side 1 : on voit son flanc droit ; −1 : gauche ; 0 : de face. */
function MedGlyph({ kind, w, side = 1, xray = 0, shadow = true, mood = "pb" }: { kind: MedKind; w: number; side?: number; xray?: number; shadow?: boolean; mood?: Mood }) {
  const uid = useUid();
  const h = w * 0.6;
  const d = w * 0.15 * Math.abs(side);
  const dx = d * 0.85 * Math.sign(side || 1) * (side === 0 ? 0 : 1);
  const dy = -d * 0.55;
  const cc = tones({ K: MED[kind].color, top: "#F2F6F5", flank: "#D7E0DD" }, mood, 0.94);
  const K = cc.K;
  const s = w / 300;
  const top = `M${-w / 2},${-h} L${w / 2},${-h} L${w / 2 + dx},${-h + dy} L${-w / 2 + dx},${-h + dy} Z`;
  const ex = side > 0 ? w / 2 : -w / 2;
  const flank = `M${ex},${-h} L${ex + dx},${-h + dy} L${ex + dx},${dy} L${ex},0 Z`;
  const flankBand = `M${ex},${-h} L${ex + dx},${-h + dy} L${ex + dx},${-h + dy + h * 0.34} L${ex},${-h + h * 0.34} Z`;
  const x = clamp01(xray);
  return (
    <g>
      <defs>
        <radialGradient id={`bs${uid}`}>
          <stop offset="0%" stopColor="#06110F" stopOpacity={0.32} />
          <stop offset="100%" stopColor="#06110F" stopOpacity={0} />
        </radialGradient>
      </defs>
      {shadow && x < 1 && <ellipse cx={dx * 0.6} cy={1} rx={w * 0.66} ry={w * 0.07} fill={`url(#bs${uid})`} opacity={1 - x} />}
      {x < 1 && (
        <g opacity={1 - x}>
          <path d={top} fill={cc.top} />
          {side !== 0 && <path d={flank} fill={cc.flank} />}
          {side !== 0 && <path d={flankBand} fill={K} opacity={0.82} />}
          <g transform={`translate(${-w / 2} ${-h}) scale(${s})`}>
            <MedFront kind={kind} mood={mood} />
          </g>
        </g>
      )}
      {x > 0 && (
        <g opacity={x}>
          <rect x={-w / 2 - 4} y={-h - 4} width={w + 8} height={h + 8} rx={8} fill="none" stroke={XR} strokeWidth={10} opacity={0.18} />
          <path d={top} fill="rgba(6,20,27,0.85)" stroke={XR} strokeWidth={2} strokeLinejoin="round" />
          {side !== 0 && <path d={flank} fill="rgba(6,20,27,0.85)" stroke={XR} strokeWidth={2} strokeLinejoin="round" />}
          <rect x={-w / 2} y={-h} width={w} height={h} rx={4} fill="rgba(5,18,25,0.9)" stroke={XR} strokeWidth={2.6} />
          <rect x={-w / 2 + w * 0.08} y={-h + h * 0.18} width={w * 0.84} height={h * 0.64} rx={6} fill="none" stroke={rgba(XR, 0.55)} strokeWidth={1.8} strokeDasharray="6 5" />
          {Array.from({ length: 10 }, (_, i) => {
            const cx = -w / 2 + w * (0.17 + (i % 5) * 0.165);
            const cy = -h + h * (i < 5 ? 0.36 : 0.64);
            return kind === "probiotique" ? (
              <rect key={i} x={cx - w * 0.05} y={cy - h * 0.1} width={w * 0.1} height={h * 0.2} rx={w * 0.05} fill={rgba(XR, 0.2)} stroke="#C8F7FF" strokeWidth={1.8} />
            ) : (
              <ellipse key={i} cx={cx} cy={cy} rx={w * 0.052} ry={h * 0.085} fill={rgba(XR, 0.2)} stroke="#C8F7FF" strokeWidth={1.8} />
            );
          })}
          <text x={-w / 2 + w * 0.06} y={-h * 0.04 - 4} fontFamily={JAKARTA} fontWeight={800} fontSize={w * 0.075} fill={rgba(XR, 0.55)}>
            {MED[kind].name} {MED[kind].sub}
          </text>
        </g>
      )}
    </g>
  );
}

function GhostGlyph({ w, color, t }: { w: number; color: string; t: number }) {
  const h = w * 0.6;
  const sw = Math.max(3, w * 0.022);
  return (
    <g>
      <rect x={-w / 2} y={-h} width={w} height={h} rx={w * 0.05} fill={rgba(color, 0.08)} stroke={color} strokeWidth={sw} strokeDasharray={`${w * 0.07} ${w * 0.05}`} strokeDashoffset={-t * 40} />
    </g>
  );
}

export function MedBox({
  kind = "amoxicilline",
  w = 220,
  x,
  y,
  side = 1,
  ghost,
  xray = 0,
  t = 0,
  rotate = 0,
  shadow = true,
  mood = "pb",
  children,
  style,
}: {
  mood?: Mood;
  kind?: MedKind;
  w?: number;
  x?: number;
  y?: number;
  side?: number;
  ghost?: string;
  xray?: number | boolean;
  t?: number;
  rotate?: number;
  shadow?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const h = w * 0.6;
  const d = ghost ? 0 : w * 0.15 * Math.abs(side);
  const pad = w * 0.14;
  const L = -w / 2 - pad - (side < 0 ? d : 0);
  const R = w / 2 + pad + (side > 0 ? d : 0);
  const T = -h - d * 0.6 - pad;
  const B = pad * 0.5;
  const W = R - L;
  const H = B - T;
  const abs = x !== undefined && y !== undefined;
  return (
    <div
      style={{
        position: abs ? "absolute" : "relative",
        left: abs ? x + L : undefined,
        top: abs ? y + T : undefined,
        width: W,
        height: H,
        transform: rotate ? `rotate(${rotate}deg)` : undefined,
        transformOrigin: `${-L}px ${-T}px`,
        ...style,
      }}
    >
      <svg width={W} height={H} viewBox={`${L} ${T} ${W} ${H}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {ghost ? <GhostGlyph w={w} color={ghost} t={t} /> : <MedGlyph kind={kind} w={w} side={side} xray={xray === true ? 1 : xray === false ? 0 : xray} shadow={shadow} mood={mood} />}
      </svg>
      {children !== undefined && (
        <div style={{ position: "absolute", left: -L - w / 2, top: -T - h, width: w, height: h, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>{children}</div>
      )}
    </div>
  );
}

/* ================================================================== L'ORDONNANCE */

export function Ordonnance({ w = 260, x, y, flat = 0, rotate = 0, write = 1, mood = "pb", style }: { w?: number; x?: number; y?: number; flat?: number; rotate?: number; write?: number; mood?: Mood; style?: CSSProperties }) {
  const h = w * 1.38;
  const abs = x !== undefined && y !== undefined;
  const c = tones({ paper: "#FFFEFA", ink: "#23408E", ink2: "#3A4F8F", grey: "#C9D2CF", grey2: "#8E9C98", rule: "#DDE4E1" }, mood, 0.95);
  const show = (from: number) => clamp01((write - from) / 0.15);
  return (
    <div
      style={{
        position: abs ? "absolute" : "relative",
        left: abs ? x - w / 2 : undefined,
        top: abs ? y - h / 2 : undefined,
        width: w,
        height: h,
        transform: `perspective(${w * 4}px) rotateX(${flat * 72}deg) rotate(${rotate}deg)`,
        transformOrigin: "50% 50%",
        ...style,
      }}
    >
      <svg width={w} height={h} viewBox="0 0 300 414" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <rect x={5} y={8} width={300} height={414} rx={6} fill="rgba(6,17,15,0.16)" />
        <rect width={300} height={414} rx={6} fill={c.paper} />
        <g transform="translate(36 34)">
          <rect x={-4} y={-13} width={8} height={26} rx={2} fill={c.grey2} />
          <rect x={-13} y={-4} width={26} height={8} rx={2} fill={c.grey2} />
        </g>
        <rect x={60} y={24} width={118} height={9} rx={4} fill={c.grey2} />
        <rect x={60} y={40} width={88} height={7} rx={3.5} fill={c.grey} />
        <rect x={60} y={53} width={104} height={7} rx={3.5} fill={c.grey} />
        <rect x={212} y={26} width={64} height={7} rx={3.5} fill={c.grey} />
        <text x={150} y={94} textAnchor="middle" fontFamily={JAKARTA} fontWeight={800} fontSize={15} letterSpacing={2.4} fill={c.grey2}>
          ORDONNANCE
        </text>
        <line x1={24} y1={106} x2={276} y2={106} stroke={c.rule} strokeWidth={2} />
        <g opacity={show(0)}>
          <text x={24} y={152} fontFamily={JAKARTA} fontWeight={800} fontSize={23} fontStyle="italic" fill={c.ink}>
            Amoxicilline 1 g
          </text>
          <text x={24} y={177} fontFamily={JAKARTA} fontWeight={600} fontSize={15.5} fontStyle="italic" fill={c.ink2}>
            1 cp matin et soir, 7 jours
          </text>
        </g>
        <g opacity={show(0.3)}>
          <text x={24} y={228} fontFamily={JAKARTA} fontWeight={800} fontSize={23} fontStyle="italic" fill={c.ink}>
            Paracétamol 1 g
          </text>
          <text x={24} y={253} fontFamily={JAKARTA} fontWeight={600} fontSize={15.5} fontStyle="italic" fill={c.ink2}>
            si douleur ou fièvre
          </text>
        </g>
        <path
          d="M168,352 C176,326 186,322 184,342 C182,362 172,370 178,352 C186,330 200,330 198,348 C197,360 206,356 212,344 C218,334 222,340 220,350 C219,358 230,356 240,346 C246,340 252,342 262,338"
          fill="none"
          stroke={c.ink}
          strokeWidth={2.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="1 1"
          strokeDashoffset={1 - clamp01((write - 0.6) / 0.4)}
        />
        <rect x={24} y={388} width={150} height={5} rx={2.5} fill={c.rule} />
      </svg>
    </div>
  );
}

/* ================================================================== LE SAC */

/** Centre de la boîte i (0, 1) à l'intérieur du sac, par rapport à la poignée (anchor "handle"), pour un sac de largeur w. */
export function bagSlot(i: number, w = 150): Pt & { w: number } {
  return { x: (i === 0 ? -0.235 : 0.235) * w, y: w * 0.3 + w * 0.6, w: w * 0.44 };
}

function BagGlyph({ w, kinds, peek = true, xray = 0, mood }: { w: number; kinds: MedKind[]; peek?: boolean; xray?: number; mood: Mood }) {
  const uid = useUid();
  const c = tones({ body: "#FFFFFF", shade: "#E3EBE8", fold: "#EEF3F1", cross: "#16B177", handle: "#D7E1DD", handle2: "#B9C7C2", ink: "#7C8D88" }, mood, 0.84);
  const hT = w * 0.3;
  const h = w * 1.1;
  const x = clamp01(xray);
  const boxW = w * 0.5;
  const handle = (dx: number, col: string) => (
    <path d={`M${-w * 0.22 + dx},${hT + 6} C${-w * 0.2 + dx},${-w * 0.06} ${w * 0.2 + dx},${-w * 0.06} ${w * 0.22 + dx},${hT + 6}`} fill="none" stroke={col} strokeWidth={w * 0.045} strokeLinecap="round" />
  );
  const body = `M${-w / 2},${hT} L${w / 2},${hT} L${w / 2 - w * 0.02},${hT + h - 8} Q${w / 2 - w * 0.02},${hT + h} ${w / 2 - w * 0.08},${hT + h} L${-w / 2 + w * 0.08},${hT + h} Q${-w / 2 + w * 0.02},${hT + h} ${-w / 2 + w * 0.02},${hT + h - 8} Z`;
  return (
    <g>
      {x < 1 && (
        <g opacity={1 - x}>
          {handle(w * 0.05, c.handle2)}
          {peek &&
            kinds.slice(0, 2).map((k, i) => (
              <g key={i} transform={`translate(${(kinds.length === 1 ? -0.04 : i === 0 ? -0.2 : 0.19) * w} ${hT + boxW * (i === 0 ? 0.26 : 0.3)}) rotate(${kinds.length === 1 ? -5 : i === 0 ? -9 : 7})`}>
                <MedGlyph kind={k} w={boxW} side={0} shadow={false} mood={mood} />
              </g>
            ))}
          <path d={body} fill={c.body} />
          <path d={`M${w * 0.3},${hT} L${w / 2},${hT} L${w / 2 - w * 0.02},${hT + h - 8} Q${w / 2 - w * 0.02},${hT + h} ${w / 2 - w * 0.08},${hT + h} L${w * 0.3},${hT + h} Z`} fill={c.shade} opacity={0.75} />
          <rect x={-w / 2} y={hT} width={w} height={w * 0.07} fill={c.fold} />
          <line x1={-w / 2} y1={hT + w * 0.07} x2={w / 2} y2={hT + w * 0.07} stroke={c.shade} strokeWidth={1.5} />
          <g transform={`translate(0 ${hT + h * 0.5})`}>
            <rect x={-w * 0.06} y={-w * 0.17} width={w * 0.12} height={w * 0.34} rx={w * 0.02} fill={c.cross} />
            <rect x={-w * 0.17} y={-w * 0.06} width={w * 0.34} height={w * 0.12} rx={w * 0.02} fill={c.cross} />
          </g>
          <text x={0} y={hT + h * 0.5 + w * 0.32} textAnchor="middle" fontFamily={JAKARTA} fontWeight={800} fontSize={w * 0.075} letterSpacing={w * 0.012} fill={c.ink}>
            PHARMACIE
          </text>
          {handle(0, c.handle)}
        </g>
      )}
      {x > 0 && (
        <g opacity={x}>
          {handle(0, rgba(XR, 0.7))}
          <defs>
            <radialGradient id={`bx${uid}`} cx="0.5" cy="0.45" r="0.7">
              <stop offset="0%" stopColor="#123A48" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#04121A" stopOpacity={0.9} />
            </radialGradient>
          </defs>
          <path d={body} fill={`url(#bx${uid})`} stroke={XR} strokeWidth={2.6} strokeLinejoin="round" />
          <line x1={-w / 2 + 6} y1={hT + w * 0.07} x2={w / 2 - 6} y2={hT + w * 0.07} stroke={rgba(XR, 0.45)} strokeWidth={1.6} strokeDasharray="7 6" />
          {Array.from({ length: 6 }, (_, i) => (
            <line key={`sc${i}`} x1={-w / 2 + 4} y1={hT + (h * (i + 1)) / 7} x2={w / 2 - 4} y2={hT + (h * (i + 1)) / 7} stroke={rgba(XR, 0.05)} strokeWidth={1} />
          ))}
          <path d={body} fill="none" stroke={XR} strokeWidth={10} opacity={0.15} />
          {kinds.slice(0, 2).map((k, i) => {
            const p = bagSlot(i, w);
            return (
              <g key={i} transform={`translate(${p.x} ${p.y + p.w * 0.3})`}>
                <MedGlyph kind={k} w={p.w} side={0} xray={1} shadow={false} />
              </g>
            );
          })}
        </g>
      )}
    </g>
  );
}

const kindsOf = (boxes: number | MedKind[] | undefined): MedKind[] =>
  Array.isArray(boxes) ? boxes : boxes === 2 ? ["amoxicilline", "probiotique"] : boxes === 0 ? [] : ["amoxicilline"];

export function PharmacyBag({
  w = 150,
  x,
  y,
  boxes = 1,
  anchor = "handle",
  peek = true,
  xray = 0,
  swing = 0,
  mood = "pb",
  style,
}: {
  t?: number;
  w?: number;
  x?: number;
  y?: number;
  boxes?: number | MedKind[];
  anchor?: "handle" | "base";
  peek?: boolean;
  xray?: number | boolean;
  swing?: number;
  mood?: Mood;
  style?: CSSProperties;
}) {
  const hT = w * 0.3;
  const H = hT + w * 1.1;
  const pad = w * 0.3;
  const oy = anchor === "base" ? -H : 0;
  const abs = x !== undefined && y !== undefined;
  const Wd = w + pad * 2;
  const Ht = H + pad * 2;
  return (
    <div
      style={{
        position: abs ? "absolute" : "relative",
        left: abs ? x - Wd / 2 : undefined,
        top: abs ? y + oy - pad : undefined,
        width: Wd,
        height: Ht,
        transform: swing ? `rotate(${swing}deg)` : undefined,
        transformOrigin: `50% ${pad}px`,
        ...style,
      }}
    >
      <svg width={Wd} height={Ht} viewBox={`${-Wd / 2} ${-pad} ${Wd} ${Ht}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <BagGlyph w={w} kinds={kindsOf(boxes)} peek={peek} xray={xray === true ? 1 : xray === false ? 0 : xray} mood={mood} />
      </svg>
    </div>
  );
}

/* ================================================================== LA DOUCHETTE */

function DouchetteGlyph({ t, beam, led, mood, beamLength, beamWidth }: { t: number; beam: number; led: number; mood: Mood; beamLength: number; beamWidth: number }) {
  const uid = useUid();
  const c = tones({ body: "#262D31", body2: "#3A444A", face: "#4A555C", accent: mood === "pb" ? PB.citron : "#9AA59F", grip: "#1C2225" }, mood, 0.95);
  const jit = beam > 0 ? Math.sin(t * 90) * 2 : 0;
  return (
    <g>
      <defs>
        <linearGradient id={`lz${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF3B3B" stopOpacity={0.55} />
          <stop offset="100%" stopColor="#FF3B3B" stopOpacity={0.12} />
        </linearGradient>
      </defs>
      {beam > 0 && (
        <g opacity={beam}>
          <path d={`M-30,0 L30,0 L${beamWidth / 2},${beamLength} L${-beamWidth / 2},${beamLength} Z`} fill={`url(#lz${uid})`} />
          <line x1={-beamWidth / 2 - 6} y1={beamLength + jit} x2={beamWidth / 2 + 6} y2={beamLength + jit} stroke="#FF5A5A" strokeWidth={14} strokeLinecap="round" opacity={0.3} />
          <line x1={-beamWidth / 2} y1={beamLength + jit} x2={beamWidth / 2} y2={beamLength + jit} stroke="#FF2A2A" strokeWidth={3.5} strokeLinecap="round" />
          <line x1={-beamWidth / 2 + 8} y1={beamLength + jit} x2={beamWidth / 2 - 8} y2={beamLength + jit} stroke="#FFD0D0" strokeWidth={1.2} strokeLinecap="round" />
        </g>
      )}
      {/* la poignée (pistolet) : part de l'arrière de la tête, vers la droite et un peu vers le haut */}
      <g transform="translate(14 -104) rotate(-22)">
        <rect x={-10} y={-25} width={158} height={50} rx={23} fill={c.grip} />
        <rect x={6} y={-25} width={138} height={15} rx={7.5} fill={c.body2} opacity={0.75} />
        <rect x={30} y={22} width={34} height={16} rx={8} fill={c.accent} transform="rotate(-8 30 22)" />
      </g>
      {/* la tête : large à la fenêtre, plus étroite à l'arrière */}
      <path d="M-50,0 L50,0 C52,-36 42,-80 32,-122 C28,-134 -28,-134 -32,-122 C-42,-80 -52,-36 -50,0 Z" fill={c.body} />
      <path d="M-50,0 L-30,0 C-34,-40 -28,-84 -16,-130 C-24,-130 -30,-128 -32,-122 C-42,-80 -52,-36 -50,0 Z" fill={c.body2} opacity={0.85} />
      <path d="M-49,-40 L49,-40 L48,-30 L-50,-30 Z" fill={c.accent} opacity={0.9} />
      <rect x={-42} y={-12} width={84} height={12} rx={4} fill={beam > 0 ? "#FF4D4D" : "#4A1013"} />
      <rect x={-42} y={-12} width={84} height={4} rx={2} fill={rgba("#FFFFFF", 0.25)} />
      <circle cx={0} cy={-100} r={6} fill={led > 0 ? "#5BFF9C" : c.face} />
      {led > 0 && <circle cx={0} cy={-100} r={16} fill="#5BFF9C" opacity={0.35 * led} />}
    </g>
  );
}

export function Douchette({
  t,
  x,
  y,
  angle = 0,
  size = 1,
  beamAt,
  beamDur = 0.32,
  beamLength = 150,
  beamWidth = 140,
  mood = "pb",
}: {
  t: number;
  x: number;
  y: number;
  angle?: number;
  size?: number;
  beamAt?: number | number[];
  beamDur?: number;
  beamLength?: number;
  beamWidth?: number;
  mood?: Mood;
}) {
  const times = beamAt === undefined ? [] : Array.isArray(beamAt) ? beamAt : [beamAt];
  let beam = 0;
  let led = 0;
  for (const b of times) {
    const u = (t - b) / beamDur;
    if (u >= 0 && u <= 1) beam = Math.max(beam, u < 0.12 ? (Math.floor((t - b) * 120) % 2 ? 0.55 : 1) : 1 - clamp01((u - 0.8) / 0.2));
    const ld = t - b - beamDur * 0.6;
    if (ld >= 0 && ld < 0.45) led = Math.max(led, 1 - ld / 0.45);
  }
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 0, height: 0, transform: `rotate(${angle}deg) scale(${size})`, transformOrigin: "0 0" }}>
      <svg width={420} height={520} viewBox="-210 -300 420 520" style={{ position: "absolute", left: -210, top: -300, overflow: "visible" }}>
        <DouchetteGlyph t={t} beam={beam} led={led} mood={mood} beamLength={beamLength} beamWidth={beamWidth} />
      </svg>
    </div>
  );
}

/* ================================================================== LA BULLE */

export function Bubble({
  t,
  at,
  text,
  side = "left",
  mood,
  x,
  y,
  size = 52,
  exitAt,
  maxWidth,
}: {
  t: number;
  at: number;
  text: ReactNode;
  side?: "left" | "right";
  mood: Mood;
  x: number;
  y: number;
  size?: number;
  exitAt?: number;
  maxWidth?: number;
}) {
  if (t < at) return null;
  const out = exitAt !== undefined ? prog(t, exitAt, 0.2, EXIT) : 0;
  if (out >= 1) return null;
  const s = ressort(t, at) * (1 - out);
  const fill = mood === "act1" ? "#E3E9EB" : PB.citron;
  const ink = mood === "act1" ? A1.ink : PB.green;
  const tail = size * 0.85;
  const off = size * 0.55;
  const wob = Math.sin((t - at) * 2.6) * 1.1 + (side === "left" ? -1.5 : 1.5) * (1 - clamp01((t - at) / 0.3));
  const left = side === "left";
  const tailPath = `M${size * 0.32},-3 C${size * 0.3},${tail * 0.45} ${size * 0.14},${tail * 0.8} 0,${tail} C${size * 0.4},${tail * 0.8} ${size * 0.82},${tail * 0.45} ${size * 0.98},-3 Z`;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 0, height: 0, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          bottom: tail,
          left: left ? -off : undefined,
          right: left ? undefined : -off,
          transform: `scale(${s}) rotate(${wob}deg)`,
          transformOrigin: left ? `${off}px calc(100% + ${tail}px)` : `calc(100% - ${off}px) calc(100% + ${tail}px)`,
          filter: `drop-shadow(0 ${size * 0.18}px ${size * 0.3}px ${rgba("#06110F", mood === "act1" ? 0.45 : 0.22)})`,
        }}
      >
        <div
          style={{
            position: "relative",
            background: fill,
            color: ink,
            fontFamily: JAKARTA,
            fontWeight: 800,
            fontSize: size,
            letterSpacing: "-0.012em",
            wordSpacing: "0.08em",
            lineHeight: 1.08,
            padding: `${size * 0.34}px ${size * 0.6}px ${size * 0.4}px`,
            borderRadius: size * 0.62,
            width: "max-content",
            maxWidth,
            whiteSpace: maxWidth ? "normal" : "nowrap",
          }}
        >
          {text}
        </div>
        <svg
          width={size}
          height={tail + 4}
          viewBox={`0 -4 ${size} ${tail + 4}`}
          style={{ position: "absolute", top: "100%", marginTop: -4, left: left ? off : undefined, right: left ? undefined : off, overflow: "visible", transform: left ? undefined : "scaleX(-1)", transformOrigin: "100% 0" }}
        >
          <path d={tailPath} fill={fill} />
        </svg>
      </div>
    </div>
  );
}

/* ================================================================== LA FRANCE */

const FR_MAIN = [
  499, 51, 511, 47, 523, 60, 533, 82, 549, 75, 559, 100, 581, 107, 588, 116, 607, 118, 617, 130, 613, 149, 633, 154, 649, 140, 657, 134, 660, 158, 658, 168, 674, 170, 694, 184, 719, 191, 735, 198, 756, 199, 767, 203, 779, 226, 799, 231,
  816, 231, 828, 235, 844, 237, 873, 245, 860, 265, 848, 284, 841, 307, 834, 331, 832, 359, 834, 375, 819, 387, 799, 383, 793, 391, 796, 401, 777, 415, 760, 433, 739, 461, 740, 480, 735, 494, 730, 508, 751, 499, 748, 485, 767, 485,
  783, 485, 787, 506, 798, 527, 787, 538, 803, 564, 799, 583, 774, 597, 778, 615, 793, 629, 787, 652, 793, 669, 790, 680, 812, 694, 838, 694, 830, 729, 817, 735, 806, 744, 799, 750, 793, 753, 783, 763, 775, 774, 771, 785, 756, 791,
  743, 798, 729, 792, 716, 790, 703, 783, 690, 778, 678, 771, 665, 763, 652, 766, 639, 760, 623, 757, 607, 750, 591, 762, 578, 771, 559, 781, 546, 797, 541, 820, 543, 844, 550, 854, 536, 855, 519, 862, 498, 858, 475, 860, 459, 851,
  440, 839, 411, 825, 392, 816, 366, 830, 347, 830, 324, 820, 299, 806, 276, 802, 260, 797, 252, 785, 233, 767, 247, 755, 254, 736, 260, 704, 265, 671, 267, 648, 270, 615, 275, 578, 276, 563, 267, 550, 269, 527, 275, 508, 260, 494,
  231, 477, 215, 457, 209, 438, 218, 424, 202, 410, 183, 401, 167, 384, 148, 377, 129, 363, 100, 352, 79, 352, 66, 354, 58, 338, 44, 332, 71, 321, 55, 307, 40, 302, 42, 284, 64, 275, 90, 268, 116, 261, 141, 256, 157, 265, 170, 284,
  190, 278, 202, 272, 218, 275, 244, 278, 245, 256, 244, 223, 233, 205, 226, 177, 243, 181, 266, 178, 269, 205, 283, 207, 315, 210, 350, 211, 360, 200, 353, 194, 360, 175, 385, 162, 416, 154, 437, 141, 446, 126, 448, 102, 450, 79,
  450, 67, 466, 59, 482, 56,
];
const FR_CORSE = [950, 802, 954, 825, 959, 844, 960, 872, 952, 900, 949, 923, 943, 937, 934, 953, 920, 942, 911, 932, 912, 918, 902, 904, 900, 884, 904, 867, 899, 856, 907, 842, 921, 837, 936, 828, 944, 816, 947, 802];
const pairs = (a: number[]): [number, number][] => Array.from({ length: a.length / 2 }, (_, i) => [a[2 * i], a[2 * i + 1]]);
const FR_POLYS = [pairs(FR_MAIN), pairs(FR_CORSE)];

/** Contour fermé lissé (Catmull-Rom → Bézier). */
function smoothClosed(p: [number, number][], k = 0.18) {
  const n = p.length;
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n];
    const p1 = p[i];
    const p2 = p[(i + 1) % n];
    const p3 = p[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2 = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d + " Z";
}

/** La France métropolitaine et la Corse, dans une boîte 1000 × 1000. */
export const FRANCE_PATH = FR_POLYS.map((p) => smoothClosed(p)).join(" ");

function inPoly(x: number, y: number, p: [number, number][]) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const inFrance = (x: number, y: number) => FR_POLYS.some((p) => inPoly(x, y, p));

/** ≈ 257 points répartis dans la France (grille en quinconce de 40, légèrement bougée), dans un ordre mélangé à graine. */
export const FRANCE_DOTS: { x: number; y: number }[] = (() => {
  const sp = 40;
  const m = 9;
  const out: { x: number; y: number; k: number }[] = [];
  for (let r = 0; r * sp * 0.866 < 1000; r++)
    for (let q = 0; q * sp < 1000; q++) {
      const x = q * sp + (r % 2 ? sp / 2 : 0) + 10;
      const y = r * sp * 0.866 + 10;
      if (inFrance(x, y) && inFrance(x + m, y) && inFrance(x - m, y) && inFrance(x, y + m) && inFrance(x, y - m)) {
        const i = out.length;
        out.push({ x: x + rnd("frJx", i, -5, 5), y: y + rnd("frJy", i, -5, 5), k: hash("frOrdre", r * 100 + q) });
      }
    }
  return out.sort((a, b) => a.k - b.k).map(({ x, y }) => ({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }));
})();

export function FranceMap({
  t,
  x,
  y,
  size,
  color,
  dots = true,
  lit,
  base,
  outline = true,
  dotScale = 1,
}: {
  t: number;
  x: number;
  y: number;
  size: number;
  color: string;
  dots?: boolean;
  lit?: (i: number) => number;
  base?: string;
  outline?: boolean;
  dotScale?: number;
}) {
  const uid = useUid();
  const r0 = 6.5 * dotScale;
  const dim = base ?? color;
  return (
    <svg width={size} height={size} viewBox="0 0 1000 1000" style={{ position: "absolute", left: x - size / 2, top: y - size / 2, overflow: "visible" }}>
      <defs>
        <radialGradient id={`fg${uid}`}>
          <stop offset="0%" stopColor={color} stopOpacity={0.75} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </radialGradient>
      </defs>
      {outline && (
        <>
          <path d={FRANCE_PATH} fill={rgba(dim, 0.07)} stroke={rgba(dim, 0.18)} strokeWidth={14} strokeLinejoin="round" />
          <path d={FRANCE_PATH} fill="none" stroke={rgba(dim, 0.6)} strokeWidth={3} strokeLinejoin="round" />
        </>
      )}
      {dots &&
        FRANCE_DOTS.map((p, i) => {
          const k = Math.max(0, lit ? lit(i) : 1);
          const kk = Math.min(1, k);
          return (
            <g key={i}>
              {k > 0.02 && <circle cx={p.x} cy={p.y} r={r0 + 16 * k * dotScale} fill={`url(#fg${uid})`} opacity={0.55 * kk} />}
              <circle cx={p.x} cy={p.y} r={r0 * (0.8 + 0.45 * k)} fill={kk > 0.02 ? color : rgba(dim, 0.2)} opacity={kk > 0.02 ? 0.35 + 0.65 * kk : 1} />
              {k > 0.5 && <circle cx={p.x - r0 * 0.25} cy={p.y - r0 * 0.25} r={r0 * 0.3} fill="#FFFFFF" opacity={0.5 * (kk - 0.5) * 2} />}
            </g>
          );
        })}
      {/* un léger scintillement de vie sur le contour */}
      {outline && <path d={FRANCE_PATH} fill="none" stroke={rgba(color, 0.35)} strokeWidth={4} strokeDasharray="40 960" strokeDashoffset={-t * 220} pathLength={1000} />}
    </svg>
  );
}

/* ================================================================== LES VISAGES */

const FEM = {
  skin: "#EEC09E",
  skinSh: "#DCA07D",
  skinDeep: "#C9876A",
  hair: "#3A2722",
  hairHi: "#5C3F33",
  coat: "#FFFFFF",
  coatSh: "#DCE6E2",
  coatLine: "#C2D1CC",
  top: "#247061",
  pen: "#0796B4",
  lips: "#B65A54",
  mouthIn: "#5A1F22",
  tongue: "#D9746E",
  eye: "#231917",
  blush: "#F08D80",
};
const MAN = {
  skin: "#D49B75",
  skinSh: "#BC8058",
  skinDeep: "#A86C4A",
  hair: "#2A201C",
  hairHi: "#45352D",
  jacket: "#2C4A78",
  jacketSh: "#203A61",
  jacketHi: "#3B5D90",
  sweater: "#EEE5D4",
  sweaterSh: "#DACDB6",
  scarf: "#7DB394",
  scarfSh: "#5D9577",
  trousers: "#3A3F4A",
  trousersSh: "#2D313A",
  shoe: "#F4F2EE",
  sole: "#C3C9CC",
  lips: "#9C4F49",
  mouthIn: "#4E1C1E",
  tongue: "#C9645F",
  eye: "#1F1715",
  blush: "#E58A7C",
};

type FacePal = { skin: string; skinSh: string; skinDeep: string; lips: string; mouthIn: string; tongue: string; eye: string; blush: string; hair: string };

/** Les traits (yeux, sourcils, nez, bouche, joues), tête tournée vers la DROITE, centre de la tête en 0, 0. */
function Face({ c, expr, open, blink, wink, k = 1 }: { c: FacePal; expr: Expression; open: number; blink: number; wink: number; k?: number }) {
  const lid = expr === "lasse" ? 0.48 : expr === "sourire" ? 0.04 : 0.1;
  const smile = expr === "sourire" ? 1 : expr === "lasse" ? -0.45 : 0.12;
  const cheek = expr === "sourire" ? 0.45 : 0;
  const browY = expr === "sourire" ? -4 : expr === "lasse" ? 2 : 0;
  const blushA = expr === "sourire" ? 0.42 : expr === "neutre" ? 0.16 : 0;
  const eyes = [
    { x: 6, y: -2, rx: 5.6, near: true },
    { x: 37, y: -3, rx: 4.8, near: false },
  ];
  const ry = 7.4;
  // la bouche
  const mo = expr === "sourire" ? Math.max(open, 0.22) : open;
  const mx = 30;
  const my = 33 * k;
  const mw = 23;
  const L = { x: mx - mw / 2 - (smile > 0 ? 1 : 0), y: my - smile * 4.5 };
  const R = { x: mx + mw / 2 + (smile > 0 ? 1 : 0), y: my - smile * 4.5 };
  return (
    <g>
      {blushA > 0 && (
        <>
          <ellipse cx={0} cy={19 * k} rx={11} ry={6.5} fill={c.blush} opacity={blushA} />
          <ellipse cx={47} cy={17 * k} rx={6} ry={5.5} fill={c.blush} opacity={blushA * 0.8} />
        </>
      )}
      {expr === "lasse" &&
        eyes.map((e, i) => <path key={`b${i}`} d={`M${e.x - e.rx - 1},${e.y + 9} Q${e.x},${e.y + 13} ${e.x + e.rx + 1},${e.y + 9}`} fill="none" stroke={c.skinDeep} strokeWidth={1.6} opacity={0.5} strokeLinecap="round" />)}
      {eyes.map((e, i) => {
        const winking = e.near && wink > 0;
        const o = (1 - blink) * (1 - lid);
        if (winking)
          return <path key={i} d={`M${e.x - 7},${e.y + 1.5} Q${e.x},${e.y - 6} ${e.x + 7},${e.y + 1.5}`} fill="none" stroke={c.eye} strokeWidth={2.8} strokeLinecap="round" />;
        if (o < 0.16) return <path key={i} d={`M${e.x - e.rx - 1.5},${e.y + 1} Q${e.x},${e.y + 4} ${e.x + e.rx + 1.5},${e.y + 1}`} fill="none" stroke={c.eye} strokeWidth={2.4} strokeLinecap="round" />;
        const r = ry * o;
        const cy = e.y + ry * (1 - o) * 0.7;
        return (
          <g key={i}>
            <ellipse cx={e.x} cy={cy} rx={e.rx} ry={r} fill={c.eye} />
            {o > 0.5 && <circle cx={e.x + 1.6} cy={cy - r * 0.42} r={1.7} fill="#FFFFFF" opacity={0.9} />}
            {lid > 0.3 && <path d={`M${e.x - e.rx - 2},${cy - r + 0.5} Q${e.x},${cy - r - 2.5} ${e.x + e.rx + 2},${cy - r + 0.5}`} fill="none" stroke={c.eye} strokeWidth={2.2} strokeLinecap="round" />}
            {cheek > 0 && <ellipse cx={e.x} cy={e.y + ry * 1.35} rx={e.rx * 1.9} ry={ry * 0.75} fill={c.skin} />}
          </g>
        );
      })}
      {/* sourcils */}
      <path
        d={expr === "lasse" ? `M-6,${-19 + browY} Q5,${-22 + browY} 16,${-21 + browY}` : `M-6,${-19 + browY} Q5,${-26 + browY} 16,${-22 + browY}`}
        fill="none"
        stroke={c.hair}
        strokeWidth={4}
        strokeLinecap="round"
      />
      <path
        d={expr === "lasse" ? `M30,${-22 + browY} Q38,${-23 + browY} 45,${-19 + browY}` : `M30,${-23 + browY} Q38,${-27 + browY} 45,${-21 + browY}`}
        fill="none"
        stroke={c.hair}
        strokeWidth={3.4}
        strokeLinecap="round"
      />
      {/* nez */}
      <path d={`M44,${2 * k} Q${54},${16 * k} 45,${21 * k}`} fill="none" stroke={c.skinDeep} strokeWidth={2.8} strokeLinecap="round" />
      {/* bouche */}
      {mo < 0.06 ? (
        <path d={`M${L.x},${L.y} Q${mx},${my + smile * 5} ${R.x},${R.y}`} fill="none" stroke={c.lips} strokeWidth={3.2} strokeLinecap="round" />
      ) : (
        <g>
          <path d={`M${L.x},${L.y} Q${mx},${my + smile * 2.5 - mo * 1.5} ${R.x},${R.y} Q${mx},${my + smile * 6 + mo * 15} ${L.x},${L.y} Z`} fill={c.mouthIn} stroke={c.lips} strokeWidth={1.6} strokeLinejoin="round" />
          {smile > 0.3 && <path d={`M${L.x + 3},${L.y + 1.6} Q${mx},${my + smile * 2.5 - mo * 1.5 + 2.5} ${R.x - 3},${R.y + 1.6}`} fill="none" stroke="#FFFFFF" strokeWidth={Math.min(4.5, 2 + mo * 5)} strokeLinecap="round" />}
          {mo > 0.35 && <ellipse cx={mx} cy={my + smile * 3.5 + mo * 9} rx={mw * 0.24} ry={mo * 3.4} fill={c.tongue} />}
        </g>
      )}
    </g>
  );
}

/* ================================================================== LA PHARMACIENNE */

export function Pharmacienne({
  t,
  mood,
  expression = "neutre",
  talk,
  place,
  placeKind = "probiotique",
  placeTo,
  wink,
  x = SET.pharmacienne.x,
  y = SET.pharmacienne.y,
  scale = 1,
}: {
  t: number;
  mood: Mood;
  expression?: Expression;
  talk?: Win[];
  place?: number;
  placeKind?: MedKind;
  placeTo?: Pt;
  wink?: number;
  x?: number;
  y?: number;
  scale?: number;
}) {
  const uid = useUid();
  const c = tones(FEM, mood);
  const br = Math.sin((t * 2 * Math.PI) / 3.6);
  const tired = expression === "lasse";
  const winkK = wink !== undefined && t >= wink && t <= wink + 0.4 ? 1 : 0;
  const winkTilt = wink !== undefined ? Math.sin(Math.PI * clamp01((t - wink) / 0.45)) * -4 : 0;
  const sh = br * 1.6 + (tired ? 3 : 0);
  const headY = -262 + br * 2.2 + (tired ? 4 : 0);
  const headR = (tired ? 4 : expression === "sourire" ? -3 : 0) + wobble(t, 3, 1.4, 0.55) + winkTilt;
  const open = talkOpen(t, talk, 1.3);
  const blink = blinkAt(t, 1);
  const talkNod = open > 0 ? Math.sin(t * 7.5) * 1.2 : 0;

  // les bras
  const A = 116;
  const B = 112;
  const shL = { x: -86, y: -150 + sh };
  const shR = { x: 90, y: -150 + sh };
  const restL = { x: -64, y: 24 };
  const restR = { x: 46, y: 24 };
  const boxW = 106;
  const target: Pt = placeTo ? { x: (placeTo.x - x) / scale, y: (placeTo.y - y) / scale } : { x: (SET.slots.box2.x - x) / scale, y: (SET.slots.box2.y - y) / scale };
  let wristR = restR;
  let box: { x: number; y: number; rot: number; s: number; sy: number } | null = null;
  if (place !== undefined && place > 0) {
    const P = clamp01(place);
    const grip = (p: Pt) => ({ x: p.x, y: p.y - boxW * 0.6 - 4 }); // la main tient la boîte par le haut
    const lift = { x: 138, y: -62 };
    const above = { x: target.x, y: target.y - boxW * 0.6 - 30 };
    const down = grip(target);
    if (P < 0.25) {
      const k = SNAP(P / 0.25);
      wristR = mixP(restR, lift, k);
    } else if (P < 0.7) {
      const k = IN_OUT((P - 0.25) / 0.45);
      const p = mixP(lift, above, k);
      wristR = { x: p.x, y: p.y - Math.sin(Math.PI * k) * 34 };
    } else if (P < 0.8) {
      wristR = mixP(above, down, SNAP((P - 0.7) / 0.1));
    } else if (P < 0.86) {
      wristR = down;
    } else {
      wristR = mixP(down, restR, SNAP((P - 0.86) / 0.14));
    }
    const held = P < 0.82;
    const pop = POP(clamp01(P / 0.16));
    const land = P >= 0.8 ? Math.exp(-((P - 0.8) / 0.05)) * Math.sin(((P - 0.8) / 0.06) * Math.PI) : 0;
    box = held
      ? { x: wristR.x, y: wristR.y + boxW * 0.6 + 4, rot: P > 0.25 && P < 0.7 ? -7 * Math.sin(Math.PI * ((P - 0.25) / 0.45)) : 0, s: pop, sy: 1 }
      : { x: target.x, y: target.y, rot: 0, s: 1, sy: 1 - 0.1 * land };
  }
  const armL = ik(shL, restL, A, B, -1);
  const armR = ik(shR, wristR, A, B, 1);

  const sleeve = (s: Pt, e: Pt, w: Pt, key: string) => (
    <g key={key}>
      <path d={`M${s.x},${s.y} L${e.x},${e.y} L${w.x},${w.y}`} fill="none" stroke={c.coatLine} strokeWidth={38} strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M${s.x},${s.y} L${e.x},${e.y} L${w.x},${w.y}`} fill="none" stroke={c.coat} strokeWidth={34} strokeLinecap="round" strokeLinejoin="round" />
      {(() => {
        const L = Math.hypot(w.x - e.x, w.y - e.y) || 1;
        const ux = (w.x - e.x) / L;
        const uy = (w.y - e.y) / L;
        const cx = w.x - ux * 20;
        const cy = w.y - uy * 20;
        return <line x1={cx - uy * 17} y1={cy + ux * 17} x2={cx + uy * 17} y2={cy - ux * 17} stroke={c.coatLine} strokeWidth={2.4} strokeLinecap="round" />;
      })()}
    </g>
  );
  const hand = (e: Pt, w: Pt, key: string) => {
    const a = (Math.atan2(w.y - e.y, w.x - e.x) * 180) / Math.PI;
    return (
      <g key={key} transform={`translate(${w.x} ${w.y}) rotate(${a})`}>
        <ellipse cx={14} cy={0} rx={18} ry={13} fill={c.skin} />
        <ellipse cx={8} cy={-9} rx={8} ry={5} fill={c.skin} transform="rotate(-30 8 -9)" />
        <path d="M24,-6 Q30,0 24,7" fill="none" stroke={c.skinSh} strokeWidth={2} strokeLinecap="round" />
      </g>
    );
  };

  return (
    <div style={{ position: "absolute", left: x, top: y, width: 0, height: 0, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
      <svg width={640} height={520} viewBox="-260 -420 640 520" style={{ position: "absolute", left: -260, top: -420, overflow: "visible" }}>
        <defs>
          <clipPath id={`cut${uid}`}>
            <rect x={-400} y={-600} width={900} height={600} />
          </clipPath>
          <linearGradient id={`cs${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06110F" stopOpacity={0} />
            <stop offset="100%" stopColor="#06110F" stopOpacity={mood === "act1" ? 0.3 : 0.14} />
          </linearGradient>
        </defs>
        <g clipPath={`url(#cut${uid})`}>
          {/* le buste */}
          <g transform={`translate(0 ${sh * 0.6}) scale(1 ${1 + br * 0.006})`}>
            <path d="M-106,-114 C-105,-150 -88,-166 -46,-175 L-20,-182 L30,-182 L58,-175 C98,-166 112,-150 112,-114 L106,30 L-102,30 Z" fill={c.coat} />
            <path d="M86,-164 C104,-152 112,-138 112,-114 L106,30 L82,30 C90,-40 92,-110 86,-164 Z" fill={c.coatSh} opacity={0.8} />
            <path d="M-22,-182 L34,-182 L8,-100 Z" fill={c.top} />
            <path d="M-14,-183 L26,-183 L6,-150 Z" fill={c.skin} />
            <path d="M-26,-184 L6,-100 L-14,-110 L-46,-170 Z" fill={c.coat} stroke={c.coatLine} strokeWidth={2} strokeLinejoin="round" />
            <path d="M38,-184 L8,-100 L28,-110 L60,-170 Z" fill={c.coat} stroke={c.coatLine} strokeWidth={2} strokeLinejoin="round" />
            <path d="M-48,-174 L-24,-186 L-36,-150 Z" fill={c.coat} stroke={c.coatLine} strokeWidth={2} strokeLinejoin="round" />
            <path d="M60,-174 L36,-186 L48,-150 Z" fill={c.coat} stroke={c.coatLine} strokeWidth={2} strokeLinejoin="round" />
            <line x1={8} y1={-100} x2={8} y2={30} stroke={c.coatLine} strokeWidth={2} />
            <circle cx={8} cy={-66} r={3.4} fill={c.coatLine} />
            <circle cx={8} cy={-24} r={3.4} fill={c.coatLine} />
            <rect x={-80} y={-106} width={5} height={24} rx={2} fill={c.pen} />
            <rect x={-70} y={-102} width={5} height={20} rx={2} fill={mood === "act1" ? coldGrade("#8C9AA0") : "#8C9AA0"} />
            <path d="M-92,-84 L-46,-84" stroke={c.coatLine} strokeWidth={2.5} strokeLinecap="round" />
            <rect x={44} y={-130} width={48} height={28} rx={5} fill="#FFFFFF" stroke={c.coatLine} strokeWidth={1.6} />
            <rect x={51} y={-122} width={4} height={12} rx={1} fill={mood === "act1" ? A1.cross : PB.stock} />
            <rect x={47} y={-118} width={12} height={4} rx={1} fill={mood === "act1" ? A1.cross : PB.stock} />
            <rect x={64} y={-123} width={22} height={4} rx={2} fill={c.coatLine} />
            <rect x={64} y={-114} width={15} height={4} rx={2} fill={c.coatLine} />
            <rect x={-130} y={-50} width={260} height={52} fill={`url(#cs${uid})`} />
          </g>
          {/* le cou */}
          <path d={`M-14,${headY + 40} L-16,-170 L26,-170 L22,${headY + 40} Z`} fill={c.skin} />
          <ellipse cx={6} cy={headY + 48} rx={20} ry={9} fill={c.skinSh} opacity={0.8} />
          {/* la tête */}
          <g transform={`translate(6 ${headY + talkNod}) rotate(${headR}) scale(1.06)`}>
            <circle cx={-30} cy={-56} r={25} fill={c.hair} />
            <path d="M-40,-66 Q-30,-74 -18,-70" fill="none" stroke={c.hairHi} strokeWidth={3} strokeLinecap="round" />
            <path d="M-46,-26 C-60,-2 -56,30 -34,44 C-40,20 -40,0 -38,-20 Z" fill={c.hair} />
            <path d="M-44,-14 C-46,-48 -18,-62 6,-62 C34,-62 52,-42 52,-8 C52,16 46,36 30,50 C20,58 6,60 -6,56 C-26,48 -42,30 -44,-14 Z" fill={c.skin} />
            <path d="M30,50 C20,58 6,60 -6,56 C-14,52 -20,48 -24,42 C-8,50 14,50 30,42 Z" fill={c.skinSh} opacity={0.5} />
            <ellipse cx={-38} cy={4} rx={8.5} ry={12.5} fill={c.skin} />
            <ellipse cx={-37} cy={5} rx={4} ry={7} fill={c.skinSh} />
            <circle cx={-38} cy={18} r={2.6} fill={mood === "act1" ? coldGrade(PB.citron) : PB.mint} />
            <path d="M-48,-2 C-54,-40 -28,-68 6,-68 C38,-68 58,-48 54,-14 C48,-26 40,-34 28,-36 C30,-28 26,-22 18,-20 C12,-32 -2,-38 -16,-36 C-26,-34 -32,-24 -34,-12 C-38,-8 -44,-4 -48,-2 Z" fill={c.hair} />
            <path d="M-10,-58 C8,-62 30,-56 42,-42" fill="none" stroke={c.hairHi} strokeWidth={3.2} strokeLinecap="round" opacity={0.85} />
            <Face c={c} expr={expression} open={open} blink={blink} wink={winkK} />
          </g>
        </g>
        {/* bras et mains (au-dessus du comptoir) */}
        {sleeve(shL, armL.elbow, armL.wrist, "sl")}
        {sleeve(shR, armR.elbow, armR.wrist, "sr")}
        <ellipse cx={restL.x + 14} cy={restL.y + 14} rx={30} ry={6} fill="#06110F" opacity={0.12} />
        {hand(armL.elbow, armL.wrist, "hl")}
        {box && (
          <g transform={`translate(${box.x} ${box.y}) rotate(${box.rot}) scale(${box.s} ${box.s * box.sy})`}>
            <MedGlyph kind={placeKind} w={boxW} side={1} shadow={!(place !== undefined && place < 0.8)} mood={mood} />
          </g>
        )}
        {hand(armR.elbow, armR.wrist, "hr")}
      </svg>
    </div>
  );
}

/* ================================================================== LE PATIENT */

/** Où est le patient pour un `leave` donné (0 = au comptoir, 1 = passé la porte). */
export function patientPose(leave: number, x0: number = SET.patient.x, y0: number = SET.patient.y) {
  const Lv = clamp01(leave);
  const back = SNAP(clamp01(Lv / 0.12));
  const wk = clamp01((Lv - 0.1) / 0.78);
  const k = lerp(wk, IN_OUT(wk), 0.5);
  const tx = SET.door.x - 8;
  const ty = SET.door.y + 10;
  const enter = clamp01((Lv - 0.88) / 0.12);
  const walk = clamp01(Math.min(wk / 0.05, (1 - wk) / 0.05)) * (wk > 0 && wk < 1 ? 1 : 0);
  return {
    x: lerp(x0, tx, k) + enter * 6,
    y: lerp(y0, ty, k) - enter * 8,
    scale: lerp(1, 0.64, k) * (1 - 0.06 * enter),
    back,
    opacity: 1 - enter,
    phase: wk * 7 * Math.PI,
    walk,
  };
}

export function Patient({
  t,
  mood,
  expression = "neutre",
  talk,
  leave = 0,
  back,
  boxesInBag = 1,
  bagKinds,
  peek = true,
  bagXray = 0,
  wave,
  grab,
  x = SET.patient.x,
  y = SET.patient.y,
  scale = 1,
}: {
  t: number;
  mood: Mood;
  expression?: "neutre" | "sourire";
  talk?: Win[];
  leave?: number;
  back?: number;
  boxesInBag?: 1 | 2;
  bagKinds?: MedKind[];
  peek?: boolean;
  bagXray?: number;
  wave?: number;
  grab?: number;
  x?: number;
  y?: number;
  scale?: number;
}) {
  const uid = useUid();
  const c = tones(MAN, mood);
  const pose = patientPose(leave, x, y);
  const b = clamp01(Math.max(back ?? 0, pose.back));
  const showBack = b >= 0.5;
  const turnSq = 1 - 0.16 * Math.sin(Math.PI * b);
  const ph = pose.phase;
  const swing = Math.sin(ph) * 15 * pose.walk;
  const bob = -Math.abs(Math.sin(ph)) * 8 * pose.walk;
  const br = Math.sin((t * 2 * Math.PI) / 4.2);
  const open = talkOpen(t, talk, 2.1);
  const blink = blinkAt(t, 2);
  const S = pose.scale * scale;

  // les jambes
  const hipY = -345;
  const legLen = 307;
  const leg = (hx: number, ang: number, lift: number) => {
    const a = (ang * Math.PI) / 180;
    return { hip: { x: hx, y: hipY }, ank: { x: hx - Math.sin(a) * (legLen - lift), y: hipY + Math.cos(a) * (legLen - lift) } };
  };
  const liftA = showBack ? Math.max(0, Math.sin(ph)) * 22 * pose.walk : 0;
  const liftB = showBack ? Math.max(0, -Math.sin(ph)) * 22 * pose.walk : 0;
  const far = leg(-40, showBack ? 0 : swing, liftA + (showBack ? 0 : 10));
  const near = leg(34, showBack ? 0 : -swing, liftB);
  const legShape = (l: { hip: Pt; ank: Pt }, fill: string) => {
    const dx = l.ank.x - l.hip.x;
    const dy = l.ank.y - l.hip.y;
    const n = Math.hypot(dx, dy) || 1;
    const nx = -dy / n;
    const ny = dx / n;
    const wh = 31;
    const wa = 23;
    return <path d={`M${l.hip.x + nx * wh},${l.hip.y + ny * wh} L${l.ank.x + nx * wa},${l.ank.y + ny * wa} L${l.ank.x - nx * wa},${l.ank.y - ny * wa} L${l.hip.x - nx * wh},${l.hip.y - ny * wh} Z`} fill={fill} strokeLinejoin="round" />;
  };
  const shoe = (p: Pt, key: string, dim = false) =>
    showBack ? (
      <g key={key} transform={`translate(${p.x} ${p.y})`}>
        <path d="M-24,-6 L24,-6 L24,28 C24,38 -24,38 -24,28 Z" fill={c.shoe} />
        <rect x={-24} y={26} width={48} height={8} rx={4} fill={c.sole} />
      </g>
    ) : (
      <g key={key} transform={`translate(${p.x} ${p.y})`}>
        <path d="M22,-8 C26,8 26,26 22,34 L-48,34 C-62,34 -64,20 -52,13 C-40,6 -22,-2 -10,-8 Z" fill={dim ? c.sole : c.shoe} />
        <path d="M24,28 L-56,28 C-60,30 -60,34 -52,36 L22,36 Z" fill={c.sole} />
        <path d="M-6,-2 L-20,8" stroke={c.sole} strokeWidth={2.4} strokeLinecap="round" />
      </g>
    );

  // le sac et les bras
  const UA = 128;
  const FA = 124;
  const shF = { x: -94, y: -556 + br * 1.4 };
  const shN = { x: 104, y: -556 + br * 1.4 };
  const kinds = bagKinds ?? kindsOf(boxesInBag);
  const bagW = 130;
  const bagH = bagW * 1.4;
  const holdF: Pt = { x: -124 + Math.sin(ph) * 10 * pose.walk, y: -322 };
  let wristF = holdF;
  let bagHandle: Pt = { x: holdF.x, y: holdF.y + 6 };
  let bagRot = Math.sin(ph + 0.6) * 7 * pose.walk + Math.sin(t * 1.7) * 1.2;
  if (grab !== undefined && grab < 1) {
    const g = clamp01(grab);
    const slot = { x: (SET.slots.bag.x - pose.x) / S, y: (SET.slots.bag.y - pose.y) / S };
    const onCounter = { x: slot.x, y: slot.y - bagH };
    if (g < 0.45) {
      wristF = mixP(holdF, { x: onCounter.x, y: onCounter.y - 6 }, SNAP(g / 0.45));
      bagHandle = onCounter;
      bagRot = 0;
    } else if (g < 0.55) {
      wristF = { x: onCounter.x, y: onCounter.y - 6 };
      bagHandle = onCounter;
      bagRot = 0;
    } else {
      const k = IN_OUT((g - 0.55) / 0.45);
      const p = mixP(onCounter, { x: holdF.x, y: holdF.y + 6 }, k);
      bagHandle = { x: p.x, y: p.y - Math.sin(Math.PI * k) * 40 };
      wristF = { x: bagHandle.x, y: bagHandle.y - 6 };
      bagRot = Math.sin(Math.PI * k) * -10;
    }
  }
  const armF = ik(shF, wristF, UA, FA, -1);
  const bagOnCounter = grab !== undefined && grab < 0.55;
  const bagEl = (
    <g transform={`translate(${bagHandle.x} ${bagHandle.y}) rotate(${bagRot})`}>
      <BagGlyph w={bagW} kinds={kinds} peek={peek} xray={bagXray} mood={mood} />
    </g>
  );
  // le signe de la main
  let wristN: Pt = { x: 120 + Math.sin(ph + Math.PI) * 10 * pose.walk, y: -326 };
  let waving = 0;
  if (wave !== undefined && t >= wave && t <= wave + 1.4) {
    waving = Math.min(SNAP(clamp01((t - wave) / 0.22)), 1 - prog(t, wave + 1.1, 0.3, IN_OUT));
    const osc = Math.sin((t - wave) * Math.PI * 2 * 2.4) * 0.38;
    const el = { x: 196, y: -600 };
    const up = { x: el.x + Math.sin(osc) * 118, y: el.y - Math.cos(osc) * 118 };
    wristN = mixP(wristN, up, waving);
  }
  const armN = ik(shN, wristN, UA, FA, 1);

  const sleeve = (s: Pt, e: Pt, w: Pt, key: string) => (
    <g key={key}>
      <path d={`M${s.x},${s.y} L${e.x},${e.y} L${w.x},${w.y}`} fill="none" stroke={c.jacketSh} strokeWidth={48} strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M${s.x},${s.y} L${e.x},${e.y} L${w.x},${w.y}`} fill="none" stroke={c.jacket} strokeWidth={43} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
  const fist = (e: Pt, w: Pt, key: string, palm = false) => {
    const a = (Math.atan2(w.y - e.y, w.x - e.x) * 180) / Math.PI;
    return (
      <g key={key} transform={`translate(${w.x} ${w.y}) rotate(${a})`}>
        {palm ? (
          <>
            <ellipse cx={20} cy={0} rx={22} ry={16} fill={c.skin} />
            <ellipse cx={10} cy={-15} rx={9} ry={5.5} fill={c.skin} transform="rotate(-50 10 -15)" />
          </>
        ) : (
          <>
            <ellipse cx={12} cy={0} rx={18} ry={16} fill={c.skin} />
            <path d="M18,-8 Q26,0 18,9" fill="none" stroke={c.skinSh} strokeWidth={2.2} strokeLinecap="round" />
          </>
        )}
      </g>
    );
  };

  const head = (
    <g transform={`translate(-6 ${-668 + br * 1.8}) rotate(${wobble(t, 5, 1.6, 0.5)}) scale(${showBack ? 1 : -1} 1)`}>
      {showBack ? (
        <g>
          <ellipse cx={-50} cy={4} rx={9} ry={13} fill={c.skin} />
          <ellipse cx={50} cy={4} rx={9} ry={13} fill={c.skin} />
          <path d="M-50,-6 C-56,-44 -30,-70 0,-70 C30,-70 56,-44 50,-6 C48,20 40,38 22,46 L-22,46 C-40,38 -48,20 -50,-6 Z" fill={c.hair} />
          <path d="M-30,-56 C-12,-66 14,-66 30,-56" fill="none" stroke={c.hairHi} strokeWidth={3} strokeLinecap="round" />
        </g>
      ) : (
        <g>
          <path d="M-46,-16 C-48,-50 -20,-64 6,-64 C36,-64 54,-44 54,-10 C54,14 50,34 38,48 C26,60 8,62 -8,58 C-28,52 -44,30 -46,-16 Z" fill={c.skin} />
          <ellipse cx={-40} cy={4} rx={9} ry={13} fill={c.skin} />
          <ellipse cx={-39} cy={5} rx={4.4} ry={7.4} fill={c.skinSh} />
          <path d="M-35,12 C-33,36 -14,58 8,60 C30,60 47,44 52,20 C47,31 40,41 30,43 C21,45 12,43 5,39 C-8,35 -22,27 -35,12 Z" fill={c.hairHi} opacity={0.85} />
          <path d="M17,25 Q30,20 43,24 Q30,27 17,25 Z" fill={c.hair} opacity={0.85} />
          <path d="M-48,-6 C-54,-44 -28,-72 6,-72 C40,-72 60,-52 54,-20 C50,-28 44,-32 36,-32 C26,-42 6,-44 -10,-38 C-22,-34 -30,-24 -34,-12 L-36,-2 C-42,-2 -46,-2 -48,-6 Z" fill={c.hair} />
          <path d="M-8,-60 C10,-66 32,-60 44,-46" fill="none" stroke={c.hairHi} strokeWidth={3.2} strokeLinecap="round" />
          <Face c={c} expr={expression} open={open} blink={blink} wink={0} k={1.02} />
        </g>
      )}
    </g>
  );

  return (
    <div style={{ position: "absolute", left: pose.x, top: pose.y, width: 0, height: 0, opacity: pose.opacity, transform: `scale(${S})`, transformOrigin: "0 0" }}>
      <svg width={700} height={1000} viewBox="-350 -940 700 1000" style={{ position: "absolute", left: -350, top: -940, overflow: "visible" }}>
        <defs>
          <radialGradient id={`ps${uid}`}>
            <stop offset="0%" stopColor="#06110F" stopOpacity={mood === "act1" ? 0.45 : 0.24} />
            <stop offset="100%" stopColor="#06110F" stopOpacity={0} />
          </radialGradient>
        </defs>
        <ellipse cx={0} cy={6} rx={140 - pose.walk * 10} ry={20} fill={`url(#ps${uid})`} />
        <g transform={`translate(0 ${bob}) scale(${turnSq} 1)`}>
          {/* le sac encore posé sur le comptoir : derrière le bras qui le prend */}
          {bagOnCounter && bagEl}
          {/* bras du fond (côté gauche de l'image) */}
          {sleeve(shF, armF.elbow, armF.wrist, "sf")}
          {/* jambes */}
          {legShape(far, c.trousersSh)}
          {shoe(far.ank, "shf", true)}
          {legShape(near, c.trousers)}
          {shoe(near.ank, "shn")}
          {/* le buste */}
          <path d="M-104,-566 C-108,-588 -74,-596 -40,-598 L34,-598 C74,-596 116,-586 120,-560 L116,-470 L112,-342 C56,-330 -46,-330 -98,-342 L-100,-470 Z" fill={c.jacket} />
          <path d="M100,-582 C116,-570 120,-560 116,-470 L112,-342 L92,-338 C98,-420 100,-520 100,-582 Z" fill={c.jacketSh} />
          {showBack ? (
            <g>
              <line x1={4} y1={-586} x2={4} y2={-340} stroke={c.jacketSh} strokeWidth={3} />
              <path d="M-52,-598 C-30,-610 34,-610 56,-598 L52,-580 C30,-588 -26,-588 -48,-580 Z" fill={c.jacketSh} />
              <path d="M-50,-606 C-30,-622 34,-622 54,-606 C50,-592 -46,-592 -50,-606 Z" fill={c.scarf} />
            </g>
          ) : (
            <g>
              <path d="M-46,-590 L18,-590 C16,-500 14,-420 12,-336 L-44,-334 C-46,-420 -46,-500 -46,-590 Z" fill={c.sweater} />
              <path d="M-46,-590 L-30,-590 L-38,-460 L-48,-472 Z" fill={c.jacketHi} />
              <path d="M18,-592 L40,-592 L22,-470 L12,-480 Z" fill={c.jacketHi} />
              <path d="M-44,-420 L12,-420" stroke={c.sweaterSh} strokeWidth={2} opacity={0.6} />
              <rect x={40} y={-424} width={52} height={9} rx={3} fill={c.jacketSh} />
              <rect x={-92} y={-424} width={36} height={9} rx={3} fill={c.jacketSh} />
              {/* l'écharpe */}
              <path d="M-52,-606 C-34,-626 32,-626 48,-606 C44,-588 -44,-588 -52,-606 Z" fill={c.scarf} />
              <path d="M-36,-598 L-8,-598 L-12,-494 L-38,-498 Z" fill={c.scarf} />
              <path d="M-38,-498 L-12,-494 L-13,-486 L-39,-490 Z" fill={c.scarfSh} />
              <path d="M-30,-560 L-14,-560 M-31,-530 L-13,-530" stroke={c.scarfSh} strokeWidth={2.4} />
            </g>
          )}
          {/* le cou */}
          {!showBack && <path d="M-22,-622 L-20,-600 L16,-600 L18,-622 Z" fill={c.skinSh} />}
          {showBack && <path d="M-22,-628 L-20,-604 L18,-604 L20,-628 Z" fill={c.skin} />}
          {head}
          {/* le sac, tenu par la main du fond */}
          {!bagOnCounter && bagEl}
          {fist(armF.elbow, armF.wrist, "ff")}
          {/* bras de devant */}
          {sleeve(shN, armN.elbow, armN.wrist, "sn")}
          {fist(armN.elbow, armN.wrist, "fn", waving > 0.3)}
        </g>
      </svg>
    </div>
  );
}

/* ================================================================== L'ÉCRAN DU COMPTOIR */

function GreyUI({ t }: { t: number }) {
  const rows = 9;
  const sel = Math.floor(t / 2.4) % rows;
  return (
    <div style={{ position: "absolute", inset: 0, background: "#BCC3C7" }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 70, background: "#5C6C78" }}>
        <div style={{ position: "absolute", left: 30, top: 24, width: 300, height: 22, borderRadius: 4, background: "#8796A1" }} />
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ position: "absolute", right: 24 + i * 64, top: 16, width: 44, height: 38, background: "#748591" }} />
        ))}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 70, height: 56, background: "#D2D7DA", display: "flex", gap: 40, padding: "18px 30px" }}>
        {[140, 110, 160, 90, 130].map((w, i) => (
          <div key={i} style={{ width: w, height: 20, borderRadius: 3, background: "#9AA4AA" }} />
        ))}
      </div>
      <div style={{ position: "absolute", left: 0, top: 126, bottom: 60, width: 360, background: "#C8CED1", padding: 30 }}>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} style={{ width: 200 + ((i * 47) % 90), height: 20, margin: "0 0 44px", borderRadius: 3, background: "#A3ACB1" }} />
        ))}
      </div>
      <div style={{ position: "absolute", left: 400, right: 40, top: 160, height: 60, background: "#97A3AB" }} />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ position: "absolute", left: 400, right: 40, top: 220 + i * 76, height: 76, background: i === sel ? "#7E98AE" : i % 2 ? "#D5DADD" : "#E1E5E7", display: "flex", gap: 50, alignItems: "center", padding: "0 30px" }}>
          {[260, 180, 120, 200].map((w, j) => (
            <div key={j} style={{ width: w - ((i * 31 + j * 17) % 70), height: 18, borderRadius: 3, background: i === sel ? "#5D7489" : "#A7B0B5" }} />
          ))}
        </div>
      ))}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 60, background: "#A8B1B6" }} />
      <div style={{ position: "absolute", left: 430, top: 186, width: 4, height: 30, background: "#2F3A40", opacity: Math.floor(t * 1.8) % 2 ? 0 : 1 }} />
    </div>
  );
}

function PbIdle({ t }: { t: number }) {
  const ring = (t * 0.7) % 1;
  return (
    <div style={{ position: "absolute", inset: 0, background: `linear-gradient(160deg, ${PB.paper} 0%, ${PB.paper2} 100%)` }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 150, background: PB.green, display: "flex", alignItems: "center", gap: 28, padding: "0 70px" }}>
        <div style={{ width: 62, height: 62, borderRadius: 18, background: PB.citron, boxShadow: `0 0 40px ${rgba(PB.citron, 0.6)}` }} />
        <div style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 76, letterSpacing: "-0.03em", color: "#FFFFFF" }}>PharmaBoost</div>
      </div>
      <div style={{ position: "absolute", left: 800 - 170, top: 575 - 170, width: 340, height: 340, borderRadius: "50%", border: `8px solid ${rgba(PB.brand, 0.5 * (1 - ring))}`, transform: `scale(${0.6 + ring * 0.7})` }} />
      <div style={{ position: "absolute", left: 800 - 110, top: 575 - 110, width: 220, height: 220, borderRadius: 50, background: PB.green, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        {[8, 4, 12, 4, 6, 10, 4, 8].map((w, i) => (
          <div key={i} style={{ width: w, height: 110, background: PB.citron, borderRadius: 2 }} />
        ))}
      </div>
    </div>
  );
}

export function CounterScreen({
  t,
  mood,
  state,
  power,
  children,
  x,
  y,
  w = SET.screen.w,
  tilt,
  stand = true,
}: {
  t: number;
  mood: Mood;
  state: "off" | "grey" | "pb";
  power?: number;
  children?: ReactNode;
  x?: number;
  y?: number;
  w?: number;
  tilt?: number;
  stand?: boolean;
}) {
  const inRoom = x === undefined || y === undefined;
  const cx = x ?? SET.screen.x;
  const cy = y ?? SET.screen.y;
  const tl = tilt ?? (inRoom ? SET.screen.tilt : 0);
  const h = w * 0.625;
  const bz = w * 0.035;
  const p = state === "pb" ? clamp01(power ?? 1) : 0;
  const k = w / 1600;
  const line = clamp01(p / 0.2);
  const reveal = SNAP(clamp01((p - 0.18) / 0.32));
  const flash = p > 0 && p < 1 ? Math.sin(Math.PI * clamp01((p - 0.15) / 0.5)) : 0;
  const body = mood === "act1" ? "#1B2125" : "#1E2A28";
  const neck = mood === "act1" ? "#2B3337" : "#C9D4D0";
  const glowC = state === "pb" ? PB.citron : state === "grey" ? "#B8D2DE" : "#000000";
  const glowA = state === "pb" ? 0.55 * p : state === "grey" ? 0.1 : 0;
  return (
    <div style={{ position: "absolute", left: cx - w / 2 - bz, top: cy - h / 2 - bz, width: w + 2 * bz, height: h + 2 * bz }}>
      {glowA > 0 && (
        <div style={{ position: "absolute", left: -w * 0.45, top: -h * 0.6, width: w * 1.9 + 2 * bz, height: h * 2.2, background: `radial-gradient(ellipse at 50% 50%, ${rgba(glowC, glowA)} 0%, ${rgba(glowC, glowA * 0.3)} 40%, transparent 70%)` }} />
      )}
      <div style={{ position: "absolute", inset: 0, transform: `perspective(${w * 5}px) rotateY(${tl}deg)`, transformOrigin: "50% 50%" }}>
        {stand && (
          <>
            <div style={{ position: "absolute", left: "50%", top: h + bz * 1.5, width: w * 0.09, height: w * 0.16, marginLeft: -w * 0.045, background: `linear-gradient(90deg, ${neck}, ${rgba("#000000", 0.25)})`, borderRadius: 4 }} />
            <div style={{ position: "absolute", left: "50%", top: h + bz * 1.5 + w * 0.15, width: w * 0.42, height: w * 0.045, marginLeft: -w * 0.21, background: neck, borderRadius: w * 0.03, boxShadow: `0 ${w * 0.02}px ${w * 0.04}px ${rgba("#000000", 0.25)}` }} />
          </>
        )}
        <div style={{ position: "absolute", inset: 0, borderRadius: bz * 1.3, background: body, boxShadow: `0 ${w * 0.05}px ${w * 0.1}px ${rgba("#06110F", 0.35)}` }} />
        <div style={{ position: "absolute", left: bz, top: bz, width: w, height: h, overflow: "hidden", borderRadius: bz * 0.45, background: "#0B1013" }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: 1600, height: 1000, transform: `scale(${k})`, transformOrigin: "0 0" }}>
            {state === "off" && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg, #0C1114 0%, #1B2429 100%)" }} />}
            {state === "grey" && <GreyUI t={t} />}
            {state === "pb" && (
              <>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg, #0C1114 0%, #1B2429 100%)" }} />
                <div style={{ position: "absolute", inset: 0, clipPath: `inset(${(1 - reveal) * 50}% 0 ${(1 - reveal) * 50}% 0)`, transform: `scale(${1 + (1 - reveal) * 0.04})` }}>{children ?? <PbIdle t={t} />}</div>
                {line > 0 && reveal < 1 && <div style={{ position: "absolute", left: 800 - 800 * line, top: 495, width: 1600 * line, height: 10, background: PB.citron, boxShadow: `0 0 60px 20px ${rgba(PB.citron, 0.6)}`, opacity: 1 - reveal }} />}
                {flash > 0 && <div style={{ position: "absolute", inset: 0, background: PB.citron, opacity: 0.35 * flash, mixBlendMode: "screen" }} />}
              </>
            )}
          </div>
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(118deg, ${rgba("#FFFFFF", 0.12)} 0%, ${rgba("#FFFFFF", 0.03)} 30%, transparent 46%)`, pointerEvents: "none" }} />
        </div>
        <div style={{ position: "absolute", left: "50%", bottom: bz * 0.3, width: 5, height: 5, marginLeft: -2.5, borderRadius: "50%", background: p > 0 ? PB.mint : state === "grey" ? "#7FA0B0" : "#5A4A2A" }} />
      </div>
    </div>
  );
}

/* ================================================================== LA PHARMACIE */

const ROOM = {
  act1: {
    wall: "#283035",
    ceil: "#141A1D",
    shelfBack: "#2C353A",
    plank: "#47535A",
    plankEdge: "#58656C",
    upright: "#343E44",
    floor: "#1C2225",
    floorLine: "#262E32",
    topA: "#7A878D",
    topB: "#5E6A70",
    lip: "#4A555B",
    front: "#2A3439",
    frontLine: "rgba(255,255,255,0.035)",
    stripe: "#3A4A45",
    kick: "#12181B",
    frame: "#151C20",
    skyA: "#18232A",
    skyB: "#2A3840",
    bldg: "#10181D",
    bldg2: "#141E24",
    win: "#2E3E46",
    winWarm: "#4D554F",
    fixture: "#3A4449",
    tube: A1.neon,
    glass: "rgba(190,215,225,0.07)",
    leaf: "#3E5A50",
    leaf2: "#34493F",
    pot: "#4A5358",
    steel: "#59666C",
    bell: "#8C989D",
  },
  pb: {
    wall: PB.paper,
    ceil: "#E3ECE9",
    shelfBack: "#EAF2EF",
    plank: "#FFFFFF",
    plankEdge: "#D3DEDA",
    upright: "#DFE8E4",
    floor: "#E3EAE7",
    floorLine: "#D2DCD8",
    topA: "#FFFFFF",
    topB: "#EBF1EF",
    lip: "#D9E3DF",
    front: PB.green,
    frontLine: "rgba(255,255,255,0.05)",
    stripe: PB.citron,
    kick: "#0A201C",
    frame: PB.green,
    skyA: "#CFEDE6",
    skyB: "#F4FBF9",
    bldg: "#BFD9D2",
    bldg2: "#D2E6E0",
    win: "#E6F4F0",
    winWarm: "#F6F0D6",
    fixture: "#FFFFFF",
    tube: "#FFFDF2",
    glass: "rgba(255,255,255,0.18)",
    leaf: "#2E8B63",
    leaf2: "#22704F",
    pot: "#FFFFFF",
    steel: "#A9B8B3",
    bell: "#C9D2D6",
  },
};
type RoomPal = Record<keyof (typeof ROOM)["pb"], string>;

const SHELF_COLORS = ["#0E8A7B", "#36C9A8", "#0796B4", "#7FA8F5", "#A894EE", "#F2928A", "#8CCB6A", "#2EC4B6"];
const SHELF_ROWS = [182, 312, 442, 572, 702];
const MODULES: [number, number][] = [
  [24, 316],
  [334, 626],
  [644, 936],
  [954, 1246],
];
type ShelfItem = { x: number; y: number; w: number; h: number; kind: 0 | 1 | 2; c: number; white: boolean };
const SHELF_ITEMS: ShelfItem[] = (() => {
  const out: ShelfItem[] = [];
  SHELF_ROWS.forEach((ry, r) =>
    MODULES.forEach(([a, b], m) => {
      let x = a + 6 + rnd("shOff", r * 10 + m, 0, 10);
      for (let i = 0; i < 40; i++) {
        const s = r * 1000 + m * 50 + i;
        const kind: 0 | 1 | 2 = hash("shk", s) < 0.7 ? 0 : hash("shk2", s) < 0.6 ? 1 : 2;
        const w = kind === 0 ? rnd("shw", s, 38, 76) : kind === 1 ? rnd("shw", s, 26, 38) : rnd("shw", s, 36, 50);
        if (x + w > b - 6) break;
        const h = kind === 0 ? rnd("shh", s, 58, 104) : kind === 1 ? rnd("shh", s, 72, 108) : rnd("shh", s, 44, 60);
        out.push({ x, y: ry, w, h, kind, c: Math.floor(hash("shc", s) * SHELF_COLORS.length), white: hash("shwh", s) < 0.55 });
        x += w + rnd("shg", s, 2, 8);
      }
    }),
  );
  return out;
})();

function Shelves({ mood, c }: { mood: Mood; c: RoomPal }) {
  const col = (i: number) => (mood === "act1" ? coldGrade(SHELF_COLORS[i], 0.62) : SHELF_COLORS[i]);
  const white = mood === "act1" ? "#5F6B71" : "#FFFFFF";
  const pale = (i: number) => (mood === "act1" ? coldGrade(SHELF_COLORS[i], 0.5) : rgba(SHELF_COLORS[i], 0.28));
  return (
    <g>
      {MODULES.map(([a, b], i) => (
        <rect key={`bk${i}`} x={a - 6} y={70} width={b - a + 12} height={665} fill={c.shelfBack} />
      ))}
      {SHELF_ITEMS.map((it, i) => {
        const top = it.y - it.h;
        if (it.kind === 0)
          return (
            <g key={i}>
              <rect x={it.x} y={top} width={it.w} height={it.h} fill={it.white ? white : mood === "act1" ? pale(it.c) : "#FFFFFF"} />
              {!it.white && mood === "pb" && <rect x={it.x} y={top} width={it.w} height={it.h} fill={pale(it.c)} />}
              <rect x={it.x} y={top} width={it.w} height={it.h * (it.white ? 0.3 : 0.16)} fill={col(it.c)} />
              <rect x={it.x + it.w * 0.14} y={top + it.h * 0.52} width={it.w * 0.6} height={Math.max(3, it.h * 0.06)} rx={1.5} fill={col(it.c)} opacity={0.55} />
              <rect x={it.x + it.w * 0.86} y={top} width={it.w * 0.14} height={it.h} fill="#000000" opacity={mood === "act1" ? 0.18 : 0.06} />
            </g>
          );
        if (it.kind === 1)
          return (
            <g key={i}>
              <rect x={it.x + it.w * 0.22} y={top} width={it.w * 0.56} height={12} rx={3} fill={col(it.c)} />
              <rect x={it.x} y={top + 10} width={it.w} height={it.h - 10} rx={it.w * 0.32} fill={it.white ? white : pale(it.c)} />
              <rect x={it.x} y={top + it.h * 0.42} width={it.w} height={it.h * 0.3} fill={col(it.c)} opacity={0.8} />
              <rect x={it.x + it.w * 0.18} y={top + 18} width={it.w * 0.14} height={it.h * 0.5} rx={3} fill="#FFFFFF" opacity={mood === "act1" ? 0.08 : 0.5} />
            </g>
          );
        return (
          <g key={i}>
            <rect x={it.x} y={top} width={it.w} height={12} rx={4} fill={col(it.c)} />
            <rect x={it.x + 2} y={top + 10} width={it.w - 4} height={it.h - 10} rx={8} fill={it.white ? white : pale(it.c)} />
            <rect x={it.x + 6} y={top + it.h * 0.45} width={it.w - 12} height={it.h * 0.24} rx={3} fill={col(it.c)} opacity={0.6} />
          </g>
        );
      })}
      {SHELF_ROWS.map((ry, r) => (
        <g key={`pl${r}`}>
          <rect x={10} y={ry} width={1250} height={10} fill={c.plank} />
          <rect x={10} y={ry + 10} width={1250} height={4} fill={c.plankEdge} />
          <rect x={10} y={ry + 14} width={1250} height={18} fill="#000000" opacity={mood === "act1" ? 0.22 : 0.05} />
          {mood === "pb" && <rect x={10} y={ry + 14} width={1250} height={2} fill="#FFFFFF" opacity={0.9} />}
        </g>
      ))}
      {[10, 320, 630, 940, 1250].map((ux, i) => (
        <rect key={`up${i}`} x={ux - 4} y={64} width={14} height={671} fill={c.upright} />
      ))}
    </g>
  );
}

function OutsideView({ c, x0, y0, w, h, mood, t, sky }: { c: RoomPal; x0: number; y0: number; w: number; h: number; mood: Mood; t: number; sky: string }) {
  // la rue d'en face, vue à travers la vitre (mêmes immeubles pour la vitrine et la porte)
  const bl = [
    { x: 1240, w: 150, h: 420, c: c.bldg },
    { x: 1390, w: 120, h: 340, c: c.bldg2 },
    { x: 1510, w: 170, h: 470, c: c.bldg },
    { x: 1680, w: 140, h: 380, c: c.bldg2 },
    { x: 1820, w: 160, h: 440, c: c.bldg },
  ];
  const ground = 560;
  return (
    <g>
      <rect x={x0} y={y0} width={w} height={h} fill={`url(#${sky})`} />
      {bl.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={ground - b.h} width={b.w} height={b.h} fill={b.c} />
          {Array.from({ length: Math.floor(b.h / 60) * 2 }, (_, j) => {
            const col = j % 2;
            const row = Math.floor(j / 2);
            const lit = hash(`win${i}`, j) < (mood === "act1" ? 0.35 : 0.0);
            return <rect key={j} x={b.x + 22 + col * (b.w / 2)} y={ground - b.h + 26 + row * 60} width={b.w / 2 - 44} height={30} fill={lit ? c.winWarm : c.win} opacity={mood === "act1" ? 0.55 : 0.8} />;
          })}
        </g>
      ))}
      <rect x={x0} y={ground} width={w} height={h} fill={mood === "act1" ? "#151D21" : "#D9E6E2"} />
      <rect x={x0} y={ground + 70} width={w} height={6} fill={mood === "act1" ? "#2A353A" : "#FFFFFF"} opacity={0.7} />
      {/* un réverbère / un arbre */}
      {mood === "act1" ? (
        <g>
          <rect x={1745} y={260} width={6} height={300} fill="#0C1215" />
          <circle cx={1748} cy={258} r={8} fill="#C9D6DC" opacity={0.5 + 0.2 * Math.sin(t * 2)} />
          <circle cx={1748} cy={258} r={40} fill="#C9D6DC" opacity={0.08} />
        </g>
      ) : (
        <g>
          <rect x={1742} y={420} width={10} height={140} fill="#9DBDB4" />
          <circle cx={1747} cy={400} r={56 + Math.sin(t * 1.2) * 2} fill="#A9D8C3" />
          <circle cx={1720} cy={420} r={34} fill="#B7E0CE" />
        </g>
      )}
    </g>
  );
}

export function Pharmacy({
  t,
  mood,
  light = 1,
  screen,
  screenPower,
  screenContent,
  doorOpen = 0,
  chimeAt,
  douchette = true,
  screenTilt,
  children,
}: {
  screenTilt?: number;
  t: number;
  mood: Mood;
  light?: number;
  screen?: "off" | "grey" | "pb";
  screenPower?: number;
  screenContent?: ReactNode;
  doorOpen?: number;
  chimeAt?: number | number[];
  douchette?: boolean;
  children?: ReactNode;
}) {
  const uid = useUid();
  const c = ROOM[mood];
  const act1 = mood === "act1";
  const hum = act1 ? 0.9 + 0.1 * buzz(t, "neon") : 1;
  const cr = SET.cross;
  const d = SET.door;
  const dl = d.x - d.w / 2;
  const dr = d.x + d.w / 2;
  const dt = d.y - d.h;
  // la porte s'ouvre vers l'intérieur (le bord libre vient vers nous)
  const op = clamp01(doorOpen);
  const th = (op * 78 * Math.PI) / 180;
  const freeX = dr - d.w * Math.cos(th);
  const grow = 34 * Math.sin(th);
  // la clochette
  const chimes = chimeAt === undefined ? [] : Array.isArray(chimeAt) ? chimeAt : [chimeAt];
  let bell = 0;
  for (const ch of chimes) if (t >= ch) bell += 26 * Math.exp(-2.6 * (t - ch)) * Math.sin((t - ch) * Math.PI * 2 * 2.3);
  const vt = SET.vitrine;
  const fl = SET.floorY;
  const vp = { x: 960, y: 300 };
  const id = (s: string) => `${s}${uid}`;
  return (
    <AbsoluteFill style={{ background: c.wall, overflow: "hidden" }}>
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <linearGradient id={id("sky")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.skyA} />
            <stop offset="100%" stopColor={c.skyB} />
          </linearGradient>
          <linearGradient id={id("wall")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={act1 ? "#20272B" : "#FFFFFF"} />
            <stop offset="100%" stopColor={c.wall} />
          </linearGradient>
          <linearGradient id={id("top")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.topB} />
            <stop offset="100%" stopColor={c.topA} />
          </linearGradient>
          <radialGradient id={id("cone")} cx="0.5" cy="0" r="1" gradientTransform="translate(0.5 0) scale(0.62 1) translate(-0.5 0)">
            <stop offset="0%" stopColor={c.tube} stopOpacity={act1 ? 0.2 * hum : 0.12} />
            <stop offset="55%" stopColor={c.tube} stopOpacity={act1 ? 0.05 * hum : 0.03} />
            <stop offset="100%" stopColor={c.tube} stopOpacity={0} />
          </radialGradient>
          <linearGradient id={id("sun")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFF4D2" stopOpacity={0.55} />
            <stop offset="100%" stopColor="#FFF4D2" stopOpacity={0} />
          </linearGradient>
          <linearGradient id={id("ctrSh")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06110F" stopOpacity={act1 ? 0.5 : 0.22} />
            <stop offset="100%" stopColor="#06110F" stopOpacity={0} />
          </linearGradient>
          <linearGradient id={id("front")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.front} />
            <stop offset="100%" stopColor={act1 ? "#20292D" : "#0B2420"} />
          </linearGradient>
          <clipPath id={id("vit")}>
            <rect x={vt.x + 12} y={vt.y + 12} width={vt.w - 24} height={vt.h - 12} />
          </clipPath>
          <clipPath id={id("door")}>
            <rect x={dl + 12} y={dt + 12} width={d.w - 24} height={d.h - 12} />
          </clipPath>
        </defs>

        {/* le mur et le plafond */}
        <rect width={1920} height={1080} fill={`url(#${id("wall")})`} />
        <rect width={1920} height={64} fill={c.ceil} />
        <rect y={60} width={1920} height={4} fill="#000000" opacity={act1 ? 0.3 : 0.05} />

        <Shelves mood={mood} c={c} />

        {/* la vitrine, la croix verte suspendue */}
        <rect x={vt.x} y={vt.y} width={vt.w} height={vt.h} fill={c.frame} />
        <g clipPath={`url(#${id("vit")})`}>
          <OutsideView c={c} x0={vt.x} y0={vt.y} w={vt.w} h={vt.h} mood={mood} t={t} sky={id("sky")} />
          <rect x={vt.x} y={vt.y} width={vt.w} height={vt.h} fill={c.glass} />
          <path d={`M${vt.x + 20},${vt.y + 300} L${vt.x + 130},${vt.y + 12} L${vt.x + 160},${vt.y + 12} L${vt.x + 50},${vt.y + 300} Z`} fill="#FFFFFF" opacity={act1 ? 0.04 : 0.22} />
          <rect x={vt.x} y={vt.y + vt.h - 120} width={vt.w} height={64} fill={act1 ? "rgba(200,220,230,0.06)" : "rgba(255,255,255,0.55)"} />
        </g>
        <line x1={cr.x} y1={vt.y + 12} x2={cr.x} y2={cr.y - cr.size / 2} stroke={c.steel} strokeWidth={3} />
        <g transform={`translate(${cr.x} ${cr.y})`}>
          <CrossGlyph t={t} flicker={act1} mood={mood} size={cr.size} />
        </g>

        {/* la porte vitrée */}
        <rect x={dl} y={dt} width={d.w} height={d.h} fill={c.frame} />
        <g clipPath={`url(#${id("door")})`}>
          <OutsideView c={c} x0={dl} y0={dt} w={d.w} h={d.h} mood={mood} t={t} sky={id("sky")} />
        </g>
        {op > 0.001 ? (
          <g>
            <path d={`M${freeX},${dt - grow} L${dr},${dt} L${dr},${fl} L${freeX},${fl + grow} Z`} fill={c.frame} />
            <path d={`M${freeX + 12},${dt - grow + 14} L${dr - 12},${dt + 12} L${dr - 12},${fl - 60} L${freeX + 12},${fl + grow - 62} Z`} fill={act1 ? "rgba(120,150,165,0.28)" : "rgba(215,240,235,0.6)"} />
            <path d={`M${freeX + 24},${dt + 150} L${freeX + 24},${dt + 330}`} stroke={c.steel} strokeWidth={8} strokeLinecap="round" />
          </g>
        ) : (
          <g>
            <rect x={dl + 12} y={dt + 12} width={d.w - 24} height={d.h - 12} fill={c.glass} />
            <path d={`M${dl + 30},${dt + 320} L${dl + 150},${dt + 20} L${dl + 178},${dt + 20} L${dl + 58},${dt + 320} Z`} fill="#FFFFFF" opacity={act1 ? 0.04 : 0.2} />
            <rect x={dl + 12} y={fl - 60} width={d.w - 24} height={48} fill={c.steel} opacity={0.6} />
            <rect x={dl + 30} y={dt + 230} width={10} height={170} rx={5} fill={c.steel} />
          </g>
        )}
        <rect x={dr - 70} y={dt - 6} width={56} height={16} rx={4} fill={c.steel} />
        {/* la clochette */}
        <path d={`M${dl - 18},${dt - 30} C${dl + 10},${dt - 36} ${SET.bell.x},${dt - 30} ${SET.bell.x},${SET.bell.y - 26}`} fill="none" stroke={c.steel} strokeWidth={4} strokeLinecap="round" />
        <g transform={`rotate(${bell} ${SET.bell.x} ${SET.bell.y - 26})`}>
          <line x1={SET.bell.x} y1={SET.bell.y - 26} x2={SET.bell.x} y2={SET.bell.y - 14} stroke={c.steel} strokeWidth={3} />
          <path d={`M${SET.bell.x - 16},${SET.bell.y + 10} C${SET.bell.x - 16},${SET.bell.y - 18} ${SET.bell.x + 16},${SET.bell.y - 18} ${SET.bell.x + 16},${SET.bell.y + 10} Z`} fill={c.bell} />
          <rect x={SET.bell.x - 19} y={SET.bell.y + 8} width={38} height={5} rx={2.5} fill={c.steel} />
          <circle cx={SET.bell.x + bell * 0.15} cy={SET.bell.y + 16} r={4} fill={c.steel} />
        </g>

        {/* la plante, à droite de la porte */}
        <g transform={`translate(1868 ${fl})`}>
          {[-62, -36, -12, 12, 34, 58].map((a, i) => {
            const sway = wobble(t, 20 + i, 2.6, 0.6);
            return (
              <g key={i} transform={`rotate(${a + sway} 0 -90)`}>
                <path d="M0,-90 C-26,-150 -18,-210 0,-250 C18,-210 26,-150 0,-90 Z" fill={i % 2 ? c.leaf : c.leaf2} />
                <path d="M0,-96 L0,-238" stroke={act1 ? "#2C3D36" : "#5FBF92"} strokeWidth={2} opacity={0.6} />
              </g>
            );
          })}
          <path d="M-46,-96 L46,-96 L36,0 L-36,0 Z" fill={c.pot} />
          <rect x={-50} y={-104} width={100} height={12} rx={4} fill={c.pot} />
          <rect x={-50} y={-92} width={100} height={4} fill="#000000" opacity={0.08} />
        </g>

        {/* le sol */}
        <rect x={0} y={fl} width={1920} height={1080 - fl} fill={c.floor} />
        <rect x={0} y={fl} width={1920} height={6} fill="#000000" opacity={act1 ? 0.35 : 0.07} />
        {Array.from({ length: 14 }, (_, i) => {
          const bx = -400 + i * 220;
          const tx = vp.x + (bx - vp.x) * ((fl - vp.y) / (1080 - vp.y));
          return <line key={`fv${i}`} x1={tx} y1={fl} x2={bx} y2={1080} stroke={c.floorLine} strokeWidth={2} />;
        })}
        {[0.12, 0.3, 0.55, 0.85].map((k, i) => (
          <line key={`fh${i}`} x1={0} y1={fl + (1080 - fl) * k} x2={1920} y2={fl + (1080 - fl) * k} stroke={c.floorLine} strokeWidth={2} />
        ))}
        {!act1 && (
          <g opacity={0.85 + 0.15 * Math.sin(t * 0.9)}>
            <path d={`M${vt.x + 12},${fl} L${vt.x + vt.w - 12},${fl} L${vt.x + 70},1080 L${vt.x - 250},1080 Z`} fill={`url(#${id("sun")})`} />
            <path d={`M${dl + 12},${fl} L${dr - 12},${fl} L${dr - 120},1080 L${dl - 260},1080 Z`} fill={`url(#${id("sun")})`} />
          </g>
        )}

        {/* le plafonnier */}
        <rect x={0} y={44} width={1920} height={fl - 44} fill={`url(#${id("cone")})`} />
        <rect x={540} y={22} width={840} height={22} rx={6} fill={c.fixture} />
        <rect x={556} y={42} width={808} height={8} rx={4} fill={c.tube} opacity={act1 ? 0.5 + 0.5 * hum : 1} />
        {act1 && <rect x={540} y={36} width={840} height={30} rx={14} fill={A1.neon} opacity={0.12 * hum} />}

        {/* le comptoir */}
        <rect x={110} y={958} width={1130} height={50} fill={`url(#${id("ctrSh")})`} />
        <rect x={140} y={600} width={1070} height={368} fill={`url(#${id("front")})`} />
        {Array.from({ length: 44 }, (_, i) => (
          <rect key={`fl${i}`} x={156 + i * 24} y={630} width={2} height={318} fill={c.frontLine} />
        ))}
        <rect x={140} y={612} width={1070} height={4} fill={c.stripe} opacity={act1 ? 0.6 : 1} />
        {!act1 && <rect x={140} y={606} width={1070} height={16} fill={PB.citron} opacity={0.12 + 0.04 * Math.sin(t * 2)} />}
        <rect x={150} y={948} width={1050} height={20} fill={c.kick} />
        <path d={`M${SET.counter.backLeft},${SET.counter.backY} L${SET.counter.backRight},${SET.counter.backY} L${SET.counter.frontRight},${SET.counter.frontY} L${SET.counter.frontLeft},${SET.counter.frontY} Z`} fill={`url(#${id("top")})`} />
        <path d={`M${SET.counter.backLeft},${SET.counter.backY} L${SET.counter.backRight},${SET.counter.backY} L${SET.counter.backRight + 2},${SET.counter.backY + 4} L${SET.counter.backLeft - 2},${SET.counter.backY + 4} Z`} fill="#000000" opacity={act1 ? 0.25 : 0.06} />
        <rect x={140} y={588} width={1070} height={14} rx={3} fill={c.lip} />
        <rect x={140} y={588} width={1070} height={3} fill="#FFFFFF" opacity={act1 ? 0.12 : 0.9} />

        {/* le terminal de paiement */}
        <g transform="translate(232 572)">
          <ellipse cx={4} cy={0} rx={40} ry={6} fill="#000000" opacity={act1 ? 0.35 : 0.12} />
          <path d="M-28,0 L28,0 L22,-76 L-22,-76 Z" fill={act1 ? "#1E2629" : "#26332F"} />
          <rect x={-16} y={-68} width={32} height={22} rx={3} fill={act1 ? "#41505A" : "#9FE3C9"} />
          {Array.from({ length: 9 }, (_, i) => (
            <rect key={i} x={-15 + (i % 3) * 11} y={-38 + Math.floor(i / 3) * 10} width={8} height={6} rx={1.5} fill={act1 ? "#3A4449" : "#4D5E59"} />
          ))}
        </g>
        {/* la douchette sur son socle */}
        {douchette && (
          <g transform={`translate(${SET.slots.douchette.x} ${SET.slots.douchette.y})`}>
            <ellipse cx={0} cy={2} rx={42} ry={7} fill="#000000" opacity={act1 ? 0.35 : 0.12} />
            <path d="M-36,0 L30,0 L22,-14 C10,-30 -30,-22 -36,-12 Z" fill={act1 ? "#232B2F" : "#2B3532"} />
            <g transform="translate(-14 -10) rotate(-58) scale(0.4)">
              <DouchetteGlyph t={t} beam={0} led={0} mood={mood} beamLength={0} beamWidth={0} />
            </g>
          </g>
        )}

        {/* poussière dans la lumière */}
        {Array.from({ length: act1 ? 18 : 12 }, (_, i) => {
          const px = 300 + rnd("dust", i, 0, 1300) + Math.sin(t * 0.4 + i) * 18;
          const py = 120 + ((rnd("dustY", i, 0, 600) - t * (6 + rnd("dustV", i, 0, 8)) + 6000) % 600);
          const a = (act1 ? 0.25 : 0.35) * (0.5 + 0.5 * Math.sin(t * (1 + rnd("dustT", i, 0, 2)) + i));
          return <circle key={`d${i}`} cx={px} cy={py} r={rnd("dustR", i, 1.2, 2.8)} fill={act1 ? A1.neon : "#FFFFFF"} opacity={a} />;
        })}
      </svg>

      <CounterScreen t={t} mood={mood} state={screen ?? (act1 ? "grey" : "off")} power={screenPower} tilt={screenTilt}>
        {screenContent}
      </CounterScreen>

      {children}

      {light < 1 && <AbsoluteFill style={{ background: A1.ink, opacity: clamp01(1 - light) * 0.95, pointerEvents: "none" }} />}
    </AbsoluteFill>
  );
}
