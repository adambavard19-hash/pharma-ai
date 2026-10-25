import type { CSSProperties } from "react";
import { AbsoluteFill } from "remotion";
import {
  A1,
  PB,
  JAKARTA,
  MONO,
  rgba,
  label,
  punch,
  SET,
  Pharmacy,
  Pharmacienne,
  Patient,
  patientPose,
  Ordonnance,
  MedBox,
  Bubble,
  PharmacyBag,
  bagSlot,
  FranceMap,
  FRANCE_DOTS,
  FRANCE_PATH,
  coldGrade,
  Camera,
  Dust,
  Sparks,
  Ring,
  Flash,
  LightLeak,
  Sparkle,
  shake,
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
 * S4 · REMBOBINONS (16,7 → 20,5) — N3 « Alors… rembobinons. » LE moment signature : la bande VHS, dans le SILENCE.
 *
 *  16,7          le noir (S3 a éteint la télé).
 *  « Alors… »    (16,82) la télé se rallume sur l'image ARRÊTÉE de la bande : la carte rouge (la dernière image vue),
 *                « ⏸ PAUSE » et le compteur « 00:00:16 » en bas à gauche (en haut, les bulles de S1 le croiseraient),
 *                façon magnétoscope des années 90, MONO blanc ombré et frangé ; l'image
 *                tremble comme une pause VHS (barre de bruit, saut de trame).
 *  « rembobinons » (17,80) « ◀◀ REMBOBINAGE » : TOUT repart à l'envers, de plus en plus vite — la carte se défait en
 *                points qui refilent dans leurs vignettes, les « Non merci. » rentrent dans les bouches, la mosaïque se
 *                replie en une vignette, le sac en radio et « RIEN. » de S2, la rue où il marche à reculons, puis il
 *                RENTRE dans la pharmacie à reculons (la porte se rouvre, la clochette tinte à l'envers), repose son sac,
 *                « Non merci. » et « Autre chose ? » rentrent dans les bouches ; le compteur dévale jusqu'à 00:00:01.
 *                Effets : bandes de bruit qui défilent, déchirures horizontales, décalage RVB, saut de trame, neige.
 *  19,3 → 19,56  la bande ralentit et s'arrête ; 19,6 « ▶ LECTURE » (claquement), l'image se stabilise.
 *  20,0 DROP     (transition faite par S4, au-dessus de S5) : éclair blanc, une onde CITRON part du centre et fait un
 *                trou de plus en plus grand dans l'image grise — la couleur de S5 envahit tout ; étincelles citron et
 *                menthe, onde de choc, secousse ; à 20,36 il ne reste que la lumière.
 *
 *  La bande = l'image du film au temps T de la bande (T recule pendant le rembobinage). Pas d'import des autres
 *  scènes : S1 et S2 sont redessinées ici avec le kit ; S3 est recopiée de s03 (bloc BANDE, à garder identique).
 * ======================================================================== */

/* ---- BANDE:DEBUT ---- (copie conforme de s03-chaque-jour : NE PAS modifier ici, modifier s03 puis recopier) */

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

/* ================================================================== S4 */

const S4 = { start: 16.7, on: 16.785, alors: 16.825, rew: 17.8, stop: 19.56, play: 19.6, drop: 20.0 };
/** La bande arrêtée : la dernière image nette de S3 (la carte rouge), juste avant que la télé ne s'éteigne. */
const PAUSE_T = 16.42;
/** La bande rembobinée s'arrête ici (compteur 00:00:00), puis repart en lecture. */
const STOP_T = 1.0;

/** Monotone cubique (Fritsch–Carlson), pentes nulles aux deux bouts : la bande démarre et s'arrête sans à-coup. */
function monotone(k: [number, number][]) {
  const xs = k.map((p) => p[0]);
  const ys = k.map((p) => p[1]);
  const n = xs.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m: number[] = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * a * d[i];
      m[i + 1] = tau * b * d[i];
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const u = (x - xs[i]) / h;
    const u2 = u * u;
    const u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * ys[i] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * ys[i + 1] + (u3 - u2) * h * m[i + 1];
  };
}

/** Le temps de la bande pendant le rembobinage : lent au départ, très vite à travers S2, ralenti à travers S1 (on voit
 *  le patient rentrer à reculons et les bulles rentrer dans les bouches), arrêt à 00:00:00. */
const REWIND = monotone([
  [S4.rew, PAUSE_T],
  [18.05, 15.75],
  [18.3, 14.3],
  [18.52, 12.7],
  [18.72, 8.4],
  [18.92, 6.3],
  [19.2, 4.6],
  [19.4, 2.4],
  [S4.stop, STOP_T],
]);

function tapeAt(t: number) {
  if (t < S4.rew) return PAUSE_T;
  if (t < S4.stop) return REWIND(t);
  if (t < S4.play) return STOP_T;
  return STOP_T + (t - S4.play);
}
/** L'instant du film où la bande rembobinée passe par le temps T (pour caler les sons sur l'image). */
function whenTape(T: number) {
  let a = S4.rew;
  let b = S4.stop;
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    if (REWIND(m) > T) a = m;
    else b = m;
  }
  return +((a + b) / 2).toFixed(3);
}
/** La vitesse de rembobinage (secondes de bande par seconde), positive pendant le rembobinage. */
const rewSpeed = (t: number) => (t < S4.rew || t > S4.stop ? 0 : (tapeAt(t - 1 / 240) - tapeAt(t + 1 / 240)) * 120);

