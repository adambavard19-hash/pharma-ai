import "server-only";
import { prisma } from "@/server/db/client";
import type { Prisma } from "@/generated/prisma";
import type { UserSessionContext } from "@/server/auth/user-session";
import { contentVisibleWhere, isModuleVisible, isNewStaff, type AcademyViewer } from "@/core/academy/visibility";
import { choicesOf, feedbackFor, scoreQuiz, type AnswerFeedback, type QuizQuestionData, type QuizScore } from "@/core/academy/quiz";
import { completesOnWatch, moduleBadgeKey, moduleProgress, quizBadgeKey, type ModuleProgress } from "@/core/academy/passport";
import { formatSeconds } from "@/core/academy/content";
import { mediaPath } from "@/core/academy/media";
import { videoEmbed } from "@/core/training/video";
import { clampPercent } from "@/core/training/progress";
import { formatDuration } from "@/core/training/content";
import type { AcademyTopicCode } from "@/core/academy/topics";

/**
 * L'Académie de PharmaBoost Mobile, côté personne : le fil, le catalogue, un contenu, son quiz, les parcours, le
 * passeport.
 *
 * Tout part du `viewer` construit depuis la SESSION (jamais d'un paramètre) : sa personne, son officine active (ou
 * aucune pour un compte gratuit). La règle de visibilité est celle de `core/academy/visibility` : relu et approuvé,
 * publié, pas échu, et ouvert à ce public. Un contenu invisible n'existe pas : même réponse qu'un identifiant inconnu.
 *
 * La progression est celle de la personne. Elle s'écrit dans le contexte courant (officine active, ou hors officine
 * pour un compte gratuit) et se lit sur tous ses contextes : ce qu'elle a appris la suit d'une officine à l'autre.
 */

export async function academyViewer(session: UserSessionContext): Promise<AcademyViewer> {
  let memberSince: Date | null = null;
  if (session.activePharmacy) {
    const membership = await prisma.membership.findFirst({
      where: { userId: session.user.id, pharmacyId: session.activePharmacy.id, isActive: true },
      select: { createdAt: true },
    });
    memberSince = membership?.createdAt ?? null;
  }
  return { userId: session.user.id, pharmacyId: session.activePharmacy?.id ?? null, profession: session.user.profession, role: session.role, memberSince };
}

const CARD_SELECT = {
  id: true,
  title: true,
  summary: true,
  kind: true,
  url: true,
  videoAssetKey: true,
  posterUrl: true,
  orientation: true,
  durationSeconds: true,
  durationMinutes: true,
  authorName: true,
  authorRole: true,
  isSponsored: true,
  partnerId: true,
  isFreeAccess: true,
  academyTopic: true,
  reviewedBy: true,
  reviewedAt: true,
  reviewerIsPharmacist: true,
  publishedAt: true,
  validUntil: true,
  sourceLabel: true,
  laboratory: true,
  updatedAt: true,
  partner: { select: { name: true } },
  _count: { select: { quizQuestions: true } },
} satisfies Prisma.TrainingContentSelect;

type CardRow = Prisma.TrainingContentGetPayload<{ select: typeof CARD_SELECT }>;

export type AcademyCard = {
  id: string;
  title: string;
  summary: string | null;
  kind: string;
  topic: AcademyTopicCode | null;
  /** Lecture dans l'application : fichier hébergé, intégration (YouTube…), ou rien (fiche). */
  video: { type: "file"; src: string } | { type: "embed"; src: string; platform: string } | null;
  posterUrl: string | null;
  vertical: boolean;
  durationLabel: string | null;
  durationSeconds: number | null;
  author: string | null;
  authorRole: string | null;
  /** Le partenaire qui parraine ou fournit le contenu : toujours affiché. */
  partnerName: string | null;
  isSponsored: boolean;
  isFreeAccess: boolean;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewerIsPharmacist: boolean;
  publishedAt: Date | null;
  validUntil: Date | null;
  sourceLabel: string | null;
  quizCount: number;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  percent: number;
  quizPassed: boolean;
};

type PersonalState = { status: "TODO" | "IN_PROGRESS" | "DONE"; percent: number; updatedAt: Date | null; completedAt: Date | null };

