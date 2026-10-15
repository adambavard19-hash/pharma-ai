import { useId, type CSSProperties, type ReactNode } from "react";
import { BANNER } from "../../../agent/src/banner-design";
import { robotLook } from "../../../src/core/robot/counter-look";
import { FaceAccessory, HeadAccessory } from "../../../src/components/robot/accessories";
import type { ParticleKind } from "../../../src/core/robot/motion";
import type { RobotFrame } from "./motion-track";

/* ==========================================================================
 * LE ROBOT DE PHARMABOOST, pour la vidéo.
 *
 * Le dessin de src/components/robot/robot.tsx, trait pour trait (casque, écran, oreilles, croix, yeux, bouches,
 * accessoires des robots de comptoir), posé image par image : la pose vient de la piste du moteur
 * (motion-track.ts), et ce que le site anime en CSS (lampe qui pulse, étoile qui scintille, points de réflexion,
 * spirale du tournis, confettis de la fête, étincelles du saut) est recalculé au temps `t`, en secondes.
 * ======================================================================== */

const K = BANNER.colors;
/** La lampe inquiète (robot-css.ts, LAMP_CONCERNED) : l'ambre des pastilles « challenge ». */
const LAMP_CONCERNED = K.challengeIcon;

const CONFETTI: { x: number; y: number; color: string; round: boolean }[] = [
  { x: 6, y: 18, color: "#FFD65A", round: false },
  { x: 20, y: 4, color: K.eye, round: true },
  { x: 36, y: -6, color: K.accent, round: false },
  { x: 64, y: -6, color: "#FF9F7A", round: true },
  { x: 80, y: 4, color: "#FFD65A", round: true },
  { x: 95, y: 18, color: K.accent, round: false },
  { x: 2, y: 44, color: "#FF9F7A", round: false },
  { x: 98, y: 44, color: K.eye, round: true },
];

const PARTICLE: Record<ParticleKind, { d: string; fill: string; stroke?: string }> = {
  heart: { d: "M 0 1.7 C -2.7 -0.2 -2.3 -2.5 -0.95 -2.5 C -0.35 -2.5 0 -2 0 -1.65 C 0 -2 0.35 -2.5 0.95 -2.5 C 2.3 -2.5 2.7 -0.2 0 1.7 Z", fill: "#FF5C7A" },
  star: { d: "M 0 -2.4 L 0.7 -0.8 L 2.3 -0.75 L 1.1 0.35 L 1.45 2 L 0 1.1 L -1.45 2 L -1.1 0.35 L -2.3 -0.75 L -0.7 -0.8 Z", fill: "#FFC83D" },
  spark: { d: "M 0 -2.5 L 0.55 -0.55 L 2.5 0 L 0.55 0.55 L 0 2.5 L -0.55 0.55 L -2.5 0 L -0.55 -0.55 Z", fill: "#FFD65A" },
  sweat: { d: "M 0 -2.1 Q 1.7 0.4 0 1.3 Q -1.7 0.4 0 -2.1 Z", fill: "#7CC7FF" },
  z: { d: "M -1.3 -1.3 H 1.3 L -1.3 1.3 H 1.3", fill: "none", stroke: K.shellEdge },
};

const deg = (r: number) => (r * 180) / Math.PI;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** Une onde 0 → 1 → 0 de période `p` (les keyframes 0 %, 50 %, 100 % du site, en ease-in-out). */
const wave = (t: number, p: number) => 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / p);
const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
/** cubic-bezier(.2,.7,.3,1) approché (les confettis) : une sortie rapide qui se pose. */
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 2.6);

export type MascotProps = {
  frame: RobotFrame;
  /** Largeur en pixels (la hauteur suit : × 0,92, × 1,22 s'il flotte). */
  size: number;
  /** Le temps, en secondes : lampe, étoile, points, spirale. */
  t: number;
  /** Le robot d'un comptoir (core/robot/counter-look.ts) ; null : le robot de la marque. */
  look?: number | null;
  /** Flotte avec son ombre (carte de fin). */
  floating?: boolean;
  style?: CSSProperties;
};

