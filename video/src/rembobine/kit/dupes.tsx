import { useId } from "react";

/**
 * Les quatre produits de la routine isotrétinoïne (fondateur, 4 nov. 2026), DESSINÉS : les mêmes types de produits que les
 * photos envoyées (flacon pompe, tube, baume lèvres, tube solaire), mais SANS marque, sans logo ni signature graphique d'un
 * laboratoire, avec nos propres couleurs. On n'a pas le droit de montrer une marque : seuls des noms génériques y figurent.
 *
 * Dessinés dans 100 × 160 (origine en haut à gauche), centrés dans leur boîte.
 */
export type DupeKind = "iso-nettoyant" | "iso-hydratant" | "iso-levres" | "iso-solaire";

export const DUPES: Record<DupeKind, { name: string; short: string; tile: [string, string] }> = {
  "iso-nettoyant": { name: "Crème lavante apaisante", short: "Crème lavante", tile: ["#E6F6F2", "#CFEDE5"] },
  "iso-hydratant": { name: "Soin hydratant apaisant", short: "Soin hydratant", tile: ["#EEF7F4", "#DCEFE8"] },
  "iso-levres": { name: "Baume réparateur lèvres", short: "Baume à lèvres", tile: ["#F7F1EE", "#EDE2DC"] },
  "iso-solaire": { name: "Protection solaire SPF 50+", short: "Protection solaire", tile: ["#FFF1E4", "#FFDDBF"] },
};
export const isDupe = (kind: string): kind is DupeKind => kind in DUPES;

const INK = "#24423C";
const TEAL = "#1B8C7E";

function Label({ x, y, lines, color = INK, size = 6.2, w = 60 }: { x: number; y: number; lines: string[]; color?: string; size?: number; w?: number }) {
  return (
    <g>
      {lines.map((l, i) => (
        <text key={i} x={x} y={y + i * size * 1.22} textAnchor="middle" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight={i === 0 ? 800 : 600} fontSize={i === 0 ? size : size * 0.82} fill={color} textLength={l.length * size * 0.56 > w ? w : undefined} lengthAdjust="spacingAndGlyphs">
          {l}
        </text>
      ))}
    </g>
  );
}

