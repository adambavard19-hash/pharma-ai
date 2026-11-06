import { useCurrentFrame } from "remotion";
import { clamp01, wobble } from "../../presentation/motion/kit/ease";

/**
 * CLARA — la jeune patiente du film 3 (« La patiente raconte », 6 nov. 2026). Illustration plate, même trait que le
 * décor du kit « Rembobinons » : cheveux longs châtains, pull rose, jean, sac en bandoulière. Tout est fonction de `t`.
 *
 * Repère local : (0, 0) = la base du cou ; la tête monte jusqu'à y ≈ −185, les pieds descendent à y ≈ +600.
 * De trois quarts, tournée vers la GAUCHE (vers la pharmacienne) ; `flip` la tourne vers la droite.
 *   expr     "inquiete" | "neutre" | "sourire"
 *   talk     fenêtres [de, à] (temps du film) où la bouche parle
 *   spots    0..1 : quelques boutons d'acné, discrets (ils s'effacent à la fin du film)
 *   hands    les deux mains [gauche, droite] dans le repère local (sinon le long du corps)
 *   tilt     inclinaison de la tête (°) ; look = [dx, dy] des pupilles ; walk 0..1 + phase : la marche
 */
export type Expr = "inquiete" | "neutre" | "sourire";
type Pt = { x: number; y: number };

const C = {
  skin: "#F2C9A9",
  skinSh: "#DFA885",
  hair: "#5A3826",
  hairHi: "#7C5038",
  sweater: "#F3A8B6",
  sweaterSh: "#DE8A9C",
  jeans: "#3E5A86",
  jeansSh: "#2F4A72",
  shoe: "#F7F4F0",
  sole: "#C9CFD1",
  strap: "#8E6B4F",
  lips: "#C45A66",
  mouthIn: "#7A2E35",
  eye: "#2B1D18",
  blush: "#F2948E",
};

export function talkOpen(t: number, talk?: [number, number][]) {
  if (!talk) return 0;
  for (const [a, b] of talk) {
    if (t >= a && t <= b) {
      const env = clamp01(Math.min((t - a) / 0.06, (b - t) / 0.08));
      return env * (0.25 + 0.75 * Math.abs(Math.sin(t * 13.5 + Math.sin(t * 5.1) * 1.4)));
    }
  }
  return 0;
}

