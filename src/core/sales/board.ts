import { MANUAL_STATUSES, PROSPECT_STATUSES, PROSPECT_STATUS_LABELS, PROSPECT_STATUS_TONES, SYSTEM_STATUSES, isOpenStatus, type ProspectStatusCode } from "./pipeline";

/**
 * Le tableau du pipeline commercial : une colonne par étape, et les règles
 * qui décident où un dossier peut être déposé.
 *
 * Deux sortes de colonnes :
 *   - les étapes MANUELLES (prospection, démonstration, proposition, perdu) :
 *     on y dépose un dossier à la main ;
 *   - les étapes AUTOMATIQUES (contrat envoyé, contrat signé, compte créé,
 *     activé) : elles découlent d'un fait (envoi, signature, création de
 *     l'officine) et refusent tout dépôt.
 *
 * Module pur : ni base, ni horloge implicite (l'instant présent est toujours
 * passé en paramètre), utilisable côté serveur comme dans le navigateur.
 */

export type BoardColumnKind = "manual" | "system";

export type BoardColumn = {
  status: ProspectStatusCode;
  label: string;
  tone: (typeof PROSPECT_STATUS_TONES)[ProspectStatusCode];
  kind: BoardColumnKind;
  /** Une phrase : ce que signifie l'étape. */
  hint: string;
};

/** Le message affiché quand on tente de déposer un dossier dans une étape automatique. */
export const SYSTEM_DROP_REFUSAL = "Étape automatique : contrat, signature, activation.";

const COLUMN_HINTS: Record<ProspectStatusCode, string> = {
  PROSPECT: "Repérée, pas encore contactée.",
  CONTACTED: "Un premier échange a eu lieu.",
  DEMO_SCHEDULED: "Démonstration fixée à une date.",
  DEMO_DONE: "Démonstration faite, décision attendue.",
  INTERESTED: "L'officine veut aller plus loin.",
  PROPOSAL_SENT: "Proposition commerciale transmise.",
  CONTRACT_SENT: "Contrat parti en signature.",
  CONTRACT_SIGNED: "Contrat signé par les deux parties.",
  PHARMACY_CREATED: "Espace officine créé.",
  ACTIVATED: "Officine active sur PharmaBoost.",
  LOST: "Dossier clos sans suite.",
};

export const BOARD_COLUMNS: BoardColumn[] = PROSPECT_STATUSES.map((status) => ({
  status,
  label: PROSPECT_STATUS_LABELS[status],
  tone: PROSPECT_STATUS_TONES[status],
  kind: SYSTEM_STATUSES.includes(status) ? "system" : "manual",
  hint: COLUMN_HINTS[status],
}));

/** Contrats qui portent l'étape du dossier : tant qu'il en existe un, l'étape découle du contrat. */
export const LOCKING_CONTRACT_STATUSES = ["SENT", "OPENED", "SIGNED_PHARMACY", "SIGNED_COMPANY", "FINALIZED"] as const;

/** Libellé de la tâche créée dans l'agenda du commercial pour une démonstration. */
export const DEMO_TASK_LABEL = "Démonstration";

/** Libellé que prend cette tâche quand la démonstration est annulée : close, jamais supprimée. */
export const DEMO_TASK_CANCELED_LABEL = "Démonstration (annulée)";

export function isProspectStatus(value: unknown): value is ProspectStatusCode {
  return typeof value === "string" && (PROSPECT_STATUSES as readonly string[]).includes(value);
}

/** Lit un statut passé dans l'adresse : « CONTACTED », « contacted » ou « demo-scheduled ». */
export function parseStatusParam(value: string | null | undefined): ProspectStatusCode | null {
  if (!value) return null;
  const code = value.trim().toUpperCase().replace(/-/g, "_");
  return isProspectStatus(code) ? code : null;
}

export type DropCard = { status: string; contractStatus?: string | null };

export type DropDecision =
  /** Dépôt accepté ; `needs` dit ce qu'il faut demander avant de déplacer. */
  | { ok: true; needs: "reason" | "demo" | null }
  /** Dépôt refusé ; `silent` : rien à expliquer (même colonne). */
  | { ok: false; reason: string; silent?: boolean };

/**
 * Peut-on déposer ce dossier dans cette étape ? La même règle sert au
 * glisser-déposer, au menu « Déplacer vers… » et, côté serveur, à l'action
 * qui enregistre le déplacement.
 */
