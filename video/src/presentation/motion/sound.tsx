import { useMemo } from "react";
import { Sequence, staticFile, useCurrentFrame } from "remotion";
import { Audio } from "@remotion/media";
import { cue, type Cue, type PbSfx } from "./kit/sfx";
import { SCENES } from "./scenes";
import { SFX2_DURATIONS } from "./sfx2-durations";
import { SCENE_IDS, type SceneId, type Time } from "./time";

/* ==========================================================================
 * LA BANDE SON du film « Présentation » : musique (ElevenLabs Music) + effets (ElevenLabs Sound Effects).
 * Les voix sont posées par l'orchestrateur ; ce composant est posé HORS des séquences de scène, en images du FILM.
 *
 * MUSIQUE (public/music/, fabriquée par scripts/musique-elevenlabs.mjs puis scripts/montage-musique.sh) :
 *   M1 « Tension »    presentation-m1.mp3            calée pour que SA coupure nette (12,05 s du fichier) tombe sur
 *                                                    l'ARRÊT SUR IMAGE (FZ de la scène 3) ; rien ne dépasse FZ.
 *   (silence musical de l'éveil : extinction de téléviseur, nappe, démarrage du robot, montée inversée)
 *   M2 « Groove »     presentation-m2.mp3            son attaque tombe sur le DROP (« Pharma » de P6).
 *                     · temps d'arrêt d'un temps juste avant le tampon VENDU, reprise sur le tampon ;
 *                     · retenue sur « Vente terminée… », reprise sur « et le robot » (boule d'or qui éclate).
 *   M2 « Confiance »  presentation-m2-confiance.mp3  fondu enchaîné sur le temps de grille le plus proche de P15
 *                                                    (piano calme, montée à la fin), coupée net au logo.
 *   M2 « Final »      presentation-m2-final.mp3      attaque pile sur le logo (début de P18), traîne de cloches,
 *                                                    fondu jusqu'au noir final.
 *   Volume : niveau de base hors voix, × 0,36 sous la voix (−9 dB ; M1 « Tension » × 0,45, −7 dB : les phrases de l'acte 1
 *   se suivent à 0,2-0,3 s, elle ne remonterait jamais), attaque 60 ms, relâche 300 ms ; les respirations de moins de
 *   0,36 s restent baissées, pour ne pas « pomper » ; pleine dans les silences (après P4, P5, P12, P17, tenue finale).
 *   Sur la chute (DROP), la reprise de la boule d'or et le logo, la musique n'est baissée qu'à × 0,7 pendant 0,3 s :
 *   l'attaque passe au-dessus de la voix.
 *
 * LES VOIX sont à la même sonie (−18 LUFS chacune, scripts/voix-presentation.mjs) : aucune phrase n'est « remontée » ici
 * (Remotion plafonne le volume à 1), le fond n'est creusé en plus que sous P12, chargée d'effets.
 *
 * EFFETS (public/sfx2/<nom>.mp3, crête −1 dBFS, fabriqués par scripts/sfx-elevenlabs.mjs ; les deux impacts y reçoivent
 * les harmoniques de leur sub, sinon inaudibles sur un portable ou un téléphone) :
 *   - les repères exportés par chaque scène (`cues`) ; pour une scène qui n'en exporte encore AUCUN, les repères de
 *     la direction écrits ici (FALLBACK) — ils s'effacent d'eux-mêmes dès que la scène exporte les siens ;
 *   - bus effets 0,75, baissé sous la voix (× 0,4 pour les sons longs ou denses, × 0,6 pour les clics) : pleins dans
 *     les silences, ils ne couvrent jamais la voix ;
 *   - LES TROIS GRANDES FRAPPES (chute « Pharma », boule d'or « et le robot », logo) échappent à cette baisse pendant leur
 *     attaque : × 0,85 pendant 0,2 s, retour lissé en 0,25 s ; la boule d'or et le logo sont avancés de HIT_LEAD pour que
 *     l'attaque tombe dans le silence qui précède la voix (pause de P12, fin de P17), à un gain de repère d'au moins 0,8 ;
 *   - CRÊTE : le mélange de Remotion est en entiers 16 bits (tout ce qui dépasse 0 dBFS est écrêté AVANT le limiteur de
 *     l'export) ; simulé sur le plan, il plafonne à −1,2 dBFS (sur la chute) — à revérifier après tout changement de niveau ;
 *   - ARRÊT SUR IMAGE : tout ce qui sonne avant FZ est coupé net à FZ (la montée finit pile dessus, accélérée) ;
 *   - ÉVEIL : tout ce qui part entre FZ et le DROP se tait 0,12 s avant le DROP.
 * ======================================================================== */

