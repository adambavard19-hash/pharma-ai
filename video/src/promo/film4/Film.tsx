import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { ArrowUp, Bell, CalendarDays, CalendarCheck, Check, Clock, Heart, MousePointer2, QrCode, Star, Trash2, X } from "lucide-react";
import {
  Bokeh,
  Confetti,
  Cues,
  DUPES,
  Douchette,
  DupeTile,
  Dust,
  Flash,
  JAKARTA,
  LightLeak,
  MedBox,
  Notification,
  Ordonnance,
  Patient,
  PBLogo,
  PB,
  Pharmacienne,
  Pharmacy,
  Phone,
  Ring,
  Shatter,
  Sparkle,
  clamp01,
  cue,
  keys,
  lerp,
  rgba,
  type Cue,
  type DupeKind,
} from "../../rembobine/kit";
import { Grain, Vignette } from "../../presentation/motion/kit/grain";
import { EXIT, IN_OUT, SNAP, WHIP, prog, ressort } from "../../presentation/motion/kit/ease";
import { Abs, Card, Cross, MINT, PASSANTS, Rise, Shop, pop } from "../../lettre/Lettre";
import { FPS, M, linesOf, type Word } from "../kit";
import { B, BUTTON, FIN, LAST, SWEEP, TOTAL, VAT, end, w } from "./temps";

/**
 * VIDÉO DE PRÉSENTATION N° 4 — « SANS / AVEC » en écran partagé (fondateur, 6 nov. 2026).
 * Le cadre est coupé en deux par une ligne lumineuse : à gauche « Sans PharmaBoost » (gris, lent), à droite « Avec
 * PharmaBoost » (couleurs, énergie). Les deux moitiés avancent ensemble, en miroir, sur les mêmes mots :
 *   D1 la même pharmacie, la même ordonnance (elle se dédouble), deux comptoirs ;
 *   D2 les deux boîtes scannées au même bip — à gauche rien, à droite la bannière : le conseil, puis la routine ;
 *   D3 le rayon — à gauche la date courte prend la poussière, le challenge part à la poubelle ; à droite ils montent sur
 *      la bannière avec le laboratoire préféré du titulaire ;
 *   D4 à gauche le patient repart les mains vides ; à droite son bilan par QR code, le rappel, l'offre ;
 *   D5 la fin du mois : une ligne plate / trois courbes qui montent ; l'équipe respire ;
 *   D6 la gauche se fissure et tombe, la droite envahit l'écran, puis la marque.
 * Aucune marque de produit, jamais de marge sur la bannière.
 */

type Side = "L" | "R";
const tx = (size: number, weight = 700, color: string = MINT.ink): CSSProperties => ({ fontFamily: JAKARTA, fontWeight: weight, fontSize: size, color, letterSpacing: size > 24 ? "-0.02em" : 0 });
const GREY = { ink: "#5E6766", soft: "#8D9695", line: "#C9CFCE", card: "#F1F3F3", bg: "#DADFDE" };
const ROUTINE: { k: DupeKind; gest: string; at: number }[] = [
  { k: "iso-hydratant", gest: "Hydrater", at: w("D2", "routine") + 0.05 },
  { k: "iso-levres", gest: "Lèvres", at: w("D2", "routine") + 0.3 },
  { k: "iso-solaire", gest: "Soleil", at: w("D2", "complète") },
];

/** La fenêtre de chaque moitié (coordonnées de la moitié : 960 × 1080). */
const WIN = { x: 28, y: 128, w: 904, h: 780 };
const SCAN = w("D2", "scannée…") - 0.05;

// =====================================================================================================================
// Les briques
// =====================================================================================================================

/** Une moitié du cadre : coupée à la ligne `div`, son repère (960 de large) décalé de `shift`. */
function Half({ side, div, shift = 0, children, style }: { side: Side; div: number; shift?: number; children: ReactNode; style?: CSSProperties }) {
  const L = side === "L";
  const left = L ? 0 : div;
  const width = L ? div : 1920 - div;
  if (width <= 0.5) return null;
  return (
    <div style={{ position: "absolute", top: 0, left, width, height: 1080, overflow: "hidden", ...style }}>
      <div style={{ position: "absolute", top: 0, left: (L ? 0 : 960 - div) + shift, width: 960, height: 1080 }}>{children}</div>
    </div>
  );
}

/** Un tableau d'une moitié : à gauche il descend lentement, à droite il monte d'un coup (miroir). */
function Beat({ t, side, from, to, children }: { t: number; side: Side; from: number; to: number; children: ReactNode }) {
  if (t < from - 0.02 || t > to + 0.5) return null;
  const L = side === "L";
  const k = from <= 0 ? 1 : prog(t, from, L ? 0.6 : 0.38, L ? IN_OUT : SNAP);
  const o = prog(t, to, 0.4, IN_OUT);
  const dy = (L ? -60 : 60) * (1 - k) + (L ? 40 : -40) * o;
  return <div style={{ position: "absolute", inset: 0, opacity: Math.min(1, k * 1.5) * (1 - o), transform: `translateY(${dy}px) scale(${L ? 1 : 1.05 - 0.05 * k})` }}>{children}</div>;
}

type Cam = { s: number; fx: number; fy: number };
/** Le comptoir dessiné (1920 × 1080) filmé dans la fenêtre : `cam` = zoom et point visé. */
function Stage({ t, side, cam, blur = 0, children, door = 0, chime, douchette = true }: { t: number; side: Side; cam: Cam; blur?: number; children?: ReactNode; door?: number; chime?: number; douchette?: boolean }) {
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "0 0", transform: `translate(${WIN.w / 2 - cam.fx * cam.s}px, ${WIN.h / 2 - cam.fy * cam.s}px) scale(${cam.s})`, filter: blur > 0.2 ? `blur(${blur}px)` : undefined }}>
      <Pharmacy t={t} mood={side === "L" ? "act1" : "pb"} doorOpen={door} chimeAt={chime} douchette={douchette}>
        {children}
      </Pharmacy>
    </div>
  );
}
/** Un point du comptoir (monde) → la fenêtre. */
const toWin = (cam: Cam, x: number, y: number) => ({ x: WIN.w / 2 + (x - cam.fx) * cam.s, y: WIN.h / 2 + (y - cam.fy) * cam.s });

function Badge({ children, tone = "pb", style }: { children: ReactNode; tone?: "pb" | "grey"; style?: CSSProperties }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "10px 20px", borderRadius: 999, background: tone === "pb" ? "#FFFFFF" : GREY.card, boxShadow: tone === "pb" ? `0 16px 34px -18px rgba(15,43,38,.5), 0 0 0 2px ${rgba(MINT.green, 0.25)}` : `0 0 0 2px ${GREY.line}`, ...tx(26, 800, tone === "pb" ? MINT.ink : GREY.ink), whiteSpace: "nowrap", ...style }}>
      {children}
    </span>
  );
}

function Example({ dark = false }: { dark?: boolean }) {
  return <span style={{ ...tx(15, 700, dark ? GREY.ink : MINT.soft), padding: "4px 10px", borderRadius: 99, background: dark ? "#E3E7E6" : "#EEF3F1" }}>Exemple</span>;
}

/** Une puce de la bannière (date courte, challenge, laboratoire préféré). */
function Pastille({ kind, text, k }: { kind: "date" | "challenge" | "labo"; text: string; k: number }) {
  const look = kind === "date" ? { bg: "#FFE4E0", fg: "#C23A2B" } : kind === "challenge" ? { bg: "#EEFFC2", fg: "#3F5A00" } : { bg: "#FFF1C9", fg: "#8A5A00" };
  const Icon = kind === "date" ? Clock : kind === "challenge" ? Star : Heart;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "9px 16px", borderRadius: 999, background: look.bg, boxShadow: `inset 0 0 0 2px ${rgba(look.fg, 0.16)}, 0 0 ${26 * Math.max(0, 1.2 - k)}px ${rgba(look.fg, 0.5 * clamp01(1.2 - k))}`, ...tx(22, 800, look.fg), whiteSpace: "nowrap", transform: `scale(${k})` }}>
      <Icon size={22} fill={kind === "date" ? "none" : look.fg} strokeWidth={kind === "date" ? 2.6 : 0} color={look.fg} /> {text}
    </span>
  );
}

function BannerHead({ sub = "Isotrétinoïne 20 mg" }: { sub?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Cross size={24} />
      <span style={{ ...tx(16, 800, MINT.deep), letterSpacing: "0.16em" }}>PHARMABOOST</span>
      <span style={{ marginLeft: "auto", padding: "5px 12px", borderRadius: 99, background: "#EEF3F1", ...tx(16, 700, MINT.soft) }}>{sub}</span>
    </div>
  );
}

/** Une ligne de la bannière pas encore remplie : un reflet passe (l'analyse est en cours). */
function Skeleton({ t, h, mt = 18 }: { t: number; h: number; mt?: number }) {
  const x = ((t * 0.9) % 1) * 160 - 30;
  return (
    <div style={{ position: "relative", marginTop: mt, height: h, borderRadius: 18, background: "#F1F5F3", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 18, top: h / 2 - 10, width: "38%", height: 20, borderRadius: 10, background: "#E2EAE6" }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, left: `${x}%`, width: "30%", background: "linear-gradient(100deg, transparent, rgba(255,255,255,.85), transparent)" }} />
    </div>
  );
}