export function dropDecision(card: DropCard, to: string): DropDecision {
  if (!isProspectStatus(to)) return { ok: false, reason: "Étape inconnue." };
  if (card.status === to) return { ok: false, reason: "Le dossier est déjà à cette étape.", silent: true };
  if (!MANUAL_STATUSES.includes(to)) return { ok: false, reason: SYSTEM_DROP_REFUSAL };
  const from = card.status as ProspectStatusCode;
  // Une fois le contrat parti, le dossier ne revient pas en prospection : il
  // se signe, se refuse, ou se déclare perdu.
  if (SYSTEM_STATUSES.includes(from) && to !== "LOST") {
    return { ok: false, reason: "Un contrat est en cours ou signé : le dossier ne revient pas en prospection. Il peut seulement être déclaré perdu." };
  }
  if (from === "LOST" && card.contractStatus && (LOCKING_CONTRACT_STATUSES as readonly string[]).includes(card.contractStatus)) {
    return { ok: false, reason: "Un contrat est en cours ou signé pour ce dossier : son étape découle du contrat." };
  }
  return { ok: true, needs: to === "LOST" ? "reason" : to === "DEMO_SCHEDULED" ? "demo" : null };
}

/** Les entrées du menu « Déplacer vers… » d'une carte : chaque étape, permise ou non, avec la raison. */
export function moveTargets(card: DropCard): { status: ProspectStatusCode; label: string; decision: DropDecision }[] {
  return BOARD_COLUMNS.filter((column) => column.status !== card.status).map((column) => ({ status: column.status, label: column.label, decision: dropDecision(card, column.status) }));
}

/** L'étape après une démonstration programmée, ou `null` si elle ne change pas. */
export function statusAfterDemoScheduled(from: string, contractStatus?: string | null): ProspectStatusCode | null {
  if (from === "DEMO_SCHEDULED") return null;
  return dropDecision({ status: from, contractStatus }, "DEMO_SCHEDULED").ok ? "DEMO_SCHEDULED" : null;
}

/**
 * L'étape après une démonstration réalisée. Marquée depuis la liste des
 * démos, elle ne fait pas reculer un dossier déjà plus loin (intéressé,
 * proposition) ; déposée explicitement dans la colonne, elle s'applique.
 */
export function statusAfterDemoDone(from: string, explicit = false): ProspectStatusCode | null {
  if (from === "DEMO_DONE") return null;
  if (explicit) return MANUAL_STATUSES.includes(from as ProspectStatusCode) ? "DEMO_DONE" : null;
  return from === "PROSPECT" || from === "CONTACTED" || from === "DEMO_SCHEDULED" ? "DEMO_DONE" : null;
}

/**
 * Une démo annulée rend au dossier l'étape qu'il avait avant sa programmation
 * (`before`, lue dans son historique), s'il attendait cette démo ; à défaut
 * d'historique lisible, « Contacté ». Sinon l'étape ne bouge pas.
 */
export function statusAfterDemoCanceled(from: string, before?: string | null): ProspectStatusCode | null {
  if (from !== "DEMO_SCHEDULED") return null;
  if (before && before !== "DEMO_SCHEDULED" && MANUAL_STATUSES.includes(before as ProspectStatusCode)) return before as ProspectStatusCode;
  return "CONTACTED";
}

// ---- Étape, côté commercial (extranet) ------------------------------------------

export type SalesRepStagePill = { status: ProspectStatusCode; current: boolean; enabled: boolean };

/**
 * Les pastilles d'étape de la fiche dossier de l'extranet, et ce qu'elles
 * permettent. Mêmes règles que le serveur (`canSalesRepSetStatus`) : depuis
 * une étape manuelle, le commercial pose n'importe quelle autre étape
 * manuelle — démo programmée ou réalisée comprises. Deux exceptions :
 *   - « Démo programmée » exige une date et une heure, que l'administrateur
 *     fixe depuis la console : la pastille n'apparaît que pour montrer
 *     l'étape en cours, jamais pour la poser sans date ;
 *   - un dossier perdu ne se rouvre pas d'une pression (« Perdu » a son bouton).
 * `followsContract` : l'étape découle du contrat ou de l'officine.
 */
