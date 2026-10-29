import { BANNER, withCount } from "../../../agent/src/banner-design";
import type { RobotMood } from "@/core/robot/mascot";

/**
 * L'île du comptoir : la bannière PharmaBoost jouée dans une capsule, façon « île » (inspirée de Coucou, MIT — voir
 * THIRD_PARTY_NOTICES.md), avec NOTRE robot dedans. Module pur : les étapes du parcours, leurs textes (ceux de la
 * bannière Windows, `agent/src/banner-design.ts`, une seule source), l'humeur du robot, la taille de l'île et le
 * scénario de démonstration. Le dessin vit dans `components/island`.
 */

export type IslandStage = "idle" | "scan" | "analyzing" | "ready" | "advice" | "email" | "emailSent" | "done" | "alert" | "quiet";

export type IslandOutcome = "SOLD" | "NOT_SOLD" | null;

export type IslandState = {
  stage: IslandStage;
  /** Les étapes d'analyse déjà cochées (l'activité qui défile). */
  stepsDone: number;
  /** La réponse donnée à chaque conseil, dans l'ordre des cartes. */
  outcomes: IslandOutcome[];
  /** L'e-mail saisi pour le bilan (vide tant que rien n'est tapé). */
  email: string;
};

export const INITIAL_ISLAND: IslandState = { stage: "idle", stepsDone: 0, outcomes: [], email: "" };

/** L'humeur du robot à chaque étape : il ne fait que refléter ce que fait la bannière. */
export const STAGE_MOOD: Record<IslandStage, RobotMood> = {
  idle: "idle",
  scan: "curious",
  analyzing: "thinking",
  ready: "happy",
  advice: "idle",
  email: "curious",
  emailSent: "happy",
  done: "celebrate",
  alert: "concerned",
  quiet: "idle",
};

/** La largeur de l'île à chaque étape (px) : la capsule au repos, plus large quand il y a à lire. La hauteur suit le contenu. */
export const STAGE_WIDTH: Record<IslandStage, number> = {
  // Une île fine : elle ne doit jamais masquer le logiciel de gestion derrière (les conseils défilent DANS l'île).
  idle: 252,
  scan: 300,
  analyzing: 340,
  ready: 320,
  // 360 : la bannière masquait trop le logiciel pendant une délivrance (retour des pharmacies, 13 oct. 2026).
  advice: 360,
  // 310 : à 400, la question du bilan masquait trop LGPI en fin de vente (retour du fondateur, 26 oct. 2026).
  email: 310,
  emailSent: 320,
  done: 340,
  alert: 400,
  quiet: 320,
};

/**
 * Le ton de l'île : son liseré et sa lueur (vert quand tout est fini). Une mise en garde reste sobre, sans liseré ni texte
 * orange : au comptoir, l'orange se lisait comme une alarme pendant les conseils (retour du fondateur, 13 oct. 2026).
 */
export function stageTone(stage: IslandStage): "neutral" | "accent" | "warning" | "success" {
  if (stage === "done" || stage === "emailSent") return "success";
  if (stage === "scan" || stage === "analyzing" || stage === "ready") return "accent";
  return "neutral";
}

/** Les lignes d'analyse qui se cochent l'une après l'autre (comme l'activité d'un agent dans Coucou). */
export function analysisSteps(drug: string, adviceCount: number): string[] {
  return [`Boîte lue : ${drug}`, "Stock de l'officine vérifié", "Règles validées par l'équipe officinale", adviceCount > 0 ? withCount(adviceCount > 1 ? BANNER.text.readyMany : BANNER.text.readyOne, adviceCount) : BANNER.text.quiet];
}

/** Le titre de la capsule à chaque étape (repris des phrases de la bannière). */
export function stageTitle(state: IslandState, adviceCount: number): string {
  switch (state.stage) {
    case "idle":
      return BANNER.text.idle;
    case "scan":
      return BANNER.text.scanTitle;
    case "analyzing":
      return BANNER.text.scanSub;
    case "ready":
      return withCount(adviceCount > 1 ? BANNER.text.readyMany : BANNER.text.readyOne, adviceCount);
    case "advice":
      return withCount(adviceCount > 1 ? BANNER.text.forSaleMany : BANNER.text.forSaleOne, adviceCount);
    case "email":
      return BANNER.text.emailAdd;
    case "emailSent":
      return "E-mail envoyé";
    case "done":
      return BANNER.text.doneTitle;
    case "alert":
      return BANNER.text.readFirst;
    case "quiet":
      return BANNER.text.quiet;
  }
}

/** Tous les conseils ont-ils une réponse ? (« Tous traités ».) */
export function allAnswered(state: IslandState, adviceCount: number): boolean {
  return adviceCount > 0 && state.outcomes.length >= adviceCount && state.outcomes.slice(0, adviceCount).every((outcome) => outcome !== null);
}

export type IslandAction =
  | { type: "go"; stage: IslandStage }
  | { type: "tick" }
  | { type: "answer"; index: number; outcome: IslandOutcome }
  | { type: "email"; value: string }
  | { type: "reset" };

/** Les transitions : un bouton (go), le temps qui passe (tick), une réponse au conseil, la saisie de l'e-mail. */
export function islandReducer(state: IslandState, action: IslandAction, adviceCount: number): IslandState {
  switch (action.type) {
    case "reset":
      return INITIAL_ISLAND;
    case "go":
      if (action.stage === "idle" || action.stage === "scan") return { ...INITIAL_ISLAND, stage: action.stage };
      if (action.stage === "analyzing") return { ...state, stage: "analyzing", stepsDone: 0 };
      if (action.stage === "advice" || action.stage === "ready") return { ...state, stage: action.stage, stepsDone: analysisSteps("", adviceCount).length };
      return { ...state, stage: action.stage };
    case "tick":
      if (state.stage === "analyzing") return { ...state, stepsDone: Math.min(state.stepsDone + 1, analysisSteps("", adviceCount).length) };
      return state;
    case "answer": {
      const outcomes = [...state.outcomes];
      while (outcomes.length < adviceCount) outcomes.push(null);
      if (action.index >= 0 && action.index < adviceCount) outcomes[action.index] = action.outcome;
      return { ...state, outcomes };
    }
    case "email":
      return { ...state, email: action.value.slice(0, 120) };
  }
}

