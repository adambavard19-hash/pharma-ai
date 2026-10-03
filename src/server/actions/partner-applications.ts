"use server";

import { headers } from "next/headers";
import { receivePartnerApplication } from "@/server/services/partners/application-intake";
import { CONSENT_REQUIRED, partnerApplicationSchema, type PartnerApplicationPayload } from "@/core/partners/application-form";
import { PUBLIC_CONTACT_EMAIL } from "@/config/contact";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

// Pas d'inondation : trois candidatures par heure pour une même adresse, dix par adresse IP.
const recent = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;

function throttled(key: string, max: number): boolean {
  const now = Date.now();
  const stamps = (recent.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  if (stamps.length >= max) return true;
  stamps.push(now);
  recent.set(key, stamps);
  return false;
}

export type { PartnerApplicationPayload };

/** Une candidature PharmaBoost Partenaires, depuis le site public. Aucune activation : l'équipe l'étudie. */
export async function submitPartnerApplicationAction(payload: PartnerApplicationPayload): Promise<ActionResult<{ acknowledged: boolean }>> {
  const parsed = partnerApplicationSchema.safeParse(payload);
  if (!parsed.success) {
    const issues = parsed.error.issues;
    const fieldErrors = zodFieldErrors(issues);
    // Sans consentement, la candidature est refusée explicitement, quel que soit le reste du formulaire.
    if (fieldErrors.consent) return fail(CONSENT_REQUIRED, { ...fieldErrors, consent: "Cochez cette case pour envoyer votre candidature." });
    return fail(issues.length === 1 ? issues[0].message : "Certaines informations sont à corriger.", fieldErrors);
  }
  const input = parsed.data;
  // Un robot a rempli le champ caché : on lui répond comme à un humain, sans rien enregistrer.
  if (input.website) return ok({ acknowledged: false });

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  if (throttled(`partenaire-email:${ip}:${input.email.toLowerCase()}`, 3) || throttled(`partenaire-ip:${ip}`, 10)) {
    return fail(`Nous avons déjà reçu votre candidature. Notre équipe revient vers vous ; pour toute précision, écrivez à ${PUBLIC_CONTACT_EMAIL}.`);
  }

  try {
    const result = await receivePartnerApplication({
      company: input.company,
      brand: input.brand,
      contactFirstName: input.contactFirstName,
      contactLastName: input.contactLastName,
      contactRole: input.contactRole || null,
      email: input.email,
      phone: input.phone || null,
      website: input.websiteUrl,
      universes: input.universes,
      approxReferences: input.approxReferences ?? null,
      distribution: input.distribution || null,
      hasApi: input.hasApi,
      hasB2bPortal: input.hasB2bPortal,
      hasCatalog: input.hasCatalog,
      hasTrainings: input.hasTrainings,
      message: input.message || null,
    });
    return ok({ acknowledged: result.acknowledged });
  } catch (error) {
    console.error("[site] candidature partenaire impossible", error);
    return fail(`Votre candidature n'a pas pu être enregistrée. Écrivez-nous à ${PUBLIC_CONTACT_EMAIL}.`);
  }
}