/** L'état d'une personne sur des contenus : le meilleur de ses contextes (terminé l'emporte, puis le plus avancé). */
async function personalStates(userId: string, contentIds: string[]): Promise<Map<string, PersonalState>> {
  const map = new Map<string, PersonalState>();
  if (contentIds.length === 0) return map;
  const rows = await prisma.trainingProgress.findMany({
    where: { userId, contentId: { in: contentIds } },
    select: { contentId: true, status: true, progressPercent: true, updatedAt: true, completedAt: true },
  });
  for (const row of rows) {
    const state: PersonalState =
      row.status === "DONE"
        ? { status: "DONE", percent: 100, updatedAt: row.updatedAt, completedAt: row.completedAt }
        : row.status === "IN_PROGRESS"
          ? { status: "IN_PROGRESS", percent: Math.min(99, clampPercent(row.progressPercent)), updatedAt: row.updatedAt, completedAt: null }
          : { status: "TODO", percent: 0, updatedAt: row.updatedAt, completedAt: null };
    const previous = map.get(row.contentId);
    const rank = (s: PersonalState) => (s.status === "DONE" ? 1000 : s.percent);
    if (!previous || rank(state) > rank(previous) || (rank(state) === rank(previous) && (state.updatedAt?.getTime() ?? 0) > (previous.updatedAt?.getTime() ?? 0))) {
      map.set(row.contentId, state);
    }
  }
  return map;
}

async function passedQuizzes(userId: string, contentIds: string[]): Promise<Set<string>> {
  if (contentIds.length === 0) return new Set();
  const rows = await prisma.quizAttempt.findMany({ where: { userId, contentId: { in: contentIds }, passed: true }, select: { contentId: true }, distinct: ["contentId"] });
  return new Set(rows.map((row) => row.contentId));
}

function videoOf(row: Pick<CardRow, "id" | "kind" | "videoAssetKey" | "url" | "updatedAt">): AcademyCard["video"] {
  if (row.kind === "SHEET") return null;
  if (row.videoAssetKey) return { type: "file", src: mediaPath(row.id, "video", row.videoAssetKey.split("/").pop()) };
  const embed = videoEmbed(row.url);
  return embed ? { type: "embed", src: embed.embedUrl, platform: embed.platform } : null;
}

function toCard(row: CardRow, state: PersonalState | undefined, passed: boolean): AcademyCard {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    kind: row.kind,
    topic: (row.academyTopic as AcademyTopicCode | null) ?? null,
    video: videoOf(row),
    posterUrl: row.posterUrl,
    vertical: row.orientation === "VERTICAL",
    durationLabel: row.durationSeconds ? formatSeconds(row.durationSeconds) : formatDuration(row.durationMinutes),
    durationSeconds: row.durationSeconds,
    author: row.authorName,
    authorRole: row.authorRole,
    partnerName: row.partner?.name ?? null,
    isSponsored: row.isSponsored,
    isFreeAccess: row.isFreeAccess,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    reviewerIsPharmacist: row.reviewerIsPharmacist,
    publishedAt: row.publishedAt,
    validUntil: row.validUntil,
    sourceLabel: row.sourceLabel,
    quizCount: row._count.quizQuestions,
    status: state?.status ?? "TODO",
    percent: state?.percent ?? 0,
    quizPassed: passed,
  };
}

async function cardsFor(viewer: AcademyViewer, where: Prisma.TrainingContentWhereInput, now: Date, orderBy: Prisma.TrainingContentOrderByWithRelationInput[], take?: number): Promise<AcademyCard[]> {
  const rows = await prisma.trainingContent.findMany({ where: { AND: [contentVisibleWhere(viewer, now), where] }, select: CARD_SELECT, orderBy, take });
  const ids = rows.map((row) => row.id);
  const [states, passed] = await Promise.all([personalStates(viewer.userId, ids), passedQuizzes(viewer.userId, ids)]);
  return rows.map((row) => toCard(row, states.get(row.id), passed.has(row.id)));
}

const NEWEST: Prisma.TrainingContentOrderByWithRelationInput[] = [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];

