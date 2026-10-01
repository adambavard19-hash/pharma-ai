"use server";

import { headers } from "next/headers";
import { completeOnboarding, markInvitationOpened } from "@/server/services/onboarding";
import type { OnboardingInput } from "@/core/onboarding/form";
import { fail, ok, type ActionResult } from "./types";

/**
 * Les deux gestes du titulaire invité, sans compte : le lien (jeton) fait
 * foi. Le jeton ne donne accès qu'à SON dossier, et à rien d'autre.
 */

// Quelques soumissions par minute et par adresse IP : un formulaire ne se remplit pas plus vite.
const recent = new Map<string, number[]>();
function throttled(key: string, max = 6, windowMs = 60_000): boolean {
  const now = Date.now();
  const stamps = (recent.get(key) ?? []).filter((t) => now - t < windowMs);
  if (stamps.length >= max) return true;
  stamps.push(now);
  recent.set(key, stamps);
  return false;
}

export async function markInvitationOpenedAction(token: string): Promise<void> {
  if (typeof token !== "string" || token.length > 200) return;
  await markInvitationOpened(token);
}

export async function submitOnboardingAction(token: string, input: OnboardingInput): Promise<ActionResult<{ pharmacyName: string; contractReady: boolean }>> {
  if (typeof token !== "string" || token.length > 200) return fail("Ce lien n'est pas valable.");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  if (throttled(`onboarding:${ip}`)) return fail("Trop de tentatives : patientez une minute.");
  const result = await completeOnboarding(token, input);
  if (!result.ok) return fail(result.error, result.fieldErrors);
  return ok({ pharmacyName: result.pharmacyName, contractReady: result.contractReady });
}
