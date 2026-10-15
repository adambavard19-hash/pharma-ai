import type { RobotTimeline } from "./timeline";
import type { RobotCue } from "../island/motion-track";
import { PATIENT_EMAIL, CHAT_QUESTION } from "./data";

/* ==========================================================================
 * LE DÉROULÉ DU FILM « ROBOT », en secondes, calé sur la voix réelle.
 *
 * Chaque geste est accroché à un mot (le début d'un sous-titre, mesuré sur la voix) ou à la fin d'une phrase pour
 * les temps muets. Les durées de l'interface sont celles du code quand elles existent (frappe de l'e-mail : 55 ms par
 * caractère ; « E-mail envoyé » : 1,6 s avant le retour aux conseils ; message des clics rapides : 3 s).
 * ======================================================================== */

export const TYPE_MS = 0.055;
/** Le vol du robot d'une île à l'autre. */
export const FLIGHT = 0.78;

export function makePlan(tl: RobotTimeline) {
  const L = tl.lines;
  const line = (id: string) => {
    const found = L.find((l) => l.id === id);
    if (!found) throw new Error(`Phrase ${id} absente`);
    return found;
  };
  const chunk = (id: string, j: number) => line(id).chunks[j].start;
  const R1 = line("R1"), R2 = line("R2"), R3 = line("R3"), R8 = line("R8"), R9 = line("R9"), R11 = line("R11");

  // Ouverture : la capsule au repos, clin d'œil, puis le survol.
  const wink0 = 0.22;
  const cursorIn = 0.38;
  const hover = 0.72;
  const peek = hover + 0.16;
  const tile = peek + 0.22;
  const tiltHead = R1.start + 0.95;

  // R2 : une tape (il glousse), puis le curseur s'éloigne et l'île se replie.
  const tap1 = chunk("R2", 0) + 0.36;
  const leave = chunk("R2", 3) - 0.05;
  const fold = leave + 0.35;

  // Temps muet 1 : le scan, l'analyse qui se coche, la mise en garde.
  const scanLine = R2.end + 0.08;
  const scan = R2.end + 0.12;
  const analyzing = scan + 0.45;
  const checks = [0, 1, 2, 3].map((k) => analyzing + 0.22 + 0.38 * k);
  const alert = checks[3] + 0.28;

  // R3 : « Compris » sur « fête », puis les cartes dans le silence.
  const compris = chunk("R3", 2) + 0.26;
  const advice = compris + 0.12;

  // R4 : Vendu, Non vendu.
  const sold = chunk("R4", 1) + 0.06;
  const notSold = sold + 0.6;

  // R5 et temps muet 2 : l'e-mail, puis la fin de la vente.
  const addEmail = chunk("R5", 1) + 0.08;
  const typeStart = chunk("R5", 3) + 0.12;
  const typeEnd = typeStart + PATIENT_EMAIL.length * TYPE_MS;
  const send = typeEnd + 0.32;
  const emailSent = send + 0.08;
  const backToAdvice = emailSent + 1.6;
  const finish = backToAdvice + 0.7;
  const resultCard = finish + 0.34;
  const badge = resultCard + 0.46;

  // R6 : Pixel saute dans l'île du logiciel ; l'île s'ouvre d'elle-même ; « Accepter ».
  const settle = chunk("R6", 0) + 0.18;
  const departPoste = settle + 0.1;
  const landApp = departPoste + FLIGHT;
  const autoOpen = Math.max(chunk("R6", 1) + 0.12, landApp + 0.3);
  const roll = autoOpen + 0.62;
  const accept = chunk("R6", 3) + 0.1;
  const accepted = accept + 0.36;
  const toast = accepted + 0.04;

  // R7 : la discussion. La note du bas se lit avant la frappe (elle s'efface dès la première lettre, comme dans le code).
  const chatTab = chunk("R7", 0) + 0.55;
  const typeQ = chunk("R7", 2) + 0.08;
  const sendQ = typeQ + CHAT_QUESTION.length * TYPE_MS + 0.16;
  const answerStart = sendQ + 0.72;
  const answerEnd = answerStart + 1.55;
  const happyChat = answerEnd + 0.05;

  // R8 et temps muet 3 : le stock ; retour au poste ; temps muet 4 : les tapes.
  const stockTab = chunk("R8", 0) + 0.32;
  const grab = chunk("R8", 1) + 0.02;
  const overZone = grab + 0.78;
  const drop = chunk("R8", 2) + 0.06;
  const preview = chunk("R8", 3) + 0.42;
  const sendStock = R8.end + 0.42;
  const stockDone = sendStock + 0.8;
  const closeApp = stockDone + 0.78;
  const departApp = closeApp + 0.22;
  const landPoste = departApp + FLIGHT;
  const taps = [0, 1, 2, 3].map((k) => landPoste + 0.22 + 0.44 * k);
  const grumpy = taps[3];
  const grumpyEnd = grumpy + 3.0;

  // R10 : la machine à sous des robots de comptoir, puis Pixel ; l'image de boucle ; la carte de fin.
  const slots = [0, 1, 2, 3].map((k) => chunk("R10", 0) + 0.1 + 0.28 * k);
  const pixelBack = slots[3] + 0.28;
  const captionOut = Math.min(pixelBack + 0.34, tl.endStart - 0.3);
  const wink1 = tl.endStart - 0.32;
  const endStart = tl.endStart;
  const greet = R11.start + 0.25;

  return {
    wink0, cursorIn, hover, peek, tile, tiltHead, tap1, leave, fold,
    scanLine, scan, analyzing, checks, alert, compris, advice, sold, notSold,
    addEmail, typeStart, typeEnd, send, emailSent, backToAdvice, finish, resultCard, badge,
    settle, departPoste, landApp, autoOpen, roll, accept, accepted, toast,
    chatTab, typeQ, sendQ, answerStart, answerEnd, happyChat,
    stockTab, grab, overZone, drop, preview, sendStock, stockDone, closeApp, departApp, landPoste, taps, grumpy, grumpyEnd,
    slots, pixelBack, captionOut, wink1, endStart, greet,
    R1, R2, R3, R9, total: tl.total,
  };
}