export function Clara({
  t,
  x,
  y,
  scale = 1,
  flip = false,
  expr = "neutre",
  talk,
  spots = 0,
  hands,
  tilt = 0,
  look = [0, 0],
  walk = 0,
  phase = 0,
  legs = true,
  opacity = 1,
}: {
  t: number;
  x: number;
  y: number;
  scale?: number;
  flip?: boolean;
  expr?: Expr;
  talk?: [number, number][];
  spots?: number;
  hands?: [Pt, Pt];
  tilt?: number;
  look?: [number, number];
  walk?: number;
  phase?: number;
  legs?: boolean;
  opacity?: number;
}) {
  const relayout = useCurrentFrame();
  const br = Math.sin((t * 2 * Math.PI) / 3.8);
  const bob = -Math.abs(Math.sin(phase)) * 10 * walk;
  const open = talkOpen(t, talk);
  const bl = (t + 0.7) % 3.3;
  const blink = bl < 0.11 ? 0.12 : 1;
  const headRot = tilt + wobble(t, 21, 1.6, 0.5) + (open > 0 ? Math.sin(t * 6.5) * 1.1 : 0);
  const [lx, ly] = look;

  // les bras : épaule → coude → main
  const shL = { x: -80, y: 36 + br * 1.5 };
  const shR = { x: 80, y: 36 + br * 1.5 };
  const swing = Math.sin(phase) * 22 * walk;
  const hL = hands?.[0] ?? { x: -92 - swing * 0.4, y: 300 };
  const hR = hands?.[1] ?? { x: 92 + swing * 0.4, y: 300 };
  const elbow = (s: Pt, h: Pt, side: number): Pt => {
    const near = Math.abs(h.x) < 70 || h.y < 220;
    return near ? { x: s.x + side * 26, y: (s.y + h.y) / 2 + 60 } : { x: (s.x + h.x) / 2 + side * 8, y: (s.y + h.y) / 2 };
  };
  const eL = elbow(shL, hL, -1);
  const eR = elbow(shR, hR, 1);
  const arm = (s: Pt, e: Pt, h: Pt, k: string) => (
    <g key={k}>
      <path d={`M${s.x},${s.y} L${e.x},${e.y} L${h.x},${h.y}`} fill="none" stroke={C.sweaterSh} strokeWidth={40} strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M${s.x},${s.y} L${e.x},${e.y} L${h.x},${h.y}`} fill="none" stroke={C.sweater} strokeWidth={35} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={h.x} cy={h.y} r={16} fill={C.skin} />
      <ellipse cx={h.x + (h.x < 0 ? 6 : -6)} cy={h.y - 9} rx={7} ry={5} fill={C.skin} />
    </g>
  );
  const holding = hands !== undefined;

  // les jambes
  const leg = (hx: number, ang: number, k: string) => (
    <g key={k} transform={`rotate(${ang} ${hx} 300)`}>
      <path d={`M${hx - 24},290 L${hx - 21},585 L${hx + 21},585 L${hx + 24},290 Z`} fill={C.jeans} />
      <path d={`M${hx + 8},300 L${hx + 10},585 L${hx + 21},585 L${hx + 24},300 Z`} fill={C.jeansSh} opacity={0.6} />
      <path d={`M${hx - 26},585 Q${hx - 28},608 ${hx - 6},610 L${hx + 30},610 Q${hx + 34},592 ${hx + 22},585 Z`} fill={C.shoe} />
      <rect x={hx - 28} y={606} width={62} height={6} rx={3} fill={C.sole} />
    </g>
  );
  const legA = Math.sin(phase) * 20 * walk;

  const spotsAt = [
    [-38, -84, 2.6],
    [-30, -72, 2.1],
    [-44, -70, 1.8],
    [24, -86, 2.4],
    [32, -74, 2.0],
    [-10, -134, 2.0],
    [6, -128, 1.7],
  ];

  return (
    <div style={{ position: "absolute", left: x, top: y + bob * scale, width: 0, height: 0, transform: `scale(${flip ? -scale : scale}, ${scale})`, transformOrigin: "0 0", opacity }}>
      <svg key={relayout} width={600} height={900} viewBox="-300 -260 600 900" style={{ position: "absolute", left: -300, top: -260, overflow: "visible" }}>
        {legs && (
          <g>
            {leg(-26, legA, "ll")}
            {leg(26, -legA, "lr")}
          </g>
        )}
        {/* cheveux, derrière */}
        <g transform={`rotate(${headRot * 0.5} 0 -30)`}>
          <path d="M-74,-112 C-86,-196 76,-206 76,-112 C82,-40 88,30 74,74 L-78,74 C-90,26 -84,-46 -74,-112 Z" fill={C.hair} />
        </g>
        {/* bras derrière (au repos) */}
        {!holding && arm(shR, eR, hR, "ar")}
        {/* le cou */}
        <path d="M-16,-46 L-17,8 L19,8 L18,-46 Z" fill={C.skin} />
        <path d="M-16,-20 Q2,-6 18,-20 L18,0 L-16,0 Z" fill={C.skinSh} opacity={0.55} />
        {/* le pull */}
        <g transform={`translate(0 ${br * 1.2}) scale(1 ${1 + br * 0.006})`}>
          <path d="M-96,40 C-96,12 -66,-2 -32,-4 L32,-4 C66,-2 96,12 96,40 L86,312 C86,326 76,334 62,334 L-62,334 C-76,334 -86,326 -86,312 Z" fill={C.sweater} />
          <path d="M-86,296 L86,296 L86,312 C86,326 76,334 62,334 L-62,334 C-76,334 -86,326 -86,312 Z" fill={C.sweaterSh} />
          <path d="M-32,-4 Q0,30 32,-4" fill="none" stroke={C.sweaterSh} strokeWidth={9} strokeLinecap="round" />
          <path d="M-30,-6 Q0,22 30,-6 Z" fill={C.skin} />
          {[120, 170, 220].map((yy) => (
            <path key={yy} d={`M-60,${yy} Q0,${yy + 8} 60,${yy}`} fill="none" stroke={C.sweaterSh} strokeWidth={2.2} opacity={0.35} />
          ))}
          {/* la bandoulière */}
          <path d="M58,-2 L-74,300" stroke={C.strap} strokeWidth={9} strokeLinecap="round" />
        </g>
        {!holding && arm(shL, eL, hL, "al")}
        {holding && arm(shR, eR, hR, "ar")}
        {holding && arm(shL, eL, hL, "al")}
        {/* la tête */}
        <g transform={`rotate(${headRot} 0 -34)`}>
          <ellipse cx={50} cy={-96} rx={9} ry={13} fill={C.skin} />
          <ellipse cx={51} cy={-95} rx={4} ry={7} fill={C.skinSh} />
          <ellipse cx={-2} cy={-100} rx={56} ry={66} fill={C.skin} />
          <path d="M-56,-90 C-52,-40 -24,-34 -2,-34 C22,-34 50,-46 54,-90 C50,-58 30,-40 -2,-40 C-30,-40 -52,-58 -56,-90 Z" fill={C.skinSh} opacity={0.35} />
          {/* les boutons */}
          {spots > 0.01 && spotsAt.map(([sx, sy, r], i) => <circle key={i} cx={sx} cy={sy} r={r} fill="#E07068" opacity={spots * 0.6} />)}
          {/* les joues */}
          <ellipse cx={-36} cy={-74} rx={12} ry={6.5} fill={C.blush} opacity={expr === "sourire" ? 0.55 : 0.32} />
          <ellipse cx={24} cy={-74} rx={11} ry={6} fill={C.blush} opacity={expr === "sourire" ? 0.5 : 0.28} />
          {/* les yeux */}
          {[-24, 14].map((ex, i) => (
            <g key={ex} transform={`translate(${ex + lx} ${-98 + ly}) scale(1 ${blink})`}>
              <ellipse cx={0} cy={0} rx={i ? 6.4 : 6} ry={expr === "sourire" ? 6.6 : 7.6} fill={C.eye} />
              <circle cx={2} cy={-2.5} r={2} fill="#FFFFFF" opacity={0.9} />
            </g>
          ))}
          {expr === "sourire" && (
            <>
              <path d="M-31,-90 Q-24,-86 -17,-90" fill="none" stroke={C.skin} strokeWidth={3} />
              <path d="M7,-90 Q14,-86 21,-90" fill="none" stroke={C.skin} strokeWidth={3} />
            </>
          )}
          {/* les sourcils */}
          {expr === "inquiete" ? (
            <>
              <path d="M-36,-114 Q-28,-119 -15,-124" fill="none" stroke={C.hair} strokeWidth={4.2} strokeLinecap="round" />
              <path d="M5,-124 Q16,-120 25,-114" fill="none" stroke={C.hair} strokeWidth={4.2} strokeLinecap="round" />
            </>
          ) : (
            <>
              <path d={`M-35,${expr === "sourire" ? -118 : -115} Q-25,-123 -14,-117`} fill="none" stroke={C.hair} strokeWidth={4.2} strokeLinecap="round" />
              <path d={`M4,-117 Q15,-123 25,${expr === "sourire" ? -118 : -115}`} fill="none" stroke={C.hair} strokeWidth={4.2} strokeLinecap="round" />
            </>
          )}
          {/* le nez */}
          <path d="M-6,-90 Q-12,-76 -3,-74" fill="none" stroke={C.skinSh} strokeWidth={2.6} strokeLinecap="round" />
          {/* la bouche */}
          {open > 0.02 ? (
            <g>
              <ellipse cx={-5} cy={-58} rx={9 + 2 * open} ry={2.5 + 7 * open} fill={C.mouthIn} />
              <path d={`M${-15 - 2 * open},-59 Q-5,${-63 - 2 * open} ${5 + 2 * open},-59`} fill="none" stroke={C.lips} strokeWidth={2.4} strokeLinecap="round" />
            </g>
          ) : expr === "sourire" ? (
            <g>
              <path d="M-21,-63 Q-5,-44 11,-63 Q-5,-56 -21,-63 Z" fill={C.mouthIn} />
              <path d="M-18,-62 Q-5,-58 8,-62 L7,-59 Q-5,-55 -17,-59 Z" fill="#FFFFFF" />
              <path d="M-23,-64 Q-5,-42 13,-64" fill="none" stroke={C.lips} strokeWidth={2.4} strokeLinecap="round" />
            </g>
          ) : expr === "inquiete" ? (
            <path d="M-16,-57 Q-5,-63 6,-57" fill="none" stroke={C.lips} strokeWidth={3.6} strokeLinecap="round" />
          ) : (
            <path d="M-15,-61 Q-5,-56 5,-61" fill="none" stroke={C.lips} strokeWidth={3.6} strokeLinecap="round" />
          )}
          {/* les cheveux, devant : la frange et la mèche */}
          <path d="M-62,-118 C-62,-182 58,-190 62,-120 C46,-150 6,-156 -18,-132 C-28,-146 -50,-142 -62,-118 Z" fill={C.hair} />
          <path d="M-60,-122 C-74,-80 -72,-24 -62,22 L-48,22 C-56,-24 -58,-80 -48,-124 Z" fill={C.hair} />
          <path d="M54,-130 C64,-100 64,-70 58,-52 L66,-50 C72,-80 70,-110 60,-134 Z" fill={C.hair} />
          <path d="M-38,-160 C-14,-174 22,-172 42,-152" fill="none" stroke={C.hairHi} strokeWidth={3.4} strokeLinecap="round" opacity={0.85} />
          <path d="M-62,-100 C-66,-70 -64,-30 -58,0" fill="none" stroke={C.hairHi} strokeWidth={2.6} strokeLinecap="round" opacity={0.7} />
        </g>
      </svg>
    </div>
  );
}
