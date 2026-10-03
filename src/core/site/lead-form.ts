import { z } from "zod";

/**
 * La demande de démonstration (ou d'abonnement simple) du site : les règles de
 * saisie, partagées par le formulaire et par l'action serveur, qui reste seule
 * juge. Les coordonnées de l'officine, rien d'autre : aucune donnée de santé.
 */
export const siteLeadSchema = z.object({
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
  website: z.string().max(500).optional(),
});

export type SiteLeadPayload = z.input<typeof siteLeadSchema>;
