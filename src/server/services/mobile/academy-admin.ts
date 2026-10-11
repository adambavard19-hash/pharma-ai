import "server-only";
import { prisma } from "@/server/db/client";
import type { Prisma } from "@/generated/prisma";
import type { AcademyContentData } from "@/core/academy/content";
import { hasMaterial } from "@/core/academy/content";
import { afterEdit, applyReview, checkPublish, type PublishRequest, type ReviewAction } from "@/core/academy/review";
import { choicesOf, type CleanQuestion } from "@/core/academy/quiz";
import type { AudienceCode } from "@/core/academy/topics";

/**
 * La console de l'Académie (équipe PharmaBoost) : contenus, quiz, parcours, relecture, publication, statistiques.
 *
 * Ne touche qu'aux contenus PharmaBoost (`pharmacyId` vide) : un contenu propre à une officine n'est jamais modifiable
 * d'ici. Les statistiques sont des AGRÉGATS (combien, quel taux) : aucune liste de personnes, ni ici ni dans ce qui
 * pourrait être transmis à un partenaire.
 */

export type ContentStats = { learners: number; completed: number; attempts: number; passedAttempts: number; passRate: number | null; freeLearners: number; staffLearners: number };

const EMPTY_STATS: ContentStats = { learners: 0, completed: 0, attempts: 0, passedAttempts: 0, passRate: null, freeLearners: 0, staffLearners: 0 };

/** Vues (personnes qui ont commencé), terminés, tentatives de quiz et taux de réussite, par contenu. */
export async function statsForContents(ids: string[]): Promise<Map<string, ContentStats>> {
  const map = new Map<string, ContentStats>();
  if (ids.length === 0) return map;
  const [progress, attempts] = await Promise.all([
    prisma.trainingProgress.groupBy({ by: ["contentId", "status", "pharmacyId"], where: { contentId: { in: ids } }, _count: { _all: true } }),
    prisma.quizAttempt.groupBy({ by: ["contentId", "passed"], where: { contentId: { in: ids } }, _count: { _all: true } }),
  ]);
  for (const id of ids) map.set(id, { ...EMPTY_STATS });
  for (const row of progress) {
    const stats = map.get(row.contentId)!;
    stats.learners += row._count._all;
    if (row.status === "DONE") stats.completed += row._count._all;
    if (row.pharmacyId === null) stats.freeLearners += row._count._all;
    else stats.staffLearners += row._count._all;
  }
  for (const row of attempts) {
    const stats = map.get(row.contentId)!;
    stats.attempts += row._count._all;
    if (row.passed) stats.passedAttempts += row._count._all;
  }
  for (const stats of map.values()) stats.passRate = stats.attempts > 0 ? Math.round((stats.passedAttempts / stats.attempts) * 100) : null;
  return map;
}

/** Les chiffres d'un partenaire sur ses contenus : agrégats seulement, sans aucune personne ni officine. */
export async function academyStatsForPartner(partnerId: string): Promise<{ contents: number; learners: number; completed: number; passRate: number | null }> {
  const contents = await prisma.trainingContent.findMany({ where: { partnerId, pharmacyId: null }, select: { id: true } });
  const stats = await statsForContents(contents.map((content) => content.id));
  let learners = 0, completed = 0, attempts = 0, passed = 0;
  for (const value of stats.values()) {
    learners += value.learners;
    completed += value.completed;
    attempts += value.attempts;
    passed += value.passedAttempts;
  }
  return { contents: contents.length, learners, completed, passRate: attempts > 0 ? Math.round((passed / attempts) * 100) : null };
}

const LIST_SELECT = {
  id: true,
  title: true,
  kind: true,
  academyTopic: true,
  reviewStatus: true,
  reviewedBy: true,
  reviewedAt: true,
  reviewerIsPharmacist: true,
  publishedAt: true,
  validUntil: true,
  isActive: true,
  isFreeAccess: true,
  isSponsored: true,
  posterUrl: true,
  videoAssetKey: true,
  url: true,
  durationSeconds: true,
  authorName: true,
  updatedAt: true,
  partner: { select: { name: true } },
  _count: { select: { quizQuestions: true } },
} satisfies Prisma.TrainingContentSelect;

