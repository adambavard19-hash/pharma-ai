import type { CSSProperties } from "react";
import { AbsoluteFill } from "remotion";
import {
  A1,
  JAKARTA,
  rgba,
  label,
  SET,
  Pharmacy,
  Pharmacienne,
  Patient,
  Ordonnance,
  Bubble,
  FranceMap,
  FRANCE_DOTS,
  FRANCE_PATH,
  coldGrade,
  Camera,
  Dust,
  prog,
  keys,
  ressort,
  clamp01,
  lerp,
  wobble,
  SNAP,
  EXIT,
  IN_OUT,
  LINEAR,
  hash,
  cue,
  every,
  type Cue,
} from "../kit";

/* ==========================================================================
 * S3 · CHAQUE JOUR, PARTOUT (12,6 → 17,2) — N2 « Cette scène se répète chaque jour, dans toute la France. »
 *
 *  12,6 → 13,5   la vignette du comptoir (le vrai décor, acte 1) au centre, relais de S2 qui s'y réduit ; « scène »
 *                (13,04) : la bulle « Non merci. » du patient pope dans la vignette.
 *  « répète »    (13,56) LA DÉMULTIPLICATION en trois coups : 1 → 3 × 3 → 7 × 7 → ≈ 300 vignettes (13,56 · 13,80 · 14,05),
 *                chaque copie sort de sa voisine plus proche du centre, chaque patient a sa veste, chaque bulle « Non
 *                merci. » pope (rafale de pops + la foule qui dit non merci).
 *  « chaque jour » (14,0 → 15,15) un éphéméride en haut à droite : les jours s'arrachent de plus en plus vite (lundi 19
 *                octobre → novembre), une ombre de nuit balaie la mosaïque à chaque jour.
 *  « toute »     (15,0 → 15,5) chaque vignette rougit, se réduit en point et file à sa place : la carte de France se
 *                dessine en points ROUGES, allumés un par un à l'arrivée ; « France » (15,54) la carte est complète,
 *                puis elle pulse depuis Paris et de petits « Non merci. » s'y posent.
 *  16,48         la musique s'arrête net : la vieille télé s'éteint (trait, point, noir). Noir jusqu'à 16,7 (S4).
 *
 *  Tout est fonction de `t` (temps du film). La mosaïque = UNE <svg> : deux dessins de vignette en <defs> (détaillé /
 *  léger selon la taille), une <use> par vignette, une <use> par bulle (pas de composants complets à la chaîne).
 * ======================================================================== */

/* ---- BANDE:DEBUT ---- (ce bloc est recopié tel quel dans s04-rembobinons : la bande rembobine CETTE image) */

/* ------------------------------------------------------------------ le temps */

const W = { scene: 13.038, repete: 13.561, b2: 13.8, b3: 14.05, chaque: 14.002, jour: 14.327, toute: 15.024, france: 15.535 };
/** La télé s'éteint (la musique s'arrête net à 16,5). */
const OFF = 16.48;
const END = 16.7;

/* ------------------------------------------------------------------ la mosaïque */

/** La vignette de départ (le relais de S2 s'y pose) : centre et largeur à 13,1. */
const VIG = { x: 960, y: 540, w: 640 };
/** Le pas de la grille finale : 17 × 17 vignettes couvrent le cadre. */
const PX = 1920 / 17;
const PY = 1080 / 17;
const CW = PX * 0.9;
const CH = CW * 0.5625;
const RMAX = 9;
const Z0 = VIG.w / CW;
const Z2 = 450 / CW;
const Z3 = 236 / CW;

const zoomAt = (t: number) =>
  keys(t, [
    [13.1, Z0],
    [13.53, Z0 * 1.035, LINEAR],
    [W.b2, Z2, SNAP],
    [W.b3, Z3, SNAP],
    [14.42, 1, SNAP],
    [15.5, 0.955, LINEAR],
  ]);
const originY = (_t: number) => VIG.y;

/** La carte : centre et taille (boîte 1000 × 1000 de FRANCE_PATH). */
const MAP = { x: 960, y: 468, s: 860 };
const dotPos = (i: number) => ({ x: MAP.x - MAP.s / 2 + (FRANCE_DOTS[i].x * MAP.s) / 1000, y: MAP.y - MAP.s / 2 + (FRANCE_DOTS[i].y * MAP.s) / 1000 });
/** Le diamètre d'un point allumé de la carte (FranceMap : r0 6,5 × 1,25). */
const DOT_D = (2 * 6.5 * 1.25 * MAP.s) / 1000;

const JACKETS = ["#2C4A78", "#7A2E3A", "#4D5B2E", "#5A5F66", "#8A6A2A", "#2E5E5A", "#6B3F6E", "#3E3E46", "#9A4A2A", "#355E8A"].map((c) => coldGrade(c));
const HAIRS = ["#2A201C", "#6B4A2E", "#B8A27A", "#151515", "#8E8E8E", "#4A2A1E"].map((c) => coldGrade(c));

type Cell = { i: number; j: number; ring: number; appear: number; pop: number; hide: number; jacket: string; hair: string; dot: number; ms: number; md: number; bend: number };

