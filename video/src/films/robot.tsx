import type { ReactNode } from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, staticFile, useCurrentFrame, type CalculateMetadataFunction } from "remotion";
import { Audio } from "@remotion/media";
import { C, FONT } from "../theme";
import { type SfxName } from "../ui/sfx";
import { DarkStage } from "../ui/stage";
import { Wordmark } from "../ui/product";
import { HEAVY, MINT, pop, tokens } from "../reel/stage";
import { detectPauses, type VoiceInfo } from "../reel/timeline";
import { Mascot } from "../island/mascot";
import { frameAt, robotTrack, type RobotFrame } from "../island/motion-track";
import { FALLBACK_DURATIONS, SCRIPT, VOICE_DIR } from "../robot-film/script";
import { robotTimeline, type RobotTimeline } from "../robot-film/timeline";
import { FLIGHT, TYPE_MS, makePlan, pixelCues, type Plan } from "../robot-film/plan";
import { CHAT_QUESTION, JOIN_DONE, LOOK, OTHER_LOOKS, PATIENT_EMAIL } from "../robot-film/data";
import { AppWindow, DesktopIcon, LgoWindow, Mention, Pointer, Taskbar, Wallpaper, layoutFor, pointerAt, type Format, type Layout, type PointerStop } from "../robot-film/stage";
import { POSTE_TARGET, PosteIsland, lookCaption, posteBox, posteKeys, posteSize, resultHeight } from "../robot-film/poste";
import { APP_TARGET, AppIsland, JoinToast, appBox, appKeys, appSize } from "../robot-film/logiciel";

/* ==========================================================================
 * « ROBOT » — le portrait du robot de PharmaBoost, façon Coucou. 16:9, 1920 × 1080, 60 images/s, ≈ 56 s ;
 * déclinaison verticale « RobotVertical », 1080 × 1920, pour Instagram (mêmes scènes, même voix, même chronologie).
 *
 * Un seul endroit : l'île noire reste au même point du cadre, du début à la fin ; seule la fenêtre derrière change
 * (le poste Windows, le logiciel PharmaBoost, le poste). Aucune coupe : la capsule se déforme en ressort, le contenu
 * change en fondu flou. Peu de voix (Yann, ElevenLabs, comme « Tarif ») : quatre temps muets où l'île joue seule.
 * Le robot est le nôtre — le dessin du site et son moteur de mouvement (core/robot/motion.ts), rejoué image par
 * image ; tous les textes de l'île viennent du code (robot-film/data.ts).
 *
 * Mention permanente : « Illustration · chiffres, produits et prix : exemples ».
 * ======================================================================== */

export type RobotFilmProps = { voices: VoiceInfo[] | null; stale: string[] };

const FPS = 60;

async function measure(src: string): Promise<VoiceInfo> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`${src} : ${res.status}`);
  const audio = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await res.arrayBuffer());
  return { dur: audio.duration, pauses: detectPauses(audio.getChannelData(0), audio.sampleRate) };
}

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

/** La longueur du film vient de la voix : on mesure les onze fichiers avant le rendu. */
export const calculateRobotMetadata: CalculateMetadataFunction<RobotFilmProps> = async ({ props }) => {
  const voices = await Promise.all(
    SCRIPT.map((line, i) =>
      measure(staticFile(`${VOICE_DIR}/${line.id}.mp3`)).catch((e) => {
        console.warn(`Robot : voix ${line.id} illisible (${e}) — durée de secours ${FALLBACK_DURATIONS[i]} s.`);
        return { dur: FALLBACK_DURATIONS[i], pauses: [] };
      }),
    ),
  );
  return { durationInFrames: Math.ceil(robotTimeline(voices).total * FPS), props: { ...props, voices, stale: await staleVoices() } };
};

export function RobotFilm(props: RobotFilmProps) {
  return <RobotMovie {...props} format="16:9" />;
}

export function RobotVertical(props: RobotFilmProps) {
  return <RobotMovie {...props} format="9:16" />;
}

// ---- Le film -------------------------------------------------------------------------------------------------

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

