"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { addCarnetItem, removeCarnetItem, updateCarnetItem } from "@/server/services/admin-carnet";
import type { CarnetItem } from "@/core/admin/carnet";
import { fail, ok, type ActionResult } from "./types";

/** Le carnet de l'équipe PharmaBoost : seule une session d'administrateur plateforme y écrit. */

const idSchema = z.string().min(1).max(40);

async function admin() {
  const session = await requirePlatformSession();
  return { id: session.admin.id, fullName: session.admin.fullName };
}

export async function addCarnetItemAction(draft: unknown): Promise<ActionResult<CarnetItem[]>> {
  const result = await addCarnetItem(await admin(), draft);
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/carnet");
  return ok(result.items, "Noté.");
}

export async function updateCarnetItemAction(payload: { id: string; patch: unknown }): Promise<ActionResult<CarnetItem[]>> {
  const id = idSchema.safeParse(payload?.id);
  if (!id.success) return fail("Note inconnue.");
  const result = await updateCarnetItem(await admin(), id.data, payload.patch);
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/carnet");
  return ok(result.items);
}

export async function removeCarnetItemAction(payload: { id: string }): Promise<ActionResult<CarnetItem[]>> {
  const id = idSchema.safeParse(payload?.id);
  if (!id.success) return fail("Note inconnue.");
  const result = await removeCarnetItem(await admin(), id.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/carnet");
  return ok(result.items, "Supprimée.");
}
