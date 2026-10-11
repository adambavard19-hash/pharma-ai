"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { recordAudit } from "@/server/audit/log";
import { normalizeAcademyDraft } from "@/core/academy/content";
import { normalizeQuestions } from "@/core/academy/quiz";
import { isAudience } from "@/core/academy/topics";
import type { ReviewAction } from "@/core/academy/review";
import {
  createAcademyContent,
  publishAcademyContent,
  publishAcademyModule,
  reviewAcademyContent,
  reviewAcademyModule,
  saveAcademyModule,
  saveQuiz,
  setModuleItems,
  updateAcademyContent,
} from "@/server/services/mobile/academy-admin";
import { removeAcademyVideo } from "@/server/services/mobile/academy-media";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * La console de l'Académie : chaque geste part d'une session de l'équipe PharmaBoost, passe par les règles pures de
 * `core/academy` (format, quiz, relecture, publication) et est tracé dans le journal d'audit.
 */

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

function refresh(contentId?: string) {
  revalidatePath("/admin/academie", "layout");
  revalidatePath("/m/formations", "layout");
  revalidatePath("/m");
  if (contentId) revalidatePath(`/admin/academie/${contentId}`);
}

async function audit(adminId: string, entityType: "TrainingContent" | "TrainingModule", entityId: string, metadata: Record<string, unknown>) {
  await recordAudit({ action: "training.saved", entityType, entityId, platformAdminId: adminId, metadata: { academy: true, ...metadata } });
}

const contentSchema = z.object({
  id: id.optional().nullable(),
  title: z.string().max(400),
  summary: z.string().max(2000).optional().nullable(),
  kind: z.string().max(40),
  url: z.string().max(4000).optional().nullable(),
  body: z.string().max(20000).optional().nullable(),
  academyTopic: z.string().max(40).optional().nullable(),
  orientation: z.string().max(20).optional().nullable(),
  durationSeconds: z.union([z.string().max(10), z.number()]).optional().nullable(),
  authorName: z.string().max(300).optional().nullable(),
  authorRole: z.string().max(300).optional().nullable(),
  partnerId: z.string().max(64).optional().nullable(),
  isSponsored: z.boolean().optional(),
  isFreeAccess: z.boolean().optional(),
  quizPassPercent: z.union([z.string().max(5), z.number()]).optional().nullable(),
  sourceLabel: z.string().max(300).optional().nullable(),
  laboratory: z.string().max(200).optional().nullable(),
});

export type AcademyContentPayload = z.input<typeof contentSchema>;

export async function saveAcademyContentAction(payload: AcademyContentPayload): Promise<ActionResult<{ id: string; created: boolean }>> {
  const session = await requirePlatformSession();
  const parsed = contentSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez le contenu saisi.", zodFieldErrors(parsed.error.issues));
  const draft = normalizeAcademyDraft(parsed.data);
  if (!draft.ok) return fail("Vérifiez le contenu saisi.", draft.fieldErrors);

  let contentId = parsed.data.id ?? null;
  if (contentId) {
    if (!(await updateAcademyContent(contentId, draft.data))) return fail("Contenu introuvable.");
  } else {
    contentId = await createAcademyContent(draft.data, session.admin.id);
  }
  await audit(session.admin.id, "TrainingContent", contentId, { step: parsed.data.id ? "edited" : "created", kind: draft.data.kind, topic: draft.data.academyTopic, sponsored: draft.data.isSponsored, free: draft.data.isFreeAccess });
  refresh(contentId);
  return ok({ id: contentId, created: !parsed.data.id }, parsed.data.id ? "Enregistré. Le contenu repasse en brouillon : renvoyez-le en relecture." : "Brouillon créé.");
}

const questionSchema = z.object({
  prompt: z.string().max(1000),
  choices: z.array(z.string().max(500)).max(8),
  correctIndexes: z.array(z.number().int().min(0).max(7)).max(8),
  explanation: z.string().max(2000).optional().nullable(),
  sourceLabel: z.string().max(500).optional().nullable(),
});
const quizSchema = z.object({ contentId: id, questions: z.array(questionSchema).max(12) });

