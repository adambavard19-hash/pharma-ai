import "server-only";
import { prisma } from "@/server/db/client";
import type { Prisma } from "@/generated/prisma";
import type { TenantScope } from "@/server/db/tenant";
import { loadTeamChallenges } from "@/server/services/team-ranking";
import { formatDuration } from "@/core/training/content";

/**
 * L'écran d'accueil de PharmaBoost Mobile : ce qu'il lit, et rien de plus.
 *
 * Deux publics. Le compte gratuit ne voit que des contenus PharmaBoost ouverts à tous (`isFreeAccess`), sa propre
 * progression hors officine, et les nouveautés partenaires publiées. Le collaborateur d'une officine cliente voit en
 * plus les contenus de SON officine, sa progression DANS cette officine et les challenges de cette officine — toujours
 * par la portée de la session (`scope`), jamais par un identifiant reçu.
 */

/** Ce que l'application mobile accepte de montrer d'un contenu : en ligne, relu, dans sa période de validité. */
export function mobileVisibleTrainingWhere(scope: Pick<TenantScope, "pharmacyId"> | null, now: Date): Prisma.TrainingContentWhereInput {
  return {
    isActive: true,
    reviewStatus: "APPROVED",
    AND: [
      { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
      scope ? { OR: [{ pharmacyId: null }, { pharmacyId: scope.pharmacyId }] } : { pharmacyId: null, isFreeAccess: true },
    ],
  };
}

export type ContinueCard = {
  contentId: string;
  title: string;
  kindLabel: string;
  durationLabel: string | null;
  percent: number;
  mode: "continue" | "start";
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

  const next = await prisma.trainingContent.findFirst({
    where: { ...visible, progress: { none: { userId } } },
    orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    select,
  });
  return next ? card(next, 0, "start") : null;
}

function card(content: { id: string; title: string; kind: string; durationMinutes: number | null; durationSeconds: number | null }, percent: number, mode: ContinueCard["mode"]): ContinueCard {
  return { contentId: content.id, title: content.title, kindLabel: KIND_WORDS[content.kind] ?? "Formation", durationLabel: durationOf(content), percent: Math.max(0, Math.min(100, percent)), mode };
}

export type LaunchCard = { id: string; title: string; summary: string | null; brandName: string; posterUrl: string | null; publishedAt: Date | null };

/**
 * « Nouveautés partenaires » : seulement ce qui est relu, validé sur le plan réglementaire, publié, pas échu, d'une
 * marque et d'un partenaire actifs. Vide tant que la console des partenaires (étape suivante) n'a rien publié.
 */
export async function loadPartnerLaunches(now = new Date(), limit = 8): Promise<LaunchCard[]> {
  const rows = await prisma.partnerLaunch.findMany({
    where: {
      reviewStatus: "APPROVED",
      regulatoryValidatedAt: { not: null },
      publishedAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      brand: { status: "ACTIVE" },
      partner: { status: "ACTIVE" },
    },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: { id: true, title: true, summary: true, posterUrl: true, publishedAt: true, brand: { select: { name: true } } },
  });
  return rows.map((row) => ({ id: row.id, title: row.title, summary: row.summary, brandName: row.brand.name, posterUrl: row.posterUrl, publishedAt: row.publishedAt }));
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
