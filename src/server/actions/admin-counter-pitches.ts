"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { resetPitch, saveManualPitch } from "@/server/services/counter-pitches";
import { fail, ok, type ActionResult } from "./types";

/** Console → Conseils → Questions du comptoir : corriger un conseil prêt à dire, ou le rendre à l'IA. Pour toutes les pharmacies. */
const answer = z.object({ ask: z.union([z.literal(0), z.literal(1)]), label: z.string().max(200), say: z.string().max(600), ean: z.string().max(20).nullable() });
const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("save"), key: z.string().min(1).max(80), ask: z.tuple([z.string().max(400), z.string().max(400)]), pitch: z.string().max(1200), answers: z.array(answer).max(6) }),
  z.object({ kind: z.literal("reset"), key: z.string().min(1).max(80) }),
]);

export async function saveCounterPitchAction(payload: unknown): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return fail("Conseil invalide.");
  if (parsed.data.kind === "reset") {
    await resetPitch(parsed.data.key);
    revalidatePath("/admin/conseils");
    return ok(null, "L'IA le réécrira à la prochaine vente qui le propose.");
  }
  const result = await saveManualPitch({ fullName: session.admin.fullName }, parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/conseils");
  return ok(null, "Enregistré, pour toutes les pharmacies.");
}