const CELLS: Cell[] = (() => {
  const out: Cell[] = [];
  for (let j = -RMAX; j <= RMAX; j++)
    for (let i = -RMAX; i <= RMAX; i++) {
      const ring = Math.max(Math.abs(i), Math.abs(j));
      const n = out.length;
      const h = hash("s3cell", n);
      const dist = Math.hypot(i, j * 0.9);
      let appear = 0;
      if (ring === 1) appear = W.repete + 0.012 * ((Math.atan2(j, i) + Math.PI) / (Math.PI / 4));
      else if (ring <= 3) appear = W.b2 + (dist - 1.5) * 0.035 + h * 0.02;
      else if (ring > 3) appear = W.b3 + (dist - 3.5) * 0.024 + h * 0.03;
      const pop = ring === 0 ? W.scene - 0.02 : appear + 0.09 + hash("s3pop", n) * 0.14;
      const hide = ring > 0 && hash("s3hide", n) < 0.55 ? 14.5 + hash("s3hideT", n) * 0.45 : 99;
      out.push({ i, j, ring, appear, pop, hide, jacket: ring === 0 ? JACKETS[0] : JACKETS[Math.floor(hash("s3jk", n) * JACKETS.length)], hair: ring === 0 ? HAIRS[0] : HAIRS[Math.floor(hash("s3hr", n) * HAIRS.length)], dot: -1, ms: 0, md: 0, bend: (hash("s3bend", n) - 0.5) * 120 });
    }
  // Les vignettes visibles à la fin se rétractent en points : chaque point de la carte prend la vignette la plus proche
  // (repères normalisés : le cadre et la France ramenés au même carré), les vignettes restantes rejoignent le point le
  // plus proche. La forme se transforme sans croisements violents.
  const vis = out.filter((c) => Math.abs(c.i) <= 8 && Math.abs(c.j) <= 8);
  const cn = vis.map((c) => ({ x: c.i / 8.5, y: c.j / 8.5 }));
  const dn = FRANCE_DOTS.map((p) => ({ x: (p.x - 500) / 465, y: (p.y - 500) / 455 }));
  const taken = new Array(vis.length).fill(false);
  const dotOrder = FRANCE_DOTS.map((_, i) => i).sort((a, b) => Math.hypot(dn[b].x, dn[b].y) - Math.hypot(dn[a].x, dn[a].y));
  for (const d of dotOrder) {
    let best = -1;
    let bd = 1e9;
    for (let k = 0; k < vis.length; k++) {
      if (taken[k]) continue;
      const e = (cn[k].x - dn[d].x) ** 2 + (cn[k].y - dn[d].y) ** 2;
      if (e < bd) {
        bd = e;
        best = k;
      }
    }
    if (best >= 0) {
      taken[best] = true;
      vis[best].dot = d;
    }
  }
  for (let k = 0; k < vis.length; k++) {
    if (vis[k].dot >= 0) continue;
    let best = 0;
    let bd = 1e9;
    for (let d = 0; d < dn.length; d++) {
      const e = (cn[k].x - dn[d].x) ** 2 + (cn[k].y - dn[d].y) ** 2;
      if (e < bd) {
        bd = e;
        best = d;
      }
    }
    vis[k].dot = best;
  }
  for (const c of vis) {
    const rho = Math.min(1, Math.hypot(c.i, c.j) / 11);
    const n = out.indexOf(c);
    c.ms = 14.96 + hash("s3ms", n) * 0.06;
    c.md = 0.4 + 0.08 * rho;
  }
  // Ordre de dessin : les couronnes extérieures d'abord (les copies sortent DE SOUS leur voisine).
  return out.sort((a, b) => b.ring - a.ring);
})();

/** L'instant où chaque point de la carte reçoit sa première vignette. */
const DOT_LAND: number[] = (() => {
  const land = FRANCE_DOTS.map(() => 99);
  for (const c of CELLS) if (c.dot >= 0) land[c.dot] = Math.min(land[c.dot], c.ms + c.md);
  return land.map((v) => (v > 90 ? 15.5 : v));
})();

/* ------------------------------------------------------------------ les dessins de vignette (une seule fois, en <defs>) */

/** Les boîtes des étagères en deux chemins (une seule forme par couleur). */
const SHELF_BOXES = (() => {
  const a: string[] = [];
  const b: string[] = [];
  [196, 326, 456].forEach((floor, r) => {
    let x = 40;
    let k = 0;
    while (x < 1240) {
      const w = 40 + hash("s3bw", r * 100 + k) * 52;
      const h = 56 + hash("s3bh", r * 100 + k) * 52;
      const d = `M${x.toFixed(0)},${floor}h${w.toFixed(0)}v${(-h).toFixed(0)}h${(-w).toFixed(0)}Z`;
      (hash("s3bc", r * 100 + k) < 0.5 ? a : b).push(d);
      x += w + 6 + hash("s3bg", r * 100 + k) * 10;
      k++;
    }
  });
  return { a: a.join(""), b: b.join("") };
})();

const C = {
  wallTop: "#222B30",
  wall: "#34404A",
  shelf: "#3A4449",
  boxA: "#5A6970",
  boxB: coldGrade("#6F8FA0"),
  frame: "#161C1F",
  glass: "#2C3D48",
  crossBase: "#24453A",
  crossLed: "#7DB596",
  floor: "#252E33",
  top: "#64727A",
  lip: "#62707A",
  front: "#2A343A",
  frontLine: "#344048",
  screen: "#121719",
  screenOn: "#5D6C72",
  coat: coldGrade("#FFFFFF", 0.95),
  coatSh: coldGrade("#DCE6E2", 0.9),
  collar: coldGrade("#247061"),
  skinF: coldGrade("#EEC09E", 0.95),
  skinM: coldGrade("#D49B75", 0.95),
  hairF: coldGrade("#3A2722"),
  trousers: coldGrade("#3A3F4A"),
  scarf: coldGrade("#7DB394"),
  shoe: coldGrade("#F4F2EE"),
  bag: coldGrade("#FFFFFF", 0.92),
  bagCross: coldGrade("#16B177"),
  eye: "#1A1D1F",
  paper: coldGrade("#FFFEFA", 0.95),
  bubble: "#E3E9EB",
};

