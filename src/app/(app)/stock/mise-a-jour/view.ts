import { TIME_ZONE } from "@/config/constants";
import { DEFAULT_EXPORT_PATH, LGO_DEFINITIONS, type LgoDefinition, type LgoId } from "@/core/stock/connectors";
import {
  DEPOSIT_ACCEPTED,
  DEPOSIT_ACCEPTED_LABEL,
  DEPOSIT_MAX_BYTES,
  DEPOSIT_STATUS_LABELS,
  describeDepositResult,
  stockAgeDays,
  stockReminderLevel,
} from "@/core/stock-deposit/rules";
import type { DepositStatus, DepositView } from "@/core/stock-deposit/types";
import { formatDate, formatNumber, formatTime } from "@/lib/format";
import type { ActionResult } from "@/server/actions/types";

/**
 * La page « Mettre à jour mon stock » : tout ce qui se décide sans écran.
 *
 * Les textes, les états et les contrôles vivent ici, en fonctions pures : la
 * page serveur et les deux composants client (envoi du fichier, statut en
 * direct) disent ainsi la même chose, et chaque phrase se teste sans rendu.
 * Vocabulaire du titulaire : « stock », « fichier », « dossier PharmaBoost » —
 * jamais « agent », « appairage » ni « CIP ».
 */

/** Ce que dit le titulaire d'un fichier que l'équipe doit vérifier avant de l'appliquer. */
export const HELD_NOTICE =
  "L'équipe PharmaBoost vérifie votre fichier avant de l'appliquer : votre stock n'a pas changé. Si c'était un fichier partiel, envoyez votre stock complet, pas seulement les nouveautés.";

/** La conséquence la plus lourde du moteur, dite AVANT l'envoi : un produit absent du fichier passe à 0 en stock. */
export const ZERO_ABSENT_NOTICE = "Ce qui n'est pas dans le fichier sera mis à 0 en stock.";

export const FULL_STOCK_REMINDER = `Envoyez toujours votre stock complet (tous les produits en stock), pas seulement ce qui vient d'arriver. ${ZERO_ABSENT_NOTICE}`;

/** Le dernier fichier a été écarté par l'équipe : la page le dit en haut, avec quoi faire. */
export const REJECTED_NOTICE = "L'équipe PharmaBoost n'a pas appliqué votre dernier fichier. Votre stock n'a pas changé. Envoyez votre stock complet.";

/** Un fichier resté « en lecture » trop longtemps : le traitement s'est arrêté, on ne fait pas tourner une roue pour rien. */
export const INTERRUPTED_LINE = "Lecture interrompue, renvoyez votre fichier.";

export const SEND_FAILED = "L'envoi n'a pas abouti. Vérifiez votre connexion et réessayez.";

// --- Le dossier PharmaBoost --------------------------------------------------

/**
 * Le dossier à ouvrir, tel que le titulaire le voit : le partage réseau du
 * serveur quand on le connaît (`\\SERVEUR\PharmaBoost`, atteignable depuis
 * n'importe quel poste), sinon le dossier local d'installation. Rien ne prouve
 * que le partage existe : la page le dit (voir `FOLDER_LOCATION_NOTICE`) et
 * propose toujours l'envoi du fichier à la place.
 */
export function sharedFolderPath(hostname: string | null | undefined): string {
  const name = (hostname ?? "").trim().replace(/^[\\/]+/, "").replace(/[\\/]+$/, "");
  return name ? `\\\\${name}\\PharmaBoost` : DEFAULT_EXPORT_PATH;
}

/** Où se trouve le dossier : sur le serveur de l'officine. Le chemin lui-même est affiché juste après. */
export const FOLDER_LOCATION_NOTICE = "Le dossier PharmaBoost se trouve sur le serveur de l'officine :";
/** Le raccourci est posé sur le serveur seulement : on ne promet pas le bureau d'un poste. */
export const FOLDER_SHORTCUT_NOTICE = "Sur le serveur, un raccourci « Stock PharmaBoost » est posé sur le bureau.";
/** Le chemin réseau peut ne pas s'ouvrir : l'envoi par le bouton est tout aussi bon, et le dit. */
export const FOLDER_FALLBACK_NOTICE = "Ce chemin ne s'ouvre pas ? Pas de souci : envoyez le fichier avec le bouton ci-dessous, c'est tout aussi bon.";

/** Un serveur est « relié » une fois appairé ; une liaison en attente ou coupée n'a pas de dossier. */
export function isFolderReady(connection: { status: string } | null | undefined): boolean {
  return Boolean(connection && connection.status !== "PENDING" && connection.status !== "DISCONNECTED");
}

// --- Les trois étapes --------------------------------------------------------

