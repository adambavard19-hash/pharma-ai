import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/server/db/client";
import { hashPassword } from "@/server/security/password";
import { uniqueSlug } from "@/server/services/slugs";
import { sendUserPasswordLink } from "@/server/services/user-password";
import { recordAudit } from "@/server/audit/log";
import { recordProspectEvent, type SalesActor } from "./events";
import { notifyAdmins, notifySalesRep } from "./notifications";
import { resolveReferralCode } from "@/server/services/referral";
import { referralAmountForNewFilleul } from "@/server/services/referral-offers";
import { recordLeadAttachment, referrerFromLead } from "@/server/services/referral-leads";
import { isLgoId } from "@/server/services/stock-sync";

/**
 * L'espace pharmacie né d'un dossier commercial.
 *
 * Aucune officine ne se crée avant le statut contractuel prévu : le contrat
 * le plus récent doit être FINALISÉ (signé par les deux parties). L'officine,
 * l'organisation et le titulaire sont créés d'un bloc ; le titulaire reçoit
 * l'e-mail d'accueil avec le lien pour définir son mot de passe ; le dossier
 * garde le lien vers l'officine, et l'officine vers le dossier.
 */
export async function createPharmacyFromProspect(prospectId: string, actor: SalesActor): Promise<{ ok: true; pharmacyId: string; welcome: { status: string; detail: string } } | { ok: false; error: string }> {
  const prospect = await prisma.prospect.findUnique({
    where: { id: prospectId },
    include: { contracts: { orderBy: { version: "desc" }, take: 1 }, salesRep: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!prospect) return { ok: false, error: "Dossier introuvable." };
  if (prospect.pharmacyId) return { ok: false, error: "L'espace pharmacie de ce dossier existe déjà." };
  if (prospect.blockedAt) return { ok: false, error: "Ce dossier est suspendu par l'administrateur." };
  const contract = prospect.contracts[0];
  if (!contract || contract.status !== "FINALIZED") {
    return { ok: false, error: "Le contrat doit être signé par les deux parties (statut « Finalisé ») avant de créer l'espace pharmacie." };
  }
  if (!prospect.email || !prospect.ownerName) return { ok: false, error: "L'e-mail et le nom du titulaire sont requis sur le dossier." };
  const existingUser = await prisma.user.findFirst({ where: { email: { equals: prospect.email, mode: "insensitive" } }, select: { id: true } });
  if (existingUser) return { ok: false, error: "Un compte utilisateur existe déjà avec l'adresse e-mail du titulaire." };

  const [firstName, ...rest] = prospect.ownerName.trim().split(/\s+/);
  const lastName = rest.join(" ") || firstName;
  const [organizationSlug, pharmacySlug] = await Promise.all([uniqueSlug(prospect.name, "organization"), uniqueSlug(prospect.name, "pharmacy")]);
  const passwordHash = await hashPassword(randomBytes(32).toString("base64url"));
  // Le parrain, si le dossier porte un code valide : la remise se calcule à partir de ce lien.
  const codeReferrer = await resolveReferralCode(prospect.referralCode);
  // Sans code, le dossier d'un confrère proposé au parrainage a pour parrain l'officine de celui qui l'a proposé (si elle existe déjà).
  // Un code déjà renseigné l'emporte : rien n'est changé pour lui.
  const leadReferrer = codeReferrer ? null : await referrerFromLead(prospect.id);
  const referrer = codeReferrer ?? leadReferrer;
  // Ce que ce filleul apportera à son parrain est figé maintenant : une offre de parrainage qui change ensuite ne le modifie pas.
  const referralAmountCents = referrer ? await referralAmountForNewFilleul() : null;

  const { pharmacy, ownerId } = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({ data: { name: prospect.name, slug: organizationSlug } });
    const pharmacy = await tx.pharmacy.create({
      data: {
        organizationId: organization.id,
        name: prospect.name,
        slug: pharmacySlug,
        // L'e-mail de contact déclaré à l'inscription ; à défaut, celui du représentant.
        email: prospect.contactEmail ?? prospect.email,
        phone: prospect.phone,
        addressLine1: prospect.addressLine1,
        postalCode: prospect.postalCode,
        city: prospect.city,
        finessNumber: prospect.finessNumber,
        siret: prospect.siret,
        postCount: prospect.postCount,
        isDemo: false,
        isActive: true,
        referredById: referrer?.id ?? null,
        referralAmountCents,
      },
    });
    if (prospect.postCount) await tx.pharmacyPostCountChange.create({ data: { pharmacyId: pharmacy.id, previous: null, next: prospect.postCount, actorType: actor.type, actorLabel: actor.label } });
    if (prospect.lgo && isLgoId(prospect.lgo)) await tx.stockConnection.create({ data: { pharmacyId: pharmacy.id, lgo: prospect.lgo, status: "PENDING" } });
    const owner = await tx.user.create({ data: { organizationId: organization.id, email: prospect.email!, firstName, lastName, passwordHash, status: "ACTIVE" } });
    await tx.membership.create({ data: { userId: owner.id, pharmacyId: pharmacy.id, role: "OWNER", isActive: true } });
    await tx.prospect.update({ where: { id: prospect.id }, data: { pharmacyId: pharmacy.id, status: "PHARMACY_CREATED" } });
    return { pharmacy, ownerId: owner.id };
  });

  const welcome = await sendUserPasswordLink(ownerId, "welcome").catch((error: unknown) => ({ status: "FAILED", detail: error instanceof Error ? error.message : "envoi impossible", url: "" }));

  await recordProspectEvent({ prospectId, type: "PHARMACY_CREATED", summary: `Espace pharmacie créé (${pharmacy.name}) ; e-mail d'accueil du titulaire : ${welcome.status === "SENT" ? "envoyé" : `non envoyé (${welcome.detail})`}.`, actor, metadata: { pharmacyId: pharmacy.id } });
  await recordAudit({ action: "sales.pharmacy_created", entityType: "Pharmacy", entityId: pharmacy.id, salesRepId: actor.type === "SALES" ? actor.id : null, platformAdminId: actor.type === "ADMIN" ? actor.id : null, metadata: { prospectId } });
  if (leadReferrer) await recordLeadAttachment({ referredProspectId: prospect.id, referredName: pharmacy.name, referrer: leadReferrer, actor });
  await notifyAdmins({ type: "PHARMACY_CREATED", title: `${pharmacy.name} : espace créé`, body: `Dossier de ${prospect.salesRep ? `${prospect.salesRep.firstName} ${prospect.salesRep.lastName}` : "la console"}.`, linkUrl: `/admin/pharmacies/${pharmacy.id}`, severity: "SUCCESS" });
  return { ok: true, pharmacyId: pharmacy.id, welcome: { status: welcome.status, detail: welcome.detail } };
}