/** Un QR code dessiné (illustration, jamais un vrai lien). */
function QrArt({ size, light = false }: { size: number; light?: boolean }) {
  const n = 25;
  const cell = size / n;
  const ink = light ? "#FFFFFF" : MINT.deep;
  const finder = (fx: number, fy: number) => (
    <g key={`${fx}-${fy}`}>
      <rect x={fx * cell} y={fy * cell} width={7 * cell} height={7 * cell} fill={ink} />
      <rect x={(fx + 1) * cell} y={(fy + 1) * cell} width={5 * cell} height={5 * cell} fill={light ? "#0B1714" : "#FFFFFF"} />
      <rect x={(fx + 2) * cell} y={(fy + 2) * cell} width={3 * cell} height={3 * cell} fill={ink} />
    </g>
  );
  const inF = (x: number, y: number) => (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);
  const cells: ReactNode[] = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (inF(x, y)) continue;
      const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      if (v - Math.floor(v) > 0.52) cells.push(<rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={cell + 0.4} height={cell + 0.4} fill={ink} />);
    }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      {cells}
      {finder(0, 0)}
      {finder(n - 7, 0)}
      {finder(0, n - 7)}
    </svg>
  );
}

// =====================================================================================================================
// 1. Le comptoir (D1–D2) : la même ordonnance, le même bip
// =====================================================================================================================
const ORD_LAND = w("D1", "ordonnance") + 0.85;
const BOX_AT = w("D1", "deux") - 0.1;
const ZOOM_END = w("D2", "boîte") + 0.2;
function comptoirCam(t: number, side: Side): Cam {
  const L = side === "L";
  const s = keys(t, [
    [0, 0.72],
    [w("D1", "deux") - 0.1, 0.72],
    [w("D1", "deux") + 0.7, 0.78],
    [VAT.D2 - 0.15, 0.8, IN_OUT],
    [ZOOM_END, 1.85, IN_OUT],
    ...(L
      ? ([
          [w("D2", "tout.") + 0.05, 1.85],
          [w("D2", "tout.") + 1.2, 1.5, IN_OUT],
          [B.rayon + 0.4, 1.38, (x: number) => x],
        ] as [number, number, (x: number) => number][])
      : ([
          [w("D2", "pharmaboost") - 0.2, 1.85],
          [w("D2", "pharmaboost") + 0.5, 1.45, SNAP],
          [B.rayon + 0.4, 1.3, (x: number) => x],
        ] as [number, number, (x: number) => number][])),
  ]);
  const zk = prog(t, VAT.D2 - 0.15, ZOOM_END - VAT.D2 + 0.15, IN_OUT);
  return { s, fx: lerp(1000, 1012, zk), fy: lerp(540, 505, zk) };
}

function Comptoir({ t, side }: { t: number; side: Side }) {
  const L = side === "L";
  const cam = comptoirCam(t, side);
  const pbAt = w("D2", "pharmaboost") - 0.12;
  const dy = keys(t, [
    [VAT.D2 - 0.1, 300],
    [SCAN - 0.42, 300],
    [SCAN - 0.06, 428, SNAP],
    [SCAN + 0.45, 428],
    [SCAN + 0.95, 230, IN_OUT],
  ]);
  const boxK = pop(t, BOX_AT);
  const bannerIn = L ? 0 : prog(t, pbAt, 0.45, SNAP);
  return (
    <>
      <Stage t={t} side={side} cam={cam} blur={8 * bannerIn} douchette={t < VAT.D2 - 0.25}>
        <Pharmacienne t={t} mood={L ? "act1" : "pb"} expression={L ? (t > w("D2", "tout.") ? "lasse" : "neutre") : t > pbAt ? "sourire" : "neutre"} />
        {t >= ORD_LAND && <Ordonnance lines={[{ name: "Isotrétinoïne 20 mg", dose: "1 capsule par jour, au repas" }]} x={1105} y={561} w={150} flat={1} rotate={-8} mood={L ? "act1" : "pb"} />}
        {boxK > 0 && <MedBox kind="isotretinoine" x={1012} y={574 - (1 - Math.min(1, boxK)) * 60} w={130} mood={L ? "act1" : "pb"} />}
        <Patient t={t} mood={L ? "act1" : "pb"} peek={false} expression={!L && t > pbAt + 0.4 ? "sourire" : "neutre"} />
        {t > VAT.D2 - 0.2 && t < SCAN + 1.1 && <Douchette t={t} x={1012} y={dy} size={0.55} beamAt={SCAN} beamDur={0.34} beamLength={(528 - dy) / 0.55} beamWidth={175} mood={L ? "act1" : "pb"} />}
      </Stage>
      {/* Le voile froid de la gauche, la lumière de la droite */}
      {L ? <div style={{ position: "absolute", inset: 0, background: `rgba(40,52,58,${0.12 * prog(t, SCAN + 0.3, 1.2)})` }} /> : <div style={{ position: "absolute", inset: 0, background: `rgba(255,255,255,${0.35 * bannerIn})` }} />}
      {/* Le bip : un éclair vert sur la boîte */}
      {Math.abs(t - SCAN - 0.15) < 0.3 && <Ring t={t} at={SCAN + 0.05} x={toWin(cam, 1012, 520).x} y={toWin(cam, 1012, 520).y} max={260} color={L ? "#9AA3A2" : "#2BD67B"} />}
      {L ? <ApresScanGauche t={t} /> : <ApresScanDroite t={t} pbAt={pbAt} bannerIn={bannerIn} />}
    </>
  );
}

