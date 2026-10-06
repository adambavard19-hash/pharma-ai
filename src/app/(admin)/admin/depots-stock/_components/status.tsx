import { Badge } from "@/components/ui/badge";
import { DEPOSIT_CONSOLE_LABELS, stockReminderLevel } from "@/core/stock-deposit/rules";
import type { DepositStatus } from "@/core/stock-deposit/types";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const STATUS_TONES: Record<DepositStatus, Tone> = {
  RECEIVED: "info",
  APPLIED: "success",
  HELD: "warning",
  FAILED: "danger",
  REJECTED: "neutral",
};

export const STALLED_LABEL = "Lecture interrompue";
/** Ce que la console dit d'un fichier resté « en cours » : la lecture ne reprendra pas toute seule. */
export const STALLED_MESSAGE = "La lecture de ce fichier s'est arrêtée avant la fin : « Relancer » le relit depuis le fichier gardé.";
/** Un envoi ou une relance dont la réponse n'est jamais revenue (coupure, délai dépassé) : la page reste, le geste se refait. */
export const SEND_FAILED_MESSAGE = "L'envoi n'a pas abouti. Réessayez.";

/**
 * L'état d'un fichier reçu, avec sa couleur : orange = l'équipe doit trancher,
 * rouge = le fichier n'a pas pu être lu. Un fichier « en cours » depuis trop
 * longtemps (`stalled`) n'est plus en cours : la lecture a été interrompue.
 */
export function DepositStatusBadge({ status, stalled = false }: { status: DepositStatus; stalled?: boolean }) {
  if (stalled && status === "RECEIVED") return <Badge tone="danger">{STALLED_LABEL}</Badge>;
  return <Badge tone={STATUS_TONES[status]}>{DEPOSIT_CONSOLE_LABELS[status]}</Badge>;
}

export type Freshness = { tone: "success" | "warning" | "danger"; label: string };

/**
 * La fraîcheur du stock d'une officine : vert avant 3 jours, orange de 3 à
 * 6 jours, rouge à partir de 7 jours ou quand rien n'est jamais arrivé. Les
 * seuils sont ceux du rappel envoyé au titulaire : l'équipe voit ce qu'il voit.
 */
export function stockFreshness(syncedAt: Date | null, now: Date): Freshness {
  if (!syncedAt) return { tone: "danger", label: "Jamais reçu" };
  const level = stockReminderLevel(syncedAt, now);
  if (level === "none") return { tone: "success", label: "À jour" };
  if (level === "soft") return { tone: "warning", label: "À rafraîchir" };
  return { tone: "danger", label: "Trop ancien" };
}

export function FreshnessBadge({ syncedAt, now }: { syncedAt: Date | null; now: Date }) {
  const { tone, label } = stockFreshness(syncedAt, now);
  return <Badge tone={tone}>{label}</Badge>;
}

/** Ce que montre la liste des fichiers : ce qui attend l'équipe, ou tout. */
export type FilesFilter = "attention" | "tous";

/** La vue demandée par l'adresse (`?etat=`) ; sans valeur valable, on ouvre sur « À trancher » s'il y en a, sinon sur « Tous ». */
export function viewFromParam(value: string | null | undefined, attentionCount: number): FilesFilter {
  if (value === "attention" || value === "tous") return value;
  return attentionCount > 0 ? "attention" : "tous";
}

/** « 412 Ko », « 1,2 Mo » : la taille du fichier, lisible. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",").replace(/,0$/, "")} Mo`;
}
