import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { JAKARTA, MONO, PB, clamp01, lerp, prog, rgba, IN_OUT, SNAP } from "../../rembobine/kit";
import { MINT } from "../../lettre/Lettre";

/**
 * FILM 1 « UNE JOURNÉE AU COMPTOIR » — le décor qui vit avec l'heure (fondateur, 6 nov. 2026).
 * Tout dépend de l'heure d'histoire `h` (8,98 → 21) : le ciel de la vitrine, le soleil qui traverse, les passants dont le pas
 * suit l'heure (au ralenti en temps normal, en traînées pendant l'accéléré), la lumière qui tourne sur le comptoir, les
 * suspensions qui s'allument le soir.
 */

// ---- Couleurs -------------------------------------------------------------------------------------------------------
function hexRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
export function mixHex(a: string, b: string, k: number) {
  const A = hexRgb(a);
  const B = hexRgb(b);
  const c = A.map((x, i) => Math.round(x + (B[i] - x) * clamp01(k)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function mixRgbStr(stops: [number, string][], h: number) {
  if (h <= stops[0][0]) return mixHex(stops[0][1], stops[0][1], 0);
  for (let i = 1; i < stops.length; i++) {
    const [a, ca] = stops[i - 1];
    const [b, cb] = stops[i];
    if (h <= b) return mixHex(ca, cb, (h - a) / (b - a));
  }
  const last = stops[stops.length - 1][1];
  return mixHex(last, last, 0);
}
const SKY_TOP: [number, string][] = [
  [8.5, "#5E78B8"],
  [9.2, "#8EC5F0"],
  [12, "#4FA8EE"],
  [16, "#5DA6E2"],
  [17.6, "#E79A66"],
  [18.6, "#C9677A"],
  [19.3, "#3E3F7C"],
  [20.4, "#0E1430"],
];
const SKY_BOT: [number, string][] = [
  [8.5, "#F6C29C"],
  [9.2, "#FFE7CC"],
  [12, "#D3EEFF"],
  [16, "#FFEBC2"],
  [17.6, "#FFD08A"],
  [18.6, "#F7A06E"],
  [19.3, "#E07C6A"],
  [20.4, "#27305E"],
];
export const skyTop = (h: number) => mixRgbStr(SKY_TOP, h);
export const skyBot = (h: number) => mixRgbStr(SKY_BOT, h);
/** 0 le jour, 1 la nuit. */
export const nightOf = (h: number) => clamp01((h - 18.4) / 1.6);
/** La hauteur du soleil (0 couché, 1 midi). */
export const sunOf = (h: number) => Math.max(0, Math.sin((Math.PI * (h - 7)) / 12.6));

// ---- L'heure affichée -----------------------------------------------------------------------------------------------
export function hhmm(h: number) {
  const tot = Math.floor(h * 60 + 1e-6);
  const H = Math.floor(tot / 60);
  const m = tot % 60;
  return `${H} h ${String(m).padStart(2, "0")}`;
}

/** Une horloge de comptoir : `h` l'heure, `sec` l'angle de la trotteuse (degrés). */
export function Clock({ h, sec, size, ring = 0 }: { h: number; sec: number; size: number; ring?: number }) {
  const ha = ((h % 12) / 12) * 360;
  const ma = (h % 1) * 360;
  const s = size;
  const shake = ring > 0 ? Math.sin(ring * 60) * 6 * (1 - ring) : 0;
  return (
    <svg width={s} height={s} viewBox="-100 -100 200 200" style={{ display: "block", overflow: "visible", transform: `rotate(${shake}deg)` }}>
      <circle r={96} fill="#FFFFFF" stroke={PB.green} strokeWidth={7} />
      <circle r={88} fill="none" stroke={rgba(MINT.green, 0.12)} strokeWidth={6} />
      {Array.from({ length: 60 }, (_, i) => {
        const big = i % 5 === 0;
        const a = (i / 60) * Math.PI * 2;
        const r1 = big ? 70 : 78;
        return <line key={i} x1={Math.sin(a) * r1} y1={-Math.cos(a) * r1} x2={Math.sin(a) * 84} y2={-Math.cos(a) * 84} stroke={big ? PB.green : rgba(PB.green, 0.35)} strokeWidth={big ? 4.5 : 1.6} strokeLinecap="round" />;
      })}
      <g transform={`rotate(${ha})`}>
        <line y1={10} y2={-46} stroke={PB.green} strokeWidth={9} strokeLinecap="round" />
      </g>
      <g transform={`rotate(${ma})`}>
        <line y1={12} y2={-68} stroke={PB.green} strokeWidth={6} strokeLinecap="round" />
      </g>
      <g transform={`rotate(${sec})`}>
        <line y1={18} y2={-76} stroke="#E0533F" strokeWidth={2.6} strokeLinecap="round" />
        <circle cy={-60} r={4.5} fill="#E0533F" />
      </g>
      <circle r={7} fill={PB.green} />
      <circle r={3} fill="#E0533F" />
    </svg>
  );
}

// ---- La vitrine ------------------------------------------------------------------------------------------------------
export const WIN = { x: 100, y: 128, w: 1720, h: 610 } as const;
export const COUNTER_Y = 792;

function seeded(i: number, k = 1) {
  const v = Math.sin(i * 127.1 * k + 311.7) * 43758.5453;
  return v - Math.floor(v);
}
const BUILDINGS = Array.from({ length: 16 }, (_, i) => ({ x: WIN.x - 40 + i * 118, w: 96 + seeded(i) * 40, top: 260 + seeded(i, 3) * 200 }));
const WALKERS = Array.from({ length: 7 }, (_, i) => ({ seed: seeded(i, 7), color: ["#F0BAC6", "#8EEBD3", "#F6D98A", "#9CC7F0", "#C9B8F0", "#F4B59A", "#B8E0C8"][i], dir: i % 2 ? 1 : -1, s: 0.75 + seeded(i, 9) * 0.3 }));

/**
 * Le fond de la pharmacie : mur, vitrine sur la rue (ciel, soleil, immeubles, passants), suspensions.
 * `speed` = dh/dt (heures par seconde) : au-delà de 0,3 les passants deviennent des traînées.
 */
export function Back({ t, h, speed, shutter = 0 }: { t: number; h: number; speed: number; shutter?: number }) {
  const night = nightOf(h);
  const sun = sunOf(h);
  const u = clamp01((h - 7) / 12.6);
  const sx = lerp(WIN.x + 60, WIN.x + WIN.w - 60, u);
  const sy = WIN.y + WIN.h - 40 - sun * 360;
  const sunCol = mixHex("#FFF3B0", "#FF9A4A", clamp01((h - 16.5) / 2));
  const bld = mixHex("#D3DEE6", "#1B2446", night);
  const bld2 = mixHex("#BCCAD6", "#141B36", night);
  const lamps = clamp01((h - 17.8) / 1.2);
  const streak = clamp01((speed - 0.25) / 1.2);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${mixHex("#FFFFFF", "#D9D4E6", night * 0.7)} 0%, ${mixHex("#E9F1EE", "#BFC3D6", night * 0.7)} 100%)` }} />
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <linearGradient id="f1sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop(h)} />
            <stop offset="100%" stopColor={skyBot(h)} />
          </linearGradient>
          <radialGradient id="f1sun">
            <stop offset="0%" stopColor={sunCol} stopOpacity={0.9} />
            <stop offset="100%" stopColor={sunCol} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="f1glow" cx="0.5" cy="0" r="0.9">
            <stop offset="0%" stopColor="#FFE7A8" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#FFE7A8" stopOpacity={0} />
          </radialGradient>
          <clipPath id="f1win">
            <rect x={WIN.x} y={WIN.y} width={WIN.w} height={WIN.h} />
          </clipPath>
        </defs>
        <g clipPath="url(#f1win)">
          <rect x={WIN.x} y={WIN.y} width={WIN.w} height={WIN.h} fill="url(#f1sky)" />
          {/* étoiles */}
          {night > 0.05 &&
            Array.from({ length: 50 }, (_, i) => <circle key={i} cx={WIN.x + seeded(i, 2) * WIN.w} cy={WIN.y + seeded(i, 5) * 220} r={1 + seeded(i, 4) * 1.8} fill="#FFFFFF" opacity={night * (0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i)))} />)}
          {/* soleil */}
          {sun > 0 && (
            <g opacity={clamp01(sun * 3)}>
              <circle cx={sx} cy={sy} r={170} fill="url(#f1sun)" />
              <circle cx={sx} cy={sy} r={46} fill={sunCol} />
            </g>
          )}
          {/* lune */}
          {night > 0 && <circle cx={1560} cy={220} r={34} fill="#F4F1DE" opacity={night} />}
          {night > 0 && <circle cx={1574} cy={210} r={30} fill={skyTop(h)} opacity={night} />}
          {/* immeubles d'en face */}
          {BUILDINGS.map((b, i) => (
            <g key={i}>
              <rect x={b.x} y={b.top} width={b.w} height={WIN.y + WIN.h - b.top} fill={i % 2 ? bld : bld2} />
              {Array.from({ length: 8 }, (_, r) =>
                Array.from({ length: 3 }, (_, c) => {
                  const y = b.top + 22 + r * 34;
                  if (y > WIN.y + WIN.h - 90) return null;
                  const on = seeded(i * 31 + r * 7 + c, 11) > 0.45;
                  return <rect key={`${r}-${c}`} x={b.x + 14 + c * ((b.w - 28) / 3)} y={y} width={(b.w - 28) / 3 - 10} height={18} rx={2} fill={on && night > 0.2 ? "#FFD98A" : mixHex("#EEF4F8", "#2A3560", night)} opacity={on && night > 0.2 ? 0.4 + 0.6 * night : 0.8} />;
                }),
              )}
            </g>
          ))}
          {/* trottoir */}
          <rect x={WIN.x} y={WIN.y + WIN.h - 62} width={WIN.w} height={62} fill={mixHex("#E6E9E4", "#252B45", night)} />
          {/* passants : leur pas suit l'heure */}
          {WALKERS.map((p, i) => {
            const raw = (p.seed + h * 5 * p.s * p.dir) % 1;
            const k = raw < 0 ? raw + 1 : raw;
            const x = WIN.x - 60 + k * (WIN.w + 120);
            const y = WIN.y + WIN.h - 18;
            const bob = Math.abs(Math.sin(h * 140 * p.s + i)) * 6 * (1 - streak);
            const len = 40 + 260 * streak;
            return (
              <g key={i} opacity={0.85 - 0.45 * streak}>
                {streak > 0.05 ? (
                  <rect x={p.dir > 0 ? x - len : x} y={y - 120} width={len} height={110} rx={40} fill={p.color} opacity={0.55} />
                ) : (
                  <g transform={`translate(${x} ${y - bob})`}>
                    <circle cy={-104} r={17} fill={p.color} />
                    <rect x={-24} y={-84} width={48} height={84} rx={22} fill={p.color} style={{ filter: "brightness(.9)" }} />
                  </g>
                )}
              </g>
            );
          })}
          {/* reflet sur la vitre */}
          <path d={`M${WIN.x + 200} ${WIN.y} l140 0 l-260 ${WIN.h} l-140 0 Z`} fill="#FFFFFF" opacity={0.12} />
          <path d={`M${WIN.x + 1000} ${WIN.y} l60 0 l-260 ${WIN.h} l-60 0 Z`} fill="#FFFFFF" opacity={0.1} />
        </g>
        {/* le rideau métallique (fermé le matin, baissé le soir) */}
        {shutter > 0 && (
          <g clipPath="url(#f1win)">
            <g transform={`translate(0 ${-(1 - shutter) * WIN.h})`}>
              <rect x={WIN.x} y={WIN.y} width={WIN.w} height={WIN.h} fill={mixHex("#AEB8B6", "#5C6478", night)} />
              {Array.from({ length: 16 }, (_, i) => (
                <rect key={i} x={WIN.x} y={WIN.y + i * 31} width={WIN.w} height={4} fill="#000" opacity={0.12} />
              ))}
              <rect x={WIN.x} y={WIN.y + WIN.h - 18} width={WIN.w} height={18} fill={mixHex("#8D9896", "#3E4558", night)} />
            </g>
          </g>
        )}
        {/* cadre et meneaux */}
        <rect x={WIN.x - 10} y={WIN.y - 10} width={WIN.w + 20} height={WIN.h + 20} rx={10} fill="none" stroke="#FFFFFF" strokeWidth={20} />
        <rect x={WIN.x - 20} y={WIN.y - 20} width={WIN.w + 40} height={WIN.h + 40} rx={14} fill="none" stroke={rgba(MINT.ink, 0.08)} strokeWidth={2} />
        {[WIN.x + WIN.w / 3, WIN.x + (2 * WIN.w) / 3].map((x) => (
          <rect key={x} x={x - 8} y={WIN.y} width={16} height={WIN.h} fill="#FFFFFF" />
        ))}
        {/* le plafonnier du soir */}
        {lamps > 0 && <rect x={0} y={0} width={1920} height={1080} fill="url(#f1glow)" opacity={lamps} />}
      </svg>
    </AbsoluteFill>
  );
}

/** Le comptoir, devant tout ce qui est derrière (la pharmacienne) ; la lumière de la vitrine glisse dessus avec l'heure. */
export function CounterFront({ h }: { h: number }) {
  const sun = sunOf(h);
  const night = nightOf(h);
  const dx = (13 - h) * 70;
  const warm = mixHex("#FFF8D8", "#FFC27A", clamp01((h - 15.5) / 2.5));
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
      <defs>
        <linearGradient id="f1front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={mixHex("#17463D", "#122C3C", night)} />
          <stop offset="100%" stopColor={mixHex("#0A2622", "#081522", night)} />
        </linearGradient>
        <clipPath id="f1top">
          <rect x={0} y={COUNTER_Y - 30} width={1920} height={60} />
        </clipPath>
      </defs>
      <rect x={0} y={COUNTER_Y - 30} width={1920} height={60} fill={mixHex("#FFFFFF", "#D8DCE8", night * 0.6)} />
      {/* la lumière des trois carreaux, qui tourne avec le soleil */}
      <g clipPath="url(#f1top)" opacity={0.75 * sun}>
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M${260 + i * 573 + dx} ${COUNTER_Y - 30} l520 0 l${-90 + dx * 0.25} 60 l-520 0 Z`} fill={warm} />
        ))}
      </g>
      <rect x={0} y={COUNTER_Y + 28} width={1920} height={4} fill={rgba("#000000", 0.12)} />
      <rect x={0} y={COUNTER_Y + 30} width={1920} height={1080 - COUNTER_Y - 30} fill="url(#f1front)" />
      {[320, 960, 1600].map((x) => (
        <rect key={x} x={x - 280} y={COUNTER_Y + 70} width={560} height={230} rx={16} fill="#FFFFFF" opacity={0.04} />
      ))}
      <g transform={`translate(960 ${COUNTER_Y + 100})`} opacity={0.9}>
        <path d="M-14 -40h28v26h26v28h-26v26h-28v-26h-26v-28h26z" fill="#2BD67B" opacity={0.85} />
      </g>
    </svg>
  );
}