function CellDefs({ id }: { id: string }) {
  const patient = (
    <g>
      {/* le sac, à la main droite */}
      <path d="M1418,690 C1418,660 1452,660 1452,690" fill="none" stroke={C.coatSh} strokeWidth={6} />
      <rect x={1400} y={688} width={72} height={92} rx={6} fill={C.bag} />
      <rect x={1430} y={716} width={12} height={34} rx={2} fill={C.bagCross} />
      <rect x={1419} y={727} width={34} height={12} rx={2} fill={C.bagCross} />
      {/* les jambes, les chaussures */}
      <rect x={1288} y={680} width={44} height={306} rx={14} fill={C.trousers} />
      <rect x={1340} y={680} width={44} height={306} rx={14} fill={C.trousers} opacity={0.85} />
      <rect x={1270} y={974} width={66} height={30} rx={12} fill={C.shoe} />
      <rect x={1328} y={974} width={66} height={30} rx={12} fill={C.shoe} />
      {/* la veste (couleur : currentColor de la <use>) */}
      <path d="M1262,716 C1254,580 1258,470 1292,420 L1384,420 C1416,470 1424,580 1414,716 Z" fill="currentColor" />
      <path d="M1262,716 C1254,580 1258,470 1292,420 L1306,420 C1286,500 1284,600 1290,716 Z" fill="#000000" opacity={0.18} />
      <path d="M1268,450 C1240,520 1236,600 1250,680 L1278,680 C1272,600 1276,520 1294,460 Z" fill="currentColor" />
      <path d="M1268,450 C1240,520 1236,600 1250,680 L1278,680 C1272,600 1276,520 1294,460 Z" fill="#000000" opacity={0.28} />
      <ellipse cx={1262} cy={690} rx={16} ry={18} fill={C.skinM} />
      {/* l'écharpe */}
      <path d="M1296,404 C1316,428 1360,430 1380,404 L1384,436 C1360,452 1316,452 1292,436 Z" fill={C.scarf} />
      <rect x={1352} y={436} width={22} height={86} rx={8} fill={C.scarf} />
      {/* la tête (tournée vers la pharmacienne) */}
      <rect x={1318} y={372} width={32} height={40} rx={10} fill={C.skinM} />
      <ellipse cx={1334} cy={337} rx={47} ry={55} fill={C.skinM} />
      <path d="M1288,330 C1282,286 1310,268 1342,270 C1370,272 1386,294 1382,326 C1366,306 1330,302 1300,316 Z" />
      <ellipse cx={1312} cy={334} rx={5} ry={6.5} fill={C.eye} />
      <ellipse cx={1290} cy={336} rx={4.2} ry={6} fill={C.eye} />
      <path d="M1296,370 Q1306,366 1316,370" fill="none" stroke={C.eye} strokeWidth={3.5} strokeLinecap="round" />
    </g>
  );
  const pharmacienne = (
    <g>
      <circle cx={716} cy={236} r={34} fill={C.hairF} />
      <rect x={758} y={300} width={38} height={60} rx={10} fill={C.skinF} />
      <path d="M664,560 C662,452 688,376 744,356 L812,356 C866,376 892,452 888,560 Z" fill={C.coat} />
      <path d="M664,560 C662,452 688,376 744,356 L752,356 C716,420 704,480 706,560 Z" fill={C.coatSh} />
      <path d="M752,356 L778,420 L804,356 Z" fill={C.collar} />
      <path d="M744,358 L776,450 M812,358 L782,450" stroke={C.coatSh} strokeWidth={5} />
      <rect x={826} y={420} width={30} height={8} rx={3} fill="#0B6B80" opacity={0.7} />
      <ellipse cx={778} cy={268} rx={51} ry={59} fill={C.skinF} />
      <path d="M726,272 C716,214 752,196 790,200 C824,204 838,226 834,252 C810,236 776,232 750,250 C742,262 738,272 734,282 Z" fill={C.hairF} />
      <ellipse cx={792} cy={268} rx={5.2} ry={4} fill={C.eye} />
      <ellipse cx={818} cy={266} rx={4.4} ry={3.6} fill={C.eye} />
      <path d="M798,300 Q808,298 818,301" fill="none" stroke={C.eye} strokeWidth={3} strokeLinecap="round" />
    </g>
  );
  const room = (lo: boolean) => (
    <g>
      <rect width={1920} height={1080} fill={`url(#${id}wall)`} />
      <rect width={1920} height={64} fill={C.frame} />
      <rect x={556} y={42} width={808} height={8} rx={4} fill={A1.pale} opacity={0.75} />
      {!lo && <rect x={540} y={34} width={840} height={32} rx={14} fill={A1.neon} opacity={0.12} />}
      {lo ? (
        <>
          <rect x={40} y={110} width={1210} height={86} fill={C.boxA} />
          <rect x={40} y={240} width={1210} height={86} fill={C.boxB} opacity={0.75} />
          <rect x={40} y={370} width={1210} height={86} fill={C.boxA} />
        </>
      ) : (
        <>
          <path d={SHELF_BOXES.a} fill={C.boxA} />
          <path d={SHELF_BOXES.b} fill={C.boxB} opacity={0.75} />
        </>
      )}
      <rect x={30} y={196} width={1230} height={12} fill={C.shelf} />
      <rect x={30} y={326} width={1230} height={12} fill={C.shelf} />
      <rect x={30} y={456} width={1230} height={12} fill={C.shelf} />
      {/* la vitrine et sa croix terne */}
      <rect x={1296} y={150} width={208} height={585} fill={C.frame} />
      <rect x={1308} y={162} width={184} height={561} fill={C.glass} />
      {!lo && <circle cx={1400} cy={292} r={120} fill={A1.cross} opacity={0.14} />}
      <rect x={1379} y={233} width={42} height={118} rx={7} fill={C.crossBase} />
      <rect x={1341} y={271} width={118} height={42} rx={7} fill={C.crossBase} />
      <rect x={1385} y={239} width={30} height={106} rx={5} fill={C.crossLed} opacity={0.55} />
      <rect x={1347} y={277} width={106} height={30} rx={5} fill={C.crossLed} opacity={0.55} />
      {/* la porte */}
      <rect x={1535} y={175} width={250} height={560} fill={C.frame} />
      <rect x={1547} y={187} width={226} height={548} fill={C.glass} />
      {!lo && <rect x={1565} y={405} width={10} height={170} rx={5} fill={C.lip} />}
      {/* le sol */}
      <rect y={735} width={1920} height={345} fill={C.floor} />
      <rect y={735} width={1920} height={6} fill="#000000" opacity={0.35} />
    </g>
  );
  const counter = (lo: boolean) => (
    <g>
      <rect x={140} y={600} width={1070} height={368} fill={C.front} />
      {!lo && <path d={Array.from({ length: 22 }, (_, k) => `M${170 + k * 48},630v318`).join("")} stroke={C.frontLine} strokeWidth={4} />}
      <path d="M176,528 L1180,528 L1210,590 L140,590 Z" fill={C.top} />
      <rect x={140} y={588} width={1070} height={14} rx={3} fill={C.lip} />
      {/* l'écran gris du vieux logiciel */}
      <rect x={410} y={500} width={44} height={30} fill={C.screen} />
      <rect x={282} y={306} width={300} height={190} rx={10} fill={C.screen} />
      <rect x={294} y={318} width={276} height={166} rx={4} fill={C.screenOn} />
      {!lo && <path d="M310,346h180M310,374h236M310,402h150M310,430h210M310,458h120" stroke="#4A585E" strokeWidth={10} />}
      {/* l'ordonnance posée */}
      <path d="M1040,556 L1150,546 L1166,574 L1052,584 Z" fill={C.paper} />
    </g>
  );
  return (
    <defs>
      <linearGradient id={`${id}wall`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={C.wallTop} />
        <stop offset="100%" stopColor={C.wall} />
      </linearGradient>
      <clipPath id={`${id}clip`}>
        <rect width={1920} height={1080} rx={34} />
      </clipPath>
      <g id={`${id}hi`}>
        <g clipPath={`url(#${id}clip)`}>
          <g transform={S1_FRAMING}>
            {room(false)}
            {pharmacienne}
            {counter(false)}
            {patient}
          </g>
        </g>
        <rect width={1920} height={1080} rx={34} fill="none" stroke={rgba(A1.pale, 0.35)} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </g>
      <g id={`${id}lo`}>
        <g clipPath={`url(#${id}clip)`}>
          <g transform={S1_FRAMING}>
          {room(true)}
          <path d="M664,560 C662,452 688,376 744,356 L812,356 C866,376 892,452 888,560 Z" fill={C.coat} />
          <ellipse cx={778} cy={268} rx={51} ry={59} fill={C.skinF} />
          <path d="M726,272 C716,214 752,196 790,200 C824,204 838,226 834,252 C810,236 776,232 750,250 Z" fill={C.hairF} />
          {counter(true)}
          <rect x={1288} y={680} width={96} height={306} rx={14} fill={C.trousers} />
          <path d="M1262,716 C1254,580 1258,470 1292,420 L1384,420 C1416,470 1424,580 1414,716 Z" fill="currentColor" />
          <ellipse cx={1334} cy={337} rx={47} ry={55} fill={C.skinM} />
          <path d="M1288,330 C1282,286 1310,268 1342,270 C1370,272 1386,294 1382,326 C1366,306 1330,302 1300,316 Z" />
          <rect x={1400} y={688} width={72} height={92} rx={6} fill={C.bag} />
          </g>
        </g>
        <rect width={1920} height={1080} rx={34} fill="none" stroke={rgba(A1.pale, 0.3)} strokeWidth={1.1} vectorEffect="non-scaling-stroke" />
      </g>
      {/* la bulle « Non merci. » : la pointe de la queue en 0, 0 */}
      <g id={`${id}bub`}>
        <path d="M-2,0 C8,-20 16,-36 20,-52 L60,-52 C44,-32 20,-14 -2,0 Z" fill={C.bubble} />
        <rect x={-32} y={-158} width={404} height={108} rx={54} fill={C.bubble} />
        <text x={170} y={-89} textAnchor="middle" fontFamily={JAKARTA} fontWeight={800} fontSize={62} letterSpacing={-0.7} fill={A1.ink}>
          Non merci.
        </text>
      </g>
    </defs>
  );
}

/* ------------------------------------------------------------------ la mosaïque, dessinée */

/** La pointe de la bulle « Non merci. » de S1 (SET.patient.bubble, 20 px plus bas). */
const BUB = { x: SET.patient.bubble.x, y: SET.patient.bubble.y + 20 };

function bubbleScale(t: number, c: Cell) {
  if (t < c.pop) return 0;
  let s = ressort(t, c.pop);
  if (t >= c.hide) s = t < c.hide + 0.1 ? s * (1 - prog(t, c.hide, 0.08, EXIT)) : ressort(t, c.hide + 0.12);
  return s;
}

function Mosaic({ t, id }: { t: number; id: string }) {
  const Z = zoomAt(t);
  const ox = 960;
  const oy = originY(t);
  const cw = CW * Z;
  const ch = CH * Z;
  const lo = cw < 200;
  const ref = `#${id}${lo ? "lo" : "hi"}`;
  const bubK = lo ? 1.45 : 1;
  const morphing = t > 14.9;
  const nodes = [];
  for (const c of CELLS) {
    if (c.ring === 0 && t < 13.82) continue; // la vignette détaillée est dessinée à part
    if (c.ring > 0 && t < c.appear) continue;
    const e = c.ring === 0 ? 1 : prog(t, c.appear, 0.24, SNAP);
    const kFrom = c.ring <= 1 ? 0 : (c.ring - 1) / c.ring;
    const kk = lerp(kFrom, 1, e);
    const x = ox + c.i * PX * Z * kk;
    const y = oy + c.j * PY * Z * kk;
    const grow = lerp(0.55, 1, e);
    const op = c.ring === 0 ? clamp01((t - 13.82) / 0.1) : clamp01(e * 2.5);
    const u = c.dot >= 0 && t > c.ms ? clamp01((t - c.ms) / c.md) : c.dot < 0 && t > 14.96 ? -prog(t, 14.96, 0.16, EXIT) : 0;
    if (u >= 1 || u <= -1) continue;
    if (u > 0) {
      // la vignette rougit, se réduit en point, file à sa place sur la carte
      const red = clamp01(u / 0.28);
      const shp = SNAP(clamp01(u / 0.5));
      const end = dotPos(c.dot);
      const at = (uu: number) => {
        const ee = IN_OUT(clamp01(uu));
        const bx = lerp(x, end.x, ee);
        const by = lerp(y, end.y, ee);
        const dx = end.x - x;
        const dy = end.y - y;
        const n = Math.hypot(dx, dy) || 1;
        const b = Math.sin(Math.PI * ee) * c.bend;
        return { x: bx + (-dy / n) * b, y: by + (dx / n) * b };
      };
      const p = at(u);
      if (u < 0.42) {
        const w = lerp(cw, DOT_D, shp);
        const h = lerp(ch, DOT_D, shp);
        const s = (w / 1920) * 1;
        nodes.push(
          <g key={`${c.i},${c.j}`} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}>
            {red < 0.98 && (
              <g transform={`scale(${s.toFixed(5)}) translate(-960 -540)`} opacity={1 - red}>
                <use href={ref} color={c.jacket} fill={c.hair} />
              </g>
            )}
            <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={lerp(3, DOT_D / 2, shp)} fill={A1.alarm} opacity={0.25 + 0.75 * red} />
          </g>,
        );
      } else {
        const a = at(u - 0.05);
        nodes.push(<line key={`${c.i},${c.j}`} x1={a.x.toFixed(1)} y1={a.y.toFixed(1)} x2={p.x.toFixed(1)} y2={p.y.toFixed(1)} stroke={A1.alarm} strokeWidth={DOT_D} strokeLinecap="round" />);
      }
      continue;
    }
    const s = (cw / 1920) * grow * (u < 0 ? 1 + u * 0.8 : 1);
    const hw = 960 * s;
    const hh = 540 * s;
    if (x + hw < -10 || x - hw > 1930 || y + hh < -10 || y - hh > 1090) continue;
    const bs = bubbleScale(t, c) * bubK;
    nodes.push(
      <g key={`${c.i},${c.j}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(5)}) translate(-960 -540)`} opacity={op * (u < 0 ? 1 + u : 1)}>
        <use href={ref} color={c.jacket} fill={c.hair} />
        {bs > 0.01 && (
          <g transform={`translate(${BUB.x} ${BUB.y}) scale(${bs.toFixed(3)})`}>
            <use href={`#${id}bub`} />
          </g>
        )}
      </g>,
    );
  }
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, overflow: "visible", filter: morphing ? `drop-shadow(0 0 6px ${rgba(A1.alarm, 0.65)})` : undefined }}>
      <CellDefs id={id} />
      {nodes}
    </svg>
  );
}