/**
 * « Pour vous » : les micro-vidéos, ce qui est en cours d'abord, puis le nouveau, puis le déjà vu (pour revoir).
 * Les contenus des parcours d'arrivée passent devant pour un nouveau collaborateur.
 */
export async function loadFeed(viewer: AcademyViewer, now = new Date()): Promise<AcademyCard[]> {
  const cards = await cardsFor(viewer, { kind: { in: ["MICRO_VIDEO", "VIDEO"] } }, now, NEWEST, 60);
  const welcome = isNewStaff(viewer, now) ? await newStaffContentIds(viewer, now) : new Map<string, number>();
  const weight = (card: AcademyCard) => (card.status === "IN_PROGRESS" ? 0 : card.status === "TODO" ? 1 : 2);
  return cards
    .map((card, index) => ({ card, index }))
    .sort((a, b) => {
      const byState = weight(a.card) - weight(b.card);
      if (byState !== 0) return byState;
      const wa = welcome.get(a.card.id);
      const wb = welcome.get(b.card.id);
      if (wa !== undefined || wb !== undefined) return (wa ?? 1e6) - (wb ?? 1e6);
      return a.index - b.index;
    })
    .map(({ card }) => card);
}

/** Les contenus des parcours « Nouveaux collaborateurs » visibles, avec leur rang (parcours puis position). */
async function newStaffContentIds(viewer: AcademyViewer, now: Date): Promise<Map<string, number>> {
  const modules = await prisma.trainingModule.findMany({
    where: { audience: "NEW_STAFF", isActive: true, reviewStatus: "APPROVED", publishedAt: { lte: now } },
    orderBy: { sortOrder: "asc" },
    select: { isActive: true, reviewStatus: true, publishedAt: true, isFreeAccess: true, audience: true, items: { orderBy: { position: "asc" }, select: { contentId: true } } },
  });
  const map = new Map<string, number>();
  let rank = 0;
  for (const mod of modules) {
    if (!isModuleVisible(mod, viewer, now)) continue;
    for (const item of mod.items) if (!map.has(item.contentId)) map.set(item.contentId, rank++);
  }
  return map;
}

export type CatalogueFilters = { q?: string | null; topic?: string | null; format?: string | null };

export async function loadCatalogue(viewer: AcademyViewer, filters: CatalogueFilters, now = new Date()): Promise<{ items: AcademyCard[]; total: number }> {
  const and: Prisma.TrainingContentWhereInput[] = [];
  const q = filters.q?.trim().slice(0, 80);
  if (q) and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }, { authorName: { contains: q, mode: "insensitive" } }, { laboratory: { contains: q, mode: "insensitive" } }, { partner: { name: { contains: q, mode: "insensitive" } } }] });
  if (filters.topic) and.push({ academyTopic: filters.topic as AcademyTopicCode });
  if (filters.format === "video") and.push({ kind: { in: ["MICRO_VIDEO", "VIDEO"] } });
  else if (filters.format === "fiche") and.push({ kind: "SHEET" });
  const [items, total] = await Promise.all([
    cardsFor(viewer, and.length > 0 ? { AND: and } : {}, now, NEWEST, 100),
    prisma.trainingContent.count({ where: contentVisibleWhere(viewer, now) }),
  ]);
  return { items, total };
}

export type ModuleContext = { slug: string; title: string; position: number; count: number; nextId: string | null; previousId: string | null };

export type ContentDetail = AcademyCard & { body: string | null; modules: ModuleContext[]; bestScore: number | null; attempts: number };

export async function loadContentDetail(viewer: AcademyViewer, id: string, now = new Date()): Promise<ContentDetail | null> {
  const [card] = await cardsFor(viewer, { id }, now, NEWEST, 1);
  if (!card) return null;
  const [content, attempts, modules] = await Promise.all([
    prisma.trainingContent.findUnique({ where: { id }, select: { body: true } }),
    prisma.quizAttempt.aggregate({ where: { userId: viewer.userId, contentId: id }, _max: { score: true }, _count: { _all: true } }),
    visibleModulesWith(viewer, id, now),
  ]);
  return { ...card, body: content?.body ?? null, modules, bestScore: attempts._max.score, attempts: attempts._count._all };
}

