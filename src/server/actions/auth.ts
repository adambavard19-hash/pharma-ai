"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { verifyPassword } from "@/server/security/password";
import {
  createSession,
  destroySession,
  getRequestMeta,
  requireSession,
  switchPharmacy,
} from "@/server/auth/session";
import { recordAudit } from "@/server/audit/log";
import { fail, zodFieldErrors, type ActionResult } from "./types";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

export async function loginAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return fail("Vérifiez les informations saisies.", zodFieldErrors(parsed.error.issues));
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      memberships: {
        where: { isActive: true },
        include: { pharmacy: { select: { id: true, isActive: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const passwordValid = await verifyPassword(password, user?.passwordHash);

  // Message identique dans tous les cas : ne pas révéler quels comptes existent.
  const genericError = "Identifiants incorrects.";

  if (!user) {
    // Une base sans aucun compte n'a rien à protéger : le message générique
    // ferait croire à une erreur de saisie alors que l'installation est
    // incomplète. On le dit, et on donne la commande qui corrige.
    const totalUsers = await prisma.user.count({ where: { deletedAt: null } }).catch(() => -1);
    if (totalUsers === 0) {
      return fail(
        "Aucun compte n'existe encore dans la base. Lancez `npm run db:seed` pour installer le jeu de démonstration, puis rechargez cette page.",
      );
    }
    if (totalUsers < 0) {
      return fail(
        "La base de données n'est pas joignable. Vérifiez que PostgreSQL est démarré, puis lancez `npm run doctor`.",
      );
    }
  }

  if (!user || !passwordValid || user.deletedAt) {
    await recordAudit({
      action: "auth.login_failed",
      entityType: "User",
      entityId: user?.id ?? null,
      metadata: { email },
    });
    return fail(genericError);
  }

  if (user.status !== "ACTIVE") {
    return fail(
      "Ce compte n'est pas actif. Contactez le titulaire de votre officine.",
    );
  }

  const membership = user.memberships.find((m) => m.pharmacy.isActive);
  if (!membership) {
    return fail("Aucune officine active n'est associée à ce compte.");
  }

  const meta = await getRequestMeta();
  await createSession({
    userId: user.id,
    pharmacyId: membership.pharmacyId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  await recordAudit({
    action: "auth.login",
    entityType: "User",
    entityId: user.id,
    pharmacyId: membership.pharmacyId,
    userId: user.id,
  });

  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const session = await requireSession().catch(() => null);
  if (session) {
    await recordAudit({
      action: "auth.logout",
      entityType: "User",
      entityId: session.user.id,
      pharmacyId: session.pharmacy.id,
      userId: session.user.id,
    });
  }
  await destroySession();
  redirect("/login");
}

export async function switchPharmacyAction(formData: FormData): Promise<void> {
  const pharmacyId = String(formData.get("pharmacyId") ?? "");
  if (!pharmacyId) return;

  const session = await requireSession();
  await switchPharmacy(pharmacyId);

  await recordAudit({
    action: "auth.pharmacy_switched",
    entityType: "Pharmacy",
    entityId: pharmacyId,
    pharmacyId,
    userId: session.user.id,
  });

  redirect("/");
}

/** Connexion rapide au compte de démonstration, uniquement si activé. */
export async function demoLoginAction(formData: FormData): Promise<void> {
  const { isDemoMode } = await import("@/config/env");
  if (!isDemoMode()) redirect("/login");

  const email = String(formData.get("email") ?? "").toLowerCase();
  const user = await prisma.user.findFirst({
    where: {
      email,
      status: "ACTIVE",
      memberships: { some: { isActive: true, pharmacy: { isDemo: true } } },
    },
    include: { memberships: { where: { isActive: true }, take: 1 } },
  });

  if (!user || !user.memberships[0]) redirect("/login?erreur=demo-indisponible");

  const meta = await getRequestMeta();
  await createSession({
    userId: user.id,
    pharmacyId: user.memberships[0].pharmacyId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  await recordAudit({
    action: "auth.login",
    entityType: "User",
    entityId: user.id,
    pharmacyId: user.memberships[0].pharmacyId,
    userId: user.id,
    metadata: { mode: "demo" },
  });

  redirect("/");
}
