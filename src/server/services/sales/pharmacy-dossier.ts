import "server-only";
import { prisma } from "@/server/db/client";
import { recordProspectEvent, type SalesActor } from "./events";

/**
 * Le dossier commercial d'une officine créée directement dans la console.
 *
 * Le pipeline (contrat, signature, abonnement, commission) est bâti autour
 * d'un dossier (`Prospect`). Une officine créée par l'administrateur n'en a
 * pas : on le crée à la demande, rempli depuis l'officine et son titulaire —
 * jamais ressaisi. Un dossier, une officine ; le commercial y est absent tant
 * que l'administrateur n'en désigne pas un (l'extranet reprendra alors le
 * même dossier, avec les mêmes contrats).
 */
export async function ensureDossierForPharmacy(pharmacyId: string, actor: SalesActor): Promise<{ ok: true; prospectId: string; created: boolean } | { ok: false; error: string }> {
  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id: pharmacyId },
    include: {
      prospect: { select: { id: true } },
      memberships: { where: { role: "OWNER", isActive: true }, orderBy: { createdAt: "asc" }, take: 1, select: { user: { select: { firstName: true, lastName: true, email: true } } } },
    },
  });
  if (!pharmacy) return { ok: false, error: "Officine introuvable." };
  if (pharmacy.prospect) return { ok: true, prospectId: pharmacy.prospect.id, created: false };
  const owner = pharmacy.memberships[0]?.user ?? null;
  const prospect = await prisma.prospect.create({
    data: {
      name: pharmacy.name,
      ownerName: owner ? `${owner.firstName} ${owner.lastName}`.trim() : null,
      email: owner?.email ?? pharmacy.email ?? null,
      phone: pharmacy.phone,
      addressLine1: pharmacy.addressLine1,
      postalCode: pharmacy.postalCode,
      city: pharmacy.city,
      finessNumber: pharmacy.finessNumber,
      siret: pharmacy.siret,
      outletCount: 1,
      salesRepId: null,
      status: "PHARMACY_CREATED",
      pharmacyId: pharmacy.id,
    },
  });
  await recordProspectEvent({ prospectId: prospect.id, type: "CREATED", summary: `Dossier ouvert depuis la console pour l'officine ${pharmacy.name}.`, actor, metadata: { pharmacyId } });
  return { ok: true, prospectId: prospect.id, created: true };
}

/** Rafraîchit le dossier avec les informations courantes de l'officine et du titulaire (sans écraser une saisie plus précise). */
export async function refreshDossierFromPharmacy(prospectId: string): Promise<void> {
  const prospect = await prisma.prospect.findUnique({ where: { id: prospectId }, include: { pharmacy: { include: { memberships: { where: { role: "OWNER", isActive: true }, orderBy: { createdAt: "asc" }, take: 1, select: { user: { select: { firstName: true, lastName: true, email: true } } } } } } } });
  if (!prospect?.pharmacy) return;
  const owner = prospect.pharmacy.memberships[0]?.user ?? null;
  await prisma.prospect.update({
    where: { id: prospectId },
    data: {
      name: prospect.pharmacy.name,
      ownerName: prospect.ownerName ?? (owner ? `${owner.firstName} ${owner.lastName}`.trim() : null),
      email: prospect.email ?? owner?.email ?? prospect.pharmacy.email ?? null,
      phone: prospect.phone ?? prospect.pharmacy.phone,
      addressLine1: prospect.addressLine1 ?? prospect.pharmacy.addressLine1,
      postalCode: prospect.postalCode ?? prospect.pharmacy.postalCode,
      city: prospect.city ?? prospect.pharmacy.city,
      finessNumber: prospect.finessNumber ?? prospect.pharmacy.finessNumber,
      siret: prospect.siret ?? prospect.pharmacy.siret,
    },
  });
}
