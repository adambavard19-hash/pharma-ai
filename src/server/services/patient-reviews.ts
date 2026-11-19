import "server-only";
import { prisma } from "@/server/db/client";
import type { TenantScope } from "@/server/db/tenant";
import type { AppMemberView } from "@/server/services/app-members";
import { averageRating, cleanReview, REVIEW_COOLDOWN_MS, testimonialSentence, TESTIMONIAL_MIN_RATING, type ReviewInput } from "@/core/patient-app/reviews";

/**
 * Les avis des patients (18 nov. 2026) : laissés dans l'appli sur LEUR pharmacie PharmaBoost, lus par le collaborateur choisi
 * (ses seuls avis) et par le titulaire (toute l'officine). Aucune donnée de santé : note et mots tout prêts.
 */

export type TeamChoice = { userId: string; firstName: string };

/** Les prénoms de l'équipe de la pharmacie du patient, pour qu'il dise qui l'a servi. Rien d'autre que le prénom. */
export async function teamForMember(member: AppMemberView): Promise<TeamChoice[]> {
  if (!member.homePharmacy) return [];
  const rows = await prisma.membership.findMany({
    where: { pharmacyId: member.homePharmacy.id, isActive: true, user: { deletedAt: null, status: "ACTIVE" } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { user: { select: { id: true, firstName: true } } },
    take: 40,
  });
  return rows.map((row) => ({ userId: row.user.id, firstName: row.user.firstName.trim().split(/\s+/)[0] ?? row.user.firstName })).filter((row) => row.firstName);
}

export async function submitReview(member: AppMemberView, input: ReviewInput, now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const pharmacy = member.homePharmacy;
  if (!pharmacy) return { ok: false, error: "Choisissez d'abord votre pharmacie PharmaBoost dans « Mon espace »." };
  const cleaned = cleanReview(input);
  if (!cleaned.ok) return cleaned;
  const review = cleaned.review;

  const recent = await prisma.patientReview.findFirst({
    where: { appMemberId: member.id, pharmacyId: pharmacy.id, createdAt: { gte: new Date(now.getTime() - REVIEW_COOLDOWN_MS) } },
    select: { id: true },
  });
  if (recent) return { ok: false, error: "Vous avez déjà donné votre avis aujourd'hui. Merci !" };

  // Le collaborateur doit être de CETTE pharmacie : un identifiant forgé ne vise personne.
  let staff: { id: string; firstName: string } | null = null;
  if (review.staffUserId) {
    const row = await prisma.membership.findFirst({
      where: { pharmacyId: pharmacy.id, userId: review.staffUserId, isActive: true, user: { deletedAt: null } },
      select: { user: { select: { id: true, firstName: true } } },
    });
    if (!row) return { ok: false, error: "Ce collaborateur n'est pas dans votre pharmacie." };
    staff = { id: row.user.id, firstName: row.user.firstName.trim().split(/\s+/)[0] ?? row.user.firstName };
  }

  await prisma.patientReview.create({
    data: {
      pharmacyId: pharmacy.id,
      appMemberId: member.id,
      staffUserId: staff?.id ?? null,
      staffFirstName: staff?.firstName ?? null,
      rating: review.rating,
      tags: review.tags,
      publicConsent: review.publicConsent,
      publicName: review.publicName,
      createdAt: now,
    },
  });
  return { ok: true };
}

export type ReviewRow = { id: string; rating: number; tags: string[]; staffFirstName: string | null; staffUserId: string | null; createdAt: Date };

export type PharmacyReviews = {
  /** Toute l'officine (titulaire) ou ses seuls avis (collaborateur). */
  teamView: boolean;
  total: number;
  average: number | null;
  last30: number;
  rows: ReviewRow[];
  byStaff: { staffUserId: string | null; firstName: string; count: number; average: number | null }[];
  tagCounts: { key: string; count: number }[];
};

export async function getPharmacyReviews(scope: TenantScope, teamView: boolean, now = new Date()): Promise<PharmacyReviews> {
  const where = { pharmacyId: scope.pharmacyId, ...(teamView ? {} : { staffUserId: scope.userId }) };
  const all = await prisma.patientReview.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 2000,
    select: { id: true, rating: true, tags: true, staffFirstName: true, staffUserId: true, createdAt: true },
  });
  const since = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const staff = new Map<string, { staffUserId: string | null; firstName: string; ratings: number[] }>();
  const tags = new Map<string, number>();
  for (const row of all) {
    const key = row.staffUserId ?? "equipe";
    const entry = staff.get(key) ?? { staffUserId: row.staffUserId, firstName: row.staffFirstName ?? "L'équipe", ratings: [] };
    entry.ratings.push(row.rating);
    staff.set(key, entry);
    for (const tag of row.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
  }
  return {
    teamView,
    total: all.length,
    average: averageRating(all.map((row) => row.rating)),
    last30: all.filter((row) => row.createdAt.getTime() >= since).length,
    rows: all.slice(0, 100),
    byStaff: [...staff.values()]
      .map((entry) => ({ staffUserId: entry.staffUserId, firstName: entry.firstName, count: entry.ratings.length, average: averageRating(entry.ratings) }))
      .sort((a, b) => b.count - a.count),
    tagCounts: [...tags.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
  };
}

export type Testimonial = { id: string; name: string; city: string | null; rating: number; sentence: string };

/** Les témoignages publiables sur le site : 4 étoiles et plus, accord du patient, pharmacies réelles (jamais la démo). */
export async function publicTestimonials(limit = 6): Promise<Testimonial[]> {
  const rows = await prisma.patientReview.findMany({
    where: { publicConsent: true, rating: { gte: TESTIMONIAL_MIN_RATING }, pharmacy: { isDemo: false, isActive: true } },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { id: true, rating: true, tags: true, publicName: true, pharmacy: { select: { city: true } } },
  });
  const out: Testimonial[] = [];
  for (const row of rows) {
    const sentence = testimonialSentence(row.tags);
    if (!sentence) continue;
    out.push({ id: row.id, name: row.publicName ?? "Un patient", city: row.pharmacy.city, rating: row.rating, sentence });
    if (out.length >= limit) break;
  }
  return out;
}