export function salesRepStagePills(current: string): { pills: SalesRepStagePill[]; followsContract: boolean } {
  const code = current as ProspectStatusCode;
  const editable = MANUAL_STATUSES.includes(code) && code !== "LOST";
  const pills = MANUAL_STATUSES.filter((status) => status !== "LOST" && (status !== "DEMO_SCHEDULED" || status === code)).map((status) => ({
    status,
    current: status === code,
    enabled: editable && status !== code && status !== "DEMO_SCHEDULED",
  }));
  return { pills, followsContract: SYSTEM_STATUSES.includes(code) };
}

// ---- Jours (fuseau de Paris) -------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_KEY = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });

type DateLike = Date | string;

function toDate(value: DateLike): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Le jour calendaire à Paris : « 2026-10-03 ». */
export function parisDayKey(value: DateLike): string {
  return DAY_KEY.format(toDate(value));
}

/** Écart en jours calendaires entre deux clés de jour (positif si `to` est après `from`). */
export function dayKeyDiff(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS);
}

export type DayBucket = "retard" | "aujourdhui" | "a-venir";

/** Une échéance par rapport à aujourd'hui (jour de Paris) : passée, du jour, ou à venir. */
export function dayBucket(due: DateLike, now: DateLike): DayBucket {
  const diff = dayKeyDiff(parisDayKey(now), parisDayKey(due));
  return diff < 0 ? "retard" : diff === 0 ? "aujourdhui" : "a-venir";
}

/** Nombre de jours de retard (0 si l'échéance est aujourd'hui ou plus tard). */
export function daysLate(due: DateLike, now: DateLike): number {
  return Math.max(0, dayKeyDiff(parisDayKey(due), parisDayKey(now)));
}

/** Une prochaine action est dépassée quand son jour est passé. */
export function isOverdue(due: DateLike | null | undefined, now: DateLike): boolean {
  return Boolean(due) && dayBucket(due as DateLike, now) === "retard";
}

/** Jours d'essai restants, arrondis au jour supérieur ; jamais négatif. */
export function trialDaysLeft(trialEndsAt: DateLike | null | undefined, now: DateLike): number | null {
  if (!trialEndsAt) return null;
  return Math.max(0, Math.ceil((toDate(trialEndsAt).getTime() - toDate(now).getTime()) / DAY_MS));
}

/** Une démonstration se programme aujourd'hui ou plus tard, au plus un an à l'avance. */
export function validateDemoDate(at: Date, now: Date): { ok: true } | { ok: false; error: string } {
  if (Number.isNaN(at.getTime())) return { ok: false, error: "Indiquez une date et une heure valides." };
  if (dayKeyDiff(parisDayKey(now), parisDayKey(at)) < 0) return { ok: false, error: "Cette date est passée : choisissez aujourd'hui ou une date à venir." };
  if (at.getTime() - now.getTime() > 366 * DAY_MS) return { ok: false, error: "Une démonstration se programme au plus un an à l'avance." };
  return { ok: true };
}

/** Une relance se fixe aujourd'hui ou plus tard, au plus deux ans à l'avance. */
export function validateFollowUpDate(due: Date, now: Date): { ok: true } | { ok: false; error: string } {
  if (Number.isNaN(due.getTime())) return { ok: false, error: "Indiquez une date valide." };
  if (dayKeyDiff(parisDayKey(now), parisDayKey(due)) < 0) return { ok: false, error: "Cette date est passée : choisissez aujourd'hui ou une date à venir." };
  if (due.getTime() - now.getTime() > 731 * DAY_MS) return { ok: false, error: "Une relance se fixe au plus deux ans à l'avance." };
  return { ok: true };
}

/** La prochaine action d'un dossier : la plus proche des candidates (relances ouvertes, action du dossier). */
export function pickNextAction(candidates: ({ at: Date; label: string } | null | undefined)[]): { at: Date | null; label: string | null } {
  let best: { at: Date; label: string } | null = null;
  for (const candidate of candidates) {
    if (!candidate || Number.isNaN(candidate.at.getTime())) continue;
    if (!best || candidate.at.getTime() < best.at.getTime()) best = candidate;
  }
  return best ? { at: best.at, label: best.label } : { at: null, label: null };
}

// ---- Cartes et colonnes --------------------------------------------------------

export type SortableCard = {
  name: string;
  status: string;
  nextActionAt: DateLike | null;
  demoAt: DateLike | null;
  updatedAt: DateLike;
};

