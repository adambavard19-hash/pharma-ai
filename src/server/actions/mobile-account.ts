"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUserSession } from "@/server/auth/user-session";
import { recordAudit } from "@/server/audit/log";
import { updateMobileProfile } from "@/server/services/mobile/account";
import { recordConsent } from "@/server/services/mobile/consents";
import { changeOwnPassword } from "@/server/services/user-password";
import { CONSENT_KINDS, checkboxValue, isConsentKind, isProfession } from "@/core/mobile/profile";
import { refuseInDemo } from "./demo-guard";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * « Bienvenue » et « Mon espace » : ce que la personne règle pour ELLE-MÊME. Chaque action relit la session : elle
 * ne touche jamais qu'au compte connecté, quel que soit l'identifiant qu'un formulaire pourrait envoyer.
 */

const profileSchema = z.object({
  firstName: z.string().trim().min(1, "Indiquez votre prénom").max(80),
  lastName: z.string().trim().min(1, "Indiquez votre nom").max(80),
  profession: z.string().refine(isProfession, "Choisissez votre métier"),
  rpps: z.string().max(40).optional(),
  pharmacyName: z.string().trim().max(120).optional(),
});

function readProfile(formData: FormData) {
  return profileSchema.safeParse({
    firstName: formData.get("firstName") ?? "",
    lastName: formData.get("lastName") ?? "",
    profession: formData.get("profession") ?? "",
    rpps: formData.get("rpps") ?? undefined,
    pharmacyName: formData.get("pharmacyName") ?? undefined,
  });
}

/** Le premier passage : profil + consentements, puis l'accueil. */
export async function completeWelcomeAction(_previous: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  const session = await getUserSession();
  if (!session) redirect("/m/connexion");
  const parsed = readProfile(formData);
  if (!parsed.success) return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));

  const result = await updateMobileProfile(
    session.user.id,
    { firstName: parsed.data.firstName, lastName: parsed.data.lastName, profession: parsed.data.profession as never, rpps: parsed.data.rpps ?? null, pharmacyName: parsed.data.pharmacyName || null },
    { markOnboarded: true },
  );
  if (!result.ok) return fail(result.error, result.field ? { [result.field]: result.error } : undefined);

  for (const kind of CONSENT_KINDS) {
    const field = kind === "PHARMABOOST_NEWS" ? "consentNews" : "consentPartners";
    await recordConsent({ userId: session.user.id, kind, granted: checkboxValue(formData.get(field)), source: "MOBILE_WELCOME" });
  }
  await recordAudit({ action: "user.profile_updated", entityType: "User", entityId: session.user.id, userId: session.user.id, pharmacyId: session.activePharmacy?.id ?? null, metadata: { via: "mobile-welcome" } });
  revalidatePath("/m", "layout");
  redirect("/m");
}

export async function updateMobileProfileAction(_previous: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  const session = await getUserSession();
  if (!session) return fail("Votre session a expiré : reconnectez-vous.");
  const parsed = readProfile(formData);
  if (!parsed.success) return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  const result = await updateMobileProfile(session.user.id, {
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    profession: parsed.data.profession as never,
    rpps: parsed.data.rpps ?? null,
    pharmacyName: parsed.data.pharmacyName || null,
  });
  if (!result.ok) return fail(result.error, result.field ? { [result.field]: result.error } : undefined);
  await recordAudit({ action: "user.profile_updated", entityType: "User", entityId: session.user.id, userId: session.user.id, pharmacyId: session.activePharmacy?.id ?? null, metadata: { via: "mobile" } });
  revalidatePath("/m", "layout");
  return ok(null, "Profil enregistré.");
}

/** Un interrupteur de « Mon espace » : une ligne de plus dans le journal des consentements. */
export async function setConsentAction(payload: { kind: string; granted: boolean }): Promise<ActionResult<null>> {
  const session = await getUserSession();
  if (!session) return fail("Votre session a expiré : reconnectez-vous.");
  if (!payload || !isConsentKind(payload.kind) || typeof payload.granted !== "boolean") return fail("Demande invalide.");
  const changed = await recordConsent({ userId: session.user.id, kind: payload.kind, granted: payload.granted, source: "MOBILE_SETTINGS" });
  if (changed) await recordAudit({ action: "user.consent_changed", entityType: "User", entityId: session.user.id, userId: session.user.id, metadata: { kind: payload.kind, granted: payload.granted } });
  revalidatePath("/m/moi");
  return ok(null, payload.granted ? "Accord enregistré." : "Accord retiré.");
}

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Mot de passe actuel requis").max(200),
  newPassword: z.string().min(1, "Nouveau mot de passe requis").max(200),
});

/** Le même changement de mot de passe que le comptoir (`changeOwnPassword`), depuis une session mobile. */
export async function changeMyPasswordAction(payload: z.input<typeof passwordSchema>): Promise<ActionResult<null>> {
  const session = await getUserSession();
  if (!session) return fail("Votre session a expiré : reconnectez-vous.");
  const refused = refuseInDemo({ scope: { isDemo: session.activePharmacy?.isDemo } }, "Mode démo : le mot de passe du compte de démonstration ne se change pas.");
  if (refused) return refused;
  const parsed = passwordSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  const result = await changeOwnPassword({ userId: session.user.id, sessionId: session.sessionId, pharmacyId: session.activePharmacy?.id ?? null }, parsed.data.currentPassword, parsed.data.newPassword);
  if (!result.ok) return fail(result.error, { [result.field]: result.error });
  return ok(null, "Mot de passe modifié.");
}