export type AcademyListRow = Prisma.TrainingContentGetPayload<{ select: typeof LIST_SELECT }> & { stats: ContentStats };

/**
 * Les contenus de l'Académie : ceux créés ici (micro-vidéos, vidéos, fiches avec un auteur). Les liens officiels de
 * l'ancienne console « Formations » y restent gérés.
 */
export async function listAcademyContents(filter: { status?: string | null; q?: string | null } = {}): Promise<AcademyListRow[]> {
  const where: Prisma.TrainingContentWhereInput = { pharmacyId: null, kind: { in: ["MICRO_VIDEO", "VIDEO", "SHEET"] }, authorName: { not: null } };
  if (filter.status) where.reviewStatus = filter.status as never;
  const q = filter.q?.trim().slice(0, 80);
  if (q) where.OR = [{ title: { contains: q, mode: "insensitive" } }, { authorName: { contains: q, mode: "insensitive" } }];
  const rows = await prisma.trainingContent.findMany({ where, orderBy: [{ updatedAt: "desc" }], select: LIST_SELECT, take: 300 });
  const stats = await statsForContents(rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, stats: stats.get(row.id) ?? { ...EMPTY_STATS } }));
}

export async function countByStatus(): Promise<Record<string, number>> {
  const rows = await prisma.trainingContent.groupBy({ by: ["reviewStatus"], where: { pharmacyId: null, kind: { in: ["MICRO_VIDEO", "VIDEO", "SHEET"] }, authorName: { not: null } }, _count: { _all: true } });
  return Object.fromEntries(rows.map((row) => [row.reviewStatus, row._count._all]));
}

export async function getAcademyContent(id: string) {
  const content = await prisma.trainingContent.findFirst({
    where: { id, pharmacyId: null },
    select: {
      ...LIST_SELECT,
      summary: true,
      body: true,
      orientation: true,
      authorRole: true,
      partnerId: true,
      reviewNote: true,
      quizPassPercent: true,
      sourceLabel: true,
      laboratory: true,
      createdAt: true,
      quizQuestions: { orderBy: { position: "asc" }, select: { id: true, prompt: true, choices: true, correctIndexes: true, explanation: true, sourceLabel: true } },
      moduleItems: { select: { module: { select: { id: true, title: true } } } },
    },
  });
  if (!content) return null;
  const stats = (await statsForContents([id])).get(id) ?? { ...EMPTY_STATS };
  return { ...content, quizQuestions: content.quizQuestions.map((question) => ({ ...question, choices: choicesOf(question.choices) })), stats };
}

export type AcademyContentDetail = NonNullable<Awaited<ReturnType<typeof getAcademyContent>>>;

export async function createAcademyContent(data: AcademyContentData, adminId: string): Promise<string> {
  const created = await prisma.trainingContent.create({
    data: { ...data, pharmacyId: null, createdByAdminId: adminId, isActive: true, reviewStatus: "DRAFT", sourceLabel: data.sourceLabel ?? "Académie PharmaBoost" },
    select: { id: true },
  });
  return created.id;
}

/** Modifier un contenu le renvoie en brouillon, hors ligne : sa relecture ne vaut plus. */
export async function updateAcademyContent(id: string, data: AcademyContentData): Promise<boolean> {
  const existing = await prisma.trainingContent.findFirst({ where: { id, pharmacyId: null }, select: { id: true } });
  if (!existing) return false;
  await prisma.trainingContent.update({ where: { id }, data: { ...data, ...afterEdit() } });
  return true;
}

