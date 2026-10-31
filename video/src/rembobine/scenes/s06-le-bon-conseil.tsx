import { AbsoluteFill } from "remotion";
import { Store } from "lucide-react";
import {
  AdnBackdrop,
  BANNER_CARD,
  BannerCard,
  BannerHead,
  Cursor,
  Douchette,
  MedBox,
  PB,
  JAKARTA,
  MONO,
  SCREEN_UI,
  Sparkle,
  bannerRowCenter,
  bannerHeadHeight,
  clamp01,
  cue,
  keys,
  label,
  lerp,
  prog,
  pulse,
  ressort,
  rgba,
  shake,
  wobble,
  EXIT,
  IN_OUT,
  LINEAR,
  SNAP,
  WHIP,
  type BannerLine,
  type ChipSpec,
  type Cue,
} from "../kit";
import { MENTION_POS, MENTION_TEXT } from "../../presentation/motion/kit/mention";

/* ==========================================================================
 * S6 · LE BON CONSEIL (25,9 → 30,5) — N5 « À chaque boîte scannée, le bon conseil s'affiche, pris dans votre stock. »
 *
 * On est DANS l'écran du comptoir (S5 y plonge) : le papier de l'hélice d'ADN et la vraie bannière (mix-island) — une
 * ligne par boîte scannée, dans l'ordre du scan.
 *   25,9 → 26,4  sous la plongée de S5 : l'écran au repos, « En attente de scan… » (ComptoirStage, partagé avec S5).
 *   « boîte » 26,45   la douchette fond du haut, l'Amoxicilline glisse dessous : laser, bip ; une traînée part de la boîte
 *                     et la ligne ① « Probiotique · pour Amoxicilline 1 g » glisse dans la capsule.
 *   ≈ 26,97           2e boîte, Paracétamol 1 g : bip, ligne ② « Pastilles gorge ».
 *   « bon conseil »   la caméra s'approche, la ligne ① s'illumine (surlignage citron, étincelle).
 *   « pris dans votre stock »  le panneau « Votre stock » entre (rayon stylisé), le viseur se verrouille sur les
 *                     probiotiques, « 12 » défile, la flèche file jusqu'à la ligne ① où « 12 en stock » pope sur « stock ».
 *   29,45 → 30,5  SORTIE : le curseur clique la ligne ①, elle s'enfonce, la grande carte se déplie (relais de S7), puis
 *                 la scène s'efface sur S7.
 * Mention « Illustration · exemples » (stock) en haut à droite, en encre sombre (le fond est clair).
 * ======================================================================== */

const NB = " ";
const AMOXI = `Amoxicilline 1${NB}g`;
const PARA = `Paracétamol 1${NB}g`;

/** Les temps (secondes du film), calés sur mots.json (N5). */
const T = {
  /** « boîte » : la boîte est sous la douchette, le laser part. */
  beam1: 26.46,
  line1: 26.6,
  beam2: 26.96,
  line2: 27.08,
  /** « bon conseil » : la carte 1 s'illumine, juste après l'ouverture des cartes (la petite bannière nomme d'abord les
   * conseils, 30 oct. 2026). */
  bon: 27.62,
  /** « pris » 28,40 : le panneau du stock entre. */
  pris: 28.38,
  lock: 28.62,
  arrow: 28.8,
  /** « stock » 29,22 : la pastille pope au bout de la flèche. */
  stock: 29.2,
  stock2: 29.34,
  cursorIn: 29.42,
  click: 29.95,
  unfold: 30.04,
  fadeOut: 30.34,
  end: 30.5,
} as const;

export const S6_LINES: BannerLine[] = [
  { n: 1, drug: AMOXI, product: "Lactibiane Référence", image: "lactibiane-reference.jpg", challenge: true, chips: [{ kind: "stock", text: "12 en stock", at: T.stock }], at: T.line1 },
  { n: 2, drug: PARA, product: "Phytoxil Toux", image: "phytoxil-toux.jpg", shortDate: true, chips: [{ kind: "stock", text: "8 en stock", at: T.stock2 }], at: T.line2 },
];

