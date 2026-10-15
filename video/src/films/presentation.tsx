import { useMemo } from "react";
import { AbsoluteFill, Sequence, staticFile, useCurrentFrame, type CalculateMetadataFunction } from "remotion";
import { Audio } from "@remotion/media";
import { detectPauses, type VoiceInfo } from "../reel/timeline";
import { FALLBACK_DURATIONS, SCRIPT, VOICE_DIR } from "../presentation/script";
import { makeTime, SCENE_IDS, windowFrames, type SceneId, type Time, type VoiceMarks } from "../presentation/motion/time";
import { SCENES } from "../presentation/motion/scenes";
import { SceneHost } from "../presentation/motion/host";
import { Soundtrack } from "../presentation/motion/sound";
import { Captions } from "../presentation/motion/kit/captions";
import { Grain, Vignette } from "../presentation/motion/kit/grain";
import { Mention } from "../presentation/motion/kit/mention";
import { INK } from "../presentation/motion/kit/palette";

/* ==========================================================================
 * « PRÉSENTATION » — le film motion design de PharmaBoost. 16:9, 1920 × 1080, 60 i/s, ≈ 61 s.
 * La direction fait foi : video/DIRECTION-PRESENTATION.md et .json.
 *
 * L'ORCHESTRATEUR :
 *  - mesure les 19 voix (calculateMetadata) et lit voix.json (phrases périmées, repères exacts « marks ») ;
 *  - calcule le temps (src/presentation/motion/time.ts) : ancrages et fenêtres S1 … S12 ;
 *  - pose chaque scène (src/presentation/motion/scene-XX-*.tsx) dans une <Sequence> limitée à sa fenêtre ; pendant
 *    un chevauchement, la scène qui sort est au-dessus ;
 *  - au-dessus : grain et vignette de l'acte, sous-titres premium, mention « Illustration · exemples » (P7 → P14) ;
 *  - les voix, puis la bande son (<Soundtrack/>, src/presentation/motion/sound.tsx).
 *
 * PresScene : la même chose, réduite à UNE scène, l'image 0 étant le début de sa fenêtre (aperçu rapide).
 * ======================================================================== */

export type PresentationProps = { voices: VoiceInfo[] | null; stale: string[]; marks?: VoiceMarks | null };
export type PresSceneProps = PresentationProps & { scene: SceneId };

const FPS = 60;

async function measure(src: string): Promise<VoiceInfo> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`${src} : ${res.status}`);
  const audio = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await res.arrayBuffer());
  return { dur: audio.duration, pauses: detectPauses(audio.getChannelData(0), audio.sampleRate) };
}

/** voix.json (écrit par scripts/voix-presentation.mjs) : les phrases périmées face au script, et les repères exacts. */
async function readManifest(): Promise<{ stale: string[]; marks: VoiceMarks | null }> {
  try {
    const res = await fetch(staticFile(`${VOICE_DIR}/voix.json`));
    if (!res.ok) return { stale: [`${VOICE_DIR}/voix.json manque`], marks: null };
    const manifest = (await res.json()) as { lignes?: Record<string, string>; marks?: VoiceMarks };
    const stale = SCRIPT.filter((l) => manifest.lignes?.[l.id] !== l.say).map((l) => `${l.id} : la voix dit « ${manifest.lignes?.[l.id] ?? "—"} », le script « ${l.say} »`);
    return { stale, marks: manifest.marks ?? null };
  } catch (e) {
    return { stale: [`${VOICE_DIR}/voix.json illisible (${e})`], marks: null };
  }
}

async function measureAll(): Promise<{ voices: VoiceInfo[]; stale: string[]; marks: VoiceMarks | null }> {
  const voices = await Promise.all(
    SCRIPT.map((line, i) =>
      measure(staticFile(`${VOICE_DIR}/${line.id}.mp3`)).catch((e) => {
        console.warn(`Présentation : voix ${line.id} illisible (${e}) — durée de secours ${FALLBACK_DURATIONS[i]} s.`);
        return { dur: FALLBACK_DURATIONS[i], pauses: [] };
      }),
    ),
  );
  return { voices, ...(await readManifest()) };
}

