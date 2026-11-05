"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDirectorSession } from "@/server/auth/director-session";
import { prisma } from "@/server/db/client";
import { fail, ok, type ActionResult } from "./types";

/**
 * Les gestes du directeur sur une démonstration (fondateur, 5 nov. 2026) : « Démo faite » (elle est à lui : 100 € quand la
 * pharmacie va au bout), puis « Envoyer le lien de bienvenue » (le titulaire signe et paie depuis son espace).
 */
const actorOf = (session: Awaited<ReturnType<typeof requireDirectorSession>>) => ({ type: "DIRECTOR" as const, id: session.director.id, label: session.director.fullName });

export async function directorDemoDoneAction(payload: { prospectId: string }): Promise<ActionResult<null>> {
  const session = await requireDirectorSession();
  if (typeof payload?.prospectId !== "string" || !payload.prospectId) return fail("Dossier introuvable.");
  const prospect = await prisma.prospect.findUnique({ where: { id: payload.prospectId }, select: { demoDirectorId: true, demoDoneAt: true } });
  if (!prospect) return fail("Dossier introuvable.");
  if (prospect.demoDirectorId && prospect.demoDirectorId !== session.director.id) return fail("Cette démonstration est déjà attribuée à un autre directeur.");
  if (!prospect.demoDoneAt) {
    const { markDemoDone } = await import("@/server/services/sales/prospects");
    const done = await markDemoDone(payload.prospectId, actorOf(session));
    if (!done.ok) return fail(done.error);
  }
  // Conditionnel : deux directeurs au même instant, un seul l'emporte.
  const claimed = await prisma.prospect.updateMany({ where: { id: payload.prospectId, OR: [{ demoDirectorId: null }, { demoDirectorId: session.director.id }] }, data: { demoDirectorId: session.director.id } });
  if (claimed.count !== 1) return fail("Cette démonstration vient d'être attribuée à un autre directeur.");
  revalidatePath("/directeur/demos");
  return ok(null, "Démo faite : elle est à vous. 100 € HT quand la pharmacie aura réglé sa mise en service.");
}

export async function directorSendWelcomeAction(payload: { prospectId: string }): Promise<ActionResult<null>> {
  const session = await requireDirectorSession();
  if (typeof payload?.prospectId !== "string" || !payload.prospectId) return fail("Dossier introuvable.");
  const { createPharmacyFromProspect } = await import("@/server/services/sales/client-pharmacies");
  const result = await createPharmacyFromProspect(payload.prospectId, actorOf(session), { beforeContract: true, softwareGate: true });
  if (!result.ok) return fail(result.error);
  revalidatePath("/directeur/demos");
  return ok(null, result.welcome.status === "SENT" ? "Lien de bienvenue envoyé : le titulaire crée son accès, signe puis paie dans son espace." : `Espace créé, mais le lien n'est pas parti : ${result.welcome.detail}`);
}

/**
 * « Ouvrir l'espace de démonstration » : le directeur entre dans l'officine de démonstration (fictive, isolée, `isDemo`) en
 * titulaire, sans mot de passe à taper, pour mener sa démo. Jamais une vraie officine.
 */
export async function openDemoSpaceAction(): Promise<void> {
  const session = await requireDirectorSession();
  const { DEMO_LOGIN_EMAIL, DEMO_PHARMACY_SLUG } = await import("@/core/demo/identity");
  const pharmacy = await prisma.pharmacy.findFirst({ where: { slug: DEMO_PHARMACY_SLUG, isDemo: true }, select: { id: true } });
  const owner = pharmacy ? await prisma.user.findFirst({ where: { email: DEMO_LOGIN_EMAIL, memberships: { some: { pharmacyId: pharmacy.id, isActive: true } } }, select: { id: true } }) : null;
  if (!pharmacy || !owner) redirect("/directeur/demos?demo=absente");
  const { createSession } = await import("@/server/auth/session");
  await createSession({ userId: owner.id, pharmacyId: pharmacy.id });
  const { recordAudit } = await import("@/server/audit/log");
  await recordAudit({ action: "auth.login", entityType: "User", entityId: owner.id, pharmacyId: pharmacy.id, metadata: { via: "directeur commercial", salesDirectorId: session.director.id } });
  redirect("/demo");
}
