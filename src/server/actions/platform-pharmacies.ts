"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { hashPassword, validatePasswordStrength } from "@/server/security/password";
import { recordAudit } from "@/server/audit/log";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Administration des officines clientes, réservée à l'éditeur.
 *
 * ⚠️ RÈGLE STRUCTURELLE : ces actions créent et configurent des officines, mais
 * ne lisent JAMAIS de données patient. Un administrateur plateforme n'obtient
 * pas de `TenantScope` (cf. platform-session.ts) : il n'a donc aucun chemin
 * d'accès aux ordonnances, patients ou ventes d'une officine, même par erreur
 * de programmation.
 */

/** Identifiant d'URL stable, dérivé du nom. Unicité garantie par suffixe. */
async function uniqueSlug(base: string, kind: "pharmacy" | "organization"): Promise<string> {
  const root =
    base
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || kind;

  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? root : `${root}-${attempt + 1}`;
    const taken =
      kind === "pharmacy"
        ? await prisma.pharmacy.findUnique({ where: { slug: candidate }, select: { id: true } })
        : await prisma.organization.findUnique({
            where: { slug: candidate },
            select: { id: true },
          });
    if (!taken) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

const pharmacySchema = z.object({
  name: z.string().trim().min(2, "Le nom de l'officine est obligatoire").max(120),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide").or(z.literal("")),
  phone: z.string().trim().max(30).optional(),
  addressLine1: z.string().trim().max(160).optional(),
  postalCode: z.string().trim().max(10).optional(),
  city: z.string().trim().max(80).optional(),
  finessNumber: z.string().trim().max(20).optional(),
  siret: z.string().trim().max(20).optional(),
  brandColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide (format #0F766E)")
    .optional()
    .or(z.literal("")),
});

const createSchema = pharmacySchema.extend({
  ownerFirstName: z.string().trim().min(1, "Le prénom du titulaire est obligatoire").max(80),
  ownerLastName: z.string().trim().min(1, "Le nom du titulaire est obligatoire").max(80),
  ownerEmail: z.string().trim().toLowerCase().email("Adresse e-mail du titulaire invalide"),
  ownerPassword: z.string().min(1, "Mot de passe requis"),
});

/**
 * Signer une nouvelle officine : l'environnement complet en une opération.
 *
 * Organisation, officine et compte titulaire sont créés dans UNE transaction.
 * Une officine sans titulaire serait un client incapable de se connecter, et
 * un titulaire sans officine un compte orphelin : les trois vont ensemble ou
 * aucun n'est créé.
 */
export async function createClientPharmacyAction(
  payload: z.input<typeof createSchema>,
): Promise<ActionResult<{ pharmacyId: string }>> {
  const session = await requirePlatformSession();
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  }

  const input = parsed.data;
  const weaknesses = validatePasswordStrength(input.ownerPassword);
  if (weaknesses.length > 0) {
    return fail(`Mot de passe trop faible : ${weaknesses.join(", ")}.`, {
      ownerPassword: `Mot de passe trop faible : ${weaknesses.join(", ")}.`,
    });
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: input.ownerEmail },
    select: { id: true },
  });
  if (existingUser) {
    return fail("Un compte existe déjà avec cette adresse e-mail.", {
      ownerEmail: "Un compte existe déjà avec cette adresse e-mail.",
    });
  }

  const [organizationSlug, pharmacySlug] = await Promise.all([
    uniqueSlug(input.name, "organization"),
    uniqueSlug(input.name, "pharmacy"),
  ]);
  const passwordHash = await hashPassword(input.ownerPassword);

  const pharmacy = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name: input.name, slug: organizationSlug },
    });

    const created = await tx.pharmacy.create({
      data: {
        organizationId: organization.id,
        name: input.name,
        slug: pharmacySlug,
        email: input.email || null,
        phone: input.phone || null,
        addressLine1: input.addressLine1 || null,
        postalCode: input.postalCode || null,
        city: input.city || null,
        finessNumber: input.finessNumber || null,
        siret: input.siret || null,
        ...(input.brandColor ? { brandColor: input.brandColor } : {}),
        isDemo: false,
        isActive: true,
      },
    });

    const owner = await tx.user.create({
      data: {
        organizationId: organization.id,
        email: input.ownerEmail,
        firstName: input.ownerFirstName,
        lastName: input.ownerLastName,
        passwordHash,
        status: "ACTIVE",
      },
    });

    await tx.membership.create({
      data: { userId: owner.id, pharmacyId: created.id, role: "OWNER", isActive: true },
    });

    return created;
  });

  await recordAudit({
    action: "platform.pharmacy_created",
    entityType: "Pharmacy",
    entityId: pharmacy.id,
    platformAdminId: session.admin.id,
    metadata: { name: input.name, ownerEmail: input.ownerEmail },
  });

  revalidatePath("/admin/pharmacies");
  return ok({ pharmacyId: pharmacy.id }, `${input.name} est prête. Le titulaire peut se connecter.`);
}