/** La longueur du film vient de la voix : on mesure les dix-neuf fichiers avant le rendu. */
export const calculatePresentationMetadata: CalculateMetadataFunction<PresentationProps> = async ({ props }) => {
  const m = await measureAll();
  return { durationInFrames: Math.ceil(makeTime(m.voices, m.marks).total * FPS), props: { ...props, ...m } };
};

/** L'aperçu d'une scène : la durée est celle de sa fenêtre. */
export const calculatePresSceneMetadata: CalculateMetadataFunction<PresSceneProps> = async ({ props }) => {
  const m = await measureAll();
  const time = makeTime(m.voices, m.marks);
  const w = time.win[props.scene] ?? time.win.S1;
  return { durationInFrames: windowFrames(w, FPS).durationInFrames, props: { ...props, ...m } };
};

function assertVoice(stale: string[] | undefined) {
  if (stale?.length) throw new Error(`Film « Présentation » : la voix ne dit plus le script — node scripts/voix-presentation.mjs. ${stale.join(" · ")}`);
}

/** Grain, vignette, sous-titres et mention : au-dessus des scènes, en temps du film. */
function Overlays({ time }: { time: Time }) {
  const t = useCurrentFrame() / FPS;
  const look = time.look(t);
  return (
    <>
      <Grain t={t} opacity={look.grain} />
      <Vignette strength={look.vignette} />
      <Captions t={t} tl={time.tl} />
      <Mention t={t} from={time.A("P7") - 0.3} to={time.Z("P14") + 0.3} />
    </>
  );
}

/** Le film entier en images du FILM (frame 0 = début du film), ou une seule scène (`only`). */
function FilmBody({ time, only }: { time: Time; only?: SceneId }) {
  const ids = only ? [only] : [...SCENE_IDS];
  const cues = useMemo(() => SCENE_IDS.flatMap((id) => SCENES[id].cues(time)), [time]);
  return (
    <AbsoluteFill style={{ background: INK }}>
      {/* Ordre inverse : à chevauchement égal, la scène qui sort (la plus ancienne) est dessinée au-dessus. */}
      {[...ids].reverse().map((id) => {
        const w = time.win[id];
        const { from, durationInFrames } = windowFrames(w, FPS);
        return (
          <Sequence key={id} from={from} durationInFrames={durationInFrames} name={`${id} · ${w.name}`}>
            <SceneHost id={id} time={time} offset={from} />
          </Sequence>
        );
      })}
      <Overlays time={time} />
      {time.tl.lines.map((line) => (
        <Sequence key={`voix-${line.id}`} from={Math.round(line.start * FPS)} layout="none" name={`Voix ${line.id}`}>
          <Audio src={staticFile(`${VOICE_DIR}/${line.id}.mp3`)} />
        </Sequence>
      ))}
      <Soundtrack time={time} cues={cues} />
    </AbsoluteFill>
  );
}

export function Presentation({ voices, stale, marks }: PresentationProps) {
  assertVoice(stale);
  const time = useMemo(() => makeTime(voices, marks), [voices, marks]);
  return <FilmBody time={time} />;
}

/** Une scène seule : tout le film est décalé de -début de fenêtre, la scène commence donc à l'image 0. */
export function PresScene({ scene, voices, stale, marks }: PresSceneProps) {
  assertVoice(stale);
  const time = useMemo(() => makeTime(voices, marks), [voices, marks]);
  const id: SceneId = SCENE_IDS.includes(scene) ? scene : "S1";
  const { from } = windowFrames(time.win[id], FPS);
  return (
    <AbsoluteFill style={{ background: INK }}>
      <Sequence from={-from} name={`Film décalé (${id})`}>
        <FilmBody time={time} only={id} />
      </Sequence>
    </AbsoluteFill>
  );
}
