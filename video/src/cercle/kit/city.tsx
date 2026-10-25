import { createContext, useContext, useId, type CSSProperties, type ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { clamp01, lerp, prog, POP, EXIT } from "../../presentation/motion/kit/ease";
import { hash } from "../../presentation/motion/kit/random";
import { JAKARTA, N, PB, rgba } from "./brand";

/* ==========================================================================
 * LA RUE — le décor du Reel « Le Cercle » (style de la référence : rue isométrique de NUIT, blocs à trois faces,
 * fenêtres chaudes rares, lampadaires et leurs halos, passage piéton, profondeur), en SVG pur (net en 4K), SANS ÉTAT :
 * tout est fonction de `t` et des props. Partagé par les 8 scènes.
 *
 * LE MONDE (en mètres) : x le long de la rue (vers la DROITE-bas de l'écran), y en travers (vers la GAUCHE-bas,
 * vers le spectateur), z vers le haut. Le trottoir du fond y ∈ [−3, 0], la chaussée y ∈ [0, 7], le trottoir de devant
 * y ∈ [7, 9,6]. Les façades du fond sont à y = −3.
 *   PB_SHOP    la pharmacie PharmaBoost, à GAUCHE : x ∈ [−10,5, −2], porte au centre (x ≈ −6,25)
 *   COTE_SHOP  la pharmacie « à côté », à DROITE : x ∈ [2, 10,5] ; une ruelle entre les deux, le passage piéton devant.
 *   Chacune : façade, devanture, deux vitrines, porte vitrée, enseigne « PHARMACIE » en relief, croix verte en néon
 *   (drapeau perpendiculaire à la façade, à son extrémité DROITE : sous et à droite des étiquettes posées au-dessus).
 *
 * PROJECTION ET CAMÉRA
 *   iso(x, y, z) → [px, py]        monde → plan iso (zoom 1, origine du monde en 0,0) ; ISO_K = 30 px/m, ISO_ZK = 1,22
 *   toScreen(cam, x, y, z) → [px, py]   monde → ÉCRAN 1080 × 1920 (le point cam.x, cam.y au sol tombe sur FOCUS)
 *   CityCam = { x, y, zoom }        FOCUS = [540, 1040] (milieu de la scène utile)
 *   CAMS (pbAbove = le point 1,8 m au-dessus du toit de PharmaBoost, à l'écran) :
 *     overview  zoom 0,8   tout le quartier, la rue en diagonale (ouverture de C1)          pbAbove ≈ (400, 800)
 *     both      zoom 1,3   les DEUX pharmacies côte à côte, cadre de référence (C1, C7)      pbAbove ≈ (330, 700),
 *                          coteAbove ≈ (818, 944), porte d'à côté ≈ (790, 1252), la file jusqu'à x ≈ 90
 *     pb        zoom 2     serré sur PharmaBoost (vitrines, file ; ≈ 180 px libres au-dessus du toit, y 590 → 770)
 *     cote      zoom 2     serré sur la pharmacie d'à côté (C6), même cadre                 coteAbove ≈ (520, 770)
 *     high      zoom 0,5   très haut au-dessus du quartier (suspense, C7)                   pbAbove ≈ (470, 900)
 *   camLerp(a, b, k)  interpolation (x, y linéaires, zoom géométrique : un zoom régulier) ; k peut dépasser 1 (POP)
 *   camLook(x, y, z, zoom, at?)  le cadrage qui pose ce point du monde au point écran `at` (défaut FOCUS) ;
 *        plonger dans la vitrine : camLerp(CAMS.both, camLook(...windowOf(PB_SHOP), 9), k)
 *   anchors(cam) → { pbDoor, pbSign, pbAbove, pbWindow, pbCross, coteDoor, coteSign, coteAbove, coteWindow,
 *                    coteCross, street } en px ÉCRAN — pour poser étiquettes, bulles, robots par-dessus la rue.
 *        door = le trottoir devant la porte ; sign = le milieu du mot PHARMACIE ; above = 1,8 m au-dessus du toit, au
 *        milieu de la façade (ABOVE_Z = 6,4 m) ; window = la vitrine de DROITE (windowOf, rien devant) ; street = le
 *        milieu de la chaussée, au passage piéton.
 *   groundTransform(z), facadeTransform(y, s?), sideTransform(x, s?)   repères SVG (en mètres) pour dessiner AU SOL
 *        ou SUR une façade dans `overlay` ou les enfants : un anneau au sol autour de la pharmacie =
 *        <g transform={groundTransform(0.12)}><ellipse cx={PB_SHOP.xc} cy={-2} rx={7} ry={5} … /></g>.
 *
 * <City t cam? lights? pbLit? coteLit? pbCross? coteCross? coteFlicker? queue? queueCount? lamps? windows? fog? dim?
 *       sky? front? overlay? style?>{enfants}</City>
 *   AbsoluteFill 1080 × 1920. Défauts : cam = CAMS.both, lights 1, pbLit 0, coteLit 1, pbCross 1, coteCross 1,
 *   coteFlicker 0, queue 0, queueCount 7, lamps 1, windows 1, fog 1, dim 0, sky true.
 *   lights      0..1  les deux pharmacies s'allument d'un même néon NEUTRE (vitrines blanc froid, croix vertes)
 *   pbLit       0..1  la vitrine PharmaBoost passe au CITRON CHAUD, halo sur le trottoir et la chaussée, les passants
 *                     proches se teintent de sa lumière. 0 = identique à l'autre (neutre).
 *   coteLit     0..1  la vitrine d'à côté (lumière froide) ; 0 = éteinte.
 *   pbCross / coteCross  0..1  la croix néon (1 allumée, 0 éteinte).
 *   coteFlicker 0..1  la croix ET la vitrine d'à côté GRÉSILLENT (coupures irrégulières, déterministes en t).
 *   queue       0..1  la file devant PharmaBoost (0 personne, 1 toute la file arrivée et qui patiente).
 *   lamps, windows    0..1  lampadaires, fenêtres allumées des immeubles.   fog 0..1 brume des bords.
 *   dim         0..1  assombrit tout le décor (fond de scène derrière une carte ou un téléphone).
 *   enfants     dessinés DANS le monde (coordonnées iso : <Passant/>, <Queue/>, <IsoBox/>…), devant les façades et
 *               derrière les lampadaires et voitures ; `front` : devant lampadaires et voitures ; `overlay` : par-dessus
 *               tout le décor (avant la brume). Les immeubles du premier plan (y > 9,6) restent devant les enfants.
 *
 * LES HABITANTS (à mettre DANS <City>)
 *   <Passant t path={[[x, y], …]} start dur color seed? bag? fadeIn? enter? opacity? scale? />
 *        une pilule colorée (deux tons, dessus clair, ombre au sol) qui marche le long du chemin (vitesse régulière,
 *        départ et arrêt doux) de start à start + dur ; avant : au premier point ; après : au dernier.
 *        bag : un sac de pharmacie blanc à croix verte ; fadeIn : apparaît en 0,3 s au départ ; enter : s'efface dans
 *        les 0,35 dernières secondes (il entre dans la pharmacie).
 *   <Queue t at count? stagger? speed? />   la file qui arrive devant PharmaBoost à partir de `at` (un passant toutes
 *        les `stagger` s, par le trottoir ou par le passage piéton), puis patiente (petits mouvements).
 *   PASSANT_COLORS  citron, menthe, rose poudré, blanc, sarcelle.   QUEUE_SPOTS : les places de la file.
 *   <LampPost x y on? h? />   un lampadaire (poteau, tête lumineuse, halo) — City pose déjà les siens (LAMPS).
 *   <IsoBox x0 x1 y0 y1 z0? z1 top front right />   un bloc quelconque dans le monde.
 *
 * PAR-DESSUS (HTML, en px écran, hors de <City>)
 *   <FloatTag t at x y text sub? icon? out? tone? stem? scale? />   étiquette flottante façon « Coupe 25 € » de la
 *        référence : carte sombre à fin liseré citron, ancrée par son BAS-MILIEU en (x, y) (prendre anchors(cam).pbAbove),
 *        entre en pop à `at`, flotte, sort à `out`. tone "dark" | "citron" (pastille citron, texte vert) | "ghost"
 *        (grise, pour « à côté »). icon "box" | "rx" | "cross" | "heart" | "star" | "bag" | "check" | ReactNode.
 *
 * Exemple :
 *   const cam = camLerp(CAMS.overview, CAMS.both, prog(t, 0.5, 1.4, IN_OUT));
 *   const a = anchors(cam);
 *   <City t={t} cam={cam} pbLit={prog(t, 5.8, 0.6)} queue={prog(t, 6.2, 2.4)}>
 *     <Passant t={t} path={[[16, -1.3], [-18, -1.3]]} start={6.4} dur={7} color={PASSANT_COLORS[3]} seed={2} />
 *   </City>
 *   <FloatTag t={t} at={3.1} x={a.pbAbove[0]} y={a.pbAbove[1]} text="Amoxicilline 1 g" icon="box" />
 * La bande y < 580 (le grand texte) : les cadrages CAMS y mettent seulement des toits et du ciel sombres.
 * ======================================================================== */

export type P2 = [number, number];
export type P3 = [number, number, number];

// ---------------------------------------------------------------- couleurs

function rgbOf(c: string): [number, number, number] {
  const h = c.replace("#", "");
  const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  const v = parseInt(n, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
/** Mélange de deux couleurs hexadécimales (k = 0 → a, 1 → b), rendu en hexadécimal. */
export function mixColor(a: string, b: string, k: number) {
  const A = rgbOf(a);
  const B = rgbOf(b);
  const q = clamp01(k);
  const c = (i: number) => Math.round(A[i] + (B[i] - A[i]) * q).toString(16).padStart(2, "0");
  return `#${c(0)}${c(1)}${c(2)}`;
}

// ---------------------------------------------------------------- projection

export const ISO_K = 30;
export const ISO_ZK = 1.22;
const K = ISO_K;
const KZ = ISO_K * ISO_ZK;
export const FOCUS: P2 = [540, 1040];
/** La hauteur du point « au-dessus » (anchors) : 1,8 m au-dessus du toit, au-dessus de la croix. */
export const ABOVE_Z = 6.4;

/** Monde (mètres) → plan iso en px (zoom 1, origine du monde en 0,0). */
export function iso(x: number, y: number, z = 0): P2 {
  return [(x - y) * K, (x + y) * K * 0.5 - z * KZ];
}
const r2 = (n: number) => Math.round(n * 100) / 100;
const pt = (x: number, y: number, z = 0) => {
  const [a, b] = iso(x, y, z);
  return `${r2(a)},${r2(b)}`;
};
const poly = (list: P3[]) => list.map(([x, y, z]) => pt(x, y, z)).join(" ");
const rectD = (u: number, v: number, w: number, h: number) => `M${r2(u)},${r2(v)}h${r2(w)}v${r2(h)}h${r2(-w)}Z`;
/** Repère d'une face +y (plan y = const) : u = x, v = −z (mètres × s). */
const MY = (y: number, s = 1) => `matrix(${K / s} ${K / 2 / s} 0 ${KZ / s} ${r2(-y * K)} ${r2((y * K) / 2)})`;
/** Repère d'une face +x (plan x = const) : u = y, v = −z. */
const MX = (x: number, s = 1) => `matrix(${-K / s} ${K / 2 / s} 0 ${KZ / s} ${r2(x * K)} ${r2((x * K) / 2)})`;
/** Repère du sol à la hauteur z : u = x, v = y. */
const MG = (z = 0) => `matrix(${K} ${K / 2} ${-K} ${K / 2} 0 ${r2(-z * KZ)})`;

/** Repères SVG exportés (à poser sur un <g transform> DANS <City>, pour dessiner au sol ou sur une façade, en mètres) :
 *  groundTransform(z) : le sol à la hauteur z (u = x, v = y) — un anneau au sol = un <circle> dedans ;
 *  facadeTransform(y, s) : une façade +y (u = x, v = −z, unités × s : s = 100 pour du texte en cm) ;
 *  sideTransform(x, s) : une face +x (u = y, v = −z). */
export const groundTransform = (z = 0) => MG(z);
export const facadeTransform = (y: number, s = 1) => MY(y, s);
export const sideTransform = (x: number, s = 1) => MX(x, s);

// ---------------------------------------------------------------- caméra

export type CityCam = { x: number; y: number; zoom: number };
/**
 * Le cadrage qui pose le point du monde (x, y, z) au point ÉCRAN `at` (défaut FOCUS), au zoom donné. Pour plonger dans la
 * vitrine : camLerp(CAMS.both, camLook(...windowOf(PB_SHOP), 9), k).
 */
export function camLook(x: number, y: number, z: number, zoom: number, at: P2 = FOCUS): CityCam {
  const [ix, iy] = iso(x, y, z);
  const a = (ix - (at[0] - FOCUS[0]) / zoom) / K;
  const b = (2 * (iy - (at[1] - FOCUS[1]) / zoom)) / K;
  return { x: (a + b) / 2, y: (b - a) / 2, zoom };
}

/** Les cadrages nommés, définis par l'endroit de l'écran où tombe le point « au-dessus » de la pharmacie (anchors). */
export const CAMS: Record<"overview" | "both" | "pb" | "cote" | "high", CityCam> = {
  overview: camLook(-6.25, -3, ABOVE_Z, 0.8, [400, 800]),
  both: camLook(-6.25, -3, ABOVE_Z, 1.3, [330, 700]),
  pb: camLook(-6.25, -3, ABOVE_Z, 2, [590, 770]),
  cote: camLook(6.25, -3, ABOVE_Z, 2, [520, 770]),
  high: camLook(-6.25, -3, ABOVE_Z, 0.5, [470, 900]),
};

export function camLerp(a: CityCam, b: CityCam, k: number): CityCam {
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), zoom: a.zoom * Math.pow(b.zoom / a.zoom, k) };
}

/** Monde → écran (px du cadre 1080 × 1920) pour ce cadrage. */
export function toScreen(cam: CityCam, x: number, y: number, z = 0): P2 {
  const [cx, cy] = iso(cam.x, cam.y, 0);
  const [px, py] = iso(x, y, z);
  return [FOCUS[0] + (px - cx) * cam.zoom, FOCUS[1] + (py - cy) * cam.zoom];
}
const camTransform = (cam: CityCam) => {
  const [cx, cy] = iso(cam.x, cam.y, 0);
  return `translate(${r2(FOCUS[0] - cx * cam.zoom)} ${r2(FOCUS[1] - cy * cam.zoom)}) scale(${cam.zoom})`;
};

// ---------------------------------------------------------------- le quartier

export const STREET = { x0: -60, x1: 60, farWalk: [-3, 0] as P2, road: [0, 7] as P2, nearWalk: [7, 9.6] as P2, curb: 0.12, crossing: [-1.6, 1.6] as P2 };

export type Shop = { x0: number; x1: number; y0: number; y1: number; h: number; xc: number; door: P2; cross: P3; spot: P2 };
const shop = (x0: number, x1: number, crossX: number): Shop => {
  const xc = (x0 + x1) / 2;
  return { x0, x1, y0: -11.5, y1: -3, h: 4.6, xc, door: [xc - 0.7, xc + 0.7], cross: [crossX, -1.85, 5.6], spot: [xc, -2.2] };
};
export const PB_SHOP = shop(-10.5, -2, -2.45);
/** Le centre de la vitrine de DROITE (rien devant : la file est à gauche) — la cible d'une plongée dans la vitrine. */
export const windowOf = (s: Shop): P3 => [(s.door[1] + 0.22 + s.x1 - 0.45) / 2, s.y1, 1.7];
export const COTE_SHOP = shop(2, 10.5, 10.05);

/** Les places de la file devant PharmaBoost : la première à la porte, puis vers la gauche le long de la vitrine. */
export const QUEUE_SPOTS: P2[] = Array.from({ length: 10 }, (_, i) => [PB_SHOP.xc - 0.1 - i * 0.86 + (hash("qx", i) - 0.5) * 0.14, -2.12 + (i % 2 ? 0.46 : 0) + (hash("qy", i) - 0.5) * 0.12]);

export const PASSANT_COLORS = [PB.citron, "#8EEBD3", "#F0BAC6", "#F4F8F6", "#36A99B"] as const;

export const LAMPS: P2[] = [
  [-31, -0.45],
  [-15.6, -0.45],
  [1.1, -0.45],
  [15.6, -0.45],
  [31, -0.45],
  [-23.5, 7.45],
  [-8.2, 7.45],
  [8.6, 7.45],
  [24, 7.45],
];
const FAR_LAMPS = LAMPS.filter((l) => l[1] < 3);
const NEAR_LAMPS = LAMPS.filter((l) => l[1] >= 3);

const CARS: { x: number; y: number; color: string }[] = [
  { x: -20.5, y: 5.75, color: "#23413B" },
  { x: 16.8, y: 5.75, color: "#2A3437" },
  { x: 29.5, y: 1.25, color: "#3A3F37" },
  { x: -32, y: 1.25, color: "#1F3630" },
];

type Bld = { id: string; x0: number; x1: number; y0: number; y1: number; h: number; fog: number; kind: "back" | "far" | "near" };
const bl = (kind: Bld["kind"], fog: number) => (id: string, x0: number, x1: number, y0: number, y1: number, h: number): Bld => ({ id, x0, x1, y0, y1, h, fog, kind });
const r3 = bl("back", 0.6);
const r2b = bl("back", 0.38);
const fr = bl("far", 0);
const nr = bl("near", 0.42);
const BACK3: Bld[] = [r3("r3a", -60, -40, -42, -28, 16), r3("r3b", -40, -24, -42, -28, 19), r3("r3c", -24, -9, -42, -29, 14), r3("r3d", -9, 7, -42, -28, 21), r3("r3e", 7, 22, -42, -29, 16.5), r3("r3f", 22, 40, -42, -28, 19), r3("r3g", 40, 60, -42, -28, 15)];
const BACK2: Bld[] = [
  r2b("r2a", -60, -46, -25.5, -14, 11),
  r2b("r2b", -46, -31.5, -25.5, -13.5, 13.5),
  r2b("r2c", -31.5, -17.5, -25.5, -14, 9.5),
  r2b("r2d", -16.5, -4.5, -25.5, -13.5, 12),
  r2b("r2e", -4.5, 5.5, -25.5, -13.8, 15.5),
  r2b("r2f", 5.5, 19, -25.5, -13.5, 10.5),
  r2b("r2g", 19, 33, -25.5, -14, 14),
  r2b("r2h", 33.5, 47, -25.5, -13.5, 9.5),
  r2b("r2i", 47, 60, -25.5, -13.5, 12.5),
];
const FAR: Bld[] = [
  fr("f0", -60, -48, -12, -3, 10),
  fr("f1", -48, -37, -12, -3, 8.5),
  fr("f2", -37, -27.5, -12, -3, 11.5),
  fr("f3", -27.5, -17.5, -12, -3, 13.5),
  fr("f4", -17.5, -10.5, -12, -3, 9),
  fr("f5", 10.5, 18.5, -12, -3, 10.5),
  fr("f6", 18.5, 27, -12, -3, 7.5),
  fr("f7", 27, 37, -12, -3, 12.5),
  fr("f8", 37, 48, -12, -3, 9),
  fr("f9", 48, 60, -12, -3, 11),
];
const NEAR2: Bld[] = [bl("near", 0.62)("m0", -60, -40, 24, 40, 3.4), bl("near", 0.62)("m1", -38, -20, 24, 40, 2.6), bl("near", 0.62)("m2", -18, -2, 24, 38, 3.8), bl("near", 0.62)("m3", 0, 16, 24, 40, 3), bl("near", 0.62)("m4", 18, 36, 24, 40, 3.6), bl("near", 0.62)("m5", 38, 60, 24, 40, 2.8)];
const NEAR: Bld[] = [nr("n0", -60, -46, 9.6, 22, 2.8), nr("n1", -44, -32, 9.6, 22, 3.4), nr("n2", -30, -16, 9.6, 22, 2.6), nr("n3", -14, 1, 9.6, 20, 3.2), nr("n4", 3, 17, 9.6, 22, 2.7), nr("n5", 19, 34, 9.6, 22, 3.5), nr("n6", 36, 48, 9.6, 22, 3), nr("n7", 50, 60, 9.6, 22, 2.6)];

// ---------------------------------------------------------------- contexte (la lumière, pour les passants)

type Ctx = { pbWarm: number; t: number };
const CityCtx = createContext<Ctx>({ pbWarm: 0, t: 0 });
const PB_LIGHT: P2 = [PB_SHOP.xc, -2.4];

// ---------------------------------------------------------------- briques

/** Un bloc dans le monde (trois faces visibles : dessus, face +y « gauche », face +x « droite »). */
export function IsoBox({ x0, x1, y0, y1, z0 = 0, z1, top, front, right, opacity }: { x0: number; x1: number; y0: number; y1: number; z0?: number; z1: number; top: string; front: string; right: string; opacity?: number }) {
  return (
    <g opacity={opacity}>
      <polygon points={poly([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]])} fill={right} />
      <polygon points={poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]])} fill={front} />
      <polygon points={poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]])} fill={top} />
    </g>
  );
}

