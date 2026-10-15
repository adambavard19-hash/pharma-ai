import { useMemo } from "react";
import { AbsoluteFill, interpolate, Sequence, staticFile, useCurrentFrame, type CalculateMetadataFunction } from "remotion";
import { Audio } from "@remotion/media";
import { ClockOffset, FONT } from "../theme";
import { Sfx, Typing } from "../ui/sfx";
import { Subtitles } from "../tarif/stage";
import type { SceneLine } from "../reel/stage";
import { PRE, SCENE_FPS, VIDEO_FPS, detectPauses, type VoiceInfo } from "../reel/timeline";
import { FALLBACK_DURATIONS, SCRIPT, VOICE_DIR } from "../presentation/script";
import { presentationTimeline, type PresentationTimeline } from "../presentation/timeline";
import { makePlan, makeTracks, TYPE_STEP, type Plan } from "../presentation/plan";
import { EMAIL } from "../presentation/data";
import { EndScene, Mention, Pointer, PosteScene, TeamScene, TrustLabels } from "../presentation/scenes";
import { ProblemScene, RevealScene } from "../presentation/story";
import { ramp } from "../presentation/anim";

/* ==========================================================================
 * « PRÉSENTATION » — 16:9, 1920 × 1080, 60 images/s, ≈ 56 s. Haut de l'accueil du site.
 *
 * La visite narrée de ce que PharmaBoost fait pour l'officine, dite par la voix
 * du film « Tarif » (Yann, ElevenLabs) :
 *  A. le poste au repos : l'île, Pixel, le robot du Comptoir 2 ;
 *  B. un scan de DOXYCYCLINE 100 mg : l'analyse se coche, la mise en garde
 *     d'abord (île ambre, robot sérieux, aucun son) ;
 *  C. deux conseils : la raison, le stock, le challenge, la date courte ;
 *     « Vendu » / « Non vendu » ;
 *  D. le bilan par e-mail, la vente qui reste ouverte, « Vente terminée »,
 *     la fête et la carte « Résultat de la vente » ;
 *  E. Pixel saute dans l'île du logiciel : la journée, les demandes réglées
 *     d'un clic (Hugo accepté) ;
 *  F. la Discussion : il lit les chiffres, sans rien modifier ;
 *  G. un robot par comptoir, « Mon équipe », le téléphone ;
 *  H. « Aucune fiche patient », le pharmacien garde la décision ;
 *  I. « PharmaBoost. Scan. Conseil. Bilan. »
 *
 * Le montage se cale sur la voix (calculateMetadata mesure chaque fichier) ;
 * les écrans sont redessinés d'après le code du site, leurs textes viennent
 * du code (src/presentation/data.ts). Mention permanente : « Illustration ·
 * chiffres, produits et prix : exemples ».
 * ======================================================================== */

export type PresentationProps = { voices: VoiceInfo[] | null; stale: string[] };

async function measure(src: string): Promise<VoiceInfo> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`${src} : ${res.status}`);
  const audio = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await res.arrayBuffer());
  return { dur: audio.duration, pauses: detectPauses(audio.getChannelData(0), audio.sampleRate) };
}

/** Ce que disent les fichiers de voix (écrit par scripts/voix-presentation.mjs) face au script : les phrases périmées. */
async function staleVoices(): Promise<string[]> {
  try {
    const res = await fetch(staticFile(`${VOICE_DIR}/voix.json`));
    if (!res.ok) return [`${VOICE_DIR}/voix.json manque`];
    const manifest = (await res.json()) as { lignes?: Record<string, string> };
    return SCRIPT.filter((l) => manifest.lignes?.[l.id] !== l.say).map((l) => `${l.id} : la voix dit « ${manifest.lignes?.[l.id] ?? "—"} », le script « ${l.say} »`);
  } catch (e) {
    return [`${VOICE_DIR}/voix.json illisible (${e})`];
  }
}