export type SoundtrackProps = { time: Time; cues: Cue[] };

const FPS = 60;
const fr = (s: number) => Math.round(s * FPS);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};
/** 0 → 1 entre a et b (linéaire). */
const up = (t: number, a: number, b: number) => (b <= a ? (t >= b ? 1 : 0) : clamp01((t - a) / (b - a)));

/* ---------------------------------------------------------------------------- constantes mesurées sur les fichiers */

/** M1 : la coupure nette de la musique, en secondes DANS le fichier (ffmpeg : −12 dB à 12,00 s, −48 dB à 12,10 s). */
const M1_CUT = 12.05;
/** M1 : la bouffée trop forte (+12 dB) de 7,65 à 9,25 s du fichier, ramenée au niveau du reste. */
const M1_HOT: [number, number, number] = [7.65, 9.25, 0.32];
/** Délai de l'attaque dans les fichiers (décodeur mp3 + pré-attaque) : M2 25 ms, confiance 45 ms, final 25 ms. */
const M2_ATTACK = 0.025;
const TRUST_ATTACK = 0.045;
const FINAL_ATTACK = 0.025;

/* ---------------------------------------------------------------------------- niveaux */

const LEVEL = { m1: 0.75, m2: 0.72, trust: 0.7, final: 0.72 };
/** Musique sous la voix : −9 dB (direction) ; M1 « Tension » −7 dB (sinon baissée sans interruption de 0,7 à 12,6 s). */
const DUCK = 0.36;
const DUCK_M1 = 0.45;
const DUCK_TRUST = 0.36;
const SFX_BUS = 0.75;
/** Effets sous la voix : × 0,4 pour les sons longs ou denses, × 0,6 pour les clics et tintements (ils masquent moins). */
const FX_DUCK = 0.4;
const FX_DUCK_LIGHT = 0.6;

/** Équilibrage par effet (les fichiers sont tous à −1 dBFS de crête ; les sons denses paraissent plus forts). */
const TRIM: Partial<Record<PbSfx, number>> = {
  whoosh_heavy: 0.6,
  impact_reveal: 0.72, // la chute tombe sur « Pharma » : voix + frappe + musique ≤ −1,2 dBFS (à 0,8 : −0,7)
  robot_boot: 0.7,
  robot_boot_rev: 0.7,
  riser_big: 0.75,
  reverse_riser: 0.85,
  slot_lock: 0.7,
  paper_plane: 0.75,
  mail_chime: 0.8,
  confetti_cannon: 0.8,
  confetti_cannon_L: 0.85,
  confetti_cannon_R: 0.85,
  queue_murmur: 0.8,
  impact_clean: 0.8, // logo, boule d'or : la voix dit « PharmaBoost » par-dessus, on garde de la marge
  bubble_pop: 0.85,
  gauge_slam: 0.85,
};

/**
 * Les grandes frappes : × 0,85 sous la voix pendant HIT_HOLD après leur départ, retour à la baisse normale en HIT_RELEASE
 * (lissé). La musique, elle, n'est baissée qu'à × 0,7 pendant 0,3 s sur la chute, la boule d'or et le logo.
 */
const HIT_DEPTH = 0.85;
const HIT_HOLD = 0.2;
const HIT_RELEASE = 0.25;
const MUSIC_HIT_DEPTH = 0.7;
const MUSIC_HIT_HOLD = 0.3;
/**
 * Avance des frappes de la boule d'or et du logo sur leur mot : l'attaque (pleine dès la 1re milliseconde du fichier) tombe
 * dans le silence d'avant la voix. 3 images : au-delà de 45 ms d'avance, le son se voit en avance sur l'éclatement.
 */