/* ------------------------------------------------------------------ S1 redessinée : le plan large du comptoir */

/** Le plan large de S1 (mêmes réglages que s01-comptoir : lumière, porte, bulles, caméra), redessiné ici : S2 le pose
 *  à « Non merci. » (4,46) dans sa vignette de sortie, S3 en part, S4 le rembobine. T = l'état de l'histoire (temps de
 *  S1), life = le temps de la vie (clignements, respiration, grésillement) — égal à T sur la bande. */
const S1_FRAMING = (() => {
  const z = 1 + 0.085 * IN_OUT(clamp01((4.46 - 1.0) / 5.0)) ** 0.9;
  return `translate(1010 330) scale(${z.toFixed(4)}) translate(-1010 -330)`;
})();
function s1Salve(t: number, a: number, b: number, seed: string, lo: number, hi: number): number | null {
  if (t < a || t >= b) return null;
  const step = Math.floor((t - a) * 30);
  const on = hash(seed, step) < 0.6;
  return on ? lerp(lo, hi, 0.5 + 0.5 * hash(`${seed}v`, step)) : lo * 0.4;
}
const shiftWin = (w: [number, number][], T: number, life: number) => w.map(([a, b]) => [a - T + life, b - T + life] as [number, number]);

function S1Wide({ T, life, boost = 1 }: { T: number; life: number; boost?: number }) {
  const leave = prog(T, 4.9, 1.0, LINEAR);
  const grab = prog(T, 4.36, 0.5, LINEAR);
  const door = keys(T, [
    [5.24, 0],
    [5.46, 1, IN_OUT],
    [5.86, 1],
    [5.96, 0, EXIT],
  ]);
  const zoom = 1 + 0.085 * IN_OUT(clamp01((T - 1.0) / 5.0)) ** 0.9;
  const pb = SET.pharmacienne.bubble;
  const qb = SET.patient.bubble;
  return (
    <AbsoluteFill style={{ background: A1.ink }}>
      <Camera t={T} origin={[1010, 330]} zoom={zoom} drift={0.8}>
        <Pharmacy t={life} mood="act1" light={s1Salve(T, 1.0, 1.17, "s1neonC", 0.55, 1) ?? 1} doorOpen={door} chimeAt={5.3 - T + life}>
          <Pharmacienne t={life} mood="act1" expression="lasse" talk={shiftWin([[1.4, 2.18], [2.22, 3.56]], T, life)} />
          <Ordonnance x={SET.slots.rx.x} y={SET.slots.rx.y} w={150} flat={1} rotate={-8} mood="act1" />
          <Patient t={life} mood="act1" talk={shiftWin([[4.3, 4.96]], T, life)} grab={grab} leave={leave} peek boxesInBag={1} />
          <Bubble t={T} at={1.4} exitAt={2.62} text="Et avec ceci…" side={pb.side} mood="act1" x={pb.x - 6} y={pb.y + 34} size={42} />
          <Bubble t={T} at={2.76} exitAt={3.96} text="Autre chose ?" side={pb.side} mood="act1" x={pb.x - 6} y={pb.y + 34} size={58} />
          <AbsoluteFill style={{ transform: boost !== 1 ? `scale(${boost})` : undefined, transformOrigin: `${qb.x}px ${qb.y + 20}px` }}>
            <Bubble t={T} at={4.28} exitAt={4.9} text="Non merci." side={qb.side} mood="act1" x={qb.x} y={qb.y + 20} size={58} />
          </AbsoluteFill>
        </Pharmacy>
      </Camera>
    </AbsoluteFill>
  );
}

