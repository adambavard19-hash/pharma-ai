"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { rateLimited } from "@/server/http/rate-limit";
import { checkMessage, SUPPORT_SUBJECT_MAX, type SupportTopicCode } from "@/core/support/rules";
import { markReadByPharmacy, openSupportThread, replyFromPharmacy, setThreadClosedByPharmacy } from "@/server/services/support";
import { refuseInDemo } from "./demo-guard";
import { fail, ok, type ActionResult } from "./types";

/**
 * « Contact support », côté officine : toute personne connectée de l'équipe peut ouvrir une discussion, y répondre et la
 * clore. Les discussions sont celles de SON officine (portée = la session), jamais d'une autre. Une officine de
 * démonstration n'écrit pas au vrai support.
 */

const TOPICS = ["QUESTION", "TECHNICAL", "BILLING", "SUGGESTION"] as const;
const DEMO_MESSAGE = "Mode démonstration : le support n'est pas joignable depuis la démo.";
const TOO_MANY = "Vous avez envoyé beaucoup de messages en peu de temps : patientez quelques minutes avant d'écrire de nouveau.";

const threadSchema = z.object({
  topic: z.enum(TOPICS),
  subject: z.string().trim().max(SUPPORT_SUBJECT_MAX, `Le sujet est trop long (${SUPPORT_SUBJECT_MAX} caractères au plus).`).optional(),
  body: z.string().max(20_000),
});

export async function createSupportThreadAction(payload: z.input<typeof threadSchema>): Promise<ActionResult<{ threadId: string }>> {
  const session = await requireSession();
  const refused = refuseInDemo(session, DEMO_MESSAGE);
  if (refused) return refused;
  const parsed = threadSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Vérifiez votre message.");
  const message = checkMessage(parsed.data.body);
  if (!message.ok) return fail(message.error);
  if (rateLimited(`support:${session.scope.userId}`, 15, 60 * 60 * 1000)) return fail(TOO_MANY);

  const { threadId } = await openSupportThread({
    pharmacy: { id: session.pharmacy.id, name: session.pharmacy.name, city: session.pharmacy.city, isDemo: session.pharmacy.isDemo },
    author: { userId: session.scope.userId, name: `${session.user.firstName} ${session.user.lastName}` },
    topic: parsed.data.topic as SupportTopicCode,
    subject: parsed.data.subject ?? null,
    body: message.body,
  });
  revalidatePath("/support");
  return ok({ threadId }, "Votre question est envoyée à l'équipe PharmaBoost. Vous serez prévenu de sa réponse.");
}

const replySchema = z.object({ threadId: z.string().trim().min(1).max(64), body: z.string().max(20_000) });

export async function replySupportThreadAction(payload: z.input<typeof replySchema>): Promise<ActionResult<null>> {
  const session = await requireSession();
  const refused = refuseInDemo(session, DEMO_MESSAGE);
  if (refused) return refused;
  const parsed = replySchema.safeParse(payload);
  if (!parsed.success) return fail("Discussion introuvable.");
  const message = checkMessage(parsed.data.body);
  if (!message.ok) return fail(message.error);
  if (rateLimited(`support:${session.scope.userId}`, 15, 60 * 60 * 1000)) return fail(TOO_MANY);

  const result = await replyFromPharmacy({
    pharmacy: { id: session.pharmacy.id, name: session.pharmacy.name, city: session.pharmacy.city },
    threadId: parsed.data.threadId,
    author: { userId: session.scope.userId, name: `${session.user.firstName} ${session.user.lastName}` },
    body: message.body,
  });
  if (!result.ok) return fail(result.error);
  revalidatePath("/support");
  revalidatePath(`/support/${parsed.data.threadId}`);
  return ok(null, "Message envoyé.");
}

const closeSchema = z.object({ threadId: z.string().trim().min(1).max(64), closed: z.boolean() });

export async function setSupportThreadClosedAction(payload: z.input<typeof closeSchema>): Promise<ActionResult<null>> {
  const session = await requireSession();
  const parsed = closeSchema.safeParse(payload);
  if (!parsed.success) return fail("Discussion introuvable.");
  const done = await setThreadClosedByPharmacy({ pharmacyId: session.pharmacy.id, threadId: parsed.data.threadId, closed: parsed.data.closed });
  if (!done) return fail("Discussion introuvable.");
  revalidatePath("/support");
  revalidatePath(`/support/${parsed.data.threadId}`);
  return ok(null, parsed.data.closed ? "Discussion terminée. Vous pouvez la rouvrir en écrivant de nouveau." : "Discussion rouverte.");
}

/** Appelée quand la discussion est affichée : la réponse est lue, le point et la notification disparaissent. */
export async function markSupportThreadReadAction(payload: { threadId: string }): Promise<ActionResult<null>> {
  const session = await requireSession();
  if (!payload?.threadId || typeof payload.threadId !== "string") return fail("Discussion introuvable.");
  await markReadByPharmacy({ pharmacyId: session.pharmacy.id, userId: session.scope.userId, threadId: payload.threadId });
  revalidatePath("/support");
  return ok(null);
}
