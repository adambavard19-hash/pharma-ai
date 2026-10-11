import "server-only";
import { prisma } from "@/server/db/client";
import type { Prisma } from "@/generated/prisma";
import type { TenantScope } from "@/server/db/tenant";
import { loadTeamChallenges } from "@/server/services/team-ranking";
import { formatDuration } from "@/core/training/content";
import { contentVisibleWhere } from "@/core/academy/visibility";
import { loadPartnerNews, type HomeViewer, type PartnerNewsItem } from "./discover-home";

/**
 * L'écran d'accueil de PharmaBoost Mobile : ce qu'il lit, et rien de plus.
 *
 * Deux publics. Le compte gratuit ne voit que des contenus PharmaBoost ouverts à tous (`isFreeAccess`), sa propre
 * progression hors officine, et les nouveautés partenaires publiées. Le collaborateur d'une officine cliente voit en
 * plus les contenus de SON officine, sa progression DANS cette officine et les challenges de cette officine — toujours
 * par la portée de la session (`scope`), jamais par un identifiant reçu.
 */

/**
 * Ce que l'application mobile accepte de montrer d'un contenu : en ligne, relu et approuvé, PUBLIÉ (date de mise en
 * ligne passée), dans sa période de validité, ouvert à ce public. La règle vit dans `core/academy/visibility` (étape
 * Formations) ; ce nom reste pour les lecteurs existants.
 */
export function mobileVisibleTrainingWhere(scope: Pick<TenantScope, "pharmacyId"> | null, now: Date): Prisma.TrainingContentWhereInput {
  return contentVisibleWhere({ pharmacyId: scope ? scope.pharmacyId : null }, now);
}

export type ContinueCard = {
  contentId: string;
  title: string;
  kindLabel: string;
  durationLabel: string | null;
  percent: number;
  mode: "continue" | "start";
  /** Le détail du contenu dans l'onglet Formations. */
  href: string;
};

const KIND_WORDS: Record<string, string> = { VIDEO: "Vidéo", MICRO_VIDEO: "Micro-vidéo", SHEET: "Fiche", DOCUMENT: "Document", EXTERNAL_LINK: "Lien officiel", QUIZ: "Quiz" };

function durationOf(content: { durationSeconds: number | null; durationMinutes: number | null }): string | null {
  if (content.durationSeconds) return content.durationSeconds < 90 ? `${content.durationSeconds} s` : formatDuration(Math.round(content.durationSeconds / 60));
  return formatDuration(content.durationMinutes);
}

/** « Continuer ma formation » : le dernier contenu commencé, sinon le premier à découvrir, sinon rien. */
export async function loadContinueCard(userId: string, scope: Pick<TenantScope, "pharmacyId"> | null, now = new Date()): Promise<ContinueCard | null> {
  const visible = mobileVisibleTrainingWhere(scope, now);
  const select = { id: true, title: true, kind: true, durationMinutes: true, durationSeconds: true } as const;
  const started = await prisma.trainingProgress.findFirst({
    where: { userId, pharmacyId: scope ? scope.pharmacyId : null, status: "IN_PROGRESS", content: visible },
    orderBy: { updatedAt: "desc" },
    select: { progressPercent: true, content: { select } },
  });
  if (started) return card(started.content, started.progressPercent, "continue");

  // À découvrir : d'abord la suite d'un parcours publié (dans son ordre), sinon le contenu le plus récent.
  const inPath = await prisma.trainingModuleItem.findFirst({
    where: {
      module: { isActive: true, reviewStatus: "APPROVED", publishedAt: { lte: now }, ...(scope ? {} : { isFreeAccess: true }) },
      content: { AND: [visible, { progress: { none: { userId } } }] },
    },
    orderBy: [{ module: { sortOrder: "asc" } }, { position: "asc" }],
    select: { content: { select } },
  });
  if (inPath) return card(inPath.content, 0, "start");
  const next = await prisma.trainingContent.findFirst({
    where: { ...visible, progress: { none: { userId } } },
    orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    select,
  });
  return next ? card(next, 0, "start") : null;
}

function card(content: { id: string; title: string; kind: string; durationMinutes: number | null; durationSeconds: number | null }, percent: number, mode: ContinueCard["mode"]): ContinueCard {
  return { contentId: content.id, title: content.title, kindLabel: KIND_WORDS[content.kind] ?? "Formation", durationLabel: durationOf(content), percent: Math.max(0, Math.min(100, percent)), mode, href: `/m/formations/${content.id}` };
}

export type LaunchCard = PartnerNewsItem;

/**
 * « Nouveautés partenaires » (étape Découvertes) : les campagnes sponsorisées de l'accueil (« Sponsorisé »), puis les
 * nouveautés publiées des marques (« Partenaire ») — seulement ce qui est relu, validé sur le plan réglementaire (nom
 * et date), publié, non échu, d'une marque et d'un partenaire visibles pour CETTE personne (préférences de son
 * officine comprises). Sans session : le public le plus restreint (compte gratuit).
 */
export async function loadPartnerLaunches(now = new Date(), who: HomeViewer | null = null, limit = 8): Promise<LaunchCard[]> {
  return loadPartnerNews(now, who, limit);
}

export type MyChallenge = { id: string; title: string; laboratory: string; daysRemaining: number; myUnits: number; teamUnits: number; target: number | null; rank: number | null; people: number };

/** « Mes challenges » : les challenges en cours de l'officine ACTIVE, vus depuis la personne connectée. */
export async function loadMyChallenges(scope: TenantScope): Promise<MyChallenge[]> {
  const challenges = await loadTeamChallenges(scope);
  return challenges.map((challenge) => {
    const index = challenge.people.findIndex((person) => person.userId === scope.userId);
    return {
      id: challenge.id,
      title: challenge.title,
      laboratory: challenge.laboratory,
      daysRemaining: challenge.daysRemaining,
      myUnits: index >= 0 ? challenge.people[index].units : 0,
      teamUnits: challenge.units,
      target: challenge.target,
      rank: index >= 0 ? index + 1 : null,
      people: challenge.people.length,
    };
  });
}
