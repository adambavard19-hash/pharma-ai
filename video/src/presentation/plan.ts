import type { PresentationTimeline } from "./timeline";
import type { Track, TrackEvent } from "./mascot";
import { CHAT_QUESTION, EMAIL } from "./data";

/* ==========================================================================
 * LE PLAN DU FILM : chaque geste, à la seconde, calé sur la voix.
 *
 * Les instants viennent des sous-titres de la voix réelle (timeline.ts) : un
 * clic tombe sur le mot qui le dit (« vendu », « d'un clic »…). Tout est en
 * secondes du film.
 * ======================================================================== */

/** Une frappe : 55 ms par caractère, comme le scénario de démonstration du site (banner-flow.ts). */
export const TYPE_STEP = 0.055;

/**
 * Les débuts des groupes de P13 (« Pharma Boost. Le bon conseil, à chaque vente. »), en secondes depuis le début de la
 * phrase : estimés (une voix nouvelle les recale) — la carte de fin écrit chaque groupe quand la voix le dit.
 */
export const P13_ONSETS = [0, 0.95, 1.95];

/** Ce qui ne doit plus arriver dans ce film (l'île du logiciel, la mise en garde) : bien après la fin. */
const NEVER = 10_000;

export function makePlan(tl: PresentationTimeline) {
  const L = tl.lines;
  const c = (i: number, j: number) => L[i].chunks[j].start;
  const s = (i: number) => L[i].start;
  const e = (i: number) => L[i].end;

  // ---- 1. Le problème (P1 à P4) et 2. la révélation (P5)
  const problemEnd = s(4) - 0.15;
  const reveal = s(4) - 0.15;
  const revealName = c(4, 0) + 0.35;
  const revealRobot = c(4, 1) + 0.05;
  // Le robot reste en majesté jusqu'à « de votre comptoir », puis monte se poser sur l'écran.
  const revealScreen = c(4, 3) + 0.05;

  // ---- 3. Le poste : survol (aucun), scan, analyse, conseils
  const posteIn = s(5) - 0.35;
  const hoverIn = NEVER;
  const hoverOut = NEVER;
  const collapse = NEVER;
  const scan = c(5, 0) + 0.25;
  const analyzing = scan + 0.4;
  // « En une seconde » : l'analyse se coche vite.
  const checks = [c(5, 2) - 0.2, c(5, 2) + 0.1, c(5, 2) + 0.4, c(5, 3) + 0.05];
  const advice = c(5, 3) + 0.25;
  // Plus de mise en garde sur la bannière : son étape dure zéro.
  const alert = advice;
  const sweep = NEVER;
  const compris = NEVER;
  const halos = { stock: c(6, 1) + 0.12, reasons: c(6, 0) + 0.15, challenge: c(6, 3) + 0.15, date: c(6, 2) + 0.15 };
  const sold = c(7, 1) + 0.1;
  const notSold = NEVER;

  // ---- Le bilan, puis « Vente terminée » et la fête
  const addEmail = c(8, 0) + 0.55;
  const typeEmail = c(8, 1) - 0.1;
  const sendEmail = typeEmail + EMAIL.length * TYPE_STEP + 0.2;
  const emailSent = sendEmail + 0.18;
  const backToAdvice = Math.min(emailSent + 0.7, s(9) - 0.2);
  const finish = c(9, 0) + 0.5;
  const done = Math.max(finish + 0.12, c(9, 1) - 0.1);
  const resultCard = done + 0.4;
  const badge = done + 0.8;

  // ---- L'île du logiciel et la discussion : pas dans ce film
  const jump = NEVER;
  const land = NEVER;
  const logicielShow = NEVER;
  const autoOpen = NEVER;
  const roll = NEVER;
  const accept = NEVER;
  const acceptDone = NEVER;
  const chatTab = NEVER;
  const typeChat = NEVER;
  const sendChat = NEVER;
  const answerFrom = NEVER;
  const answerTo = NEVER;

  // ---- 4. L'équipe et le téléphone (P11)
  const teamIn = s(10) - 0.2;
  const wave = c(10, 0) + 0.15;
  const teamShift = c(10, 1);
  const challengeHalo = c(10, 2) + 0.15;
  const phoneIn = c(10, 3) - 0.1;
  const phoneHome = phoneIn + 0.7;

  // ---- 5. La confiance (P12) : retour au poste au repos, les étiquettes
  const posteBack = s(11) - 0.2;
  const labelData = c(11, 2) + 0.1;
  const labelDecision = c(11, 4) + 0.1;
  const labelRules = c(11, 0) + 0.1;

  // ---- 6. La fin (P13)
  const endStart = tl.endStart;
  const words = P13_ONSETS.map((o) => s(12) + o);
  const url = s(12) + 2.6;

  return {
    tl,
    total: tl.total,
    problemEnd, reveal, revealName, revealRobot, revealScreen, posteIn,
    hoverIn, hoverOut, collapse,
    scan, analyzing, checks, alert, sweep, compris,
    advice, halos, sold, notSold,
    addEmail, typeEmail, sendEmail, emailSent, backToAdvice, finish, done, resultCard, badge,
    jump, land, logicielShow, autoOpen, roll, accept, acceptDone,
    chatTab, typeChat, sendChat, answerFrom, answerTo,
    teamIn, wave, teamShift, challengeHalo, phoneIn, phoneHome,
    posteBack, labelData, labelDecision, labelRules,
    endStart, words, url,
  };
}