const time = (value: DateLike | null | undefined): number | null => (value ? toDate(value).getTime() : null);

/**
 * L'ordre des cartes dans une colonne : d'abord les relances dépassées (la
 * plus ancienne en tête), puis — en « Démo programmée » — la démo la plus
 * proche, puis la prochaine action la plus proche, enfin les dossiers
 * récemment modifiés.
 */
export function compareCards(a: SortableCard, b: SortableCard, now: DateLike): number {
  const lateA = isOverdue(a.nextActionAt, now);
  const lateB = isOverdue(b.nextActionAt, now);
  if (lateA !== lateB) return lateA ? -1 : 1;
  if (a.status === "DEMO_SCHEDULED" && b.status === "DEMO_SCHEDULED") {
    const byDemo = compareNullableAsc(time(a.demoAt), time(b.demoAt));
    if (byDemo !== 0) return byDemo;
  }
  const byNext = compareNullableAsc(time(a.nextActionAt), time(b.nextActionAt));
  if (byNext !== 0) return byNext;
  const byUpdate = (time(b.updatedAt) ?? 0) - (time(a.updatedAt) ?? 0);
  if (byUpdate !== 0) return byUpdate;
  return a.name.localeCompare(b.name, "fr");
}

/** Croissant, les valeurs absentes en dernier. */
function compareNullableAsc(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

export type BoardColumnView<T> = BoardColumn & { cards: T[]; count: number; overdue: number };

/** Range les cartes par colonne, triées, avec le nombre de dossiers et de relances dépassées par colonne. */
export function buildBoard<T extends SortableCard>(cards: T[], now: DateLike): BoardColumnView<T>[] {
  return BOARD_COLUMNS.map((column) => {
    const inColumn = cards.filter((card) => card.status === column.status).sort((a, b) => compareCards(a, b, now));
    return { ...column, cards: inColumn, count: inColumn.length, overdue: isOpenStatus(column.status) ? inColumn.filter((card) => isOverdue(card.nextActionAt, now)).length : 0 };
  });
}

// ---- Relances ---------------------------------------------------------------------

export type FollowUpTaskInput = {
  id: string;
  label: string;
  dueAt: Date;
  salesRep: { id: string; firstName: string; lastName: string } | null;
  prospect: { id: string; name: string; city: string | null; status: string };
};

export type FollowUpDossierInput = {
  id: string;
  name: string;
  city: string | null;
  status: string;
  nextActionAt: Date;
  nextActionLabel: string | null;
  salesRep: { id: string; firstName: string; lastName: string } | null;
  /** Le dossier a au moins une relance ouverte : son action est déjà portée par elle. */
  hasOpenTask: boolean;
};

export type FollowUpItem = {
  key: string;
  /** « task » : une relance de l'agenda d'un commercial ; « dossier » : la prochaine action d'un dossier sans relance ouverte. */
  kind: "task" | "dossier";
  taskId: string | null;
  prospectId: string;
  prospectName: string;
  city: string | null;
  prospectStatus: string;
  salesRep: { id: string; name: string } | null;
  label: string;
  dueAt: Date;
  bucket: DayBucket;
  daysLate: number;
};

/**
 * La liste des relances, tous commerciaux : les relances ouvertes de leurs
 * agendas, plus la prochaine action des dossiers qui n'en ont pas (dossiers
 * de la console, demandes du site). Un dossier n'apparaît jamais deux fois
 * pour la même chose ; les dossiers clos (activés, perdus) n'apparaissent pas.
 */
export function buildFollowUps(input: { tasks: FollowUpTaskInput[]; dossiers: FollowUpDossierInput[] }, now: DateLike): FollowUpItem[] {
  const rep = (r: { id: string; firstName: string; lastName: string } | null) => (r ? { id: r.id, name: `${r.firstName} ${r.lastName}` } : null);
  const items: FollowUpItem[] = [];
  for (const task of input.tasks) {
    if (!isOpenStatus(task.prospect.status as ProspectStatusCode)) continue;
    items.push({ key: `task:${task.id}`, kind: "task", taskId: task.id, prospectId: task.prospect.id, prospectName: task.prospect.name, city: task.prospect.city, prospectStatus: task.prospect.status, salesRep: rep(task.salesRep), label: task.label, dueAt: task.dueAt, bucket: dayBucket(task.dueAt, now), daysLate: daysLate(task.dueAt, now) });
  }
  for (const dossier of input.dossiers) {
    if (dossier.hasOpenTask || !isOpenStatus(dossier.status as ProspectStatusCode)) continue;
    items.push({ key: `dossier:${dossier.id}`, kind: "dossier", taskId: null, prospectId: dossier.id, prospectName: dossier.name, city: dossier.city, prospectStatus: dossier.status, salesRep: rep(dossier.salesRep), label: dossier.nextActionLabel ?? "Relancer", dueAt: dossier.nextActionAt, bucket: dayBucket(dossier.nextActionAt, now), daysLate: daysLate(dossier.nextActionAt, now) });
  }
  return items.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || a.prospectName.localeCompare(b.prospectName, "fr"));
}