/** La vignette de départ : le plan large de S1 arrêté sur « Non merci. » (comme la vignette de sortie de S2), vivant ;
 *  sur « scène » la bulle cogne. Elle cède la place à son dessin léger pendant le 2e coup de démultiplication. */
function FirstVignette({ t }: { t: number }) {
  if (t >= 13.93) return null;
  const Z = zoomAt(t);
  const w = CW * Z;
  const s = w / 1920;
  const x = 960;
  const y = originY(t);
  const fade = 1 - clamp01((t - 13.83) / 0.1);
  const boost = 1 + 0.2 * Math.max(0, Math.sin(Math.PI * clamp01((t - 13.1) / 0.3)));
  return (
    <div
      style={{
        position: "absolute",
        left: x - 960 * s,
        top: y - 540 * s,
        width: 1920,
        height: 1080,
        transform: `scale(${s})`,
        transformOrigin: "0 0",
        borderRadius: 34,
        overflow: "hidden",
        opacity: fade,
        boxShadow: `0 30px 90px ${rgba("#000000", 0.6)}`,
        outline: `${(1.5 / s).toFixed(2)}px solid ${rgba(A1.pale, 0.35)}`,
      }}
    >
      <S1Wide T={4.46} life={t} boost={boost} />
    </div>
  );
}

