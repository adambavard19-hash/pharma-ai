import { videoEmbed } from "@/core/training/video";
import { isSafeHttpUrl } from "@/core/training/content";
import { isAcademyTopic, type AcademyTopicCode } from "./topics";
import { MICRO_VIDEO_MAX_SECONDS } from "./media";
import { passPercentOf } from "./quiz";

/**
 * Ce que saisit la console de l'Académie pour un contenu, et ce qu'on accepte d'en enregistrer.
 *
 * Trois formats : la micro-vidéo (≤ 3 min, souvent verticale), la vidéo, la fiche. Une vidéo est hébergée par
 * PharmaBoost (fichier envoyé depuis la console) OU intégrée depuis YouTube, Vimeo ou Dailymotion. Un auteur est
 * toujours affiché ; un contenu « sponsorisé » nomme toujours son partenaire.
 */

export const ACADEMY_KINDS = ["MICRO_VIDEO", "VIDEO", "SHEET"] as const;
export type AcademyKind = (typeof ACADEMY_KINDS)[number];

export const ACADEMY_KIND_LABELS: Record<AcademyKind, string> = { MICRO_VIDEO: "Micro-vidéo", VIDEO: "Vidéo", SHEET: "Fiche" };

export function isAcademyKind(value: unknown): value is AcademyKind {
  return typeof value === "string" && (ACADEMY_KINDS as readonly string[]).includes(value);
}

export type AcademyDraft = {
  title: string;
  summary?: string | null;
  kind: string;
  url?: string | null;
  body?: string | null;
  academyTopic?: string | null;
  orientation?: string | null;
  durationSeconds?: number | string | null;
  authorName?: string | null;
  authorRole?: string | null;
  partnerId?: string | null;
  isSponsored?: boolean;
  isFreeAccess?: boolean;
  quizPassPercent?: number | string | null;
  sourceLabel?: string | null;
  laboratory?: string | null;
};

export type AcademyContentData = {
  title: string;
  summary: string | null;
  kind: AcademyKind;
  url: string | null;
  body: string | null;
  academyTopic: AcademyTopicCode | null;
  orientation: "VERTICAL" | "HORIZONTAL" | null;
  durationSeconds: number | null;
  durationMinutes: number | null;
  authorName: string;
  authorRole: string | null;
  partnerId: string | null;
  isSponsored: boolean;
  isFreeAccess: boolean;
  quizPassPercent: number;
  sourceLabel: string | null;
  laboratory: string | null;
};

function clean(value: string | null | undefined, max: number): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function int(value: number | string | null | undefined): number | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isInteger(number) ? number : "invalid";
}

export function normalizeAcademyDraft(draft: AcademyDraft): { ok: true; data: AcademyContentData } | { ok: false; fieldErrors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const title = clean(draft.title, 160);
  if (!title || title.length < 3) errors.title = "Donnez un titre (3 caractères au moins).";
  const kind: AcademyKind = isAcademyKind(draft.kind) ? draft.kind : "MICRO_VIDEO";
  if (!isAcademyKind(draft.kind)) errors.kind = "Choisissez un format.";

  const url = clean(draft.url, 2000);
  if (url) {
    if (!isSafeHttpUrl(url)) errors.url = "Adresse invalide : elle doit commencer par https://";
    else if (kind !== "SHEET" && !videoEmbed(url)) errors.url = "Seules les vidéos YouTube, Vimeo ou Dailymotion s'intègrent. Sinon, envoyez le fichier.";
  }

  const body = draft.body ? draft.body.trim().slice(0, 8000) || null : null;
  if (kind === "SHEET" && (!body || body.length < 20)) errors.body = "Écrivez la fiche (20 caractères au moins).";

  const topic = draft.academyTopic ? (isAcademyTopic(draft.academyTopic) ? draft.academyTopic : null) : null;
  if (draft.academyTopic && !topic) errors.academyTopic = "Thème inconnu.";

  const duration = int(draft.durationSeconds);
  let durationSeconds: number | null = null;
  if (duration === "invalid" || (typeof duration === "number" && (duration < 1 || duration > 7200))) errors.durationSeconds = "Une durée en secondes.";
  else durationSeconds = duration;
  if (kind === "MICRO_VIDEO" && durationSeconds !== null && durationSeconds > MICRO_VIDEO_MAX_SECONDS) {
    errors.durationSeconds = `Une micro-vidéo dure ${MICRO_VIDEO_MAX_SECONDS} secondes au plus : choisissez « Vidéo ».`;
  }

  const authorName = clean(draft.authorName, 120);
  if (!authorName) errors.authorName = "Indiquez l'auteur (il est affiché sous le contenu).";

  const partnerId = clean(draft.partnerId, 64);
  const isSponsored = draft.isSponsored === true;
  if (isSponsored && !partnerId) errors.partnerId = "Un contenu sponsorisé nomme son partenaire.";

  const pass = int(draft.quizPassPercent);
  if (pass === "invalid" || (typeof pass === "number" && (pass < 1 || pass > 100))) errors.quizPassPercent = "Un pourcentage de 1 à 100.";

  const orientation = draft.orientation === "VERTICAL" || draft.orientation === "HORIZONTAL" ? draft.orientation : kind === "MICRO_VIDEO" ? "VERTICAL" : kind === "VIDEO" ? "HORIZONTAL" : null;

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    data: {
      title: title!,
      summary: clean(draft.summary, 500),
      kind,
      url: kind === "SHEET" ? null : url,
      body,
      academyTopic: topic,
      orientation: kind === "SHEET" ? null : orientation,
      durationSeconds: kind === "SHEET" ? null : durationSeconds,
      durationMinutes: durationSeconds ? Math.max(1, Math.round(durationSeconds / 60)) : null,
      authorName: authorName!,
      authorRole: clean(draft.authorRole, 120),
      partnerId,
      isSponsored,
      isFreeAccess: draft.isFreeAccess === true,
      quizPassPercent: passPercentOf(typeof pass === "number" ? pass : null),
      sourceLabel: clean(draft.sourceLabel, 120),
      laboratory: clean(draft.laboratory, 80),
    },
  };
}

/** « 45 s », « 2 min 30 », « 12 min ». */
export function formatSeconds(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  if (minutes >= 10 || rest === 0) return `${minutes} min`;
  return `${minutes} min ${String(rest).padStart(2, "0")}`;
}

/** Le contenu a-t-il de quoi être relu ? */
export function hasMaterial(content: { kind: string; url: string | null; body: string | null; videoAssetKey: string | null }): boolean {
  if (content.kind === "SHEET") return !!content.body && content.body.trim().length >= 20;
  return !!content.videoAssetKey || !!videoEmbed(content.url);
}
