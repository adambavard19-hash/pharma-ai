"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/server/auth/session";
import { markAllNotificationsRead } from "@/server/services/notifications";
import { ok, type ActionResult } from "./types";

export async function markAllReadAction(): Promise<ActionResult<null>> {
  const session = await requireSession();
  await markAllNotificationsRead(session.scope);
  revalidatePath("/notifications");
  return ok(null, "Notifications marquées comme lues.");
}