/** La longueur du film vient de la voix : on mesure les douze fichiers avant le rendu. */
export const calculatePresentationMetadata: CalculateMetadataFunction<PresentationProps> = async ({ props }) => {
  const voices = await Promise.all(
    SCRIPT.map((line, i) =>
      measure(staticFile(`${VOICE_DIR}/${line.id}.mp3`)).catch((e) => {
        console.warn(`Présentation : voix ${line.id} illisible (${e}) — durée de secours ${FALLBACK_DURATIONS[i]} s.`);
        return { dur: FALLBACK_DURATIONS[i], pauses: [] };
      }),
    ),
  );
  return { durationInFrames: Math.ceil(presentationTimeline(voices).total * VIDEO_FPS), props: { ...props, voices, stale: await staleVoices() } };
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
/** La musique : 0,22 sous la voix, 0,7 hors voix (ouverture, silence de fin de vente, carte de fin), fondu à la fin. */
const DUCKED = 0.22;
const OPEN = 0.7;

function musicVolume(t: number, tl: PresentationTimeline, P: Plan) {
  // Les régions parlées : deux phrases séparées de moins de 1,5 s restent dans la même région.
  const regions: [number, number][] = [];
  for (const l of tl.lines) {
    const last = regions[regions.length - 1];
    if (last && l.start - last[1] < 1.5) last[1] = l.end;
    else regions.push([l.start, l.end]);
  }
  let v = OPEN;
  for (const [a, b] of regions) {
    const down = interpolate(t, [a - 0.27, a - 0.12], [0, 1], clamp);
    const up = interpolate(t, [b + 0.1, b + 0.6], [1, 0], clamp);
    v = Math.min(v, OPEN - (OPEN - DUCKED) * Math.min(down, up));
  }
  // Un creux sous le scan ; la musique monte pour la révélation.
  const scan = interpolate(t, [P.scan - 0.2, P.scan, P.scan + 0.8, P.scan + 1.3], [1, 0.75, 0.75, 1], clamp);
  const reveal = 1 + 0.35 * interpolate(t, [P.reveal - 0.1, P.reveal + 0.2, P.revealName + 0.8, P.posteIn], [0, 1, 1, 0], clamp);
  return Math.min(1, v * reveal) * scan * interpolate(t, [tl.total - 1.2, tl.total - 0.05], [1, 0], clamp);
}

/** Les effets sonores (public/sfx), aux instants du plan. Aucun son sur la mise en garde, jamais « bip ». */
function Sounds({ P }: { P: Plan }) {
  const s = (t: number) => t * SCENE_FPS;
  const cps = 1 / TYPE_STEP;
  const L = P.tl.lines;
  const at = (i: number, j: number) => L[i].chunks[j].start;
  return (
    <>
      {/* Le problème : le tic-tac qui s'emballe, les pastilles qui claquent, « trop tard ». */}
      {Array.from({ length: 14 }, (_, k) => (
        <Sfx key={`tt${k}`} at={s(at(0, 1) + k * Math.max(0.18, 0.5 - k * 0.025))} name="tic" volume={0.12 + k * 0.006} />
      ))}
      <Sfx at={s(at(0, 1))} name="whoosh" volume={0.3} />
      <Sfx at={s(at(1, 0))} name="pop" volume={0.32} />
      <Sfx at={s(at(1, 1))} name="pop" volume={0.32} />
      <Sfx at={s(at(1, 2))} name="pop" volume={0.32} />
      <Sfx at={s(at(2, 0) + 0.1)} name="notif" volume={0.25} />
      <Sfx at={s(at(2, 3) - 0.05)} name="impact" volume={0.28} />
      <Sfx at={s(at(3, 0))} name="swish" volume={0.2} />
      <Sfx at={s(at(3, 2))} name="montee" volume={0.12} />
      {/* La révélation. */}
      <Sfx at={s(P.reveal)} name="impact" volume={0.4} />
      <Sfx at={s(P.revealRobot)} name="pop" volume={0.38} />
      <Sfx at={s(P.revealName)} name="swish" volume={0.3} />
      <Sfx at={s(P.revealScreen)} name="whoosh" volume={0.3} />
      {/* La démonstration. */}
      <Sfx at={s(P.scan)} name="swish" volume={0.3} />
      {P.checks.map((c, i) => (
        <Sfx key={`tic${i}`} at={s(c)} name="tic" volume={0.26} />
      ))}
      <Sfx at={s(P.advice)} name="swish" volume={0.34} />
      <Sfx at={s(P.sold)} name="clic" volume={0.5} />
      <Sfx at={s(P.addEmail)} name="clic" volume={0.3} />
      <Sfx at={s(P.addEmail + 0.02)} name="swish" volume={0.22} />
      <Typing at={s(P.typeEmail)} text={EMAIL} cps={cps} volume={0.42} />
      <Sfx at={s(P.sendEmail)} name="clic" volume={0.5} />
      <Sfx at={s(P.emailSent)} name="pop" volume={0.42} />
      <Sfx at={s(P.backToAdvice)} name="swish" volume={0.2} />
      <Sfx at={s(P.finish)} name="clic" volume={0.5} />
      <Sfx at={s(P.done)} name="montee" volume={0.14} />
      <Sfx at={s(P.resultCard)} name="pop" volume={0.36} />
      <Sfx at={s(P.badge)} name="pop" volume={0.3} />
      {/* L'équipe, la confiance, la fin. */}
      <Sfx at={s(P.teamIn)} name="whoosh" volume={0.24} />
      {[0, 1, 2, 3].map((k) => (
        <Sfx key={`w${k}`} at={s(P.wave + k * 0.14 + 0.45)} name="pop" volume={0.14} />
      ))}
      <Sfx at={s(P.phoneIn)} name="swish" volume={0.25} />
      <Sfx at={s(P.posteBack - 0.2)} name="whoosh" volume={0.16} />
      <Sfx at={s(P.labelRules)} name="pop" volume={0.2} />
      <Sfx at={s(P.labelData)} name="pop" volume={0.2} />
      <Sfx at={s(P.labelDecision)} name="pop" volume={0.2} />
      <Sfx at={s(P.endStart)} name="impact" volume={0.34} />
    </>
  );
}

/** Ce qui est à l'écran à l'instant t : le problème, la révélation, le poste, l'équipe, la confiance, la fin. */
function Stage({ P }: { P: Plan }) {
  const t = useCurrentFrame() / VIDEO_FPS;
  const tracks = useMemo(() => makeTracks(P), [P]);
  const crossReveal = ramp(t, P.reveal, 0.35);
  const crossPoste = ramp(t, P.posteIn, 0.45);
  const crossTeam = ramp(t, P.teamIn, 0.4);
  const crossH = ramp(t, P.posteBack - 0.15, 0.35);
  const problem = t < P.reveal + 0.4;
  const reveal = t >= P.reveal && t < P.posteIn + 0.5;
  const posteA = t >= P.posteIn && t < P.teamIn + 0.45;
  const team = t >= P.teamIn && t < P.posteBack + 0.25;
  const posteH = t >= P.posteBack - 0.15 && t < P.endStart + 0.5;
  const end = t >= P.endStart;
  return (
    <AbsoluteFill>
      {problem && (
        <AbsoluteFill style={{ opacity: 1 - crossReveal, transform: `scale(${1 + 0.08 * crossReveal})` }}>
          <ProblemScene t={t} P={P} />
        </AbsoluteFill>
      )}
      {reveal && (
        <AbsoluteFill style={{ opacity: Math.min(crossReveal, 1 - crossPoste) }}>
          <RevealScene t={t} P={P} tracks={tracks} />
        </AbsoluteFill>
      )}
      {posteA && (
        <AbsoluteFill style={{ opacity: Math.min(crossPoste, 1 - crossTeam), transform: `scale(${1.06 - 0.06 * crossPoste - 0.04 * crossTeam})` }}>
          <PosteScene t={t} P={P} tracks={tracks} />
        </AbsoluteFill>
      )}
      {team && (
        <AbsoluteFill style={{ opacity: Math.min(crossTeam, 1 - crossH), transform: `scale(${1.05 - 0.05 * crossTeam})` }}>
          <TeamScene t={t} P={P} tracks={tracks} />
        </AbsoluteFill>
      )}
      {posteH && (
        <AbsoluteFill style={{ opacity: crossH }}>
          <PosteScene t={t} P={P} tracks={tracks} restOnly />
          <AbsoluteFill style={{ background: "rgba(6,10,20,.55)", opacity: ramp(t, P.labelRules - 0.3, 0.5) }} />
          <TrustLabels t={t} P={P} />
        </AbsoluteFill>
      )}
      {posteA && <Pointer t={t} P={P} />}
      {end && <EndScene t={t} P={P} tracks={tracks} />}
      <Mention opacity={(1 - ramp(t, P.total - 0.6, 0.6)) * ramp(t, P.posteIn, 0.5)} />
    </AbsoluteFill>
  );
}

/** Les sous-titres d'une phrase, qui s'effacent en 0,2 s à la fin de leur séquence. */
function FadingSubtitles({ L, frames }: { L: SceneLine; frames: number }) {
  const f = useCurrentFrame();
  const out = interpolate(f, [frames - 12, frames], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Subtitles L={L} />
    </AbsoluteFill>
  );
}

export function Presentation({ voices, stale }: PresentationProps) {
  if (stale?.length) throw new Error(`Film « Présentation » : la voix ne dit plus le script — node scripts/voix-presentation.mjs. ${stale.join(" · ")}`);
  const tl = useMemo(() => presentationTimeline(voices ?? FALLBACK_DURATIONS.map((dur) => ({ dur, pauses: [] }))), [voices]);
  const P = useMemo(() => makePlan(tl), [tl]);
  const S = SCENE_FPS;
  const vf = (s: number) => Math.round(s * VIDEO_FPS);
  return (
    <AbsoluteFill style={{ fontFamily: FONT, background: "#0E1020" }}>
      <ClockOffset.Provider value={{ from: 0, bound: 0, rate: S / VIDEO_FPS }}>
        <Stage P={P} />
        <Sounds P={P} />
      </ClockOffset.Provider>
      {/* Les sous-titres : une phrase à la fois, du début de sa voix jusqu'à la phrase suivante. */}
      {tl.lines.map((line, i) => {
        if (line.silentCaptions) return null;
        const from = vf(line.start - PRE);
        const next = i < tl.lines.length - 1 ? tl.lines[i + 1].start - PRE : line.end + 0.6;
        const to = vf(Math.min(next, line.end + 0.9));
        const L: SceneLine = {
          len: line.dur * S,
          chunks: line.chunks.map((c) => ({ text: c.text, at: (c.start - line.start) * S, end: (c.end - line.start) * S })),
          exit: Infinity,
          intro: PRE * S,
        };
        return (
          <Sequence key={`st-${line.id}`} from={from} durationInFrames={Math.max(1, to - from)} name={`Sous-titres ${line.id}`}>
            <ClockOffset.Provider value={{ from, bound: line.start * S, rate: S / VIDEO_FPS }}>
              <FadingSubtitles L={L} frames={to - from} />
            </ClockOffset.Provider>
          </Sequence>
        );
      })}
      {tl.lines.map((line) => (
        <Sequence key={`voix-${line.id}`} from={vf(line.start)} layout="none" name={`Voix ${line.id}`}>
          <Audio src={staticFile(`${VOICE_DIR}/${line.id}.mp3`)} />
        </Sequence>
      ))}
      <Audio src={staticFile("music/presentation.wav")} volume={(f) => musicVolume(f / VIDEO_FPS, tl, P)} />
    </AbsoluteFill>
  );
}
