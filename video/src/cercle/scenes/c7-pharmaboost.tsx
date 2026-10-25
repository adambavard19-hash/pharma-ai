import { AbsoluteFill } from "remotion";
import { Cursor, LogoRobot, PBLogo } from "../../rembobine/kit/screens";
import {
  anchors,
  Burst,
  CAMS,
  camLerp,
  camLook,
  City,
  clamp01,
  Converge,
  cue,
  FloatTag,
  hash,
  IN_OUT,
  keys,
  lerp,
  LINEAR,
  N,
  Passant,
  PASSANT_COLORS,
  PB,
  PB_SHOP,
  prog,
  pulse,
  rgba,
  Ring,
  rnd,
  shake,
  Sparkle,
  Sparks,
  toScreen,
  type CityCam,
  type Cue,
  type P2,
} from "../kit";

/* ==========================================================================
 * C7 — PHARMABOOST (41,0 → 47,3). V14 « Ce copilote s'appelle… PharmaBoost. » · V15 « Et vous, quelle pharmacie
 * voulez-vous être ? »
 *
 *  41,0 → 42,95  la caméra quitte la pharmacie d'à côté (éteinte) et S'ÉLÈVE au-dessus du quartier ; le noir se fait
 *                autour de la seule pharmacie qui brille, les fenêtres s'éteignent ; des étincelles citron convergent.
 *  43,00         « PharmaBoost. » : le logo (robot + mot) CLAQUE au centre, né de la lumière de la pharmacie : onde,
 *                gerbe citron et or, éclat, secousse ; le quartier se rallume.
 *  43,55 → 44,95 la caméra redescend sur les deux pharmacies ; à 44,2 le logo rétrécit et file se poser au-dessus de
 *                celle qui brille, où il devient l'étiquette « Avec PharmaBoost ». « quelle » : « Sans PharmaBoost »
 *                (grise) au-dessus de l'autre.
 *  45,25 → 46,25 un curseur hésite : il va vers l'éteinte, s'y attarde, repart, et clique sur celle qui brille sur
 *                « être ? » : onde, étincelles, la vitrine rayonne, l'autre s'efface un peu plus.
 *  46,6 → 47,05  SORTIE : la caméra plonge dans la lumière de la pharmacie, qui envahit l'image ; le quartier s'éteint
 *                SOUS la lumière (46,82 → 46,9), puis elle se ramasse (46,9 → 47,0) en un cœur au point CORE (540, 1000)
 *                — le cœur de C8, qui éclate à 47,0 — et s'efface (46,97 → 47,05).
 * ======================================================================== */

const HIT = 43.0;
const CLICK = 46.25;
const LOGO: P2 = [540, 985];
/** Le point de l'écran où C8 fait naître ses particules : la pharmacie y arrive à la fin de la plongée. */
const CORE: P2 = [540, 1000];
const mix = (a: P2, b: P2, k: number): P2 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

const CAM_HIGH = camLook(PB_SHOP.xc, -3, 2.2, 0.56, [540, 1000]);
const CAM_HIGH2 = camLook(PB_SHOP.xc, -3, 2.2, 0.6, [540, 1000]);
const CAM_BOTH2: CityCam = { ...CAMS.both, zoom: 1.37 };
/** La plongée finale : le devant de la pharmacie glisse vers CORE pendant que le zoom grandit (régulier à l'écran). */
const PUSH_AT = 46.62;
const PUSH_DUR = 0.42;
const ACCEL = (x: number) => x * x;
const SHOP_FRONT: [number, number, number] = [PB_SHOP.xc, -3, 1.9];
const PUSH_FROM = toScreen(CAM_BOTH2, ...SHOP_FRONT);

const SEQ: [number, CityCam, (x: number) => number][] = [
  [41.0, CAMS.cote, IN_OUT],
  [42.95, CAM_HIGH, IN_OUT],
  [43.55, CAM_HIGH2, LINEAR],
  [44.95, CAMS.both, IN_OUT],
  [PUSH_AT, CAM_BOTH2, LINEAR],
];
function camAt(t: number): CityCam {
  if (t > PUSH_AT) {
    const k = prog(t, PUSH_AT, PUSH_DUR, ACCEL);
    return camLook(...SHOP_FRONT, CAM_BOTH2.zoom * Math.pow(3.8 / CAM_BOTH2.zoom, k), mix(PUSH_FROM, CORE, k));
  }
  if (t <= SEQ[0][0]) return SEQ[0][1];
  for (let i = 1; i < SEQ.length; i++) {
    const [t1, c1, e] = SEQ[i];
    const [t0, c0] = SEQ[i - 1];
    if (t < t1) return camLerp(c0, c1, e(clamp01((t - t0) / (t1 - t0))));
  }
  return SEQ[SEQ.length - 1][1];
}