/** Les parcours visibles qui contiennent ce contenu, avec sa place et ses voisins visibles. */
async function visibleModulesWith(viewer: AcademyViewer, contentId: string, now: Date): Promise<ModuleContext[]> {
  const modules = await prisma.trainingModule.findMany({
    where: { isActive: true, reviewStatus: "APPROVED", items: { some: { contentId } } },
    orderBy: { sortOrder: "asc" },
    select: { slug: true, title: true, isActive: true, reviewStatus: true, publishedAt: true, isFreeAccess: true, audience: true, items: { orderBy: { position: "asc" }, select: { contentId: true } } },
  });
  const result: ModuleContext[] = [];
  for (const mod of modules) {
    if (!isModuleVisible(mod, viewer, now)) continue;
    const visible = await visibleIds(viewer, mod.items.map((item) => item.contentId), now);
    const ordered = mod.items.map((item) => item.contentId).filter((itemId) => visible.has(itemId));
    const index = ordered.indexOf(contentId);
    if (index < 0) continue;
    result.push({ slug: mod.slug, title: mod.title, position: index + 1, count: ordered.length, nextId: ordered[index + 1] ?? null, previousId: ordered[index - 1] ?? null });
  }
  return result;
}

async function visibleIds(viewer: AcademyViewer, ids: string[], now: Date): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await prisma.trainingContent.findMany({ where: { AND: [contentVisibleWhere(viewer, now), { id: { in: ids } }] }, select: { id: true } });
  return new Set(rows.map((row) => row.id));
}

// --- Quiz --------------------------------------------------------------------------------------------------

export type PlayableQuestion = { id: string; prompt: string; choices: string[]; multiple: boolean };

async function questionsOf(contentId: string): Promise<QuizQuestionData[]> {
  const rows = await prisma.quizQuestion.findMany({ where: { contentId }, orderBy: { position: "asc" }, select: { id: true, prompt: true, choices: true, correctIndexes: true, explanation: true, sourceLabel: true } });
  return rows.map((row) => ({ ...row, choices: choicesOf(row.choices) }));
}

/** Les questions À JOUER : sans les bonnes réponses. */
export async function loadPlayableQuiz(viewer: AcademyViewer, contentId: string, now = new Date()): Promise<{ content: ContentDetail; questions: PlayableQuestion[]; passPercent: number } | null> {
  const content = await loadContentDetail(viewer, contentId, now);
  if (!content || content.quizCount === 0) return null;
  const [questions, settings] = await Promise.all([questionsOf(contentId), prisma.trainingContent.findUnique({ where: { id: contentId }, select: { quizPassPercent: true } })]);
  return {
    content,
    questions: questions.map((question) => ({ id: question.id, prompt: question.prompt, choices: question.choices, multiple: question.correctIndexes.length > 1 })),
    passPercent: settings?.quizPassPercent ?? 70,
  };
}

/** La correction d'UNE réponse (retour immédiat). Rien n'est enregistré : seule la tentative complète compte. */
export async function checkAnswer(viewer: AcademyViewer, contentId: string, questionId: string, chosen: unknown, now = new Date()): Promise<AnswerFeedback | null> {
  if (!(await visibleIds(viewer, [contentId], now)).has(contentId)) return null;
  const questions = await questionsOf(contentId);
  const question = questions.find((item) => item.id === questionId);
  return question ? feedbackFor(question, chosen) : null;
}

export type QuizOutcome = QuizScore & { newBadges: { title: string; kind: string }[] };

