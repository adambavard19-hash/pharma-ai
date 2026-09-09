"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requireSession } from "@/server/auth/session";
import { recordAudit } from "@/server/audit/log";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * L'accueil du titulaire : renseigner l'officine, importer le stock, vérifier,
 * inviter l'équipe, démarrer. Réservé au titulaire (OWNER) de l'officine
 * courante — c'est son environnement.
 */

async function requireOwner() {
  const session = await requireSession();
  if (session.role !== "OWNER") throw new Error("Réservé au titulaire de l'officine.");
  return session;
}

const infoSchema = z.object({
  name: z.string().trim().min(2, "Le nom de l'officine est requis."),
  addressLine1: z.string().trim().min(3, "L'adresse est requise."),
  postalCode: z.string().trim().regex(/^\d{5}$/, "Code postal à 5 chiffres."),
  city: z.string().trim().min(2, "La ville est requise."),
  phone: z.string().trim().optional().or(z.literal("")),
  email: z.string().trim().email("Adresse e-mail invalide.").optional().or(z.literal("")),
  finessNumber: z.string().trim().optional().or(z.literal("")),
});

export async function updatePharmacyInfoAction(payload: z.input<typeof infoSchema>): Promise<ActionResult<null>> {
  const session = await requireOwner();
  const parsed = infoSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez les champs.", zodFieldErrors(parsed.error.issues));
  const data = parsed.data;
  await prisma.pharmacy.update({
    where: { id: session.scope.pharmacyId },
    data: {
      name: data.name,
      addressLine1: data.addressLine1,
      postalCode: data.postalCode,
      city: data.city,
      phone: data.phone || null,
      email: data.email || null,
      finessNumber: data.finessNumber || null,
    },
  });
  await recordAudit({ action: "pharmacy.updated", entityType: "Pharmacy", entityId: session.scope.pharmacyId, pharmacyId: session.scope.pharmacyId, userId: session.scope.userId, metadata: { fields: Object.keys(data) } });
  revalidatePath("/bienvenue");
  revalidatePath("/parametres");
  return ok(null, "Informations de l'officine enregistrées.");
}

export async function completeOnboardingAction(): Promise<never> {
  const session = await requireOwner();
  await prisma.pharmacy.update({
    where: { id: session.scope.pharmacyId },
    data: { onboardingCompletedAt: new Date() },
  });
  await recordAudit({ action: "pharmacy.onboarding_completed", entityType: "Pharmacy", entityId: session.scope.pharmacyId, pharmacyId: session.scope.pharmacyId, userId: session.scope.userId });
  redirect("/vente/nouvelle");
}
