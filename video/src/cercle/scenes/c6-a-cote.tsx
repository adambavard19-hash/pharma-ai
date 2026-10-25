import { AbsoluteFill } from "remotion";
import {
  CAMS,
  City,
  COTE_SHOP,
  EXIT,
  IN_OUT,
  LINEAR,
  N,
  PASSANT_COLORS,
  PB_SHOP,
  Passant,
  SNAP,
  anchors,
  camLerp,
  camLook,
  clamp01,
  cue,
  keys,
  prog,
  ressort,
  rgba,
  type CityCam,
  type Cue,
} from "../kit";
import { Bubble, Patient, Pharmacienne, Pharmacy, SET } from "../../rembobine/kit/decor";

/* ==========================================================================
 * C6 — À CÔTÉ (35,35 → 41,5). « Pendant ce temps, à côté… » — la pharmacienne d'à côté : « Et avec ceci, il vous
 * fallait autre chose ? » — le patient : « Non merci. »
 *
 *   35,35 → 36,95  sous le fondu de C5 (qui se referme sur CAMS.both), la caméra quitte la pharmacie illuminée et glisse
 *                  vers celle d'à côté ; tout se refroidit (couleurs éteintes, nuit bleutée). Le patient de C5 passe.
 *   36,8 → 37,25   une carte sort de la vitrine d'à côté : l'intérieur, au néon froid (décor de « Rembobinons », act1).
 *   38,27          la bulle grise « Il vous fallait autre chose ? » (la pharmacienne parle).
 *   40,05          « Non merci. » ; le patient se retourne et part, son sac à la main, une seule boîte dedans.
 *   40,45 → 40,72  la carte rentre dans la vitrine ; dehors, le passant ressort et s'en va dans la nuit ; la croix grésille
 *                  et s'éteint (40,6), la vitrine baisse.
 *   41,0 → 41,5    la scène s'efface sur C7, dont elle suit déjà la caméra (CAMS.cote qui s'élève).
 * La pharmacie d'à côté n'est ni nommée ni moquée : elle est seulement éteinte, la scène est triste.
 * ======================================================================== */

const COTE_FACE: [number, number, number] = [COTE_SHOP.xc, COTE_SHOP.y1, 2.3];
/** Pendant la carte : la pharmacie d'à côté en bas du cadre, sous la carte. */
const CAM_COTE = camLook(...COTE_FACE, 1.62, [600, 1300]);
const CAM_COTE2 = camLook(...COTE_FACE, 1.7, [585, 1290]);
/** Le début de C7 (mêmes valeurs que c7-pharmaboost.tsx) : la caméra part de CAMS.cote et s'élève vers CAM_HIGH. */
const CAM_HIGH = camLook(PB_SHOP.xc, -3, 2.2, 0.56, [540, 1000]);

/** C5 se referme sur CAMS.both (35,85) ; on glisse vers celle d'à côté ; à 41,0 on rejoint la caméra de C7. */
function camAt(t: number): CityCam {
  if (t < 36.95) return camLerp(CAMS.both, CAM_COTE, IN_OUT(clamp01((t - 35.6) / 1.35)));
  if (t < 40.45) return camLerp(CAM_COTE, CAM_COTE2, IN_OUT(clamp01((t - 36.95) / 3.5)));
  if (t < 41.0) return camLerp(CAM_COTE2, CAMS.cote, IN_OUT(clamp01((t - 40.45) / 0.55)));
  return camLerp(CAMS.cote, CAM_HIGH, IN_OUT(clamp01((t - 41.0) / 1.95)));
}

/** Le patient de C5 qui ressort de PharmaBoost, sac à la main : même marche que dans C5 (mêmes positions pendant le
 *  fondu), prolongée vers la droite — il passe devant celle d'à côté et s'en va. */
const LEAVER = { path: [[-5.4, -2.15], [-4.6, -1.0], [3.5, -0.9], [22, -0.9]] as [number, number][], start: 34.5, dur: 5.218 };

/* ---------------------------------------------------------------- la carte « à l'intérieur » */

/** Le cadre de la carte (px écran) et la part du décor 1920 × 1080 qu'elle montre (comptoir, pharmacienne, patient, porte). */
const CARD = { x: 70, y: 690, w: 940, h: 486 };
const CROP = { x: 540, y: 150 };
const S = CARD.w / 1280;
/** Un point du décor (repère 1920 × 1080) → l'écran. */
const inCard = (x: number, y: number): [number, number] => [CARD.x + (x - CROP.x) * S, CARD.y + (y - CROP.y) * S];