const HIT_LEAD = 0.05;
/**
 * Gain de repère minimal des frappes sur un mot (boule d'or, logo) : la scène 9 pose la boule d'or à 0,5 (« plus bas »), ce
 * qui la laissait 7 dB sous la voix ; à 0,8 elle porte la reprise de la musique sans dépasser la crête de la chute.
 */
const HIT_MIN_GAIN = 0.8;

/**
 * Poids 0..1 d'une frappe partie à `at` : 1 pendant `hold`, puis retour lissé en `release`. Plein dès 2 images avant `at` :
 * la première image d'une piste (arrondie à l'image) ou l'attaque du fichier peuvent précéder `at` de quelques ms.
 */
const hitWeight = (t: number, at: number, hold: number, release = HIT_RELEASE) => (t < at - 2 / FPS ? 0 : t <= at + hold ? 1 : 1 - smooth((t - at - hold) / release));
/** Remonte une baisse `k` vers `depth` avec le poids `w` (jamais plus bas que `k`). */
const lift = (k: number, depth: number, w: number) => k + Math.max(0, depth - k) * w;

/** Sons courts et aigus : ils masquent peu la voix, on les baisse moins. */
const LIGHT = new Set<PbSfx>(["ui_click", "ui_pop", "tick_metronome", "hud_lock", "ui_ding", "radar_ping", "mail_chime", "sparkle_shimmer", "box_drop", "coin_flip", "pen_signature", "bubble_pop"]);

/* ---------------------------------------------------------------------------- la voix : présence 0..1 */

type Span = [number, number];

/** Les intervalles de voix, les respirations de moins de 0,36 s fusionnées. */
function voiceSpans(time: Time): Span[] {
  const spans: Span[] = [];
  for (const l of time.tl.lines) {
    const last = spans[spans.length - 1];
    if (last && l.start - last[1] < 0.36) last[1] = l.end;
    else spans.push([l.start, l.end]);
  }
  return spans;
}

/** Présence de la voix : 1 pendant, rampe d'attaque 60 ms avant, relâche 300 ms (lissée) après. */
function presence(t: number, spans: Span[]) {
  let p = 0;
  for (const [s, e] of spans) {
    if (t < s - 0.06 || t > e + 0.3) continue;
    const v = t < s ? up(t, s - 0.06, s) : t <= e ? 1 : 1 - smooth((t - e) / 0.3);
    if (v > p) p = v;
  }
  return p;
}

/**
 * Phrases couvertes par une scène dense : le fond y est baissé en plus. Depuis que les voix sont toutes à −18 LUFS
 * (15 oct. 2026), P7, P13 et P19 n'en ont plus besoin ; reste P12, chargée d'effets (bannière, montée, boule d'or).
 */
const SOFT: Record<string, number> = { P12: 0.65 };

let softLines: { s: number; e: number; f: number }[] = [];

function softFactor(t: number) {
  let k = 1;
  for (const { s, e, f } of softLines) {
    if (t < s - 0.06 || t > e + 0.3) continue;
    const w = t < s ? up(t, s - 0.06, s) : t <= e ? 1 : 1 - smooth((t - e) / 0.3);
    k = Math.min(k, 1 - (1 - f) * w);
  }
  return k;
}

const duckOf = (t: number, spans: Span[], depth: number) => (1 - (1 - depth) * presence(t, spans)) * softFactor(t);

/* ---------------------------------------------------------------------------- ancrages */

