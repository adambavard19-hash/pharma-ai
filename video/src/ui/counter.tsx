import { C, MONO, SHADOW, tw, sp, useF } from "../theme";

/**
 * La douchette, la boîte et son code-barres : dessinés à plat, dans la
 * palette. Le laser est menthe (brand-300) plutôt que rouge : la marque
 * n'utilise pas le rouge.
 */

const BARS = Array.from({ length: 46 }, (_, i) => 1 + ((i * 7919 + 13) % 4));

export function Barcode({ w, h, lit = 0 }: { w: number; h: number; lit?: number }) {
  const total = BARS.reduce((s, b) => s + b + 1.4, 0);
  let x = 0;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${total} 100`} preserveAspectRatio="none">
      {BARS.map((b, i) => {
        const r = <rect key={i} x={x} y={0} width={b} height={100} fill={lit > 0 ? mix(C.ink900, C.brand500, lit) : C.ink900} />;
        x += b + 1.4;
        return r;
      })}
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
            <div style={{ fontSize: w * 0.072, fontWeight: 600, color: C.ink900, letterSpacing: "-0.01em" }}>{name}</div>
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

/** La douchette, vue de profil, nez à gauche. */
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

/** Le faisceau : du nez de la douchette à une ligne horizontale qui traverse les barres. */
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

/** Une onde qui part du point bipé. */
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

/**
 * La fenêtre du logiciel de gestion : générique, sans marque d'éditeur, comme
 * la maquette du site. Les lignes arrivent au bip, avec la puce « bip ».
 */
export function LgoWindow({ w, lines, title = "Logiciel de gestion de l'officine — Vente", post = "Poste comptoir 1" }: { w: number; lines: { text: string; at: number }[]; title?: string; post?: string }) {
  const f = useF();
  return (
    <div style={{ width: w, borderRadius: 24, border: `1px solid ${C.ink200}`, background: C.ink100, padding: 16, boxShadow: SHADOW.card }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "2px 6px 14px" }}>
        {[0, 1, 2].map((i) => <span key={i} style={{ width: 14, height: 14, borderRadius: 7, background: C.ink300 }} />)}
        <span style={{ marginLeft: 12, fontSize: 19, color: C.ink500 }}>{title}</span>
        <span style={{ marginLeft: "auto", fontSize: 17, color: C.ink400 }}>{post}</span>
      </div>
      <div style={{ borderRadius: 14, background: C.white, padding: 26, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, letterSpacing: "0.1em", textTransform: "uppercase", color: C.ink400, fontWeight: 600, padding: "0 4px" }}>
          <span>Délivrance</span>
          <span>Code</span>
        </div>
        {lines.map((line) => {
          const p = sp(f, line.at, { damping: 24, stiffness: 170 });
          const ring = tw(f, [line.at, line.at + 36], [1, 0]);
          if (f < line.at) return <div key={line.text} style={{ height: 66 }} />;
          return (
            <div
              key={line.text}
              style={{
                height: 66,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderRadius: 10,
                border: `1.5px solid ${mix(C.ink200, C.brand400, ring)}`,
                boxShadow: `0 0 0 ${5 * ring}px ${C.brand200}`,
                padding: "0 22px",
                transform: `translateY(${(1 - p) * 16}px)`,
                opacity: p,
                fontFamily: MONO,
                fontSize: 25,
                color: C.ink700,
              }}
            >
              <span>{line.text}</span>
              <span style={{ fontFamily: "inherit", fontSize: 17, color: C.ink500, background: C.ink100, borderRadius: 999, padding: "4px 14px" }}>bip</span>
            </div>
          );
        })}
        <div style={{ height: 96, borderRadius: 10, border: `1.5px dashed ${C.ink200}`, display: "flex", alignItems: "center", padding: "0 22px", fontFamily: MONO, fontSize: 20, color: C.ink300 }}>
          Scanner un produit{Math.floor(f / 15) % 2 === 0 ? "▍" : " "}
        </div>
      </div>
    </div>
  );
}

/** La douchette placée par son nez (nx, ny), tournée autour de lui. */
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
