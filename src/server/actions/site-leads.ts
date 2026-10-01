"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { receiveSiteLead } from "@/server/services/site-leads";
import { normalizeSubscriptionRequest, requestSubscription, type SubscriptionRequestOutcome } from "@/server/services/subscription-requests";
import { fail, ok, type ActionResult } from "./types";

const schema = z.object({
  kind: z.enum(["DEMO", "SUBSCRIBE"]),
  pharmacyName: z.string().trim().min(2, "Le nom de l'officine est requis.").max(120),
  contactName: z.string().trim().min(2, "Votre nom est requis.").max(120),
  email: z.string().trim().email("Adresse e-mail invalide.").max(160),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  lgo: z.string().trim().max(60).optional().or(z.literal("")),
  postCount: z.number().int().min(1).max(50).nullable().optional(),
  message: z.string().trim().max(1000).optional().or(z.literal("")),
  preferredSlot: z.string().trim().max(120).optional().or(z.literal("")),
  referralCode: z.string().trim().max(20).optional().or(z.literal("")),
  /** Pot de miel : un humain ne le remplit pas. */
  website: z.string().max(0).optional().or(z.literal("")),
});

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
export async function submitSiteLeadAction(payload: z.input<typeof schema>): Promise<ActionResult<{ acknowledged: boolean }>> {
  const parsed = schema.safeParse(payload);
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
    return fail("Votre demande n'a pas pu être enregistrée. Écrivez-nous à contact@pharmaboost.app.");
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
  /** Confirmation explicite : c'est elle qui déclenche l'envoi du contrat. */
  confirm: z.literal(true, { message: "Confirmez votre demande de souscription pour recevoir le contrat." }),
  website: z.string().max(0).optional().or(z.literal("")),
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
  };
  // Une saisie à corriger ne compte pas comme une demande : on valide avant de limiter.
  const checked = normalizeSubscriptionRequest(request);
  if (!checked.ok) return fail("Certaines informations sont à corriger.", checked.errors);
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  if (throttled(`souscription:${ip}:${checked.value.siret}`)) return fail("Nous avons déjà reçu votre demande : votre contrat vous a été adressé par e-mail.");
  try {
    const result = await requestSubscription(request);
    if (!result.ok) return fail("Certaines informations sont à corriger.", result.errors);
    return ok({ outcome: result.outcome.status });
  } catch (error) {
    console.error("[site] souscription impossible", error);
    return fail("Votre demande n'a pas pu être enregistrée. Écrivez-nous à contact@pharmaboost.app.");
  }
}