/** Une tentative complète : notée sur le serveur, enregistrée ; réussie, elle termine le contenu et donne le badge. */
export async function submitQuiz(viewer: AcademyViewer, contentId: string, answers: Record<string, unknown>, now = new Date()): Promise<QuizOutcome | null> {
  if (!(await visibleIds(viewer, [contentId], now)).has(contentId)) return null;
  const [questions, content] = await Promise.all([questionsOf(contentId), prisma.trainingContent.findUnique({ where: { id: contentId }, select: { title: true, quizPassPercent: true } })]);
  if (!content || questions.length === 0) return null;
  const result = scoreQuiz(questions, answers, content.quizPassPercent);
  await prisma.quizAttempt.create({
    data: { userId: viewer.userId, contentId, pharmacyId: viewer.pharmacyId, score: result.score, correctCount: result.correctCount, totalCount: result.totalCount, answers: result.answers, passed: result.passed },
  });
  const newBadges: QuizOutcome["newBadges"] = [];
  if (result.passed) {
    await writeProgress(viewer, contentId, { status: "DONE", percent: 100 }, now);
    if (await grantBadge(viewer.userId, { kind: "QUIZ_PASSED", dedupeKey: quizBadgeKey(contentId), title: content.title, contentId, metadata: { score: result.score } })) {
      newBadges.push({ title: content.title, kind: "QUIZ_PASSED" });
    }
    newBadges.push(...(await grantCompletedModules(viewer, contentId, now)));
  }
  return { ...result, newBadges };
}

// --- Progression ------------------------------------------------------------------------------------------

/**
 * Écrit la progression dans le contexte courant. Pour un compte gratuit (pas d'officine), l'unicité est un index
 * partiel que Prisma ne connaît pas : lecture puis création ou mise à jour, et une seconde tentative si deux écritures
 * se croisent. Une progression ne recule jamais (une vidéo revue depuis le début ne « dé-termine » rien).
 */
export async function writeProgress(viewer: AcademyViewer, contentId: string, change: { status: "IN_PROGRESS" | "DONE"; percent: number }, now = new Date()): Promise<{ status: string; percent: number }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const existing = await prisma.trainingProgress.findFirst({ where: { contentId, userId: viewer.userId, pharmacyId: viewer.pharmacyId }, select: { id: true, status: true, progressPercent: true, completedAt: true } });
    const done = existing?.status === "DONE" || change.status === "DONE";
    const percent = done ? 100 : Math.max(existing?.progressPercent ?? 0, Math.min(99, clampPercent(change.percent)));
    const data = { status: done ? ("DONE" as const) : ("IN_PROGRESS" as const), progressPercent: percent, completedAt: done ? (existing?.completedAt ?? now) : null };
    try {
      if (existing) await prisma.trainingProgress.update({ where: { id: existing.id }, data });
      else await prisma.trainingProgress.create({ data: { contentId, userId: viewer.userId, pharmacyId: viewer.pharmacyId, startedAt: now, ...data } });
      return { status: data.status, percent };
    } catch (error) {
      if (attempt === 0 && isUniqueViolation(error)) continue;
      throw error;
    }
  }
  throw new Error("Progression non enregistrée.");
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: string }).code;
  // P2002 (contrainte unique connue de Prisma) ; l'index partiel remonte parfois en erreur brute de Postgres (23505).
  return code === "P2002" || code === "23505" || String((error as { message?: string }).message ?? "").includes("23505");
}

/** Une avancée de lecture (vidéo ou fiche). Sans quiz, 90 % vus terminent le contenu. */
export async function recordWatch(viewer: AcademyViewer, contentId: string, percent: number, now = new Date()): Promise<{ status: string; percent: number; newBadges: { title: string; kind: string }[] } | null> {
  const content = await prisma.trainingContent.findFirst({ where: { AND: [contentVisibleWhere(viewer, now), { id: contentId }] }, select: { id: true, _count: { select: { quizQuestions: true } } } });
  if (!content) return null;
  const finish = completesOnWatch(content._count.quizQuestions > 0, clampPercent(percent));
  const saved = await writeProgress(viewer, contentId, { status: finish ? "DONE" : "IN_PROGRESS", percent }, now);
  const newBadges = saved.status === "DONE" ? await grantCompletedModules(viewer, contentId, now) : [];
  return { ...saved, newBadges };
}

// --- Badges et parcours -------------------------------------------------------------------------------------