function ApresScanGauche({ t }: { t: number }) {
  const card = prog(t, SCAN + 0.35, 0.5, IN_OUT);
  const tout = w("D2", "c'est") - 0.1;
  const k = prog(t, tout, 0.6, IN_OUT);
  const blink = Math.floor(t * 2) % 2 === 0;
  if (card <= 0) return null;
  return (
    <>
      <Abs x={WIN.w / 2} y={655} style={{ opacity: card, transform: `translate(-50%, ${-50 + (1 - card) * 30}%)` }}>
        <div style={{ width: 600, padding: "18px 24px", borderRadius: 22, background: GREY.card, boxShadow: `0 0 0 2px ${GREY.line}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, ...tx(24, 800, GREY.ink) }}>
            <Check size={24} color={GREY.soft} strokeWidth={3} /> Isotrétinoïne 20 mg · 1 boîte
          </div>
          <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 14, border: `2px dashed ${GREY.line}`, ...tx(22, 700, GREY.soft), opacity: k }}>
            Conseil associé : <span style={{ color: GREY.ink }}>aucun</span>
            <span style={{ display: "inline-block", width: 3, height: 22, marginLeft: 6, verticalAlign: "middle", background: GREY.soft, opacity: blink ? 1 : 0 }} />
          </div>
        </div>
      </Abs>
      <Abs x={WIN.w / 2} y={120} style={{ opacity: k }}>
        <span style={{ display: "inline-block", padding: "10px 30px", borderRadius: 999, background: "rgba(236,239,239,.94)", boxShadow: `0 0 0 2px ${GREY.line}`, ...tx(50, 800, GREY.ink), fontStyle: "italic", whiteSpace: "nowrap" }}>… et c&apos;est tout.</span>
      </Abs>
    </>
  );
}

function ApresScanDroite({ t, pbAt, bannerIn }: { t: number; pbAt: number; bannerIn: number }) {
  // Entre le bip et « PharmaBoost » : l'ordonnance s'analyse, vite.
  const a = SCAN + 0.25;
  const loadK = prog(t, a, 0.3) * (1 - prog(t, pbAt - 0.05, 0.25));
  const p = prog(t, a, pbAt - a, (x) => 1 - Math.pow(1 - x, 2.2));
  const conseil = pop(t, w("D2", "crème") - 0.12);
  const rt = prog(t, w("D2", "routine") - 0.15, 0.3);
  const done = pop(t, w("D2", "complète") + 0.3);
  return (
    <>
      {loadK > 0 && (
        <Abs x={WIN.w / 2} y={660} style={{ opacity: loadK }}>
          <Card style={{ width: 600, padding: "18px 24px", borderRadius: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Cross size={26} />
              <span style={tx(24, 800)}>Analyse de l&apos;ordonnance…</span>
              <span style={{ marginLeft: "auto", ...tx(24, 800, MINT.green), fontVariantNumeric: "tabular-nums" }}>{Math.round(p * 100)} %</span>
            </div>
            <div style={{ marginTop: 12, height: 12, borderRadius: 99, background: "#E3ECE8", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${p * 100}%`, borderRadius: 99, background: `linear-gradient(90deg, ${MINT.green}, #2BD67B)` }} />
            </div>
          </Card>
        </Abs>
      )}
      {bannerIn > 0 && (
        <Abs x={WIN.w / 2} y={392} style={{ opacity: Math.min(1, bannerIn * 1.6), transform: `translate(-50%, -50%) translateY(${(1 - bannerIn) * 80}px) scale(${0.86 + 0.14 * bannerIn})` }}>
          <Card style={{ width: 800, padding: "24px 28px 26px", borderRadius: 30, boxShadow: `0 0 0 4px ${rgba(MINT.green, 0.4)}, 0 50px 90px -40px rgba(15,43,38,.6)` }}>
            <BannerHead />
            {conseil <= 0 && <Skeleton t={t} h={132} />}
            <div style={{ display: conseil > 0 ? "flex" : "none", marginTop: 18, alignItems: "center", gap: 20, padding: "16px 18px", borderRadius: 22, background: "#F2FAF6", transform: `scale(${0.8 + 0.2 * Math.min(1, conseil)})`, opacity: Math.min(1, conseil * 2), transformOrigin: "20% 50%" }}>
              <DupeTile kind="iso-nettoyant" size={100} radius={22} />
              <div>
                <div style={{ ...tx(15, 800, MINT.green), letterSpacing: "0.12em" }}>LE CONSEIL</div>
                <div style={{ ...tx(32, 800), marginTop: 2 }}>{DUPES["iso-nettoyant"].name}</div>
                <div style={{ marginTop: 6, display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 12px", borderRadius: 99, background: "#E3F6EC", ...tx(16, 700, "#0E7A4E") }}>
                  <span style={{ width: 9, height: 9, borderRadius: 99, background: "#14A374" }} /> En stock
                </div>
              </div>
            </div>
            <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 10, ...tx(15, 800, MINT.green), letterSpacing: "0.12em", opacity: rt }}>
              + LA ROUTINE COMPLÈTE
              <span style={{ marginLeft: "auto", display: "inline-flex", width: 30, height: 30, borderRadius: 99, background: MINT.green, alignItems: "center", justifyContent: "center", transform: `scale(${Math.min(1.15, done)})` }}>
                <Check size={18} color="#FFFFFF" strokeWidth={3.4} />
              </span>
            </div>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
              {ROUTINE.map((r) => {
                const k = pop(t, r.at - 0.1);
                if (k <= 0) return <Skeleton key={r.k} t={t} h={78} mt={0} />;
                return (
                  <div key={r.k} style={{ display: "flex", alignItems: "center", gap: 16, padding: "8px 12px", borderRadius: 16, background: "#FAFCFB", boxShadow: "0 0 0 1px #E4ECE9", opacity: Math.min(1, k * 2), transform: `translateX(${(1 - Math.min(1, k)) * 60}px)` }}>
                    <DupeTile kind={r.k} size={62} radius={14} />
                    <span style={tx(25, 800)}>{DUPES[r.k].name}</span>
                    <span style={{ marginLeft: "auto", ...tx(17, 700, MINT.soft) }}>{r.gest}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </Abs>
      )}
    </>
  );
}

// =====================================================================================================================
// 2. Le rayon (D3) : la date courte, le challenge, le laboratoire préféré
// =====================================================================================================================
const SHELF = { x: 50, w: 590, top: 352, rows: [478, 608, 738] };
const BOXES: { row: number; x: number; w: number; h: number; c: string }[] = (() => {
  const cols = ["#9CC7F0", "#F6D98A", "#8EEBD3", "#F4B59A", "#C9B8F0", "#7FC8B8", "#F0BAC6"];
  const out: { row: number; x: number; w: number; h: number; c: string }[] = [];
  for (let r = 0; r < 3; r++) {
    let x = SHELF.x + 18;
    let i = 0;
    while (x < SHELF.x + SHELF.w - 80) {
      const bw = 58 + ((i * 37 + r * 19) % 34);
      const bh = 74 + ((i * 23 + r * 31) % 36);
      if (!(r === 1 && x > 380 && x < 520)) out.push({ row: r, x, w: bw, h: bh, c: cols[(i + r * 2) % cols.length] });
      x += bw + 10;
      i++;
    }
  }
  return out;
})();
const DATE_BOX = { x: 450, y: SHELF.rows[1], w: 112, h: 96 };
const TICKET = { x: 210, y: 372 };
const BIN = { x: 780, y: 742 };

function Rayon({ t, side }: { t: number; side: Side }) {
  const L = side === "L";
  const dateAt = w("D3", "date");
  const chalAt = w("D3", "challenge");
  const oubli = w("D3", "oublié.");
  const pbAt = w("D3", "pharmaboost");
  const metAt = w("D3", "met") - 0.25;
  const avantAt = w("D3", "avant,") - 0.25;
  const prefAt = w("D3", "préféré") - 0.1;
  const drift = (t - B.rayon) * (L ? 3 : 0);
  // la date courte : à gauche elle reste (poussière, compte à rebours), à droite elle s'envole vers la bannière
  const fly1 = L ? 0 : prog(t, metAt, 0.45, IN_OUT);
  const fly2 = L ? 0 : prog(t, avantAt, 0.45, IN_OUT);
  const fall = L ? prog(t, chalAt, 0.9, (x) => x * x) : 0;
  const glowR = !L ? 0.5 + 0.5 * Math.sin(t * 6) : 0;
  const days = Math.max(4, 31 - Math.floor(Math.max(0, t - dateAt) * 2.4));
  const chip1 = { x: 250, y: 214 };
  const chip2 = { x: 590, y: 214 };
  const binHit = chalAt + 0.9;
  return (
    <>
      <div style={{ position: "absolute", inset: 0, transform: `translateY(${-drift}px) scale(${1 + drift * 0.002})`, transformOrigin: "50% 60%" }}>
        {/* le meuble */}
        <div style={{ position: "absolute", left: SHELF.x - 14, top: SHELF.top, width: SHELF.w + 28, height: SHELF.rows[2] - SHELF.top + 22, borderRadius: 16, background: L ? "#C9CECD" : "linear-gradient(180deg,#FFFFFF,#EAF6F0)", boxShadow: L ? "inset 0 0 0 3px #B5BCBB" : `inset 0 0 0 3px ${rgba(MINT.green, 0.25)}, 0 30px 60px -30px rgba(15,43,38,.4)` }} />
        <div style={{ position: "absolute", left: SHELF.x + 30, top: SHELF.top - 34, ...tx(18, 800, L ? GREY.soft : MINT.deep), letterSpacing: "0.16em" }}>RAYON SOINS DE LA PEAU</div>
        {SHELF.rows.map((ry) => (
          <div key={ry} style={{ position: "absolute", left: SHELF.x - 6, top: ry, width: SHELF.w + 12, height: 12, borderRadius: 6, background: L ? "#A9B0AF" : "#CFE6DD" }} />
        ))}
        {BOXES.map((b, i) => (
          <div key={i} style={{ position: "absolute", left: b.x, top: SHELF.rows[b.row] - b.h, width: b.w, height: b.h, borderRadius: 8, background: b.c, boxShadow: "inset 0 -10px 0 rgba(0,0,0,.06)" }}>
            <div style={{ position: "absolute", left: 10, right: 10, top: 14, height: 8, borderRadius: 4, background: "rgba(255,255,255,.7)" }} />
            <div style={{ position: "absolute", left: 10, width: "45%", top: 28, height: 6, borderRadius: 3, background: "rgba(255,255,255,.5)" }} />
          </div>
        ))}
        {/* la boîte en date courte */}
        {fly1 < 1 && (
          <div
            style={{
              position: "absolute",
              left: lerp(DATE_BOX.x, chip1.x - DATE_BOX.w / 2, fly1),
              top: lerp(DATE_BOX.y - DATE_BOX.h, chip1.y - DATE_BOX.h / 2, fly1),
              width: DATE_BOX.w,
              height: DATE_BOX.h,
              borderRadius: 10,
              background: "linear-gradient(170deg,#FFFFFF,#F5DCD6)",
              boxShadow: L ? "inset 0 0 0 2px #D8C9C5" : `0 0 0 ${3 + 5 * glowR}px ${rgba("#E0533F", 0.35 + 0.3 * glowR)}, 0 16px 30px -16px rgba(0,0,0,.4)`,
              transform: `scale(${1 - 0.6 * fly1}) rotate(${fly1 * -12}deg)`,
              opacity: 1 - fly1 * fly1,
            }}
          >
            <div style={{ position: "absolute", left: 12, right: 12, top: 16, height: 9, borderRadius: 4, background: "#E9B9AE" }} />
            <div style={{ position: "absolute", left: -10, bottom: 12, padding: "5px 10px", borderRadius: 8, background: "#E0533F", ...tx(15, 800, "#FFFFFF"), whiteSpace: "nowrap", transform: "rotate(-6deg)" }}>{L && t > dateAt ? `Date courte · J-${days}` : "Date courte"}</div>
            {L && <div style={{ position: "absolute", inset: 0, borderRadius: 10, background: `rgba(120,120,110,${0.35 * prog(t, dateAt, 2.5, IN_OUT)})` }} />}
          </div>
        )}
        {/* la toile d'araignée et la poussière (gauche) */}
        {L && (
          <svg width={WIN.w} height={WIN.h} style={{ position: "absolute", inset: 0, overflow: "visible", opacity: prog(t, dateAt + 0.2, 0.8) }}>
            {[0, 1, 2, 3].map((i) => (
              <path key={i} d={`M${DATE_BOX.x + DATE_BOX.w} ${DATE_BOX.y - DATE_BOX.h} q ${18 + i * 8} ${10 + i * 6} ${30 + i * 14} ${-4 + i * 18}`} fill="none" stroke="#9EA6A5" strokeWidth={1.6} />
            ))}
            {[14, 28, 42].map((r) => (
              <path key={r} d={`M${DATE_BOX.x + DATE_BOX.w + r * 0.9} ${DATE_BOX.y - DATE_BOX.h} a ${r} ${r} 0 0 1 ${-r * 0.2} ${r}`} fill="none" stroke="#9EA6A5" strokeWidth={1.2} />
            ))}
          </svg>
        )}
        {L && (
          <div style={{ position: "absolute", inset: 0, opacity: prog(t, dateAt, 0.8) }}>
            <Dust t={t} count={34} seed="f4dust" area={[DATE_BOX.x - 70, DATE_BOX.y - DATE_BOX.h - 80, DATE_BOX.w + 140, DATE_BOX.h + 90]} color="#7E8786" size={[2, 5]} alpha={0.55} speed={0.12} />
          </div>
        )}
        {/* le ticket du challenge laboratoire */}
        {fly2 < 1 && (
          <div
            style={{
              position: "absolute",
              left: L ? lerp(TICKET.x, BIN.x - 90, fall) : lerp(TICKET.x, chip2.x - 110, fly2),
              top: L ? TICKET.y + (BIN.y - 150 - TICKET.y) * fall - Math.sin(Math.PI * Math.min(1, fall)) * 60 : lerp(TICKET.y, chip2.y - 24, fly2),
              transform: `rotate(${L ? -6 + fall * 210 : -6 + fly2 * 6}deg) scale(${L ? 1 - 0.45 * fall : 1 - 0.3 * fly2})`,
              opacity: L ? (t > binHit ? 0 : 1) : 1 - fly2 * fly2,
              padding: "10px 16px",
              borderRadius: 10,
              background: "#EEFFC2",
              border: "2px dashed #9DB85A",
              ...tx(19, 800, "#3F5A00"),
              whiteSpace: "nowrap",
              boxShadow: !L ? `0 0 ${18 * glowR}px ${rgba("#9DB85A", 0.7)}` : undefined,
            }}
          >
            ★ Challenge laboratoire
          </div>
        )}
        {/* à gauche la poubelle ; à droite le présentoir du laboratoire préféré */}
        {L ? (
          <div style={{ position: "absolute", left: BIN.x - 62, top: BIN.y - 150, width: 124, height: 150, transform: `rotate(${t > binHit && t < binHit + 0.5 ? Math.sin((t - binHit) * 40) * 4 * (1 - (t - binHit) / 0.5) : 0}deg)`, transformOrigin: "50% 100%" }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: 18, bottom: 0, borderRadius: "8px 8px 18px 18px", background: "#9AA2A1" }} />
            <div style={{ position: "absolute", left: -8, right: -8, top: 6, height: 18, borderRadius: 8, background: "#7F8786" }} />
            <Trash2 size={56} color="#E2E6E5" style={{ position: "absolute", left: 34, top: 62 }} />
          </div>
        ) : (
          <div style={{ position: "absolute", left: BIN.x - 90, top: BIN.y - 220, width: 180, height: 220 }}>
            <div style={{ position: "absolute", left: 20, right: 20, bottom: 0, height: 120, borderRadius: "14px 14px 6px 6px", background: "linear-gradient(180deg,#FFF6DA,#FFE7A6)", boxShadow: `0 0 0 3px ${rgba("#E0A400", 0.35)}, 0 0 ${40 * prog(t, prefAt, 0.3) * (0.7 + 0.3 * Math.sin(t * 5))}px ${rgba("#FFC93C", 0.9)}` }} />
            <div style={{ position: "absolute", left: 48, top: 14, width: 84, height: 84, borderRadius: 99, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 12px 24px -12px rgba(0,0,0,.35)", transform: `scale(${1 + 0.15 * Math.min(1, pop(t, prefAt)) - 0.15 * prog(t, prefAt + 0.4, 0.3)})` }}>
              <Heart size={44} color="#E0A400" fill="#FFC93C" />
            </div>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 30, textAlign: "center", ...tx(16, 800, "#8A5A00"), lineHeight: 1.15 }}>Laboratoire<br />préféré</div>
          </div>
        )}
        {L && <Abs x={BIN.x} y={BIN.y - 190}><div style={{ transform: `rotate(-12deg) scale(${Math.min(1.1, pop(t, oubli - 0.1))})`, padding: "6px 14px", border: "4px solid #8D9695", borderRadius: 10, ...tx(24, 800, "#7A8382"), letterSpacing: "0.1em", opacity: t > oubli - 0.1 ? 1 : 0 }}>OUBLIÉ</div></Abs>}
      </div>
      {/* le haut : à gauche le constat, à droite la bannière qui se remplit */}
      {L ? (
        <Abs x={WIN.w / 2} y={150}>
          <div style={{ width: 760, display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { I: Clock, l: "Date courte : reste en rayon", at: dateAt },
              { I: X, l: "Challenge laboratoire : oublié", at: oubli - 0.2 },
              { I: X, l: "Laboratoire préféré : non suivi", at: prefAt },
            ].map((r) => {
              const k = prog(t, r.at, 0.6, IN_OUT);
              return (
                <div key={r.l} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", borderRadius: 16, background: GREY.card, boxShadow: `0 0 0 2px ${GREY.line}`, opacity: k, transform: `translateY(${(1 - k) * -14}px)` }}>
                  <r.I size={26} color={GREY.soft} strokeWidth={2.6} />
                  <span style={tx(25, 700, GREY.ink)}>{r.l}</span>
                </div>
              );
            })}
          </div>
        </Abs>
      ) : (
        <Abs x={WIN.w / 2} y={168}>
          <div style={{ transform: `scale(${0.92 + 0.08 * prog(t, B.rayon, 0.5, SNAP)})` }}>
            <Card style={{ width: 820, padding: "18px 24px 20px", borderRadius: 26, boxShadow: `0 0 0 ${3 + 3 * prog(t, pbAt, 0.3) * (1 - prog(t, pbAt + 0.6, 0.5))}px ${rgba(MINT.green, 0.4)}, 0 40px 80px -40px rgba(15,43,38,.55)` }}>
              <BannerHead />
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 14 }}>
                <DupeTile kind="iso-nettoyant" size={62} radius={14} />
                <span style={tx(26, 800)}>{DUPES["iso-nettoyant"].name}</span>
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 12, height: 44, alignItems: "center" }}>
                {t >= metAt + 0.4 ? <Pastille kind="date" text="Date courte" k={Math.min(1.12, pop(t, metAt + 0.4))} /> : <span style={{ width: 170, height: 42, borderRadius: 99, border: `2px dashed ${MINT.line}` }} />}
                {t >= avantAt + 0.4 ? <Pastille kind="challenge" text="Challenge laboratoire" k={Math.min(1.12, pop(t, avantAt + 0.4))} /> : <span style={{ width: 280, height: 42, borderRadius: 99, border: `2px dashed ${MINT.line}` }} />}
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 12, height: 44, alignItems: "center" }}>
                {t >= prefAt + 0.15 ? <Pastille kind="labo" text="Laboratoire préféré du titulaire" k={Math.min(1.12, pop(t, prefAt + 0.15))} /> : <span style={{ width: 400, height: 42, borderRadius: 99, border: `2px dashed ${MINT.line}` }} />}
              </div>
            </Card>
          </div>
        </Abs>
      )}
      {!L && (
        <>
          <Ring t={t} at={metAt + 0.4} x={chip1.x} y={chip1.y} max={200} color="#E0533F" />
          <Ring t={t} at={avantAt + 0.4} x={chip2.x} y={chip2.y} max={220} color="#9DB85A" />
          <Ring t={t} at={prefAt} x={BIN.x} y={BIN.y - 150} max={300} color="#FFC93C" />
          <Sparkle t={t} at={prefAt + 0.15} x={WIN.w / 2 + 230} y={262} size={46} color={PB.gold} />
          <Sparkle t={t} at={metAt + 0.45} x={chip1.x - 90} y={chip1.y - 30} size={36} color="#FFFFFF" />
        </>
      )}
      {L && <Ring t={t} at={binHit} x={BIN.x} y={BIN.y - 140} max={160} color="#9AA2A1" />}
    </>
  );
}