/**
 * La capsule dans le cadre (stage 1920 × 1080) : centre VISIBLE (elle grandit des deux côtés à chaque ligne), échelle.
 * BannerHead garde la hauteur finale de sa boîte et grandit vers le bas : on la recentre ici (même ressort que le kit).
 */
const CAP = { x: 1240, y: 500, s: 1.2, w: 920, h: 18 * 2 + 140 * 2 } as const;
const capHeight = (t: number, lines: BannerLine[]) => bannerHeadHeight(t, lines);
const capTop = (t: number, lines: BannerLine[] = S6_LINES) => CAP.y - (capHeight(t, lines) / 2) * CAP.s;
const capTL = (t: number) => ({ x: CAP.x - (CAP.w / 2) * CAP.s, y: capTop(t) });
const inCap = (p: { x: number; y: number }, t: number) => ({ x: capTL(t).x + p.x * CAP.s, y: capTL(t).y + p.y * CAP.s });
/** Le centre de la pastille de stock de la carte 1 (BannerHead : x 154 + ½ pastille, y 120), bannière ouverte. */
const CHIP1 = inCap({ x: 243, y: 120 }, 40);
/** Là où arrive la traînée du scan : le nom du conseil n dans la petite bannière blanche. */
const rowHead = (n: number, t: number) => inCap({ x: 360 + (n - 1) * 230, y: 50 }, t);

/* ------------------------------------------------------------------ l'écran au repos, partagé avec S5 */

/**
 * L'ÉCRAN DU COMPTOIR, cadre 1920 × 1080 : le papier de l'hélice d'ADN et la capsule de la bannière. S5 le dessine dans
 * le moniteur (puis y plonge) ; S6 le reprend en plein cadre. `capsuleAt` : la capsule jaillit à ce temps (S5, quand le
 * logo se range dans l'écran) ; sans valeur, elle est déjà là.
 */