/* ------------------------------------------------------------------ « chaque jour » : l'éphéméride */

const FLIPS = [W.chaque, W.jour, 14.5, 14.62, 14.72, 14.8, 14.87, 14.93, 14.98, 15.03, 15.07, 15.11, 15.15];
const JOURS = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI", "DIMANCHE"];
/** Lundi 19 octobre 2026, puis un jour par page (le dernier passe en novembre). */
const dateOf = (n: number) => {
  const d = 19 + n;
  return { wd: JOURS[n % 7], d: d > 31 ? d - 31 : d, m: d > 31 ? "NOVEMBRE" : "OCTOBRE" };
};
const CAL = { x: 1672, y: 232, w: 236, h: 252 };
const CAL_IN = 13.9;
const CAL_OUT = 15.17;

function CalPage({ n, style }: { n: number; style?: CSSProperties }) {
  const dt = dateOf(n);
  return (
    <div style={{ position: "absolute", left: 0, top: 64, width: CAL.w, height: CAL.h - 64, background: "#E6ECEE", borderRadius: "0 0 16px 16px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transformOrigin: "50% 0", ...style }}>
      <div style={{ ...label(20), color: "#6E7C82", letterSpacing: "0.16em" }}>{dt.wd}</div>
      <div style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 116, lineHeight: 0.95, letterSpacing: "-0.05em", color: A1.ink, marginTop: 4 }}>{dt.d}</div>
    </div>
  );
}

