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
import { fail, type ActionResult } from "./types";

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