/** Le titulaire s'est connecté : le dossier passe « Activé ». Appelé après une connexion réussie. */
export async function markProspectActivatedForUser(userId: string): Promise<void> {
  const memberships = await prisma.membership.findMany({ where: { userId, role: "OWNER" }, select: { pharmacyId: true } });
  if (memberships.length === 0) return;
  const prospects = await prisma.prospect.findMany({ where: { pharmacyId: { in: memberships.map((m) => m.pharmacyId) }, status: "PHARMACY_CREATED" }, select: { id: true, name: true, salesRepId: true } });
  for (const prospect of prospects) {
    await prisma.prospect.update({ where: { id: prospect.id }, data: { status: "ACTIVATED" } });
    await recordProspectEvent({ prospectId: prospect.id, type: "STATUS_CHANGED", summary: "Le titulaire s'est connecté : officine activée.", actor: { type: "SYSTEM", label: "PharmaBoost" }, metadata: { from: "PHARMACY_CREATED", to: "ACTIVATED" } });
    if (prospect.salesRepId) await notifySalesRep({ salesRepId: prospect.salesRepId, type: "PHARMACY_ACTIVATED", title: `${prospect.name} est active`, body: "Le titulaire s'est connecté à son espace.", linkUrl: `/extranet/dossiers/${prospect.id}`, severity: "SUCCESS" });
  }
}
