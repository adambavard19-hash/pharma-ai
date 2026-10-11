import { BANNER } from "../../../../../agent/src/banner-design";
import { cn } from "@/lib/utils";

/**
 * Le petit robot de la bannière (et du logo), qui flotte à côté de « À côté de votre logiciel de gestion » : il monte et
 * descend doucement, penche un peu la tête, cligne des yeux, regarde à gauche puis à droite ; sa lampe pulse et l'étoile
 * scintille. Son ombre, en dessous, rétrécit quand il s'élève : c'est elle qui donne l'impression qu'il flotte dans le vide.
 *
 * Même dessin et mêmes couleurs que la mascotte du poste (`mascotSvg`, agent/src/banner-preview.ts). Tout est en CSS : aucun
 * script, et rien ne bouge pour qui a demandé à réduire les animations.
 */
const C = BANNER.colors;

const CSS = `
@keyframes pbr-float { 0%, 100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-7px) rotate(3deg); } }
@keyframes pbr-shadow { 0%, 100% { transform: scaleX(1); opacity: .32; } 50% { transform: scaleX(.68); opacity: .16; } }
@keyframes pbr-blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(.1); } }
@keyframes pbr-look { 0%, 30%, 100% { transform: translateX(0); } 40%, 55% { transform: translateX(-3px); } 65%, 85% { transform: translateX(3px); } }
@keyframes pbr-glow { 0%, 100% { opacity: .18; transform: scale(.8); } 50% { opacity: .6; transform: scale(1.2); } }
@keyframes pbr-twinkle { 0%, 100% { transform: scale(.7) rotate(0deg); opacity: .55; } 50% { transform: scale(1.2) rotate(18deg); opacity: 1; } }
.pbr-body { animation: pbr-float 3.6s ease-in-out infinite; transform-origin: 50% 80%; }
.pbr-shadow { animation: pbr-shadow 3.6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.pbr-eyes { animation: pbr-look 7s ease-in-out infinite; transform-box: fill-box; }
.pbr-lids { animation: pbr-blink 4.2s infinite; transform-box: fill-box; transform-origin: center; }
.pbr-glow { animation: pbr-glow 2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.pbr-spark { animation: pbr-twinkle 1.6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@media (prefers-reduced-motion: reduce) { .pbr-body, .pbr-shadow, .pbr-eyes, .pbr-lids, .pbr-glow, .pbr-spark { animation: none; } }
`;

const eye = (cx: number) => (
  <>
    <ellipse cx={cx} cy={42} rx={4.8} ry={6.4} fill={C.eye} />
    <circle cx={cx - 1.5} cy={39.4} r={1.7} fill="#fff" fillOpacity={0.85} />
  </>
);

export function FloatingRobot({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-block shrink-0", className)} aria-hidden="true">
      <style>{CSS}</style>
      <svg viewBox="0 0 100 118" className="block h-full w-full overflow-visible">
        <defs>
          <linearGradient id="pbr-shell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.shellTop} /><stop offset="1" stopColor={C.shellBottom} /></linearGradient>
          <linearGradient id="pbr-screen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.screenTop} /><stop offset="1" stopColor={C.screenBottom} /></linearGradient>
          <linearGradient id="pbr-ear" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.ear} /><stop offset="1" stopColor="#12968C" /></linearGradient>
          <linearGradient id="pbr-badge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.accent} /><stop offset="1" stopColor={C.accentDark} /></linearGradient>
        </defs>
        <ellipse className="pbr-shadow" cx={50} cy={110} rx={26} ry={4.5} fill={C.screenBottom} />
        <g className="pbr-body">
          <line x1={50} y1={17} x2={50} y2={8} stroke={C.shellEdge} strokeWidth={3} strokeLinecap="round" />
          <circle className="pbr-glow" cx={50} cy={6} r={8} fill={C.eye} />
          <circle cx={50} cy={6} r={3.8} fill={C.eye} />
          <path d="M 9.90 36.72 A 41 35 0 0 1 90.10 36.72" fill="none" stroke={C.ear} strokeWidth={5} strokeLinecap="round" />
          <rect x={3} y={36} width={15} height={28} rx={7} fill="url(#pbr-ear)" />
          <rect x={82} y={36} width={15} height={28} rx={7} fill="url(#pbr-ear)" />
          <rect x={14} y={16} width={72} height={58} rx={24} fill="url(#pbr-shell)" stroke={C.shellEdge} strokeWidth={1.6} />
          <rect x={22} y={25} width={56} height={40} rx={17} fill="url(#pbr-screen)" />
          <g className="pbr-eyes">
            <g className="pbr-lids">
              {eye(38)}
              {eye(62)}
            </g>
          </g>
          <path d="M 41 52.5 A 9 7 0 0 0 59 52.5 Z" fill={C.eye} />
          <circle cx={74} cy={69} r={15} fill="#fff" fillOpacity={0.95} />
          <circle cx={74} cy={69} r={13.5} fill="url(#pbr-badge)" />
          <rect x={72.2} y={61} width={3.6} height={16} rx={1} fill="#fff" />
          <rect x={66} y={67.2} width={16} height={3.6} rx={1} fill="#fff" />
          <path className="pbr-spark" d="M 80 7 L 82 12.5 L 87.5 14 L 82 15.5 L 80 21 L 78 15.5 L 72.5 14 L 78 12.5 Z" fill="#FFD65A" />
        </g>
      </svg>
    </span>
  );
}