/** Le toit à acrotère : le rebord, le mur intérieur du fond et de gauche, le plancher en contrebas. */
function Roof({ x0, x1, y0, y1, h, top, back, left, floor }: { x0: number; x1: number; y0: number; y1: number; h: number; top: string; back: string; left: string; floor: string }) {
  const i = 0.34;
  const d = 0.36;
  const a = x0 + i;
  const b = x1 - i;
  const c = y0 + i;
  const e = y1 - i;
  const A: P3 = [a, c, h];
  const B: P3 = [b, c, h];
  const C: P3 = [b, e, h];
  const D: P3 = [a, e, h];
  const A2: P3 = [a, c, h - d];
  const Pp: P3 = [b, c + d * ISO_ZK, h];
  const R: P3 = [a + d * ISO_ZK, e, h];
  return (
    <g>
      <polygon points={poly([[x0, y0, h], [x1, y0, h], [x1, y1, h], [x0, y1, h]])} fill={top} />
      <polygon points={poly([A, B, Pp, A2])} fill={back} />
      <polygon points={poly([A, A2, R, D])} fill={left} />
      <polygon points={poly([A2, Pp, C, R])} fill={floor} />
    </g>
  );
}

function shades(id: string, fog: number) {
  const tone = (hash(id, 3) - 0.5) * 0.2;
  const sh = (c: string) => mixColor(tone >= 0 ? mixColor(c, "#3F6B5F", tone) : mixColor(c, "#000000", -tone * 1.4), N.sky, fog);
  const top = sh(N.top);
  const front = sh(N.left);
  const right = sh(mixColor(N.right, "#000000", 0.3));
  return { top, front, right, roofBack: sh(mixColor(N.left, N.right, 0.35)), roofLeft: sh(mixColor(N.right, "#000000", 0.2)), roofFloor: sh(mixColor(N.top, N.left, 0.55)) };
}

