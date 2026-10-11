import { isMedicineTopic } from "./topics";

/**
 * La relecture d'un contenu de l'Académie : BROUILLON → EN RELECTURE → APPROUVÉ ou REFUSÉ.
 *
 * - Rien ne se publie sans APPROUVÉ (`canPublish`).
 * - Un contenu sur le médicament (thème « Médicaments ») ne s'approuve que si le relecteur est déclaré pharmacien.
 * - Toute modification d'un contenu (texte, vidéo, quiz, accès) le renvoie en BROUILLON : la relecture portait sur la
 *   version d'avant, elle ne vaut plus pour la nouvelle.
 * - Un refus porte un motif, que l'auteur lit dans la console.
 */

export const REVIEW_STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED", "REJECTED", "ARCHIVED"] as const;
export type ReviewStatusCode = (typeof REVIEW_STATUSES)[number];

export const REVIEW_STATUS_LABELS: Record<ReviewStatusCode, string> = {
  DRAFT: "Brouillon",
  IN_REVIEW: "En relecture",
  APPROVED: "Approuvé",
  REJECTED: "Refusé",
  ARCHIVED: "Archivé",
};

export type ReviewAction =
  | { type: "SUBMIT" }
  | { type: "APPROVE"; reviewerName: string; reviewerIsPharmacist: boolean }
  | { type: "REJECT"; note: string }
  | { type: "ARCHIVE" }
  | { type: "RESTORE" };

export type ReviewSubject = {
  reviewStatus: string;
  academyTopic?: string | null;
  /** Le contenu a de quoi être relu : une vidéo, un lien ou un texte. */
  hasMaterial: boolean;
};

export type ReviewChange = {
  reviewStatus: ReviewStatusCode;
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  reviewerIsPharmacist?: boolean;
  reviewNote?: string | null;
  publishedAt?: null;
};

export type ReviewResult = { ok: true; change: ReviewChange } | { ok: false; error: string };

function clean(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export function applyReview(subject: ReviewSubject, action: ReviewAction, now: Date): ReviewResult {
  const status = subject.reviewStatus;
  switch (action.type) {
    case "SUBMIT":
      if (status !== "DRAFT" && status !== "REJECTED") return { ok: false, error: "Seul un brouillon (ou un contenu refusé puis corrigé) part en relecture." };
      if (!subject.hasMaterial) return { ok: false, error: "Ajoutez la vidéo, le lien ou le texte avant d'envoyer en relecture." };
      return { ok: true, change: { reviewStatus: "IN_REVIEW", reviewNote: null } };
    case "APPROVE": {
      if (status !== "IN_REVIEW") return { ok: false, error: "Seul un contenu en relecture peut être approuvé." };
      const reviewer = clean(action.reviewerName, 120);
      if (reviewer.length < 3) return { ok: false, error: "Indiquez le nom et la qualité du relecteur." };
      if (isMedicineTopic(subject.academyTopic) && !action.reviewerIsPharmacist) {
        return { ok: false, error: "Un contenu sur le médicament doit être relu par un pharmacien : cochez « Relu par un pharmacien » et indiquez son nom." };
      }
      return { ok: true, change: { reviewStatus: "APPROVED", reviewedBy: reviewer, reviewedAt: now, reviewerIsPharmacist: action.reviewerIsPharmacist, reviewNote: null } };
    }
    case "REJECT": {
      if (status !== "IN_REVIEW") return { ok: false, error: "Seul un contenu en relecture peut être refusé." };
      const note = clean(action.note, 600);
      if (note.length < 5) return { ok: false, error: "Dites à l'auteur ce qu'il faut corriger." };
      return { ok: true, change: { reviewStatus: "REJECTED", reviewNote: note, reviewedAt: now, publishedAt: null } };
    }
    case "ARCHIVE":
      if (status === "ARCHIVED") return { ok: false, error: "Déjà archivé." };
      return { ok: true, change: { reviewStatus: "ARCHIVED", publishedAt: null } };
    case "RESTORE":
      if (status !== "ARCHIVED") return { ok: false, error: "Seul un contenu archivé se restaure." };
      return { ok: true, change: { reviewStatus: "DRAFT", reviewedBy: null, reviewedAt: null, reviewerIsPharmacist: false, publishedAt: null } };
  }
}

/** Ce qu'une modification du contenu fait à sa relecture : retour au brouillon, hors ligne. */
export function afterEdit(): Required<Pick<ReviewChange, "reviewStatus" | "reviewedBy" | "reviewedAt" | "reviewerIsPharmacist" | "publishedAt">> {
  return { reviewStatus: "DRAFT", reviewedBy: null, reviewedAt: null, reviewerIsPharmacist: false, publishedAt: null };
}

export type PublishRequest = { publishAt: Date | null; validUntil: Date | null };

/** Mettre en ligne : seulement APPROUVÉ, et une fin de validité postérieure à la mise en ligne. */
export function checkPublish(subject: { reviewStatus: string }, request: PublishRequest, now: Date): { ok: true; publishedAt: Date; validUntil: Date | null } | { ok: false; error: string } {
  if (subject.reviewStatus !== "APPROVED") return { ok: false, error: "Un contenu ne se publie qu'après une relecture approuvée." };
  const publishedAt = request.publishAt ?? now;
  if (request.validUntil && request.validUntil.getTime() <= Math.max(publishedAt.getTime(), now.getTime())) {
    return { ok: false, error: "La fin de validité doit être postérieure à la mise en ligne." };
  }
  return { ok: true, publishedAt, validUntil: request.validUntil };
}

/** L'état lisible d'un contenu dans la console : relu ET publié = « En ligne ». */
export function onlineState(item: { reviewStatus: string; publishedAt: Date | null; validUntil: Date | null; isActive: boolean }, now: Date): "ONLINE" | "SCHEDULED" | "EXPIRED" | "OFFLINE" {
  if (!item.isActive || item.reviewStatus !== "APPROVED" || !item.publishedAt) return "OFFLINE";
  if (item.validUntil && item.validUntil.getTime() <= now.getTime()) return "EXPIRED";
  if (item.publishedAt.getTime() > now.getTime()) return "SCHEDULED";
  return "ONLINE";
}