function RobotMovie({ voices, stale, format }: RobotFilmProps & { format: Format }) {
  if (stale?.length) throw new Error(`Film « Robot » : la voix ne dit plus le script — node scripts/voix-robot.mjs. ${stale.join(" · ")}`);
  const tl = robotTimeline(voices ?? FALLBACK_DURATIONS.map((dur) => ({ dur, pauses: [] })));
  const plan = makePlan(tl);
  const L = layoutFor(format);
  const t = useCurrentFrame() / FPS;
  const key = `pixel:${tl.total.toFixed(3)}:${tl.lines.map((l) => l.start.toFixed(3)).join(",")}`;
  const track = robotTrack(key, pixelCues(plan), tl.total + 0.5);
  const frame = frameAt(track, t);

  return (
    <AbsoluteFill style={{ fontFamily: FONT, background: "#0A1624", overflow: "hidden" }}>
      <Scene L={L} t={t} plan={plan} tl={tl} frame={frame} />
      <Sequence from={Math.round(plan.endStart * FPS)} name="Carte de fin">
        <EndCard L={L} plan={plan} tl={tl} />
      </Sequence>
      <Mention L={L} />
      <Sound plan={plan} tl={tl} />
    </AbsoluteFill>
  );
}

// ---- La scène : le bureau, la fenêtre, l'île, le robot, le pointeur, les sous-titres ----------------------------

/**
 * L'île agrandie à l'instant t : plus près quand elle n'est qu'une capsule (l'ouverture, les tapes, les robots de
 * comptoir — la même image au début et à la fin, pour la boucle), un peu de recul sur le plan de la mise en garde.
 */
export function zoomAt(L: Layout, plan: Plan, t: number) {
  const { zoom, close, alertZoom } = L.island;
  const ease = (a: number, b: number) => interpolate(t, [a, b], [0, 1], { ...clamp, easing: easeInOut });
  const near = 1 - ease(plan.leave, plan.leave + 0.6) + ease(plan.landPoste + 0.05, plan.landPoste + 0.65);
  const alert = ease(plan.alert - 0.05, plan.alert + 0.5) - ease(plan.advice, plan.advice + 0.55);
  return zoom + (close - zoom) * near + (alertZoom - zoom) * alert;
}

/** Le robot est-il en vol, d'une île à l'autre ? */
const inFlight = (plan: Plan, t: number) => (t >= plan.departPoste && t < plan.landApp) || (t >= plan.departApp && t < plan.landPoste);
/** Le logiciel PharmaBoost est-il derrière l'île ? (Le fond change au milieu du vol.) */
const appShown = (plan: Plan, t: number) => interpolate(t, [plan.departPoste + 0.12, plan.departPoste + 0.55], [0, 1], clamp) - interpolate(t, [plan.departApp + 0.12, plan.departApp + 0.55], [0, 1], clamp);

function Scene({ L, t, plan, tl, frame }: { L: Layout; t: number; plan: Plan; tl: RobotTimeline; frame: RobotFrame }) {
  const pk = posteKeys(plan);
  const ak = appKeys(plan);
  const app = appShown(plan, t);
  const zoom = zoomAt(L, plan, t);
  const place = { cx: L.island.cx, top: L.island.top, zoom };
  // L'île visible : celle du poste, puis celle du logiciel ; elles se relaient au milieu de chaque vol.
  const midA = plan.departPoste + FLIGHT * 0.45;
  const midB = plan.departApp + FLIGHT * 0.45;
  const appIsland = interpolate(t, [midA - 0.08, midA + 0.08], [0, 1], clamp) - interpolate(t, [midB - 0.08, midB + 0.08], [0, 1], clamp);
  const away = inFlight(plan, t);

  const robot = (size: number) => {
    if (away) return <div style={{ width: size, height: size * 0.92 }} />;
    return <SlotRobot size={size} t={t} plan={plan} frame={frame} />;
  };

  // Le bas de l'île (pour accrocher les sous-titres) : celle qui se voit.
  const pb = posteBox(pk, t);
  const ab = appBox(ak, t);
  const cap = lookCaption(t, plan, OTHER_LOOKS);
  const posteBottom = pb.h + resultHeight(t, plan) + (cap ? 34 : 0);
  const islandBottom = L.island.top + (appIsland > 0.5 ? ab.h : posteBottom) * zoom;

  return (
    <AbsoluteFill>
      <Wallpaper L={L} />
      <DesktopIcon L={L} dim={t >= plan.grab && t < plan.drop + 0.2 ? 1 : 0} />
      {app < 1 && <LgoWindow L={L} t={t} scanAt={t < plan.departPoste + 1 ? plan.scanLine : Infinity} style={{ opacity: 1 - app, transform: `scale(${1 - 0.02 * app})` }} />}
      {app > 0 && <AppWindow L={L} style={{ opacity: app, transform: `scale(${0.98 + 0.02 * app})` }} />}
      <Taskbar L={L} />

      {appIsland < 1 && (
        <div style={{ position: "absolute", inset: 0, opacity: 1 - appIsland }}>
          <PosteIsland keys={pk} c={{ t, plan, robot }} place={place} />
          {cap && <LookCaption L={L} zoom={zoom} top={L.island.top + (pb.h + 8) * zoom} text={cap.text} opacity={cap.opacity} at={cap.at} t={t} />}
        </div>
      )}
      {appIsland > 0 && (
        <div style={{ position: "absolute", inset: 0, opacity: appIsland }}>
          <AppIsland keys={ak} c={{ t, plan, robot }} place={place} />
        </div>
      )}

      {app > 0 && (
        <div style={{ position: "absolute", right: L.toast.right, bottom: L.toast.bottom, transform: `scale(${L.toast.scale})`, transformOrigin: "100% 100%" }}>
          <JoinToast t={t} at={plan.toast} text={JOIN_DONE} />
        </div>
      )}

      <Flight L={L} t={t} plan={plan} frame={frame} />
      <Captions L={L} t={t} tl={tl} islandBottom={islandBottom} />
      <Cursor L={L} t={t} plan={plan} />
    </AbsoluteFill>
  );
}

