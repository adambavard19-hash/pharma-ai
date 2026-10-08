import type { DepositDecision, DepositSource, DepositStatus } from "./types";

/** Plafond d'un fichier envoyé par le titulaire ou déposé par l'équipe : celui de l'import du stock depuis l'écran Stock. */
export const DEPOSIT_MAX_BYTES = 8 * 1024 * 1024;
/**
 * Plafond d'un export envoyé par le dossier PharmaBoost du serveur : un export
 * complet d'un gros logiciel dépasse 8 Mo. Même valeur que `AGENT_FILE_MAX_BYTES`
 * (le garde-fou de la route de l'agent) : la route et le moteur disent pareil.
 */
export const DEPOSIT_AGENT_MAX_BYTES = 25 * 1024 * 1024;
export const DEPOSIT_ACCEPTED = /\.(csv|txt|xlsx|xls|pdf)$/i;
export const DEPOSIT_ACCEPTED_LABEL = "CSV, Excel (.xlsx) ou PDF d'inventaire";
/** Le fichier d'origine est gardé 90 jours, puis supprimé ; la ligne d'historique reste. */
export const DEPOSIT_RETENTION_DAYS = 90;
/** Un fichier qui contient moins de 80 % du stock connu n'est pas appliqué tout seul (un stock complet remet à 0 tout ce qu'il ne mentionne pas)… */
export const DEPOSIT_HOLD_RATIO = 0.8;
/** … mais seulement quand le stock connu est assez gros pour que la comparaison ait un sens. */
export const DEPOSIT_HOLD_MIN_KNOWN = 50;
/** Envois par officine et par jour : bien au-dessus d'un usage normal. */
export const DEPOSIT_DAILY_LIMIT = 30;
/** Le même fichier renvoyé dans les deux minutes est un double clic, pas un nouvel envoi. */
export const DEPOSIT_DOUBLE_SEND_MS = 2 * 60 * 1000;
/** Un autre fichier de la même officine encore en lecture depuis moins de 5 minutes : on n'en lit pas deux à la fois. */
export const DEPOSIT_IN_FLIGHT_MS = 5 * 60 * 1000;
/** Un fichier agent resté en échec est dédoublonné pendant 24 h : l'agent le renvoie toutes les 5 minutes. */
export const DEPOSIT_FAILED_REPLAY_MS = 24 * 60 * 60 * 1000;
/** Un dépôt encore « en cours » après 10 minutes est bloqué : on le dit, et l'équipe peut le relancer. */
export const DEPOSIT_STALLED_MS = 10 * 60 * 1000;
/** Au passage quotidien, un dépôt « en cours » depuis plus de 15 minutes est refermé en échec. */
export const DEPOSIT_ABANDONED_MS = 15 * 60 * 1000;
/** Lignes illisibles tolérées : jusqu'à 5, ou 2 % des lignes du fichier si c'est plus. */
/**
 * Passage à zéro massif : un fichier qui couvre 80 % du stock mais laisserait plus de 25 produits ET plus de 5 % du
 * stock connu à zéro n'est pas appliqué sans contrôle. Il attend la décision de l'équipe (stock complet, ou fichier partiel).
 */
export const DEPOSIT_ABSENT_MIN = 25;
export const DEPOSIT_ABSENT_PERCENT = 5;

export const DEPOSIT_INVALID_MIN = 5;
export const DEPOSIT_INVALID_PERCENT = 2;

/** Le plafond de taille selon l'origine : l'agent peut envoyer un export de 25 Mo, les autres 8 Mo. */
export function depositMaxBytes(source: DepositSource): number {
  return source === "AGENT" ? DEPOSIT_AGENT_MAX_BYTES : DEPOSIT_MAX_BYTES;
}

export function depositMaxLabel(source: DepositSource): string {
  return `${depositMaxBytes(source) / (1024 * 1024)} Mo`;
}

/** Reçu depuis plus de 10 minutes et toujours « en cours » : le traitement a été interrompu. */
export function isDepositStalled(deposit: { status: DepositStatus; receivedAt: Date }, now: Date): boolean {
  return deposit.status === "RECEIVED" && now.getTime() - deposit.receivedAt.getTime() > DEPOSIT_STALLED_MS;
}

/** Message d'un envoi remplacé par un envoi plus récent, ou refus de le rejouer. */
export const DEPOSIT_SUPERSEDED_MESSAGE = "Remplacé par un envoi plus récent.";
export const DEPOSIT_SUPERSEDED_ERROR = "Un envoi plus récent a déjà mis le stock à jour : écartez ce fichier.";
export const DEPOSIT_INTERRUPTED_MESSAGE = "Le traitement a été interrompu avant la fin. Le stock n'a pas changé : renvoyez le fichier.";

