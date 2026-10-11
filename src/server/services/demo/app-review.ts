import "server-only";
import { prisma } from "@/server/db/client";
import { hashPassword } from "@/server/security/password";
import { brandKey, brandLabelOf } from "@/core/catalog/brand";
import { calendarDay, dayKeyToDate } from "@/core/challenges/dates";
import { periodBounds } from "@/core/personal/objectives";
import { APP_REVIEW_MEMBER, DEMO_ORGANIZATION_SLUG, DEMO_PHARMACY_SLUG, DEMO_TEAM } from "@/core/demo/identity";

/**
 * Le compte des vérificateurs d'Apple (TestFlight, App Store), dans l'officine de démonstration commerciale.
 *
 * Il ne voit que des données fictives : l'officine de démonstration est isolée (son groupe, ses ventes, son stock
 * fictifs) ; il est pharmacien adjoint, ni titulaire ni administrateur de PharmaBoost. Ses exemples (un challenge en
 * cours, un objectif du mois, une prime validée) portent le mot « Exemple » et la marque ci-dessous ; ils sont remis à
 * chaque réinitialisation de la démo.
 */
const MARKER = "exemple:revue-apple";

/** Crée le compte (ou remet son mot de passe et son rattachement), puis ses exemples. L'officine de démonstration doit exister. */
export async function ensureAppReviewAccount(password: string, now = new Date()): Promise<{ userId: string; pharmacyId: string; created: boolean }> {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { slug: DEMO_PHARMACY_SLUG }, select: { id: true, isDemo: true, organizationId: true, organization: { select: { slug: true } } } });
  if (!pharmacy) throw new Error("L'officine de démonstration n'existe pas encore.");
  if (!pharmacy.isDemo || pharmacy.organization.slug !== DEMO_ORGANIZATION_SLUG) throw new Error("L'officine désignée n'est pas l'officine de démonstration : refus.");

  const existing = await prisma.user.findUnique({ where: { email: APP_REVIEW_MEMBER.email }, select: { id: true, organizationId: true } });
  if (existing && existing.organizationId !== pharmacy.organizationId) throw new Error(`${APP_REVIEW_MEMBER.email} appartient à un autre groupe : refus.`);

  const passwordHash = await hashPassword(password);
  const identity = { firstName: APP_REVIEW_MEMBER.firstName, lastName: APP_REVIEW_MEMBER.lastName, profession: APP_REVIEW_MEMBER.profession, status: "ACTIVE" as const, deletedAt: null, passwordHash, mobileOnboardedAt: now };
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: identity, select: { id: true } })
    : await prisma.user.create({ data: { ...identity, organizationId: pharmacy.organizationId, email: APP_REVIEW_MEMBER.email }, select: { id: true } });
  await prisma.membership.upsert({
    where: { userId_pharmacyId: { userId: user.id, pharmacyId: pharmacy.id } },
    create: { userId: user.id, pharmacyId: pharmacy.id, role: APP_REVIEW_MEMBER.role, isActive: true, isPrincipal: false, sortOrder: DEMO_TEAM.length + 1 },
    update: { role: APP_REVIEW_MEMBER.role, isActive: true, grantedPermissions: [], revokedPermissions: [] },
  });
  // Les anciennes sessions tombent avec l'ancien mot de passe.
  await prisma.session.deleteMany({ where: { userId: user.id } });

  const owner = await prisma.user.findUnique({ where: { email: DEMO_TEAM[0].email }, select: { id: true } });
  await seedAppReviewExamples({ pharmacyId: pharmacy.id, ownerId: owner?.id ?? user.id, now });
  return { userId: user.id, pharmacyId: pharmacy.id, created: !existing };
}

/** Le challenge, l'objectif et la prime d'exemple du compte des vérificateurs. Rien si le compte n'existe pas ; idempotent. */
export async function seedAppReviewExamples(input: { pharmacyId: string; ownerId: string; now?: Date }): Promise<void> {
  const reviewer = await prisma.user.findUnique({ where: { email: APP_REVIEW_MEMBER.email }, select: { id: true, memberships: { where: { pharmacyId: input.pharmacyId, isActive: true }, select: { id: true } } } });
  if (!reviewer?.memberships?.length) return;
  const { pharmacyId, ownerId } = input;
  const pharmacy = await prisma.pharmacy.findUniqueOrThrow({ where: { id: pharmacyId }, select: { timezone: true, isDemo: true } });
  if (!pharmacy.isDemo) return;
  const month = periodBounds("MONTH", calendarDay(input.now ?? new Date(), pharmacy.timezone ?? "Europe/Paris"));

  let challenge = await prisma.labChallenge.findFirst({ where: { pharmacyId, notes: MARKER }, select: { id: true } });
  if (!challenge) {
    const products = await prisma.product.findMany({ where: { pharmacyId, deletedAt: null, isActive: true }, select: { name: true, brand: true } });
    const counts = new Map<string, number>();
    for (const product of products) {
      const label = brandLabelOf(product.name, product.brand);
      if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    const brand = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (brand) {
      challenge = await prisma.labChallenge.create({
        data: {
          pharmacyId,
          title: `Exemple · Challenge ${brand}`,
          laboratory: brand,
          brandKey: brandKey(brand),
          startsAt: dayKeyToDate(month.startsOn),
          endsAt: dayKeyToDate(month.endsOn),
          targetUnits: 30,
          tiers: [{ units: 10, bonusCents: 0 }, { units: 20, bonusCents: 0 }, { units: 30, bonusCents: 0 }],
          status: "ACTIVE",
          countMode: "ALL_SALES",
          notes: MARKER,
          createdByUserId: ownerId,
        },
        select: { id: true },
      });
    }
  }

  const objective =
    (await prisma.personalObjective.findFirst({ where: { pharmacyId, userId: reviewer.id, archivedAt: null }, select: { id: true } })) ??
    (await prisma.personalObjective.create({
      data: { pharmacyId, userId: reviewer.id, title: "Exemple · 15 conseils validés ce mois", metric: "ADVICE_SOLD", target: 15, period: "MONTH", startsOn: dayKeyToDate(month.startsOn), endsOn: dayKeyToDate(month.endsOn), challengeId: challenge?.id ?? null, createdByUserId: ownerId },
      select: { id: true },
    }));

  if ((await prisma.bonusAuthorization.count({ where: { pharmacyId, userId: reviewer.id, note: MARKER } })) === 0) {
    await prisma.bonusAuthorization.create({
      data: { pharmacyId, userId: reviewer.id, objectiveId: objective.id, label: "Exemple · Prime du mois", amountCents: 4000, status: "VALIDATED", proposedByUserId: ownerId, validatedByUserId: ownerId, validatedAt: input.now ?? new Date(), note: MARKER },
    });
  }
}
