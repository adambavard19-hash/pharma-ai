"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { addPartnerEarning, removePartnerEarning } from "@/server/services/partners/partner-earnings";
import { fail, ok, type ActionResult } from "./types";

const schema = z.object({ partnerId: z.string().min(1).max(40), kind: z.string().max(20), amountCents: z.number().int(), receivedOn: z.string().max(10), note: z.string().max(300).nullable() });

export async function addPartnerEarningAction(payload: unknown): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return fail("Saisie invalide.");
  const result = await addPartnerEarning({ fullName: session.admin.fullName }, parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath(`/admin/partenaires/liste/${parsed.data.partnerId}`);
  revalidatePath("/admin");
  return ok(null, "Rémunération enregistrée.");
}

export async function removePartnerEarningAction(id: string, partnerId: string): Promise<ActionResult<null>> {
  await requirePlatformSession();
  await removePartnerEarning(String(id).slice(0, 40));
  revalidatePath(`/admin/partenaires/liste/${String(partnerId).slice(0, 40)}`);
  revalidatePath("/admin");
  return ok(null, "Ligne retirée.");
}