// =====================================================================================================================
// 3. Le patient (D4) : à gauche il repart les mains vides, à droite son bilan sur son téléphone
// =====================================================================================================================
function Patient4({ t, side }: { t: number; side: Side }) {
  const L = side === "L";
  const leaveAt = w("D4", "repart") - 0.1;
  const droite = w("D4", "droite,");
  const leave = L ? prog(t, leaveAt, 2.1, (x) => x) : 0;
  const s = L ? keys(t, [[B.patient, 0.74], [B.mois, 0.8, (x: number) => x]]) : keys(t, [[B.patient, 0.74], [droite - 0.1, 0.76], [droite + 0.7, 1.05, IN_OUT], [B.mois, 1.12, (x: number) => x]]);
  const zk = L ? 0 : prog(t, droite - 0.1, 0.8, IN_OUT);
  const cam: Cam = { s, fx: lerp(1000, 1250, zk), fy: lerp(540, 470, zk) };
  const door = L ? prog(t, leaveAt + 1.3, 0.3) * (1 - prog(t, leaveAt + 2.1, 0.4)) : 0;
  const phoneIn = L ? 0 : prog(t, droite + 0.05, 0.55, SNAP);
  const headStart = toWin({ s: 0.74, fx: 1000, fy: 540 }, 1334, 337);
  return (
    <>
      <Stage t={t} side={side} cam={cam} blur={6 * phoneIn} door={door} chime={L ? leaveAt + 1.35 : undefined}>
        <Pharmacienne t={t} mood={L ? "act1" : "pb"} expression={L ? "lasse" : "sourire"} />
        <Patient t={t} mood={L ? "act1" : "pb"} leave={leave} peek={false} boxesInBag={1} expression={L ? "neutre" : "sourire"} />
      </Stage>
      {L && (
        <>
          <div style={{ position: "absolute", inset: 0, background: `rgba(40,52,58,${0.1 + 0.08 * prog(t, leaveAt + 1.8, 1)})` }} />
          <Abs x={headStart.x} y={headStart.y - 92} style={{ opacity: 1 - prog(t, droite - 0.2, 0.4) }}>
            <div style={{ transform: `scale(${Math.min(1, pop(t, w("D4", "mains") - 0.1))})` }}>
              <Badge tone="grey">
                <X size={26} color={GREY.soft} strokeWidth={3} /> Les mains vides
              </Badge>
            </div>
          </Abs>
          <Abs x={655} y={330}>
            <div style={{ width: 440, padding: "20px 24px", borderRadius: 22, background: GREY.card, boxShadow: `0 0 0 2px ${GREY.line}`, opacity: prog(t, w("D4", "bilan") - 0.4, 0.5) }}>
              {[
                { l: "Bilan conseil", at: w("D4", "bilan") - 0.1 },
                { l: "Rappel de fin de cure", at: w("D4", "rappels…") - 0.1 },
                { l: "Offres de la pharmacie", at: w("D4", "offres") - 0.1 },
              ].map((r, i) => {
                const k = prog(t, r.at, 0.5, IN_OUT);
                return (
                  <div key={r.l} style={{ marginTop: i ? 12 : 0, display: "flex", alignItems: "center", gap: 14, opacity: 0.25 + 0.75 * k }}>
                    <span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 99, background: "#D3D8D7", alignItems: "center", justifyContent: "center" }}>
                      <X size={20} color="#FFFFFF" strokeWidth={3} />
                    </span>
                    <span style={tx(24, 700, GREY.ink)}>{r.l}</span>
                    <span style={{ marginLeft: "auto", ...tx(22, 700, GREY.soft) }}>—</span>
                  </div>
                );
              })}
            </div>
          </Abs>
        </>
      )}
      {!L && phoneIn > 0 && (
        <>
          <div style={{ position: "absolute", inset: 0, background: `rgba(255,255,255,${0.3 * phoneIn})` }} />
          <Phone t={t} x={WIN.w / 2} y={392 + (1 - phoneIn) * 700} scale={0.86} tilt={-6} buzz={w("D4", "rappels…") - 0.05}>
            <PatientApp t={t} />
          </Phone>
          <Abs x={150} y={160}>
            <div style={{ transform: `scale(${Math.min(1, pop(t, w("D4", "scanne") - 0.1))})` }}>
              <Badge>
                <QrCode size={26} color={MINT.green} /> QR code
              </Badge>
            </div>
          </Abs>
          <Abs x={760} y={600}>
            <div style={{ transform: `scale(${Math.min(1, pop(t, w("D4", "reçoit") + 0.2))})` }}>
              <Badge>
                <Bell size={26} color={MINT.green} /> Rappel
              </Badge>
            </div>
          </Abs>
        </>
      )}
    </>
  );
}

