import { z } from "zod";
import { CURRENT_STATUSES } from "./status";

/**
 * La candidature « Devenir commercial » : les règles de saisie, partagées par
 * le formulaire (validation question par question) et par l'action serveur,
 * qui reste seule juge. Des coordonnées et un parcours professionnel : aucune
 * donnée de santé, aucune donnée patient.
 *
 * Les longueurs maximales suivent celles de la création d'un commercial dans
 * la console (prénom et nom 80, téléphone 30, zone 120) : une candidature
 * acceptée doit pouvoir être transformée en commercial telle quelle.
 */
export const CONSENT_REQUIRED = "Votre accord est nécessaire pour que nous puissions étudier votre candidature.";

const optionalText = (max: number) => z.string().trim().max(max, `${max} caractères au plus.`).optional().or(z.literal(""));

/** « 06 12 34 56 78 », « +33 6 12 34 56 78 », « 01.23.45.67.89 » : des chiffres, quelques séparateurs, 6 à 15 chiffres. */
export function isPlausiblePhone(value: string): boolean {
  if (!/^\+?[\d\s().-]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, "").length;
  return digits >= 6 && digits <= 15;
}

export const salesApplicationSchema = z.object({
  firstName: z.string().trim().min(1, "Votre prénom est requis.").max(80, "80 caractères au plus."),
  lastName: z.string().trim().min(1, "Votre nom est requis.").max(80, "80 caractères au plus."),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(160, "Adresse e-mail trop longue."),
  phone: z
    .string()
    .trim()
    .min(1, "Votre numéro de téléphone est requis.")
    .max(30, "30 caractères au plus.")
    .refine(isPlausiblePhone, "Numéro de téléphone invalide (exemple : 06 12 34 56 78)."),
  city: z.string().trim().min(2, "Indiquez votre ville ou votre secteur.").max(120, "120 caractères au plus."),
  zone: z.string().trim().min(2, "Indiquez la zone où vous souhaitez travailler.").max(120, "120 caractères au plus."),
  currentStatus: z.string().refine((value) => CURRENT_STATUSES.some((status) => status.value === value), "Choisissez la situation qui vous correspond."),
  salesExperience: z.string().trim().min(10, "Décrivez en quelques mots votre expérience commerciale (10 caractères au moins).").max(2000, "2 000 caractères au plus."),
  /** Facultatif : une expérience avec les pharmacies ou la santé. */
  healthExperience: optionalText(2000),
  message: z.string().trim().min(10, "Dites-nous en quelques mots ce qui vous motive (10 caractères au moins).").max(2000, "2 000 caractères au plus."),
  /** Consentement explicite : sans lui, rien n'est enregistré. */
  consent: z.literal(true, { message: CONSENT_REQUIRED }),
  /** Pot de miel : un humain ne le remplit pas. */
  website: z.string().max(500).optional(),
});

export type SalesApplicationPayload = Omit<z.input<typeof salesApplicationSchema>, "consent"> & { consent: boolean };
export type SalesApplicationData = Omit<z.output<typeof salesApplicationSchema>, "consent" | "website">;

/** Ce que le visiteur apprend après l'envoi : l'accusé est-il parti, et le CV a-t-il pu être gardé. */
export type SalesApplicationReceipt = { acknowledged: boolean; cv: "none" | "saved" | "failed" };

// ---------------------------------------------------------------- CV

export const CV_MAX_BYTES = 3 * 1024 * 1024;
export const CV_MAX_LABEL = "3 Mo";
export const CV_SIGNATURE = "%PDF-";
export const CV_MIME = "application/pdf";

/** Où le CV est rangé dans le stockage de la plateforme : jamais sous l'identifiant d'une officine, donc jamais servi par la route des ordonnances. */
export function cvStorageKey(applicationId: string): string {
  return `sales-applications/${applicationId}/cv.pdf`;
}

/** Un nom de fichier lisible et sans danger : ni chemin, ni caractère de contrôle, toujours en « .pdf ». */
export function sanitizeCvFileName(raw: string): string {
  const base = raw.normalize("NFC").split(/[\\/]/).pop() ?? "";
  const withoutExtension = base.replace(/\.pdf$/i, "");
  const cleaned = withoutExtension
    .replace(/[^\p{L}\p{N} ._()'’-]+/gu, " ")
    .replace(/ {2,}/g, " ")
    .replace(/^[ ._-]+|[ ._-]+$/g, "")
    .slice(0, 100)
    .trim();
  return `${cleaned || "cv"}.pdf`;
}

/** Contrôle rapide côté navigateur, pour répondre sans attendre : le serveur, lui, relit tout (`inspectCv`). */
export function cvFileProblem(file: { name: string; size: number; type?: string }): string | null {
  if (file.size <= 0) return "Ce fichier est vide.";
  if (file.size > CV_MAX_BYTES) return `Ce fichier dépasse ${CV_MAX_LABEL}. Choisissez un PDF plus léger.`;
  if (file.type !== CV_MIME && !/\.pdf$/i.test(file.name)) return "Le CV doit être un fichier PDF.";
  return null;
}

export type CvInspection = { ok: true; fileName: string; sizeBytes: number } | { ok: false; error: string };

/**
 * Le contrôle du serveur : la taille réelle et la signature du fichier (« %PDF- »
 * en tête), pas le type que le navigateur annonce. Un fichier renommé en .pdf
 * ne passe pas.
 */
export function inspectCv(bytes: Uint8Array, fileName: string): CvInspection {
  if (bytes.byteLength === 0) return { ok: false, error: "Ce fichier est vide." };
  if (bytes.byteLength > CV_MAX_BYTES) return { ok: false, error: `Ce fichier dépasse ${CV_MAX_LABEL}. Choisissez un PDF plus léger.` };
  const head = String.fromCharCode(...bytes.subarray(0, CV_SIGNATURE.length));
  if (head !== CV_SIGNATURE) return { ok: false, error: "Ce fichier n'est pas un PDF lisible. Exportez votre CV au format PDF." };
  return { ok: true, fileName: sanitizeCvFileName(fileName), sizeBytes: bytes.byteLength };
}