/* ------------------------------------------------------------------ S2 redessinée (mêmes places que s02-rien) */

/** S2 : le patient de dos dans la rue, le sac de l'insert (poignée, largeur), « RIEN. », la lumière des rayons X. */
const S2 = { hit: 8.0, xray: 8.04, xrayDur: 0.26, tag: 8.3, rien: 9.73, grow: 10.12, exit: 12.6, plunge: 7.45 };
const WALKER = { x: 1060, y: 905, s: 0.9 };
const HB = { x: 800, y: 236, w: 440 };
const XR = "#8FE9FF";
const BAG_IN_STREET = { x: WALKER.x - 124 * WALKER.s, y: WALKER.y + (-316 + 110) * WALKER.s };
const PLUNGE_Z = HB.w / (130 * WALKER.s);
const WORDS2: [string, number][] = [
  ["pour sa", 10.2],
  ["flore", 10.67],
  ["intestinale", 11.07],
];

/** La rue de nuit en perspective (point de fuite au centre), les vitrines qui défilent, lui de dos qui marche. */
function Street({ T }: { T: number }) {
  const L = Math.min(0.86, 0.14 + (T - 6.0) * 0.23);
  const pose = patientPose(L);
  const k = WALKER.s / pose.scale;
  const zoom = 1 + (PLUNGE_Z - 1) * prog(T, S2.plunge, S2.hit - S2.plunge, EXIT);
  const VP = { x: 960, y: 430 };
  const run = (T - 6) * 0.62;
  const shops = Array.from({ length: 7 }, (_, i) => {
    const d = ((i * 0.9 - run) % 6.3 + 6.3) % 6.3 + 0.35;
    return { i, d };
  }).sort((a, b) => b.d - a.d);
  const P = (X: number, h: number, d: number) => `${(VP.x + X / d).toFixed(1)},${(VP.y + (45 - h) / d).toFixed(1)}`;
  return (
    <AbsoluteFill style={{ background: "#0A1013", overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: `${BAG_IN_STREET.x}px ${BAG_IN_STREET.y}px` }}>
        <AbsoluteFill style={{ background: "linear-gradient(180deg, #0A1013 0%, #1E2A31 55%, #11171A 100%)" }} />
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
          <path d={`M0,1080 L${VP.x - 40},${VP.y + 40} L${VP.x + 40},${VP.y + 40} L1920,1080 Z`} fill="#20292E" />
          <path d={`M0,0 L${VP.x - 60},${VP.y - 120} L${VP.x - 60},${VP.y + 40} L0,1080 Z`} fill="#192227" />
          <path d={`M1920,0 L${VP.x + 60},${VP.y - 120} L${VP.x + 60},${VP.y + 40} L1920,1080 Z`} fill="#1D272C" />
          {shops.map(({ i, d }) => {
            const side = i % 2 ? 1 : -1;
            const X = side * 640;
            const lit = hash("s4shop", i) < 0.6;
            return <path key={i} d={`M${P(X, 0, d)} L${P(X, 300, d)} L${P(X, 300, d + 0.45)} L${P(X, 0, d + 0.45)} Z`} fill={lit ? coldGrade("#F1E2B8", 0.9) : "#6F8792"} opacity={0.75 * clamp01(1.2 - d / 6)} />;
          })}
          {Array.from({ length: 5 }, (_, i) => {
            const d = ((i * 1.3 - run) % 6.5 + 6.5) % 6.5 + 0.3;
            return <path key={`l${i}`} d={`M${P(-250, 0, d)} L${P(-250, 900, d)}`} stroke="#0C1214" strokeWidth={Math.min(40, 14 / d)} />;
          })}
        </svg>
        <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "0 0", transform: `translate(${WALKER.x}px, ${WALKER.y}px) scale(${k}) translate(${-pose.x}px, ${-pose.y}px)` }}>
          <Patient t={T} mood="act1" leave={L} boxesInBag={1} peek />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** L'insert sur le sac : les rayons X, la place vide en pointillés rouges, « Antibiotique · 7 jours », « RIEN. ». */
