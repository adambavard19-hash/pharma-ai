"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { receivePartnerApplication } from "@/server/services/partners/application-intake";
import { isUniverseKey } from "@/config/universes";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

const CONSENT_REQUIRED = "Votre accord est nécessaire pour que nous puissions étudier votre candidature.";

const optionalText = (max: number) => z.string().trim().max(max, `${max} caractères au plus.`).optional().or(z.literal(""));

/** « www.marque.fr » ou « https://marque.fr » : on garde une adresse https/http complète, ou rien. */
const websiteField = z
  .string()
  .trim()
  .max(200, "Adresse trop longue.")
  .optional()
  .transform((value, context) => {
    if (!value) return null;
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      const url = new URL(candidate);
      if ((url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".") && !/\s/.test(value)) return url.toString().replace(/\/$/, "");
    } catch {
      // adresse illisible : signalée ci-dessous
    }
    context.addIssue({ code: "custom", message: "Adresse de site invalide (exemple : www.votre-marque.fr)." });
    return z.NEVER;
  });

const schema = z.object({
  company: z.string().trim().min(2, "Le nom de la société est requis.").max(160, "160 caractères au plus."),
  brand: z.string().trim().min(1, "La marque est requise.").max(120, "120 caractères au plus."),
  contactFirstName: z.string().trim().min(1, "Votre prénom est requis.").max(80, "80 caractères au plus."),
  contactLastName: z.string().trim().min(1, "Votre nom est requis.").max(80, "80 caractères au plus."),
  contactRole: optionalText(120),
  email: z.string().trim().email("Adresse e-mail invalide.").max(160, "Adresse e-mail trop longue."),
  phone: optionalText(30),
  websiteUrl: websiteField,
  // Seuls les univers connus sont gardés : un « autre » univers se précise dans le message.
  universes: z
    .array(z.string().max(60))
    .max(30)
    .default([])
    .transform((keys) => [...new Set(keys)].filter(isUniverseKey)),
  approxReferences: z.number({ message: "Indiquez un nombre." }).int("Indiquez un nombre entier.").min(1, "Indiquez un nombre positif.").max(1_000_000, "Nombre trop élevé.").nullable().optional(),
  distribution: optionalText(300),
  hasApi: z.enum(["YES", "NO", "UNKNOWN"]).default("UNKNOWN"),
  hasB2bPortal: z.boolean().nullable().default(null),
  hasCatalog: z.boolean().nullable().default(null),
  hasTrainings: z.boolean().nullable().default(null),
  message: optionalText(2000),
  /** Consentement explicite : sans lui, rien n'est enregistré. */
  consent: z.literal(true, { message: CONSENT_REQUIRED }),
  /** Pot de miel : un humain ne le remplit pas. */
  website: z.string().max(500).optional(),
});

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

export type PartnerApplicationPayload = Omit<z.input<typeof schema>, "consent"> & { consent: boolean };

/** Une candidature PharmaBoost Partenaires, depuis le site public. Aucune activation : l'équipe l'étudie. */
export async function submitPartnerApplicationAction(payload: PartnerApplicationPayload): Promise<ActionResult<{ acknowledged: boolean }>> {
  const parsed = schema.safeParse(payload);
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
    return fail("Nous avons déjà reçu votre candidature. Notre équipe revient vers vous ; pour toute précision, écrivez à contact@pharmaboost.app.");
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
    return fail("Votre candidature n'a pas pu être enregistrée. Écrivez-nous à contact@pharmaboost.app.");
  }
}