/** Les fenêtres d'une face, regroupées en trois tracés (allumées, tamisées, éteintes) + celles qui s'allument au fil du temps. */
function windowsOf(seed: string, u0: number, u1: number, zFrom: number, h: number, t: number) {
  const lit: string[] = [];
  const dimW: string[] = [];
  const off: string[] = [];
  const ww = 1.0;
  const wh = 1.55;
  const bay = 2.7;
  const n = Math.floor((u1 - u0 - 1.4) / bay);
  if (n < 1) return { lit: "", dim: "", off: "" };
  const start = u0 + (u1 - u0 - (n - 1) * bay - ww) / 2;
  let idx = 0;
  for (let z = zFrom; z + wh < h - 0.7; z += 3.1) {
    for (let j = 0; j < n; j++, idx++) {
      const hv = hash(seed, idx);
      const d = rectD(start + j * bay, -(z + wh), ww, wh);
      if (hv < 0.1) lit.push(d);
      else if (hv < 0.17) dimW.push(d);
      else if (hv < 0.185 && Math.floor(t / 2.9 + hash(seed, idx + 77) * 4) % 3 === 0) lit.push(d);
      else off.push(d);
    }
  }
  return { lit: lit.join(""), dim: dimW.join(""), off: off.join("") };
}

function Building({ b, t, wk, shadeId }: { b: Bld; t: number; wk: number; shadeId: string }) {
  const s = shades(b.id, b.fog);
  const { x0, x1, y0, y1, h } = b;
  const zFrom = b.kind === "far" ? 4.1 : b.kind === "near" ? 0.8 : 1.3;
  const wf = windowsOf(`${b.id}f`, x0, x1, zFrom, h, t);
  const wr = windowsOf(`${b.id}r`, y0, y1, zFrom, h, t);
  const litC = mixColor(N.window, N.sky, b.fog * 0.55);
  const dimC = mixColor(N.window, s.front, 0.52);
  const offF = mixColor(s.front, N.windowOff, 0.5);
  const offR = mixColor(s.right, N.windowOff, 0.35);
  // Les rez-de-chaussée commerçants du fond : rideaux baissés.
  const shutters: string[] = [];
  const slats: string[] = [];
  if (b.kind === "far") {
    const n = Math.max(1, Math.floor((x1 - x0) / 4.6));
    const w = (x1 - x0 - 0.8 * (n + 1)) / n;
    for (let i = 0; i < n; i++) {
      const u = x0 + 0.8 + i * (w + 0.8);
      shutters.push(rectD(u, -2.9, w, 2.9));
      for (let z = 0.3; z < 2.8; z += 0.32) slats.push(rectD(u, -z, w, 0.05));
    }
  }
  const units = b.kind === "near" ? 0 : Math.floor(hash(b.id, 11) * 2.6);
  return (
    <g>
      <polygon points={poly([[x1, y0, 0], [x1, y1, 0], [x1, y1, h], [x1, y0, h]])} fill={s.right} />
      <polygon points={poly([[x0, y1, 0], [x1, y1, 0], [x1, y1, h], [x0, y1, h]])} fill={s.front} />
      <polygon points={poly([[x0, y1, 0], [x1, y1, 0], [x1, y1, h], [x0, y1, h]])} fill={`url(#${shadeId})`} />
      <Roof x0={x0} x1={x1} y0={y0} y1={y1} h={h} top={s.top} back={s.roofBack} left={s.roofLeft} floor={s.roofFloor} />
      {Array.from({ length: units }, (_, i) => {
        const w = 1.3 + hash(b.id, 20 + i) * 1.6;
        const d = 1.1 + hash(b.id, 30 + i) * 1.4;
        const hh = 0.7 + hash(b.id, 40 + i) * 1.1;
        const ux = x0 + 1 + hash(b.id, 50 + i) * Math.max(0.1, x1 - x0 - w - 2);
        const uy = y0 + 1 + (i / Math.max(1, units)) * Math.max(0.1, y1 - y0 - d - 2);
        return <IsoBox key={i} x0={ux} x1={ux + w} y0={uy} y1={uy + d} z0={h - 0.36} z1={h - 0.36 + hh} top={mixColor(s.top, "#FFFFFF", 0.04)} front={s.front} right={s.right} />;
      })}
      <g transform={MY(y1)}>
        {wf.off && <path d={wf.off} fill={offF} />}
        {wf.dim && <path d={wf.dim} fill={dimC} opacity={wk} />}
        {wf.lit && <path d={wf.lit} fill={litC} opacity={wk} />}
        {shutters.length > 0 && <path d={shutters.join("")} fill={mixColor(s.front, N.right, 0.55)} />}
        {slats.length > 0 && <path d={slats.join("")} fill={mixColor(s.front, "#000000", 0.35)} />}
      </g>
      <g transform={MX(x1)}>
        {wr.off && <path d={wr.off} fill={offR} />}
        {wr.dim && <path d={wr.dim} fill={mixColor(N.window, s.right, 0.6)} opacity={wk} />}
        {wr.lit && <path d={wr.lit} fill={mixColor(litC, s.right, 0.2)} opacity={wk} />}
      </g>
    </g>
  );
}