function XrayBag({ T }: { T: number }) {
  const xk = prog(T, S2.xray, S2.xrayDur, IN_OUT);
  const pad = 0.3 * HB.w;
  const Ht = 1.4 * HB.w + 2 * pad;
  const lineY = lerp(-40, 1.4 * HB.w + 16, xk);
  const cut = clamp01((lineY + pad) / Ht) * 100;
  const slot = bagSlot(1, HB.w);
  const ghostK = ressort(T, S2.rien);
  const grow = 1 + 0.3 * prog(T, S2.grow, 0.3, SNAP);
  const swing = T < 9.6 ? Math.sin((T - 8) * Math.PI * 2 * 0.95 + 0.6) * 5.5 : 0;
  const tagK = ressort(T, S2.tag);
  const slot0 = bagSlot(0, HB.w);
  const rienK = prog(T, S2.rien, 0.15, SNAP);
  const q = ressort(T, S2.rien + 0.02) * (1 - prog(T, S2.grow - 0.04, 0.12, EXIT));
  return (
    <AbsoluteFill style={{ background: "#0A1114", overflow: "hidden" }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 46% 60% at ${(HB.x / 1920) * 100}% 56%, ${rgba("#16303A", 0.55)} 0%, transparent 100%)` }} />
      <div style={{ position: "absolute", left: HB.x, top: HB.y, width: 0, height: 0, transform: `rotate(${swing}deg)` }}>
        <PharmacyBag x={0} y={0} w={HB.w} boxes={1} mood="act1" style={{ clipPath: `inset(${cut}% 0 0 0)` }} />
        {xk > 0 && <PharmacyBag x={0} y={0} w={HB.w} boxes={1} xray={1} mood="act1" style={{ clipPath: `inset(0 0 ${100 - cut}% 0)` }} />}
        {ghostK > 0 && (
          <div style={{ position: "absolute", left: slot.x, top: slot.y, width: 0, height: 0, transform: `scale(${ghostK * grow})` }}>
            <MedBox ghost={A1.alarm} x={0} y={slot.w * 0.3} w={slot.w} t={T}>
              <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                {q > 0.01 && <span style={{ position: "absolute", fontFamily: JAKARTA, fontWeight: 800, fontSize: 92, lineHeight: 1, color: A1.alarm, transform: `scale(${q})` }}>?</span>}
                {WORDS2.map(([w, at], i) => (
                  <span key={w} style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: i === 0 ? 22 : 27, lineHeight: 1.08, color: i === 0 ? "#FFD9D5" : "#FFFFFF", opacity: prog(T, at - 0.03, 0.2, SNAP), textShadow: `0 0 14px ${rgba(A1.alarm, 0.85)}` }}>
                    {w}
                  </span>
                ))}
              </div>
            </MedBox>
          </div>
        )}
      </div>
      {tagK > 0.01 && (
        <div style={{ position: "absolute", left: 560, top: HB.y + slot0.y, transform: `translate(-100%, -50%) scale(${0.85 + 0.15 * Math.min(1, tagK)})`, transformOrigin: "100% 50%", opacity: clamp01(tagK * 1.5), padding: "14px 22px 15px", borderRadius: 16, background: rgba("#06131A", 0.82), border: `2px solid ${rgba(XR, 0.75)}`, whiteSpace: "nowrap", fontFamily: JAKARTA, fontWeight: 800, fontSize: 32, color: "#FFFFFF" }}>
          Antibiotique <span style={{ color: XR }}>·</span> <span style={{ fontFamily: MONO, color: XR }}>7</span> jours
        </div>
      )}
      {T >= S2.rien && (
        <div style={{ position: "absolute", left: 1432, top: 560, width: 0, height: 0 }}>
          <div style={{ position: "absolute", transform: `translate(-50%, -50%) scale(${1 + 1.3 * (1 - rienK)})`, fontFamily: JAKARTA, fontWeight: 800, fontSize: 272, letterSpacing: "-0.05em", lineHeight: 1, whiteSpace: "nowrap", color: A1.alarm, textShadow: `0 0 40px ${rgba(A1.alarm, 0.6)}, 0 0 110px ${rgba(A1.alarm, 0.27)}` }}>RIEN.</div>
        </div>
      )}
      <AbsoluteFill style={{ pointerEvents: "none", background: `radial-gradient(ellipse 75% 75% at 50% 50%, transparent 55%, ${rgba(A1.alarm, 0.1 * prog(T, S2.rien, 0.6, LINEAR))} 100%)` }} />
    </AbsoluteFill>
  );
}

/** La sortie de S2 : l'image se réduit en vignette et devient le comptoir de S1 à « Non merci. » (12,6 → 13,1). */
function S2ToVignette({ T }: { T: number }) {
  const k = prog(T, S2.exit, 0.36, IN_OUT);
  const s = lerp(1, VIG.w / 1920, k);
  const cf = prog(T, S2.exit + 0.1, 0.24, IN_OUT);
  return (
    <AbsoluteFill style={{ background: "#0A1114" }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 75% 70% at 50% 45%, #1E272B 0%, ${A1.ink} 62%, #07090A 100%)`, opacity: k }} />
      <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "960px 540px", transform: `translate(${VIG.x - 960}px, ${(VIG.y - 540) * k}px) scale(${s})`, borderRadius: 34 * k, overflow: "hidden", outline: `${4 * k}px solid ${rgba(A1.pale, 0.35 * k)}` }}>
        <XrayBag T={S2.exit} />
        {cf > 0 && (
          <AbsoluteFill style={{ opacity: cf }}>
            <S1Wide T={4.46} life={T} />
          </AbsoluteFill>
        )}
      </div>
    </AbsoluteFill>
  );
}