export function ComptoirStage({ t, capsuleAt, lines = S6_LINES, highlight, pressed, dim = 0 }: { t: number; capsuleAt?: number; lines?: BannerLine[]; highlight?: { n: number; at: number }; pressed?: { n: number; at: number }; dim?: number }) {
  const pop = capsuleAt === undefined ? 1 : ressort(t, capsuleAt, { damping: 11, stiffness: 240, mass: 0.6 });
  const shown = capsuleAt === undefined || t >= capsuleAt;
  return (
    <AbsoluteFill style={{ background: SCREEN_UI.paper, overflow: "hidden" }}>
      <AdnBackdrop t={t} tone="paper" width={1800} focus={[0.42, 0.5]} drift={1.2} />
      {/* Un voile qui éclaircit à gauche (la place de la douchette et du stock) et un halo sous la capsule. */}
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 52% 60% at 22% 52%, ${rgba("#FFFFFF", 0.55)} 0%, transparent 70%)` }} />
      <div style={{ position: "absolute", left: CAP.x - 700, top: CAP.y - 330, width: 1400, height: 660, background: `radial-gradient(ellipse at 50% 50%, ${rgba(PB.mint, 0.16)} 0%, transparent 62%)` }} />
      {shown && (
        <BannerHead
          t={t}
          lines={lines}
          highlight={highlight}
          pressed={pressed}
          width={CAP.w}
          x={CAP.x}
          y={capTop(t, lines) + (CAP.h / 2) * CAP.s * Math.max(0, pop) + (1 - Math.max(0, pop)) * (capHeight(t, lines) / 2) * CAP.s}
          scale={CAP.s * Math.max(0, pop)}
          style={{ opacity: clamp01(pop * 3), filter: dim > 0 ? `blur(${dim * 6}px) brightness(${1 - dim * 0.25})` : undefined }}
        />
      )}
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ la caméra */

type Cam = { fx: number; fy: number; z: number; sx: number; sy: number };

function camAt(t: number): Cam {
  const z = keys(t, [
    [26.4, 1],
    [27.14, 1.035, LINEAR],
    [27.46, 1.16, SNAP],
    [28.24, 1.19, LINEAR],
    [28.62, 1.045, SNAP],
    [29.38, 1.065, LINEAR],
    [29.9, 1.14, IN_OUT],
    [30.3, 1.0, SNAP],
  ]);
  let fx = keys(t, [
    [26.4, 960],
    [27.14, 950, LINEAR],
    [27.46, 1088, SNAP],
    [28.24, 1100, LINEAR],
    [28.62, 925, SNAP],
    [29.38, 940, LINEAR],
    [29.9, 1070, IN_OUT],
    [30.3, 960, SNAP],
  ]);
  let fy = keys(t, [
    [26.4, 540],
    [27.14, 532, LINEAR],
    [27.46, 470, SNAP],
    [28.24, 468, LINEAR],
    [28.62, 522, SNAP],
    [29.38, 518, LINEAR],
    [29.9, 480, IN_OUT],
    [30.3, 540, SNAP],
  ]);
  // Le monde couvre toujours le cadre (marge de 20 px pour les secousses).
  const hx = (960 + 20) / z;
  const hy = (540 + 20) / z;
  fx = Math.min(1920 - hx, Math.max(hx, fx));
  fy = Math.min(1080 - hy, Math.max(hy, fy));
  if (z < 1.04) {
    fx = lerp(960, fx, clamp01((z - 1) / 0.04));
    fy = lerp(540, fy, clamp01((z - 1) / 0.04));
  }
  // Vivant mais exact au relais avec S5 (26,4) : la dérive monte après.
  const live = prog(t, 26.4, 0.6, IN_OUT) * (z > 1.02 ? 1 : 0.3) * (1 - prog(t, T.click, 0.3, IN_OUT));
  let sx = wobble(t, 61, 4, 0.5) * live;
  let sy = wobble(t, 62, 3, 0.5) * live;
  for (const [at, amp, frames] of [
    [T.beam1 + 0.02, 5, 9],
    [T.beam2 + 0.02, 4, 8],
    [T.lock, 4, 8],
    [T.click, 5, 9],
  ] as const) {
    const s = shake(t, at, amp, frames);
    sx += s.x;
    sy += s.y;
  }
  return { fx, fy, z, sx, sy };
}

const worldTransform = (c: Cam) => `translate(${960 + c.sx}px, ${540 + c.sy}px) scale(${c.z}) translate(${-c.fx}px, ${-c.fy}px)`;

/* ------------------------------------------------------------------ le scan */

/** La douchette, tenue au-dessus de la place de scan : elle fond du haut à gauche, bipe deux fois, repart. */
const SCAN = { x: 400, y: 392, box: { x: 386, y: 690 } } as const;

function Scanner({ t }: { t: number }) {
  const inK = prog(t, 26.22, 0.3, SNAP);
  const outK = prog(t, 27.38, 0.34, EXIT);
  if (inK <= 0 || outK >= 1) return null;
  // Petit coup de poignet à chaque bip.
  const kick = (b: number) => pulse(t, b - 0.04, 0.05, 0.04, 0.2);
  const x = SCAN.x + lerp(-420, 0, inK) + lerp(0, -380, outK) + wobble(t, 64, 3, 0.9);
  const y = SCAN.y + lerp(-420, 0, inK) + lerp(0, -520, outK) - 10 * (kick(T.beam1) + kick(T.beam2)) + wobble(t, 65, 3, 0.8);
  const angle = lerp(-38, -6, inK) + 6 * (kick(T.beam1) + kick(T.beam2)) + lerp(0, -30, outK);
  return <Douchette t={t} x={x} y={y} angle={angle} size={1.4} beamAt={[T.beam1, T.beam2]} beamDur={0.34} beamLength={118} beamWidth={330} />;
}

/** Une boîte qui glisse sous la douchette, attend le bip, puis tombe (dans le sac, hors cadre). */
function ScanBox({ t, kind, inAt, beam }: { t: number; kind: "amoxicilline" | "paracetamol"; inAt: number; beam: number }) {
  const inK = prog(t, inAt, 0.3, SNAP);
  const outAt = beam + 0.3;
  const outK = prog(t, outAt, 0.32, EXIT);
  if (t < inAt || outK >= 1) return null;
  const settle = ressort(t, inAt + 0.16, { damping: 9, stiffness: 260, mass: 0.5 });
  const x = SCAN.box.x + lerp(-640, 0, inK) + lerp(0, 120, outK);
  const y = SCAN.box.y + lerp(0, 560, outK * outK);
  const rot = lerp(-12, 0, inK) + (1 - clamp01(settle)) * 4 + lerp(0, 22, outK);
  // La lueur du laser sur la face.
  const lit = pulse(t, beam, 0.03, 0.22, 0.12);
  return (
    <>
      <MedBox kind={kind} w={340} x={x} y={y} rotate={rot} t={t} />
      {lit > 0 && <div style={{ position: "absolute", left: x - 215, top: y - 255, width: 430, height: 290, background: `radial-gradient(ellipse at 50% 55%, ${rgba("#FF3B3B", 0.22 * lit)} 0%, transparent 65%)`, pointerEvents: "none" }} />}
    </>
  );
}

/** La traînée qui part de la boîte scannée et file jusqu'à sa ligne dans la capsule (arrivée à `arrive`). */
function Streak({ t, from, to, arrive, dur = 0.16 }: { t: number; from: { x: number; y: number }; to: { x: number; y: number }; arrive: number; dur?: number }) {
  const start = arrive - dur;
  const k = prog(t, start, dur, IN_OUT);
  const tail = prog(t, start + dur * 0.45, dur, IN_OUT);
  if (t < start || tail >= 1) return null;
  // Une courbe qui monte un peu (contrôle au-dessus du milieu).
  const c = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 160 };
  const at = (u: number) => ({ x: (1 - u) * (1 - u) * from.x + 2 * u * (1 - u) * c.x + u * u * to.x, y: (1 - u) * (1 - u) * from.y + 2 * u * (1 - u) * c.y + u * u * to.y });
  const n = 14;
  const pts = Array.from({ length: n + 1 }, (_, i) => at(lerp(tail, k, i / n)));
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const head = at(k);
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}>
      <path d={d} fill="none" stroke={rgba(PB.green, 0.85)} strokeWidth={12} strokeLinecap="round" />
      <path d={d} fill="none" stroke={PB.citron} strokeWidth={6} strokeLinecap="round" />
      {k < 1 && (
        <>
          <circle cx={head.x} cy={head.y} r={16} fill={PB.green} />
          <circle cx={head.x} cy={head.y} r={10} fill={PB.citron} />
        </>
      )}
    </svg>
  );
}

/** L'éclat à l'arrivée de la traînée dans la ligne. */
function Hit({ t, at, x, y }: { t: number; at: number; x: number; y: number }) {
  const k = prog(t, at, 0.38, SNAP);
  if (t < at || k >= 1) return null;
  const r = 20 + 90 * k;
  return <div style={{ position: "absolute", left: x - r, top: y - r, width: 2 * r, height: 2 * r, borderRadius: "50%", border: `${6 * (1 - k)}px solid ${PB.citron}`, opacity: 1 - k, boxShadow: `0 0 24px ${rgba(PB.citron, 0.6 * (1 - k))}` }} />;
}

/* ------------------------------------------------------------------ le stock */

const PANEL = { x: 120, y: 268, w: 470, h: 470 } as const;
/** Le rayon : une étagère stylisée, les probiotiques au milieu de la planche du haut. */
const SHELF_W = 410;
const PROBIO = { x: 150, y: 34, w: 118, h: 92 } as const;

function ShelfArt({ t, lockK }: { t: number; lockK: number }) {
  const planks = [126, 226];
  const boxes: { x: number; w: number; h: number; c: string; row: number }[] = [
    { x: 14, w: 52, h: 70, c: "#7FA8F5", row: 0 },
    { x: 72, w: 64, h: 56, c: "#A894EE", row: 0 },
    { x: 290, w: 50, h: 76, c: "#0796B4", row: 0 },
    { x: 346, w: 50, h: 60, c: "#F2928A", row: 0 },
    { x: 14, w: 70, h: 62, c: "#36C9A8", row: 1 },
    { x: 92, w: 48, h: 80, c: "#8CCB6A", row: 1 },
    { x: 148, w: 76, h: 58, c: "#7FA8F5", row: 1 },
    { x: 232, w: 56, h: 74, c: "#A894EE", row: 1 },
    { x: 296, w: 100, h: 52, c: "#F2928A", row: 1 },
  ];
  return (
    <svg width={SHELF_W} height={240} viewBox={`0 0 ${SHELF_W} 240`} style={{ display: "block", overflow: "visible" }}>
      <rect x={0} y={0} width={SHELF_W} height={232} rx={14} fill="#EEF4F2" />
      {boxes.map((b, i) => {
        const base = planks[b.row];
        return (
          <g key={i} opacity={1 - 0.45 * lockK}>
            <rect x={b.x} y={base - b.h} width={b.w} height={b.h} rx={3} fill="#FFFFFF" stroke="#D6E2DE" strokeWidth={1.5} />
            <rect x={b.x} y={base - b.h} width={b.w} height={b.h * 0.24} rx={3} fill={b.c} opacity={0.85} />
          </g>
        );
      })}
      {/* Les probiotiques : 3 piles de 4 (12), bandeau vert. */}
      {Array.from({ length: 12 }, (_, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const bx = PROBIO.x + 6 + col * 37;
        const by = planks[0] - 23 - row * 23;
        const bob = lockK > 0 ? pulse(t, T.lock + 0.03 * i, 0.06, 0.02, 0.16) * 4 : 0;
        return (
          <g key={`p${i}`} transform={`translate(0 ${-bob})`}>
            <rect x={bx} y={by} width={34} height={22} rx={2.5} fill="#FFFFFF" stroke="#B9D8CE" strokeWidth={1.5} />
            <rect x={bx} y={by} width={34} height={7} rx={2} fill="#109C7C" />
          </g>
        );
      })}
      {planks.map((y, i) => (
        <g key={i}>
          <rect x={0} y={y} width={SHELF_W} height={9} fill="#FFFFFF" />
          <rect x={0} y={y + 9} width={SHELF_W} height={4} fill="#D3DEDA" />
        </g>
      ))}
    </svg>
  );
}

/** Le viseur qui se verrouille sur les probiotiques (coins qui se resserrent). */
function Reticle({ t, x, y, w, h }: { t: number; x: number; y: number; w: number; h: number }) {
  const k = prog(t, T.lock - 0.12, 0.24, SNAP);
  if (t < T.lock - 0.12) return null;
  const grow = lerp(1.7, 1, k) + 0.03 * Math.sin((t - T.lock) * 8) * clamp01(t - T.lock);
  const W = w * grow;
  const H = h * grow;
  const L = 22;
  const flash = pulse(t, T.lock, 0.03, 0.05, 0.25);
  const corner = (sx: number, sy: number) => `M${x + (sx * W) / 2 - sx * 0},${y + (sy * H) / 2 - sy * L} L${x + (sx * W) / 2},${y + (sy * H) / 2} L${x + (sx * W) / 2 - sx * L},${y + (sy * H) / 2}`;
  return (
    <svg width={1} height={1} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity: clamp01(k * 2) }}>
      {flash > 0 && <rect x={x - W / 2} y={y - H / 2} width={W} height={H} rx={10} fill={rgba(PB.citron, 0.45 * flash)} />}
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sy], i) => (
        <g key={i}>
          <path d={corner(sx, sy)} fill="none" stroke={PB.green} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
          <path d={corner(sx, sy)} fill="none" stroke={PB.citron} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ))}
    </svg>
  );
}

/** Le grand chiffre qui défile de 0 à 12 (rouleau), posé sur « stock ». */
function RollNumber({ t, from, to, at, dur, size }: { t: number; from: number; to: number; at: number; dur: number; size: number }) {
  const k = prog(t, at, dur, (x) => 1 - Math.pow(1 - x, 2.4));
  const v = lerp(from, to, k);
  const n = Math.floor(v);
  // Chaque chiffre tient, puis bascule vite au suivant (images nettes, rouleau qui claque).
  const frac = IN_OUT(clamp01((v - n - 0.45) / 0.55));
  const H = size * 1.12;
  const land = ressort(t, at + dur, { damping: 8, stiffness: 320, mass: 0.5 });
  const sq = t >= at + dur ? 1 + 0.12 * (1 - clamp01(land)) : 1;
  const cell = (val: number, dy: number, o: number) => (
    <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: H, textAlign: "right", transform: `translateY(${dy}px)`, opacity: o }}>{val}</div>
  );
  return (
    <div style={{ position: "relative", width: size * 1.3, height: H, overflow: "hidden", fontFamily: MONO, fontWeight: 700, fontSize: size, lineHeight: `${H}px`, color: PB.green, fontVariantNumeric: "tabular-nums", transform: `scale(${sq})`, transformOrigin: "100% 60%" }}>
      {n >= to ? cell(to, 0, 1) : (
        <>
          {cell(n, -frac * H, 1 - frac * 0.6)}
          {cell(n + 1, (1 - frac) * H, 0.4 + frac * 0.6)}
        </>
      )}
    </div>
  );
}

function StockPanel({ t }: { t: number }) {
  const inK = prog(t, T.pris, 0.34, SNAP);
  const out = prog(t, T.unfold - 0.04, 0.24, EXIT);
  if (t < T.pris || out >= 1) return null;
  const lockK = prog(t, T.lock, 0.2, SNAP);
  const shelfTop = PANEL.y + 84;
  const shelfLeft = PANEL.x + (PANEL.w - SHELF_W) / 2;
  const tilt = lerp(-8, 0, inK);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, opacity: 1 - out, transform: `translateX(${lerp(-560, 0, inK) - 200 * out}px)` }}>
      <div
        style={{
          position: "absolute",
          left: PANEL.x,
          top: PANEL.y,
          width: PANEL.w,
          height: PANEL.h,
          borderRadius: 34,
          background: "#FFFFFF",
          boxShadow: `0 30px 70px -30px ${rgba(PB.green, 0.55)}, 0 0 0 2px ${rgba(PB.green, 0.08)}`,
          transform: `rotate(${tilt}deg) translateY(${wobble(t, 66, 3, 0.7)}px)`,
          transformOrigin: "0% 100%",
        }}
      >
        <div style={{ position: "absolute", left: 30, top: 28, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ display: "inline-flex", width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", background: PB.green }}>
            <Store size={24} color={PB.citron} strokeWidth={2.4} />
          </span>
          <span style={{ ...label(21), color: PB.green }}>Votre stock</span>
        </div>
        <div style={{ position: "absolute", left: (PANEL.w - SHELF_W) / 2, top: 84 }}>
          <ShelfArt t={t} lockK={lockK} />
        </div>
        <div style={{ position: "absolute", left: 30, right: 30, top: 344, height: 100, display: "flex", alignItems: "center", gap: 16 }}>
          <RollNumber t={t} from={0} to={12} at={T.lock} dur={T.stock - T.lock - 0.02} size={92} />
          <div style={{ fontFamily: JAKARTA, lineHeight: 1.08 }}>
            <div style={{ fontWeight: 800, fontSize: 34, color: PB.green, letterSpacing: "-0.02em" }}>en stock</div>
            <div style={{ fontWeight: 700, fontSize: 24, color: PB.inkSoft }}>Probiotique</div>
          </div>
        </div>
      </div>
      <Reticle t={t} x={shelfLeft + PROBIO.x + PROBIO.w / 2} y={shelfTop + PROBIO.y + PROBIO.h / 2 - 4} w={PROBIO.w + 22} h={PROBIO.h + 26} />
    </div>
  );
}

/** La flèche qui part du rayon et file jusqu'à la pastille « 12 en stock » de la ligne 1. */
function StockArrow({ t }: { t: number }) {
  const draw = prog(t, T.arrow, T.stock - T.arrow - 0.02, IN_OUT);
  const out = prog(t, T.click - 0.1, 0.25, EXIT);
  if (t < T.arrow || out >= 1) return null;
  const a = { x: PANEL.x + PANEL.w - 40, y: PANEL.y + 150 };
  const b = { x: CHIP1.x - 116, y: CHIP1.y + 8 };
  const c1 = { x: a.x + 150, y: a.y - 10 };
  const c2 = { x: b.x - 120, y: b.y + 40 };
  const d = `M${a.x},${a.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`;
  const len = 520;
  const head = draw >= 0.98;
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible", opacity: 1 - out, pointerEvents: "none" }}>
      <path d={d} fill="none" stroke={PB.green} strokeWidth={12} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - draw)} />
      <path d={d} fill="none" stroke={PB.citron} strokeWidth={5} strokeLinecap="round" strokeDasharray={`14 16`} strokeDashoffset={-t * 90} style={{ clipPath: "none" }} opacity={draw >= 1 ? 1 : 0} />
      <circle cx={a.x} cy={a.y} r={11 * clamp01(draw * 6)} fill={PB.green} />
      {head && (
        <g transform={`translate(${b.x} ${b.y}) rotate(-12) scale(${clamp01(ressort(t, T.stock - 0.04, { damping: 9, stiffness: 300, mass: 0.5 }))})`}>
          <path d="M-22,-16 L6,0 L-22,16 Z" fill={PB.green} stroke={PB.green} strokeWidth={6} strokeLinejoin="round" />
        </g>
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ la sortie : clic, grande carte */

/**
 * La grande carte, telle que S7 la reprend : mêmes pastilles (elles réservent leurs rangées avant d'arriver), mêmes
 * questions, même pose (960, 470, × 0,98) au relais. S7 fait arriver les questions et ses pastilles ; ici seul le stock
 * apparaît (déjà vu dans la capsule).
 */
const NNB = "\u202F";
const S7_CHIPS: ChipSpec[] = [
  { kind: "stock", text: "12 en stock", at: T.unfold + 0.18 },
  { kind: "marge", text: `Marge +4,20${NNB}€`, at: 33.25 },
  { kind: "challenge", text: `Challenge · +1${NNB}€ par boîte pour l'équipe`, at: 34.11 },
  { kind: "date", text: "Date courte", at: 34.95 },
];
const S7_QUESTIONS = [
  { text: `Avez-vous déjà eu des troubles digestifs avec un antibiotique${NB}?`, at: 30.44 },
  { text: `Prenez-vous déjà un probiotique${NB}?`, at: 30.86 },
];
const CARD_TO = { x: 960, y: 470, s: 0.98 } as const;

function cardPose(t: number) {
  const k = prog(t, T.unfold, 0.3, SNAP);
  const from = inCap({ x: 460, y: 18 + 70 }, t);
  return { x: lerp(from.x, CARD_TO.x, k), y: lerp(from.y, CARD_TO.y, k), s: lerp(0.62, CARD_TO.s, k) };
}
const onCard = (p: { x: number; y: number }, c: { x: number; y: number; s: number }) => ({ x: c.x + (p.x - BANNER_CARD.W / 2) * c.s, y: c.y + (p.y - BANNER_CARD.H / 2) * c.s });

/** Le curseur entre par le bas à droite, file sur la ligne 1, clique ; puis il glisse vers l'onglet Questions (S7 le reprend là). */
function TheCursor({ t }: { t: number }) {
  if (t < T.cursorIn) return null;
  const row = bannerRowCenter(S6_LINES, 1, t, CAP.w);
  const target = inCap({ x: row.x - 120, y: row.y + 10 }, t);
  const k = prog(t, T.cursorIn, T.click - T.cursorIn - 0.08, WHIP);
  let x = lerp(1640, target.x, k) + Math.sin(k * Math.PI) * 40;
  let y = lerp(900, target.y, k) - Math.sin(k * Math.PI) * 30;
  // Après le clic : vers l'onglet Questions de la carte qui se déplie.
  const q = onCard(BANNER_CARD.tab("questions", S7_CHIPS), cardPose(t));
  const g = prog(t, T.click + 0.12, 0.26, SNAP);
  x = lerp(x, q.x + 6, g);
  y = lerp(y, q.y + 6, g);
  const o = clamp01((t - T.cursorIn) / 0.08);
  return <Cursor t={t} x={x} y={y} clickAt={T.click} opacity={o} size={1.15} />;
}

/** La grande carte qui se déplie depuis la ligne cliquée (relais de S7). */
function Unfold({ t }: { t: number }) {
  if (t < T.unfold - 0.02) return null;
  const c = cardPose(t);
  return <BannerCard t={t} at={T.unfold} product="Lactibiane Référence" image="lactibiane-reference.jpg" for={AMOXI} tab="questions" questions={S7_QUESTIONS} chips={S7_CHIPS} x={c.x} y={c.y} scale={c.s} />;
}

/* ------------------------------------------------------------------ la scène */

function Mention({ t }: { t: number }) {
  const o = Math.min(clamp01((t - 26.42) / 0.14), 1 - prog(t, T.fadeOut, T.end - T.fadeOut, LINEAR));
  if (o <= 0) return null;
  return <div style={{ position: "absolute", ...MENTION_POS, fontFamily: JAKARTA, fontWeight: 600, fontSize: 22, color: rgba(PB.green, 0.62), opacity: o, letterSpacing: "0.01em", pointerEvents: "none" }}>{MENTION_TEXT}</div>;
}

export function Scene({ t }: { t: number }) {
  const c = camAt(t);
  const dim = prog(t, T.unfold, 0.3, SNAP);
  const fade = prog(t, T.fadeOut, T.end - T.fadeOut, LINEAR);
  const scanFrom1 = { x: SCAN.box.x + 40, y: SCAN.box.y - 130 };
  const sp = inCap({ x: 470, y: 26 }, t);
  return (
    <AbsoluteFill style={{ background: SCREEN_UI.paper, overflow: "hidden", opacity: 1 - fade }}>
      <AbsoluteFill style={{ transformOrigin: "0 0", transform: worldTransform(c) }}>
        <ComptoirStage t={t} highlight={{ n: 1, at: T.bon }} pressed={{ n: 1, at: T.click }} dim={dim} />
        <ScanBox t={t} kind="amoxicilline" inAt={26.18} beam={T.beam1} />
        <ScanBox t={t} kind="paracetamol" inAt={26.7} beam={T.beam2} />
        <Scanner t={t} />
        <Streak t={t} from={scanFrom1} to={rowHead(1, T.line1)} arrive={T.line1} />
        <Streak t={t} from={scanFrom1} to={rowHead(2, T.line2)} arrive={T.line2} />
        <Hit t={t} at={T.line1} x={rowHead(1, t).x} y={rowHead(1, t).y} />
        <Hit t={t} at={T.line2} x={rowHead(2, t).x} y={rowHead(2, t).y} />
        <Sparkle t={t} at={T.bon + 0.08} x={sp.x} y={sp.y} size={70} color={PB.citron} />
        <StockPanel t={t} />
        <StockArrow t={t} />
        <Sparkle t={t} at={T.stock + 0.04} x={CHIP1.x + 70} y={CHIP1.y - 24} size={56} color={PB.citron} />
        {dim > 0 && <div style={{ position: "absolute", inset: 0, background: rgba(PB.green, 0.28 * dim) }} />}
        <Unfold t={t} />
        <TheCursor t={t} />
      </AbsoluteFill>
      <Mention t={t} />
    </AbsoluteFill>
  );
}

export const cues: Cue[] = [
  cue("scan-laser", T.beam1 - 0.02, 0.5),
  cue("scanner-bip", T.beam1 + 0.04, 0.6),
  cue("ui-pop", T.line1, 0.5),
  cue("scanner-bip", T.beam2 + 0.04, 0.55, 1.06),
  cue("pop-leger", T.line2, 0.3, 1.08),
  cue("scintillement", T.bon, 0.45),
  cue("swoosh", 27.38, 0.25),
  cue("whoosh-pb", T.pris - 0.04, 0.3),
  cue("verrou-hud", T.lock, 0.55),
  cue("laser-ecrit", T.arrow, 0.25, 1.2, 0.4),
  cue("ui-pop", T.stock, 0.5),
  cue("pop-leger", T.stock2, 0.35),
  cue("ui-clic", T.click, 0.6),
  cue("carte-depliee", T.unfold, 0.5),
];
