import type { AudienceCode } from "./topics";

/**
 * Qui voit quoi dans l'Académie — la règle unique, pure, testée.
 *
 * Un contenu n'est montré qu'à quatre conditions : actif, relu et APPROUVÉ, publié (date de mise en ligne passée) et
 * pas échu (`validUntil` vide ou à venir). Puis le public :
 *
 * - un compte gratuit (aucune officine) ne voit que les contenus PharmaBoost ouverts aux comptes gratuits ;
 * - un collaborateur d'officine cliente voit tous les contenus PharmaBoost et ceux de SON officine active.
 *
 * Les parcours suivent la même règle, plus leur public (`audience`) : « Nouveaux collaborateurs » est proposé aux
 * comptes gratuits, aux arrivants récents d'une équipe et au titulaire (qui doit savoir ce que voient ses arrivants).
 */

export type AcademyViewer = {
  userId: string;
  /** L'officine active ; null pour un compte gratuit. */
  pharmacyId: string | null;
  /** Le métier déclaré (profil mobile). */
  profession: string | null;
  /** Le rôle dans l'officine active. */
  role: string | null;
  /** Depuis quand la personne est rattachée à l'officine active. */
  memberSince: Date | null;
};

/** Combien de jours on est un « nouveau collaborateur ». */
export const NEW_STAFF_DAYS = 90;

export type VisibilityFields = {
  isActive: boolean;
  reviewStatus: string;
  publishedAt: Date | null;
  validUntil: Date | null;
  pharmacyId: string | null;
  isFreeAccess: boolean;
};

/** Relu, publié, pas échu : la partie de la règle qui ne dépend pas de la personne. */
export function isLive(item: Pick<VisibilityFields, "isActive" | "reviewStatus" | "publishedAt"> & { validUntil?: Date | null }, now: Date): boolean {
  if (!item.isActive || item.reviewStatus !== "APPROVED") return false;
  if (!item.publishedAt || item.publishedAt.getTime() > now.getTime()) return false;
  if (item.validUntil && item.validUntil.getTime() <= now.getTime()) return false;
  return true;
}

export function isContentVisible(content: VisibilityFields, viewer: Pick<AcademyViewer, "pharmacyId">, now: Date): boolean {
  if (!isLive(content, now)) return false;
  if (viewer.pharmacyId === null) return content.pharmacyId === null && content.isFreeAccess;
  return content.pharmacyId === null || content.pharmacyId === viewer.pharmacyId;
}

/**
 * Le filtre de base de données équivalent à `isContentVisible` (la même règle, écrite pour Prisma). Les essais
 * vérifient que les deux disent la même chose.
 */
export function contentVisibleWhere(viewer: Pick<AcademyViewer, "pharmacyId">, now: Date) {
  return {
    isActive: true,
    reviewStatus: "APPROVED" as const,
    publishedAt: { not: null, lte: now },
    AND: [
      { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
      viewer.pharmacyId === null ? { pharmacyId: null, isFreeAccess: true } : { OR: [{ pharmacyId: null }, { pharmacyId: viewer.pharmacyId }] },
    ],
  };
}

export function isNewStaff(viewer: Pick<AcademyViewer, "pharmacyId" | "memberSince">, now: Date): boolean {
  if (viewer.pharmacyId === null) return true; // un compte gratuit découvre l'officine : le parcours d'arrivée lui sert.
  if (!viewer.memberSince) return false;
  return now.getTime() - viewer.memberSince.getTime() <= NEW_STAFF_DAYS * 86_400_000;
}

const PHARMACIST_PROFESSIONS = new Set(["OWNER_PHARMACIST", "ASSISTANT_PHARMACIST"]);

/** Le public d'un parcours correspond-il à la personne ? */
export function audienceMatches(audience: AudienceCode | string, viewer: AcademyViewer, now: Date): boolean {
  if (viewer.role === "OWNER") return true; // le titulaire voit tout ce que voit son équipe
  switch (audience) {
    case "ALL":
      return true;
    case "NEW_STAFF":
      return isNewStaff(viewer, now);
    case "STUDENT":
      return viewer.profession === "PHARMACY_STUDENT" || viewer.role === "STUDENT";
    case "TECHNICIAN":
      return viewer.profession === "TECHNICIAN" || viewer.role === "TECHNICIAN";
    case "PHARMACIST":
      return PHARMACIST_PROFESSIONS.has(viewer.profession ?? "") || viewer.role === "PHARMACIST";
    case "OWNER":
      return viewer.profession === "OWNER_PHARMACIST";
    default:
      return false;
  }
}

export type ModuleVisibilityFields = {
  isActive: boolean;
  reviewStatus: string;
  publishedAt: Date | null;
  isFreeAccess: boolean;
  audience: string;
};

export function isModuleVisible(module: ModuleVisibilityFields, viewer: AcademyViewer, now: Date): boolean {
  if (!isLive(module, now)) return false;
  if (viewer.pharmacyId === null && !module.isFreeAccess) return false;
  return audienceMatches(module.audience, viewer, now);
}
