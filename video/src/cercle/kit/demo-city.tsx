import { AbsoluteFill } from "remotion";
import { IN_OUT, prog, keys } from "../../presentation/motion/kit/ease";
import { JAKARTA, N, PB, rgba } from "./brand";
import { anchors, CAMS, camLerp, camLook, City, FloatTag, Passant, PASSANT_COLORS, PB_SHOP, windowOf, type CityCam } from "./city";

/* ==========================================================================
 * DÉMONSTRATION DU KIT « city » (planche : node src/cercle/tools/planche.mjs --demo city 0 1 2 3 4 5 6 7).
 *   0 → 1   la caméra descend (high → overview), les pharmacies s'allument d'un même néon
 *   1 → 2   les deux côte à côte (both), une étiquette identique au-dessus de chacune
 *   2,5 → 4 PharmaBoost s'illumine (citron), la file arrive ; un passant longe celle d'à côté sans s'arrêter
 *   3,9 → 5,2 serré sur PharmaBoost (pb) — la place au-dessus pour une étiquette, un robot
 *   5,2 → 6,4 serré sur l'autre (cote) : elle grésille, la croix s'éteint, la vitrine baisse
 *   6,4 → 7,3 retour aux deux (both) ; les ancres sont marquées (points citron) de 6,85 à 7,35
 *   7,3 → 8   la caméra plonge dans la vitrine illuminée (camLook, zoom 9)
 * La bande y < 580 est grisée : c'est la place du grand texte du film.
 * ======================================================================== */

const seq: [number, CityCam][] = [
  [0, CAMS.high],
  [1.1, CAMS.overview],
  [2.0, CAMS.both],
  [3.9, CAMS.both],
  [4.6, CAMS.pb],
  [5.2, CAMS.pb],
  [5.8, CAMS.cote],
  [6.4, CAMS.cote],
  [6.9, CAMS.both],
  [7.3, CAMS.both],
  [8.0, camLook(...windowOf(PB_SHOP), 9)],
];
function camAt(t: number): CityCam {
  for (let i = seq.length - 1; i >= 0; i--) {
    if (t >= seq[i][0]) {
      const next = seq[i + 1];
      if (!next) return seq[i][1];
      return camLerp(seq[i][1], next[1], prog(t, seq[i][0], next[0] - seq[i][0], i === seq.length - 2 ? (x) => x * x * x : IN_OUT));
    }
  }
  return seq[0][1];
}

export function Scene({ t }: { t: number }) {
  const cam = camAt(t);
  const a = anchors(cam);
  const lights = prog(t, 0.5, 0.35);
  const pbLit = prog(t, 2.5, 0.7);
  const flick = keys(t, [
    [5.3, 0],
    [5.6, 1],
    [6.25, 1],
    [6.35, 0],
  ]);
  const coteCross = 1 - prog(t, 6.2, 0.12);
  const coteLit = 1 - 0.8 * prog(t, 6.25, 0.4);
  const showAnchors = t >= 6.85 && t < 7.35;
  return (
    <AbsoluteFill>
      <City t={t} cam={cam} lights={lights} pbLit={pbLit} coteLit={coteLit} coteCross={coteCross} coteFlicker={flick} queue={prog(t, 2.6, 2.6, (x) => x)}>
        <Passant t={t} path={[[18, -1.25], [-24, -1.25]]} start={2.6} dur={8.5} color={PASSANT_COLORS[3]} seed={4} bag />
        <Passant t={t} path={[[-3.5, 8.3], [14, 8.3]]} start={0.8} dur={6} color={PASSANT_COLORS[2]} seed={7} />
      </City>
      <FloatTag t={t} at={1.5} out={2.6} x={a.pbAbove[0]} y={a.pbAbove[1]} text="Amoxicilline 1 g" icon="box" />
      <FloatTag t={t} at={1.6} out={2.6} x={a.coteAbove[0]} y={a.coteAbove[1]} text="Amoxicilline 1 g" icon="box" />
      <FloatTag t={t} at={3.2} out={4.4} x={a.pbAbove[0]} y={a.pbAbove[1]} text="Pharmacie du Centre" tone="citron" />
      <FloatTag t={t} at={3.3} out={4.4} x={a.coteAbove[0]} y={a.coteAbove[1]} text="La pharmacie d'à côté" tone="ghost" />
      <FloatTag t={t} at={4.5} out={5.3} x={a.pbAbove[0]} y={a.pbAbove[1]} text="Le conseil" sub="Probiotique · 12 en stock" icon="rx" stem={30} />
      {showAnchors &&
        Object.entries(a).map(([k, [x, y]]) => (
          <div key={k} style={{ position: "absolute", left: x - 7, top: y - 7, width: 14, height: 14, borderRadius: 7, background: PB.citron, boxShadow: `0 0 0 3px ${PB.ink}` }}>
            <span style={{ position: "absolute", left: 18, top: -6, fontFamily: JAKARTA, fontWeight: 700, fontSize: 20, color: PB.citron, whiteSpace: "nowrap", textShadow: "0 1px 4px #000" }}>{k}</span>
          </div>
        ))}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 580, background: rgba(N.white, 0.04), borderBottom: `2px dashed ${rgba(N.white, 0.25)}` }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 1480, borderTop: `2px dashed ${rgba(N.white, 0.25)}` }} />
    </AbsoluteFill>
  );
}
