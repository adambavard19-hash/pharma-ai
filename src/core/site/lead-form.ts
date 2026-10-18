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
  /** Le commercial dont le lien de démonstration a amené la pharmacie (identifiant du commercial, 17 oct. 2026). */
  salesRepCode: z.string().trim().max(40).optional().or(z.literal("")),
  /** Le créneau de démonstration réservé (instant ISO) ; vide : « rappelez-moi pour fixer un créneau ». */
  demoAt: z.string().trim().datetime().optional().or(z.literal("")),
  /** Pot de miel : un humain ne le remplit pas. */
  website: z.string().max(500).optional(),
}).superRefine((value, ctx) => {
  // Un créneau réservé, c'est un appel : il faut un numéro où joindre la personne.
  if (value.demoAt && (value.phone ?? "").replace(/\D/g, "").length < 9) ctx.addIssue({ code: "custom", path: ["phone"], message: "Indiquez le numéro où nous vous appelons." });
});

export type SiteLeadPayload = z.input<typeof siteLeadSchema>;
