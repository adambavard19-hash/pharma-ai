"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { remindContractNow, sendContract, upsertCompanyProfile } from "@/server/services/sales/contracts";
import { normalizeEmail } from "@/core/contracts/identity";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Contrats, depuis la console. Relancer un contrat non signé : même moteur
 * que la relance automatique, tracé dans le dossier, l'historique des
 * communications et le journal d'audit.
 */
export async function remindContractNowAction(payload: { contractId: string }): Promise<ActionResult<{ status: string }>> {
  const session = await requirePlatformSession();
  const parsed = z.object({ contractId: z.string().min(1).max(60) }).safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await remindContractNow(parsed.data.contractId, { type: "ADMIN", id: session.admin.id, label: session.admin.fullName });
  if (!result.ok) return fail(result.error);
  const contract = await prisma.contract.findUnique({ where: { id: parsed.data.contractId }, select: { prospectId: true, pharmacyId: true } });
  revalidatePath("/admin/contrats");
  if (contract) revalidatePath(`/admin/dossiers/${contract.prospectId}`);
  if (contract?.pharmacyId) revalidatePath(`/admin/pharmacies/${contract.pharmacyId}`);
  if (result.email.status === "FAILED") return fail(`La relance n'est pas partie : ${result.email.detail}`);
  return ok({ status: result.email.status }, result.email.status === "SENT" ? "Relance envoyée." : "Relance enregistrée, mais non transmise : la messagerie n'est pas configurée.");
}

/**
 * Envoyer un brouillon depuis le centre des contrats. Le serveur revérifie
 * tout : le contrat est un brouillon, c'est la dernière version du dossier
 * (un brouillon remplacé ne part jamais), le dossier n'est pas suspendu.
 * L'envoi lui-même est celui du dossier (`sendContract`) : demande de
 * signature, e-mail tracé, événement du dossier, journal d'audit.
 */
export async function sendDraftContractAction(payload: { contractId: string }): Promise<ActionResult<{ prospectId: string }>> {
  const session = await requirePlatformSession();
  const parsed = z.object({ contractId: z.string().min(1).max(60) }).safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const contract = await prisma.contract.findUnique({ where: { id: parsed.data.contractId }, select: { id: true, version: true, status: true, prospectId: true, pharmacyId: true, pharmacySignerEmail: true, prospect: { select: { blockedAt: true } } } });
  if (!contract) return fail("Contrat introuvable.");
  if (contract.status !== "DRAFT") return fail("Ce contrat n'est plus un brouillon : il a déjà été envoyé.");
  if (contract.prospect.blockedAt) return fail("Le dossier est suspendu : levez la suspension avant d'envoyer le contrat.");
  const newer = await prisma.contract.count({ where: { prospectId: contract.prospectId, version: { gt: contract.version } } });
  if (newer > 0) return fail("Une version plus récente de ce contrat existe : ce brouillon ne peut plus être envoyé.");
  const result = await sendContract(contract.id, { type: "ADMIN", id: session.admin.id, label: session.admin.fullName });
  revalidatePath("/admin/contrats");
  revalidatePath(`/admin/contrats/${contract.id}`);
  revalidatePath(`/admin/dossiers/${contract.prospectId}`);
  if (contract.pharmacyId) revalidatePath(`/admin/pharmacies/${contract.pharmacyId}`);
  if (!result.ok) return fail(result.error);
  if (result.skipped) return fail("Un envoi est déjà en cours pour ce contrat : patientez quelques instants.");
  return ok({ prospectId: contract.prospectId }, `Contrat envoyé à ${contract.pharmacySignerEmail}${result.signature ? ` — ${result.signature}` : ""}.`);
}

/** Champs texte facultatifs : vides, ils sont enregistrés comme absents. */
const optionalText = (max: number, tooLong: string) =>
  z
    .string()
    .trim()
    .max(max, tooLong)
    .nullish()
    .transform((v) => (v ? v : null));

const companyProfileSchema = z.object({
  legalName: z.string().trim().min(2, "Indiquez la dénomination sociale (au moins 2 caractères).").max(160, "La dénomination est trop longue (160 caractères au plus)."),
  legalForm: optionalText(60, "La forme juridique est trop longue (60 caractères au plus)."),
  addressLine1: optionalText(200, "L'adresse est trop longue (200 caractères au plus)."),
  postalCode: z
    .string()
    .nullish()
    .transform((v) => (v ?? "").replace(/\s+/g, ""))
    .refine((v) => v === "" || /^\d{5}$/.test(v), "Le code postal compte 5 chiffres, par exemple 75011.")
    .transform((v) => (v ? v : null)),
  city: optionalText(120, "Le nom de la ville est trop long (120 caractères au plus)."),
  siren: z
    .string()
    .nullish()
    .transform((v) => (v ?? "").replace(/[\s.-]+/g, ""))
    .refine((v) => v === "" || /^\d{9}$/.test(v), "Le SIREN compte 9 chiffres, par exemple 123 456 789. Vous le trouverez sur l'extrait Kbis de la société.")
    .transform((v) => (v ? v : null)),
  representativeName: z.string().trim().min(2, "Indiquez le nom du représentant qui signe les contrats.").max(120, "Le nom est trop long (120 caractères au plus)."),
  representativeTitle: optionalText(80, "La qualité est trop longue (80 caractères au plus)."),
  representativeEmail: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => normalizeEmail(v) !== null, "Cette adresse e-mail ne semble pas valide : vérifiez-la, par exemple prenom@societe.fr."),
});

/**
 * Fiche de la société exploitante. Elle ne vaut que pour les contrats à
 * venir : les contrats déjà générés gardent la copie imprimée. L'avant/après
 * est consigné au journal d'audit par `upsertCompanyProfile`.
 */
export async function saveCompanyProfileAdminAction(payload: z.input<typeof companyProfileSchema>): Promise<ActionResult<{ changed: number }>> {
  const session = await requirePlatformSession();
  const parsed = companyProfileSchema.safeParse(payload);
  if (!parsed.success) return fail("Quelques informations sont à revoir.", zodFieldErrors(parsed.error.issues));
  const result = await upsertCompanyProfile(parsed.data, session.admin.id);
  revalidatePath("/admin/societe");
  const changed = Object.keys(result.changes).length;
  if (!result.created && changed === 0) return ok({ changed }, "Aucune modification : la fiche était déjà à jour.");
  return ok({ changed }, result.created ? "Fiche société enregistrée." : "Fiche société mise à jour. Elle s'appliquera aux prochains contrats.");
}