export type DemoBucket = "aujourdhui" | "a-venir" | "passees";

/** Une démonstration par rapport à aujourd'hui (jour de Paris). */
export function demoBucket(demoAt: DateLike, now: DateLike): DemoBucket {
  const bucket = dayBucket(demoAt, now);
  return bucket === "retard" ? "passees" : bucket;
}

/** Valeur proposée dans la fenêtre d'une démo : demain, 10 h, heure de Paris (« AAAA-MM-JJTHH:mm », lue par `parisInputToDate`). */
export function defaultDemoInput(now: DateLike): string {
  return `${parisDayKey(new Date(toDate(now).getTime() + DAY_MS))}T10:00`;
}

/** Échéance proposée pour une relance : demain (jour de Paris), au format « AAAA-MM-JJ ». */
export function defaultFollowUpInput(now: DateLike): string {
  return parisDayKey(new Date(toDate(now).getTime() + DAY_MS));
}

// ---- Saisies à l'heure de Paris ------------------------------------------------
//
// Les dates et heures de démo et de relance se saisissent à l'heure de Paris,
// quel que soit le fuseau du navigateur : c'est l'heure affichée partout
// (liste, cockpit, fiche, message au commercial). Un champ « date et heure »
// du navigateur, lu tel quel, prendrait l'heure locale de l'administrateur.

/** Heure à laquelle une relance tombe dans l'agenda : 9 h, heure de Paris. */
export const FOLLOW_UP_TIME = "09:00";

const PARIS_PARTS = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

function parisParts(instant: number) {
  const parts = PARIS_PARTS.formatToParts(new Date(instant));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { year: part("year"), month: part("month"), day: part("day"), hour: part("hour") === "24" ? "00" : part("hour"), minute: part("minute"), second: part("second") };
}

/** Décalage de Paris à cet instant, en millisecondes (+1 h l'hiver, +2 h l'été). */
function parisOffsetMs(instant: number): number {
  const p = parisParts(instant);
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - Math.floor(instant / 1000) * 1000;
}

/** Un instant en saisie « date et heure », à l'heure de Paris : « 2026-10-05T14:30 ». */
export function toParisInput(value: DateLike): string {
  const p = parisParts(toDate(value).getTime());
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

const INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Une saisie « AAAA-MM-JJTHH:mm » lue à l'heure de Paris, changement d'heure
 * compris ; `null` si elle est illisible ou désigne un jour qui n'existe pas.
 * Le décalage est relu à l'instant trouvé : le jour d'un changement d'heure,
 * celui de minuit UTC n'est pas celui de l'heure saisie.
 */
export function parisInputToDate(value: string | null | undefined): Date | null {
  const match = INPUT_PATTERN.exec(value?.trim() ?? "");
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (hour > 23 || minute > 59) return null;
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(naive);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  const first = naive - parisOffsetMs(naive);
  return new Date(naive - parisOffsetMs(first));
}

/** Une saisie « AAAA-MM-JJ » à l'heure donnée de Paris (9 h par défaut) ; `null` si invalide. */
export function parisDayInputToDate(day: string | null | undefined, time: string = FOLLOW_UP_TIME): Date | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(day?.trim() ?? "") ? parisInputToDate(`${day?.trim()}T${time}`) : null;
}

/** Le jour de Paris dans `days` jours, au format « AAAA-MM-JJ » (préréglages « dans 2 jours », « dans 1 semaine »). */
export function parisDayInDays(now: DateLike, days: number): string {
  const today = parisDayKey(now);
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