/** Le robot de la capsule, et la machine à sous des robots de comptoir (R10) : Nova, Gizmo, Zéphyr, Biscotte, puis Pixel. */
function SlotRobot({ size, t, plan, frame }: { size: number; t: number; plan: Plan; frame: RobotFrame }) {
  const steps = [...plan.slots, plan.pixelBack];
  const looks = [...OTHER_LOOKS.map((o) => o.index), LOOK];
  if (t < steps[0] || t > plan.pixelBack + 0.5) return <Mascot frame={frame} size={size} t={t} look={LOOK} />;
  const k = steps.filter((s) => t >= s).length - 1;
  const prev = k === 0 ? LOOK : looks[k - 1];
  const now = looks[k];
  const h = size * 0.92;
  const local = t - steps[k];
  const last = k === steps.length - 1;
  // Le rouleau : l'ancien descend, le nouveau tombe d'en haut ; Pixel revient avec un petit ressort.
  const d = last ? 0.2 : 0.11;
  const p = Math.min(1, local / d);
  const y = last ? interpolate(p, [0, 0.7, 1], [-h, h * 0.12, 0]) : (p - 1) * h;
  const blur = p < 1 ? 1.4 : 0;
  return (
    <div style={{ position: "relative", width: size, height: h, overflow: "hidden", borderRadius: 6 }}>
      {p < 1 && (
        <div style={{ position: "absolute", left: 0, top: y + h, filter: `blur(${blur}px)` }}>
          <Mascot frame={frame} size={size} t={t} look={prev} />
        </div>
      )}
      <div style={{ position: "absolute", left: 0, top: y, filter: blur ? `blur(${blur}px)` : undefined, transform: last && p >= 1 ? `scale(${1 + 0.06 * Math.max(0, 1 - (local - d) / 0.25)})` : undefined }}>
        <Mascot frame={frame} size={size} t={t} look={now} />
      </div>
    </div>
  );
}

