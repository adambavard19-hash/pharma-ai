"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { saveCureDuration } from "@/server/services/cure-reminders";
import { fail, ok, type ActionResult } from "./types";

/** Console → Conseils → Durées de cure : règle la durée d'une famille ou d'un produit, pour toutes les pharmacies. */
const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("family"), category: z.string().min(1).max(40), days: z.number().int().nullable() }),
  z.object({ kind: z.literal("product"), ean: z.string().min(1).max(20), label: z.string().max(160), days: z.number().int().nullable() }),
]);

export async function saveCureDurationAction(payload: unknown): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return fail("Durée invalide.");
  const result = await saveCureDuration({ fullName: session.admin.fullName }, parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/conseils");
  return ok(null, parsed.data.days === null ? "Durée retirée." : "Durée enregistrée, pour toutes les pharmacies.");
}
