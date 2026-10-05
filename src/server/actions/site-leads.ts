"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { receiveSiteLead } from "@/server/services/site-leads";
import { confirmSubscription, normalizeSubscriptionRequest, requestSubscription, type SubscriptionRequestOutcome } from "@/server/services/subscription-requests";
import { PUBLIC_CONTACT_EMAIL } from "@/config/contact";
import { siteLeadSchema, type SiteLeadPayload } from "@/core/site/lead-form";
import { fail, ok, type ActionResult } from "./types";

// Une même adresse ne peut pas inonder la boîte : trois demandes par heure.
const recent = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 3;

function throttled(key: string): boolean {
  const now = Date.now();
  const stamps = (recent.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  if (stamps.length >= MAX_PER_WINDOW) return true;
  stamps.push(now);
  recent.set(key, stamps);
  return false;
}

/** Une demande de démonstration ou d'abonnement, depuis le site public. */
export async function submitSiteLeadAction(payload: SiteLeadPayload): Promise<ActionResult<{ acknowledged: boolean }>> {
  const parsed = siteLeadSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Vérifiez le formulaire.");
  const input = parsed.data;
  if (input.website) return ok({ acknowledged: false });
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  if (throttled(`${ip}:${input.email.toLowerCase()}`)) return fail("Nous avons déjà reçu votre demande. Nous revenons vers vous très vite.");
  try {
    const result = await receiveSiteLead({
      kind: input.kind,
      pharmacyName: input.pharmacyName,
      contactName: input.contactName,
      email: input.email,
      phone: input.phone || null,
      city: input.city || null,
      lgo: input.lgo || null,
      postCount: input.postCount ?? null,
      message: input.message || null,
      preferredSlot: input.preferredSlot || null,
      referralCode: input.referralCode || null,
    });
    return ok({ acknowledged: result.acknowledged });
  } catch (error) {
    console.error("[site] demande impossible", error);
    return fail(`Votre demande n'a pas pu être enregistrée. Écrivez-nous à ${PUBLIC_CONTACT_EMAIL}.`);
  }
}

const subscriptionSchema = z.object({
  pharmacyName: z.string().trim().max(120),
  legalName: z.string().trim().max(160),
  siret: z.string().trim().max(30),
  finessNumber: z.string().trim().max(20).optional().or(z.literal("")),
  addressLine1: z.string().trim().max(200),
  postalCode: z.string().trim().max(10),
  city: z.string().trim().max(80),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  ownerFirstName: z.string().trim().max(80),
  ownerLastName: z.string().trim().max(80),
  ownerTitle: z.string().trim().max(80),
  ownerEmail: z.string().trim().max(160),
  outletCount: z.number().int().min(1).max(50).nullable().optional(),
  planId: z.string().trim().max(40).optional().or(z.literal("")),
  referralCode: z.string().trim().max(20).optional().or(z.literal("")),
  formula: z.enum(["MONTHLY", "ANNUAL"]).optional(),
  /** Confirmation explicite : c'est elle qui déclenche l'envoi du contrat. */
  confirm: z.literal(true, { message: "Confirmez votre demande de souscription pour recevoir le contrat." }),
  website: z.string().max(500).optional(),
});

/**
 * Souscription depuis le site : l'officine confirme sa demande, le contrat
 * part automatiquement (même moteur que la console et l'extranet).
 */
export async function submitSubscriptionRequestAction(payload: z.input<typeof subscriptionSchema>): Promise<ActionResult<{ outcome: SubscriptionRequestOutcome["status"] }>> {
  const parsed = subscriptionSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Vérifiez le formulaire.");
  const input = parsed.data;
  if (input.website) return ok({ outcome: "RECEIVED" });
  const request = {
    pharmacyName: input.pharmacyName,
    legalName: input.legalName,
    siret: input.siret,
    finessNumber: input.finessNumber || null,
    addressLine1: input.addressLine1,
    postalCode: input.postalCode,
    city: input.city,
    phone: input.phone || null,
    ownerFirstName: input.ownerFirstName,
    ownerLastName: input.ownerLastName,
    ownerTitle: input.ownerTitle,
    ownerEmail: input.ownerEmail,
    outletCount: input.outletCount ?? null,
    planId: input.planId || null,
    referralCode: input.referralCode || null,
    formula: input.formula ?? null,
  };
  // Une saisie à corriger ne compte pas comme une demande : on valide avant de limiter.
  const checked = normalizeSubscriptionRequest(request);
  if (!checked.ok) return fail("Certaines informations sont à corriger.", checked.errors);
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  // Limite par adresse IP et par adresse e-mail, quel que soit le SIRET saisi (mémoire de l'instance).
  if (throttled(`souscription-ip:${ip}`) || throttled(`souscription-email:${checked.value.email}`)) return fail(`Nous avons déjà reçu plusieurs demandes : notre équipe revient vers vous. Pour toute urgence, écrivez à ${PUBLIC_CONTACT_EMAIL}.`);
  try {
    const result = await requestSubscription(request);
    if (!result.ok) return fail("Certaines informations sont à corriger.", result.errors);
    return ok({ outcome: result.outcome.status });
  } catch (error) {
    console.error("[site] souscription impossible", error);
    return fail(`Votre demande n'a pas pu être enregistrée. Écrivez-nous à ${PUBLIC_CONTACT_EMAIL}.`);
  }
}

/** Le titulaire confirme son adresse depuis le lien reçu : le contrat part alors, une seule fois. */
export async function confirmSubscriptionAction(token: string): Promise<ActionResult<{ status: string; email: string }>> {
  if (typeof token !== "string" || token.length > 2000) return fail("Lien invalide.");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  if (throttled(`confirmation:${ip}`)) return fail("Trop de tentatives : réessayez dans une heure.");
  const result = await confirmSubscription(token);
  if (!result.ok) return fail(result.error);
  return ok({ status: result.status, email: result.email });
}
