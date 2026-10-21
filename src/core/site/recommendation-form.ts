import { z } from "zod";

/**
 * « Recommander une pharmacie » (page Affiliation, fondateur 20 oct. 2026) : l'apporteur d'affaires nous écrit la
 * pharmacie qu'il connaît ; si elle signe, il reçoit sa prime de 100 €. Les règles de saisie, partagées par le
 * formulaire et par l'action serveur, qui reste seule juge. Des coordonnées, rien d'autre : aucune donnée de santé.
 */
export const recommendationSchema = z.object({
  pharmacyName: z.string().trim().min(2, "Le nom de la pharmacie est requis.").max(120),
  city: z.string().trim().min(2, "La ville de la pharmacie est requise.").max(80),
  contactName: z.string().trim().max(120).optional().or(z.literal("")),
  contactPhone: z.string().trim().max(30).optional().or(z.literal("")),
  message: z.string().trim().max(1000).optional().or(z.literal("")),
  referrerName: z.string().trim().min(2, "Votre nom est requis.").max(120),
  referrerEmail: z.string().trim().email("Votre adresse e-mail est invalide.").max(160),
  referrerPhone: z.string().trim().refine((v) => v.replace(/\D/g, "").length >= 9, "Indiquez votre numéro de téléphone.").pipe(z.string().max(30)),
  /** Pot de miel : un humain ne le remplit pas. */
  website: z.string().max(500).optional(),
});

export type RecommendationPayload = z.input<typeof recommendationSchema>;
export type Recommendation = z.output<typeof recommendationSchema>;