function InsideCard({ t, open, close, from }: { t: number; open: number; close: number; from: [number, number] }) {
  if (t < open) return null;
  const kIn = ressort(t, open, { damping: 20, stiffness: 200 });
  const kOut = prog(t, close, 0.27, EXIT);
  if (kOut >= 1) return null;
  const k = kIn * (1 - kOut);
  const cx = CARD.x + CARD.w / 2;
  const cy = CARD.y + CARD.h / 2;
  const dx = (from[0] - cx) * (1 - k);
  const dy = (from[1] - cy) * (1 - k);
  const sc = 0.06 + 0.94 * k;
  const tilt = (1 - clamp01(k)) * 8;
  // la lumière d'à côté baisse quand le patient s'en va
  const light = 1 - 0.35 * prog(t, 40.3, 0.5, LINEAR);
  const talk: [number, number][] = [[37.45, 39.62]];
  const leave = prog(t, 40.24, 1.25, LINEAR);
  const notch = inCard(SET.vitrine.x + SET.vitrine.w / 2, 0)[0];
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920, transform: `translate(${dx}px, ${dy}px) scale(${sc}) rotate(${tilt}deg)`, transformOrigin: `${cx}px ${cy}px`, opacity: clamp01(k * 3), pointerEvents: "none" }}>
      {/* la pointe vers la vitrine */}
      <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }} width={1080} height={1920}>
        <path d={`M${notch - 26},${CARD.y + CARD.h - 2} L${notch},${CARD.y + CARD.h + 30} L${notch + 26},${CARD.y + CARD.h - 2} Z`} fill="#3A464C" />
      </svg>
      <div
        style={{
          position: "absolute",
          left: CARD.x,
          top: CARD.y,
          width: CARD.w,
          height: CARD.h,
          borderRadius: 30,
          overflow: "hidden",
          background: "#1C2225",
          boxShadow: `0 30px 80px rgba(0,0,0,.6), 0 0 0 2px ${rgba("#C9D3D6", 0.22)}`,
        }}
      >
        <div style={{ position: "absolute", left: -CROP.x * S, top: -CROP.y * S, width: 1920, height: 1080, transform: `scale(${S})`, transformOrigin: "0 0" }}>
          <Pharmacy t={t} mood="act1" screen="grey" light={light} chimeAt={40.5}>
            <Pharmacienne t={t} mood="act1" expression="neutre" talk={talk} />
            <Patient t={t} mood="act1" expression="neutre" talk={[[40.05, 40.72]]} boxesInBag={1} leave={leave} />
          </Pharmacy>
        </div>
        {/* le reflet de la vitre */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(115deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 32%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.04) 100%)" }} />
      </div>
      <Bubble t={t} at={38.27} exitAt={39.86} text={"Il vous fallait autre chose\u00A0?"} mood="act1" side="left" size={40} {...pt(inCard(812, 238))} />
      <Bubble t={t} at={40.05} exitAt={40.62} text="Non merci." mood="act1" side="left" size={42} {...pt(inCard(1372, 262))} />
    </div>
  );
}
const pt = ([x, y]: [number, number]) => ({ x, y });

/* ---------------------------------------------------------------- la scène */

export function Scene({ t }: { t: number }) {
  const cam = camAt(t);
  const a = anchors(cam);
  // tout se refroidit
  const cold = prog(t, 35.55, 1.5, IN_OUT);
  const flicker = keys(t, [
    [40.36, 0],
    [40.4, 0.95],
    [40.58, 0.95],
    [40.62, 0],
  ]);
  const coteCross = 1 - prog(t, 40.6, 0.04, LINEAR);
  const coteLit = 0.75 - 0.62 * prog(t, 40.62, 0.3, SNAP);
  const dimCard = 0.42 * (prog(t, 36.85, 0.4, SNAP) - prog(t, 40.45, 0.3, SNAP));
  const fade = 1 - prog(t, 41.0, 0.5, LINEAR);
  return (
    <AbsoluteFill style={{ background: N.sky, opacity: fade }}>
      <City
        t={t}
        cam={cam}
        pbLit={1}
        queue={1}
        queueCount={6}
        coteLit={coteLit}
        coteCross={coteCross}
        coteFlicker={flicker}
        dim={dimCard + 0.12 * cold + 0.3 * prog(t, 41.0, 0.5, LINEAR)}
        style={{ filter: `saturate(${1 - 0.5 * cold}) brightness(${1 - 0.1 * cold})` }}
      >
        {/* le patient ressort, une seule boîte dans son sac, et s'en va dans la nuit */}
        <Passant t={t} path={[[COTE_SHOP.xc + 0.3, -2.5], [COTE_SHOP.xc + 1.0, -1.05], [COTE_SHOP.xc + 9, -1.05]]} start={40.5} dur={2.3} color={PASSANT_COLORS[3]} seed={6} bag fadeIn />
        <Passant t={t} path={LEAVER.path} start={LEAVER.start} dur={LEAVER.dur} color={PASSANT_COLORS[1]} seed={9} bag fadeIn />
        {/* la rue continue, indifférente (le même passant que C7) */}
        <Passant t={t} path={[[17, 8.25], [-16, 8.25]]} start={41.0} dur={9} color={PASSANT_COLORS[3]} seed={5} />
      </City>
      {/* le froid : une nuit bleutée qui s'installe */}
      <AbsoluteFill style={{ background: "#0A1820", opacity: 0.22 * cold, mixBlendMode: "multiply", pointerEvents: "none" }} />
      <InsideCard t={t} open={36.82} close={40.45} from={a.coteWindow} />
    </AbsoluteFill>
  );
}

export const cues: Cue[] = [
  cue("air-woosh", 35.5, 0.22),
  cue("carte-depliee", 36.84, 0.3),
  cue("bulle", 38.27, 0.25),
  cue("bulle", 40.05, 0.22),
  cue("porte-carillon", 40.5, 0.2),
  cue("tele-off", 40.58, 0.42),
];
