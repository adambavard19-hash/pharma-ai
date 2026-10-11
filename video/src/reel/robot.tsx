import { useId, type CSSProperties } from "react";
import { BANNER } from "../../../agent/src/banner-design";

/**
 * Le robot du logo, qui flotte : le portage image par image de l'en-tête du site
 * (src/app/(public)/decouvrir/_components/floating-robot.tsx). Mêmes keyframes, recalculées au temps `t` (en
 * secondes) parce que Remotion exige un rendu déterministe : il monte et descend en penchant la tête (3,6 s), son
 * ombre rétrécit quand il s'élève, il cligne des yeux (4,2 s), regarde à gauche puis à droite (7 s), sa lampe pulse
 * (2 s) et l'étoile scintille (1,6 s). Même dessin que public/logo-robot.svg (scripts/logo-robot.ts).
 *
 * `happy` ferme les yeux en deux arcs, comme la mascotte de la bannière quand une vente se termine.
 */
const K = BANNER.colors;

const wave = (t: number, period: number) => 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / period);
const lerp = (a: number, b: number, x: number) => a + (b - a) * Math.max(0, Math.min(1, x));

/** pbr-blink : 1 jusqu'à 92 %, 0,1 à 95 %, 1 à 100 %. */
function blink(t: number) {
  const p = (t % 4.2) / 4.2;
  if (p < 0.92) return 1;
  return p < 0.95 ? lerp(1, 0.1, (p - 0.92) / 0.03) : lerp(0.1, 1, (p - 0.95) / 0.05);
}

/** pbr-look : au centre, à gauche (40–55 %), à droite (65–85 %), de retour au centre. */
function look(t: number) {
  const p = (t % 7) / 7;
  const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, x)));
  if (p < 0.3) return 0;
  if (p < 0.4) return -3 * ease((p - 0.3) / 0.1);
  if (p < 0.55) return -3;
  if (p < 0.65) return lerp(-3, 3, ease((p - 0.55) / 0.1));
  if (p < 0.85) return 3;
  return lerp(3, 0, ease((p - 0.85) / 0.15));
}

export function FloatingRobot({ size, t, happy = false, glow = 1, style }: { size: number; t: number; happy?: boolean; glow?: number; style?: CSSProperties }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const f = wave(t, 3.6);
  const lift = -7 * f;
  const tilt = -3 + 6 * f;
  const g = wave(t, 2);
  const s = wave(t, 1.6);
  const lids = happy ? 1 : blink(t);
  const eye = (cx: number) =>
    happy ? (
      <path key={cx} d={`M ${cx - 5.4} 44 A 5.5 5 0 0 1 ${cx + 5.4} 44`} fill="none" stroke={K.eye} strokeWidth={3.2} strokeLinecap="round" />
    ) : (
      <g key={cx}>
        <ellipse cx={cx} cy={42} rx={4.8} ry={6.4} fill={K.eye} />
        <circle cx={cx - 1.5} cy={39.4} r={1.7} fill="#fff" fillOpacity={0.85} />
      </g>
    );
  return (
    <svg viewBox="0 0 100 118" width={size} height={(size * 118) / 100} style={{ display: "block", overflow: "visible", ...style }}>
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={K.shellTop} /><stop offset="1" stopColor={K.shellBottom} /></linearGradient>
        <linearGradient id={`${id}e`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={K.screenTop} /><stop offset="1" stopColor={K.screenBottom} /></linearGradient>
        <linearGradient id={`${id}r`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={K.ear} /><stop offset="1" stopColor="#12968C" /></linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={K.accent} /><stop offset="1" stopColor={K.accentDark} /></linearGradient>
        <radialGradient id={`${id}h`} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor={K.glow} stopOpacity={0.42} /><stop offset="1" stopColor={K.glow} stopOpacity={0} /></radialGradient>
      </defs>
      {/* Le halo du logo (public/logo-robot.svg, g-glow), derrière la tête. */}
      <circle cx={50} cy={46} r={58} fill={`url(#${id}h)`} opacity={glow * (0.75 + 0.25 * g)} />
      {/* L'ombre : plus petite et plus pâle quand il s'élève. */}
      <ellipse cx={50} cy={110} rx={26 * (1 - 0.32 * f)} ry={4.5} fill="#03141F" opacity={0.42 - 0.2 * f} />
      <g transform={`translate(0 ${lift}) rotate(${tilt} 50 94.4)`}>
        <line x1={50} y1={17} x2={50} y2={8} stroke={K.shellEdge} strokeWidth={3} strokeLinecap="round" />
        <circle cx={50} cy={6} r={8} fill={K.eye} opacity={0.18 + 0.42 * g} transform={`translate(50 6) scale(${0.8 + 0.4 * g}) translate(-50 -6)`} />
        <circle cx={50} cy={6} r={3.8} fill={K.eye} />
        <path d="M 9.90 36.72 A 41 35 0 0 1 90.10 36.72" fill="none" stroke={K.ear} strokeWidth={5} strokeLinecap="round" />
        <rect x={3} y={36} width={15} height={28} rx={7} fill={`url(#${id}r)`} />
        <rect x={82} y={36} width={15} height={28} rx={7} fill={`url(#${id}r)`} />
        <rect x={14} y={16} width={72} height={58} rx={24} fill={`url(#${id}s)`} stroke={K.shellEdge} strokeWidth={1.6} />
        <rect x={22} y={25} width={56} height={40} rx={17} fill={`url(#${id}e)`} />
        <g transform={`translate(${happy ? 0 : look(t)} 0) translate(0 42) scale(1 ${lids}) translate(0 -42)`}>
          {eye(38)}
          {eye(62)}
        </g>
        <path d="M 41 52.5 A 9 7 0 0 0 59 52.5 Z" fill={K.eye} />
        <circle cx={74} cy={69} r={15} fill="#fff" fillOpacity={0.95} />
        <circle cx={74} cy={69} r={13.5} fill={`url(#${id}b)`} />
        <rect x={72.2} y={61} width={3.6} height={16} rx={1} fill="#fff" />
        <rect x={66} y={67.2} width={16} height={3.6} rx={1} fill="#fff" />
        <path
          d="M 80 7 L 82 12.5 L 87.5 14 L 82 15.5 L 80 21 L 78 15.5 L 72.5 14 L 78 12.5 Z"
          fill="#FFD65A"
          opacity={0.55 + 0.45 * s}
          transform={`translate(80 14) rotate(${18 * s}) scale(${0.7 + 0.5 * s}) translate(-80 -14)`}
        />
      </g>
    </svg>
  );
}
