"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { updateTeamMember, type MemberChanges } from "@/server/services/team-management";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Modifier un collaborateur depuis l'espace administrateur : les mêmes gestes que le titulaire dans le sien (nom,
 * coordonnées, poste, titulaire principal), avec les mêmes règles — une officine ne reste jamais sans titulaire actif ni
 * sans titulaire principal. Seule différence : PharmaBoost peut aussi corriger l'identité d'un compte qui travaille dans
 * plusieurs officines, et changer l'adresse d'un titulaire.
 */

const schema = z.object({
  pharmacyId: z.string().trim().min(1).max(64),
  userId: z.string().trim().min(1).max(64),
  firstName: z.string().trim().min(1, "Le prénom est obligatoire").max(80).optional(),
  lastName: z.string().trim().min(1, "Le nom est obligatoire").max(80).optional(),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide").max(160).optional(),
  phone: z.string().trim().max(30).regex(/^[0-9+().\s-]*$/, "Numéro de téléphone invalide").nullable().optional(),
  rppsNumber: z.string().trim().max(20).regex(/^[0-9]*$/, "Le numéro RPPS ne contient que des chiffres").nullable().optional(),
  role: z.enum(["OWNER", "PHARMACIST", "TECHNICIAN", "STUDENT", "VIEWER"]).optional(),
  isPrincipal: z.boolean().optional(),
});

export async function updatePharmacyMemberAction(payload: z.input<typeof schema>): Promise<ActionResult<{ changed: string[] }>> {
  const session = await requirePlatformSession();
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));

  const { pharmacyId, userId, ...changes } = parsed.data;
  const result = await updateTeamMember({ pharmacyId, userId, changes: changes as MemberChanges, actor: { kind: "admin" }, audit: { platformAdminId: session.admin.id } });
  if (!result.ok) return fail(result.error);

  for (const path of [`/admin/pharmacies/${pharmacyId}`, "/admin/utilisateurs", "/admin/acces"]) revalidatePath(path);
  if (result.changed.length === 0) return ok({ changed: [] }, "Rien à changer.");
  return ok({ changed: result.changed }, `${result.name} est à jour.`);
}
