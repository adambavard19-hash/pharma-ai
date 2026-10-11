import { C, FONT, SHADOW, tw, sp, useF } from "../theme";

/**
 * Le lecteur de codes-barres, la boîte et son code-barres : dessinés à plat,
 * dans la palette. Le faisceau est menthe (brand-300) plutôt que rouge : la
 * marque n'utilise pas le rouge. À l'écran, on dit « scan », jamais autre chose.
 */

const BARS = Array.from({ length: 46 }, (_, i) => 1 + ((i * 7919 + 13) % 4));

/** Le bord gauche de chaque barre, calculé une fois (le rendu ne réassigne rien). */
const BAR_X = BARS.map((_, i) => BARS.slice(0, i).reduce((s, b) => s + b + 1.4, 0));
const BARS_W = BARS.reduce((s, b) => s + b + 1.4, 0);

export function Barcode({ w, h, lit = 0 }: { w: number; h: number; lit?: number }) {
  return (
    <svg width={w} height={h} viewBox={`0 0 ${BARS_W} 100`} preserveAspectRatio="none">
      {BARS.map((b, i) => <rect key={i} x={BAR_X[i]} y={0} width={b} height={100} fill={lit > 0 ? mix(C.ink900, C.brand500, lit) : C.ink900} />)}
    </svg>
  );
}