function anchors(time: Time, fx: Fx[]) {
  const p4 = time.line("P4");
  // Même formule que la scène 3 (scene-03-ce-qui-se-perd.tsx, anchorsOf) : l'ARRÊT SUR IMAGE.
  const FZ = Math.min(time.seg(4, 5) + 0.55, p4.end - 0.05);
  const D = time.DROP;
  const P15 = time.A("P15");
  // La confiance entre sur le temps de grille (120 BPM ancrés au DROP) le plus proche du début de P15.
  const trust = time.beat(Math.round((P15 - D) / 0.5));
  const logo = time.marks.logo;
  const vendu = time.marks.vendu;
  // La boule d'or : l'instant RÉEL de sa frappe (avancée par markHits, ou par la scène 9), sinon « et le robot » − HIT_LEAD.
  const word = time.A("P12", 1);
  const boom = fx.find((c) => c.hit && c.name === "impact_clean" && Math.abs(c.at - word) <= 0.2)?.at ?? word - HIT_LEAD;
  return {
    FZ,
    D,
    m1Start: FZ - M1_CUT,
    trust,
    logo,
    vendu,
    stamp: vendu + 6 / FPS, // le tampon touche (scene-08-vendu.tsx : LAND = VENDU + 6 images)
    fete0: time.seg(12, 1),
    boom,
    end: time.total,
  };
}
type Anchors = ReturnType<typeof anchors>;

/* ---------------------------------------------------------------------------- courbes de volume de la musique */

function m1Volume(t: number, a: Anchors, spans: Span[]) {
  const ft = t - a.m1Start; // temps dans le fichier
  const [h0, h1, hg] = M1_HOT;
  const hot = 1 - (1 - hg) * Math.min(up(ft, h0 - 0.06, h0), 1 - up(ft, h1, h1 + 0.06));
  const cut = 1 - up(t, a.FZ - 2 / FPS, a.FZ); // coupe nette (2 images) au gel
  return LEVEL.m1 * duckOf(t, spans, DUCK_M1) * hot * cut;
}

function m2Volume(t: number, a: Anchors, spans: Span[]) {
  // Temps d'arrêt : la musique tombe 0,28 s avant « vendu » et revient d'un coup sur le tampon.
  const stop = 1 - 0.92 * Math.min(up(t, a.vendu - 0.32, a.vendu - 0.28), 1 - up(t, a.stamp - 1 / FPS, a.stamp));
  // Retenue : « Vente terminée… » aspire la musique (0,14), la boule d'or la relâche, pile sur sa frappe.
  const hold = 1 - 0.86 * Math.min(up(t, a.fete0 + 0.05, a.fete0 + 0.3), 1 - up(t, a.boom - 1 / FPS, a.boom));
  const out = 1 - smooth((t - a.trust) / 0.45);
  // La chute et la reprise de la boule d'or passent au-dessus de la voix (× 0,7 au lieu de × 0,36 pendant 0,3 s).
  const duck = lift(duckOf(t, spans, DUCK), MUSIC_HIT_DEPTH, Math.max(hitWeight(t, a.D, MUSIC_HIT_HOLD), hitWeight(t, a.boom, MUSIC_HIT_HOLD)));
  return LEVEL.m2 * duck * stop * hold * out;
}

function trustVolume(t: number, a: Anchors, spans: Span[]) {
  const fadeIn = smooth((t - a.trust) / 0.45);
  const cut = 1 - up(t, a.logo - 2 / FPS, a.logo);
  return LEVEL.trust * duckOf(t, spans, DUCK_TRUST) * fadeIn * cut;
}

function finalVolume(t: number, a: Anchors, spans: Span[]) {
  const fade = 1 - smooth((t - (a.end - 1.6)) / 1.6); // fondu jusqu'au noir final
  // Le logo : l'attaque du final passe au-dessus de « Pharma Boost » (× 0,7 pendant 0,3 s).
  const duck = lift(duckOf(t, spans, DUCK), MUSIC_HIT_DEPTH, hitWeight(t, a.logo, MUSIC_HIT_HOLD));
  return LEVEL.final * duck * fade;
}

/* ---------------------------------------------------------------------------- lecteurs */

/**
 * Une piste posée à `at` (secondes du film), jouée jusqu'à `until`, volume calculé en temps du film.
 * Le volume est lu sur l'horloge de LA PISTE (useCurrentFrame), pas sur l'argument du rappel de volume, que Remotion décale
 * quand une séquence parente commence avant 0 (l'aperçu PresScene décale tout le film).
 */
