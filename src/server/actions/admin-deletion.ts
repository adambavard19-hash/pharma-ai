"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { deletePharmacy, deleteUserAccount } from "@/server/services/admin/deletion";
import { fail, ok, type ActionResult } from "./types";

/**
 * Supprimer une officine ou un compte, depuis l'espace administrateur.
 *
 * Ce sont les gestes les plus lourds de la console : la fenêtre de confirmation de l'écran protège d'un clic
 * malheureux, mais TOUT est revérifié côté serveur (existence, protections, nom retapé) — voir
 * `services/admin/deletion.ts`. Aucun de ces gestes ne touche aux données patients autrement que pour les effacer
 * avec leur officine : l'administrateur n'y lit rien.
 */

const pharmacySchema = z.object({
  pharmacyId: z.string().trim().min(1).max(64),
  typedName: z.string().max(200),
  reason: z.string().trim().min(5, "Indiquez le motif (5 caractères au moins).").max(500, "Le motif est trop long (500 caractères au plus)."),
});

const REVALIDATE = ["/admin", "/admin/pharmacies", "/admin/utilisateurs", "/admin/acces", "/admin/activite", "/admin/abonnements", "/admin/journal"];

export async function deletePharmacyAction(payload: z.input<typeof pharmacySchema>): Promise<ActionResult<{ redirectTo: string }>> {
  const session = await requirePlatformSession();
  const parsed = pharmacySchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Vérifiez le formulaire.");

  const result = await deletePharmacy({ ...parsed.data, adminId: session.admin.id });
  if (!result.ok) return fail(result.error);

  for (const path of REVALIDATE) revalidatePath(path);
  const detail = [
    result.usersDeleted > 0 ? `${result.usersDeleted} compte${result.usersDeleted > 1 ? "s" : ""} supprimé${result.usersDeleted > 1 ? "s" : ""}` : null,
    result.usersKept > 0 ? `${result.usersKept} compte${result.usersKept > 1 ? "s" : ""} conservé${result.usersKept > 1 ? "s" : ""} (travaille${result.usersKept > 1 ? "nt" : ""} aussi ailleurs)` : null,
  ].filter(Boolean);
  return ok({ redirectTo: "/admin/pharmacies" }, `${result.name} est supprimée${detail.length > 0 ? ` — ${detail.join(", ")}` : ""}.`);
}

const userSchema = z.object({ userId: z.string().trim().min(1).max(64) });

export async function deleteUserAction(payload: z.input<typeof userSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = userSchema.safeParse(payload);
  if (!parsed.success) return fail("Compte introuvable.");

  const result = await deleteUserAccount({ userId: parsed.data.userId, adminId: session.admin.id });
  if (!result.ok) return fail(result.error);

  for (const path of REVALIDATE) revalidatePath(path);
  return ok(null, `Le compte de ${result.name} est supprimé${result.pharmacies.length > 0 ? ` (${result.pharmacies.join(", ")})` : ""}. Son adresse e-mail est de nouveau disponible.`);
}