/** Les poussières d'or et de citron qui flottent autour du logo (43,0 → 44,6), en un seul SVG. */
function Motes({ t }: { t: number }) {
  const on = prog(t, HIT, 0.25) * (1 - prog(t, 44.2, 0.45, LINEAR));
  if (on <= 0) return null;
  return (
    <svg width={1080} height={1920} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", overflow: "visible" }}>
      {Array.from({ length: 46 }, (_, i) => {
        const a = rnd("c7ma", i, 0, Math.PI * 2);
        const r0 = rnd("c7mr", i, 120, 470);
        const u = t - HIT;
        const r = r0 + 260 * (1 - Math.exp(-2.6 * u)) * (0.4 + hash("c7mv", i));
        const x = LOGO[0] + Math.cos(a) * r * 1.05;
        const y = LOGO[1] + Math.sin(a) * r * 0.62 - 26 * u;
        const tw = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * rnd("c7mf", i, 3, 7) + i), 2);
        const gold = hash("c7mc", i) < 0.4;
        const s = rnd("c7ms", i, 1.6, 4.2);
        return <circle key={i} cx={x} cy={y} r={s} fill={gold ? "#F7C65A" : PB.citron} opacity={on * tw * 0.9} />;
      })}
    </svg>
  );
}

export function Scene({ t }: { t: number }) {
  const cam = camAt(t);
  const a = anchors(cam);
  const sh = shake(t, HIT, 10, 16);

  // --- la lumière : le noir se fait autour de la pharmacie qui brille, les fenêtres s'éteignent puis reviennent
  const dark = keys(t, [
    [41.0, 0.08],
    [42.1, 0.42],
    [42.93, 0.74],
    [43.02, 0.5, LINEAR],
    [43.6, 0.46],
    [44.95, 0.16, IN_OUT],
    [46.62, 0.2],
    [46.95, 0.0],
  ]);
  const windows = keys(t, [
    [41.3, 1],
    [42.7, 0.25, IN_OUT],
    [HIT, 0.25],
    [44.0, 1, IN_OUT],
  ]);
  const coteLit = 0.16 - 0.1 * prog(t, CLICK + 0.05, 0.4);
  const shopPt = toScreen(cam, PB_SHOP.xc, -3, 1.8);
  const z = cam.zoom;

  // --- le logo : il claque au centre, puis file se poser au-dessus de la pharmacie qui brille
  const fly = prog(t, 44.18, 0.4, IN_OUT);
  const tagPt: P2 = [a.pbAbove[0], a.pbAbove[1] - 36];
  const lp = mix(LOGO, tagPt, fly);
  /** Le logo ne reste pas figé pendant qu'on le lit : une lente avancée. */
  const hold = 1 + 0.035 * prog(t, HIT + 0.15, 1.05, LINEAR);
  const ls = lerp(1, 0.14, fly) * hold;
  const lo = 1 - prog(t, 44.36, 0.22, LINEAR);
  const halo = prog(t, HIT - 0.02, 0.12) * (1 - fly);

  // --- le choix : les deux étiquettes, le curseur qui hésite puis clique
  const start: P2 = [610, 1350];
  const pGhost: P2 = [a.coteAbove[0] + 36, a.coteAbove[1] - 24];
  const pPB: P2 = [a.pbAbove[0] + 46, a.pbAbove[1] - 24];
  const k1 = prog(t, 45.27, 0.38, IN_OUT);
  const k2 = prog(t, 45.86, 0.33, IN_OUT);
  const arc = (k: number, amp: number) => Math.sin(Math.PI * k) * amp;
  let cur: P2 = k2 > 0 ? mix(pGhost, pPB, k2) : mix(start, pGhost, k1);
  cur = k2 > 0 ? [cur[0], cur[1] - arc(k2, 70)] : [cur[0] + arc(k1, 60), cur[1]];
  const hesit = t > 45.62 && t < 45.9 ? Math.sin((t - 45.62) * 30) * 7 * (1 - (t - 45.62) / 0.28) : 0;
  cur = [cur[0] + hesit, cur[1]];
  const curO = prog(t, 45.18, 0.16, LINEAR) * (1 - prog(t, 46.52, 0.14, LINEAR));
  const hoverGhost = pulse(t, 45.58, 0.12, 0.18, 0.2);
  const bump = 1 + 0.13 * pulse(t, CLICK, 0.06, 0.04, 0.32) + 0.04 * pulse(t, 45.98, 0.15, 0.1, 0.15);
  const ghostO = 1 - 0.55 * prog(t, CLICK + 0.05, 0.3);
  const tagsOut = 46.64;

  // --- la sortie : la lumière de la pharmacie envahit l'image (46,6 → 46,9) et le quartier disparaît DESSOUS (jamais
  //     de fondu du quartier à découvert : il donnait une image grise et boueuse) ; puis elle se RAMASSE (46,9 → 47,0)
  //     en un cœur au point CORE, le cœur de C8, qui éclate à 47,0.
  const fill = prog(t, 46.6, 0.3, ACCEL);
  const gather = prog(t, 46.9, 0.1, IN_OUT);
  const kPush = t > PUSH_AT ? prog(t, PUSH_AT, PUSH_DUR, ACCEL) : 0;
  const lightC = mix(mix(PUSH_FROM, CORE, kPush), CORE, gather);
  const lightRx = gather > 0 ? lerp(1700, 368, gather) : lerp(220, 1700, fill);
  const lightO = Math.min(1, fill * 3) * (1 - prog(t, 46.97, 0.08, LINEAR));
  const worldO = 1 - prog(t, 46.82, 0.08, LINEAR);
  const radiance = 0.22 * prog(t, 44.6, 0.6) + 0.42 * pulse(t, CLICK, 0.05, 0.1, 0.5);

  return (
    <AbsoluteFill>
    <AbsoluteFill style={{ background: N.sky, opacity: worldO }}>
      <AbsoluteFill style={{ transform: `translate(${sh.x}px, ${sh.y}px)` }}>
        <City t={t} cam={cam} lights={1} pbLit={1} coteLit={coteLit} coteCross={0} queue={1} windows={windows}>
          <Passant t={t} path={[[-5.6, -2.5], [-3.2, -0.85], [16, -0.85]]} start={44.7} dur={4.6} color={PASSANT_COLORS[2]} seed={11} bag />
          <Passant t={t} path={[[17, 8.25], [-16, 8.25]]} start={41.0} dur={9} color={PASSANT_COLORS[3]} seed={5} />
        </City>
        {/* le noir se fait autour de la seule pharmacie qui brille */}
        <AbsoluteFill
          style={{
            pointerEvents: "none",
            background: `radial-gradient(circle at ${shopPt[0]}px ${shopPt[1]}px, ${rgba(N.sky, 0)} ${130 * z}px, ${rgba(N.sky, dark * 0.75)} ${420 * z}px, ${rgba(N.sky, dark)} ${900 * z}px)`,
          }}
        />
        {/* elle rayonne */}
        {radiance > 0 && (
          <div style={{ position: "absolute", left: shopPt[0] - 420 * z, top: shopPt[1] - 300 * z, width: 840 * z, height: 600 * z, borderRadius: "50%", pointerEvents: "none", mixBlendMode: "screen", opacity: radiance, background: `radial-gradient(ellipse, ${rgba(PB.glow, 0.55)} 0%, ${rgba(PB.citron, 0.18)} 40%, transparent 70%)` }} />
        )}
      </AbsoluteFill>

      {/* « Ce copilote s'appelle… » : la lumière converge */}
      <Converge t={t} at={42.1} dur={0.9} x={LOGO[0]} y={LOGO[1]} count={34} seed="c7conv" radius={560} color={PB.citron} size={5} />

      {/* « PharmaBoost. » */}
      {halo > 0 && (
        <>
          <div style={{ position: "absolute", left: LOGO[0] - 560, top: LOGO[1] - 420, width: 1120, height: 840, borderRadius: "50%", pointerEvents: "none", opacity: halo, background: `radial-gradient(ellipse, ${rgba("#020806", 0.72)} 0%, ${rgba("#020806", 0.45)} 45%, transparent 72%)` }} />
          <div style={{ position: "absolute", left: LOGO[0] - 360, top: LOGO[1] - 330, width: 720, height: 560, borderRadius: "50%", pointerEvents: "none", mixBlendMode: "screen", opacity: halo * (0.55 + 0.9 * pulse(t, HIT, 0.03, 0.05, 0.7)), background: `radial-gradient(ellipse, ${rgba(PB.citron, 0.26)} 0%, ${rgba(PB.citron, 0.07)} 45%, transparent 70%)` }} />
        </>
      )}
      <Ring t={t} at={HIT} x={LOGO[0]} y={LOGO[1]} max={1150} color={PB.citron} width={6} life={0.85} />
      <Sparks t={t} at={HIT} x={LOGO[0]} y={LOGO[1] - 40} count={28} seed="c7sp" speed={1350} spread={180} color={PB.citron} len={36} life={0.6} width={3} />
      <Burst t={t} at={HIT + 0.02} x={LOGO[0]} y={LOGO[1]} count={22} radius={470} seed="c7bu" colors={[PB.citron, "#F7C65A", "#FFFFFF"]} size={13} life={0.8} />
      <Motes t={t} />
      {t >= HIT - 0.02 && lo > 0 && (
        <div style={{ position: "absolute", left: lp[0], top: lp[1], width: 0, height: 0, transform: `scale(${ls})`, opacity: lo }}>
          <PBLogo t={t} at={HIT - 0.02} variant="icon" size={150} x={0} y={-118} />
          <PBLogo t={t} at={HIT} variant="wordmark" size={132} x={0} y={84} />
        </div>
      )}
      <Sparkle t={t} at={HIT + 0.3} x={LOGO[0] + 330} y={LOGO[1] + 20} size={70} color="#FFF4D6" />
      <Sparkle t={t} at={HIT + 0.55} x={LOGO[0] - 300} y={LOGO[1] + 120} size={50} color={PB.citron} />

      {/* « Et vous, quelle pharmacie voulez-vous être ? » */}
      <div style={{ position: "absolute", inset: 0, transformOrigin: `${a.pbAbove[0]}px ${a.pbAbove[1]}px`, transform: `scale(${bump})` }}>
        <FloatTag t={t} at={44.5} out={tagsOut} x={a.pbAbove[0]} y={a.pbAbove[1]} text="Avec PharmaBoost" tone="citron" scale={1.15} icon={<LogoRobot t={t} size={46} seed={2} />} />
      </div>
      <div style={{ position: "absolute", inset: 0, opacity: ghostO, transformOrigin: `${a.coteAbove[0]}px ${a.coteAbove[1]}px`, transform: `scale(${1 + 0.06 * hoverGhost})` }}>
        <FloatTag t={t} at={45.07} out={46.47} x={a.coteAbove[0]} y={a.coteAbove[1]} text="Sans PharmaBoost" tone="ghost" scale={1.15} />
      </div>
      <Ring t={t} at={CLICK + 0.02} x={pPB[0] - 46} y={pPB[1] - 8} max={420} color={PB.citron} width={4} life={0.6} echo={false} />
      <Sparkle t={t} at={CLICK + 0.04} x={a.pbAbove[0] - 170} y={a.pbAbove[1] - 70} size={52} color={PB.citron} />
      <Sparkle t={t} at={CLICK + 0.14} x={a.pbAbove[0] + 175} y={a.pbAbove[1] - 20} size={42} color="#FFF4D6" />
      <Sparkle t={t} at={CLICK + 0.24} x={a.pbAbove[0] - 120} y={a.pbAbove[1] + 40} size={34} color="#F7C65A" />
      {curO > 0 && <Cursor t={t} x={cur[0]} y={cur[1]} clickAt={CLICK} opacity={curO} size={1.15} />}

    </AbsoluteFill>

      {/* sortie : la lumière envahit l'image, le quartier s'éteint dessous, puis elle se ramasse dans le cœur de C8 */}
      {lightO > 0 && (
        <AbsoluteFill
          style={{
            pointerEvents: "none",
            opacity: lightO,
            background: `radial-gradient(ellipse ${lightRx}px ${lightRx * 0.75}px at ${lightC[0]}px ${lightC[1]}px, ${rgba("#FFFFF2", lerp(1, 0.9, gather))} 0%, ${rgba(PB.glow, lerp(1, 0.6, gather))} ${lerp(22, 15, gather)}%, ${rgba(PB.citron, lerp(0.9, 0.4, gather))} ${lerp(50, 30, gather)}%, ${rgba(PB.citron, lerp(0.45, 0.1, gather))} ${lerp(75, 55, gather)}%, ${rgba(PB.citron, 0)} ${lerp(100, 70, gather)}%)`,
          }}
        />
      )}
    </AbsoluteFill>
  );
}

export const cues: Cue[] = [
  cue("air-woosh", 41.25, 0.26), // la caméra s'élève
  cue("aspiration", 41.62, 0.4), // la lumière converge, jusqu'au nom
  cue("impact-net", HIT, 0.8), // « PharmaBoost. »
  cue("scintillement", HIT + 0.08, 0.4), // la gerbe
  cue("whoosh-pb", 44.2, 0.32), // le logo file vers la pharmacie
  cue("ui-pop", 44.52, 0.35), // « Avec PharmaBoost »
  cue("pop-leger", 45.07, 0.28), // « Sans PharmaBoost »
  cue("tic-sec", 45.64, 0.16), // le curseur s'attarde sur l'éteinte
  cue("ui-clic", CLICK, 0.6), // il choisit celle qui brille
  cue("etincelle", CLICK + 0.03, 0.38),
  cue("whoosh-cine", 46.6, 0.34), // la plongée dans la lumière
];
