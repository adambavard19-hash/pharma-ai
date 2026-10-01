import { z } from "zod";
import { isValidSiret, normalizeEmail, normalizePostalCode } from "@/core/contracts/identity";

/**
 * La fiche que le titulaire invité remplit lui-même. Les champs obligatoires
 * sont exactement ceux que le contrat exige (core/contracts/requirements.ts),
 * plus le nombre de postes ; le reste est facultatif et le dit.
 */
export const LGO_OPTIONS: { id: string; label: string }[] = [
  { id: "lgpi", label: "LGPI (Pharmagest)" },
  { id: "smart-rx", label: "Smart Rx (Cegedim)" },
  { id: "winpharma", label: "Winpharma" },
  { id: "leo", label: "Léo (Isipharm)" },
  { id: "pharmaland", label: "Pharmaland" },
  { id: "autre", label: "Autre logiciel" },
];

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const onboardingSchema = z.object({
  // L'officine
  name: z.string().trim().min(2, "Le nom de la pharmacie est requis.").max(120),
  legalName: z.string().trim().min(2, "La raison sociale est requise.").max(160),
  siret: z.string().trim().refine((v) => isValidSiret(v), "SIRET invalide : 14 chiffres attendus."),
  finessNumber: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || /^\d{9}$/.test(v.replace(/\s/g, "")), "FINESS invalide : 9 chiffres attendus, ou laissez vide."),
  addressLine1: z.string().trim().min(3, "L'adresse est requise.").max(200),
  postalCode: z.string().trim().refine((v) => normalizePostalCode(v) !== null, "Code postal invalide : 5 chiffres."),
  city: z.string().trim().min(2, "La ville est requise.").max(100),
  phone: optionalText(30),
  contactEmail: z.string().trim().optional().or(z.literal("")).refine((v) => !v || normalizeEmail(v) !== null, "Adresse e-mail invalide."),
  // Le titulaire
  ownerFirstName: z.string().trim().min(1, "Le prénom est requis.").max(80),
  ownerLastName: z.string().trim().min(1, "Le nom est requis.").max(80),
  ownerTitle: optionalText(80),
  ownerEmail: z.string().trim().refine((v) => normalizeEmail(v) !== null, "Adresse e-mail invalide."),
  // L'équipement
  postCount: z.coerce.number({ message: "Indiquez le nombre de postes." }).int("Un nombre entier.").min(1, "Au moins un poste.").max(99, "99 postes au plus."),
  lgo: z.string().trim().optional().or(z.literal("")).refine((v) => !v || LGO_OPTIONS.some((o) => o.id === v), "Logiciel inconnu."),
});

export type OnboardingInput = z.input<typeof onboardingSchema>;
export type OnboardingData = z.output<typeof onboardingSchema>;

/** Les étapes du formulaire et leurs champs : pour valider étape par étape. */
export const ONBOARDING_STEPS = [
  { key: "officine", title: "L'officine", fields: ["name", "legalName", "siret", "finessNumber", "addressLine1", "postalCode", "city", "phone", "contactEmail"] },
  { key: "titulaire", title: "Le titulaire", fields: ["ownerFirstName", "ownerLastName", "ownerTitle", "ownerEmail"] },
  { key: "equipement", title: "L'équipement", fields: ["postCount", "lgo"] },
] as const;
