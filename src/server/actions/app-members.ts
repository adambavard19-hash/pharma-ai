"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { rateLimited } from "@/server/http/rate-limit";
import {
  activatePlusPreview,
  APP_SESSION_COOKIE,
  cancelPlus,
  chooseHomePharmacy,
  declareOutsidePharmacy,
  issueOfferCode,
  memberFromSession,
  offerCodeState,
  requestAppLogin,
  setOffersConsent,
  type AppMemberView,
} from "@/server/services/app-members";
import { PATIENT_APP_LIVE } from "@/core/patient-app/offers";
import { fail, ok, type ActionResult } from "./types";

/**
 * Les gestes de l'inscrit dans l'appli des patients. Aucune session d'officine : le cookie scellé de l'inscrit est la seule
 * identité acceptée, et il ne donne accès qu'à son propre compte.
 */

async function currentMember(): Promise<AppMemberView | null> {
  return memberFromSession((await cookies()).get(APP_SESSION_COOKIE)?.value);
}

function refresh() {
  revalidatePath("/app", "layout");
}

export async function requestAppLoginAction(email: string): Promise<ActionResult<{ previewUrl: string | null }>> {
  if (!PATIENT_APP_LIVE) return fail("L'appli PharmaBoost ouvre bientôt.");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(`app-login:${ip}`, 8, 60 * 60 * 1000)) return fail("Trop de demandes. Réessayez dans une heure.");
  const result = await requestAppLogin(String(email ?? "").slice(0, 254));
  if (!result.ok) return fail(result.error);
  return ok({ previewUrl: result.previewUrl }, "Lien envoyé : ouvrez l'e-mail sur ce téléphone.");
}

export async function logoutAppAction(): Promise<void> {
  (await cookies()).delete(APP_SESSION_COOKIE);
  refresh();
}

export async function chooseHomePharmacyAction(pharmacyId: string): Promise<ActionResult<null>> {
  const member = await currentMember();
  if (!member) return fail("Connectez-vous d'abord.");
  const result = await chooseHomePharmacy(member.id, String(pharmacyId ?? "").slice(0, 64));
  if (!result.ok) return fail(result.error ?? "Choix impossible.");
  refresh();
  return ok(null, "C'est noté : c'est votre pharmacie.");
}

const declareSchema = z.object({ pharmacyName: z.string().max(200), city: z.string().max(120), postalCode: z.string().max(12), wantsJoin: z.boolean() });

export async function declareOutsidePharmacyAction(payload: z.input<typeof declareSchema>): Promise<ActionResult<null>> {
  const member = await currentMember();
  if (!member) return fail("Connectez-vous d'abord.");
  const parsed = declareSchema.safeParse(payload);
  if (!parsed.success) return fail("Requête invalide.");
  const result = await declareOutsidePharmacy(member.id, parsed.data);
  if (!result.ok) return fail(result.error ?? "Enregistrement impossible.");
  refresh();
  return ok(null, parsed.data.wantsJoin ? "Merci ! Nous allons proposer PharmaBoost à votre pharmacie." : "C'est noté.");
}

export async function setOffersConsentAction(on: boolean): Promise<ActionResult<null>> {
  const member = await currentMember();
  if (!member) return fail("Connectez-vous d'abord.");
  await setOffersConsent(member.id, Boolean(on));
  refresh();
  return ok(null);
}

export async function activatePlusAction(): Promise<ActionResult<null>> {
  const member = await currentMember();
  if (!member) return fail("Connectez-vous d'abord.");
  const result = await activatePlusPreview(member.id);
  if (!result.ok) return fail(result.error ?? "Abonnement impossible.");
  refresh();
  return ok(null, "Bienvenue dans PharmaBoost+ !");
}

export async function cancelPlusAction(): Promise<ActionResult<null>> {
  const member = await currentMember();
  if (!member) return fail("Connectez-vous d'abord.");
  await cancelPlus(member.id);
  refresh();
  return ok(null, "Abonnement arrêté.");
}

export async function issueOfferCodeAction(offerId: string): Promise<ActionResult<{ code: string; redeemedAt: string | null }>> {
  const member = await currentMember();
  if (!member) return fail("Connectez-vous d'abord.");
  const result = await issueOfferCode(member, String(offerId ?? "").slice(0, 64));
  if (!result.ok) return fail(result.error);
  return ok({ code: result.code, redeemedAt: result.redeemedAt?.toISOString() ?? null });
}

export async function offerCodeStateAction(offerId: string): Promise<ActionResult<{ redeemedAt: string | null; pharmacyName: string | null }>> {
  const member = await currentMember();
  if (!member) return fail("Connectez-vous d'abord.");
  const state = await offerCodeState(member.id, String(offerId ?? "").slice(0, 64));
  if (!state) return fail("Aucun code pour cette offre.");
  return ok({ redeemedAt: state.redeemedAt?.toISOString() ?? null, pharmacyName: state.pharmacyName });
}