/** Donne un badge s'il n'est pas déjà acquis. Rend `true` seulement s'il vient d'être gagné. Idempotent. */
export async function grantBadge(userId: string, badge: { kind: "QUIZ_PASSED" | "MODULE_COMPLETED" | "CONTENT_COMPLETED"; dedupeKey: string; title: string; contentId?: string; moduleId?: string; metadata?: Prisma.InputJsonValue }): Promise<boolean> {
  const exists = await prisma.skillBadge.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey: badge.dedupeKey } }, select: { id: true } });
  if (exists) return false;
  try {
    await prisma.skillBadge.create({ data: { userId, kind: badge.kind, dedupeKey: badge.dedupeKey, title: badge.title, contentId: badge.contentId ?? null, moduleId: badge.moduleId ?? null, metadata: badge.metadata } });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false; // deux réussites simultanées : un seul badge
    throw error;
  }
}

/** Après un contenu terminé : les parcours visibles qui le contiennent et qui sont désormais complets donnent leur badge. */
async function grantCompletedModules(viewer: AcademyViewer, contentId: string, now: Date): Promise<{ title: string; kind: string }[]> {
  const modules = await prisma.trainingModule.findMany({
    where: { isActive: true, reviewStatus: "APPROVED", items: { some: { contentId } } },
    select: { id: true, title: true, isActive: true, reviewStatus: true, publishedAt: true, isFreeAccess: true, audience: true, items: { select: { contentId: true, position: true, isRequired: true } } },
  });
  const earned: { title: string; kind: string }[] = [];
  for (const mod of modules) {
    if (!isModuleVisible(mod, viewer, now)) continue;
    const progress = await progressOfModule(viewer, mod.items, now);
    if (progress.complete && (await grantBadge(viewer.userId, { kind: "MODULE_COMPLETED", dedupeKey: moduleBadgeKey(mod.id), title: mod.title, moduleId: mod.id }))) {
      earned.push({ title: mod.title, kind: "MODULE_COMPLETED" });
    }
  }
  return earned;
}

async function progressOfModule(viewer: AcademyViewer, items: { contentId: string; position: number; isRequired: boolean }[], now: Date): Promise<ModuleProgress> {
  const ids = items.map((item) => item.contentId);
  const [visible, states] = await Promise.all([visibleIds(viewer, ids, now), personalStates(viewer.userId, ids)]);
  return moduleProgress(items.map((item) => ({ ...item, visible: visible.has(item.contentId), done: states.get(item.contentId)?.status === "DONE" })));
}

export type ModuleCard = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  coverUrl: string | null;
  audience: string;
  partnerName: string | null;
  isSponsored: boolean;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  progress: ModuleProgress;
  count: number;
  durationLabel: string | null;
};

const MODULE_SELECT = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  coverUrl: true,
  audience: true,
  isActive: true,
  reviewStatus: true,
  publishedAt: true,
  isFreeAccess: true,
  isSponsored: true,
  reviewedBy: true,
  reviewedAt: true,
  partner: { select: { name: true } },
  items: { orderBy: { position: "asc" }, select: { contentId: true, position: true, isRequired: true } },
} satisfies Prisma.TrainingModuleSelect;

type ModuleRow = Prisma.TrainingModuleGetPayload<{ select: typeof MODULE_SELECT }>;

async function moduleCard(viewer: AcademyViewer, mod: ModuleRow, now: Date): Promise<ModuleCard> {
  const ids = mod.items.map((item) => item.contentId);
  const [progress, durations] = await Promise.all([
    progressOfModule(viewer, mod.items, now),
    prisma.trainingContent.findMany({ where: { AND: [contentVisibleWhere(viewer, now), { id: { in: ids } }] }, select: { durationSeconds: true } }),
  ]);
  const seconds = durations.reduce((sum, row) => sum + (row.durationSeconds ?? 0), 0);
  return {
    id: mod.id,
    slug: mod.slug,
    title: mod.title,
    summary: mod.summary,
    coverUrl: mod.coverUrl,
    audience: mod.audience,
    partnerName: mod.partner?.name ?? null,
    isSponsored: mod.isSponsored,
    reviewedBy: mod.reviewedBy,
    reviewedAt: mod.reviewedAt,
    progress,
    count: durations.length,
    durationLabel: formatSeconds(seconds),
  };
}