export type Plan = ReturnType<typeof makePlan>;

/**
 * Pixel, de la première à la dernière image : ses humeurs suivent l'île (STAGE_MOOD du poste, l'humeur des alertes
 * dans le logiciel, celle de la discussion), ses gestes suivent le pointeur.
 */
export function pixelCues(p: Plan): RobotCue[] {
  return [
    { at: 0, mood: "idle" },
    { at: p.wink0, emote: "wink", duration: 0.6 },
    { at: p.hover, hover: true },
    { at: p.hover, look: { x: 0.7, y: 0.55 } },
    { at: p.tiltHead - 0.35, look: null },
    { at: p.tiltHead, tilt: 0.16, hold: 0.7 },
    { at: p.tap1 - 0.3, look: { x: 0.15, y: 0.35 } },
    { at: p.tap1, poke: true },
    { at: p.leave, hover: false },
    { at: p.leave + 0.1, look: null },
    { at: p.scan, mood: "curious" },
    { at: p.analyzing, mood: "thinking" },
    { at: p.alert, mood: "concerned" },
    { at: p.advice, mood: "idle" },
    { at: p.addEmail, mood: "curious" },
    { at: p.emailSent, mood: "happy" },
    { at: p.backToAdvice, mood: "idle" },
    { at: p.finish, mood: "celebrate" },
    // Le vol : content, puis l'humeur du logiciel (une demande d'équipe en tête : curieux).
    { at: p.departPoste, mood: "happy", quiet: true },
    { at: p.landApp, mood: "curious" },
    // La discussion : au repos à l'ouverture, pensif pendant la réponse, content quand elle est écrite (use-assistant-chat).
    { at: p.chatTab, mood: "idle" },
    { at: p.sendQ, mood: "thinking" },
    { at: p.happyChat, mood: "happy" },
    { at: p.stockTab, mood: "curious" },
    { at: p.stockDone, mood: "happy" },
    { at: p.departApp, mood: "happy", quiet: true },
    { at: p.landPoste, mood: "idle" },
    ...p.taps.map((at) => ({ at, poke: true as const })),
    { at: p.wink1, emote: "wink" as const, duration: 0.6 },
  ];
}
