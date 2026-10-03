"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { recordAudit } from "@/server/audit/log";
import { setAccessSuspended } from "@/server/billing/subscriptions";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Gestes de l'espace « Clients » : suspendre ou rétablir l'accès d'une
 * officine, marquer un incident résolu. Toujours confirmés à l'écran, toujours
 * revérifiés ici : session, entrée, état réel en base.
 */

const id = z.string().trim().min(1).max(64);
const reason = z.string().trim().min(5, "Indiquez le motif (5 caractères au moins).").max(500, "Le motif est trop long (500 caractères au plus).");

const accessSchema = z.object({ pharmacyId: id, suspended: z.boolean(), reason });

/**
 * Suspendre ou rétablir l'accès d'une officine, avec un motif obligatoire.
 * Même geste que l'espace Facturation (`setAccessSuspended`) : sessions
 * fermées à la suspension, abonnement marqué suspendu, rien n'est supprimé ;
 * le motif est consigné au journal.
 */
export async function setPharmacyAccessAction(payload: z.input<typeof accessSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = accessSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez le motif.", zodFieldErrors(parsed.error.issues));
  const { pharmacyId, suspended } = parsed.data;

  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { id: true, name: true, isActive: true, organization: { select: { subscription: { select: { suspendedAt: true } } } } } });
  if (!pharmacy) return fail("Officine introuvable.");
  const currentlySuspended = !pharmacy.isActive || Boolean(pharmacy.organization.subscription?.suspendedAt);
  if (suspended && !pharmacy.isActive) return fail(`${pharmacy.name} est déjà suspendue.`);
  if (!suspended && !currentlySuspended) return fail(`${pharmacy.name} est déjà active.`);

  const result = await setAccessSuspended(pharmacy.id, suspended, parsed.data.reason, session.admin.id);
  if (!result.ok) return fail(result.error);

  for (const path of ["/admin", "/admin/pharmacies", `/admin/pharmacies/${pharmacy.id}`, "/admin/abonnements", `/admin/abonnements/${pharmacy.id}`, "/admin/acces", "/admin/activite"]) revalidatePath(path);
  return ok(null, suspended ? `${pharmacy.name} est suspendue : les sessions de l'officine sont fermées.` : `Accès de ${pharmacy.name} rétabli.`);
}

const incidentSchema = z.object({ incidentId: id, reason });

/** Marquer un incident résolu : la date et le commentaire sont consignés, l'incident n'est pas effacé. */
export async function resolveIncidentAction(payload: z.input<typeof incidentSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = incidentSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez le commentaire.", zodFieldErrors(parsed.error.issues));

  const incident = await prisma.platformIncident.findUnique({ where: { id: parsed.data.incidentId }, select: { id: true, pharmacyId: true, code: true, severity: true, title: true, resolvedAt: true } });
  if (!incident) return fail("Incident introuvable.");
  if (incident.resolvedAt) return fail("Cet incident est déjà marqué résolu.");

  const resolvedAt = new Date();
  // Garde contre deux clics simultanés : seul un incident encore ouvert est mis à jour.
  const updated = await prisma.platformIncident.updateMany({ where: { id: incident.id, resolvedAt: null }, data: { resolvedAt } });
  if (updated.count === 0) return fail("Cet incident est déjà marqué résolu.");

  // L'incident ne porte pas de clé étrangère : l'officine est relue avant d'être citée au journal.
  const pharmacy = incident.pharmacyId ? await prisma.pharmacy.findUnique({ where: { id: incident.pharmacyId }, select: { id: true } }) : null;
  await recordAudit({
    action: "platform.incident_resolved",
    entityType: "PlatformIncident",
    entityId: incident.id,
    pharmacyId: pharmacy?.id ?? null,
    platformAdminId: session.admin.id,
    metadata: { code: incident.code, severity: incident.severity, title: incident.title, reason: parsed.data.reason, before: { resolvedAt: null }, after: { resolvedAt: resolvedAt.toISOString() } },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/technique");
  if (pharmacy) revalidatePath(`/admin/pharmacies/${pharmacy.id}`);
  return ok(null, "Incident marqué résolu.");
}