// ---- La bande de l'heure (en haut) ------------------------------------------------------------------------------------
const TRACK = { x0: 470, x1: 1840, y: 66 } as const;
export function TimeRibbon({ t, h, label, opacity }: { t: number; h: number; label: string; opacity: number }) {
  if (opacity <= 0) return null;
  const k = clamp01((h - 8) / 12.5);
  const x = lerp(TRACK.x0, TRACK.x1, k);
  const marks = [9, 11, 16, 19];
  return (
    <div style={{ position: "absolute", inset: 0, opacity }}>
      <div style={{ position: "absolute", left: 40, top: 30, height: 72, display: "flex", alignItems: "center", gap: 14, padding: "0 22px 0 86px", borderRadius: 999, background: "rgba(255,255,255,.94)", boxShadow: "0 14px 34px -18px rgba(15,43,38,.55)", whiteSpace: "nowrap" }}>
        <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 32, color: PB.green, fontVariantNumeric: "tabular-nums" }}>{hhmm(h)}</span>
        {label && <span style={{ width: 2, height: 30, background: rgba(MINT.green, 0.25) }} />}
        {label && <span style={{ fontFamily: JAKARTA, fontWeight: 700, fontSize: 22, color: MINT.soft, maxWidth: 210, overflow: "hidden", textOverflow: "clip" }}>{label}</span>}
      </div>
      <svg width={1920} height={140} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <line x1={TRACK.x0} y1={TRACK.y} x2={TRACK.x1} y2={TRACK.y} stroke="rgba(255,255,255,.9)" strokeWidth={12} strokeLinecap="round" />
        <line x1={TRACK.x0} y1={TRACK.y} x2={TRACK.x1} y2={TRACK.y} stroke={rgba(MINT.ink, 0.12)} strokeWidth={6} strokeLinecap="round" />
        <line x1={TRACK.x0} y1={TRACK.y} x2={x} y2={TRACK.y} stroke={MINT.green} strokeWidth={6} strokeLinecap="round" />
        {marks.map((m) => {
          const mx = lerp(TRACK.x0, TRACK.x1, (m - 8) / 12.5);
          const on = h >= m - 0.01;
          return (
            <g key={m}>
              <circle cx={mx} cy={TRACK.y} r={on ? 9 : 7} fill={on ? MINT.green : "#FFFFFF"} stroke={on ? "#FFFFFF" : rgba(MINT.ink, 0.3)} strokeWidth={3} />
              <text x={mx} y={TRACK.y + 40} textAnchor="middle" fontFamily={JAKARTA} fontWeight={800} fontSize={20} fill={on ? PB.green : rgba(MINT.ink, 0.45)} style={{ paintOrder: "stroke", stroke: "rgba(255,255,255,.85)", strokeWidth: 5 }}>
                {m} h
              </text>
            </g>
          );
        })}
        <circle cx={x} cy={TRACK.y} r={15 + 3 * Math.sin(t * 6)} fill={rgba(MINT.green, 0.25)} />
        <circle cx={x} cy={TRACK.y} r={10} fill={PB.citron} stroke={PB.green} strokeWidth={4} />
      </svg>
    </div>
  );
}

/** Traînées de vitesse pendant l'accéléré. */
export function SpeedLines({ t, k }: { t: number; k: number }) {
  if (k <= 0.01) return null;
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, opacity: k }}>
      {Array.from({ length: 26 }, (_, i) => {
        const y = 60 + seeded(i, 13) * 900;
        const len = 200 + seeded(i, 17) * 500;
        const x = ((seeded(i, 19) * 2400 + t * (2600 + seeded(i, 23) * 2000)) % 2600) - 400;
        return <rect key={i} x={x} y={y} width={len} height={3 + seeded(i, 29) * 4} rx={3} fill={i % 3 ? "#FFFFFF" : PB.citron} opacity={0.5} />;
      })}
    </svg>
  );
}

export function Layer({ children, opacity = 1, scale = 1, origin = "50% 50%", blur = 0 }: { children: ReactNode; opacity?: number; scale?: number; origin?: string; blur?: number }) {
  if (opacity <= 0) return null;
  return <AbsoluteFill style={{ opacity, transform: scale !== 1 ? `scale(${scale})` : undefined, transformOrigin: origin, filter: blur > 0.05 ? `blur(${blur}px)` : undefined }}>{children}</AbsoluteFill>;
}

export { prog, IN_OUT, SNAP };