export async function saveQuizAction(payload: z.input<typeof quizSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = quizSchema.safeParse(payload);
  if (!parsed.success) return fail("Quiz illisible.");
  const clean = normalizeQuestions(parsed.data.questions);
  if (!clean.ok) return fail(clean.error);
  if (!(await saveQuiz(parsed.data.contentId, clean.questions))) return fail("Contenu introuvable.");
  await audit(session.admin.id, "TrainingContent", parsed.data.contentId, { step: "quiz", questions: clean.questions.length });
  refresh(parsed.data.contentId);
  return ok(null, clean.questions.length === 0 ? "Quiz retiré. Le contenu repasse en brouillon." : `Quiz enregistré (${clean.questions.length} question${clean.questions.length > 1 ? "s" : ""}). Le contenu repasse en brouillon.`);
}

const reviewSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SUBMIT") }),
  z.object({ type: z.literal("APPROVE"), reviewerName: z.string().max(300), reviewerIsPharmacist: z.boolean() }),
  z.object({ type: z.literal("REJECT"), note: z.string().max(2000) }),
  z.object({ type: z.literal("ARCHIVE") }),
  z.object({ type: z.literal("RESTORE") }),
]);

const REVIEW_MESSAGES: Record<ReviewAction["type"], string> = {
  SUBMIT: "Envoyé en relecture.",
  APPROVE: "Approuvé. Vous pouvez le publier.",
  REJECT: "Refusé : l'auteur voit le motif.",
  ARCHIVE: "Archivé : il n'est plus visible.",
  RESTORE: "Restauré en brouillon.",
};

export async function reviewAcademyContentAction(payload: { contentId: string; action: z.input<typeof reviewSchema> }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsedId = id.safeParse(payload.contentId);
  const parsed = reviewSchema.safeParse(payload.action);
  if (!parsedId.success || !parsed.success) return fail("Demande invalide.");
  const result = await reviewAcademyContent(parsedId.data, parsed.data);
  if (!result.ok) return fail(result.error);
  await audit(session.admin.id, "TrainingContent", parsedId.data, { step: `review.${parsed.data.type.toLowerCase()}`, ...(parsed.data.type === "APPROVE" ? { reviewer: parsed.data.reviewerName, pharmacist: parsed.data.reviewerIsPharmacist } : {}) });
  refresh(parsedId.data);
  return ok(null, REVIEW_MESSAGES[parsed.data.type]);
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal(""));
const publishSchema = z.object({ contentId: id, publish: z.boolean(), publishOn: dateSchema, validUntil: dateSchema });

/** Une date du formulaire (« 2026-10-11 ») : début de journée (UTC) ou fin de journée (≈ 23 h 59 à Paris). */
function dayOf(value: string | null | undefined, endOfDay: boolean): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T${endOfDay ? "21:59:59" : "00:00:00"}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function publishAcademyContentAction(payload: z.input<typeof publishSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = publishSchema.safeParse(payload);
  if (!parsed.success) return fail("Dates invalides.");
  const today = new Date().toISOString().slice(0, 10);
  const publishAt = parsed.data.publishOn && parsed.data.publishOn > today ? dayOf(parsed.data.publishOn, false) : null;
  const result = await publishAcademyContent(parsed.data.contentId, parsed.data.publish ? { publishAt, validUntil: dayOf(parsed.data.validUntil, true) } : null);
  if (!result.ok) return fail(result.error);
  await audit(session.admin.id, "TrainingContent", parsed.data.contentId, { step: parsed.data.publish ? "published" : "unpublished", publishOn: parsed.data.publishOn || null, validUntil: parsed.data.validUntil || null });
  refresh(parsed.data.contentId);
  return ok(null, parsed.data.publish ? (publishAt ? "Mise en ligne programmée." : "En ligne dans l'application.") : "Retiré de l'application.");
}