function PatientApp({ t }: { t: number }) {
  const scan = w("D4", "scanne");
  const opens = w("D4", "bilan") - 0.05;
  const camera = 1 - prog(t, opens, 0.3);
  const opened = prog(t, opens, 0.45, SNAP);
  const beam = (((t - scan + 10) % 1) + 1) % 1;
  const st = (i: number): CSSProperties => ({ opacity: prog(t, opens + 0.08 * i, 0.35), transform: `translateY(${(1 - prog(t, opens + 0.08 * i, 0.35, SNAP)) * 18}px)` });
  const ring = prog(t, w("D4", "rappels…") - 0.1, 1.2, IN_OUT);
  const all: DupeKind[] = ["iso-nettoyant", "iso-hydratant", "iso-levres", "iso-solaire"];
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {camera > 0.01 && (
        <div style={{ position: "absolute", inset: 0, background: "#0B1714", opacity: camera, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 26 }}>
          <div style={{ position: "relative", width: 230, height: 230, borderRadius: 24, border: `4px solid ${MINT.green}` }}>
            <div style={{ position: "absolute", inset: 18 }}>
              <QrArt size={186} light />
            </div>
            {t > scan - 0.1 && <div style={{ position: "absolute", left: 10, right: 10, top: 10 + beam * 200, height: 4, borderRadius: 4, background: "#2BD67B", boxShadow: "0 0 18px #2BD67B" }} />}
          </div>
          <span style={tx(18, 700, "#CFE9E0")}>Scannez le bilan du comptoir</span>
        </div>
      )}
      {opened > 0.01 && (
        <div style={{ position: "absolute", inset: 0, opacity: opened, background: "#EEF3F1", padding: "58px 16px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, ...st(0) }}>
            <span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 10, background: PB.green, alignItems: "center", justifyContent: "center" }}>
              <Cross size={18} color={PB.citron} />
            </span>
            <span style={tx(16, 800, "#101828")}>PharmaBoost</span>
            <span style={{ marginLeft: "auto", ...tx(12, 600, "#64748B") }}>Pharmacie du Centre</span>
          </div>
          <div style={{ marginTop: 16, ...tx(26, 800, "#0B3B47"), ...st(1) }}>Mon bilan conseil</div>
          <div style={{ marginTop: 10, borderRadius: 18, background: "#FFFFFF", padding: 12, ...st(2) }}>
            <div style={{ ...tx(11, 800, MINT.deep), letterSpacing: "0.06em" }}>MA ROUTINE ISOTRÉTINOÏNE</div>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
              {all.map((k) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <DupeTile kind={k} size={40} radius={10} />
                  <span style={tx(14, 700, "#101828")}>{DUPES[k].name}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 10, borderRadius: 18, background: "#FFFFFF", padding: 12, display: "flex", alignItems: "center", gap: 12, ...st(3) }}>
            <svg width={50} height={50} viewBox="0 0 56 56">
              <circle cx={28} cy={28} r={23} fill="none" stroke="#E3ECE8" strokeWidth={7} />
              <circle cx={28} cy={28} r={23} fill="none" stroke={MINT.green} strokeWidth={7} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - 0.77 * ring} transform="rotate(-90 28 28)" />
            </svg>
            <div>
              <div style={{ ...tx(11, 800, MINT.deep), letterSpacing: "0.06em" }}>RAPPEL</div>
              <div style={tx(14, 800, "#101828")}>Fin de cure dans 7 jours</div>
            </div>
          </div>
          <Notification t={t} at={w("D4", "rappels…") - 0.05} icon="bell" title="Rappel · Fin de cure" body="Votre routine se termine dans 7 jours." x={171} y={106} width={330} until={w("D4", "offres") - 0.3} />
          <Notification t={t} at={w("D4", "offres") - 0.1} icon="robot" app="Pharmacie du Centre" title="Offre de votre pharmacie" body="−20 % sur les soins solaires, cette semaine." x={171} y={106} width={330} />
        </div>
      )}
    </div>
  );
}