/** Un produit dessiné, de la hauteur `h` (la largeur suit : 100 × 160). */
export function Dupe({ kind, h }: { kind: DupeKind; h: number }) {
  const id = useId().replace(/:/g, "");
  const w = (h * 100) / 160;
  return (
    <svg width={w} height={h} viewBox="0 0 100 160" style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={`${id}s`} x1="0" x2="1">
          <stop offset="0" stopColor="#000" stopOpacity={0.1} />
          <stop offset="0.35" stopColor="#FFF" stopOpacity={0.28} />
          <stop offset="0.6" stopColor="#FFF" stopOpacity={0} />
          <stop offset="1" stopColor="#000" stopOpacity={0.12} />
        </linearGradient>
      </defs>
      <ellipse cx={50} cy={156} rx={30} ry={3.4} fill="#0F2B26" opacity={0.14} />
      {kind === "iso-nettoyant" && (
        <g>
          {/* flacon pompe */}
          <rect x={44} y={6} width={12} height={9} rx={2} fill="#F7FAF9" stroke="#D5E2DE" strokeWidth={0.8} />
          <path d="M44 9 H28 a3 3 0 0 0 0 6 H44 Z" fill="#F7FAF9" stroke="#D5E2DE" strokeWidth={0.8} />
          <rect x={41} y={15} width={18} height={20} rx={3} fill="#FFFFFF" stroke="#D5E2DE" strokeWidth={0.8} />
          <rect x={22} y={34} width={56} height={120} rx={12} fill="#BFE6DD" />
          <rect x={22} y={34} width={56} height={120} rx={12} fill={`url(#${id}s)`} />
          <rect x={22} y={44} width={56} height={11} fill="#2C8F82" />
          <text x={50} y={52} textAnchor="middle" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight={800} fontSize={6.4} fill="#FFFFFF">400 ml</text>
          <Label x={50} y={84} lines={["Crème lavante", "apaisante", "visage et corps"]} color={INK} size={7.4} w={50} />
          <path d="M34 128 q16 -12 32 0" fill="none" stroke={TEAL} strokeWidth={1.6} strokeLinecap="round" opacity={0.7} />
          <circle cx={50} cy={128} r={2.4} fill={TEAL} opacity={0.7} />
        </g>
      )}
      {kind === "iso-hydratant" && (
        <g>
          {/* tube debout sur son bouchon */}
          <path d="M26 8 H74 L70 120 H30 Z" fill="#FBFDFC" stroke="#DCE7E3" strokeWidth={0.8} />
          <path d="M26 8 H74 L70 120 H30 Z" fill={`url(#${id}s)`} />
          <rect x={25} y={4} width={50} height={8} rx={1.5} fill="#EDF2F0" stroke="#DCE7E3" strokeWidth={0.6} />
          {Array.from({ length: 12 }, (_, i) => (
            <line key={i} x1={28 + i * 4} y1={5} x2={28 + i * 4} y2={11} stroke="#D2DCD8" strokeWidth={0.6} />
          ))}
          <rect x={30} y={120} width={40} height={34} rx={5} fill="#A8DCCD" />
          <rect x={30} y={120} width={40} height={34} rx={5} fill={`url(#${id}s)`} />
          <Label x={50} y={46} lines={["Soin hydratant", "apaisant", "peau sèche et irritée"]} color={INK} size={7.2} w={40} />
          <rect x={36} y={76} width={28} height={1.4} rx={0.7} fill={TEAL} opacity={0.6} />
          <circle cx={50} cy={96} r={11} fill="none" stroke={TEAL} strokeWidth={1.5} opacity={0.55} />
          <path d="M50 89 c3 4 5 6 5 8.5 a5 5 0 0 1 -10 0 c0 -2.5 2 -4.5 5 -8.5 z" fill={TEAL} opacity={0.65} />
        </g>
      )}
      {kind === "iso-levres" && (
        <g>
          {/* baume lèvres : tube fin */}
          <path d="M36 10 H64 L61 112 H39 Z" fill="#FFFFFF" stroke="#E2DAD5" strokeWidth={0.8} />
          <path d="M36 10 H64 L61 112 H39 Z" fill={`url(#${id}s)`} />
          <rect x={35} y={6} width={30} height={7} rx={1.2} fill="#F3EEEB" stroke="#E2DAD5" strokeWidth={0.6} />
          {Array.from({ length: 7 }, (_, i) => (
            <line key={i} x1={38 + i * 4} y1={7} x2={38 + i * 4} y2={12} stroke="#DDD3CD" strokeWidth={0.6} />
          ))}
          <rect x={39} y={112} width={22} height={42} rx={4} fill="#F4EEEA" stroke="#E2DAD5" strokeWidth={0.8} />
          <Label x={50} y={42} lines={["Baume", "lèvres", "réparateur"]} color={INK} size={6.4} w={22} />
          <path d="M42 78 q8 -7 16 0 q-8 9 -16 0 z" fill="none" stroke="#C77D6E" strokeWidth={1.4} strokeLinejoin="round" />
          <line x1={42} y1={78} x2={58} y2={78} stroke="#C77D6E" strokeWidth={1.1} />
          <rect x={41} y={92} width={18} height={1.2} rx={0.6} fill={TEAL} opacity={0.6} />
        </g>
      )}
      {kind === "iso-solaire" && (
        <g>
          {/* tube solaire, orange corail */}
          <path d="M24 8 H76 L71 122 H29 Z" fill="#FF8F4A" />
          <path d="M24 8 H76 L71 122 H29 Z" fill={`url(#${id}s)`} />
          <rect x={23} y={4} width={54} height={8} rx={1.5} fill="#F6F6F4" stroke="#E5E1DC" strokeWidth={0.6} />
          {Array.from({ length: 13 }, (_, i) => (
            <line key={i} x1={26 + i * 4} y1={5} x2={26 + i * 4} y2={11} stroke="#DAD5CF" strokeWidth={0.6} />
          ))}
          <path d="M25.5 34 H74.5 L73.2 62 H26.8 Z" fill="#FFFFFF" />
          <text x={28} y={55} fontFamily="Plus Jakarta Sans, sans-serif" fontWeight={800} fontSize={18} fill="#FF7A2E" letterSpacing={-1}>50+</text>
          <text x={64} y={46} fontFamily="Plus Jakarta Sans, sans-serif" fontWeight={800} fontSize={7} fill={INK}>SPF</text>
          <text x={64} y={54} fontFamily="Plus Jakarta Sans, sans-serif" fontWeight={700} fontSize={4.4} fill={INK}>UVA UVB</text>
          <Label x={50} y={78} lines={["Visage", "peaux sensibles", "très haute protection"]} color="#FFFFFF" size={7.4} w={40} />
          <circle cx={50} cy={106} r={6} fill="none" stroke="#FFFFFF" strokeWidth={1.4} opacity={0.85} />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <line key={i} x1={50 + Math.cos(a) * 8.5} y1={106 + Math.sin(a) * 8.5} x2={50 + Math.cos(a) * 11.5} y2={106 + Math.sin(a) * 11.5} stroke="#FFFFFF" strokeWidth={1.3} strokeLinecap="round" opacity={0.85} />;
          })}
          <rect x={29} y={122} width={42} height={32} rx={5} fill="#FAFAF8" stroke="#E5E1DC" strokeWidth={0.8} />
        </g>
      )}
    </svg>
  );
}

/** La vignette carrée d'un produit dessiné (bannière, e-mail, appli). */
export function DupeTile({ kind, size, radius }: { kind: DupeKind; size: number; radius: number }) {
  const d = DUPES[kind];
  return (
    <span style={{ display: "inline-flex", flexShrink: 0, width: size, height: size, borderRadius: radius, background: `linear-gradient(160deg, ${d.tile[0]}, ${d.tile[1]})`, boxShadow: "inset 0 0 0 1.5px rgba(15,43,38,.08)", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <Dupe kind={kind} h={size * 0.86} />
    </span>
  );
}