export type ExportGuide = {
  /** « LGPI », ou « votre logiciel » quand on ne sait pas lequel. */
  name: string;
  /** Vrai seulement pour un logiciel dont la procédure a été vérifiée en officine. */
  verified: boolean;
  /** Ce qu'on fait dans le logiciel pour sortir le stock (étape 1). */
  menuSteps: string[];
  /** Un rappel propre au logiciel pour l'enregistrement (étape 2), s'il est vérifié. */
  saveHint: string | null;
  /** Honnêteté : les étapes d'un logiciel non vérifié ne sont pas inventées. */
  notice: string | null;
};

/** Repris de la procédure vérifiée en officine : ce que le titulaire fait au moment d'enregistrer. */
const SAVE_HINTS: Partial<Record<LgoId, string>> = {
  lgpi: "Dans LGPI, enregistrez (F9) l'édition en PDF dans ce dossier.",
};

export const UNVERIFIED_NOTICE = "Les étapes exactes de votre logiciel seront ajoutées avec votre conseiller PharmaBoost.";

const FALLBACK_LGO = LGO_DEFINITIONS.find((lgo) => lgo.id === "autre") as LgoDefinition;

/**
 * Les étapes viennent des définitions de logiciels, sans rien inventer. Leurs
 * deux dernières lignes disent « enregistrez dans le dossier » et « PharmaBoost
 * relit » : ce sont nos étapes 2 et 3, écrites pour le titulaire. Il reste ce
 * qui se passe dans le logiciel — l'étape 1.
 */
export function exportGuide(lgoId: string | null | undefined): ExportGuide {
  const lgo = LGO_DEFINITIONS.find((candidate) => candidate.id === lgoId) ?? FALLBACK_LGO;
  const menuSteps = lgo.exportSteps.slice(0, Math.max(1, lgo.exportSteps.length - 2)).map((step) => step.replace("code CIP", "code du produit"));
  const verified = lgo.adapter === "PILOT";
  return {
    name: lgo.id === "autre" ? "votre logiciel" : lgo.label,
    verified,
    menuSteps,
    saveHint: SAVE_HINTS[lgo.id] ?? null,
    notice: verified ? null : UNVERIFIED_NOTICE,
  };
}

// --- L'état du stock, en grand -----------------------------------------------