/** Ce que l'écran envoie pour dire « oui, ce fichier remplace mon stock » : sans lui, le serveur refuse l'envoi du titulaire. */
export const DEPOSIT_CONFIRMATION = "remplacer";

export type DepositAssessment = { verdict: "APPLY" } | { verdict: "HOLD"; reason: string };

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("fr-FR")} ${n > 1 ? many : one}`;

/**
 * Le fichier est-il à appliquer tout de suite ? Oui, sauf quand l'appliquer en
 * « stock complet » mettrait à 0 des produits qui sont en rayon. Il attend
 * alors la décision de l'équipe, et le stock ne bouge pas :
 *
 * 1. le fichier n'a pas été lu en entier (pages illisibles, plafond atteint) :
 *    ce qui n'a pas été lu serait remis à 0 ;
 * 2. trop de lignes illisibles (plus de 5, et plus de 2 % du fichier) : leurs
 *    produits, absents des lignes lues, seraient remis à 0 ;
 * 3. le fichier couvre moins de 80 % du stock connu (par exemple seulement les
 *    nouveautés, ou un seul rayon) ;
 * 4. le fichier couvre plus de 80 % du stock, mais en laisserait plus de 25 produits
 *    et plus de 5 % à zéro : un passage à zéro massif ne se fait pas sans contrôle.
 */
export function assessDeposit(input: { validLines: number; knownLines: number; invalidLines?: number; incompleteReason?: string | null; absentLines?: number }): DepositAssessment {
  const { validLines, knownLines, invalidLines = 0, incompleteReason = null, absentLines = 0 } = input;
  if (incompleteReason) {
    return { verdict: "HOLD", reason: `${incompleteReason} : le stock n'a pas été appliqué. Appliquer ce fichier en stock complet mettrait à 0 les produits qui n'ont pas été lus.` };
  }
  if (invalidLines > DEPOSIT_INVALID_MIN && invalidLines * 100 > (validLines + invalidLines) * DEPOSIT_INVALID_PERCENT) {
    return {
      verdict: "HOLD",
      reason: `${plural(invalidLines, "ligne du fichier est illisible", "lignes du fichier sont illisibles")} : le stock n'a pas été appliqué. Appliquer ce fichier en stock complet mettrait à 0 les produits de ces lignes.`,
    };
  }
  // En entiers : 160 lignes sur 200 connues, c'est exactement 80 %, et cela passe.
  if (knownLines >= DEPOSIT_HOLD_MIN_KNOWN && validLines * 100 < knownLines * Math.round(DEPOSIT_HOLD_RATIO * 100)) {
    return {
      verdict: "HOLD",
      reason: `Le fichier contient ${validLines} ligne${validLines > 1 ? "s" : ""} valide${validLines > 1 ? "s" : ""}, alors que le stock de l'officine en compte ${knownLines} : moins de ${Math.round(DEPOSIT_HOLD_RATIO * 100)} % du stock connu. Il n'a pas été appliqué : est-ce un stock complet ?`,
    };
  }
  // 4. un fichier assez complet, mais qui remettrait à 0 beaucoup de produits connus : contrôle avant d'écrire.
  if (knownLines >= DEPOSIT_HOLD_MIN_KNOWN && absentLines > DEPOSIT_ABSENT_MIN && absentLines * 100 > knownLines * DEPOSIT_ABSENT_PERCENT) {
    const percent = Math.round((absentLines * 100) / knownLines);
    return {
      verdict: "HOLD",
      reason: `Appliquer ce fichier mettrait ${plural(absentLines, "produit", "produits")} à 0 (${percent} % du stock connu), parce qu'ils n'y figurent pas : le stock n'a pas été appliqué. Est-ce bien votre stock complet ?`,
    };
  }
  return { verdict: "APPLY" };
}

/** Ce que voit le titulaire. */
export const DEPOSIT_STATUS_LABELS: Record<DepositStatus, string> = {
  RECEIVED: "Reçu, en cours de lecture",
  APPLIED: "Stock à jour",
  HELD: "En vérification par l'équipe PharmaBoost",
  FAILED: "Fichier non lu, stock inchangé",
  REJECTED: "Fichier écarté, stock inchangé",
};

/** Ce que voit la console. */
export const DEPOSIT_CONSOLE_LABELS: Record<DepositStatus, string> = {
  RECEIVED: "En cours",
  APPLIED: "Appliqué",
  HELD: "À trancher",
  FAILED: "En échec",
  REJECTED: "Écarté",
};

