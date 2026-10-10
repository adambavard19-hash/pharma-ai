"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { answerDrugGap, answerProductGap, dismissGap } from "@/server/services/knowledge-gaps";
import { fail, ok, type ActionResult } from "./types";

/** « Produits à connaître » : la pharmacienne de PharmaBoost apprend au moteur ce qu'il ne sait pas ranger. Session d'administrateur plateforme exigée. */

const idSchema = z.object({ id: z.string().min(1).max(64) });

export async function answerProductGapAction(payload: { id: string; category: string; tags: string[] }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = idSchema.extend({ category: z.string().max(40), tags: z.array(z.string().max(60)).max(20) }).safeParse(payload);
  if (!parsed.success) return fail("Réponse invalide.");
  const result = await answerProductGap({ id: session.admin.id, fullName: session.admin.fullName }, parsed.data.id, { category: parsed.data.category, tags: parsed.data.tags });
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/a-connaitre");
  return ok(null, `« ${result.label} » est appris${result.applied > 0 ? ` : ${result.applied} produit${result.applied > 1 ? "s" : ""} déjà en stock ${result.applied > 1 ? "sont mis" : "est mis"} à jour` : ""}, pour toutes les pharmacies.`);
}

export async function answerDrugGapAction(payload: { id: string; substance: string; atcCode: string; therapeuticClass: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = idSchema.extend({ substance: z.string().max(200), atcCode: z.string().max(20), therapeuticClass: z.string().max(200) }).safeParse(payload);
  if (!parsed.success) return fail("Réponse invalide.");
  const result = await answerDrugGap({ id: session.admin.id, fullName: session.admin.fullName }, parsed.data.id, { substance: parsed.data.substance, atcCode: parsed.data.atcCode, therapeuticClass: parsed.data.therapeuticClass });
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/a-connaitre");
  return ok(null, `« ${result.label} » est appris, pour toutes les pharmacies.`);
}

export async function dismissGapAction(payload: z.input<typeof idSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = idSchema.safeParse(payload);
  if (!parsed.success) return fail("Sujet invalide.");
  const result = await dismissGap({ id: session.admin.id, fullName: session.admin.fullName }, parsed.data.id);
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/a-connaitre");
  return ok(null, `« ${result.label} » est écarté de la liste.`);
}
