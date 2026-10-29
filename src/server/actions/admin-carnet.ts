"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { addCarnetItem, removeCarnetItem, updateCarnetItem } from "@/server/services/admin-carnet";
import type { CarnetItem } from "@/core/admin/carnet";
import { fail, ok, type ActionResult } from "./types";

/** Le carnet de l'équipe PharmaBoost : seule une session d'administrateur plateforme y écrit. */

const idSchema = z.string().min(1).max(40);

type Session = Awaited<ReturnType<typeof requirePlatformSession>>;
const adminOf = (session: Session) => ({ id: session.admin.id, fullName: session.admin.fullName });

export async function addCarnetItemAction(draft: unknown): Promise<ActionResult<CarnetItem[]>> {
  const session = await requirePlatformSession();
  const result = await addCarnetItem(adminOf(session), draft);
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/carnet");
  return ok(result.items, "Noté.");
}

export async function updateCarnetItemAction(payload: { id: string; patch: unknown }): Promise<ActionResult<CarnetItem[]>> {
  const session = await requirePlatformSession();
  const id = idSchema.safeParse(payload?.id);
  if (!id.success) return fail("Note inconnue.");
  const result = await updateCarnetItem(adminOf(session), id.data, payload.patch);
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/carnet");
  return ok(result.items);
}

export async function removeCarnetItemAction(payload: { id: string }): Promise<ActionResult<CarnetItem[]>> {
  const session = await requirePlatformSession();
  const id = idSchema.safeParse(payload?.id);
  if (!id.success) return fail("Note inconnue.");
  const result = await removeCarnetItem(adminOf(session), id.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/carnet");
  return ok(result.items, "Supprimée.");
}