function Calendar({ t }: { t: number }) {
  if (t < CAL_IN) return null;
  const out = prog(t, CAL_OUT, 0.24, EXIT);
  if (out >= 1) return null;
  const s = ressort(t, CAL_IN, { damping: 11 }) * (1 - out * 0.6);
  const n = FLIPS.filter((f) => t >= f).length;
  // un petit coup à chaque page arrachée
  let kick = 0;
  for (const f of FLIPS) if (t >= f) kick += 5 * Math.exp(-(t - f) * 14) * Math.sin((t - f) * 40);
  const rot = 5 + wobble(t, 31, 1.6, 1.3) + kick - out * 30 + (1 - Math.min(1, s)) * -18;
  const cur = dateOf(n);
  return (
    <div style={{ position: "absolute", left: CAL.x - CAL.w / 2, top: CAL.y - CAL.h / 2, width: CAL.w, height: CAL.h, transform: `translate(${out * 260}px, ${-out * 220}px) rotate(${rot}deg) scale(${Math.max(0, s)})`, opacity: 1 - out, perspective: 700 }}>
      {/* l'épaisseur du bloc */}
      <div style={{ position: "absolute", left: 6, top: 14, width: CAL.w, height: CAL.h, borderRadius: 18, background: "#0B0F11", opacity: 0.55, filter: "blur(8px)" }} />
      <div style={{ position: "absolute", left: 4, top: 70, width: CAL.w - 8, height: CAL.h - 62, borderRadius: "0 0 18px 18px", background: "#B9C3C7" }} />
      <div style={{ position: "absolute", left: 2, top: 66, width: CAL.w - 4, height: CAL.h - 62, borderRadius: "0 0 17px 17px", background: "#CFD7DA" }} />
      <CalPage n={n} />
      {/* les pages qui s'arrachent */}
      {FLIPS.map((f, k) => {
        const u = (t - f) / 0.42;
        if (u < 0 || u > 1) return null;
        const e = SNAP(u);
        return <CalPage key={k} n={k} style={{ transform: `translate(${-e * 90}px, ${-e * 150 + u * u * 120}px) rotateX(${-e * 70}deg) rotate(${-e * 28}deg)`, opacity: 1 - u * u, boxShadow: `0 ${10 + 20 * e}px 30px ${rgba("#000000", 0.35)}` }} />;
      })}
      {/* l'en-tête et ses anneaux */}
      <div style={{ position: "absolute", left: 0, top: 0, width: CAL.w, height: 66, borderRadius: "18px 18px 0 0", background: "#3A4449", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `inset 0 -3px 0 ${rgba("#000000", 0.25)}` }}>
        <div style={{ ...label(19), color: A1.pale, marginTop: 8 }}>{cur.m}</div>
      </div>
      {[0.3, 0.7].map((k) => (
        <div key={k} style={{ position: "absolute", left: CAL.w * k - 7, top: -12, width: 14, height: 30, borderRadius: 7, background: "#8B979C", boxShadow: `0 2px 0 ${rgba("#000000", 0.4)}` }} />
      ))}
    </div>
  );
}

/** Une ombre de nuit qui balaie la mosaïque à chaque jour arraché. */
function DaySweep({ t }: { t: number }) {
  const env = prog(t, W.chaque, 0.2, LINEAR) * (1 - prog(t, 14.95, 0.2, LINEAR));
  if (env <= 0) return null;
  let ph = 0;
  for (let k = 0; k < FLIPS.length; k++) {
    const a = FLIPS[k];
    const b = FLIPS[k + 1] ?? a + 0.05;
    if (t >= a) ph = k + clamp01((t - a) / (b - a));
  }
  const x = -40 + (ph % 1) * 180;
  return <AbsoluteFill style={{ pointerEvents: "none", opacity: env * 0.42, background: `linear-gradient(100deg, transparent ${x - 26}%, ${rgba("#03070A", 0.95)} ${x}%, transparent ${x + 26}%)` }} />;
}

/* ------------------------------------------------------------------ la carte rouge */

