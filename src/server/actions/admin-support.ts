"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { recordAudit } from "@/server/audit/log";
import { checkMessage } from "@/core/support/rules";
import { markReadBySupport, replyFromSupport, setThreadClosedBySupport } from "@/server/services/support";
import { fail, ok, type ActionResult } from "./types";

/**
 * « Support », côté console : lire les discussions des officines, leur répondre, les clore. Une réponse prévient l'officine
 * (cloche de PharmaBoost + e-mail à celui qui a écrit). Chaque réponse est signée du prénom de l'administrateur et tracée.
 */

const idSchema = z.object({ threadId: z.string().trim().min(1).max(64) });
const replySchema = idSchema.extend({ body: z.string().max(20_000) });
const statusSchema = idSchema.extend({ closed: z.boolean() });

export async function replyAsSupportAction(payload: z.input<typeof replySchema>): Promise<ActionResult<{ notified: string }>> {
  const session = await requirePlatformSession();
  const parsed = replySchema.safeParse(payload);
  if (!parsed.success) return fail("Discussion introuvable.");
  const message = checkMessage(parsed.data.body);
  if (!message.ok) return fail(message.error);

  const firstName = session.admin.fullName.split(" ")[0] || "PharmaBoost";
  const result = await replyFromSupport({ threadId: parsed.data.threadId, admin: { id: session.admin.id, name: `${firstName} (PharmaBoost)` }, body: message.body });
  if (!result.ok) return fail(result.error);

  await recordAudit({ action: "platform.support_replied", entityType: "SupportThread", entityId: parsed.data.threadId, platformAdminId: session.admin.id, metadata: { email: result.notified.email, inApp: result.notified.inApp } });
  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${parsed.data.threadId}`);
  const notified = result.notified.email === "SENT" ? "par e-mail et dans PharmaBoost" : result.notified.email === "SIMULATED" ? "dans PharmaBoost (e-mail simulé : aucun prestataire configuré)" : result.notified.email === "FAILED" ? "dans PharmaBoost (l'e-mail n'est pas parti : voir l'historique)" : "dans PharmaBoost";
  return ok({ notified }, `Réponse envoyée. L'officine est prévenue ${notified}.`);
}

export async function setSupportThreadClosedBySupportAction(payload: z.input<typeof statusSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = statusSchema.safeParse(payload);
  if (!parsed.success) return fail("Discussion introuvable.");
  const done = await setThreadClosedBySupport(parsed.data.threadId, parsed.data.closed);
  if (!done) return fail("Discussion introuvable.");
  await recordAudit({ action: "platform.support_status_changed", entityType: "SupportThread", entityId: parsed.data.threadId, platformAdminId: session.admin.id, metadata: { closed: parsed.data.closed } });
  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${parsed.data.threadId}`);
  return ok(null, parsed.data.closed ? "Discussion fermée." : "Discussion rouverte.");
}

/** Appelée quand la console affiche la discussion : elle est lue, elle quitte « à lire ». */
export async function markSupportThreadReadBySupportAction(payload: z.input<typeof idSchema>): Promise<ActionResult<null>> {
  await requirePlatformSession();
  const parsed = idSchema.safeParse(payload);
  if (!parsed.success) return fail("Discussion introuvable.");
  await markReadBySupport(parsed.data.threadId);
  revalidatePath("/admin/support");
  return ok(null);
}