// =====================================================================================================================
// 4. La fin du mois (D5) : une ligne plate / trois courbes qui montent
// =====================================================================================================================
const CH = { x0: 70, x1: 834, y0: 170, y1: 560 };
function Mois({ t, side }: { t: number; side: Side }) {
  const L = side === "L";
  const a = B.mois;
  const series = [
    { l: "Conseils", c: MINT.green, at: w("D5", "conseils,"), y: 250, seed: 1 },
    { l: "Chiffre d'affaires", c: "#1E88C8", at: w("D5", "chiffre"), y: 205, seed: 2 },
    { l: "Patients fidèles", c: "#E0A400", at: w("D5", "patients"), y: 290, seed: 3 },
  ];
  const monte = w("D5", "montent.");
  const path = (yEnd: number, seed: number, flat: boolean) => {
    const pts: string[] = [];
    for (let i = 0; i <= 12; i++) {
      const x = CH.x0 + ((CH.x1 - CH.x0 - 40) * i) / 12;
      const u = i / 12;
      const y = flat ? 470 + seed * 14 + Math.sin(i * 1.7 + seed) * 4 : 500 - (500 - yEnd) * (u * u * 0.6 + u * 0.4) + Math.sin(i * 2.1 + seed) * 10 * (1 - u);
      pts.push(`${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return pts.join(" ");
  };
  const rien = w("D5", "rien");
  return (
    <>
      <div style={{ position: "absolute", left: 24, top: 24, right: 24, bottom: 24, borderRadius: 26, background: L ? GREY.card : "#FFFFFF", boxShadow: L ? `0 0 0 2px ${GREY.line}` : "0 40px 80px -40px rgba(15,43,38,.45)" }} />
      <div style={{ position: "absolute", left: 70, top: 62, display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ display: "inline-flex", width: 54, height: 54, borderRadius: 16, background: L ? "#E2E6E5" : MINT.bg, alignItems: "center", justifyContent: "center", transform: `rotate(${(1 - prog(t, a, 0.6, SNAP)) * -20}deg)` }}>
          <CalendarDays size={30} color={L ? GREY.soft : MINT.green} />
        </span>
        <span style={tx(34, 800, L ? GREY.ink : MINT.ink)}>Fin du mois</span>
      </div>
      <div style={{ position: "absolute", right: 70, top: 76 }}>
        <Example dark={L} />
      </div>
      <svg width={WIN.w} height={WIN.h} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {[0, 1, 2, 3].map((i) => (
          <line key={i} x1={CH.x0} x2={CH.x1} y1={CH.y0 + i * 110} y2={CH.y0 + i * 110} stroke={L ? "#DADFDE" : "#E6EFEB"} strokeWidth={2} />
        ))}
        {["S1", "S2", "S3", "S4"].map((s, i) => (
          <text key={s} x={CH.x0 + 20 + i * 230} y={CH.y1 + 34} style={{ ...tx(18, 700, L ? GREY.soft : MINT.soft) }}>
            {s}
          </text>
        ))}
        {L
          ? series.map((s, i) => {
              const d = prog(t, a + 0.3 + i * 0.15, 1.6, IN_OUT);
              return <path key={s.l} d={path(0, i, true)} fill="none" stroke={["#9AA2A1", "#AEB5B4", "#BFC5C4"][i]} strokeWidth={6} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - d} />;
            })
          : series.map((s) => {
              const d = prog(t, s.at - 0.1, 1.1, IN_OUT);
              return (
                <g key={s.l}>
                  <path d={path(s.y, s.seed, false)} fill="none" stroke={rgba(s.c, 0.18)} strokeWidth={16} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - d} />
                  <path d={path(s.y, s.seed, false)} fill="none" stroke={s.c} strokeWidth={6} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - d} />
                  {d >= 1 && <circle cx={CH.x1 - 40} cy={s.y} r={11 + 3 * Math.sin(t * 6)} fill={s.c} stroke="#FFFFFF" strokeWidth={4} />}
                </g>
              );
            })}
      </svg>
      {L && (
        <Abs x={WIN.w / 2} y={340}>
          <div style={{ opacity: prog(t, rien - 0.1, 0.7, IN_OUT), ...tx(46, 800, GREY.ink), fontStyle: "italic", whiteSpace: "nowrap" }}>Rien ne bouge.</div>
        </Abs>
      )}
      {!L && (
        <>
          <Ring t={t} at={monte} x={CH.x1 - 40} y={205} max={260} color={MINT.green} />
          <Sparkle t={t} at={monte + 0.05} x={CH.x1 - 70} y={160} size={50} color={PB.gold} />
          <Sparkle t={t} at={monte + 0.2} x={CH.x1 - 10} y={300} size={40} color={MINT.green} />
        </>
      )}
      <Abs x={WIN.w / 2} y={668}>
        <div style={{ display: "flex", gap: 12 }}>
          {series.map((s) => {
            const k = L ? prog(t, s.at, 0.6, IN_OUT) : Math.min(1, pop(t, s.at));
            return (
              <span key={s.l} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 999, background: L ? "#E2E6E5" : "#FFFFFF", boxShadow: L ? "none" : `0 12px 26px -16px rgba(15,43,38,.5), 0 0 0 2px ${rgba(s.c, 0.3)}`, ...tx(21, 800, L ? GREY.ink : MINT.ink), whiteSpace: "nowrap", opacity: L ? k : Math.min(1, k * 2), transform: `scale(${L ? 1 : 0.6 + 0.4 * k})` }}>
                {L ? <span style={{ ...tx(24, 800, GREY.soft) }}>=</span> : <ArrowUp size={22} color={s.c} strokeWidth={3} />}
                {s.l}
              </span>
            );
          })}
        </div>
      </Abs>
    </>
  );
}

// =====================================================================================================================
// 5. « Et l'équipe respire »
// =====================================================================================================================
function Equipe({ t, side }: { t: number; side: Side }) {
  const L = side === "L";
  const a = B.equipe;
  const s = keys(t, [[a, 1.15], [B.rue + 0.4, 1.38, (x: number) => x]]);
  const cam: Cam = { s, fx: 800, fy: 420 };
  const resp = w("D5", "respire.");
  return (
    <>
      <Stage t={t} side={side} cam={cam}>
        <Pharmacienne t={t} mood={L ? "act1" : "pb"} expression={L ? "lasse" : "sourire"} />
      </Stage>
      {L ? (
        <div style={{ position: "absolute", inset: 0, background: "rgba(40,52,58,.16)" }} />
      ) : (
        <>
          <div style={{ position: "absolute", inset: 0, background: `radial-gradient(60% 60% at 45% 30%, ${rgba("#FFF4D0", 0.55 * prog(t, resp - 0.3, 0.6))}, transparent 70%)` }} />
          <Sparkle t={t} at={resp - 0.2} x={250} y={150} size={50} color={PB.gold} />
          <Sparkle t={t} at={resp} x={640} y={120} size={44} color="#FFFFFF" />
          <Abs x={WIN.w / 2} y={690}>
            <div style={{ transform: `scale(${Math.min(1, pop(t, w("D5", "l'équipe") - 0.05))})` }}>
              <Badge style={{ fontSize: 30 }}>
                <Heart size={30} color={MINT.green} fill={MINT.green} /> L&apos;équipe respire
              </Badge>
            </div>
          </Abs>
        </>
      )}
    </>
  );
}

// =====================================================================================================================
// 6. La rue (D6) : comme les autres… ou qui se démarque
// =====================================================================================================================
function Rue({ t, side, full = 0 }: { t: number; side: Side; full?: number }) {
  const L = side === "L";
  const a = B.rue;
  const ou = w("D6", "ou") - 0.1;
  const lit = L ? 0 : prog(t, ou, 0.45, SNAP);
  const sc = 0.92 + 0.08 * full;
  const walkers = PASSANTS.slice(0, 4);
  return (
    <>
      <div style={{ position: "absolute", left: -1200, right: -1200, top: -400, bottom: -400, background: L ? "linear-gradient(180deg,#E3E7E6,#CFD5D4)" : "linear-gradient(180deg,#FFFFFF,#E8F6EF)" }} />
      <div style={{ position: "absolute", left: 0, top: 0, width: 1280, height: 960, transformOrigin: "0 0", transform: `translate(${WIN.w / 2 - 640 * sc}px, ${WIN.h / 2 + 20 - 600 * sc}px) scale(${sc})` }}>
        <div style={{ position: "absolute", left: -600, right: -600, top: 890, height: 12, background: L ? "#8E9796" : MINT.ink, opacity: 0.85 }} />
        <Shop x={640} lit={lit} t={t} />
        {walkers.map((c, i) => {
          const s0 = a + 0.1 + i * 0.55;
          const k = (((t - s0) / 3.2) % 1 + 1) % 1;
          if (t < s0) return null;
          // à gauche ils passent devant ; à droite ils entrent
          const x = L ? -60 + 1400 * k : lerp(1260 - i * 20, 1000, Math.min(1, k * 1.25));
          const op = L ? 1 : 1 - clamp01((k * 1.25 - 0.85) / 0.15);
          return (
            <div key={i} style={{ position: "absolute", left: x, top: 760 - Math.abs(Math.sin(k * 30)) * 6, opacity: op }}>
              <div style={{ width: 40, height: 40, borderRadius: 99, background: L ? "#B7BEBD" : c, margin: "0 auto" }} />
              <div style={{ width: 60, height: 92, borderRadius: "30px 30px 10px 10px", background: L ? "#B7BEBD" : c, filter: "brightness(.9)", marginTop: 4 }} />
            </div>
          );
        })}
      </div>
      <Abs x={WIN.w / 2} y={88 - 30 * full}>
        {L ? (
          <div style={{ opacity: prog(t, VAT.D6 + 0.1, 0.6, IN_OUT), ...tx(46, 800, GREY.ink), fontStyle: "italic", whiteSpace: "nowrap" }}>Comme les autres…</div>
        ) : full < 0.5 ? (
          <div style={{ opacity: prog(t, ou, 0.3) * (1 - full * 2), transform: `scale(${Math.min(1, pop(t, ou))})`, ...tx(46, 800), whiteSpace: "nowrap" }}>
            … ou <span style={{ color: MINT.green }}>qui se démarque ?</span>
          </div>
        ) : null}
      </Abs>
    </>
  );
}

/** Les fissures de la moitié gauche (avant qu'elle tombe). */
function Fissures({ t, at }: { t: number; at: number }) {
  const k = prog(t, at, 0.3, SNAP);
  if (k <= 0) return null;
  const c = { x: 640, y: 470 };
  const arms = Array.from({ length: 9 }, (_, i) => {
    const ang = (i / 9) * Math.PI * 2 + 0.3;
    const len = 300 + ((i * 97) % 260);
    const pts = [c];
    for (let j = 1; j <= 4; j++) pts.push({ x: c.x + Math.cos(ang + Math.sin(i * 3 + j) * 0.25) * len * (j / 4), y: c.y + Math.sin(ang + Math.cos(i * 5 + j) * 0.25) * len * (j / 4) });
    return pts.map((p, j) => `${j ? "L" : "M"}${p.x.toFixed(0)} ${p.y.toFixed(0)}`).join(" ");
  });
  return (
    <svg width={960} height={1080} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      {arms.map((d, i) => (
        <g key={i}>
          <path d={d} fill="none" stroke="rgba(255,255,255,.9)" strokeWidth={5} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - k} />
          <path d={d} fill="none" stroke="#3E4746" strokeWidth={2.2} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - k} />
        </g>
      ))}
    </svg>
  );
}

// =====================================================================================================================
// La fin de marque
// =====================================================================================================================
function Fin({ t }: { t: number }) {
  const inK = prog(t, FIN - 0.05, 0.3);
  const btn = ressort(t, BUTTON, { damping: 10, stiffness: 240, mass: 0.6 });
  const click = BUTTON + 1.3;
  return (
    <AbsoluteFill style={{ opacity: inK }}>
      <AbsoluteFill style={{ background: `radial-gradient(90% 80% at 50% 0%, #FFFFFF 0%, ${MINT.paper} 55%, #E2EEEA 100%)` }} />
      <Bokeh t={t} count={14} seed={44} alpha={0.28} colors={[PB.mint, "#CFF5E3", PB.citron]} />
      <Abs x={960} y={300}>
        <PBLogo t={t} at={FIN + 0.05} size={124} tone="light" grad />
      </Abs>
      <Ring t={t} at={FIN + 0.15} x={960} y={300} max={1000} color={MINT.green} />
      <Ring t={t} at={w("D6", "copilote") - 0.05} x={960} y={520} max={700} color={PB.citron} />
      <Sparkle t={t} at={w("D6", "copilote")} x={300} y={440} size={64} color={PB.gold} />
      <Sparkle t={t} at={w("D6", "copilote") + 0.12} x={1620} y={560} size={56} color={MINT.green} />
      <Abs x={960} y={520}>
        <Rise t={t} at={w("D6", "le") - 0.1} text="Le copilote IA du comptoir *de votre pharmacie.*" size={64} style={{ width: 1700 }} />
      </Abs>
      {t >= BUTTON && (
        <Abs x={960} y={710}>
          <div style={{ position: "relative", transform: `scale(${btn * (t > click && t < click + 0.15 ? 0.95 : 1)})`, display: "flex", alignItems: "center", gap: 16, padding: "26px 50px", borderRadius: 999, background: MINT.green, ...tx(42, 800, "#FFFFFF"), boxShadow: `0 24px 50px -20px ${rgba(MINT.green, 0.7)}`, whiteSpace: "nowrap" }}>
            <CalendarCheck size={44} /> Réserver une démonstration
            <span style={{ position: "absolute", inset: 0, borderRadius: 999, overflow: "hidden" }}>
              <span style={{ position: "absolute", top: 0, bottom: 0, width: 160, left: `${-30 + 160 * (((t - BUTTON) * 0.7) % 1.6)}%`, background: "linear-gradient(100deg, transparent, rgba(255,255,255,.45), transparent)" }} />
            </span>
          </div>
        </Abs>
      )}
      <Abs x={1180 + 300 * (1 - prog(t, BUTTON + 0.5, 0.75, IN_OUT))} y={760 + 200 * (1 - prog(t, BUTTON + 0.5, 0.75, IN_OUT))}>
        <MousePointer2 size={58} fill="#0F2B26" color="#FFFFFF" strokeWidth={1.5} style={{ opacity: prog(t, BUTTON + 0.45, 0.2), transform: `scale(${t > click && t < click + 0.15 ? 0.82 : 1})` }} />
      </Abs>
      <Ring t={t} at={click} x={1180} y={740} max={260} color={MINT.green} />
      <Confetti t={t} at={BUTTON + 0.05} x={960} y={420} count={70} power={1500} />
      <Abs x={960} y={850}>
        <div style={{ opacity: prog(t, BUTTON + 0.6, 0.5), ...tx(36, 800, MINT.deep) }}>pharmaboost.app</div>
      </Abs>
      <Sparkle t={t} at={BUTTON + 0.2} x={1240} y={300} size={80} color={PB.gold} />
    </AbsoluteFill>
  );
}

// =====================================================================================================================
// Les sous-titres, la musique, les bruitages
// =====================================================================================================================
type CapLine = { at: number; words: Word[] };
const CAPS: CapLine[] = [];
for (const l of linesOf(4)) {
  let cur: Word[] = [];
  for (const wd of M[l.id].words) {
    cur.push(wd);
    if (/[.:?!…]$/.test(wd.w) || (cur.length >= 6 && /,$/.test(wd.w)) || cur.length >= 11) {
      CAPS.push({ at: VAT[l.id], words: cur });
      cur = [];
    }
  }
  if (cur.length) CAPS.push({ at: VAT[l.id], words: cur });
}
function Captions({ t }: { t: number }) {
  const line = CAPS.find((l) => t >= l.at + l.words[0].at - 0.15 && t <= l.at + l.words[l.words.length - 1].end + 0.3);
  if (!line) return null;
  const vt = t - line.at;
  return (
    <Abs x={960} y={1018}>
      <div style={{ maxWidth: 1760, padding: "10px 26px", borderRadius: 16, background: "rgba(255,255,255,.95)", boxShadow: "0 10px 30px -14px rgba(15,43,38,.5), 0 0 0 1px rgba(15,43,38,.06)", textAlign: "center", ...tx(31, 700), lineHeight: 1.3, whiteSpace: "nowrap" }}>
        {line.words
          .filter((wd) => wd.w !== "?")
          .map((wd, i, arr) => (
            <span key={i} style={{ color: vt >= wd.at ? MINT.ink : rgba(MINT.ink, 0.3) }}>
              {wd.w}
              {i < arr.length - 1 ? " " : ""}
            </span>
          ))}
        {line.words.some((wd) => wd.w === "?") ? <span style={{ color: vt >= line.words[line.words.length - 1].at ? MINT.ink : rgba(MINT.ink, 0.3) }}> ?</span> : null}
      </div>
    </Abs>
  );
}

const IDS = ["D1", "D2", "D3", "D4", "D5", "D6"];
const SPANS = IDS.map((id) => [VAT[id], end(id)] as const);
const duck = (t: number) => {
  let d = 0;
  for (const [a, b] of SPANS) if (t >= a - 0.2 && t <= b + 0.45) d = Math.max(d, Math.min(1, (t - (a - 0.2)) / 0.2, (b + 0.45 - t) / 0.45));
  return d;
};
const level = (t: number) => 0.3 + (0.1 - 0.3) * duck(t);
type Seg = { at: number; from: number; to: number; gain: (t: number) => number };
const TAIL_AT = BUTTON - (66 - 58);
const MUSIC: Seg[] = (() => {
  const out: Seg[] = [];
  let at = 0;
  while (at < TAIL_AT - 0.01) {
    const l = Math.min(38, TAIL_AT - at);
    out.push({ at, from: 20, to: 20 + l, gain: (t) => Math.min(1, t / 0.8) * level(t) });
    at += l;
  }
  out.push({ at: TAIL_AT, from: 58, to: 69, gain: (t) => Math.max(level(t), t > BUTTON - 0.9 ? 0.4 : 0) * (1 - prog(t, TOTAL - 1.4, 1.3)) });
  return out;
})();

const SFX: Cue[] = [
  cue("laser-ecrit", 0.15, 0.4),
  cue("whoosh-cine", 0.2, 0.35),
  cue("pop-leger", w("D1", "même") - 0.05, 0.32),
  cue("pop-leger", w("D1", "même", 1) - 0.05, 0.32, 1.06),
  cue("papier", w("D1", "ordonnance") - 0.15, 0.4),
  cue("multiplication", w("D1", "ordonnance") + 0.35, 0.35),
  cue("boite-posee", ORD_LAND, 0.3),
  cue("impact-net", w("D1", "deux") - 0.05, 0.45),
  cue("whoosh-rapide", VAT.D2 - 0.15, 0.3),
  cue("scan-laser", SCAN - 0.02, 0.3),
  cue("scanner-bip", SCAN + 0.05, 0.6),
  cue("tic-sec", w("D2", "tout.") - 0.05, 0.35),
  cue("whoosh-pb", w("D2", "pharmaboost") - 0.2, 0.4),
  cue("ui-ding", w("D2", "pharmaboost") - 0.05, 0.35),
  cue("pop-leger", w("D2", "crème") - 0.12, 0.35),
  ...ROUTINE.map((r, i) => cue("pop-leger", r.at - 0.1, 0.3, 1.05 + i * 0.05)),
  cue("cloche-reussite", w("D2", "complète") + 0.3, 0.3),
  cue("whoosh-rapide", B.rayon - 0.05, 0.32),
  cue("tic", w("D3", "date"), 0.3),
  cue("avion-papier", w("D3", "challenge"), 0.3),
  cue("boite-posee", w("D3", "challenge") + 0.9, 0.35),
  cue("tampon", w("D3", "oublié.") - 0.1, 0.4),
  cue("whoosh-pb", w("D3", "pharmaboost") - 0.15, 0.35),
  cue("swoosh", w("D3", "met") - 0.25, 0.3),
  cue("carte-ping", w("D3", "met") + 0.15, 0.4),
  cue("swoosh", w("D3", "avant,") - 0.25, 0.3, 1.08),
  cue("carte-ping", w("D3", "avant,") + 0.15, 0.4, 1.08),
  cue("etincelle", w("D3", "préféré") - 0.1, 0.4),
  cue("carte-ping", w("D3", "préféré") + 0.05, 0.38, 1.16),
  cue("whoosh-rapide", B.patient - 0.05, 0.32),
  cue("porte-carillon", w("D4", "repart") + 1.25, 0.4),
  cue("porte-ferme", w("D4", "repart") + 1.9, 0.35),
  cue("tic-sec", w("D4", "mains") - 0.1, 0.32),
  cue("swipe-tel", w("D4", "droite,") + 0.05, 0.4),
  cue("scanner-bip", w("D4", "scanne") + 0.25, 0.35, 1.2),
  cue("ui-ding", w("D4", "bilan") - 0.05, 0.35),
  cue("tic", w("D4", "bilan") - 0.1, 0.2),
  cue("notif-douce", w("D4", "rappels…") - 0.05, 0.4),
  cue("telephone-vibre", w("D4", "rappels…") - 0.05, 0.25),
  cue("tic", w("D4", "rappels…") - 0.1, 0.2),
  cue("notif-douce", w("D4", "offres") - 0.1, 0.4, 1.1),
  cue("tic", w("D4", "offres") - 0.1, 0.2),
  cue("whoosh-rapide", B.mois - 0.05, 0.32),
  cue("carte-depliee", B.mois + 0.1, 0.35),
  cue("tic-sec", w("D5", "rien") - 0.1, 0.3),
  cue("montee", w("D5", "conseils,") - 0.1, 0.28),
  cue("montee", w("D5", "chiffre") - 0.1, 0.28, 1.06),
  cue("montee", w("D5", "patients") - 0.1, 0.28, 1.12),
  cue("cloche-reussite", w("D5", "montent."), 0.32),
  cue("whoosh-rapide", B.equipe - 0.05, 0.3),
  cue("air-woosh", w("D5", "respire.") - 0.2, 0.3),
  cue("etincelle", w("D5", "respire."), 0.3),
  cue("whoosh-rapide", B.rue - 0.05, 0.32),
  cue("neon", w("D6", "ou") - 0.1, 0.35),
  cue("glitch", SWEEP - 0.4, 0.35),
  cue("impact-film", SWEEP - 0.05, 0.4),
  cue("whoosh-impact", SWEEP, 0.4),
  cue("impact-revelation", FIN, 0.45),
  cue("etincelle", w("D6", "copilote"), 0.35),
  cue("confettis", BUTTON + 0.05, 0.35),
  cue("ui-clic", BUTTON + 1.3, 0.45),
];

// =====================================================================================================================
// Le film
// =====================================================================================================================
const CHANGES = [B.rayon, B.patient, B.mois, B.equipe, B.rue];

function HalfContent({ t, side, full = 0 }: { t: number; side: Side; full?: number }) {
  const L = side === "L";
  const enter = prog(t, 0.05, 0.85, SNAP);
  const rect = L ? WIN : { x: lerp(WIN.x, -960, full), y: lerp(WIN.y, 0, full), w: lerp(WIN.w, 1920, full), h: lerp(WIN.h, 1080, full) };
  const rad = 28 * (1 - full);
  return (
    <>
      {/* la fenêtre */}
      <div
        style={{
          position: "absolute",
          left: rect.x,
          top: rect.y,
          width: rect.w,
          height: rect.h,
          borderRadius: rad,
          overflow: "hidden",
          background: L ? "#D5DAD9" : "#FFFFFF",
          boxShadow: L ? "0 30px 60px -36px rgba(30,40,40,.5), 0 0 0 2px #C4CAC9" : `0 40px 80px -36px rgba(15,43,38,.55), 0 0 0 3px ${rgba(MINT.green, 0.35)}`,
          transform: `translateY(${(1 - enter) * (L ? -1100 : 1100)}px)`,
        }}
      >
        <div style={{ position: "absolute", left: (rect.w - WIN.w) / 2, top: (rect.h - WIN.h) / 2, width: WIN.w, height: WIN.h }}>
          <Beat t={t} side={side} from={B.comptoir} to={B.rayon}>
            <Comptoir t={t} side={side} />
          </Beat>
          <Beat t={t} side={side} from={B.rayon} to={B.patient}>
            <Rayon t={t} side={side} />
          </Beat>
          <Beat t={t} side={side} from={B.patient} to={B.mois}>
            <Patient4 t={t} side={side} />
          </Beat>
          <Beat t={t} side={side} from={B.mois} to={B.equipe}>
            <Mois t={t} side={side} />
          </Beat>
          <Beat t={t} side={side} from={B.equipe} to={B.rue}>
            <Equipe t={t} side={side} />
          </Beat>
          <Beat t={t} side={side} from={B.rue} to={FIN + 0.2}>
            <div style={{ position: "absolute", inset: 0, transform: L ? undefined : `scale(${1 + 2.2 * prog(t, FIN - 0.4, 0.5, EXIT)})`, transformOrigin: "50% 40%" }}>
              <Rue t={t} side={side} full={full} />
            </div>
          </Beat>
          {L && <Fissures t={t} at={w("D6", "qui") - 0.05} />}
        </div>
      </div>
    </>
  );
}

function TopLabel({ t, side, out }: { t: number; side: Side; out: number }) {
  const L = side === "L";
  const at = w("D1", "deux") - 0.05;
  const k = prog(t, at, 0.55, SNAP);
  if (t < at - 0.05 || out >= 1) return null;
  const x = lerp(960, L ? 480 : 1440, k);
  return (
    <Abs x={x} y={64} style={{ opacity: (1 - out) * Math.min(1, k * 3) }}>
      <div style={{ transform: `scale(${0.7 + 0.3 * Math.min(1.05, pop(t, at))})` }}>
        {L ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 12, padding: "12px 26px", borderRadius: 999, background: "#E7EAEA", boxShadow: "inset 0 0 0 2px #C9CFCE", ...tx(30, 800, GREY.ink), whiteSpace: "nowrap" }}>
            <X size={28} color={GREY.soft} strokeWidth={3} /> Sans PharmaBoost
          </span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 12, padding: "12px 26px", borderRadius: 999, background: `linear-gradient(90deg, ${MINT.green}, #14A374)`, boxShadow: `0 16px 36px -14px ${rgba(MINT.green, 0.8)}`, ...tx(30, 800, "#FFFFFF"), whiteSpace: "nowrap" }}>
            <Cross size={28} color="#FFFFFF" /> Avec PharmaBoost
          </span>
        )}
      </div>
    </Abs>
  );
}