export async function saveQuiz(id: string, questions: CleanQuestion[]): Promise<boolean> {
  const existing = await prisma.trainingContent.findFirst({ where: { id, pharmacyId: null }, select: { id: true } });
  if (!existing) return false;
  await prisma.$transaction([
    prisma.quizQuestion.deleteMany({ where: { contentId: id } }),
    ...questions.map((question, index) => prisma.quizQuestion.create({ data: { contentId: id, position: index + 1, prompt: question.prompt, choices: question.choices, correctIndexes: question.correctIndexes, explanation: question.explanation, sourceLabel: question.sourceLabel } })),
    prisma.trainingContent.update({ where: { id }, data: afterEdit() }),
  ]);
  return true;
}

export type WorkflowResult = { ok: true; title: string } | { ok: false; error: string };

export async function reviewAcademyContent(id: string, action: ReviewAction, now = new Date()): Promise<WorkflowResult> {
  const content = await prisma.trainingContent.findFirst({ where: { id, pharmacyId: null }, select: { title: true, kind: true, url: true, body: true, videoAssetKey: true, reviewStatus: true, academyTopic: true } });
  if (!content) return { ok: false, error: "Contenu introuvable." };
  const result = applyReview({ reviewStatus: content.reviewStatus, academyTopic: content.academyTopic, hasMaterial: hasMaterial(content) }, action, now);
  if (!result.ok) return result;
  await prisma.trainingContent.update({ where: { id }, data: result.change });
  return { ok: true, title: content.title };
}

export async function publishAcademyContent(id: string, request: PublishRequest | null, now = new Date()): Promise<WorkflowResult> {
  const content = await prisma.trainingContent.findFirst({ where: { id, pharmacyId: null }, select: { title: true, reviewStatus: true } });
  if (!content) return { ok: false, error: "Contenu introuvable." };
  if (request === null) {
    await prisma.trainingContent.update({ where: { id }, data: { publishedAt: null } });
    return { ok: true, title: content.title };
  }
  const check = checkPublish(content, request, now);
  if (!check.ok) return check;
  await prisma.trainingContent.update({ where: { id }, data: { publishedAt: check.publishedAt, validUntil: check.validUntil, isActive: true } });
  return { ok: true, title: content.title };
}

// --- Parcours ------------------------------------------------------------------------------------------------

export async function listAcademyModules() {
  const rows = await prisma.trainingModule.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, slug: true, title: true, audience: true, isFreeAccess: true, isSponsored: true, reviewStatus: true, reviewedBy: true, publishedAt: true, isActive: true, sortOrder: true, partner: { select: { name: true } }, _count: { select: { items: true } } },
  });
  const ids = rows.map((row) => row.id);
  const completions = ids.length
    ? await prisma.skillBadge.groupBy({ by: ["moduleId"], where: { kind: "MODULE_COMPLETED", moduleId: { in: ids } }, _count: { _all: true } })
    : [];
  const done = new Map(completions.map((row) => [row.moduleId, row._count._all]));
  return rows.map((row) => ({ ...row, completions: done.get(row.id) ?? 0 }));
}

export async function getAcademyModule(id: string) {
  return prisma.trainingModule.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      coverUrl: true,
      audience: true,
      isFreeAccess: true,
      isSponsored: true,
      partnerId: true,
      reviewStatus: true,
      reviewedBy: true,
      reviewedAt: true,
      publishedAt: true,
      isActive: true,
      sortOrder: true,
      items: { orderBy: { position: "asc" }, select: { id: true, position: true, isRequired: true, content: { select: { id: true, title: true, kind: true, reviewStatus: true, publishedAt: true, isFreeAccess: true, durationSeconds: true } } } },
    },
  });
}

export type ModuleData = { title: string; slug: string; summary: string | null; audience: AudienceCode; isFreeAccess: boolean; isSponsored: boolean; partnerId: string | null; sortOrder: number };

const MODULE_AFTER_EDIT = { reviewStatus: "DRAFT" as const, reviewedBy: null, reviewedAt: null, publishedAt: null };

