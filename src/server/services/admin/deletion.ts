import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { isCommercialDemoPharmacy } from "@/core/demo/identity";
import { ensurePrincipal } from "@/server/services/team-management";
import {
  DELETION_REASON_MIN_LENGTH,
  confirmationMatches,
  pharmacyDeletionBlockers,
  tombstoneEmail,
  userDeletionBlockers,
  type DeletionBlocker,
} from "@/core/admin/deletion";

/**
 * Supprimer une officine, un compte, ou retirer un compte d'une officine : les gestes de l'espace administrateur.
 *
 * Trois principes :
 *   • TOUT est revérifié ici — l'existence, les protections (`core/admin/deletion.ts`), le nom retapé. L'écran
 *     n'est qu'une aide ; un appel direct n'a pas de bouton à contourner.
 *   • UNE transaction : une suppression à moitié faite (l'officine partie, ses comptes restés) n'existe pas.
 *   • RIEN n'est rendu faussement disparu : les traces (journal d'audit, contrats signés, prospects) restent, sans
 *     l'officine qu'elles citaient ; ce que l'on efface, c'est ce qui appartenait à l'officine.
 */

type Failure = { ok: false; error: string };

export type PharmacyDeletionImpact = {
  pharmacyId: string;
  organizationId: string;
  name: string;
  city: string | null;
  siret: string | null;
  isDemo: boolean;
  counts: { users: number; patients: number; prescriptions: number; sales: number; products: number; partnerOrders: number; contracts: number };
  /** Comptes qui n'ont que cette officine : ils disparaissent avec elle. */
  usersDeleted: number;
  /** Comptes qui travaillent aussi ailleurs : seulement retirés de cette officine. */
  usersKept: number;
  /** Dernière officine de son organisation : l'organisation et son abonnement disparaissent aussi. */
  deletesOrganization: boolean;
  blockers: DeletionBlocker[];
};

/** Ce qu'une suppression emporterait, et ce qui l'interdit. Lecture seule : sert à l'écran ET au geste lui-même. */
export async function loadPharmacyDeletionImpact(pharmacyId: string): Promise<PharmacyDeletionImpact | null> {
  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id: pharmacyId },
    select: { id: true, name: true, city: true, siret: true, slug: true, isDemo: true, organizationId: true, organization: { select: { subscription: { select: { status: true, stripeSubscriptionId: true } } } } },
  });
  if (!pharmacy) return null;

  const members = await prisma.membership.findMany({ where: { pharmacyId }, select: { userId: true } });
  const memberIds = [...new Set(members.map((member) => member.userId))];
  const [patients, prescriptions, sales, products, partnerOrders, contracts, payments, siblings, elsewhere] = await Promise.all([
    prisma.patient.count({ where: { pharmacyId } }),
    prisma.prescription.count({ where: { pharmacyId } }),
    prisma.sale.count({ where: { pharmacyId } }),
    prisma.product.count({ where: { pharmacyId, deletedAt: null } }),
    prisma.partnerOrder.count({ where: { pharmacyId } }),
    prisma.contract.count({ where: { pharmacyId } }),
    prisma.billingPayment.count({ where: { organizationId: pharmacy.organizationId } }),
    prisma.pharmacy.count({ where: { organizationId: pharmacy.organizationId, id: { not: pharmacyId } } }),
    memberIds.length > 0 ? prisma.membership.findMany({ where: { userId: { in: memberIds }, pharmacyId: { not: pharmacyId } }, select: { userId: true } }) : Promise.resolve([]),
  ]);
  const keptIds = new Set(elsewhere.map((member) => member.userId));

  return {
    pharmacyId: pharmacy.id,
    organizationId: pharmacy.organizationId,
    name: pharmacy.name,
    city: pharmacy.city,
    siret: pharmacy.siret,
    isDemo: pharmacy.isDemo,
    counts: { users: memberIds.length, patients, prescriptions, sales, products, partnerOrders, contracts },
    usersDeleted: memberIds.filter((id) => !keptIds.has(id)).length,
    usersKept: memberIds.filter((id) => keptIds.has(id)).length,
    deletesOrganization: siblings === 0,
    blockers: pharmacyDeletionBlockers({
      isCommercialDemo: isCommercialDemoPharmacy(pharmacy),
      subscription: pharmacy.organization.subscription,
      paymentCount: payments,
    }),
  };
}

/**
 * Supprime l'officine et tout ce qui lui appartenait : patients, ordonnances, ventes, stock, équipe. Les comptes qui
 * ne travaillaient que là disparaissent ; ceux qui travaillent aussi ailleurs en sont simplement retirés. Si c'était la
 * dernière officine de son organisation, l'organisation et son abonnement partent avec elle.
 *
 * Reste : le journal d'audit (sans l'officine), les contrats signés, les prospects et commissions de l'extranet.
 */