export function Mascot({ frame, size, t, look: lookIndex = null, floating = false, style }: MascotProps) {
  const uid = `m${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const look = typeof lookIndex === "number" ? robotLook(lookIndex) : null;
  const earTop = look ? look.palette.ear : K.ear;
  const earBottom = look ? look.palette.earDark : "#12968C";
  const { pose, face } = frame;
  const eye = pose.eye;
  const concerned = face === "concerned";
  const lampColor = concerned ? LAMP_CONCERNED : (look?.palette.lamp ?? K.eye);
  const ink = { fill: "none", stroke: K.eye, strokeLinecap: "round" as const };
  const pair = (render: (cx: number) => ReactNode) => [38, 62].map((cx) => <g key={cx}>{render(cx)}</g>);

  // La lampe : elle pulse (2,2 s), plus vite quand il réfléchit, lentement s'il est sérieux.
  const glowPeriod = face === "thinking" ? 0.95 : concerned ? 3 : 2.2;
  const g = wave(t, glowPeriod);
  const glowOpacity = face === "thinking" ? lerp(0.2, 0.85, g) : lerp(0.16, 0.55, g);
  const glowScale = face === "thinking" ? lerp(0.8, 1.45, g) : lerp(0.8, 1.2, g);
  // L'étoile du casque : elle scintille, plus vite de joie ; absente quand il réfléchit, est sérieux ou a le tournis.
  const sparkOn = !(face === "thinking" || concerned || face === "sleepy" || face === "dizzy");
  const s = wave(t, face === "happy" ? 0.9 : 1.8);

  // La bouche : celle de l'humeur, sauf quand les yeux disent autre chose (robot-css.ts).
  let mouth: "idle" | "happy" | "o" | "flat" | "worry" | "sleep" | "wave";
  if (eye === "line") mouth = "flat";
  else if (eye === "heart" || eye === "star") mouth = "happy";
  else if (eye === "tired") mouth = "o";
  else if (eye === "spiral") mouth = "wave";
  else mouth = face === "curious" ? "o" : face === "thinking" ? "flat" : concerned ? "worry" : face === "happy" || face === "celebrate" ? "happy" : face === "sleepy" ? "sleep" : face === "dizzy" ? "wave" : "idle";

  const bodyTransform = `translate(${pose.ox} ${pose.oy}) rotate(${deg(pose.tilt)} 50 84) rotate(${deg(pose.roll)} 50 46) translate(50 84) scale(${pose.sx} ${pose.sy}) translate(-50 -84)`;
  const gx = pose.eyeScale * (1 - 0.18 * Math.abs(pose.yaw));
  const gy = pose.eyeScale * (1 - 0.1 * Math.abs(pose.pitch));
  const open = Math.max(0.06, pose.open);
  const handT = `translate(0 ${(1 - pose.hand) * 6}) rotate(${deg(pose.handSwing)} 95.4 48.2)`;

  // Le flottement de la carte de fin (rbt-float, 3,6 s) et son ombre.
  const fl = floating ? wave(t, 3.6) : 0;
  const floatT = floating ? `translate(0 ${-7 * fl}) rotate(${-3 + 6 * fl} 50 80)` : undefined;

  // Les gestes : confettis de la fête (1,5 s), étincelles du saut et du rire (0,7 s).
  const party = frame.burst === "party" ? frame.burstAge : -1;
  const popAge = frame.burst === "jump" || frame.burst === "giggle" ? frame.burstAge : -1;

  const viewBox = floating ? "0 -4 100 122" : "0 -4 100 92";
  const height = size * (floating ? 1.22 : 0.92);

  return (
    <svg viewBox={viewBox} width={size} height={height} style={{ display: "block", overflow: "visible", ...style }}>
      <defs>
        <linearGradient id={`${uid}-shell`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={K.shellTop} /><stop offset="1" stopColor={K.shellBottom} /></linearGradient>
        <linearGradient id={`${uid}-screen`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={K.screenTop} /><stop offset="1" stopColor={K.screenBottom} /></linearGradient>
        <linearGradient id={`${uid}-ear`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={earTop} /><stop offset="1" stopColor={earBottom} /></linearGradient>
        <linearGradient id={`${uid}-badge`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={K.accent} /><stop offset="1" stopColor={K.accentDark} /></linearGradient>
      </defs>
      {floating && (
        <ellipse cx={50} cy={110} rx={26 * lerp(1, 0.68, fl)} ry={4.5} fill={K.screenBottom} opacity={lerp(0.32, 0.16, fl)} />
      )}
      <g transform={floatT}>
        <g transform={bodyTransform}>
          {/* La main du coucou, cachée derrière l'oreille droite le reste du temps. */}
          <g opacity={clamp01(pose.hand)} transform={handT}>
            <rect x={95} y={33} width={5} height={18} rx={2.5} fill={`url(#${uid}-ear)`} />
            <circle cx={99} cy={29} r={6} fill={K.shellTop} stroke={K.shellEdge} strokeWidth={1.4} />
          </g>
          <line x1={50} y1={17} x2={50} y2={8} stroke={K.shellEdge} strokeWidth={3} strokeLinecap="round" />
          <circle cx={50} cy={6} r={8} fill={lampColor} opacity={face === "sleepy" ? 0.08 : glowOpacity} transform={`translate(50 6) scale(${face === "sleepy" ? 1 : glowScale}) translate(-50 -6)`} />
          <circle cx={50} cy={6} r={3.8} fill={lampColor} opacity={face === "sleepy" ? 0.45 : 1} />
          <path d="M 9.90 36.72 A 41 35 0 0 1 90.10 36.72" fill="none" stroke={earTop} strokeWidth={5} strokeLinecap="round" />
          <rect x={3} y={36} width={15} height={28} rx={7} fill={`url(#${uid}-ear)`} />
          <rect x={82} y={36} width={15} height={28} rx={7} fill={`url(#${uid}-ear)`} />
          <rect x={14} y={16} width={72} height={58} rx={24} fill={`url(#${uid}-shell)`} stroke={K.shellEdge} strokeWidth={1.6} />
          <g transform={`translate(${pose.yaw * 2.2} ${pose.pitch * 1.4})`}>
            <rect x={22} y={25} width={56} height={40} rx={17} fill={`url(#${uid}-screen)`} />
          </g>
          {look && <HeadAccessory look={look} />}

          {/* Le visage : il glisse sur l'écran quand la tête tourne. */}
          <g transform={`translate(${pose.yaw * 5} ${pose.pitch * 3.6})`}>
            <g fill="#FF8FA3" opacity={pose.blush * 0.6}>
              <ellipse cx={29.5} cy={52} rx={4.2} ry={2.4} />
              <ellipse cx={70.5} cy={52} rx={4.2} ry={2.4} />
            </g>
            {concerned && <path d="M 32.5 34.6 L 42.5 32.2 M 57.5 32.2 L 67.5 34.6" stroke={K.eye} strokeWidth={2.2} strokeLinecap="round" fill="none" />}
            <g transform={`translate(50 42) scale(${gx} ${gy}) translate(-50 -42)`}>
              <g transform={`translate(50 42) scale(1 ${open}) translate(-50 -42)`}>
                {eye === "pill" && pair((cx) => (
                  <>
                    <ellipse cx={cx} cy={42} rx={4.8} ry={6.4} fill={K.eye} />
                    <circle cx={cx - 1.5} cy={39.4} r={1.7} fill="#fff" fillOpacity={0.85} />
                  </>
                ))}
                {eye === "wide" && pair((cx) => (
                  <>
                    <ellipse cx={cx} cy={42} rx={5.9} ry={7.6} fill={K.eye} />
                    <circle cx={cx - 1.8} cy={38.8} r={2.1} fill="#fff" fillOpacity={0.9} />
                  </>
                ))}
                {eye === "flat" && pair((cx) => <ellipse cx={cx} cy={42.6} rx={4.8} ry={4.6} fill={K.eye} />)}
                {eye === "line" && <path d="M 33 40.4 L 43 42.6 M 57 42.6 L 67 40.4" {...ink} strokeWidth={3} />}
                {eye === "happy" && <path d="M 32.58 42.13 A 5.5 5 0 0 1 43.42 42.13 M 56.58 42.13 A 5.5 5 0 0 1 67.42 42.13" {...ink} strokeWidth={3.2} />}
                {eye === "closed" && <path d="M 33 42.5 A 5.5 3.6 0 0 0 43 42.5 M 57 42.5 A 5.5 3.6 0 0 0 67 42.5" {...ink} strokeWidth={2.8} />}
                {eye === "spiral" &&
                  [38, 62].map((cx) => (
                    <path key={cx} transform={`rotate(${((t / 0.9) % 1) * 360} ${cx} 42)`} d={`M ${cx} 42 a 1 1 0 0 1 2 0 a 2 2 0 0 1 -4 0 a 3 3 0 0 1 6 0 a 4 4 0 0 1 -8 0`} {...ink} strokeWidth={1.7} />
                  ))}
                {eye === "heart" && <g fill="#FF7A93">{pair((cx) => <path transform={`translate(${cx} 42.6) scale(2.5)`} d={PARTICLE.heart.d} />)}</g>}
                {eye === "star" && <g fill="#FFD65A">{pair((cx) => <path transform={`translate(${cx} 42) scale(2.6)`} d={PARTICLE.star.d} />)}</g>}
                {eye === "tired" && pair((cx) => (
                  <>
                    <path d={`M ${cx - 5} 42 A 5 4.6 0 0 0 ${cx + 5} 42 Z`} fill={K.eye} />
                    <path d={`M ${cx - 5.6} 41.6 H ${cx + 5.6}`} {...ink} strokeWidth={2.4} />
                  </>
                ))}
                {eye === "wink" && (
                  <>
                    <ellipse cx={38} cy={42} rx={4.8} ry={6.4} fill={K.eye} />
                    <circle cx={36.5} cy={39.4} r={1.7} fill="#fff" fillOpacity={0.85} />
                    <path d="M 56.58 42.13 A 5.5 5 0 0 1 67.42 42.13" {...ink} strokeWidth={3.2} />
                  </>
                )}
              </g>
            </g>

            {mouth === "idle" && <path d="M 56.58 53.04 A 7 4.5 0 0 1 43.42 53.04" {...ink} strokeWidth={2.6} />}
            {mouth === "happy" && <path d="M 41 52.5 A 9 7 0 0 0 59 52.5 Z" fill={K.eye} />}
            {mouth === "o" && <ellipse cx={50} cy={55} rx={3} ry={3.4} {...ink} strokeWidth={2.4} />}
            {mouth === "flat" && <line x1={46} y1={55} x2={56} y2={54} stroke={K.eye} strokeWidth={2.6} strokeLinecap="round" />}
            {mouth === "worry" && <path d="M 44 56.2 Q 50 53.4 56 56.2" {...ink} strokeWidth={2.6} />}
            {mouth === "sleep" && <line x1={46.5} y1={55} x2={53.5} y2={55} stroke={K.eye} strokeWidth={2.4} strokeLinecap="round" />}
            {mouth === "wave" && <path d="M 42 55 q 2 -2.4 4 0 t 4 0 t 4 0 t 4 0" {...ink} strokeWidth={2.2} />}

            {look && <FaceAccessory look={look} />}
          </g>

          <circle cx={74} cy={69} r={15} fill="#fff" fillOpacity={0.95} />
          <circle cx={74} cy={69} r={13.5} fill={`url(#${uid}-badge)`} />
          <rect x={72.2} y={61} width={3.6} height={16} rx={1} fill="#fff" />
          <rect x={66} y={67.2} width={16} height={3.6} rx={1} fill="#fff" />
          {sparkOn && (
            <path
              d="M 80 7 L 82 12.5 L 87.5 14 L 82 15.5 L 80 21 L 78 15.5 L 72.5 14 L 78 12.5 Z"
              fill="#FFD65A"
              opacity={lerp(0.55, 1, s)}
              transform={`translate(80 14) scale(${lerp(0.7, 1.2, s)}) rotate(${18 * s}) translate(-80 -14)`}
            />
          )}

          {/* Réfléchir : trois points ; curieux : un point d'interrogation. */}
          {face === "thinking" && (
            <g fill={K.eye}>
              {[
                [86, 22, 0],
                [92.5, 18, 0.18],
                [99, 14, 0.36],
              ].map(([cx, cy, d]) => {
                const p = ((t - d) % 1.2 + 1.2) % 1.2 / 1.2;
                const k = p < 0.3 ? p / 0.3 : p < 0.6 ? 1 - (p - 0.3) / 0.3 : 0;
                return <circle key={cx} cx={cx} cy={cy - 2 * k} r={2.2} opacity={0.25 + 0.75 * k} />;
              })}
            </g>
          )}
          {face === "curious" && (
            <path
              d="M 86 12 q 0 -5 5 -5 q 5 0 5 4.5 q 0 3 -4 4.5 v 2.5 M 92 24.5 v 0.5"
              fill="none"
              stroke={K.accent}
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              transform={`translate(0 ${-2 * wave(t, 1.6)}) rotate(${-6 + 12 * wave(t, 1.6)} 91 16)`}
            />
          )}
        </g>

        {/* Hors du corps : les étincelles d'une joie, les confettis d'une fête, et les particules du moteur. */}
        {popAge >= 0 && popAge < 0.7 && (() => {
          const k = popAge / 0.7;
          const sc = k < 0.35 ? lerp(0.2, 1.15, k / 0.35) : lerp(1.15, 0.6, (k - 0.35) / 0.65);
          const op = k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65;
          const rot = k < 0.35 ? 0 : 40 * ((k - 0.35) / 0.65);
          return (
            <g fill="#FFD65A" opacity={op}>
              <path transform={`translate(10 19.6) rotate(${rot}) scale(${sc}) translate(-10 -19.6)`} d="M 10 14 l 1.6 4 l 4 1.6 l -4 1.6 l -1.6 4 l -1.6 -4 l -4 -1.6 l 4 -1.6 Z" />
              <path transform={`translate(92 34.2) rotate(${rot}) scale(${sc}) translate(-92 -34.2)`} d="M 92 30 l 1.2 3 l 3 1.2 l -3 1.2 l -1.2 3 l -1.2 -3 l -3 -1.2 l 3 -1.2 Z" />
            </g>
          );
        })()}
        {party >= 0 &&
          CONFETTI.map((piece, index) => {
            const delay = index % 3 === 2 ? 0.16 : index % 2 === 1 ? 0.08 : 0;
            const k = clamp01((party - delay) / 1.5);
            if (k <= 0 || k >= 1) return null;
            const e = easeOut(k);
            const x = lerp(50, piece.x, e);
            const y = lerp(40, piece.y + 4, e);
            const op = k < 0.15 ? k / 0.15 : k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
            const tr = `translate(${x} ${y}) rotate(${160 * e}) scale(${lerp(0.3, 1, e)})`;
            return piece.round ? (
              <circle key={index} r={2.4} fill={piece.color} opacity={op} transform={tr} />
            ) : (
              <rect key={index} x={-2} y={-3} width={4} height={6} rx={1} fill={piece.color} opacity={op} transform={tr} />
            );
          })}
        <g strokeWidth={0.9} strokeLinecap="round" strokeLinejoin="round">
          {frame.particles.map((p, i) => {
            if (p.age <= 0) return null;
            const k = p.age / p.life;
            const alpha = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
            const shape = PARTICLE[p.kind];
            const rotate = p.kind === "heart" ? Math.sin(p.age * 6) * 0.3 : p.kind === "star" || p.kind === "spark" ? p.rot + p.age * 2 : 0;
            const scale = p.size * 1.5 * (1 + k * 0.4);
            return <path key={i} d={shape.d} fill={shape.fill} stroke={shape.stroke ?? "none"} opacity={clamp01(alpha)} transform={`translate(${p.x} ${p.y}) rotate(${deg(rotate)}) scale(${scale})`} />;
          })}
        </g>
      </g>
    </svg>
  );
}