function Track({ src, at, until, volume, name, rate = 1, skip = 0 }: { src: string; at: number; until: number; volume: (t: number) => number; name: string; rate?: number; skip?: number }) {
  const from = fr(at);
  const dur = fr(until) - from;
  if (dur <= 0) return null;
  // Une piste qui commencerait avant l'image 0 est rognée d'autant.
  const pre = Math.max(0, -from);
  return (
    <Sequence from={from + pre} durationInFrames={dur - pre} layout="none" name={name}>
      <TrackAudio src={src} rate={rate} trim={fr(skip) + Math.round(pre * rate)} volumeAt={(f) => volume((from + pre + f) / FPS)} />
    </Sequence>
  );
}

function TrackAudio({ src, rate, trim, volumeAt }: { src: string; rate: number; trim: number; volumeAt: (f: number) => number }) {
  const f = useCurrentFrame();
  return <Audio src={src} playbackRate={rate} trimBefore={trim || undefined} volume={Math.max(0, Math.min(1, volumeAt(f)))} />;
}

/** Un effet : nom PbSfx, départ, gain, vitesse ; `skip` = secondes rognées au début du fichier ; `until` = coupe ;
 *  `fade` = durée du fondu de sortie quand il est coupé (2 images par défaut) ;
 *  `duck` = baisse sous la voix propre à ce repère (× duck au lieu de × 0,4 / × 0,6), à partir de `duckFrom` (s du film ;
 *  fondu de 0,1 s avant) ou partout sans `duckFrom` ; `preDrop` = silence avant le DROP pour un son de l'éveil (0,12 par défaut) ;
 *  `hit` = une des trois grandes frappes (posé par markHits, pas par les scènes). */
export type Fx = Cue & { skip?: number; until?: number; fade?: number; duck?: number; duckFrom?: number; preDrop?: number; hit?: boolean };

/* ---------------------------------------------------------------------------- effets de repli (scènes sans cues) */

