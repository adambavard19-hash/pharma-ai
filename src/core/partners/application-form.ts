import { z } from "zod";
import { isUniverseKey } from "@/config/universes";

/**
 * La candidature PharmaBoost Partenaires : les règles de saisie, partagées
 * par le formulaire (validation question par question) et par l'action
 * serveur, qui reste seule juge. Les coordonnées d'une société, rien d'autre.
 */
export const CONSENT_REQUIRED = "Votre accord est nécessaire pour que nous puissions étudier votre candidature.";

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

export const partnerApplicationSchema = z.object({
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

export type PartnerApplicationPayload = Omit<z.input<typeof partnerApplicationSchema>, "consent"> & { consent: boolean };
