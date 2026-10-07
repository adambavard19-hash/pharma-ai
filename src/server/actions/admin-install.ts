"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { resolvePublicBaseUrl } from "@/server/public-url";
import { createPairing, createPostInstallLink, isLgoId, resolveInstallTarget } from "@/server/services/stock-sync";
import { buildPostDownloadUrl, buildPostInstallCommand, buildServerInstallCommand, cleanPostLabel } from "@/core/stock/install";
import { fail, ok, type ActionResult } from "./types";

/**
 * L'installation sous AnyDesk, depuis la fiche officine de la console : une
 * ligne à copier pour le serveur, une ligne par poste. Les codes sont rendus
 * ici, une fois, à l'écran de l'équipe : ils ne sont écrits dans aucun
 * journal (l'audit nomme le geste et l'administrateur, jamais le code).
 */

const REFUSALS = {
  NOT_FOUND: "Officine introuvable.",
  SUSPENDED: "Cette officine est suspendue : son installation ne pourrait rien envoyer. Réactivez-la d'abord.",
  NO_OWNER: "Cette officine n'a pas de titulaire actif : créez ou réactivez son compte avant d'installer.",
} as const;

const serverSchema = z.object({ pharmacyId: z.string().trim().min(1).max(64), lgo: z.string().trim().max(32).optional().nullable() });
const postSchema = z.object({ pharmacyId: z.string().trim().min(1).max(64), label: z.string().max(200).optional().nullable() });

const baseUrl = () => resolvePublicBaseUrl().url.replace(/\/$/, "");

/**
 * Le code du serveur : six chiffres, une heure, un seul usage. Le logiciel est
 * celui de la liaison déjà connue ; `lgo` ne sert que si la console le corrige
 * ou si l'officine n'en a pas encore.
 */
export async function prepareInstallationAction(payload: { pharmacyId: string; lgo?: string | null }): Promise<ActionResult<{ serverCommand: string; serverCodeExpiresAt: string }>> {
  const session = await requirePlatformSession();
  const parsed = serverSchema.safeParse(payload);
  if (!parsed.success) return fail("Requête invalide.");
  const target = await resolveInstallTarget(parsed.data.pharmacyId);
  if (!target.ok) return fail(REFUSALS[target.reason]);
  const wanted = parsed.data.lgo || target.lgo || "autre";
  if (!isLgoId(wanted)) return fail("Logiciel inconnu.");
  const pairing = await createPairing(target.scope, wanted, { platformAdminId: session.admin.id });
  revalidatePath(`/admin/pharmacies/${target.scope.pharmacyId}`);
  return ok({ serverCommand: buildServerInstallCommand(baseUrl(), pairing.code), serverCodeExpiresAt: pairing.expiresAt.toISOString() }, "Ligne prête, valable une heure.");
}

/**
 * Le lien d'un poste de comptoir : sept jours, un seul poste, le nom du poste est
 * facultatif. `postDownloadUrl` est la page de l'installateur Windows (le lien à
 * envoyer au titulaire) ; `postCommand` la même installation en une ligne, sous AnyDesk.
 */
export async function preparePostInstallAction(payload: { pharmacyId: string; label?: string | null }): Promise<ActionResult<{ postCommand: string; postDownloadUrl: string; expiresAt: string; postId: string }>> {
  const session = await requirePlatformSession();
  const parsed = postSchema.safeParse(payload);
  if (!parsed.success) return fail("Requête invalide.");
  const target = await resolveInstallTarget(parsed.data.pharmacyId);
  if (!target.ok) return fail(REFUSALS[target.reason]);
  const link = await createPostInstallLink(target.scope, cleanPostLabel(parsed.data.label), { platformAdminId: session.admin.id });
  revalidatePath(`/admin/pharmacies/${target.scope.pharmacyId}`);
  return ok({ postCommand: buildPostInstallCommand(baseUrl(), link.token), postDownloadUrl: buildPostDownloadUrl(baseUrl(), link.token), expiresAt: link.expiresAt.toISOString(), postId: link.postId }, "Ligne prête, valable sept jours.");
}
