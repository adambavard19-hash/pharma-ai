"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { rateLimited } from "@/server/http/rate-limit";
import { APP_SESSION_COOKIE, memberFromSession } from "@/server/services/app-members";
import { submitReview } from "@/server/services/patient-reviews";
import type { ReviewInput } from "@/core/patient-app/reviews";
import { fail, ok, type ActionResult } from "./types";

/** Le patient laisse son avis sur sa pharmacie. Seule identité acceptée : le cookie scellé de l'inscrit de l'appli. */
export async function submitPatientReviewAction(input: ReviewInput): Promise<ActionResult<null>> {
  const member = await memberFromSession((await cookies()).get(APP_SESSION_COOKIE)?.value);
  if (!member) return fail("Connectez-vous d'abord avec votre e-mail.");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(`app-review:${ip}`, 10, 60 * 60 * 1000)) return fail("Trop d'essais. Réessayez dans une heure.");
  const result = await submitReview(member, {
    rating: Number(input?.rating),
    tags: Array.isArray(input?.tags) ? input.tags.map(String).slice(0, 12) : [],
    staffUserId: input?.staffUserId ? String(input.staffUserId) : null,
    publicConsent: Boolean(input?.publicConsent),
    publicName: String(input?.publicName ?? ""),
  });
  if (!result.ok) return fail(result.error);
  revalidatePath("/avis-patients");
  return ok(null, "Merci pour votre avis !");
}