function TapeFrame({ T }: { T: number }) {
  if (T >= 13.1) return <Tape3 t={T} id="s4c" />;
  if (T >= S2.exit) return <S2ToVignette T={T} />;
  if (T >= S2.hit) return <XrayBag T={T} />;
  if (T >= 6.17) return <Street T={T} />;
  return <S1Wide T={Math.min(T, 6.0)} life={T} />;
}

/* ------------------------------------------------------------------ le magnétoscope */

/** Les filtres VHS : déchirures horizontales (bruit en bandes → déplacement en x) + décalage RVB ; la neige. */
function VhsDefs({ t, disp, rgb }: { t: number; disp: number; rgb: number }) {
  const seed = Math.floor(t * 30) % 997;
  const grey = (
    <feComponentTransfer>
      <feFuncR type="linear" slope={2.6} intercept={-0.82} />
      <feFuncG type="linear" slope={2.6} intercept={-0.82} />
      <feFuncB type="linear" slope={2.6} intercept={-0.8} />
      <feFuncA type="linear" slope={0} intercept={1} />
    </feComponentTransfer>
  );
  return (
    <svg width={0} height={0} style={{ position: "absolute" }}>
      <defs>
        <filter id="s4vhs" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0 0.012" numOctaves={2} seed={seed} result="n" />
          <feColorMatrix in="n" type="matrix" values="1.8 0 0 0 -0.4  0 0 0 0 0.5  0 0 0 0 0  0 0 0 0 1" result="nm" />
          <feDisplacementMap in="SourceGraphic" in2="nm" scale={disp} xChannelSelector="R" yChannelSelector="G" result="d" />
          <feColorMatrix in="d" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
          <feOffset in="r" dx={rgb} dy={0} result="ro" />
          <feColorMatrix in="d" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="gb" />
          <feOffset in="gb" dx={-rgb} dy={0} result="gbo" />
          <feBlend in="ro" in2="gbo" mode="screen" />
        </filter>
        <filter id="s4snow" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.9 0.16" numOctaves={1} seed={seed + 11} />
          <feColorMatrix type="saturate" values="0" />
          {grey}
        </filter>
        <filter id="s4streak" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.004 0.5" numOctaves={2} seed={seed + 23} />
          <feColorMatrix type="saturate" values="0" />
          {grey}
        </filter>
        <linearGradient id="s4band" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0} />
          <stop offset="35%" stopColor="#FFFFFF" stopOpacity={1} />
          <stop offset="70%" stopColor="#FFFFFF" stopOpacity={1} />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
        </linearGradient>
        <mask id="s4bandMask" maskContentUnits="objectBoundingBox">
          <rect width={1} height={1} fill="url(#s4band)" />
        </mask>
      </defs>
    </svg>
  );
}