// ---------------------------------------------------------------- les pharmacies

const GLASS = {
  off: ["#10231F", "#0C1C19", "#081512"],
  cold: ["#B4C8CD", "#8099A0", "#4B636A"],
  warm: ["#FFFFF4", "#F4FFB8", "#D6EE7C"],
};
const glassStops = (lit: number, warm: number) => [0, 1, 2].map((i) => mixColor(GLASS.off[i], mixColor(GLASS.cold[i], GLASS.warm[i], warm), lit));
const LIGHT_COLD = "#B9D3DA";
const LIGHT_WARM = "#F4FFB8";

const PRODUCT_COLORS = [PB.teal, PB.brand, "#E58FA6", "#2E9C8F", "#6FA9CF", PB.green2];
const SHELVES = [0.98, 1.66, 2.34];
function productsFor(seed: string, spans: P2[]) {
  const byColor: string[][] = PRODUCT_COLORS.map(() => []);
  spans.forEach(([u0, u1], vi) => {
    SHELVES.forEach((zs, si) => {
      let u = u0 + 0.1 + hash(`${seed}o${vi}`, si) * 0.2;
      let i = 0;
      while (u < u1 - 0.24) {
        const w = 0.13 + hash(`${seed}w${vi}${si}`, i) * 0.13;
        const hh = 0.18 + hash(`${seed}h${vi}${si}`, i) * 0.24;
        const c = Math.floor(hash(`${seed}c${vi}${si}`, i) * PRODUCT_COLORS.length) % PRODUCT_COLORS.length;
        byColor[c].push(rectD(u, -(zs + hh), w, hh));
        u += w + 0.035 + hash(`${seed}g${vi}${si}`, i) * 0.09;
        i++;
      }
    });
  });
  return byColor.map((d) => d.join(""));
}
const vitrines = (s: Shop): P2[] => [
  [s.x0 + 0.45, s.door[0] - 0.22],
  [s.door[1] + 0.22, s.x1 - 0.45],
];
const PRODUCTS = { pb: productsFor("pb", vitrines(PB_SHOP)), cote: productsFor("cote", vitrines(COTE_SHOP)) };

/** La croix verte en néon : un drapeau perpendiculaire à la façade (plan x = cx), épais, avec son tube lumineux. */
function NeonCross({ c, on, y1, glowId }: { c: P3; on: number; y1: number; glowId: string }) {
  const [cx, cy, cz] = c;
  const plus = (a: number, w: number): [number, number][] => [
    [cy - w, cz + a],
    [cy + w, cz + a],
    [cy + w, cz + w],
    [cy + a, cz + w],
    [cy + a, cz - w],
    [cy + w, cz - w],
    [cy + w, cz - a],
    [cy - w, cz - a],
    [cy - w, cz - w],
    [cy - a, cz - w],
    [cy - a, cz + w],
    [cy - w, cz + w],
  ];
  const a = 0.78;
  const w = 0.27;
  const th = 0.22;
  const shape = plus(a, w);
  const sides: { pts: P3[]; up: boolean }[] = [];
  shape.forEach((p, i) => {
    const q = shape[(i + 1) % shape.length];
    const ny = -(q[1] - p[1]);
    const nz = q[0] - p[0];
    if (ny > 0 || nz > 0)
      sides.push({
        up: nz > 0,
        pts: [
          [cx, p[0], p[1]],
          [cx, q[0], q[1]],
          [cx - th, q[0], q[1]],
          [cx - th, p[0], p[1]],
        ],
      });
  });
  const face = (pl: [number, number][]) => poly(pl.map(([y, z]) => [cx, y, z] as P3));
  const [gx, gy] = iso(cx, cy, cz);
  return (
    <g>
      {on > 0.01 && (
        <g style={{ mixBlendMode: "screen" }}>
          <circle cx={gx} cy={gy} r={K * 4.6} fill={`url(#${glowId})`} opacity={on * 0.4} />
          <circle cx={gx} cy={gy} r={K * 2.1} fill={`url(#${glowId})`} opacity={on * 0.9} />
        </g>
      )}
      {/* la potence : un bras fixé en haut de la façade, une tige jusqu'à la croix */}
      <polygon points={poly([[cx - 0.08, y1, 4.36], [cx - 0.08, cy + 0.06, 4.36], [cx - 0.08, cy + 0.06, 4.5], [cx - 0.08, y1, 4.5]])} fill="#0B1A17" />
      <polygon points={poly([[cx - 0.08, cy - 0.06, 4.36], [cx - 0.08, cy + 0.06, 4.36], [cx - 0.08, cy + 0.06, cz - a + 0.05], [cx - 0.08, cy - 0.06, cz - a + 0.05]])} fill="#0B1A17" />
      {sides.map((s, i) => (
        <polygon key={i} points={poly(s.pts)} fill={s.up ? mixColor("#123C2B", "#3FBF7A", on * 0.8) : mixColor("#0B2A1E", "#1C8A50", on * 0.85)} />
      ))}
      <polygon points={face(shape)} fill={mixColor("#0F2E24", PB.cross, on)} />
      <polygon points={face(plus(a - 0.09, w - 0.09))} fill={mixColor("#163F30", "#D8FFE8", on)} />
      <polygon points={face(plus(a - 0.16, w - 0.16))} fill={mixColor("#11352A", "#5FF0A0", on)} />
    </g>
  );
}