/** Le jour limite : un fichier reçu avant cette date n'a plus à être conservé. */
export function retentionCutoff(now: Date): Date {
  return new Date(now.getTime() - DEPOSIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

/** « 4 235 lignes lues : 12 créées, 4 190 mises à jour, 33 produits absents du fichier, mis à 0. » */
export function describeDepositResult(d: { lines: number | null; created: number | null; updated: number | null; zeroed: number | null; invalid: number | null }): string {
  if (d.lines === null) return "";
  const parts = [`${plural(d.lines, "ligne lue", "lignes lues")}`];
  const detail: string[] = [];
  if (d.created) detail.push(plural(d.created, "créée", "créées"));
  if (d.updated) detail.push(plural(d.updated, "mise à jour", "mises à jour"));
  if (d.zeroed) detail.push(plural(d.zeroed, "produit absent du fichier, mis à 0", "produits absents du fichier, mis à 0"));
  if (d.invalid) detail.push(plural(d.invalid, "ignorée", "ignorées"));
  return detail.length ? `${parts[0]} : ${detail.join(", ")}.` : `${parts[0]}.`;
}

export const DEPOSIT_SOURCE_LABELS: Record<DepositSource, string> = {
  WEB: "Envoyé par le titulaire",
  AGENT: "Dossier PharmaBoost (petit facteur)",
  CONSOLE: "Déposé par l'équipe",
};

/** Le rappel au titulaire : doux à partir de 3 jours sans stock reçu, appuyé à partir de 7. */
export const STOCK_STALE_SOFT_DAYS = 3;
export const STOCK_STALE_STRONG_DAYS = 7;

export type StockReminderLevel = "none" | "soft" | "strong";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Âge du dernier stock reçu, en jours entiers ; `null` si l'officine n'a jamais envoyé de stock. */
export function stockAgeDays(syncedAt: Date | null, now: Date): number | null {
  if (!syncedAt) return null;
  return Math.max(0, Math.floor((now.getTime() - syncedAt.getTime()) / DAY_MS));
}

/** `none` tant que le stock est récent ; jamais envoyé = appuyé. */
export function stockReminderLevel(syncedAt: Date | null, now: Date): StockReminderLevel {
  const days = stockAgeDays(syncedAt, now);
  if (days === null || days >= STOCK_STALE_STRONG_DAYS) return "strong";
  if (days >= STOCK_STALE_SOFT_DAYS) return "soft";
  return "none";
}

/** Ce que l'équipe décide d'un fichier en attente, en clair (journal de la console). */
export const DEPOSIT_DECISION_LABELS: Record<DepositDecision, string> = {
  APPLY_FULL: "Appliqué (stock complet)",
  APPLY_PARTIAL: "Appliqué sans remise à zéro",
  REJECT: "Écarté",
};

/**
 * Le nom du fichier tel qu'on le garde et l'affiche : sans chemin (un poste
 * Windows envoie parfois « C:\\…\\stock.csv »), sans caractère de contrôle,
 * borné.
 */
export function cleanDepositFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return clean.slice(0, 200) || "stock";
}

/** Un nom sûr pour la clé de stockage : lettres, chiffres, point, tiret, souligné — rien d'autre. */
export function storageSafeName(name: string): string {
  const safe = cleanDepositFileName(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    // « stock..csv » ne garde qu'un point : une clé de stockage n'a jamais deux points de suite.
    .replace(/\.{2,}/g, ".")
    .replace(/^[._]+/, "")
    .slice(0, 120);
  return safe || "stock";
}

/** `stock-deposits/<officine>/<dépôt>/<nom>` : la clé ne dépend que de l'officine et du dépôt. */
export function depositStorageKey(pharmacyId: string, depositId: string, fileName: string): string {
  return `${depositStoragePrefix(pharmacyId, depositId)}${storageSafeName(fileName)}`;
}

export function depositStoragePrefix(pharmacyId: string, depositId: string): string {
  return `stock-deposits/${pharmacyId}/${depositId}/`;
}

/** Une clé relue en base n'ouvre le fichier que si elle est bien celle de CE dépôt de CETTE officine. */
export function isDepositStorageKey(key: string, pharmacyId: string, depositId: string): boolean {
  // Ce sont les segments « .. » et « . » qui remontent d'un dossier, pas les points d'un nom (« stock..csv »).
  return !key.split("/").some((segment) => segment === ".." || segment === ".") && key.startsWith(depositStoragePrefix(pharmacyId, depositId));
}

const MIME_BY_EXTENSION: Record<string, string> = {
  csv: "text/csv",
  txt: "text/plain",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  pdf: "application/pdf",
};

export function depositMimeType(fileName: string): string {
  return MIME_BY_EXTENSION[fileName.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}
