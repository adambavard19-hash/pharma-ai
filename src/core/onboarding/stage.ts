import { journeyStage, JOURNEY_LABELS, type JourneyStage } from "@/core/contracts/journey";

/**
 * Où en est une nouvelle officine, en une étiquette. Le parcours contractuel
 * (core/contracts/journey.ts) reste la référence dès qu'un contrat existe ;
 * ici on détaille seulement l'amont : l'invitation et le dossier.
 */
export type OnboardingStage =
  | "INVITATION_TO_SEND"
  | "INVITATION_FAILED"
  | "INVITATION_EXPIRED"
  | "INVITATION_SENT"
  | "INVITATION_OPENED"
  | "INFO_TO_COMPLETE"
  | "CONTRACT_TO_SEND"
  | Exclude<JourneyStage, "PROSPECT">;

export type StageTone = "neutral" | "info" | "warning" | "danger" | "success" | "brand";

const UPSTREAM: Record<string, { label: string; tone: StageTone }> = {
  INVITATION_TO_SEND: { label: "Invitation à envoyer", tone: "neutral" },
  INVITATION_FAILED: { label: "Échec d'envoi de l'invitation", tone: "danger" },
  INVITATION_EXPIRED: { label: "Invitation expirée", tone: "warning" },
  INVITATION_SENT: { label: "Invitation envoyée", tone: "info" },
  INVITATION_OPENED: { label: "Invitation ouverte · informations à compléter", tone: "info" },
  INFO_TO_COMPLETE: { label: "Informations nécessaires au contrat à compléter", tone: "warning" },
  CONTRACT_TO_SEND: { label: "Dossier complété · contrat à envoyer", tone: "brand" },
};

const JOURNEY_TONE: Partial<Record<JourneyStage, StageTone>> = {
  SIGNED: "success",
  SUBSCRIPTION_PENDING: "warning",
  CLIENT_ACTIVE: "success",
  REFUSED: "danger",
  EXPIRED: "warning",
  LOST: "neutral",
};

export type OnboardingFacts = {
  prospectStatus: string;
  contract?: { status: string; signedArchivedAt?: Date | string | null } | null;
  invitation?: { sentAt?: Date | string | null; lastSendStatus?: string | null; openedAt?: Date | string | null; completedAt?: Date | string | null; revokedAt?: Date | string | null; expiresAt: Date | string } | null;
  /** Nombre de champs manquants pour le contrat (missingContractFields). */
  missingCount: number;
  now?: Date;
};

export function onboardingStage(f: OnboardingFacts): { stage: OnboardingStage; label: string; tone: StageTone } {
  const journey = journeyStage({ prospectStatus: f.prospectStatus, contract: f.contract });
  if (journey !== "PROSPECT") return { stage: journey, label: JOURNEY_LABELS[journey], tone: JOURNEY_TONE[journey] ?? "info" };
  const inv = f.invitation && !f.invitation.revokedAt ? f.invitation : null;
  const pick = (stage: OnboardingStage) => ({ stage, ...UPSTREAM[stage] });
  if (inv && !inv.completedAt) {
    if (inv.lastSendStatus && inv.lastSendStatus !== "SENT") return pick("INVITATION_FAILED");
    if (!inv.sentAt) return pick("INVITATION_TO_SEND");
    if (new Date(inv.expiresAt) < (f.now ?? new Date())) return pick("INVITATION_EXPIRED");
    return pick(inv.openedAt ? "INVITATION_OPENED" : "INVITATION_SENT");
  }
  return pick(f.missingCount > 0 ? "INFO_TO_COMPLETE" : "CONTRACT_TO_SEND");
}

/** Le nom affiché d'un dossier dont l'officine n'a pas encore été décrite. */
export const PLACEHOLDER_NAME = "Officine à compléter";