function LookCaption({ L, zoom, top, text, opacity, at, t }: { L: Layout; zoom: number; top: number; text: string; opacity: number; at: number; t: number }) {
  const k = Math.max(0, Math.min(1, (t - at) / 0.18));
  return (
    <div style={{ position: "absolute", left: L.island.cx - 150, top, width: 300, display: "flex", justifyContent: "center", transform: `scale(${zoom})`, transformOrigin: "50% 0", opacity }}>
      <div style={{ height: 26, padding: "0 12px", borderRadius: 13, background: "#0B0F14", boxShadow: "0 0 0 1px rgba(255,255,255,0.07)", display: "flex", alignItems: "center", fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,.9)", whiteSpace: "nowrap", transform: `translateY(${(1 - k) * -4}px)`, fontFamily: FONT }}>{text}</div>
    </div>
  );
}

// ---- Le vol de Pixel d'une île à l'autre --------------------------------------------------------------------

function slotPoint(L: Layout, w: number, zoom: number) {
  return { x: L.island.cx + (22 - w / 2) * zoom, y: L.island.top + 22 * zoom };
}

function Flight({ L, t, plan, frame }: { L: Layout; t: number; plan: Plan; frame: RobotFrame }) {
  const legs = [
    { from: plan.departPoste, wFrom: 244, wTo: 236, dir: 1 },
    { from: plan.departApp, wFrom: 236, wTo: 244, dir: -1 },
  ];
  const leg = legs.find((l) => t >= l.from && t < l.from + FLIGHT);
  if (!leg) return null;
  const zoom = L.island.zoom;
  const S = slotPoint(L, leg.wFrom, zoom);
  const E = slotPoint(L, leg.wTo, zoom);
  const v = L.H > L.W;
  const A = (v ? 300 : 560) * leg.dir;
  const B = v ? 520 : 600;
  const base = 32 * zoom;
  const at = (u: number) => {
    const e = 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, u)));
    const hop = Math.sin(Math.PI * Math.min(1, e / 0.18)) * (e < 0.18 ? 70 : 0);
    return {
      x: S.x + (E.x - S.x) * e + A * Math.sin(2 * Math.PI * e),
      y: S.y + (E.y - S.y) * e + (B * (1 - Math.cos(2 * Math.PI * e))) / 2 - hop,
      s: 1 + 2.3 * Math.sin(Math.PI * e),
      r: 360 * e * leg.dir,
    };
  };
  const u = (t - leg.from) / FLIGHT;
  const ghosts = [6, 5, 4, 3, 2, 1].map((k) => ({ k, p: at(u - 0.028 * k) })).filter((g) => u - 0.028 * g.k > 0);
  const now = at(u);
  const draw = (p: { x: number; y: number; s: number; r: number }, opacity: number, blur = 0) => {
    const size = base * p.s;
    return (
      <div style={{ position: "absolute", left: p.x - size / 2, top: p.y - size * 0.46, width: size, transform: `rotate(${p.r}deg)`, opacity, filter: blur ? `blur(${blur}px)` : undefined }}>
        <Mascot frame={frame} size={size} t={t} look={LOOK} />
      </div>
    );
  };
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {ghosts.map((g) => (
        <div key={g.k}>{draw(g.p, 0.28 * (1 - g.k / 7), 1.5 + g.k * 0.6)}</div>
      ))}
      {draw(now, 1)}
    </AbsoluteFill>
  );
}

// ---- Le pointeur ----------------------------------------------------------------------------------------------