export type Plan = ReturnType<typeof makePlan>;

/** Les robots du film et ce qui leur arrive. La clé change avec le plan : une nouvelle voix rejoue les pistes. */
export function makeTracks(P: Plan) {
  const key = P.total.toFixed(3);
  const until = P.total + 0.5;
  const pixel: TrackEvent[] = [
    { t: 0, kind: "mood", mood: "idle" },
    { t: 0.35, kind: "blink" },
    { t: P.revealRobot, kind: "burst", burst: "wave" },
    { t: P.revealRobot + 1.1, kind: "mood", mood: "happy" },
    { t: P.posteIn, kind: "mood", mood: "idle" },
    { t: P.hoverIn, kind: "hover", on: true },
    { t: P.hoverOut, kind: "hover", on: false },
    { t: P.scan, kind: "mood", mood: "curious" },
    { t: P.analyzing, kind: "mood", mood: "thinking" },
    { t: P.advice, kind: "mood", mood: "happy" },
    { t: P.advice + 1.2, kind: "mood", mood: "idle" },
    { t: P.halos.stock + 0.4, kind: "glance", x: -0.5, y: 0.35, dur: 1.2 },
    { t: P.addEmail, kind: "mood", mood: "curious" },
    { t: P.emailSent, kind: "mood", mood: "happy" },
    { t: P.backToAdvice, kind: "mood", mood: "idle" },
    { t: P.done, kind: "mood", mood: "celebrate" },
    { t: P.jump, kind: "burst", burst: "jump" },
    { t: P.land, kind: "mood", mood: "curious" },
    { t: P.land, kind: "squash" },
    { t: P.chatTab, kind: "mood", mood: "idle" },
    { t: P.sendChat, kind: "mood", mood: "thinking" },
    { t: P.answerTo, kind: "mood", mood: "happy" },
    { t: P.answerTo + 2.5, kind: "mood", mood: "idle" },
    { t: P.posteBack + 0.2, kind: "blink" },
    { t: P.labelData + 0.3, kind: "glance", x: -0.7, y: 0.2, dur: 1.1 },
    { t: P.labelDecision + 0.2, kind: "glance", x: 0.7, y: 0.2, dur: 1.1 },
    { t: P.labelDecision + 1.5, kind: "blink" },
  ];
  const team = [0, 1, 2, 3].map(
    (k): Track => ({
      id: `equipe-${k}-${key}`,
      seed: 31 + k * 7,
      until,
      events: [
        { t: 0, kind: "mood", mood: "idle" },
        { t: P.teamIn + 0.3 + k * 0.17, kind: "blink" },
        { t: P.wave + k * 0.14, kind: "burst", burst: "wave" },
        { t: P.wave + k * 0.14 + 0.45, kind: "emit", particle: "spark", count: 4 },
        { t: P.teamShift + 0.9 + k * 0.3, kind: "glance", x: 0.6, y: 0.4, dur: 1 },
      ],
    }),
  );
  const phone: Track = { id: `telephone-${key}`, seed: 77, until, events: [{ t: 0, kind: "mood", mood: "idle" }, { t: P.phoneHome + 0.15, kind: "burst", burst: "wave" }] };
  const end: Track = {
    id: `fin-${key}`,
    seed: 91,
    until,
    events: [
      { t: 0, kind: "mood", mood: "idle" },
      { t: P.words[0] + 0.15, kind: "burst", burst: "wave" },
      { t: P.words[2] + 0.6, kind: "emote", emote: "proud", dur: 1.6 },
    ],
  };
  return { pixel: { id: `pixel-${key}`, seed: 12, until, events: pixel } as Track, team, phone, end };
}

export type Tracks = ReturnType<typeof makeTracks>;
