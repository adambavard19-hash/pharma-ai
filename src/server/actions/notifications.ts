"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/server/auth/session";
import { markAllNotificationsRead, markNotificationsRead } from "@/server/services/notifications";
import { ok, type ActionResult } from "./types";

export async function markAllReadAction(): Promise<ActionResult<{ count: number }>> {
  const session = await requireSession();
  const count = await markAllNotificationsRead(session.scope);
  revalidatePath("/", "layout");
  return ok({ count }, "Notifications marquées comme lues.");
}

/** Une notification (ou un groupe) ouverte : lue pour la personne connectée seulement. */
export async function markReadAction(ids: string[]): Promise<ActionResult<{ count: number }>> {
  const session = await requireSession();
  const count = await markNotificationsRead(session.scope, Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
  if (count > 0) revalidatePath("/", "layout");
  return ok({ count }, "Notification lue.");
}