function Pharmacy({ s, side, lit, warm, cross, t, p }: { s: Shop; side: "pb" | "cote"; lit: number; warm: number; cross: number; t: number; p: string }) {
  const { x0, x1, y0, y1, h, xc, door } = s;
  const wall = mixColor(N.left, "#2E5047", 0.34);
  const wallR = mixColor(N.right, "#000000", 0.18);
  const frame = "#091915";
  const glass = `url(#${p}-glass-${side})`;
  const [vL, vR] = vitrines(s);
  const vz: P2 = [0.32, 3.02];
  const prods = PRODUCTS[side];
  const mullions: string[] = [];
  for (const [u0, u1] of [vL, vR]) {
    const n = Math.max(1, Math.round((u1 - u0) / 1.35));
    for (let i = 1; i < n; i++) mullions.push(rectD(u0 + ((u1 - u0) * i) / n - 0.035, -vz[1], 0.07, vz[1] - vz[0]));
    mullions.push(rectD(u0, -2.5, u1 - u0, 0.06));
  }
  const shelves = [vL, vR].flatMap(([u0, u1]) => SHELVES.map((zs) => rectD(u0 + 0.05, -zs, u1 - u0 - 0.1, 0.06))).join("");
  const pendants = [vL, vR].flatMap(([u0, u1]) => [u0 + (u1 - u0) * 0.3, u0 + (u1 - u0) * 0.72]);
  const sign = { x0: x0 + 0.22, x1: x1 - 0.22, yF: y1 + 0.42, z0: 3.36, z1: 4.16 };
  const letters = mixColor("#24443B", mixColor("#C9DCE0", "#FBFFE8", warm), lit);
  const lightC = mixColor(LIGHT_COLD, LIGHT_WARM, warm);
  const cs = (xx: number, zz: number, r: number, ww: number) => `M${r2(xx - ww)},${r2(-(zz + r))}h${r2(2 * ww)}v${r2(r - ww)}h${r2(r - ww)}v${r2(2 * ww)}h${r2(-(r - ww))}v${r2(r - ww)}h${r2(-2 * ww)}v${r2(-(r - ww))}h${r2(-(r - ww))}v${r2(-2 * ww)}h${r2(r - ww)}Z`;
  const shimmer = 0.94 + 0.06 * Math.sin(t * 2.1 + (side === "pb" ? 0 : 1.7));
  return (
    <g>
      {/* Le volume */}
      <polygon points={poly([[x1, y0, 0], [x1, y1, 0], [x1, y1, h], [x1, y0, h]])} fill={wallR} />
      <polygon points={poly([[x0, y1, 0], [x1, y1, 0], [x1, y1, h], [x0, y1, h]])} fill={wall} />
      <Roof x0={x0} x1={x1} y0={y0} y1={y1} h={h} top={mixColor(N.top, "#2D5047", 0.25)} back={mixColor(N.left, N.right, 0.3)} left={mixColor(N.right, "#000000", 0.15)} floor={mixColor(N.top, N.left, 0.5)} />
      <IsoBox x0={xc + 0.6} x1={xc + 2.4} y0={y0 + 2.2} y1={y0 + 3.6} z0={h - 0.36} z1={h + 0.55} top={mixColor(N.top, "#FFFFFF", 0.05)} front={N.left} right={N.right} />
      <g transform={MY(y1)}>
        {/* la lumière qui déborde sur la façade */}
        <ellipse cx={xc} cy={-1.7} rx={(x1 - x0) * 0.72} ry={3.4} fill={`url(#${p}-spill-${side})`} opacity={lit * (0.35 + 0.65 * warm) * shimmer} />
        <rect x={x0 + 0.15} y={-(h - 0.12)} width={x1 - x0 - 0.3} height={0.12} fill={mixColor(wall, "#7FA79B", 0.18)} />
        {/* devanture */}
        <rect x={x0 + 0.2} y={-3.24} width={x1 - x0 - 0.4} height={3.24} fill={frame} />
        <rect x={x0 + 0.2} y={-0.3} width={x1 - x0 - 0.4} height={0.3} fill={mixColor(frame, wall, 0.55)} />
        {[vL, vR].map(([u0, u1], i) => (
          <rect key={i} x={u0} y={-vz[1]} width={u1 - u0} height={vz[1] - vz[0]} fill={glass} />
        ))}
        {/* l'intérieur : étagères, produits, comptoir, suspensions */}
        <g opacity={clamp01(lit * 1.2)}>
          <path d={shelves} fill={rgba(PB.ink, 0.38)} />
          {prods.map((d, i) => d && <path key={i} d={d} fill={PRODUCT_COLORS[i]} opacity={0.62 - 0.14 * warm} />)}
          <rect x={vR[0]} y={-1.12} width={vR[1] - vR[0]} height={1.12 - vz[0]} fill={rgba(PB.ink, 0.28)} />
          {pendants.map((u, i) => (
            <g key={i}>
              <rect x={u - 0.012} y={-vz[1]} width={0.024} height={0.22} fill={rgba(PB.ink, 0.5)} />
              <ellipse cx={u} cy={-(vz[1] - 0.26)} rx={0.17} ry={0.06} fill={mixColor("#FFFFFF", PB.glow, warm)} />
            </g>
          ))}
        </g>
        <path d={mullions.join("")} fill={frame} />
        {/* la porte */}
        <rect x={door[0] - 0.08} y={-2.75} width={door[1] - door[0] + 0.16} height={2.75} fill={frame} />
        <rect x={door[0]} y={-2.66} width={door[1] - door[0]} height={2.66} fill={glass} />
        <rect x={door[0]} y={-2.66} width={door[1] - door[0]} height={2.66} fill={rgba("#000000", 0.16)} />
        <rect x={xc - 0.035} y={-2.66} width={0.07} height={2.66} fill={frame} />
        <rect x={xc - 0.2} y={-1.25} width={0.06} height={0.42} fill={rgba(PB.ink, 0.7)} />
        <rect x={xc + 0.14} y={-1.25} width={0.06} height={0.42} fill={rgba(PB.ink, 0.7)} />
        <path d={cs(door[0] + 0.36, 1.78, 0.16, 0.055) + cs(door[1] - 0.36, 1.78, 0.16, 0.055)} fill={mixColor("#1B4A35", PB.cross, lit * 0.9)} />
      </g>
      {/* L'enseigne en relief */}
      <IsoBox x0={sign.x0} x1={sign.x1} y0={y1} y1={sign.yF} z0={sign.z0} z1={sign.z1} top={mixColor("#183A31", "#2B5A4C", lit * 0.4)} front={mixColor("#0C2621", "#123A31", lit * 0.5)} right="#08201B" />
      <g transform={MY(sign.yF, 100)}>
        <rect x={sign.x0 * 100 + 8} y={-sign.z1 * 100 + 8} width={(sign.x1 - sign.x0) * 100 - 16} height={(sign.z1 - sign.z0) * 100 - 16} rx={6} fill="none" stroke={mixColor("#1C3F36", lightC, lit * 0.55)} strokeWidth={2.5} />
        <text x={(xc - 0.75) * 100} y={-358} textAnchor="middle" fontFamily={JAKARTA} fontWeight={800} fontSize={58} letterSpacing={12} fill="none" stroke={lightC} strokeWidth={12} strokeLinejoin="round" opacity={lit * (0.18 + 0.22 * warm)}>
          PHARMACIE
        </text>
        <text x={(xc - 0.75) * 100} y={-358} textAnchor="middle" fontFamily={JAKARTA} fontWeight={800} fontSize={58} letterSpacing={12} fill={letters}>
          PHARMACIE
        </text>
      </g>
      <NeonCross c={s.cross} on={cross} y1={y1} glowId={`${p}-crossglow`} />
    </g>
  );
}

// ---------------------------------------------------------------- lampadaires, voitures, mobilier

export function LampPost({ x, y, on = 1, h = 4.3 }: { x: number; y: number; on?: number; h?: number }) {
  const gid = `lamp${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [gx, gy0] = iso(x, y, 0.45);
  const [, gyT] = iso(x, y, h);
  const pw = 0.16 * K;
  const [hx, hy] = iso(x, y, h + 0.1);
  return (
    <g>
      <defs>
        <radialGradient id={gid}>
          <stop offset="0%" stopColor={N.lamp} stopOpacity={0.75} />
          <stop offset="30%" stopColor={N.lamp} stopOpacity={0.22} />
          <stop offset="100%" stopColor={N.lamp} stopOpacity={0} />
        </radialGradient>
      </defs>
      <IsoBox x0={x - 0.2} x1={x + 0.2} y0={y - 0.2} y1={y + 0.2} z1={0.45} top="#22332E" front="#18261F" right="#101B17" />
      <rect x={gx - pw / 2} y={gyT} width={pw / 2} height={gy0 - gyT} fill="#1E2E29" />
      <rect x={gx} y={gyT} width={pw / 2} height={gy0 - gyT} fill="#121D1A" />
      <IsoBox x0={x - 0.4} x1={x + 0.4} y0={y - 0.4} y1={y + 0.4} z0={h} z1={h + 0.2} top={mixColor("#2A3A35", "#FFF6D2", on)} front={mixColor("#1D2B27", "#C9B27A", on * 0.8)} right={mixColor("#16221F", "#8F7A4E", on * 0.8)} />
      {on > 0.01 && (
        <g style={{ mixBlendMode: "screen" }}>
          <circle cx={hx} cy={hy} r={K * 3.4} fill={`url(#${gid})`} opacity={on * 0.4} />
          <circle cx={hx} cy={hy} r={K * 1.25} fill={`url(#${gid})`} opacity={on} />
        </g>
      )}
    </g>
  );
}

function Car({ x, y, color }: { x: number; y: number; color: string }) {
  const top = mixColor(color, "#FFFFFF", 0.1);
  const right = mixColor(color, "#000000", 0.35);
  const glass = "#0A1513";
  return (
    <g>
      <g transform={MG(0)}>
        <rect x={x - 2.35} y={y - 1.05} width={4.7} height={2.1} rx={0.6} fill={rgba("#000000", 0.42)} />
      </g>
      <IsoBox x0={x - 2.1} x1={x + 2.1} y0={y - 0.86} y1={y + 0.86} z0={0.3} z1={0.95} top={top} front={color} right={right} />
      <IsoBox x0={x - 1.15} x1={x + 0.95} y0={y - 0.76} y1={y + 0.76} z0={0.95} z1={1.5} top={mixColor(top, "#FFFFFF", 0.06)} front={glass} right={mixColor(glass, "#000000", 0.2)} />
      <g transform={MY(y + 0.76)}>
        <rect x={x - 0.12} y={-1.48} width={0.1} height={0.5} fill={color} />
        <path d={`M${r2(x - 1.0)},${-1.36}L${r2(x - 0.6)},${-1.36}L${r2(x - 0.95)},${-1.05}L${r2(x - 1.12)},${-1.05}Z`} fill={rgba("#FFFFFF", 0.07)} />
      </g>
      <g transform={MY(y + 0.86)}>
        {[x - 1.35, x + 1.35].map((u, i) => (
          <ellipse key={i} cx={u} cy={-0.32} rx={0.34} ry={0.3} fill="#050B0A" />
        ))}
      </g>
      <g transform={MX(x + 2.1)}>
        <rect x={y - 0.7} y={-0.82} width={0.32} height={0.12} fill={rgba("#F6E7A8", 0.35)} />
        <rect x={y + 0.38} y={-0.82} width={0.32} height={0.12} fill={rgba("#F6E7A8", 0.35)} />
      </g>
    </g>
  );
}

// ---------------------------------------------------------------- les passants

/** Position le long d'un chemin (vitesse régulière, départ et arrêt doux). */
function walkAt(path: P2[], t: number, start: number, dur: number) {
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    segs.push(l);
    total += l;
  }
  const raw = dur > 0 ? clamp01((t - start) / dur) : t >= start ? 1 : 0;
  const r = Math.min(0.25, dur > 0 ? 0.35 / dur : 0.25);
  const v = 1 / (1 - r);
  const k = raw < r ? (0.5 * v * raw * raw) / r : raw < 1 - r ? 0.5 * v * r + v * (raw - r) : 1 - (0.5 * v * (1 - raw) * (1 - raw)) / r;
  let s = k * total;
  const dist = s;
  for (let i = 0; i < segs.length; i++) {
    if (s <= segs[i] || i === segs.length - 1) {
      const q = segs[i] > 0 ? clamp01(s / segs[i]) : 1;
      return { x: lerp(path[i][0], path[i + 1][0], q), y: lerp(path[i][1], path[i + 1][1], q), moving: raw > 0 && raw < 1, dist, raw };
    }
    s -= segs[i];
  }
  return { x: path[0][0], y: path[0][1], moving: false, dist: 0, raw };
}
const groundZ = (y: number) => (y < STREET.road[0] || y > STREET.road[1] ? STREET.curb : 0);