/** Au centre, sur la ligne : « Même pharmacie », « Même ordonnance ». */
function CenterTags({ t }: { t: number }) {
  const tags = [
    { l: "Même pharmacie", at: w("D1", "même") - 0.08, out: w("D1", "même", 1) - 0.15 },
    { l: "Même ordonnance", at: w("D1", "même", 1) - 0.08, out: w("D1", "deux") - 0.2 },
  ];
  return (
    <>
      {tags.map((g) => {
        if (t < g.at || t > g.out + 0.35) return null;
        const o = prog(t, g.out, 0.3, IN_OUT);
        return (
          <Abs key={g.l} x={960} y={64} style={{ opacity: 1 - o }}>
            <div style={{ transform: `scale(${Math.min(1, pop(t, g.at)) * (1 - 0.3 * o)})`, padding: "12px 30px", borderRadius: 999, background: MINT.ink, ...tx(30, 800, "#FFFFFF"), whiteSpace: "nowrap", letterSpacing: "0.02em" }}>{g.l}</div>
          </Abs>
        );
      })}
    </>
  );
}

/** L'ordonnance qui jaillit de la ligne et se dédouble sur les deux comptoirs. */
function OrdonnanceDouble({ t }: { t: number }) {
  const a = w("D1", "ordonnance") - 0.18;
  const split = w("D1", "ordonnance") + 0.35;
  if (t < a || t >= ORD_LAND) return null;
  const k = Math.min(1, pop(t, a));
  const s = prog(t, split, ORD_LAND - split, IN_OUT);
  const land = toWin({ s: 0.72, fx: 1000, fy: 540 }, 1105, 561);
  const gx = (side: Side) => (side === "L" ? 0 : 960) + WIN.x + land.x;
  const gy = WIN.y + land.y;
  return (
    <>
      {(["L", "R"] as Side[]).map((side) => (
        <div key={side} style={{ position: "absolute", left: lerp(960, gx(side), s), top: lerp(500, gy, s) - Math.sin(Math.PI * s) * 80, width: 0, height: 0 }}>
          <div style={{ position: "absolute", left: 0, top: 0, transform: `translate(-50%, -50%) scale(${k * lerp(1, 0.54, s)}) rotate(${lerp(side === "L" ? -4 : 4, -8, s)}deg)`, filter: side === "L" && s > 0 ? `saturate(${1 - 0.8 * s})` : undefined }}>
            <Ordonnance lines={[{ name: "Isotrétinoïne 20 mg", dose: "1 capsule par jour, au repas" }]} w={200} mood={side === "L" && s > 0.5 ? "act1" : "pb"} />
          </div>
        </div>
      ))}
    </>
  );
}