export async function deletePharmacy(input: { pharmacyId: string; typedName: string; reason: string; adminId: string }): Promise<{ ok: true; name: string; usersDeleted: number; usersKept: number; organizationDeleted: boolean } | Failure> {
  const reason = input.reason.trim();
  if (reason.length < DELETION_REASON_MIN_LENGTH) return { ok: false, error: `Indiquez le motif (${DELETION_REASON_MIN_LENGTH} caractères au moins).` };

  const impact = await loadPharmacyDeletionImpact(input.pharmacyId);
  if (!impact) return { ok: false, error: "Officine introuvable : elle a peut-être déjà été supprimée." };
  if (!confirmationMatches(impact.name, input.typedName)) return { ok: false, error: "Le nom retapé ne correspond pas à celui de l'officine : rien n'a été supprimé." };
  if (impact.blockers.length > 0) return { ok: false, error: impact.blockers.map((blocker) => blocker.message).join(" ") };

  const { organizationId } = impact;

  const outcome = await prisma.$transaction(
    async (tx) => {
      const members = await tx.membership.findMany({ where: { pharmacyId: input.pharmacyId }, select: { userId: true } });
      const memberIds = [...new Set(members.map((member) => member.userId))];
      const elsewhere = memberIds.length > 0 ? await tx.membership.findMany({ where: { userId: { in: memberIds }, pharmacyId: { not: input.pharmacyId } }, select: { userId: true } }) : [];
      const keptIds = new Set(elsewhere.map((member) => member.userId));
      const orphanIds = memberIds.filter((id) => !keptIds.has(id));

      // Les sessions d'abord : une session garde un utilisateur connecté, et ne suit pas l'officine en cascade.
      await tx.session.deleteMany({ where: { OR: [{ pharmacyId: input.pharmacyId }, ...(orphanIds.length > 0 ? [{ userId: { in: orphanIds } }] : [])] } });
      // L'officine : la base supprime en cascade tout ce qui lui appartient (patients, ordonnances, stock, équipe…).
      await tx.pharmacy.delete({ where: { id: input.pharmacyId } });
      if (orphanIds.length > 0) await tx.user.deleteMany({ where: { id: { in: orphanIds } } });

      const remaining = await tx.pharmacy.count({ where: { organizationId } });
      let organizationDeleted = false;
      if (remaining === 0) {
        await tx.organization.delete({ where: { id: organizationId } });
        organizationDeleted = true;
      }
      return { usersDeleted: orphanIds.length, usersKept: keptIds.size, organizationDeleted };
    },
    // Une officine réelle pèse des dizaines de milliers de lignes : la limite par défaut (5 s) ne suffit pas.
    { timeout: 120_000, maxWait: 15_000 },
  );

  // Le journal est écrit APRÈS : l'officine n'existe plus, la trace la cite par son identifiant et son nom.
  await recordAudit({
    action: "platform.pharmacy_deleted",
    entityType: "Pharmacy",
    entityId: input.pharmacyId,
    platformAdminId: input.adminId,
    metadata: { name: impact.name, city: impact.city, siret: impact.siret, isDemo: impact.isDemo, reason, counts: impact.counts, ...outcome },
  });
  return { ok: true, name: impact.name, ...outcome };
}

/** Les officines dont ce compte est le SEUL titulaire actif (celles-là ne peuvent pas perdre leur titulaire). */
async function soleOwnerships(userId: string): Promise<{ pharmacyName: string; otherActiveOwners: number }[]> {
  const owned = await prisma.membership.findMany({ where: { userId, role: "OWNER", isActive: true }, select: { pharmacyId: true, pharmacy: { select: { name: true } } } });
  const result: { pharmacyName: string; otherActiveOwners: number }[] = [];
  for (const membership of owned) {
    const others = await prisma.membership.count({ where: { pharmacyId: membership.pharmacyId, role: "OWNER", isActive: true, userId: { not: userId }, user: { deletedAt: null } } });
    result.push({ pharmacyName: membership.pharmacy.name, otherActiveOwners: others });
  }
  return result;
}

/**
 * Pour la liste des utilisateurs : pour chaque compte, les officines dont il est le seul titulaire (le bouton
 * « Supprimer » s'y désactive, avec la raison). Deux requêtes pour toute la page, pas une par ligne.
 */
export async function soleOwnerPharmaciesByUser(userIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (userIds.length === 0) return result;
  const owned = await prisma.membership.findMany({ where: { userId: { in: userIds }, role: "OWNER", isActive: true }, select: { userId: true, pharmacyId: true, pharmacy: { select: { name: true } } } });
  if (owned.length === 0) return result;
  const counts = await prisma.membership.groupBy({ by: ["pharmacyId"], where: { pharmacyId: { in: [...new Set(owned.map((m) => m.pharmacyId))] }, role: "OWNER", isActive: true, user: { deletedAt: null } }, _count: { _all: true } });
  const ownersByPharmacy = new Map(counts.map((row) => [row.pharmacyId, row._count._all]));
  for (const membership of owned) {
    if ((ownersByPharmacy.get(membership.pharmacyId) ?? 0) <= 1) result.set(membership.userId, [...(result.get(membership.userId) ?? []), membership.pharmacy.name]);
  }
  return result;
}