export async function loadModules(viewer: AcademyViewer, now = new Date()): Promise<ModuleCard[]> {
  const rows = await prisma.trainingModule.findMany({ where: { isActive: true, reviewStatus: "APPROVED", publishedAt: { lte: now } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: MODULE_SELECT });
  const visible = rows.filter((row) => isModuleVisible(row, viewer, now));
  const cards = await Promise.all(visible.map((row) => moduleCard(viewer, row, now)));
  return cards.filter((card) => card.count > 0);
}

export async function loadModule(viewer: AcademyViewer, slug: string, now = new Date()): Promise<{ module: ModuleCard; items: (AcademyCard & { position: number; isRequired: boolean })[] } | null> {
  const row = await prisma.trainingModule.findUnique({ where: { slug }, select: MODULE_SELECT });
  if (!row || !isModuleVisible(row, viewer, now)) return null;
  const [mod, cards] = await Promise.all([moduleCard(viewer, row, now), cardsFor(viewer, { id: { in: row.items.map((item) => item.contentId) } }, now, NEWEST)]);
  const byId = new Map(cards.map((card) => [card.id, card]));
  const items = row.items.flatMap((item, index) => {
    const card = byId.get(item.contentId);
    return card ? [{ ...card, position: index + 1, isRequired: item.isRequired }] : [];
  });
  return { module: mod, items };
}

// --- Passeport et historique -----------------------------------------------------------------------------------

export type Passport = {
  badges: { id: string; kind: string; title: string; earnedAt: Date; score: number | null }[];
  history: { contentId: string; title: string; kind: string; status: string; percent: number; updatedAt: Date; completedAt: Date | null; visible: boolean; bestScore: number | null }[];
  completedCount: number;
  inProgressCount: number;
  quizzesPassed: number;
  modulesCompleted: number;
  totalSeconds: number;
};

/**
 * Le passeport (tous les badges de la personne, où qu'elle les ait gagnés) et son historique : ce qu'elle a suivi
 * hors officine et dans son officine ACTIVE. Rien d'une autre personne.
 */
export async function loadPassport(viewer: AcademyViewer, now = new Date()): Promise<Passport> {
  const [badges, progress, attempts] = await Promise.all([
    prisma.skillBadge.findMany({ where: { userId: viewer.userId }, orderBy: { earnedAt: "desc" }, select: { id: true, kind: true, title: true, earnedAt: true, metadata: true } }),
    prisma.trainingProgress.findMany({
      where: { userId: viewer.userId, OR: [{ pharmacyId: null }, ...(viewer.pharmacyId ? [{ pharmacyId: viewer.pharmacyId }] : [])] },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: { contentId: true, status: true, progressPercent: true, updatedAt: true, completedAt: true, content: { select: { title: true, kind: true, durationSeconds: true } } },
    }),
    prisma.quizAttempt.groupBy({ by: ["contentId"], where: { userId: viewer.userId }, _max: { score: true } }),
  ]);
  const best = new Map(attempts.map((row) => [row.contentId, row._max.score]));
  const visible = await visibleIds(viewer, progress.map((row) => row.contentId), now);
  const seen = new Set<string>();
  const history: Passport["history"] = [];
  let totalSeconds = 0;
  for (const row of progress) {
    if (seen.has(row.contentId)) continue;
    seen.add(row.contentId);
    if (row.status === "DONE") totalSeconds += row.content.durationSeconds ?? 0;
    history.push({ contentId: row.contentId, title: row.content.title, kind: row.content.kind, status: row.status, percent: row.status === "DONE" ? 100 : clampPercent(row.progressPercent), updatedAt: row.updatedAt, completedAt: row.completedAt, visible: visible.has(row.contentId), bestScore: best.get(row.contentId) ?? null });
  }
  return {
    badges: badges.map((badge) => ({ id: badge.id, kind: badge.kind, title: badge.title, earnedAt: badge.earnedAt, score: typeof (badge.metadata as { score?: unknown } | null)?.score === "number" ? ((badge.metadata as { score: number }).score) : null })),
    history,
    completedCount: history.filter((row) => row.status === "DONE").length,
    inProgressCount: history.filter((row) => row.status === "IN_PROGRESS").length,
    quizzesPassed: badges.filter((badge) => badge.kind === "QUIZ_PASSED").length,
    modulesCompleted: badges.filter((badge) => badge.kind === "MODULE_COMPLETED").length,
    totalSeconds,
  };
}