const nearestDot = (bx: number, by: number) => {
  let best = 0;
  let bd = 1e9;
  FRANCE_DOTS.forEach((p, i) => {
    const d = (p.x - bx) ** 2 + (p.y - by) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
};
/** Paris, dans la boîte 1000 × 1000 : les vagues partent d'ici. */
const PARIS = { x: 498, y: 254 };
const WAVES = [15.6, 15.95, 16.28];
/** De petits « Non merci. » qui se posent sur la carte (Lille, Bordeaux, Lyon, Brest, Marseille). */
const PINS = [
  { d: nearestDot(544, 100), at: 15.7, side: "left" as const },
  { d: nearestDot(310, 625), at: 15.84, side: "right" as const },
  { d: nearestDot(658, 540), at: 15.98, side: "left" as const },
  { d: nearestDot(80, 300), at: 16.1, side: "left" as const },
  { d: nearestDot(692, 760), at: 16.22, side: "left" as const },
];

function RedMap({ t }: { t: number }) {
  if (t < 15.25) return null;
  const show = prog(t, 15.25, 0.2, LINEAR);
  const lit = (i: number) => {
    const land = DOT_LAND[i];
    if (t < land) return 0;
    const p = FRANCE_DOTS[i];
    const dist = Math.hypot(p.x - PARIS.x, p.y - PARIS.y) / 1000;
    let w = 0;
    for (const w0 of WAVES) {
      const q = (t - w0) * 1.9 - dist;
      w += Math.exp(-((q / 0.07) ** 2));
    }
    const pop = 0.9 * Math.exp(-(t - land) * 12);
    return 0.72 + 0.06 * Math.sin(t * 7 + i) + 0.55 * w + pop;
  };
  const draw = prog(t, 15.38, 0.5, IN_OUT);
  const glow = 0.22 + 0.12 * WAVES.reduce((a, w0) => a + Math.exp(-(((t - w0 - 0.2) / 0.18) ** 2)), 0);
  return (
    <AbsoluteFill style={{ opacity: show }}>
      <div style={{ position: "absolute", left: MAP.x - 700, top: MAP.y - 560, width: 1400, height: 1120, background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${rgba(A1.alarm, glow)} 0%, ${rgba(A1.alarm, glow * 0.3)} 40%, transparent 70%)` }} />
      <svg width={MAP.s} height={MAP.s} viewBox="0 0 1000 1000" style={{ position: "absolute", left: MAP.x - MAP.s / 2, top: MAP.y - MAP.s / 2, overflow: "visible" }}>
        <path d={FRANCE_PATH} fill={rgba(A1.alarm, 0.07 * draw)} stroke={rgba(A1.alarm, 0.16)} strokeWidth={16} strokeLinejoin="round" opacity={draw} />
        <path d={FRANCE_PATH} fill="none" stroke={A1.alarm} strokeWidth={3.5} strokeLinejoin="round" pathLength={1} strokeDasharray={`${draw} 1`} opacity={0.85} />
      </svg>
      <FranceMap t={t} x={MAP.x} y={MAP.y} size={MAP.s} color={A1.alarm} base={A1.alarm} outline={false} lit={lit} />
      {PINS.map((p, k) => {
        const q = dotPos(p.d);
        return <Bubble key={k} t={t} at={p.at} exitAt={OFF - 0.06} text="Non merci." side={p.side} mood="act1" x={q.x} y={q.y - 6} size={25} />;
      })}
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ la scène */

const SHAKES = [
  { at: W.repete, amp: 5, frames: 10 },
  { at: W.b2, amp: 4, frames: 9 },
  { at: W.b3, amp: 5, frames: 10 },
  { at: 15.47, amp: 9, frames: 12 },
];

/** L'image de S3 à l'instant t, sans la télé qui s'éteint (S4 en garde une copie pour la rembobiner). */
function Tape3({ t, id }: { t: number; id: string }) {
  const zoom = keys(t, [
    [15.44, 1],
    [15.56, 1.035, SNAP],
    [OFF, 1.075, LINEAR],
  ]);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 75% 70% at 50% 45%, #1E272B 0%, ${A1.ink} 62%, #07090A 100%)` }} />
      <Dust t={t} count={34} seed="s3dust" color={A1.neon} alpha={0.16} size={[1.5, 3.5]} speed={0.05} />
      <Camera t={t} drift={0.8} shakes={SHAKES} zoom={zoom} origin={[MAP.x, MAP.y]}>
        <Mosaic t={t} id={id} />
        <FirstVignette t={t} />
        <DaySweep t={t} />
        <RedMap t={t} />
      </Camera>
      <Calendar t={t} />
    </AbsoluteFill>
  );
}
/* ---- BANDE:FIN ---- */

export function Scene({ t }: { t: number }) {
  if (t >= END) return null;
  // la vieille télé s'éteint : l'image s'écrase en un trait, puis en un point, puis le noir
  const a = prog(t, OFF, 0.075, EXIT);
  const b = prog(t, OFF + 0.075, 0.055, EXIT);
  const c = prog(t, OFF + 0.13, 0.08, LINEAR);
  const sy = lerp(1, 0.004, a);
  const sx = lerp(1, 0.004, b);
  return (
    <AbsoluteFill style={{ background: "#000000" }}>
      {b < 1 && (
        <AbsoluteFill style={{ transform: `scale(${sx}, ${sy})`, filter: a > 0 ? `brightness(${1 + 3 * a})` : undefined }}>
          <Tape3 t={t} id="s3c" />
          {a > 0 && <AbsoluteFill style={{ background: "#FFFFFF", opacity: a * 0.85 }} />}
        </AbsoluteFill>
      )}
      {/* le point blanc de la télé qui s'éteint */}
      {b > 0.6 && c < 1 && (
        <div style={{ position: "absolute", left: 960 - 9, top: 540 - 9, width: 18, height: 18, borderRadius: 9, background: "#FFFFFF", boxShadow: `0 0 24px 10px ${rgba("#DDEBFF", 0.7)}`, opacity: 1 - c, transform: `scale(${1 - 0.7 * c})` }} />
      )}
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ les sons */

export const cues: Cue[] = [
  // « scène » : la bulle de la vignette
  cue("pop-leger", W.scene - 0.03, 0.42),
  // « répète » : trois coups de démultiplication
  cue("multiplication", W.repete - 0.06, 0.55),
  cue("balayage-mini", W.repete - 0.02, 0.32),
  ...every("pop-leger", W.repete + 0.1, W.b2, 0.035, 0.22, 1.08),
  cue("balayage-mini", W.b2 - 0.01, 0.3, 1.12),
  ...every("pop-leger", W.b2 + 0.09, W.b3, 0.03, 0.2, 1.18),
  cue("swoosh", W.b3 - 0.02, 0.36),
  ...every("pop-leger", W.b3 + 0.08, 14.46, 0.03, 0.15, 1.28),
  cue("foule-non-merci", 13.82, 0.35, 1, 2.6),
  // « chaque jour » : l'éphéméride arrive, ses pages s'arrachent de plus en plus vite
  cue("papier", CAL_IN - 0.02, 0.38),
  cue("tic", W.chaque, 0.32),
  cue("tic", W.jour, 0.32),
  cue("molette", 14.47, 0.34),
  ...FLIPS.slice(2).map((f) => cue("tic-sec", f, 0.14, 1.15)),
  cue("swoosh", CAL_OUT, 0.22, 1.2),
  // « toute la France » : la mosaïque est aspirée en points rouges qui claquent sur la carte
  cue("aspiration", 15.47 - 1.382, 0.5),
  cue("tampon", 15.43, 0.55),
  ...WAVES.map((w) => cue("carte-ping", w, 0.3, 0.7)),
  ...PINS.map((p) => cue("pop-leger", p.at - 0.01, 0.26, 0.92)),
  // la musique s'arrête net : la télé s'éteint
  cue("tele-off", OFF - 0.01, 0.7),
];