/**
 * Supprime un compte, partout. Le compte est marqué supprimé et rendu anonyme (adresse, téléphone, RPPS, mot de
 * passe) : son adresse e-mail est LIBRE de nouveau, et rien ne permet plus de se connecter avec. Son nom reste sur
 * l'historique (qui a vérifié telle ordonnance), comme une signature : c'est une trace, pas un compte.
 */
export async function deleteUserAccount(input: { userId: string; adminId: string }): Promise<{ ok: true; name: string; pharmacies: string[] } | Failure> {
  const user = await prisma.user.findFirst({
    where: { id: input.userId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, memberships: { select: { pharmacyId: true, pharmacy: { select: { name: true } } } } },
  });
  if (!user) return { ok: false, error: "Compte introuvable : il a peut-être déjà été supprimé." };
  const name = `${user.firstName} ${user.lastName}`;

  const blockers = userDeletionBlockers({ userName: name, ownerships: await soleOwnerships(user.id) });
  if (blockers.length > 0) return { ok: false, error: blockers.map((blocker) => blocker.message).join(" ") };

  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.notification.deleteMany({ where: { userId: user.id } }),
    prisma.membership.deleteMany({ where: { userId: user.id } }),
    prisma.user.update({
      where: { id: user.id },
      data: { deletedAt: new Date(), status: "DISABLED", email: tombstoneEmail(user.id), passwordHash: null, passwordResetTokenHash: null, passwordResetExpiresAt: null, phone: null, avatarUrl: null, rppsNumber: null },
    }),
  ]);

  // Si ce compte était le titulaire principal d'une officine, le suivant reprend le rôle.
  for (const membership of user.memberships) await ensurePrincipal(prisma, membership.pharmacyId);
  const pharmacies = user.memberships.map((membership) => membership.pharmacy.name);
  await recordAudit({ action: "platform.user_deleted", entityType: "User", entityId: user.id, platformAdminId: input.adminId, metadata: { name, pharmacies } });
  return { ok: true, name, pharmacies };
}

/**
 * Le geste de la fiche d'une officine, sur un compte. Un compte qui travaille AUSSI dans une autre officine n'en est
 * que retiré : le supprimer ici le supprimerait partout (c'était le défaut de l'ancien geste). Sinon, le compte est
 * supprimé comme ci-dessus.
 */
export async function removeMemberFromPharmacy(input: { pharmacyId: string; membershipId: string; adminId: string }): Promise<{ ok: true; name: string; accountDeleted: boolean } | Failure> {
  const membership = await prisma.membership.findFirst({
    where: { id: input.membershipId, pharmacyId: input.pharmacyId },
    select: { id: true, role: true, isActive: true, userId: true, pharmacy: { select: { name: true } }, user: { select: { firstName: true, lastName: true } } },
  });
  if (!membership) return { ok: false, error: "Compte introuvable dans cette officine." };
  const name = `${membership.user.firstName} ${membership.user.lastName}`;

  const elsewhere = await prisma.membership.count({ where: { userId: membership.userId, id: { not: membership.id } } });
  if (elsewhere === 0) {
    const deleted = await deleteUserAccount({ userId: membership.userId, adminId: input.adminId });
    return deleted.ok ? { ok: true, name, accountDeleted: true } : deleted;
  }

  if (membership.role === "OWNER" && membership.isActive) {
    const others = await prisma.membership.count({ where: { pharmacyId: input.pharmacyId, role: "OWNER", isActive: true, userId: { not: membership.userId }, user: { deletedAt: null } } });
    const blockers = userDeletionBlockers({ userName: name, ownerships: [{ pharmacyName: membership.pharmacy.name, otherActiveOwners: others }] });
    if (blockers.length > 0) return { ok: false, error: blockers.map((blocker) => blocker.message).join(" ") };
  }

  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId: membership.userId, pharmacyId: input.pharmacyId } }),
    prisma.membership.delete({ where: { id: membership.id } }),
  ]);
  await ensurePrincipal(prisma, input.pharmacyId);
  await recordAudit({ action: "platform.member_removed", entityType: "User", entityId: membership.userId, pharmacyId: input.pharmacyId, platformAdminId: input.adminId, metadata: { name, role: membership.role } });
  return { ok: true, name, accountDeleted: false };
}

/**
 * Libère les adresses e-mail des comptes supprimés AVANT ce correctif : l'ancien geste gardait leur adresse, qui
 * restait donc inutilisable (« cette adresse appartient à un compte supprimé »). Même anonymisation que ci-dessus ;
 * idempotent (un compte déjà libéré n'est pas retouché).
 */
export async function releaseDeletedUserEmails(): Promise<{ released: number }> {
  const stale = await prisma.user.findMany({
    where: { deletedAt: { not: null }, NOT: { email: { endsWith: "@suppression.pharmaboost.invalid" } } },
    select: { id: true },
  });
  for (const user of stale) {
    await prisma.user.update({
      where: { id: user.id },
      data: { email: tombstoneEmail(user.id), passwordHash: null, passwordResetTokenHash: null, passwordResetExpiresAt: null, phone: null, avatarUrl: null, rppsNumber: null },
    });
  }
  return { released: stale.length };
}
