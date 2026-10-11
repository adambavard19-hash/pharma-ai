"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authenticateUser } from "@/server/auth/credentials";
import { createSession, destroySession, getRequestMeta, switchPharmacy } from "@/server/auth/session";
import { getUserSession } from "@/server/auth/user-session";
import { recordAudit } from "@/server/audit/log";
import { throttled } from "@/server/security/throttle";
import { createCommunityAccount } from "@/server/services/mobile/account";
import { checkboxValue, isProfession } from "@/core/mobile/profile";
import { fail, zodFieldErrors, type ActionResult } from "./types";

/**
 * Les portes d'entrée de PharmaBoost Mobile : connexion, inscription gratuite, déconnexion, choix de l'officine.
 *
 * Même système de comptes que le comptoir (src/server/auth/credentials.ts pour le mot de passe, la même table de
 * sessions, le même cookie). La seule différence : ici, un compte SANS officine entre — il ouvre l'application
 * gratuite. Les formulaires publics sont freinés (adresse IP et adresse e-mail), comme les autres écrans publics.
 */

async function clientKey(): Promise<string> {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide"),
  password: z.string().min(1, "Mot de passe requis").max(200),
});

export async function mobileLoginAction(_previous: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  const { email, password } = parsed.data;

  if (throttled(`mobile-login:${await clientKey()}`, 10) || throttled(`mobile-login-mail:${email}`, 6)) {
    return fail("Trop de tentatives : patientez une minute avant de réessayer.");
  }

  const check = await authenticateUser(email, password);
  if (check.kind === "INVALID") {
    await recordAudit({ action: "auth.login_failed", entityType: "User", entityId: check.userId, metadata: { email, via: "mobile" } });
    return fail("Identifiants incorrects.");
  }
  if (check.kind === "INACTIVE") return fail("Ce compte n'est pas actif. Écrivez-nous à contact@pharmaboost.app si vous pensez que c'est une erreur.");

  const pharmacyId = check.user.activePharmacyIds[0] ?? null;
  const meta = await getRequestMeta();
  await createSession({ userId: check.user.id, pharmacyId, ipAddress: meta.ipAddress, userAgent: meta.userAgent });
  await recordAudit({ action: "auth.login", entityType: "User", entityId: check.user.id, pharmacyId, userId: check.user.id, metadata: { via: "mobile" } });

  redirect(check.user.mobileOnboardedAt ? "/m" : "/m/bienvenue");
}

const signupSchema = z.object({
  firstName: z.string().trim().min(1, "Indiquez votre prénom").max(80),
  lastName: z.string().trim().min(1, "Indiquez votre nom").max(80),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide").max(200),
  password: z.string().min(1, "Choisissez un mot de passe").max(200),
  profession: z.string().refine(isProfession, "Choisissez votre métier"),
  rpps: z.string().max(40).optional(),
  pharmacyName: z.string().trim().max(120).optional(),
});

/**
 * Créer un compte gratuit. Les deux cases de consentement arrivent DÉCOCHÉES : seule une case cochée par la
 * personne vaut accord (`checkboxValue`). Le compte est ouvert tout de suite, puis la personne passe par
 * « Bienvenue ».
 */
export async function mobileSignupAction(_previous: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  const parsed = signupSchema.safeParse({
    firstName: formData.get("firstName") ?? "",
    lastName: formData.get("lastName") ?? "",
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
    profession: formData.get("profession") ?? "",
    rpps: formData.get("rpps") ?? undefined,
    pharmacyName: formData.get("pharmacyName") ?? undefined,
  });
  if (!parsed.success) return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  const input = parsed.data;

  if (throttled(`mobile-signup:${await clientKey()}`, 5, 10 * 60_000) || throttled(`mobile-signup-mail:${input.email}`, 3, 10 * 60_000)) {
    return fail("Trop de tentatives : patientez quelques minutes avant de réessayer.");
  }

  const result = await createCommunityAccount({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    password: input.password,
    profession: input.profession as never,
    rpps: input.rpps ?? null,
    pharmacyName: input.pharmacyName || null,
    consents: {
      PHARMABOOST_NEWS: checkboxValue(formData.get("consentNews")),
      PARTNER_COMMUNICATIONS: checkboxValue(formData.get("consentPartners")),
    },
  });
  if (!result.ok) return fail(result.error, result.field ? { [result.field]: result.error } : undefined);

  const meta = await getRequestMeta();
  await createSession({ userId: result.userId, pharmacyId: null, ipAddress: meta.ipAddress, userAgent: meta.userAgent });
  await recordAudit({ action: "auth.mobile_signup", entityType: "User", entityId: result.userId, userId: result.userId, metadata: { profession: input.profession } });
  redirect("/m/bienvenue");
}

export async function mobileLogoutAction(): Promise<void> {
  const session = await getUserSession();
  if (session) {
    await recordAudit({ action: "auth.logout", entityType: "User", entityId: session.user.id, pharmacyId: session.activePharmacy?.id ?? null, userId: session.user.id, metadata: { via: "mobile" } });
  }
  await destroySession();
  redirect("/m/connexion");
}

/**
 * Changer d'officine (personnes rattachées à plusieurs officines). Réutilise `switchPharmacy` du comptoir : la
 * vérification « cette officine est bien l'une des vôtres » est la même, et la session est la même.
 */
export async function mobileSwitchPharmacyAction(formData: FormData): Promise<void> {
  const pharmacyId = String(formData.get("pharmacyId") ?? "");
  const session = await getUserSession();
  if (!session) redirect("/m/connexion");
  if (!pharmacyId || !session.memberships.some((m) => m.pharmacyId === pharmacyId)) redirect("/m/officine");
  await switchPharmacy(pharmacyId);
  await recordAudit({ action: "auth.pharmacy_switched", entityType: "Pharmacy", entityId: pharmacyId, pharmacyId, userId: session.user.id, metadata: { via: "mobile" } });
  // Toute l'application suit l'officine active : la barre du haut (mise en page) comprise, sinon elle garderait l'ancienne.
  revalidatePath("/m", "layout");
  redirect("/m");
}