/**
 * Le scénario de démonstration, joué en boucle : un parcours de vente complet (scan → analyse → conseils → vendu /
 * non vendu → e-mail du bilan → vente terminée), puis une vente avec mise en garde (robot sérieux, sans fête), puis
 * une vente sans conseil. Chaque pas dit quoi faire et combien de temps attendre avant le suivant.
 */
export type ScenarioStep = { wait: number; action: IslandAction | { type: "type"; value: string } };

export const DEMO_EMAIL = "patient@exemple.fr";

export function demoScenario(adviceCount: number): ScenarioStep[] {
  const steps: ScenarioStep[] = [
    { wait: 2600, action: { type: "go", stage: "idle" } },
    { wait: 1400, action: { type: "go", stage: "scan" } },
    { wait: 650, action: { type: "go", stage: "analyzing" } },
    ...Array.from({ length: analysisSteps("", adviceCount).length }, () => ({ wait: 650, action: { type: "tick" } as IslandAction })),
    { wait: BANNER.timing.readyPauseMs, action: { type: "go", stage: "ready" } },
    { wait: 2400, action: { type: "go", stage: "advice" } },
    { wait: 1800, action: { type: "answer", index: 0, outcome: "SOLD" } },
  ];
  if (adviceCount > 1) steps.push({ wait: 1800, action: { type: "answer", index: 1, outcome: "NOT_SOLD" } });
  steps.push(
    { wait: 1200, action: { type: "go", stage: "email" } },
    ...Array.from({ length: DEMO_EMAIL.length }, (_, i) => ({ wait: 55, action: { type: "type" as const, value: DEMO_EMAIL.slice(0, i + 1) } })),
    { wait: 900, action: { type: "go", stage: "emailSent" } },
    { wait: 1800, action: { type: "go", stage: "done" } },
    { wait: 3600, action: { type: "go", stage: "idle" } },
    // (Plus de vente « mise en garde » : la bannière ne pousse que des produits conseils — fondateur, 13 oct. 2026.)
    // Deuxième vente : rien à ajouter.
    { wait: 2000, action: { type: "go", stage: "scan" } },
    { wait: 650, action: { type: "go", stage: "quiet" } },
    { wait: 3000, action: { type: "go", stage: "idle" } },
  );
  return steps;
}

/** Clics rapprochés sur la capsule : au-delà de ce nombre en `TAP_WINDOW_MS`, le robot proteste (puis a le tournis). */
export const RAPID_TAPS = 4;
export const TAP_WINDOW_MS = 1600;

/** Garde les clics récents et dit si l'on a tapé trop vite. */
export function registerTap(taps: number[], now: number): { taps: number[]; tooMany: boolean } {
  const recent = [...taps.filter((at) => now - at < TAP_WINDOW_MS), now];
  return { taps: recent, tooMany: recent.length >= RAPID_TAPS };
}

/** Au-delà de ce déplacement (pixels d'écran) entre l'appui et le clic, c'est un glisser : même seuil que l'hôte Windows. */
export const TAP_SLOP_PX = 4;

/**
 * Le clic sur la carte d'un conseil ouvre-t-il sa page ? Oui pour un vrai clic ; non si la souris a bougé entre l'appui
 * et le relâché (on faisait défiler la liste, ou glisser l'île). Sans appui connu (clavier) : c'est un clic.
 */
export function isTap(down: { x: number; y: number } | null, up: { x: number; y: number }): boolean {
  return down === null || Math.hypot(up.x - down.x, up.y - down.y) <= TAP_SLOP_PX;
}

/**
 * Le clic sur le lien d'une carte de conseil : un vrai clic suit le lien (et prévient la page, qui peut viser ce conseil) ;
 * après un glisser, le lien ne s'ouvre pas — ni dans l'île, ni, au poste, dans le navigateur du PC. Vrai si le lien suit.
 */
export function followAdviceLink(down: { x: number; y: number } | null, event: { screenX: number; screenY: number; preventDefault: () => void }, onOpen?: () => void): boolean {
  if (!isTap(down, { x: event.screenX, y: event.screenY })) {
    event.preventDefault();
    return false;
  }
  onOpen?.();
  return true;
}

/** Une mise en garde lue en trois morceaux : le titre (« Paracétamol : 3 g par jour au maximum »), le sous-titre, le détail. */
export type IslandAlertParts = { title: string; subtitle: string | null; detail: string };

/**
 * Les messages de mise en garde sont écrits « Titre — Sous-titre : Explication » (`vigilanceMessage`). L'île les remet en
 * forme : titre en gras, sous-titre discret, explication lisible. Un message d'une autre forme reste entier dans le détail.
 */
export function splitAlert(message: string): IslandAlertParts {
  const text = message.trim();
  const dash = text.indexOf(" — ");
  if (dash > 0) {
    const title = text.slice(0, dash).trim();
    const rest = text.slice(dash + 3);
    const colon = rest.indexOf(" : ");
    if (colon > 0 && colon < 90) return { title, subtitle: rest.slice(0, colon).trim(), detail: rest.slice(colon + 3).trim() };
    return { title, subtitle: null, detail: rest.trim() };
  }
  return { title: "", subtitle: null, detail: text };
}