function PassantBody({ x, y, color, bob = 0, warm = 0, bag = false, opacity = 1, scale = 1, swing = 0 }: { x: number; y: number; color: string; bob?: number; warm?: number; bag?: boolean; opacity?: number; scale?: number; swing?: number }) {
  const z = groundZ(y);
  const [gx, gy] = iso(x, y, z);
  const rx = 0.34 * K * scale;
  const ry = rx * 0.5;
  const hh = 1.32 * KZ * scale;
  const light = mixColor(color, "#FFFFFF", 0.06);
  const dark = mixColor(color, "#0A1A16", 0.4);
  const cap = mixColor(color, "#FFFFFF", 0.42);
  const split = rx * 0.18;
  const ys = ry * Math.sqrt(Math.max(0, 1 - (split / rx) ** 2));
  const full = `M${-rx},${-hh}L${rx},${-hh}L${rx},0A${rx},${ry} 0 0 1 ${-rx},0Z`;
  const left = `M${-rx},${-hh}L${split},${-hh}L${split},${r2(ys)}A${rx},${ry} 0 0 1 ${-rx},0Z`;
  if (opacity <= 0.005) return null;
  return (
    <g opacity={opacity}>
      <g transform={MG(z)}>
        <ellipse cx={x + 0.16} cy={y + 0.1} rx={0.52 * scale} ry={0.4 * scale} fill={rgba("#000000", 0.4)} />
      </g>
      <g transform={`translate(${r2(gx)} ${r2(gy - bob)})`}>
        <path d={full} fill={dark} />
        <path d={left} fill={light} />
        {warm > 0.01 && <path d={full} fill={PB.glow} opacity={warm * 0.32} />}
        <ellipse cx={0} cy={-hh} rx={rx} ry={ry} fill={cap} />
        {warm > 0.01 && <ellipse cx={0} cy={-hh} rx={rx} ry={ry} fill="#FFFFF0" opacity={warm * 0.35} />}
        {bag && (
          <g transform={`translate(${r2(rx * 0.75)} ${r2(-hh * 0.46)}) rotate(${r2(swing * 8)})`}>
            <rect x={-rx * 0.05} y={0} width={rx * 0.62} height={rx * 0.78} fill="#F4F8F6" />
            <rect x={rx * 0.57} y={0} width={rx * 0.3} height={rx * 0.78} fill="#B9CCC6" />
            <rect x={rx * 0.2} y={rx * 0.22} width={rx * 0.1} height={rx * 0.34} fill={PB.cross} />
            <rect x={rx * 0.08} y={rx * 0.34} width={rx * 0.34} height={rx * 0.1} fill={PB.cross} />
          </g>
        )}
      </g>
    </g>
  );
}

const warmAt = (pbWarm: number, x: number, y: number) => pbWarm * clamp01(1 - Math.hypot(x - PB_LIGHT[0], (y - PB_LIGHT[1]) * 1.4) / 8.5);

export type PassantProps = { t: number; path: P2[]; start: number; dur: number; color: string; seed?: number; bag?: boolean; fadeIn?: boolean; enter?: boolean; opacity?: number; scale?: number };

/** Un passant qui suit un chemin du monde ; à mettre DANS <City>. */
export function Passant({ t, path, start, dur, color, seed = 0, bag = false, fadeIn = false, enter = false, opacity = 1, scale = 1 }: PassantProps) {
  const ctx = useContext(CityCtx);
  const pts = path.length > 1 ? path : [path[0], path[0]];
  const w = walkAt(pts, t, start, dur);
  const phase = w.dist * 1.7 + seed * 0.37;
  const bob = w.moving ? Math.abs(Math.sin(phase * Math.PI)) * 0.08 * KZ * scale : Math.max(0, Math.sin(t * 1.6 + seed)) * 0.012 * KZ;
  let o = opacity;
  if (fadeIn) o *= clamp01((t - start) / 0.3);
  if (enter) o *= 1 - clamp01((t - (start + dur - 0.35)) / 0.35);
  const sc = enter ? scale * (1 - 0.18 * clamp01((t - (start + dur - 0.35)) / 0.35)) : scale;
  return <PassantBody x={w.x} y={w.y} color={color} bob={bob} warm={warmAt(ctx.pbWarm, w.x, w.y)} bag={bag} opacity={o} scale={sc} swing={w.moving ? Math.sin(phase * Math.PI) : 0} />;
}

function queueMembers(count: number, stagger: number, speed: number) {
  return Array.from({ length: Math.min(count, QUEUE_SPOTS.length) }, (_, i) => {
    const spot = QUEUE_SPOTS[i];
    const v = i % 3;
    const path: P2[] =
      v === 1
        ? [
            [0.25, 8.4],
            [0.25, -0.95],
            [spot[0] + 0.5, -1.05],
            spot,
          ]
        : [
            [spot[0] - (v === 0 ? 9 : 13), -1.15 - (i % 2) * 0.3],
            [spot[0] - 0.55, -1.2],
            spot,
          ];
    let len = 0;
    for (let j = 1; j < path.length; j++) len += Math.hypot(path[j][0] - path[j - 1][0], path[j][1] - path[j - 1][1]);
    return { path, start: i * stagger, dur: len / speed, color: PASSANT_COLORS[(i * 2 + Math.floor(hash("qc", i) * 2)) % PASSANT_COLORS.length], seed: i + 1 };
  });
}
const queueSpan = (count: number, stagger: number, speed: number) => Math.max(...queueMembers(count, stagger, speed).map((m) => m.start + m.dur));

function QueueCore({ t, tq, count, stagger, speed }: { t: number; tq: number; count: number; stagger: number; speed: number }) {
  const ctx = useContext(CityCtx);
  const list = queueMembers(count, stagger, speed)
    .filter((m) => tq >= m.start)
    .map((m) => {
      const w = walkAt(m.path, tq, m.start, m.dur);
      const idle = w.raw >= 1;
      const sway = idle ? Math.sin(t * 0.9 + m.seed * 2.1) * 0.05 : 0;
      return { m, w, x: w.x + sway, y: w.y };
    })
    .sort((a, b) => a.x + a.y - (b.x + b.y));
  return (
    <g>
      {list.map(({ m, w, x, y }) => {
        const phase = w.dist * 1.7 + m.seed;
        const bob = w.moving ? Math.abs(Math.sin(phase * Math.PI)) * 0.08 * KZ : Math.max(0, Math.sin(t * 1.7 + m.seed * 1.3)) * 0.015 * KZ;
        return <PassantBody key={m.seed} x={x} y={y} color={m.color} bob={bob} warm={warmAt(ctx.pbWarm, x, y)} opacity={clamp01((tq - m.start) / 0.3)} />;
      })}
    </g>
  );
}

/** La file qui arrive devant PharmaBoost à partir de `at` ; à mettre DANS <City>. */
export function Queue({ t, at, count = 7, stagger = 0.3, speed = 4.2 }: { t: number; at: number; count?: number; stagger?: number; speed?: number }) {
  if (t < at) return null;
  return <QueueCore t={t} tq={t - at} count={count} stagger={stagger} speed={speed} />;
}

// ---------------------------------------------------------------- la ville

export type CityProps = {
  t: number;
  cam?: CityCam;
  lights?: number;
  pbLit?: number;
  coteLit?: number;
  pbCross?: number;
  coteCross?: number;
  coteFlicker?: number;
  queue?: number;
  queueCount?: number;
  lamps?: number;
  windows?: number;
  fog?: number;
  dim?: number;
  sky?: boolean;
  children?: ReactNode;
  front?: ReactNode;
  overlay?: ReactNode;
  style?: CSSProperties;
};

/** Le grésillement d'un néon fatigué : 1 = allumé, chutes irrégulières (déterministe en t). */
function flickerAt(t: number, amount: number) {
  if (amount <= 0) return 1;
  const seg = Math.floor(t * 17);
  const hv = hash("gresil", seg);
  const burst = Math.sin(t * 2.3) + Math.sin(t * 5.1 + 1) > 0.3 ? 1 : 0.35;
  const drop = hv < 0.5 * amount * burst ? (hash("gresil2", seg) < 0.5 ? 0.08 : 0.4) : 1;
  return lerp(1, drop, clamp01(amount * 1.4));
}