const updateSchema = pharmacySchema.extend({ pharmacyId: z.string().min(1) });

export async function updateClientPharmacyAction(
  payload: z.input<typeof updateSchema>,
): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  }

  const input = parsed.data;
  const exists = await prisma.pharmacy.findUnique({
    where: { id: input.pharmacyId },
    select: { id: true },
  });
  if (!exists) return fail("Officine introuvable.");

  await prisma.pharmacy.update({
    where: { id: input.pharmacyId },
    data: {
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      addressLine1: input.addressLine1 || null,
      postalCode: input.postalCode || null,
      city: input.city || null,
      finessNumber: input.finessNumber || null,
      siret: input.siret || null,
      ...(input.brandColor ? { brandColor: input.brandColor } : {}),
    },
  });

  await recordAudit({
    action: "platform.pharmacy_updated",
    entityType: "Pharmacy",
    entityId: input.pharmacyId,
    platformAdminId: session.admin.id,
  });

  revalidatePath("/admin/pharmacies");
  revalidatePath(`/admin/pharmacies/${input.pharmacyId}`);
  return ok(null, "Officine mise à jour.");
}

const statusSchema = z.object({ pharmacyId: z.string().min(1), isActive: z.boolean() });

/**
 * Suspendre une officine cliente.
 *
 * La suspension révoque les sessions en cours : sans cela, un impayé n'aurait
 * aucun effet avant l'expiration des cookies. Aucune donnée n'est supprimée —
 * une officine réactivée retrouve son dossier intact.
 */
export async function setClientPharmacyStatusAction(
  payload: z.input<typeof statusSchema>,
): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = statusSchema.safeParse(payload);
  if (!parsed.success) return fail("Requête invalide.");

  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id: parsed.data.pharmacyId },
    select: { id: true, name: true },
  });
  if (!pharmacy) return fail("Officine introuvable.");

  await prisma.$transaction(async (tx) => {
    await tx.pharmacy.update({
      where: { id: pharmacy.id },
      data: { isActive: parsed.data.isActive },
    });
    if (!parsed.data.isActive) {
      await tx.session.updateMany({
        where: { pharmacyId: pharmacy.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  });

  await recordAudit({
    action: "platform.pharmacy_status_changed",
    entityType: "Pharmacy",
    entityId: pharmacy.id,
    platformAdminId: session.admin.id,
    metadata: { isActive: parsed.data.isActive },
  });

  revalidatePath("/admin/pharmacies");
  revalidatePath(`/admin/pharmacies/${pharmacy.id}`);
  return ok(
    null,
    parsed.data.isActive ? `${pharmacy.name} réactivée.` : `${pharmacy.name} suspendue.`,
  );
}

const ownerSchema = z.object({
  pharmacyId: z.string().min(1),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide"),
  password: z.string().min(1),
});

/** Ajoute un titulaire à une officine existante (reprise, cession, oubli). */
export async function createPharmacyOwnerAction(
  payload: z.input<typeof ownerSchema>,
): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = ownerSchema.safeParse(payload);
  if (!parsed.success) {
    return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  }

  const input = parsed.data;
  const weaknesses = validatePasswordStrength(input.password);
  if (weaknesses.length > 0) {
    return fail(`Mot de passe trop faible : ${weaknesses.join(", ")}.`);
  }

  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id: input.pharmacyId },
    select: { id: true, organizationId: true, name: true },
  });
  if (!pharmacy) return fail("Officine introuvable.");

  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) return fail("Un compte existe déjà avec cette adresse e-mail.");

  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction(async (tx) => {
    const owner = await tx.user.create({
      data: {
        organizationId: pharmacy.organizationId,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        passwordHash,
        status: "ACTIVE",
      },
    });
    await tx.membership.create({
      data: { userId: owner.id, pharmacyId: pharmacy.id, role: "OWNER", isActive: true },
    });
  });

  await recordAudit({
    action: "platform.owner_created",
    entityType: "Pharmacy",
    entityId: pharmacy.id,
    platformAdminId: session.admin.id,
    metadata: { ownerEmail: input.email },
  });

  revalidatePath(`/admin/pharmacies/${pharmacy.id}`);
  return ok(null, `${input.firstName} ${input.lastName} est titulaire de ${pharmacy.name}.`);
}
