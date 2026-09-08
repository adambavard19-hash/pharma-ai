"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { verifyPassword } from "@/server/security/password";
import {
  createPlatformSession,
  destroyPlatformSession,
  requirePlatformSession,
} from "@/server/auth/platform-session";
import { getRequestMeta } from "@/server/auth/session";
import { recordAudit } from "@/server/audit/log";
import { sendPasswordLink, setPasswordByToken } from "@/server/services/platform-admin";
import { fail, ok, type ActionResult } from "./types";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export async function platformLoginAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return fail("Identifiants incorrects.");

  const admin = await prisma.platformAdmin.findUnique({
    where: { email: parsed.data.email },
  });
  const valid = await verifyPassword(parsed.data.password, admin?.passwordHash);

  if (!admin || !valid || !admin.isActive) return fail("Identifiants incorrects.");

  const meta = await getRequestMeta();
  await createPlatformSession({ adminId: admin.id, ipAddress: meta.ipAddress });

  await recordAudit({
    action: "auth.login",
    entityType: "PlatformAdmin",
    entityId: admin.id,
    platformAdminId: admin.id,
    metadata: { scope: "platform" },
  });

  redirect("/admin");
}

export async function platformLogoutAction(): Promise<void> {
  const session = await requirePlatformSession().catch(() => null);
  if (session) {
    await recordAudit({
      action: "auth.logout",
      entityType: "PlatformAdmin",
      entityId: session.admin.id,
      platformAdminId: session.admin.id,
    });
  }
  await destroyPlatformSession();
  redirect("/admin-connexion");
}

const setPasswordSchema = z.object({
  token: z.string().min(16),
  password: z.string().min(1),
  confirm: z.string().min(1),
});

/** Définir son mot de passe depuis le lien reçu par e-mail. */
export async function setPlatformPasswordAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const parsed = setPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return fail("Formulaire incomplet.");
  if (parsed.data.password !== parsed.data.confirm) return fail("Les deux mots de passe ne sont pas identiques.");

  const result = await setPasswordByToken(parsed.data.token, parsed.data.password);
  if (!result.ok) return fail(result.error);
  redirect("/admin-connexion?defini=1");
}

const requestLinkSchema = z.object({ email: z.string().trim().toLowerCase().email() });

/**
 * « Mot de passe oublié ». La réponse est la même que le compte existe ou
 * non : cette page ne doit pas permettre de deviner qui administre la console.
 */
export async function requestPlatformPasswordLinkAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const parsed = requestLinkSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return fail("Adresse e-mail invalide.");
  const admin = await prisma.platformAdmin.findUnique({ where: { email: parsed.data.email }, select: { id: true, isActive: true } });
  if (admin?.isActive) {
    await sendPasswordLink(admin.id).catch(() => undefined);
  }
  return ok(null, "Si un compte existe pour cette adresse, un lien vient de lui être envoyé.");
}