/** La direction (§5, liste « sfx ») pour les scènes 9 à 12, tant que leurs fichiers n'exportent aucun repère. */
const FALLBACK: Partial<Record<SceneId, (time: Time) => Fx[]>> = {
  // S9 · La fête — « Vente terminée… et le robot fait la fête ! »
  S9: (time) => {
    const s1 = time.seg(12, 1);
    const s2 = time.seg(12, 2);
    const s3 = time.seg(12, 3);
    const z = time.Z("P12");
    return [
      cue("ui_click", s1 + 0.05, 0.55),
      cue("whoosh_fast", s1 + 0.2, 0.3, 0.75), // la bannière aspirée
      { ...cue("reverse_riser", s2 - 0.9, 0.55), skip: 1.1 }, // ses 0,9 dernières secondes avant « et le robot »
      cue("impact_clean", s2, 0.7, 0.85), // la boule d'or éclate (plus bas)
      cue("robot_boing", s2 + 0.12, 0.5),
      cue("confetti_cannon_L", s3, 0.8),
      cue("confetti_cannon_R", s3 + 0.08, 0.8),
      cue("sparkle_shimmer", s3 + 0.25, 0.5), // BRAVO !
      cue("robot_boing", s3 + 0.6, 0.35, 1.2), // pas de danse
      cue("robot_boing", s3 + 1.1, 0.3, 1.3),
      ...[0, 1, 2, 3].map((i) => cue("ui_pop", z + 0.25 + i * 0.12, 0.3, 1 + i * 0.08)), // les confettis dessinent 4 tuiles
    ];
  },
  // S10 · L'équipe — 4 comptoirs, historiques, FLIP vers « Performances », 3 barres → 3 piliers.
  S10: (time) => {
    const w = time.win.S10;
    const a1 = time.seg(13, 1);
    const a2 = time.seg(13, 2);
    const a3 = time.seg(13, 3);
    const b1 = time.seg(14, 1);
    const b2 = time.seg(14, 2);
    return [
      cue("whoosh_fast", w.start + 0.05, 0.4),
      ...[0, 1, 2, 3].map((i) => cue("ui_pop", a1 + 0.1 + i * 0.12, 0.35, 0.95 + i * 0.07)),
      cue("robot_boing", a1 + 0.75, 0.3, 1.2),
      ...[0, 1, 2].map((i) => cue("ui_click", a2 + 0.15 + i * 0.15, 0.25, 1.3)),
      cue("sparkle_shimmer", a3 + 0.15, 0.4), // anneau doré fermé sur une étoile
      cue("whoosh_heavy", b1 - 0.12, 0.45), // recomposition FLIP
      ...[0, 1, 2].map((i) => cue("ui_pop", b1 + 0.35 + i * 0.1, 0.3, 1.1)),
      cue("box_drop", b2 + 0.35, 0.35, 0.8), // podium
      { ...cue("reverse_riser", w.end - 0.6, 0.4), skip: 1.4 }, // ses 0,6 dernières secondes avant les piliers
    ];
  },
  // S11 · La confiance — règles, sceau, signature ; dossier en lamelles, bouclier, cadenas ; Vendu / Non vendu.
  S11: (time) => {
    const w = time.win.S11;
    const a1 = time.seg(15, 1);
    const a2 = time.seg(15, 2);
    const a3 = time.seg(15, 3);
    const b = time.seg(16, 1);
    const c1 = time.seg(17, 1);
    const c2 = time.seg(17, 2);
    return [
      cue("paper_fold", a1 + 0.05, 0.4), // éventail de règles
      ...[0, 1, 2].map((i) => cue("ui_click", a2 + 0.1 + i * 0.15, 0.3, 1.2)), // coches
      cue("stamp_slam", a3 + 0.3, 0.4, 1.1), // sceau VALIDÉE
      cue("pen_signature", a3 + 0.6, 0.4),
      cue("pixel_dissolve", b, 0.5), // le dossier patient part en lamelles
      cue("lock_shield", b + 0.55, 0.55),
      cue("ui_click", c1 + 0.1, 0.35), // Vendu / Non vendu
      cue("whoosh_fast", c2, 0.35, 0.8), // projecteur
      cue("reverse_riser", w.end - 2.0, 0.45), // plongée dans la visière
      cue("whoosh_heavy", w.end - 0.35, 0.5),
    ];
  },
  // S12 · Signature — yeux → « oo », logo, orbite des gadgets, « à chaque vente », pharmaboost.app au laser, croix menthe.
  S12: (time) => {
    const logo = time.marks.logo;
    const sign = time.marks.sign;
    const each = time.seg(18, 2);
    const p19 = time.A("P19");
    const z19 = time.Z("P19");
    const orbit = SFX2_DURATIONS.orbit_whoosh ?? 1.48;
    const span = Math.max(0.4, each - sign);
    return [
      cue("robot_boot_rev", logo - 0.8, 0.5), // les yeux deviennent le « oo »
      cue("impact_clean", logo, 0.9),
      cue("sparkle_shimmer", logo + 0.45, 0.45), // reflet du logo
      cue("orbit_whoosh", sign, 0.55, Math.min(1.6, Math.max(0.7, orbit / span))), // finit sur « à chaque vente »
      cue("impact_clean", each, 0.55, 1.35), // éclair de l'orbite
      cue("laser_write", p19 + 0.9, 0.5), // le robot écrit pharmaboost.app
      cue("ui_pop", z19 - 0.1, 0.35), // la pilule se remplit
      cue("sparkle_shimmer", z19 + 0.05, 0.4), // le point de « .app »
      cue("neon_clean_on", z19 + 0.35, 0.55), // la croix du début se rallume en menthe
      cue("robot_boing", z19 + 0.9, 0.3, 1.2), // coucou
    ];
  },
};

/**
 * Montées inversées « rognées » : les scènes 9, 10 et 11 posent `reverse_riser` à (cible − L) en voulant n'en entendre que
 * les L DERNIÈRES secondes (le système de repères ne sait pas rogner) — sans rognage, la crête du fichier de 2 s tomberait
 * 1,1 à 1,4 s APRÈS la cible (sur le logo pour S11). On rogne donc le début ici.
 */
const RISER_TAIL: Partial<Record<SceneId, number>> = { S9: 0.9, S10: 0.6, S11: 0.6 };