export function City({ t, cam = CAMS.both, lights = 1, pbLit = 0, coteLit = 1, pbCross = 1, coteCross = 1, coteFlicker = 0, queue = 0, queueCount = 7, lamps = 1, windows = 1, fog = 1, dim = 0, sky = true, children, front, overlay, style }: CityProps) {
  const p = `c${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const warm = clamp01(pbLit);
  const fl = flickerAt(t, coteFlicker);
  const pbLight = Math.max(clamp01(lights), warm);
  const coteLight = clamp01(lights) * clamp01(coteLit) * fl;
  const pbCrossOn = Math.max(clamp01(lights), warm) * clamp01(pbCross) * (0.93 + 0.07 * Math.sin(t * 3.1));
  const coteCrossOn = clamp01(lights) * clamp01(coteCross) * fl * (coteFlicker > 0 ? 1 : 0.93 + 0.07 * Math.sin(t * 3.1 + 2));
  const gPB = glassStops(pbLight, warm);
  const gCote = glassStops(coteLight, 0);
  const pbLightC = mixColor(LIGHT_COLD, LIGHT_WARM, warm);
  const pbPoolC = mixColor(LIGHT_COLD, mixColor(LIGHT_WARM, PB.citron, 0.55), warm);
  const walkC = mixColor(N.ground, N.top, 0.38);
  const curbC = mixColor(N.left, "#4E7268", 0.22);
  const S = STREET;
  // marquages au sol
  const dashes: string[] = [];
  for (let x = S.x0; x < S.x1; x += 4) if (x + 2 < S.crossing[0] - 0.6 || x > S.crossing[1] + 0.6) dashes.push(rectD(x, 3.43, 2, 0.14));
  const edges = [rectD(S.x0, 0.3, S.crossing[0] - 0.4 - S.x0, 0.07), rectD(S.crossing[1] + 0.4, 0.3, S.x1 - S.crossing[1] - 0.4, 0.07), rectD(S.x0, 6.63, S.crossing[0] - 0.4 - S.x0, 0.07), rectD(S.crossing[1] + 0.4, 6.63, S.x1 - S.crossing[1] - 0.4, 0.07)].join("");
  const zebra = Array.from({ length: 7 }, (_, i) => rectD(S.crossing[0], 0.42 + i * 0.95, S.crossing[1] - S.crossing[0], 0.5)).join("");
  const joints: string[] = [];
  for (let x = S.x0; x < S.x1; x += 1.6) {
    joints.push(rectD(x, -3, 0.035, 3));
    joints.push(rectD(x + 0.8, 7, 0.035, 2.6));
  }
  joints.push(rectD(S.x0, -1.5, S.x1 - S.x0, 0.03));
  const tq = queue * queueSpan(queueCount, 0.3, 4.2);
  const lampOn = clamp01(lamps);
  const bloomPB = pbLight * (0.25 + 0.75 * warm);
  return (
    <CityCtx.Provider value={{ pbWarm: warm, t }}>
      <AbsoluteFill style={{ background: sky ? N.sky : undefined, ...style }}>
        <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: "absolute", left: 0, top: 0, overflow: "hidden" }}>
          <defs>
            <linearGradient id={`${p}-sky`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#030A08" />
              <stop offset="45%" stopColor={N.sky} />
              <stop offset="100%" stopColor="#040C0A" />
            </linearGradient>
            <radialGradient id={`${p}-skyglow`}>
              <stop offset="0%" stopColor={PB.teal} stopOpacity={0.16} />
              <stop offset="100%" stopColor={PB.teal} stopOpacity={0} />
            </radialGradient>
            <linearGradient id={`${p}-shade`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.025} />
              <stop offset="55%" stopColor="#000000" stopOpacity={0} />
              <stop offset="100%" stopColor="#000000" stopOpacity={0.3} />
            </linearGradient>
            <linearGradient id={`${p}-ao`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#000000" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#000000" stopOpacity={0} />
            </linearGradient>
            {(["pb", "cote"] as const).map((side) => {
              const g = side === "pb" ? gPB : gCote;
              return (
                <linearGradient key={side} id={`${p}-glass-${side}`} x1="0" y1="0" x2="0.35" y2="1">
                  <stop offset="0%" stopColor={g[0]} />
                  <stop offset="50%" stopColor={g[1]} />
                  <stop offset="100%" stopColor={g[2]} />
                </linearGradient>
              );
            })}
            {(["pb", "cote"] as const).map((side) => {
              const c = side === "pb" ? pbLightC : LIGHT_COLD;
              return (
                <radialGradient key={side} id={`${p}-spill-${side}`}>
                  <stop offset="0%" stopColor={c} stopOpacity={0.55} />
                  <stop offset="55%" stopColor={c} stopOpacity={0.14} />
                  <stop offset="100%" stopColor={c} stopOpacity={0} />
                </radialGradient>
              );
            })}
            {(["pb", "cote"] as const).map((side) => {
              const c = side === "pb" ? pbPoolC : LIGHT_COLD;
              return (
                <radialGradient key={side} id={`${p}-pool-${side}`}>
                  <stop offset="0%" stopColor={c} stopOpacity={0.7} />
                  <stop offset="35%" stopColor={c} stopOpacity={0.32} />
                  <stop offset="70%" stopColor={c} stopOpacity={0.08} />
                  <stop offset="100%" stopColor={c} stopOpacity={0} />
                </radialGradient>
              );
            })}
            <radialGradient id={`${p}-lamppool`}>
              <stop offset="0%" stopColor={N.lamp} stopOpacity={0.3} />
              <stop offset="55%" stopColor={N.lamp} stopOpacity={0.09} />
              <stop offset="100%" stopColor={N.lamp} stopOpacity={0} />
            </radialGradient>
            <radialGradient id={`${p}-crossglow`}>
              <stop offset="0%" stopColor={PB.cross} stopOpacity={0.75} />
              <stop offset="35%" stopColor={PB.cross} stopOpacity={0.22} />
              <stop offset="100%" stopColor={PB.cross} stopOpacity={0} />
            </radialGradient>
            <radialGradient id={`${p}-bloom`}>
              <stop offset="0%" stopColor={pbLightC} stopOpacity={0.4} />
              <stop offset="45%" stopColor={pbLightC} stopOpacity={0.12} />
              <stop offset="100%" stopColor={pbLightC} stopOpacity={0} />
            </radialGradient>
            <radialGradient id={`${p}-bloomc`}>
              <stop offset="0%" stopColor={LIGHT_COLD} stopOpacity={0.22} />
              <stop offset="100%" stopColor={LIGHT_COLD} stopOpacity={0} />
            </radialGradient>
            <radialGradient id={`${p}-fog`} cx={FOCUS[0]} cy={FOCUS[1]} r={1150} gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={N.sky} stopOpacity={0} />
              <stop offset="48%" stopColor={N.sky} stopOpacity={0} />
              <stop offset="80%" stopColor={N.sky} stopOpacity={0.55} />
              <stop offset="100%" stopColor={N.sky} stopOpacity={0.92} />
            </radialGradient>
            <linearGradient id={`${p}-fogb`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={N.sky} stopOpacity={0} />
              <stop offset="100%" stopColor={N.sky} stopOpacity={0.8} />
            </linearGradient>
          </defs>
          {sky && (
            <>
              <rect x={0} y={0} width={1080} height={1920} fill={`url(#${p}-sky)`} />
              <ellipse cx={540} cy={640} rx={760} ry={420} fill={`url(#${p}-skyglow)`} />
            </>
          )}
          <g transform={camTransform(cam)}>
            {/* le sol, la chaussée, les trottoirs */}
            <g transform={MG(0)}>
              <rect x={S.x0} y={-44} width={S.x1 - S.x0} height={88} fill={N.ground} />
              <rect x={S.x0} y={S.road[0]} width={S.x1 - S.x0} height={S.road[1] - S.road[0]} fill={N.road} />
              <path d={edges} fill={rgba("#9FC2B6", 0.1)} />
              <path d={dashes.join("")} fill={N.roadLine} />
              <path d={zebra} fill={rgba("#CFE3DC", 0.24)} />
            </g>
            <g transform={MY(0)}>
              <rect x={S.x0} y={-S.curb} width={S.x1 - S.x0} height={S.curb} fill={curbC} />
            </g>
            <g transform={MG(S.curb)}>
              <rect x={S.x0} y={S.farWalk[0]} width={S.x1 - S.x0} height={S.farWalk[1] - S.farWalk[0]} fill={walkC} />
              <rect x={S.x0} y={S.nearWalk[0]} width={S.x1 - S.x0} height={S.nearWalk[1] - S.nearWalk[0]} fill={walkC} />
              <path d={joints.join("")} fill={rgba("#000000", 0.16)} />
              <rect x={S.x0} y={-3} width={S.x1 - S.x0} height={0.75} fill={`url(#${p}-ao)`} />
              <rect x={S.x0} y={7} width={S.x1 - S.x0} height={0.12} fill={rgba("#9FC2B6", 0.07)} />
            </g>
            {/* les flaques de lumière */}
            <g transform={MG(S.curb * 0.5)}>
              {LAMPS.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={3.8} fill={`url(#${p}-lamppool)`} opacity={lampOn} />
              ))}
              <ellipse cx={COTE_SHOP.xc} cy={-2.4} rx={6.2} ry={3.6} fill={`url(#${p}-pool-cote)`} opacity={coteLight * 0.55} />
              <ellipse cx={PB_SHOP.xc} cy={-2.2} rx={6.4 + 4 * warm} ry={3.6 + 3.2 * warm} fill={`url(#${p}-pool-pb)`} opacity={pbLight * (0.55 + 0.45 * warm)} />
              <ellipse cx={PB_SHOP.xc} cy={-2.6} rx={4.8} ry={1.8} fill={`url(#${p}-pool-pb)`} opacity={warm * 0.85} />
            </g>
            {/* les immeubles : du fond vers l'avant */}
            {[...BACK3, ...BACK2].map((b) => (
              <Building key={b.id} b={b} t={t} wk={windows} shadeId={`${p}-shade`} />
            ))}
            {FAR.filter((b) => b.x1 <= PB_SHOP.x0).map((b) => (
              <Building key={b.id} b={b} t={t} wk={windows} shadeId={`${p}-shade`} />
            ))}
            <Pharmacy s={PB_SHOP} side="pb" lit={pbLight} warm={warm} cross={pbCrossOn} t={t} p={p} />
            <Pharmacy s={COTE_SHOP} side="cote" lit={coteLight} warm={0} cross={coteCrossOn} t={t} p={p} />
            {FAR.filter((b) => b.x0 >= COTE_SHOP.x1).map((b) => (
              <Building key={b.id} b={b} t={t} wk={windows} shadeId={`${p}-shade`} />
            ))}
            {/* la rue : poubelle, file, enfants, lampadaires, voitures */}
            <IsoBox x0={11.35} x1={11.9} y0={-2.85} y1={-2.3} z0={S.curb} z1={S.curb + 0.85} top="#2A3B36" front="#1E2C28" right="#141F1C" />
            {queue > 0 && <QueueCore t={t} tq={tq} count={queueCount} stagger={0.3} speed={4.2} />}
            {children}
            {FAR_LAMPS.map(([x, y], i) => (
              <LampPost key={i} x={x} y={y} on={lampOn} />
            ))}
            {CARS.map((c, i) => (
              <Car key={i} {...c} />
            ))}
            {front}
            {NEAR_LAMPS.map(([x, y], i) => (
              <LampPost key={i} x={x} y={y} on={lampOn} />
            ))}
            {[...NEAR, ...NEAR2].map((b) => (
              <Building key={b.id} b={b} t={t} wk={windows} shadeId={`${p}-shade`} />
            ))}
            {/* le halo des vitrines dans l'air */}
            <g style={{ mixBlendMode: "screen" }}>
              {(() => {
                const [bx, by] = iso(PB_SHOP.xc, -2.2, 1.6);
                const [cx2, cy2] = iso(COTE_SHOP.xc, -2.2, 1.6);
                return (
                  <>
                    <circle cx={bx} cy={by} r={K * 9} fill={`url(#${p}-bloom)`} opacity={bloomPB} />
                    <circle cx={cx2} cy={cy2} r={K * 7} fill={`url(#${p}-bloomc)`} opacity={coteLight * 0.6} />
                  </>
                );
              })()}
            </g>
            {overlay}
          </g>
          {fog > 0 && (
            <g opacity={clamp01(fog)}>
              <rect x={0} y={0} width={1080} height={1920} fill={`url(#${p}-fog)`} />
              <rect x={0} y={1420} width={1080} height={500} fill={`url(#${p}-fogb)`} />
            </g>
          )}
          {dim > 0 && <rect x={0} y={0} width={1080} height={1920} fill={N.sky} opacity={clamp01(dim)} />}
        </svg>
      </AbsoluteFill>
    </CityCtx.Provider>
  );
}