/** La ligne de séparation : elle se trace au début, pulse à chaque changement de tableau, balaie la gauche à la fin. */
function Divider({ t, x }: { t: number; x: number }) {
  const draw = prog(t, 0.12, 0.75, IN_OUT);
  const out = prog(t, SWEEP + 0.5, 0.25);
  if (out >= 1) return null;
  const pulses = CHANGES.map((c) => prog(t, c - 0.15, 0.7, (u) => u)).filter((u) => u > 0 && u < 1);
  return (
    <div style={{ position: "absolute", left: x - 3, top: 0, width: 6, height: 1080 * draw, opacity: 1 - out }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 3, background: "#FFFFFF", boxShadow: `0 0 18px ${rgba(MINT.green, 0.7)}, 0 0 4px ${rgba("#FFFFFF", 0.9)}` }} />
      {draw < 1 && <div style={{ position: "absolute", left: -12, bottom: -12, width: 30, height: 30, borderRadius: 99, background: "#FFFFFF", boxShadow: `0 0 30px 10px ${rgba("#2BD67B", 0.8)}` }} />}
      {pulses.map((u, i) => (
        <div key={i} style={{ position: "absolute", left: -10, top: -120 + u * 1300, width: 26, height: 160, borderRadius: 99, background: `linear-gradient(180deg, transparent, ${rgba("#2BD67B", 0.95)}, transparent)`, filter: "blur(2px)" }} />
      ))}
    </div>
  );
}

function Film() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const sw = prog(t, SWEEP, 0.55, WHIP);
  const div = 960 * (1 - sw);
  const full = sw;
  const labelsOut = prog(t, w("D6", "qui") - 0.1, 0.35, IN_OUT);
  const showHalves = t < FIN + 0.5;
  return (
    <AbsoluteFill style={{ background: "#0F2B26" }}>
      {showHalves && (
        <>
          <Half side="R" div={div}>
            <div style={{ position: "absolute", left: -960, top: 0, width: 1920 + 960, height: 1080, background: "radial-gradient(70% 90% at 50% 10%, #FFFFFF 0%, #EAF6F0 60%, #D5EEE4 100%)" }} />
            <Bokeh t={t} count={12} seed={7} alpha={0.32} colors={[PB.citron, "#BFF2DA", PB.mint]} area={[0, 0, 960, 1080]} />
            <HalfContent t={t} side="R" full={full} />
            <LightLeak t={t} at={w("D2", "pharmaboost") - 0.2} dur={1.3} color={PB.citron} x={0.6} y={0.2} size={0.9} />
            <LightLeak t={t} at={w("D3", "pharmaboost") - 0.2} dur={1.2} color={PB.citron} x={0.3} y={0.15} size={0.8} />
          </Half>
          <Half side="L" div={div} style={{ filter: "saturate(.3) contrast(.96)" }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,#D9DDDD,#C3C9C8)" }} />
            <Shatter t={t} at={SWEEP - 0.02} w={960} h={1080} cols={5} rows={6} center={[640, 470]} power={900} gravity={1900} life={1.2}>
              <AbsoluteFill>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,#D9DDDD,#C3C9C8)" }} />
                <HalfContent t={Math.min(t, SWEEP)} side="L" />
              </AbsoluteFill>
            </Shatter>
          </Half>
          <TopLabel t={t} side="L" out={labelsOut} />
          <TopLabel t={t} side="R" out={labelsOut} />
          <CenterTags t={t} />
          <OrdonnanceDouble t={t} />
          <Divider t={t} x={div} />
          <Flash t={t} at={w("D1", "deux") - 0.05} dur={0.3} max={0.25} color="#FFFFFF" />
          <Flash t={t} at={SWEEP + 0.1} dur={0.35} max={0.35} color="#FFFFFF" />
          {sw > 0.6 && (
            <Abs x={960} y={150}>
              <Rise t={t} at={SWEEP + 0.35} text="Une pharmacie *qui se démarque.*" size={74} style={{ width: 1700 }} />
            </Abs>
          )}
        </>
      )}
      {t >= FIN - 0.1 && <Fin t={t} />}
      <Captions t={t} />
      <Grain t={t} opacity={0.02} />
      <Vignette strength={0.1} />
      {IDS.map((id) => (
        <Sequence key={`v-${id}`} from={Math.round(VAT[id] * FPS)} layout="none" name={`Voix ${id}`}>
          <Audio src={staticFile(`promo/voix/${id}.wav`)} volume={1} />
        </Sequence>
      ))}
      {MUSIC.map((m, i) => (
        <Sequence key={`m-${i}`} from={Math.round(m.at * FPS)} durationInFrames={Math.max(1, Math.round((m.to - m.from) * FPS))} layout="none" name={`Musique ${i}`}>
          <Audio src={staticFile("rembobine/music/musique.wav")} startFrom={Math.round(m.from * FPS)} volume={(f: number) => m.gain(m.at + f / FPS)} />
        </Sequence>
      ))}
      <Cues cues={SFX} />
    </AbsoluteFill>
  );
}

export const FILM = { Film, TOTAL_FRAMES: Math.round(TOTAL * FPS) };