/** Les effets recommandés par les comptes rendus des scènes mais non exportés dans leurs `cues` (assemblage, 15 oct.). */
function assemblyExtras(time: Time): Fx[] {
  const s3 = time.A("P3", 1);
  const s3b = time.A("P3", 2);
  const glitch = Math.max(s3 + 0.3, s3b);
  const pop = Math.min(glitch + 0.68, time.win.S2.end - 0.17);
  return [
    cue("box_drop", time.win.S1.end - 0.125, 0.3, 0.8), // S1 : la barre retombe avant le relais
    cue("whoosh_fast", pop - 0.18, 0.3, 1.3), // S2 : la bulle est aspirée
    cue("radar_ping", time.A("P5", 2) + 0.03, 0.25), // S4 : l'anneau de pulsation rallume le monde
  ];
}

/**
 * Les trois grandes frappes : la chute (impact_reveal, sur « Pharma »), la boule d'or (impact_clean sur « et le robot ») et le
 * logo (impact_clean sur « Pharma Boost »). Les deux dernières sont avancées de HIT_LEAD — sauf si la scène les a déjà
 * placées plus tôt (une scène qui avance tout son éclatement garde son temps).
 */
function markHits(time: Time, fx: Fx[]): Fx[] {
  const words = [time.A("P12", 1), time.marks.logo];
  return fx.map((c) => {
    if (c.name === "impact_reveal") return { ...c, hit: true };
    if (c.name !== "impact_clean") return c;
    const word = words.find((w) => Math.abs(c.at - w) <= 0.15);
    return word === undefined ? c : { ...c, at: Math.min(c.at, word - HIT_LEAD), gain: Math.max(c.gain ?? 1, HIT_MIN_GAIN), hit: true };
  });
}

/** Tous les effets : ceux des scènes, plus le repli des scènes muettes et les compléments d'assemblage. */
export function allEffects(time: Time, _sceneCues?: Cue[]): Fx[] {
  const out: Fx[] = [];
  for (const id of SCENE_IDS) {
    const own = SCENES[id].cues(time);
    const fb = FALLBACK[id];
    if (own.length === 0 && fb) {
      out.push(...fb(time));
      continue;
    }
    const tail = RISER_TAIL[id];
    for (const c of own) {
      if (c.name === "reverse_riser" && tail !== undefined) out.push({ ...c, skip: Math.max(0, (SFX2_DURATIONS.reverse_riser ?? 2) - tail) });
      else if (c.name === "queue_murmur" && id === "S1") out.push({ ...c, until: time.win.S1.end + 0.3, fade: 0.3 }); // fondu à la sortie de S1
      else out.push(c);
    }
  }
  out.push(...assemblyExtras(time));
  return markHits(time, out).filter((c) => SFX2_DURATIONS[c.name] !== undefined);
}

/** Les règles de coupe et de placement propres au film (gel, éveil, montée calée sur le gel). */
function placeEffect(c: Fx, a: Anchors): { at: number; until: number; rate: number; skip: number; cut: boolean; fade: number } | null {
  const skip = c.skip ?? 0;
  const full = (SFX2_DURATIONS[c.name] ?? 1) - skip;
  let at = c.at;
  let rate = c.rate ?? 1;
  let until = c.until ?? Infinity;
  if (c.name === "riser_big" && at < a.FZ) {
    // La montée finit PILE sur l'arrêt sur image : accélérée (jusqu'à × 1,6) si elle part tard, jamais avant `at`.
    at = Math.max(at, a.FZ - full);
    rate = Math.min(1.6, Math.max(1, full / Math.max(0.1, a.FZ - at)));
    until = a.FZ;
  }
  let fade = c.fade ?? 2 / FPS;
  if (at < a.FZ) until = Math.min(until, a.FZ); // ARRÊT SUR IMAGE : tout se tait.
  else if (at < a.D) {
    until = Math.min(until, a.D - (c.preDrop ?? 0.12)); // ÉVEIL : 0,12 s de silence avant la chute (la montée de la scène 4 : 0,06).
    if (c.name === "awakening_pad") fade = 0.2; // la nappe s'éteint en 0,2 s (scène 4)
  }
  const natural = at + full / rate;
  const cut = until < natural;
  if (!cut) until = natural + 0.05;
  if (until - at < 1 / FPS) return null;
  return { at, until, rate, skip, cut, fade };
}