function cursorPlan(L: Layout, plan: Plan) {
  const { cx, top } = L.island;
  /** Une cible de l'île à l'instant où le pointeur l'atteint (l'agrandissement change d'un plan à l'autre). */
  const at = (target: { x: number; y: number }, w: number, when: number) => {
    const z = zoomAt(L, plan, when);
    return { x: cx + (target.x - w / 2) * z + 4, y: top + target.y * z + 6 };
  };
  const v = L.H > L.W;
  const rest = v ? { x: 930, y: 1380 } : { x: 1730, y: 860 };
  const restLow = v ? { x: 900, y: 1500 } : { x: 1500, y: 880 };
  const pw = (k: Parameters<typeof posteSize>[0]["kind"]) => posteSize({ kind: k }).w;
  const aw = (s: Parameters<typeof appSize>[0]) => appSize(s).w;
  const icon = { x: L.icon.x - 4, y: L.icon.y - 8 };
  const drop = at(APP_TARGET.drop, aw({ kind: "stock", phase: "idle" }), plan.drop);
  const robotIdle = (when: number) => at(POSTE_TARGET.robotIdle, pw("idle"), when);
  const stops: PointerStop[] = [
    { t: 0, x: L.W + 80, y: L.H * 0.72 },
    { t: plan.cursorIn, x: L.W + 80, y: L.H * 0.72 },
    { t: plan.hover, ...robotIdle(plan.hover) },
    { t: plan.peek + 0.3, ...robotIdle(plan.hover) },
    { t: plan.tap1 - 0.05, ...at(POSTE_TARGET.robotPeek, pw("peek"), plan.tap1 - 0.05) },
    { t: plan.leave, ...at(POSTE_TARGET.robotPeek, pw("peek"), plan.leave) },
    { t: plan.leave + 0.6, ...rest },
    { t: plan.compris - 0.85, ...rest },
    { t: plan.compris - 0.06, ...at(POSTE_TARGET.compris, pw("alert"), plan.compris - 0.06) },
    { t: plan.compris + 0.25, ...at(POSTE_TARGET.compris, pw("alert"), plan.compris + 0.25) },
    // Les cartes s'ouvrent sans pointeur dessus (c'est l'affiche du film), puis il revient sur « Vendu ».
    { t: plan.compris + 0.75, ...rest },
    { t: plan.sold - 0.75, ...rest },
    { t: plan.sold - 0.08, ...at(POSTE_TARGET.sold, pw("advice"), plan.sold - 0.08) },
    { t: plan.sold + 0.12, ...at(POSTE_TARGET.sold, pw("advice"), plan.sold + 0.12) },
    { t: plan.notSold - 0.06, ...at(POSTE_TARGET.notSold, pw("advice"), plan.notSold - 0.06) },
    { t: plan.notSold + 0.4, ...at(POSTE_TARGET.notSold, pw("advice"), plan.notSold + 0.4) },
    { t: plan.addEmail - 0.06, ...at(POSTE_TARGET.addEmail, pw("advice"), plan.addEmail - 0.06) },
    { t: plan.typeStart - 0.3, ...at(POSTE_TARGET.input, pw("email"), plan.typeStart - 0.3) },
    { t: plan.send - 0.06, ...at(POSTE_TARGET.send, pw("email"), plan.send - 0.06) },
    { t: plan.send + 0.3, ...at(POSTE_TARGET.send, pw("email"), plan.send + 0.3) },
    { t: plan.backToAdvice + 0.35, ...at(POSTE_TARGET.finish, pw("advice"), plan.backToAdvice + 0.35) },
    { t: plan.finish - 0.06, ...at(POSTE_TARGET.finish, pw("advice"), plan.finish - 0.06) },
    { t: plan.finish + 0.5, ...restLow },
    { t: plan.accept - 0.8, ...restLow },
    { t: plan.accept - 0.06, ...at(APP_TARGET.accept, aw({ kind: "home", accepted: false }), plan.accept - 0.06) },
    { t: plan.accept + 0.4, ...at(APP_TARGET.accept, aw({ kind: "home", accepted: false }), plan.accept + 0.4) },
    { t: plan.chatTab - 0.06, ...at(APP_TARGET.tab("chat"), aw({ kind: "home", accepted: true }), plan.chatTab - 0.06) },
    { t: plan.chatTab + 0.45, ...at(APP_TARGET.tab("chat"), aw({ kind: "home", accepted: true }), plan.chatTab + 0.45) },
    { t: plan.typeQ + 0.2, ...restLow },
    { t: plan.stockTab - 0.75, ...restLow },
    { t: plan.stockTab - 0.06, ...at(APP_TARGET.tab("stock"), aw({ kind: "chat", phase: "done" }), plan.stockTab - 0.06) },
    { t: plan.stockTab + 0.2, ...at(APP_TARGET.tab("stock"), aw({ kind: "chat", phase: "done" }), plan.stockTab + 0.2) },
    { t: plan.grab - 0.06, ...icon },
    { t: plan.grab + 0.06, ...icon },
    { t: plan.overZone, x: drop.x - 30, y: drop.y + 10 },
    { t: plan.drop - 0.06, ...drop },
    { t: plan.drop + 0.3, x: drop.x + 20, y: drop.y + 30 },
    { t: plan.sendStock - 0.06, ...at(APP_TARGET.sendStock, aw({ kind: "stock", phase: "preview" }), plan.sendStock - 0.06) },
    { t: plan.sendStock + 0.3, ...at(APP_TARGET.sendStock, aw({ kind: "stock", phase: "preview" }), plan.sendStock + 0.3) },
    { t: plan.closeApp + 0.3, ...restLow },
    { t: plan.taps[0] - 0.12, ...robotIdle(plan.taps[0]) },
    ...plan.taps.map((tp, k) => ({ t: tp + 0.1, x: robotIdle(tp).x + (k % 2 ? 3 : -2), y: robotIdle(tp).y + (k % 2 ? -2 : 2) })),
    { t: plan.grumpy + 0.7, ...rest },
    { t: plan.grumpyEnd, x: L.W + 80, y: L.H * 0.8 },
  ];
  const clicks = [plan.tap1, plan.compris, plan.sold, plan.notSold, plan.addEmail, plan.send, plan.finish, plan.accept, plan.chatTab, plan.stockTab, plan.grab, plan.sendStock, ...plan.taps];
  return { stops, clicks };
}

function Cursor({ L, t, plan }: { L: Layout; t: number; plan: Plan }) {
  const { stops, clicks } = cursorPlan(L, plan);
  if (t < plan.cursorIn || t > plan.grumpyEnd) return null;
  const { x, y } = pointerAt(stops, t);
  let press = 0;
  let click = -1;
  for (const c of clicks) {
    const d = t - c;
    if (d > -0.07 && d < 0.1) press = Math.max(press, d < 0 ? 1 + d / 0.07 : 1 - d / 0.1);
    if (d >= 0 && d < 0.4) click = d / 0.4;
  }
  // En glissant le fichier, le bouton reste enfoncé.
  const dragging = interpolate(t, [plan.grab, plan.grab + 0.12, plan.drop, plan.drop + 0.08], [0, 1, 1, 0], clamp);
  return <Pointer x={x} y={y} scale={L.cursor} press={Math.max(press, dragging > 0 ? 0.6 : 0)} click={click} opacity={1} dragging={dragging} />;
}