/** Les clés de jour à Paris (« 2026-10-05 »), pour dire « aujourd'hui » et « hier » sans se tromper de minuit. */
function parisDayNumber(date: Date): number {
  const key = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/** « aujourd'hui à 08:42 », « hier à 21:10 », « le 03/10/2026 à 08:42 ». */
export function describeReceived(date: Date, now: Date): string {
  const gap = parisDayNumber(now) - parisDayNumber(date);
  const day = gap === 0 ? "aujourd'hui" : gap === 1 ? "hier" : `le ${formatDate(date)}`;
  return `${day} à ${formatTime(date)}`;
}

export type StockState = { tone: "success" | "warning" | "neutral"; title: string; detail: string };

const days = (n: number) => `${formatNumber(n)} jour${n > 1 ? "s" : ""}`;

/** Une phrase pour savoir où l'on en est : à jour, ancien, ou jamais reçu. */
export function stockState(input: { syncedAt: Date | null; lines: number | null; now: Date }): StockState {
  const { syncedAt, lines, now } = input;
  if (!syncedAt) {
    return { tone: "neutral", title: "Aucun stock reçu pour l'instant", detail: "Suivez les trois étapes ci-dessous : une minute suffit." };
  }
  const received = `${describeReceived(syncedAt, now)}${lines !== null ? ` (${formatNumber(lines)} ligne${lines > 1 ? "s" : ""})` : ""}`;
  if (stockReminderLevel(syncedAt, now) === "none") {
    return { tone: "success", title: "Votre stock est à jour", detail: `Reçu ${received}` };
  }
  return { tone: "warning", title: `Votre stock date de ${days(stockAgeDays(syncedAt, now) ?? 0)}`, detail: `Dernier stock reçu ${received}. Mettez-le à jour avec les trois étapes ci-dessous.` };
}

/** Un petit retard sépare la date du stock (écrite à l'application) de celle du dépôt (écrite juste après). */
const SAME_EVENT_MS = 10 * 60 * 1000;

/**
 * Le nombre de lignes du dernier stock reçu : celui du dépôt qui l'a produit.
 * Si le stock a été mis à jour autrement depuis (ancien assistant d'import),
 * le chiffre du dépôt ne dirait plus rien de juste : on ne l'affiche pas.
 */
export function linesOfLastStock(syncedAt: Date | null, deposits: Pick<DepositView, "status" | "lines" | "appliedAt" | "receivedAt">[]): number | null {
  if (!syncedAt) return null;
  const applied = deposits.find((deposit) => deposit.status === "APPLIED");
  if (!applied || applied.lines === null) return null;
  const at = applied.appliedAt ?? applied.receivedAt;
  return Math.abs(at.getTime() - syncedAt.getTime()) <= SAME_EVENT_MS ? applied.lines : null;
}

// --- Le statut en direct (étape 3) -------------------------------------------

export type LatestDeposit = { id: string; status: DepositStatus; lines: number | null; message: string | null; stalled?: boolean };

export type ReceiveState = "waiting" | "reading" | "interrupted" | "done" | "held" | "failed" | "rejected";

/**
 * Où en est l'envoi attendu ? `baseline` est le dernier dépôt connu à
 * l'ouverture de la page : tant que rien de plus récent n'arrive, on attend.
 * Un dépôt déjà en cours de lecture à l'ouverture compte comme celui qu'on
 * attend.
 *
 * « Plus récent » se juge sur le dépôt ET sur son statut : un fichier en
 * vérification ou en échec à l'ouverture, que l'équipe applique ensuite (même
 * dépôt, autre statut), est bien une nouveauté pour l'écran — de même qu'un
 * dépôt encore en lecture à l'ouverture, qui se termine. Quand une lecture
 * est restée bloquée (`stalled`), on ne fait pas tourner une roue pour rien :
 * l'état dit que la lecture s'est interrompue.
 */
export function receiveState(
  baseline: Pick<LatestDeposit, "id" | "status"> | null,
  latest: (Pick<LatestDeposit, "id" | "status"> & { stalled?: boolean }) | null,
): ReceiveState {
  if (!latest) return "waiting";
  if (latest.status === "RECEIVED") return latest.stalled ? "interrupted" : "reading";
  const isNew = !baseline || latest.id !== baseline.id || latest.status !== baseline.status;
  if (!isNew) return "waiting";
  if (latest.status === "APPLIED") return "done";
  if (latest.status === "HELD") return "held";
  if (latest.status === "FAILED") return "failed";
  return "rejected";
}

/**
 * Tant que l'envoi attendu n'est pas « à jour », la page continue de
 * s'actualiser : après une vérification, un échec ou un écart, le titulaire
 * renvoie un fichier corrigé (ou l'équipe applique l'ancien) et l'écran doit le
 * voir sans rechargement.
 */
export function isStillExpected(state: ReceiveState): boolean {
  return state !== "done";
}

/**
 * La page interroge-t-elle le serveur ? Pas quand elle a abandonné (plafond), ni
 * une fois le stock à jour. Sans dossier installé, rien n'arrive tout seul : on
 * n'attend rien tant qu'aucun fichier n'a été envoyé d'ici — mais dès qu'un
 * fichier est là (lecture, vérification, échec, écart), on suit son sort.
 */
export function shouldPoll(state: ReceiveState, options: { folderReady: boolean; gaveUp: boolean }): boolean {
  if (options.gaveUp || !isStillExpected(state)) return false;
  return options.folderReady || state !== "waiting";
}

export const RECEIVE_POLL_MS = 10_000;
/** Au-delà, on arrête de demander : un onglet oublié ne doit pas interroger le serveur toute la journée. */
export const RECEIVE_POLL_MAX_MS = 30 * 60 * 1000;

const RELOAD_HINT = "Rechargez la page pour vérifier de nouveau.";

export function receiveText(state: ReceiveState, latest: Pick<LatestDeposit, "lines"> | null, options: { folderReady: boolean; gaveUp: boolean }): string {
  const withHint = (text: string) => (options.gaveUp ? `${text} ${RELOAD_HINT}` : text);
  switch (state) {
    case "reading":
      return options.gaveUp ? `La lecture prend plus de temps que prévu. ${RELOAD_HINT}` : "Fichier reçu, lecture en cours…";
    case "interrupted":
      return withHint(INTERRUPTED_LINE);
    case "done":
      return latest && latest.lines !== null ? `Fichier reçu : ${formatNumber(latest.lines)} ligne${latest.lines > 1 ? "s" : ""}, stock à jour.` : "Fichier reçu, stock à jour.";
    case "held":
      return withHint("Fichier reçu : l'équipe PharmaBoost le vérifie, votre stock n'a pas changé.");
    case "failed":
      return withHint("Fichier reçu, mais impossible à lire. Votre stock n'a pas changé.");
    case "rejected":
      return withHint("Fichier écarté par l'équipe PharmaBoost. Votre stock n'a pas changé.");
    default:
      if (!options.folderReady) return "Quand vous envoyez votre fichier ci-dessous, PharmaBoost le lit dans la minute.";
      return options.gaveUp ? `Pas de fichier reçu pour l'instant. ${RELOAD_HINT}` : "En attente de votre fichier… cette page se met à jour toute seule.";
  }
}

// --- L'envoi du fichier ------------------------------------------------------

/** « 812 Ko », « 2,4 Mo ». */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

/** Ce qu'on peut dire avant même d'envoyer : le fichier est-il lisible, assez léger ? */
export function checkDepositFile(file: { name: string; size: number }): string | null {
  if (file.size === 0) return "Ce fichier est vide.";
  if (!DEPOSIT_ACCEPTED.test(file.name)) return `Ce format n'est pas lu. Formats acceptés : ${DEPOSIT_ACCEPTED_LABEL}.`;
  if (file.size > DEPOSIT_MAX_BYTES) return `Ce fichier fait ${formatFileSize(file.size)} : le maximum est de ${DEPOSIT_MAX_BYTES / (1024 * 1024)} Mo.`;
  return null;
}

export type SendOutcome = { tone: "success" | "warning" | "danger" | "info" | "neutral"; title: string; detail: string | null };

/** Vrai dans tous les cas de refus : fichier refusé avant l'envoi, serveur qui refuse, fichier illisible, panne. */
const NOT_SENT = "Votre stock n'a pas été mis à jour";

/** La réponse du serveur, dite au titulaire : réussi, en vérification, ou refusé avec la raison. */
export function sendOutcome(result: ActionResult<DepositView>): SendOutcome {
  if (!result.ok) return { tone: "danger", title: NOT_SENT, detail: result.error };
  const deposit = result.data;
  switch (deposit.status) {
    case "APPLIED":
      return { tone: "success", title: "Votre stock est à jour", detail: describeDepositResult(deposit) || null };
    case "HELD":
      return { tone: "warning", title: "Fichier reçu, en vérification", detail: HELD_NOTICE };
    case "FAILED":
      return { tone: "danger", title: "Fichier non lu", detail: `${deposit.message ?? "Le fichier n'a pas pu être lu."} Votre stock n'a pas changé.` };
    case "REJECTED":
      return { tone: "neutral", title: "Fichier écarté", detail: "Votre stock n'a pas changé." };
    default:
      return { tone: "info", title: "Fichier reçu", detail: "La lecture est en cours : votre stock se met à jour dans la minute." };
  }
}

/**
 * L'envoi, du fichier choisi à la phrase affichée. `sent` dit si le fichier
 * est parti (lu ou en vérification) : la zone peut alors se vider. Un fichier
 * refusé par le contrôle ne part pas ; une panne réseau n'est jamais une
 * exception qui remonte à l'écran.
 */
export async function submitDeposit(file: File, send: (body: FormData) => Promise<ActionResult<DepositView>>): Promise<{ outcome: SendOutcome; sent: boolean }> {
  const problem = checkDepositFile(file);
  if (problem) return { outcome: { tone: "danger", title: NOT_SENT, detail: problem }, sent: false };
  try {
    const body = new FormData();
    body.set("file", file);
    const result = await send(body);
    return { outcome: sendOutcome(result), sent: result.ok };
  } catch {
    return { outcome: { tone: "danger", title: NOT_SENT, detail: SEND_FAILED }, sent: false };
  }
}

// --- Vos derniers envois -----------------------------------------------------

export const DEPOSIT_TONES: Record<DepositStatus, "info" | "success" | "warning" | "danger" | "neutral"> = {
  RECEIVED: "info",
  APPLIED: "success",
  HELD: "warning",
  FAILED: "danger",
  REJECTED: "neutral",
};

/** La pastille d'un envoi : celle de son statut, sauf une lecture restée bloquée, qui ne se dit pas « en cours ». */
export function depositBadge(deposit: Pick<DepositView, "status" | "stalled">): { tone: (typeof DEPOSIT_TONES)[DepositStatus]; label: string } {
  if (deposit.status === "RECEIVED" && deposit.stalled) return { tone: "warning", label: "Lecture interrompue" };
  return { tone: DEPOSIT_TONES[deposit.status], label: DEPOSIT_STATUS_LABELS[deposit.status] };
}

/** Le résultat d'un envoi en une ligne. */
export function describeDepositLine(deposit: Pick<DepositView, "status" | "lines" | "created" | "updated" | "zeroed" | "invalid" | "message" | "stalled">): string {
  switch (deposit.status) {
    case "APPLIED":
      return describeDepositResult(deposit) || "Stock mis à jour.";
    case "RECEIVED":
      return deposit.stalled ? INTERRUPTED_LINE : "Lecture en cours…";
    case "HELD":
      return "L'équipe PharmaBoost le vérifie avant de l'appliquer.";
    case "FAILED":
      return deposit.message ?? "Le fichier n'a pas pu être lu.";
    default:
      return "Écarté par l'équipe PharmaBoost.";
  }
}