/** Mélange linéaire de deux couleurs hex. */
export function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",")})`;
}

/** La boîte de médicament, légèrement de trois quarts. */
export function MedBox({ name, form, w = 460, lit = 0, tilt = -16 }: { name: string; form: string; w?: number; lit?: number; tilt?: number }) {
  const h = w * 0.56;
  return (
    <div style={{ width: w, height: h, perspective: 1600 }}>
      <div style={{ position: "relative", width: w, height: h, transform: `rotateY(${tilt}deg) rotateX(6deg)`, transformStyle: "preserve-3d" }}>
        {/* tranche */}
        <div style={{ position: "absolute", top: 0, right: -w * 0.08 + 1, width: w * 0.08, height: h, background: `linear-gradient(90deg, ${C.ink200}, ${C.ink300})`, clipPath: "polygon(0 0, 100% 7%, 100% 93%, 0 100%)" }} />
        {/* face */}
        <div style={{ position: "absolute", inset: 0, borderRadius: 14, background: C.white, boxShadow: SHADOW.lift, overflow: "hidden", border: `1px solid ${C.ink200}` }}>
          <div style={{ height: h * 0.07, background: `linear-gradient(90deg, ${C.brand600}, ${C.brand400})` }} />
          <div style={{ padding: `${h * 0.08}px ${w * 0.06}px` }}>
            {/* Plus Jakarta Sans a des espaces étroites : sans `wordSpacing`, « AMOXICILLINE 1 g » se lit d'un seul bloc. */}
            <div style={{ fontSize: w * 0.072, fontWeight: 700, color: C.ink900, letterSpacing: "-0.01em", wordSpacing: "0.12em" }}>{name}</div>
            <div style={{ fontSize: w * 0.036, color: C.ink500, marginTop: 4 }}>{form}</div>
          </div>
          <div style={{ position: "absolute", right: w * 0.06, bottom: h * 0.1, padding: 8, background: C.white, borderRadius: 6, boxShadow: lit > 0 ? `0 0 0 ${4 * lit}px ${C.brand200}, 0 0 ${40 * lit}px ${C.brand300}` : "none" }}>
            <Barcode w={w * 0.4} h={h * 0.3} lit={lit} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Le lecteur de codes-barres, vu de profil, nez à gauche. */
export function Scanner({ w = 300, led = 0 }: { w?: number; led?: number }) {
  return (
    <svg width={w} height={w * 0.88} viewBox="0 0 300 264">
      <defs>
        <linearGradient id="sc-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.ink700} />
          <stop offset="100%" stopColor={C.ink900} />
        </linearGradient>
        <linearGradient id="sc-grip" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={C.ink800} />
          <stop offset="100%" stopColor={C.ink950} />
        </linearGradient>
      </defs>
      <path d="M150 112 L224 114 L252 236 Q256 258 236 260 L198 262 Q178 262 174 246 Z" fill="url(#sc-grip)" />
      <path d="M138 118 Q146 150 162 154 L170 124 Z" fill={C.ink600} />
      <path d="M34 62 Q34 30 64 28 L222 20 Q252 20 254 50 L258 92 Q260 120 232 122 L74 128 Q40 130 36 100 Z" fill="url(#sc-body)" />
      <path d="M64 34 L222 26 Q246 26 248 46" stroke="rgba(255,255,255,.18)" strokeWidth={4} fill="none" strokeLinecap="round" />
      <rect x={18} y={50} width={26} height={62} rx={9} fill={C.ink950} />
      <rect x={24} y={56} width={12} height={50} rx={5} fill={mix(C.ink800, C.brand300, led)} opacity={0.6 + 0.4 * led} />
      <circle cx={204} cy={52} r={7} fill={mix(C.ink600, C.brand300, led)} />
      {led > 0 && <circle cx={204} cy={52} r={7 + 14 * led} fill={C.brand300} opacity={0.25 * led} />}
    </svg>
  );
}

/** Le faisceau : du nez du lecteur à une ligne horizontale qui traverse les barres. */
export function Laser({ from, to, spread, on }: { from: [number, number]; to: [number, number]; spread: number; on: number }) {
  if (on <= 0) return null;
  const [x1, y1] = from;
  const [x2, y2] = to;
  const a = x2 - spread / 2, b = x2 + spread / 2;
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", overflow: "visible" }}>
      <defs>
        <linearGradient id="beam" x1={x1} y1={y1} x2={x2} y2={y2} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={C.brand300} stopOpacity={0.6 * on} />
          <stop offset="100%" stopColor={C.brand300} stopOpacity={0.1 * on} />
        </linearGradient>
      </defs>
      <polygon points={`${x1},${y1 - 3} ${x1},${y1 + 3} ${b},${y2} ${a},${y2}`} fill="url(#beam)" />
      <line x1={a} y1={y2} x2={b} y2={y2} stroke={C.brand300} strokeWidth={16} opacity={0.3 * on} strokeLinecap="round" />
      <line x1={a} y1={y2} x2={b} y2={y2} stroke={C.brand100} strokeWidth={4} opacity={on} strokeLinecap="round" />
    </svg>
  );
}

/** Une onde qui part du point scanné. */
export function Ripple({ x, y, at, color = C.brand300, max = 520 }: { x: number; y: number; at: number; color?: string; max?: number }) {
  const f = useF();
  if (f < at || f > at + 40) return null;
  return (
    <>
      {[0, 7].map((d) => {
        const p = tw(f, [at + d, at + d + 30], [0, 1]);
        return (
          <div key={d} style={{ position: "absolute", left: x - (max * p) / 2, top: y - (max * p) / 2, width: max * p, height: max * p, borderRadius: "50%", border: `3px solid ${color}`, opacity: (1 - p) * 0.9 }} />
        );
      })}
    </>
  );
}

/** Une ligne de la vente : la désignation, la quantité, le prix, et l'image où elle arrive (au scan). */
export type LgoLine = { text: string; at: number; qty?: string; price?: string };

/** « DOXYCYCLINE 100 mg cp séc. — 1 boîte » → la désignation et la quantité (l'ancienne écriture des lignes). */
function splitLine(line: LgoLine) {
  const m = line.text.match(/^(.*?)\s+—\s+(\d+)\s+boîtes?$/);
  return { name: m ? m[1] : line.text, qty: line.qty ?? (m ? m[2] : "1"), price: line.price ?? "" };
}

/**
 * La fenêtre du logiciel de gestion : générique, sans marque d'éditeur, comme
 * le faux logiciel de l'aperçu de la bannière (agent/src/banner-preview.ts).
 * Chaque ligne arrive au scan, entourée un instant. `w` fixe l'échelle (1100 px
 * = la taille de référence).
 */
export function LgoWindow({ w, h, lines, title = "Logiciel de gestion · Comptoir 1" }: { w: number; h?: number; lines: LgoLine[]; title?: string }) {
  const f = useF();
  const k = w / 1100;
  const col = `${2.6}fr ${0.8}fr ${0.9}fr ${0.9}fr`;
  const total = lines.filter((l) => f >= l.at).reduce((s, l) => s + (parseFloat(splitLine(l).price.replace(",", ".")) || 0) * (parseInt(splitLine(l).qty, 10) || 1), 0);
  return (
    <div style={{ position: "relative", width: w, height: h, borderRadius: 14 * k, background: "#F4F6F8", boxShadow: "0 2px 16px rgba(10,30,45,.14), 0 30px 70px -30px rgba(10,30,45,.3)", overflow: "hidden", color: "#2B3A46", fontFamily: FONT, border: "1px solid #D5DDE3" }}>
      <div style={{ height: 50 * k, background: "#E6EBEF", display: "flex", alignItems: "center", padding: `0 ${18 * k}px`, gap: 10 * k, borderBottom: "1px solid #D5DDE3", fontWeight: 600, fontSize: 19 * k, color: "#51616D" }}>
        {[0, 1, 2].map((i) => <span key={i} style={{ width: 15 * k, height: 15 * k, borderRadius: "50%", background: "#C3CCD3" }} />)}
        <span style={{ marginLeft: 8 * k }}>{title}</span>
        <span style={{ marginLeft: "auto", letterSpacing: "0.3em", color: "#8A98A3" }}>– ☐ ✕</span>
      </div>
      <div style={{ height: 46 * k, background: "#F9FAFB", borderBottom: "1px solid #E3E8EC", display: "flex", gap: 34 * k, alignItems: "center", padding: `0 ${24 * k}px`, fontSize: 18 * k, color: "#6D7D89" }}>
        {["Dossier", "Délivrance", "Stock", "Commandes", "Gestion"].map((m) => <span key={m} style={{ color: m === "Délivrance" ? "#2B3A46" : undefined, fontWeight: m === "Délivrance" ? 600 : 400 }}>{m}</span>)}
      </div>
      <div style={{ padding: `${20 * k}px ${24 * k}px`, display: "flex", flexDirection: "column", gap: 11 * k }}>
        <div style={{ display: "grid", gridTemplateColumns: col, gap: 16 * k, padding: `${12 * k}px ${16 * k}px`, background: "#EAF0F4", border: "1px solid #E3E8EC", borderRadius: 8 * k, color: "#6D7D89", fontWeight: 600, fontSize: 18 * k }}>
          <span>Désignation</span><span>Quantité</span><span>Prix</span><span>Total</span>
        </div>
        {lines.map((line) => {
          const { name, qty, price } = splitLine(line);
          const p = sp(f, line.at, { damping: 24, stiffness: 170 });
          const ring = tw(f, [line.at, line.at + 40], [1, 0]);
          // Une ligne n'existe qu'une fois scannée : la saisie descend à mesure.
          if (f < line.at) return null;
          return (
            <div
              key={line.text}
              style={{
                height: 56 * k,
                display: "grid",
                gridTemplateColumns: col,
                gap: 16 * k,
                alignItems: "center",
                padding: `0 ${16 * k}px`,
                background: C.white,
                borderRadius: 8 * k,
                border: `1.5px solid ${mix("#E3E8EC", C.brand400, ring)}`,
                boxShadow: `0 0 0 ${5 * ring * k}px ${C.brand100}`,
                transform: `translateY(${(1 - p) * 14 * k}px)`,
                opacity: p,
                fontSize: 21 * k,
              }}
            >
              <b style={{ color: "#34495A", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</b>
              <span>{qty}</span>
              <span>{price}</span>
              <b style={{ color: "#34495A", fontWeight: 700 }}>{price}</b>
            </div>
          );
        })}
        <div style={{ height: 56 * k, borderRadius: 8 * k, border: `1.5px dashed ${C.ink300}`, display: "flex", alignItems: "center", padding: `0 ${16 * k}px`, fontSize: 19 * k, color: C.ink400 }}>
          Scanner un produit{Math.floor(f / 15) % 2 === 0 ? "▍" : " "}
        </div>
      </div>
      {/* Sans hauteur imposée, les boutons suivent les lignes ; sinon ils restent en bas de la fenêtre. */}
      <div style={{ ...(h ? { position: "absolute", left: 24 * k, right: 24 * k, bottom: 20 * k } : { margin: `${4 * k}px ${24 * k}px ${20 * k}px` }), display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 14 * k, fontSize: 19 * k }}>
        {total > 0 && <span style={{ marginRight: "auto", color: "#51616D", fontWeight: 600 }}>Total {total.toFixed(2).replace(".", ",")} €</span>}
        <span style={{ background: "#5A6B78", color: C.white, padding: `${12 * k}px ${26 * k}px`, borderRadius: 7 * k, fontWeight: 700 }}>Annuler</span>
        <span style={{ background: "#2E7D5A", color: C.white, padding: `${12 * k}px ${26 * k}px`, borderRadius: 7 * k, fontWeight: 700 }}>Valider</span>
      </div>
    </div>
  );
}

/** Le lecteur placé par son nez (nx, ny), tourné autour de lui. */
export function ScannerAt({ nx, ny, w, deg = 0, led = 0 }: { nx: number; ny: number; w: number; deg?: number; led?: number }) {
  const k = w / 300;
  return (
    <div style={{ position: "absolute", left: nx - 31 * k, top: ny - 81 * k, transformOrigin: `${31 * k}px ${81 * k}px`, transform: `rotate(${deg}deg)` }}>
      <Scanner w={w} led={led} />
    </div>
  );
}

/** Le centre du code-barres d'une MedBox posée en (x, y) avec la largeur w. */
export function barcodeCenter(x: number, y: number, w: number): [number, number] {
  const h = w * 0.56;
  return [x + w - 0.06 * w - (0.4 * w + 16) / 2, y + h - 0.1 * h - (0.3 * h + 16) / 2];
}
