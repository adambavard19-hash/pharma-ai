"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { campaignAudience, saveCampaign, sendCampaign } from "@/server/services/partner-emails";
import { fail, ok, type ActionResult } from "./types";

const schema = z.object({
  id: z.string().max(40).nullable().optional(),
  brandId: z.string().min(1).max(40),
  subject: z.string().max(200),
  body: z.string().max(3000),
  imageUrl: z.string().max(500).nullable(),
  affiliateUrl: z.string().max(1000),
  universes: z.array(z.string().max(40)).max(12),
});

export async function savePartnerCampaignAction(payload: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await requirePlatformSession();
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return fail("Campagne invalide.");
  const result = await saveCampaign({ fullName: session.admin.fullName }, parsed.data);
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/partenaires/emails-patients");
  return ok({ id: result.id }, "Campagne enregistrée.");
}

export async function partnerAudienceAction(universes: string[]): Promise<number> {
  await requirePlatformSession();
  return campaignAudience(universes.slice(0, 12));
}

export async function sendPartnerCampaignAction(id: string): Promise<ActionResult<{ sent: number }>> {
  await requirePlatformSession();
  const result = await sendCampaign(String(id).slice(0, 40), new Date(), { deadlineAt: Date.now() + 240_000 });
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/partenaires/emails-patients");
  return ok({ sent: result.sent }, `Campagne envoyée à ${result.sent} patient${result.sent > 1 ? "s" : ""}${result.failed ? ` (${result.failed} en échec)` : ""}.`);
}