export async function saveAcademyModule(id: string | null, data: ModuleData, adminId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const clash = await prisma.trainingModule.findFirst({ where: { slug: data.slug, ...(id ? { NOT: { id } } : {}) }, select: { id: true } });
  if (clash) return { ok: false, error: "Cette adresse de parcours est déjà prise : changez le titre ou l'adresse." };
  if (id) {
    const existing = await prisma.trainingModule.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return { ok: false, error: "Parcours introuvable." };
    await prisma.trainingModule.update({ where: { id }, data: { ...data, ...MODULE_AFTER_EDIT } });
    return { ok: true, id };
  }
  const created = await prisma.trainingModule.create({ data: { ...data, createdByAdminId: adminId }, select: { id: true } });
  return { ok: true, id: created.id };
}

/** Les contenus du parcours, dans l'ordre donné. Seuls des contenus PharmaBoost. Retour au brouillon. */
export async function setModuleItems(moduleId: string, items: { contentId: string; isRequired: boolean }[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const mod = await prisma.trainingModule.findUnique({ where: { id: moduleId }, select: { id: true } });
  if (!mod) return { ok: false, error: "Parcours introuvable." };
  const ids = [...new Set(items.map((item) => item.contentId))];
  if (ids.length !== items.length) return { ok: false, error: "Un contenu figure deux fois dans le parcours." };
  const known = await prisma.trainingContent.count({ where: { id: { in: ids }, pharmacyId: null } });
  if (known !== ids.length) return { ok: false, error: "Un des contenus n'existe pas (ou n'est pas un contenu PharmaBoost)." };
  await prisma.$transaction([
    prisma.trainingModuleItem.deleteMany({ where: { moduleId } }),
    ...items.map((item, index) => prisma.trainingModuleItem.create({ data: { moduleId, contentId: item.contentId, position: index + 1, isRequired: item.isRequired } })),
    prisma.trainingModule.update({ where: { id: moduleId }, data: MODULE_AFTER_EDIT }),
  ]);
  return { ok: true };
}

export async function reviewAcademyModule(id: string, action: ReviewAction, now = new Date()): Promise<WorkflowResult> {
  const mod = await prisma.trainingModule.findUnique({ where: { id }, select: { title: true, reviewStatus: true, _count: { select: { items: true } } } });
  if (!mod) return { ok: false, error: "Parcours introuvable." };
  const result = applyReview({ reviewStatus: mod.reviewStatus, academyTopic: null, hasMaterial: mod._count.items > 0 }, action, now);
  if (!result.ok) return { ok: false, error: result.error.replace("la vidéo, le lien ou le texte", "au moins un contenu") };
  // Un parcours n'a pas de colonne « relu par un pharmacien » ni de motif : ses contenus portent leur propre relecture.
  const { reviewerIsPharmacist, reviewNote, ...change } = result.change;
  void reviewerIsPharmacist;
  void reviewNote;
  await prisma.trainingModule.update({ where: { id }, data: change });
  return { ok: true, title: mod.title };
}

export async function publishAcademyModule(id: string, publish: boolean, now = new Date()): Promise<WorkflowResult> {
  const mod = await prisma.trainingModule.findUnique({ where: { id }, select: { title: true, reviewStatus: true } });
  if (!mod) return { ok: false, error: "Parcours introuvable." };
  if (!publish) {
    await prisma.trainingModule.update({ where: { id }, data: { publishedAt: null } });
    return { ok: true, title: mod.title };
  }
  const check = checkPublish(mod, { publishAt: null, validUntil: null }, now);
  if (!check.ok) return check;
  await prisma.trainingModule.update({ where: { id }, data: { publishedAt: check.publishedAt, isActive: true } });
  return { ok: true, title: mod.title };
}

/** Les contenus qu'on peut ajouter à un parcours, et les partenaires qu'on peut nommer. */
export async function academyPickers() {
  const [contents, partners] = await Promise.all([
    prisma.trainingContent.findMany({ where: { pharmacyId: null, isActive: true, kind: { in: ["MICRO_VIDEO", "VIDEO", "SHEET"] }, authorName: { not: null } }, orderBy: { title: "asc" }, select: { id: true, title: true, kind: true, reviewStatus: true }, take: 500 }),
    prisma.partner.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, status: true }, take: 300 }),
  ]);
  return { contents, partners };
}