/** Les bandes de bruit qui défilent (rembobinage) + la barre de pause + la neige. */
function Noise({ t, T, k, pause }: { t: number; T: number; k: number; pause: number }) {
  const bars: { y: number; h: number; a: number }[] = [];
  if (k > 0.02)
    for (let i = 0; i < 3; i++) {
      const sp = 0.42 + i * 0.23;
      const ph = (((PAUSE_T - T) * sp + hash("s4bar", i)) % 1.3) - 0.15;
      bars.push({ y: ph * 1080, h: 40 + 110 * k * (0.5 + hash("s4barh", i)), a: 0.35 + 0.5 * k });
    }
  if (pause > 0) bars.push({ y: 668 + 30 * Math.sin(t * 1.3), h: 46, a: 0.5 * pause });
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {bars.map((b, i) => (
        <g key={i} mask="url(#s4bandMask)">
          <rect x={0} y={b.y} width={1920} height={b.h} filter="url(#s4streak)" opacity={b.a} />
        </g>
      ))}
      {k > 0.05 && <rect x={0} y={0} width={1920} height={1080} filter="url(#s4snow)" opacity={0.05 + 0.2 * k} style={{ mixBlendMode: "screen" }} />}
    </svg>
  );
}

/* ------------------------------------------------------------------ l'affichage du magnétoscope */

const OSD_SHADOW = `4px 4px 0 ${rgba("#000000", 0.6)}, -2px 0 0 ${rgba("#FF2E6A", 0.5)}, 2px 0 0 ${rgba("#2EDCFF", 0.5)}`;
const ICON_SHADOW = `drop-shadow(4px 4px 0 ${rgba("#000000", 0.6)}) drop-shadow(-2px 0 0 ${rgba("#FF2E6A", 0.5)}) drop-shadow(2px 0 0 ${rgba("#2EDCFF", 0.5)})`;