// ---------------------------------------------------------------- les ancres

export type CityAnchors = Record<"pbDoor" | "pbSign" | "pbAbove" | "pbWindow" | "pbCross" | "coteDoor" | "coteSign" | "coteAbove" | "coteWindow" | "coteCross" | "street", P2>;

/** Les points utiles À L'ÉCRAN (px) pour ce cadrage : porte, enseigne, au-dessus du toit, vitrine, croix, rue. */
export function anchors(cam: CityCam): CityAnchors {
  const A = (s: Shop) => ({
    door: toScreen(cam, s.xc, -2.3, STREET.curb),
    sign: toScreen(cam, s.xc - 0.75, s.y1 + 0.42, 3.76),
    above: toScreen(cam, s.xc, s.y1, ABOVE_Z),
    window: toScreen(cam, ...windowOf(s)),
    cross: toScreen(cam, s.cross[0], s.cross[1], s.cross[2]),
  });
  const a = A(PB_SHOP);
  const c = A(COTE_SHOP);
  return { pbDoor: a.door, pbSign: a.sign, pbAbove: a.above, pbWindow: a.window, pbCross: a.cross, coteDoor: c.door, coteSign: c.sign, coteAbove: c.above, coteWindow: c.window, coteCross: c.cross, street: toScreen(cam, 0, 3.5, 0) };
}

// ---------------------------------------------------------------- l'étiquette flottante (HTML, px écran)

type TagIcon = "box" | "rx" | "cross" | "heart" | "star" | "bag" | "check";
function Icon({ name, color, size }: { name: TagIcon; color: string; size: number }) {
  const g = PB.cross;
  const body: Record<TagIcon, ReactNode> = {
    box: (
      <>
        <path d="M6 14 L20 7 L34 14 L20 21 Z" fill="#FFFFFF" />
        <path d="M6 14 L20 21 L20 35 L6 28 Z" fill="#DCE8E4" />
        <path d="M34 14 L20 21 L20 35 L34 28 Z" fill="#AFC6BF" />
        <path d="M11 22.2 L15 24.2 M13 21.2 L13 25.2" stroke={g} strokeWidth={2.4} strokeLinecap="round" />
      </>
    ),
    rx: (
      <>
        <path d="M9 4 H26 L32 10 V36 H9 Z" fill="#FFFFFF" />
        <path d="M26 4 V10 H32" fill="#CFE0DA" />
        <path d="M13 17 H28 M13 22 H28 M13 27 H22" stroke="#9DB5AE" strokeWidth={2.2} strokeLinecap="round" />
        <path d="M17 9.5 V15.5 M14 12.5 H20" stroke={g} strokeWidth={2.6} strokeLinecap="round" />
      </>
    ),
    cross: <path d="M15 5 H25 V15 H35 V25 H25 V35 H15 V25 H5 V15 H15 Z" fill={g} />,
    heart: <path d="M20 34 C8 25 4 19 4 13.5 C4 8.5 8 5 12.5 5 C15.6 5 18.3 6.8 20 9.4 C21.7 6.8 24.4 5 27.5 5 C32 5 36 8.5 36 13.5 C36 19 32 25 20 34 Z" fill={color} />,
    star: <path d="M20 4 L24.7 14.6 L36 15.6 L27.4 23.2 L30 34.6 L20 28.6 L10 34.6 L12.6 23.2 L4 15.6 L15.3 14.6 Z" fill={color} />,
    bag: (
      <>
        <path d="M14 12 C14 6 26 6 26 12" fill="none" stroke="#DCE8E4" strokeWidth={2.4} />
        <path d="M7 12 H33 L31 36 H9 Z" fill="#FFFFFF" />
        <path d="M20 18 V30 M14 24 H26" stroke={g} strokeWidth={3.2} strokeLinecap="round" />
      </>
    ),
    check: (
      <>
        <circle cx={20} cy={20} r={16} fill={g} />
        <path d="M12.5 20.5 L18 26 L28 14.5" fill="none" stroke="#FFFFFF" strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ flex: "none", display: "block" }}>
      {body[name]}
    </svg>
  );
}

export type FloatTagProps = { t: number; at: number; x: number; y: number; text: string; sub?: string; icon?: TagIcon | ReactNode; out?: number; tone?: "dark" | "citron" | "ghost"; stem?: number; scale?: number };

/** Étiquette flottante au-dessus d'une façade (style « Coupe 25 € » de la référence), ancrée par son bas-milieu. */
export function FloatTag({ t, at, x, y, text, sub, icon, out, tone = "dark", stem = 0, scale = 1 }: FloatTagProps) {
  if (t < at) return null;
  const k = prog(t, at, 0.42, POP);
  const o = out !== undefined ? 1 - prog(t, out, 0.25, EXIT) : 1;
  if (o <= 0) return null;
  const bob = Math.sin((t - at) * 2.1 + x * 0.01) * 5;
  const look: Record<"dark" | "citron" | "ghost", CSSProperties> = {
    dark: { background: "rgba(8,24,21,0.92)", border: `2px solid ${rgba(PB.citron, 0.5)}`, color: "#FFFFFF", boxShadow: `0 18px 44px rgba(0,0,0,.55), 0 0 26px ${rgba(PB.citron, 0.12)}` },
    citron: { background: PB.citron, border: `2px solid ${rgba("#FFFFFF", 0.6)}`, color: PB.ink, boxShadow: `0 16px 40px rgba(0,0,0,.45), 0 0 34px ${rgba(PB.citron, 0.45)}` },
    ghost: { background: "rgba(150,170,175,0.16)", border: `2px solid ${rgba("#FFFFFF", 0.28)}`, color: rgba("#FFFFFF", 0.82), boxShadow: "0 14px 36px rgba(0,0,0,.45)" },
  };
  const subColor = tone === "citron" ? PB.teal : tone === "ghost" ? rgba("#FFFFFF", 0.6) : PB.citron;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 0, height: 0, pointerEvents: "none", opacity: Math.min(1, k * 1.6) * o }}>
      <div style={{ position: "absolute", left: 0, bottom: 0, transform: `translate(-50%, ${r2((1 - k) * 28 + bob)}px) scale(${r2((0.72 + 0.28 * k) * scale * (0.9 + 0.1 * o))})`, transformOrigin: "50% 100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: sub ? "12px 22px 12px 16px" : "12px 22px", borderRadius: 18, whiteSpace: "nowrap", ...look[tone] }}>
          {icon !== undefined && (typeof icon === "string" ? <Icon name={icon as TagIcon} color={tone === "citron" ? PB.teal : PB.citron} size={42} /> : icon)}
          <div style={{ display: "flex", flexDirection: "column", alignItems: icon !== undefined ? "flex-start" : "center", gap: 3 }}>
            <span style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 31, letterSpacing: "-0.02em", lineHeight: 1.05 }}>{text}</span>
            {sub && <span style={{ fontFamily: JAKARTA, fontWeight: 700, fontSize: 23, letterSpacing: "-0.01em", lineHeight: 1.1, color: subColor }}>{sub}</span>}
          </div>
        </div>
        {stem > 0 && (
          <>
            <div style={{ width: 2, height: stem, background: `linear-gradient(${rgba(PB.citron, 0.6)}, ${rgba(PB.citron, 0)})` }} />
          </>
        )}
      </div>
    </div>
  );
}