/** Une piste du plan : chemin dans public/, départ et coupe (s du film), vitesse, début rogné, volume(t). */
export type PlannedTrack = { name: string; file: string; at: number; until: number; rate: number; skip: number; volume: (t: number) => number; gain: number };

function effectTrack(c: Fx, a: Anchors, spans: Span[]): PlannedTrack | null {
  const p = placeEffect(c, a);
  if (!p) return null;
  const base = LIGHT.has(c.name) ? FX_DUCK_LIGHT : FX_DUCK;
  const own = c.duck;
  const from = c.duckFrom;
  // Baisse propre au repère (la montée inversée de la scène 4 : × 0,75 sous « Voici », pour que sa crête tienne jusqu'à la chute).
  const depth = own === undefined ? () => base : from === undefined ? () => own : (t: number) => base + (own - base) * up(t, from - 0.1, from);
  const g = (c.gain ?? 1) * (TRIM[c.name] ?? 1) * SFX_BUS;
  // Une coupe (gel, éveil) se fait en 2 images, jamais en clic.
  const cutFade = (t: number) => (p.cut ? 1 - up(t, p.until - p.fade, p.until) : 1);
  // Une grande frappe passe presque entière au-dessus de la voix pendant son attaque.
  const hit = c.hit ? (t: number) => hitWeight(t, p.at, HIT_HOLD) : () => 0;
  return { name: c.name, file: `sfx2/${c.name}.mp3`, at: p.at, until: p.until, rate: p.rate, skip: p.skip, gain: g, volume: (t) => g * lift(duckOf(t, spans, depth(t)), HIT_DEPTH, hit(t)) * cutFade(t) };
}

/** Le plan complet de la bande son (musique + effets), en secondes du film. */
export function soundPlan(time: Time, sceneCues: Cue[]): PlannedTrack[] {
  softLines = time.tl.lines.filter((l) => SOFT[l.id] !== undefined).map((l) => ({ s: l.start, e: l.end, f: SOFT[l.id] }));
  const cues = allEffects(time, sceneCues);
  const a = anchors(time, cues);
  const spans = voiceSpans(time);
  const music: PlannedTrack[] = [
    { name: "M1 Tension", file: "music/presentation-m1.mp3", at: a.m1Start, until: a.FZ, rate: 1, skip: 0, gain: LEVEL.m1, volume: (t) => m1Volume(t, a, spans) },
    { name: "M2 Groove", file: "music/presentation-m2.mp3", at: a.D - M2_ATTACK, until: a.trust + 0.5, rate: 1, skip: 0, gain: LEVEL.m2, volume: (t) => m2Volume(t, a, spans) },
    { name: "M2 Confiance", file: "music/presentation-m2-confiance.mp3", at: a.trust - TRUST_ATTACK, until: a.logo, rate: 1, skip: 0, gain: LEVEL.trust, volume: (t) => trustVolume(t, a, spans) },
    { name: "M2 Final", file: "music/presentation-m2-final.mp3", at: a.logo - FINAL_ATTACK, until: a.end, rate: 1, skip: 0, gain: LEVEL.final, volume: (t) => finalVolume(t, a, spans) },
  ];
  const fx = cues
    .map((c) => effectTrack(c, a, spans))
    .filter((x): x is PlannedTrack => x !== null);
  return [...music, ...fx];
}

/* ---------------------------------------------------------------------------- la bande son */

export function Soundtrack({ time, cues }: SoundtrackProps) {
  const plan = useMemo(() => soundPlan(time, cues), [time, cues]);
  return (
    <>
      {plan.map((p, i) => (
        <Track key={`${p.name}-${i}-${p.at.toFixed(3)}`} name={`${p.name} @${p.at.toFixed(2)}`} src={staticFile(p.file)} at={p.at} until={p.until} rate={p.rate} skip={p.skip} volume={p.volume} />
      ))}
    </>
  );
}
