import { AlertTriangle, CheckCircle2, Circle, type LucideIcon } from "lucide-react";

/**
 * Les couleurs d'état de « Mes connexions » : un état se lit à sa couleur et à son
 * icône avant de se lire à son texte. Vert = ça marche, orange = à faire ou à
 * surveiller, gris = pas encore. Jamais du rouge pour ce qui n'est pas dangereux.
 */

export type Tone = "success" | "warning" | "danger" | "neutral";

export const TONE_STYLES: Record<Tone, { box: string; dot: string; text: string; Icon: LucideIcon }> = {
  success: { box: "border-success-200 bg-success-50/70 dark:border-success-800 dark:bg-success-950/30", dot: "bg-success-600", text: "text-success-700 dark:text-success-400", Icon: CheckCircle2 },
  warning: { box: "border-warning-300 bg-warning-50/70 dark:border-warning-800 dark:bg-warning-950/30", dot: "bg-warning-500", text: "text-warning-800 dark:text-warning-400", Icon: AlertTriangle },
  danger: { box: "border-danger-200 bg-danger-50/70 dark:border-danger-800 dark:bg-danger-950/30", dot: "bg-danger-600", text: "text-danger-700 dark:text-danger-400", Icon: AlertTriangle },
  neutral: { box: "border-border-subtle bg-surface-card", dot: "bg-ink-300 dark:bg-ink-600", text: "text-text-secondary", Icon: Circle },
};