export async function removeAcademyVideoAction(payload: { contentId: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = id.safeParse(payload.contentId);
  if (!parsed.success) return fail("Demande invalide.");
  if (!(await removeAcademyVideo(parsed.data))) return fail("Contenu introuvable.");
  await audit(session.admin.id, "TrainingContent", parsed.data, { step: "video.removed" });
  refresh(parsed.data);
  return ok(null, "Vidéo retirée. Le contenu repasse en brouillon.");
}

// --- Parcours ---------------------------------------------------------------------------------------------

const moduleSchema = z.object({
  id: id.optional().nullable(),
  title: z.string().trim().min(3, "Donnez un titre (3 caractères au moins).").max(160),
  slug: z.string().trim().max(80).optional().nullable(),
  summary: z.string().max(600).optional().nullable(),
  audience: z.string().refine(isAudience, "Public inconnu."),
  isFreeAccess: z.boolean(),
  isSponsored: z.boolean(),
  partnerId: z.string().max(64).optional().nullable(),
  sortOrder: z.number().int().min(-1000).max(1000).optional(),
});

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function saveAcademyModuleAction(payload: z.input<typeof moduleSchema>): Promise<ActionResult<{ id: string }>> {
  const session = await requirePlatformSession();
  const parsed = moduleSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez le parcours.", zodFieldErrors(parsed.error.issues));
  const data = parsed.data;
  if (data.isSponsored && !data.partnerId) return fail("Un parcours sponsorisé nomme son partenaire.", { partnerId: "Choisissez le partenaire." });
  const slug = slugify(data.slug || data.title);
  if (slug.length < 3) return fail("Adresse du parcours trop courte.", { slug: "3 caractères au moins (lettres, chiffres, tirets)." });
  const result = await saveAcademyModule(
    data.id ?? null,
    { title: data.title, slug, summary: data.summary?.trim() || null, audience: data.audience as never, isFreeAccess: data.isFreeAccess, isSponsored: data.isSponsored, partnerId: data.partnerId || null, sortOrder: data.sortOrder ?? 0 },
    session.admin.id,
  );
  if (!result.ok) return fail(result.error);
  await audit(session.admin.id, "TrainingModule", result.id, { step: data.id ? "module.edited" : "module.created", audience: data.audience });
  refresh();
  revalidatePath(`/admin/academie/parcours/${result.id}`);
  return ok({ id: result.id }, data.id ? "Parcours enregistré. Il repasse en brouillon." : "Parcours créé.");
}

const itemsSchema = z.object({ moduleId: id, items: z.array(z.object({ contentId: id, isRequired: z.boolean() })).max(40) });

export async function setModuleItemsAction(payload: z.input<typeof itemsSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = itemsSchema.safeParse(payload);
  if (!parsed.success) return fail("Liste invalide.");
  const result = await setModuleItems(parsed.data.moduleId, parsed.data.items);
  if (!result.ok) return fail(result.error);
  await audit(session.admin.id, "TrainingModule", parsed.data.moduleId, { step: "module.items", count: parsed.data.items.length });
  refresh();
  revalidatePath(`/admin/academie/parcours/${parsed.data.moduleId}`);
  return ok(null, "Ordre enregistré. Le parcours repasse en brouillon.");
}

export async function reviewAcademyModuleAction(payload: { moduleId: string; action: z.input<typeof reviewSchema> }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsedId = id.safeParse(payload.moduleId);
  const parsed = reviewSchema.safeParse(payload.action);
  if (!parsedId.success || !parsed.success) return fail("Demande invalide.");
  const result = await reviewAcademyModule(parsedId.data, parsed.data);
  if (!result.ok) return fail(result.error);
  await audit(session.admin.id, "TrainingModule", parsedId.data, { step: `module.review.${parsed.data.type.toLowerCase()}` });
  refresh();
  revalidatePath(`/admin/academie/parcours/${parsedId.data}`);
  return ok(null, REVIEW_MESSAGES[parsed.data.type]);
}

export async function publishAcademyModuleAction(payload: { moduleId: string; publish: boolean }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsedId = id.safeParse(payload.moduleId);
  if (!parsedId.success) return fail("Demande invalide.");
  const result = await publishAcademyModule(parsedId.data, payload.publish === true);
  if (!result.ok) return fail(result.error);
  await audit(session.admin.id, "TrainingModule", parsedId.data, { step: payload.publish ? "module.published" : "module.unpublished" });
  refresh();
  revalidatePath(`/admin/academie/parcours/${parsedId.data}`);
  return ok(null, payload.publish ? "Parcours en ligne." : "Parcours retiré de l'application.");
}
