import "server-only";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import type { TenantScope } from "@/server/db/tenant";
import { ROBOT_SETTINGS_KEY, readRobotSetup, robotSetupSchema, type RobotSetup, type RobotSetupInput } from "@/core/robot/integration";

/**
 * Le robot que le titulaire a désigné, gardé dans les paramètres de SON officine
 * (`Pharmacy.settings.robot`) : pas de table de plus, pas de secret.
 *
 * Ce qui est gardé : le fabricant, le modèle, comment le logiciel et le robot se parlent, et
 * quelques paramètres techniques pour un futur connecteur. Ce qui ne l'est JAMAIS : un mot de
 * passe, un jeton, une clé — le schéma refuse toute clé inconnue. PharmaBoost ne se connecte
 * pas au robot ; cette configuration ne déclenche aucune connexion.
 *
 * L'officine est toujours celle de la session (`scope`) : jamais un identifiant reçu du client.
 */

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function loadRobotSetup(pharmacyId: string): Promise<RobotSetup | null> {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { settings: true } });
  return readRobotSetup(asObject(pharmacy?.settings)[ROBOT_SETTINGS_KEY]);
}

export type SaveRobotResult = { ok: true; setup: RobotSetup } | { ok: false; error: string; fieldErrors: Record<string, string> };

export async function saveRobotSetup(scope: TenantScope, input: RobotSetupInput): Promise<SaveRobotResult> {
  const parsed = robotSetupSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.map(String).join(".") || "form";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: Object.values(fieldErrors)[0] ?? "Configuration invalide.", fieldErrors };
  }
  const setup = parsed.data;
  // « Autre fabricant » est le seul cas où le nom saisi a un sens.
  const clean: RobotSetup = setup.manufacturer === "autre" ? setup : { ...setup, manufacturerOther: null };
  const current = await prisma.pharmacy.findUnique({ where: { id: scope.pharmacyId }, select: { settings: true } });
  if (!current) return { ok: false, error: "Officine introuvable.", fieldErrors: {} };
  await prisma.pharmacy.update({
    where: { id: scope.pharmacyId },
    data: { settings: { ...asObject(current.settings), [ROBOT_SETTINGS_KEY]: clean } as Prisma.InputJsonValue },
  });
  // L'audit ne garde ni l'adresse ni le chemin : seulement ce qui dit qu'un robot a été désigné.
  await recordAudit({
    action: "robot.setup_saved",
    entityType: "Pharmacy",
    entityId: scope.pharmacyId,
    pharmacyId: scope.pharmacyId,
    userId: scope.userId,
    metadata: { manufacturer: clean.manufacturer, linkKind: clean.linkKind, hasNetworkAddress: Boolean(clean.host) },
  });
  return { ok: true, setup: clean };
}

export async function clearRobotSetup(scope: TenantScope): Promise<void> {
  const current = await prisma.pharmacy.findUnique({ where: { id: scope.pharmacyId }, select: { settings: true } });
  if (!current) return;
  const settings = { ...asObject(current.settings) };
  if (!(ROBOT_SETTINGS_KEY in settings)) return;
  delete settings[ROBOT_SETTINGS_KEY];
  await prisma.pharmacy.update({ where: { id: scope.pharmacyId }, data: { settings: settings as Prisma.InputJsonValue } });
  await recordAudit({ action: "robot.setup_cleared", entityType: "Pharmacy", entityId: scope.pharmacyId, pharmacyId: scope.pharmacyId, userId: scope.userId });
}