type Mode = "pause" | "rew" | "play";

function OsdIcon({ mode, t }: { mode: Mode; t: number }) {
  const blink = mode === "rew" ? (Math.floor(t * 7) % 2 ? 0.45 : 1) : 1;
  return (
    <svg width={64} height={52} viewBox="0 0 64 52" style={{ filter: ICON_SHADOW, overflow: "visible", opacity: blink }}>
      {mode === "pause" && (
        <>
          <rect x={12} y={4} width={13} height={44} fill="#FFFFFF" />
          <rect x={34} y={4} width={13} height={44} fill="#FFFFFF" />
        </>
      )}
      {mode === "rew" && (
        <>
          <path d="M30,4 L30,48 L4,26 Z" fill="#FFFFFF" />
          <path d="M58,4 L58,48 L32,26 Z" fill="#FFFFFF" />
        </>
      )}
      {mode === "play" && <path d="M14,3 L14,49 L48,26 Z" fill="#FFFFFF" />}
    </svg>
  );
}

function Osd({ t, T, mode, since, out }: { t: number; T: number; mode: Mode; since: number; out: number }) {
  const pop = 1 + 0.14 * Math.exp(-(t - since) * 18);
  const s = Math.max(0, Math.floor(T + 1e-6));
  const counter = `00:00:${String(s).padStart(2, "0")}`;
  const text = mode === "pause" ? "PAUSE" : mode === "rew" ? "REMBOBINAGE" : "LECTURE";
  const gx = out > 0 ? Math.sin(t * 120) * 30 * out : 0;
  const style: CSSProperties = { fontFamily: MONO, fontWeight: 700, color: "#FFFFFF", textShadow: OSD_SHADOW, letterSpacing: "0.06em", lineHeight: 1 };
  return (
    <div style={{ position: "absolute", left: L4.x, top: L4.y, transform: `translateX(${gx}px) scale(${pop})`, transformOrigin: "0 50%", opacity: 1 - out, filter: out > 0 ? `blur(${out * 6}px)` : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <OsdIcon mode={mode} t={t} />
        <div style={{ ...style, fontSize: 64 }}>{text}</div>
      </div>
      <div style={{ ...style, fontSize: 44, marginTop: 20, marginLeft: 4, opacity: 0.92 }}>{counter}</div>
    </div>
  );
}
/** L'affichage du magnétoscope, en bas à gauche, au-dessus des sous-titres (en haut à gauche, les bulles de S1 le
 *  croiseraient pendant le rembobinage). */
const L4 = { x: 110, y: 786 };

/* ------------------------------------------------------------------ la scène */

/** Le centre de l'onde citron du DROP. */
/** L'onde part du comptoir, entre la pharmacienne et le patient : là où manquait le conseil. */
const CX = 900;
const CY = 520;

export function Scene({ t }: { t: number }) {
  const T = tapeAt(t);
  const v = rewSpeed(t);
  const k = clamp01(v / 16);
  const rewinding = t >= S4.rew && t < S4.stop;
  const paused = t < S4.rew ? prog(t, S4.on + 0.06, 0.1, LINEAR) : 0;
  // la télé qui se rallume (16,785 → 16,86) : un trait, puis l'image
  const onA = prog(t, S4.on, 0.03, SNAP);
  const onB = prog(t, S4.on + 0.03, 0.05, SNAP);
  // la lecture : l'image se stabilise
  const settle = t >= S4.play ? 1 - prog(t, S4.play, 0.22, SNAP) : 0;
  const stopJolt = t >= S4.stop && t < S4.play + 0.1 ? 1 - clamp01((t - S4.stop) / 0.14) : 0;
  const disp = 4 * paused + (rewinding ? 10 + 70 * k : 0) + 26 * settle + 30 * stopJolt;
  const rgb = 1.6 * paused + (rewinding ? 2.5 + 7 * k : 0) + 4 * settle;
  // saut de trame (pause : 1–2 px ; rembobinage : plus fort, avec des sauts)
  const fr = Math.floor(t * 30);
  const jump = rewinding && hash("s4jump", fr) < 0.12 * k ? (hash("s4jmp", fr) - 0.5) * 70 : 0;
  const jy = (hash("s4jy", fr) - 0.5) * (2.5 * paused + (rewinding ? 4 + 10 * k : 0) + 6 * settle) + jump;
  // la caméra sur l'image arrêtée : une lente avancée ; le DROP : l'image grise souffle vers nous
  const creep = 1 + 0.03 * prog(t, S4.on, S4.rew - S4.on, LINEAR) * (t < S4.rew ? 1 : 0);
  const inhale = 1 - 0.018 * prog(t, 19.82, 0.18, IN_OUT);
  const blow = 1 + 0.14 * prog(t, S4.drop, 0.44, SNAP);
  const sk = shake(t, S4.drop, 18, 14);
  // le DROP : le trou citron
  const R = 1320 * prog(t, S4.drop, 0.44, (x) => 1 - (1 - x) ** 2.2);
  const tapeVisible = t >= S4.on && t < S4.drop + 0.44;
  const lit = t >= S4.on + 0.03;
  const mask = R > 0 ? `radial-gradient(circle at ${CX}px ${CY}px, transparent ${R}px, #000 ${R + 2}px)` : undefined;
  const mode: Mode = t < S4.rew ? "pause" : t < S4.play ? "rew" : "play";
  const since = mode === "pause" ? S4.on + 0.06 : mode === "rew" ? S4.rew : S4.play;
  const osdOut = prog(t, S4.drop - 0.02, 0.12, LINEAR);
  const vhs = disp > 0.5 || rgb > 0.3;
  return (
    <AbsoluteFill style={{ background: t < S4.drop ? "#000000" : "transparent" }}>
      <VhsDefs t={t} disp={disp} rgb={rgb} />
      {tapeVisible && (
        <AbsoluteFill style={{ WebkitMaskImage: mask, maskImage: mask, transform: `translate(${sk.x}px, ${sk.y}px)` }}>
          <AbsoluteFill style={{ background: "#000000" }} />
          <AbsoluteFill
            style={{
              transform: `translateY(${jy}px) scale(${lit ? 1 : 1}, ${lit ? onB * 0.996 + 0.004 : 0.004}) scale(${creep * inhale * blow})`,
              transformOrigin: `${CX}px ${CY}px`,
              filter: `${vhs ? "url(#s4vhs) " : ""}contrast(0.94) brightness(${1.04 + (1 - onB) * 3 + 0.12 * k}) saturate(${0.9 - 0.2 * k})`,
            }}
          >
            <div style={{ position: "absolute", inset: 0, transform: `scaleX(${onA})` }}>
              <TapeFrame T={T} />
            </div>
          </AbsoluteFill>
          <Noise t={t} T={T} k={rewinding ? Math.max(k, 0.25) : stopJolt * 0.6 + settle * 0.4} pause={paused} />
          {/* les lignes de balayage de la vieille télé */}
          <AbsoluteFill style={{ pointerEvents: "none", opacity: 0.5, background: `repeating-linear-gradient(180deg, ${rgba("#000000", 0.22)} 0px, ${rgba("#000000", 0.22)} 2px, transparent 2px, transparent 4px)` }} />
          {/* la graine de couleur, juste avant le DROP : une étoile citron grandit sur le comptoir */}
          {t > 19.64 && t < S4.drop + 0.05 && (
            <>
              <div style={{ position: "absolute", left: CX - 90, top: CY - 90, width: 180, height: 180, borderRadius: 90, background: `radial-gradient(circle, ${rgba(PB.citron, 0.9)} 0%, ${rgba(PB.citron, 0.25)} 35%, ${rgba(PB.citron, 0)} 70%)`, transform: `scale(${0.3 + 1.4 * prog(t, 19.64, 0.36, IN_OUT)})`, mixBlendMode: "screen" }} />
              <Sparkle t={t} at={19.65} x={CX} y={CY} size={260} color={PB.citron} />
            </>
          )}
        </AbsoluteFill>
      )}
      {/* l'onde citron : le bord du trou, une couronne de lumière (un seul dégradé) */}
      {R > 0 && R < 1300 && (
        <AbsoluteFill
          style={{
            pointerEvents: "none",
            background: `radial-gradient(circle at ${CX}px ${CY}px, transparent ${Math.max(0, R - 150)}px, ${rgba(PB.mint, 0.0)} ${Math.max(0, R - 150)}px, ${rgba(PB.mint, 0.35)} ${Math.max(0, R - 60)}px, ${rgba(PB.citron, 0.95)} ${Math.max(0, R - 16)}px, #FFFFFF ${R - 4}px, ${rgba(PB.citron, 0.9)} ${R + 6}px, ${rgba(PB.citron, 0.3)} ${R + 46}px, transparent ${R + 120}px)`,
          }}
        />
      )}
      <Sparks t={t} at={S4.drop} x={CX} y={CY} count={44} seed="s4sparks" speed={1900} spread={180} color={PB.citron} len={54} life={0.5} width={5} />
      <Sparks t={t} at={S4.drop + 0.03} x={CX} y={CY} count={26} seed="s4sparks2" speed={1300} spread={180} color={PB.mint} len={34} life={0.45} width={4} />
      <Ring t={t} at={S4.drop + 0.04} x={CX} y={CY} max={2400} color={PB.citron} width={8} life={0.5} />
      <AbsoluteFill style={{ opacity: 0.6, pointerEvents: "none" }}>
        <LightLeak t={t} at={S4.drop} dur={0.5} color={PB.citron} x={0.2} y={0.4} size={1.2} />
      </AbsoluteFill>
      <Flash t={t} at={S4.drop - 0.015} dur={0.2} color="#FFFFFF" max={0.8} />
      {t >= S4.on + 0.06 && osdOut < 1 && <Osd t={t} T={T} mode={mode} since={since} out={osdOut} />}
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ les sons (dans le silence : la musique s'est arrêtée à 16,5) */

export const cues: Cue[] = [
  // « Alors… » : la touche pause, la télé se rallume sur l'image arrêtée
  cue("clic", S4.on - 0.02, 0.5),
  cue("glitch", S4.on + 0.01, 0.22, 0.8),
  // « rembobinons » : la touche, puis la bande qui rembobine (coupée avant son claquement d'arrêt)
  cue("clic", S4.rew - 0.07, 0.55, 0.9),
  cue("vhs-rembobine", S4.rew + 0.06, 0.8, 1, 1.6),
  // la mosaïque se défait : les « Non merci. » rentrent, en rafale grave
  ...every("pop-leger", whenTape(14.45), whenTape(13.62), 0.035, 0.12, 0.72),
  // le patient rentre à reculons : la clochette, à l'envers et en accéléré
  cue("porte-carillon", whenTape(5.32), 0.24, 1.6, 0.5),
  // les bulles rentrent dans les bouches (« Non merci. », « Autre chose ? », « Et avec ceci… »)
  cue("pop-leger", whenTape(4.3), 0.32, 0.7),
  cue("pop-leger", whenTape(2.78), 0.3, 0.66),
  cue("pop-leger", whenTape(1.42), 0.28, 0.62),
  // la bande ralentit, s'arrête ; ▶ LECTURE
  cue("bande-ralentit", 19.3, 0.6),
  cue("vhs-lecture", S4.play - 0.02, 0.7),
  // le DROP : l'éclair, l'onde citron
  cue("impact-revelation", S4.drop - 0.02, 0.85),
  cue("sub-boom", S4.drop, 0.8),
];