// ---- Les sous-titres, accrochés sous l'île --------------------------------------------------------------------

function Captions({ L, t, tl, islandBottom }: { L: Layout; t: number; tl: RobotTimeline; islandBottom: number }) {
  const line = tl.lines.find((l) => l.chunks.length > 0 && t >= l.chunks[0].start - 0.05 && t < l.end + 0.42);
  if (!line) return null;
  const { size, width, cx, maxBottom } = L.caption;
  const f = t * 30;
  let j = 0;
  line.chunks.forEach((c, k) => {
    if (t >= c.start - 0.03) j = k;
  });
  const chunk = line.chunks[j];
  const at = chunk.start * 30 - 1;
  const gone = interpolate(t, [line.end + 0.24, line.end + 0.42], [0, 1], clamp);
  const pillIn = pop(f, line.chunks[0].start * 30 - 1, { damping: 14, stiffness: 220 });
  const h = size * 1.42;
  const y = Math.min(islandBottom + 48 + h / 2, maxBottom - h / 2);
  const ws = tokens(chunk.text);
  return (
    <div style={{ position: "absolute", left: cx - width / 2, width, top: y, display: "flex", justifyContent: "center", transform: `translateY(-50%) translateY(${-gone * 24}px) scale(${(0.86 + 0.14 * Math.min(1, pillIn)) * (1 - 0.06 * gone)})`, opacity: (1 - gone) * Math.min(1, pillIn * 1.6) }}>
      <div style={{ display: "inline-flex", flexWrap: "wrap", justifyContent: "center", alignItems: "baseline", columnGap: size * 0.26, padding: `${size * 0.16}px ${size * 0.42}px ${size * 0.2}px`, borderRadius: size * 0.36, background: "rgba(6,10,15,.78)", boxShadow: "0 12px 34px -10px rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,255,255,.07)", fontFamily: HEAVY, fontWeight: 800, fontSize: size, lineHeight: 1.12, letterSpacing: "-0.025em", color: C.white }}>
        {ws.map((w, i) => {
          const p = pop(f, at + i * 1.6);
          const grow = Math.min(p, 1) + 0.12 * Math.max(0, p - 1);
          return (
            <span key={`${j}-${i}`} style={{ display: "inline-block", whiteSpace: "nowrap", opacity: Math.min(1, p * 2.2), transform: `translateY(${(1 - p) * size * 0.35}px) scale(${0.4 + 0.6 * grow})` }}>
              {w.parts.map((part, k) => (
                <span key={k} style={part.on ? { color: MINT, textShadow: `0 0 ${size * 0.35}px rgba(88,242,216,.45)` } : undefined}>
                  {part.t}
                </span>
              ))}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ---- La carte de fin -----------------------------------------------------------------------------------------

function EndCard({ L, plan, tl }: { L: Layout; plan: Plan; tl: RobotTimeline }) {
  const t = plan.endStart + useCurrentFrame() / FPS;
  const R11 = tl.lines[tl.lines.length - 1];
  const v = L.H > L.W;
  // L'île avale l'écran : la capsule noire grandit depuis sa place jusqu'à remplir l'image, puis le fond de marque.
  const grow = interpolate(t, [plan.endStart, plan.endStart + 0.42], [0, 1], { ...clamp, easing: Easing.bezier(0.6, 0, 0.2, 1) });
  const capZ = zoomAt(L, plan, plan.endStart);
  const capW = 244 * capZ;
  const capH = 44 * capZ;
  const fullW = L.W * 1.6;
  const fullH = L.H * 1.6;
  const w = capW + (fullW - capW) * grow;
  const h = capH + (fullH - capH) * grow;
  const cy = L.island.top + capH / 2 + (L.H / 2 - L.island.top - capH / 2) * grow;
  const stage = interpolate(t, [plan.endStart + 0.3, plan.endStart + 0.6], [0, 1], clamp);
  const logoAt = R11.start - 0.05;
  const logo = spring01(t - logoAt, 0.55);
  const words2At = R11.start + 0.72;
  const subAt = R11.end + 0.12;
  const urlAt = R11.end + 0.45;
  const fade = (at: number, d = 0.35) => interpolate(t, [at, at + d], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const key = `fin:${plan.endStart.toFixed(3)}`;
  const track = robotTrack(key, [{ at: 0, mood: "idle" }, { at: plan.greet - plan.endStart, burst: "wave" }, { at: R11.end + 0.6 - plan.endStart, emote: "wink", duration: 0.6 }], plan.total - plan.endStart + 0.5);
  const frame = frameAt(track, t - plan.endStart);
  const ROBOT = v ? 300 : 230;
  const WORD = v ? 118 : 124;
  const lineA = "Le robot du comptoir.";
  const lineB = "Le pharmacien décide, toujours.";
  const stageEl = (
    <>
      <div style={{ position: "absolute", inset: 0, opacity: stage }}>
        <DarkStage />
      </div>
    </>
  );
  const group: ReactNode = v ? (
    <div style={{ position: "absolute", left: 0, right: 0, top: 520, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ transform: `scale(${0.4 + 0.6 * logo}) rotate(${(1 - logo) * -10}deg)`, opacity: Math.min(1, logo * 2) }}>
        <Mascot frame={frame} size={ROBOT} t={t} floating />
      </div>
      <div style={{ marginTop: 10, opacity: Math.min(1, logo * 1.6), transform: `translateY(${(1 - Math.min(1, logo)) * 30}px)` }}>
        <Wordmark size={WORD} dark />
      </div>
    </div>
  ) : (
    <div style={{ position: "absolute", left: 0, right: 0, top: 250, display: "flex", alignItems: "center", justifyContent: "center", gap: 40 }}>
      <div style={{ transform: `scale(${0.4 + 0.6 * logo}) rotate(${(1 - logo) * -10}deg)`, opacity: Math.min(1, logo * 2) }}>
        <Mascot frame={frame} size={ROBOT} t={t} floating />
      </div>
      <div style={{ opacity: Math.min(1, logo * 1.6), transform: `translateX(${(1 - Math.min(1, logo)) * -50}px)` }}>
        <Wordmark size={WORD} dark />
      </div>
    </div>
  );
  const textTop = v ? 1180 : 640;
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <div style={{ position: "absolute", left: L.island.cx - w / 2, top: cy - h / 2, width: w, height: h, borderRadius: Math.min(h / 2, 999) * (1 - grow) + 0, background: "#0B0F14", boxShadow: "0 0 0 1px rgba(255,255,255,.07)" }} />
      {stageEl}
      {group}
      <div style={{ position: "absolute", left: 0, right: 0, top: textTop, textAlign: "center" }}>
        <div style={{ fontSize: v ? 66 : 64, fontWeight: 700, letterSpacing: "-0.025em", color: C.white, display: "flex", justifyContent: "center", gap: "0.26em" }}>
          {lineA.split(" ").map((word, i) => {
            const p = spring01(t - words2At - i * 0.07, 0.4);
            return (
              <span key={i} style={{ display: "inline-block", opacity: Math.min(1, p * 2), transform: `translateY(${(1 - Math.min(1, p)) * 26}px)`, color: word.startsWith("robot") ? C.brand300 : undefined }}>
                {word}
              </span>
            );
          })}
        </div>
        <div style={{ marginTop: v ? 30 : 22, fontSize: v ? 42 : 40, fontWeight: 500, color: C.brand100, opacity: fade(subAt), transform: `translateY(${(1 - fade(subAt)) * 16}px)` }}>{lineB}</div>
        <div style={{ marginTop: v ? 90 : 70, fontSize: v ? 34 : 30, fontWeight: 500, letterSpacing: "0.02em", color: C.brand200, opacity: fade(urlAt) }}>pharmaboost.app</div>
      </div>
    </AbsoluteFill>
  );
}

/** Un ressort 0 → 1 (léger dépassement) : `d` secondes pour l'essentiel du chemin. */
function spring01(local: number, d: number) {
  if (local <= 0) return 0;
  const k = local / d;
  return 1 - Math.exp(-5 * k) * Math.cos(7 * k);
}

// ---- Le son ---------------------------------------------------------------------------------------------------

type Cue = { at: number; name: SfxName; volume: number };

function sfxCues(plan: Plan): Cue[] {
  const cues: Cue[] = [
    { at: plan.peek, name: "swish", volume: 0.5 },
    { at: plan.peek + 0.22, name: "pop", volume: 0.42 },
    { at: plan.tap1, name: "clic", volume: 0.55 },
    { at: plan.fold, name: "swish", volume: 0.3 },
    { at: plan.scan, name: "swish", volume: 0.4 },
    ...plan.checks.map((at) => ({ at, name: "tic" as const, volume: 0.5 })),
    // La mise en garde : aucun son d'interface, jusqu'aux cartes.
    { at: plan.advice, name: "swish", volume: 0.5 },
    { at: plan.sold, name: "clic", volume: 0.6 },
    { at: plan.notSold, name: "clic", volume: 0.6 },
    { at: plan.addEmail, name: "clic", volume: 0.55 },
    { at: plan.addEmail + 0.03, name: "swish", volume: 0.3 },
    { at: plan.send, name: "clic", volume: 0.6 },
    { at: plan.emailSent + 0.12, name: "pop", volume: 0.55 },
    { at: plan.backToAdvice, name: "swish", volume: 0.3 },
    { at: plan.finish, name: "clic", volume: 0.6 },
    { at: plan.finish + 0.05, name: "montee", volume: 0.16 },
    { at: plan.resultCard, name: "pop", volume: 0.45 },
    { at: plan.badge, name: "pop", volume: 0.55 },
    { at: plan.departPoste, name: "whoosh", volume: 0.6 },
    { at: plan.autoOpen, name: "swish", volume: 0.5 },
    { at: plan.roll, name: "tic", volume: 0.45 },
    { at: plan.roll + 0.12, name: "tic", volume: 0.45 },
    { at: plan.accept, name: "clic", volume: 0.6 },
    { at: plan.chatTab, name: "clic", volume: 0.5 },
    { at: plan.chatTab + 0.03, name: "swish", volume: 0.25 },
    { at: plan.stockTab, name: "clic", volume: 0.5 },
    { at: plan.grab, name: "clic", volume: 0.4 },
    { at: plan.drop, name: "clic", volume: 0.4 },
    { at: plan.sendStock, name: "clic", volume: 0.6 },
    { at: plan.stockDone, name: "pop", volume: 0.55 },
    { at: plan.closeApp, name: "swish", volume: 0.3 },
    { at: plan.departApp, name: "whoosh", volume: 0.6 },
    ...plan.taps.map((at) => ({ at, name: "clic" as const, volume: 0.55 })),
    { at: plan.grumpy + 0.02, name: "swish", volume: 0.35 },
    { at: plan.grumpyEnd, name: "swish", volume: 0.25 },
    ...[...plan.slots, plan.pixelBack].map((at) => ({ at, name: "tic" as const, volume: 0.5 })),
    { at: plan.endStart, name: "whoosh", volume: 0.4 },
  ];
  // La frappe : une touche par caractère, en alternant trois sons (55 ms par caractère, comme l'île).
  const typing = (start: number, text: string) =>
    Array.from(text).flatMap((ch, i) => (ch === " " ? [] : [{ at: start + i * TYPE_MS, name: (["touche1", "touche2", "touche3"] as const)[(i * 7) % 3], volume: 0.32 + 0.1 * (((i * 13) % 4) / 3) }]));
  cues.push(...typing(plan.typeStart, PATIENT_EMAIL), ...typing(plan.typeQ, CHAT_QUESTION));
  return cues;
}

function Sound({ plan, tl }: { plan: Plan; tl: RobotTimeline }) {
  const R11 = tl.lines[tl.lines.length - 1];
  const cues = [...sfxCues(plan), { at: R11.start - 0.05, name: "impact" as const, volume: 0.5 }];
  return (
    <>
      {tl.lines.map((line) => (
        <Sequence key={`voix-${line.id}`} from={Math.round(line.start * FPS)} layout="none" name={`Voix ${line.id}`}>
          <Audio src={staticFile(`${VOICE_DIR}/${line.id}.mp3`)} />
        </Sequence>
      ))}
      {cues.map((c, i) => (
        <Sequence key={`sfx-${i}`} from={Math.max(0, Math.round(c.at * FPS))} layout="none" name={`Son ${c.name}`}>
          <Audio src={staticFile(`sfx/${c.name}.wav`)} volume={c.volume} />
        </Sequence>
      ))}
      <Audio src={staticFile("music/robot.wav")} volume={(f) => musicVolume(f / FPS, plan, tl)} />
    </>
  );
}

/** La musique : 0,7 dans les temps muets, 0,25 sous la voix, presque rien sur la mise en garde, fondu final. */
function musicVolume(t: number, plan: Plan, tl: RobotTimeline) {
  let voice = 0;
  for (const l of tl.lines) {
    const v = interpolate(t, [l.start - 0.22, l.start - 0.04, l.end + 0.08, l.end + 0.4], [0, 1, 1, 0], clamp);
    voice = Math.max(voice, v);
  }
  const base = 0.7 - (0.7 - 0.25) * voice;
  const dip = interpolate(t, [plan.alert - 0.15, plan.alert + 0.25, plan.compris, plan.advice + 0.35], [1, 0.24, 0.24, 1], clamp);
  const end = interpolate(t, [plan.total - 1.6, plan.total - 0.05], [1, 0], clamp);
  return base * dip * end;
}
