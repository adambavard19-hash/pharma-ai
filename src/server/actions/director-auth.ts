"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createDirectorSession, destroyDirectorSession, getDirectorSession } from "@/server/auth/director-session";
import { getRequestMeta } from "@/server/auth/session";
import { recordAudit } from "@/server/audit/log";
import { authenticateDirector, requestDirectorPasswordReset, setDirectorPasswordByToken } from "@/server/services/sales/director-auth";
import { DIRECTOR_HOME, DIRECTOR_LOGIN } from "@/core/sales/director/nav";
import { fail, ok, type ActionResult } from "./types";

/**
 * Les actions d'ouverture et de fermeture de l'espace du directeur. Ce sont les
 * seules du directeur à ne PAS commencer par `requireDirectorSession()` : elles
 * existent justement pour qu'on en obtienne une. Le garde-fou
 * `director-actions-session.test.ts` en tient la liste exacte ; toute autre
 * action du directeur doit porter la barrière en première ligne.
 */

/** Une adresse e-mail tient en 254 caractères au plus : au-delà, c'est une attaque, pas une adresse. */
const emailField = z.string().trim().toLowerCase().max(254).email();
const loginSchema = z.object({ email: emailField, password: z.string().min(1).max(500) });

export async function directorLoginAction(_previous: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return fail("Identifiants incorrects.");
  const meta = await getRequestMeta();
  const result = await authenticateDirector(parsed.data.email, parsed.data.password, { ipAddress: meta.ipAddress });
  if (!result.ok) return fail(result.error);
  await createDirectorSession({ salesDirectorId: result.salesDirectorId, ipAddress: meta.ipAddress });
  await recordAudit({ action: "auth.login", entityType: "SalesDirector", entityId: result.salesDirectorId, salesDirectorId: result.salesDirectorId, metadata: { scope: "director" } });
  redirect(DIRECTOR_HOME);
}

export async function directorLogoutAction(): Promise<void> {
  const session = await getDirectorSession();
  if (session) await recordAudit({ action: "auth.logout", entityType: "SalesDirector", entityId: session.director.id, salesDirectorId: session.director.id, metadata: { scope: "director" } });
  await destroyDirectorSession();
  redirect(DIRECTOR_LOGIN);
}

/** Même réponse que le compte existe ou non : rien n'indique quelles adresses sont des comptes. */
export async function requestDirectorPasswordLinkAction(_previous: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  const parsed = z.object({ email: emailField }).safeParse({ email: formData.get("email") });
  if (!parsed.success) return fail("Adresse e-mail invalide.");
  const meta = await getRequestMeta();
  await requestDirectorPasswordReset(parsed.data.email, { ipAddress: meta.ipAddress });
  return ok(null, "Si un compte existe pour cette adresse, un lien vient de lui être envoyé.");
}

export async function setDirectorPasswordAction(_previous: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  const parsed = z.object({ token: z.string().min(16), password: z.string().min(1), confirm: z.string().min(1) }).safeParse({ token: formData.get("token"), password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return fail("Formulaire incomplet.");
  if (parsed.data.password !== parsed.data.confirm) return fail("Les deux mots de passe ne sont pas identiques.");
  const result = await setDirectorPasswordByToken(parsed.data.token, parsed.data.password);
  if (!result.ok) return fail(result.error);
  const meta = await getRequestMeta();
  await createDirectorSession({ salesDirectorId: result.salesDirectorId, ipAddress: meta.ipAddress });
  redirect(DIRECTOR_HOME);
}
