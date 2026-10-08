import "server-only";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import type { TenantScope } from "@/server/db/tenant";
import {
  ROBOT_SETTINGS_KEY,
  mergeRobotSetup,
  readRobotSetup,
  robotIdentitySchema,
  robotTechnicalSchema,
  type RobotIdentityInput,
  type RobotSetup,
  type RobotTechnicalInput,
} from "@/core/robot/integration";

/**
 * Le robot de l'officine, gardé dans SES paramètres (`Pharmacy.settings.robot`) : pas de table de plus, pas de secret.
 *
 * Deux écritures, deux personnes :
 *   • le PHARMACIEN désigne le robot (fabricant, modèle) : `saveRobotIdentity`. Il n'efface jamais les paramètres
 *     techniques que l'assistance a pu renseigner ;
 *   • l'ASSISTANCE (console) règle les paramètres techniques d'une future intégration : `saveRobotTechnical`.
 * Aucun mot de passe, jeton ou clé n'est jamais gardé : les schémas refusent toute clé inconnue. PharmaBoost ne se
 * connecte pas au robot ; cette configuration ne déclenche aucune connexion.
 *
 * L'officine est celle de la session (`scope`), ou celle que la console désigne : jamais un identifiant reçu du
 * pharmacien.
 */

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function loadRobotSetup(pharmacyId: string): Promise<RobotSetup | null> {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { settings: true } });
  return readRobotSetup(asObject(pharmacy?.settings)[ROBOT_SETTINGS_KEY]);
}

export type SaveRobotResult = { ok: true; setup: RobotSetup } | { ok: false; error: string; fieldErrors: Record<string, string> };

function refuse(error: { issues: { path: PropertyKey[]; message: string }[] }): SaveRobotResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "form";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { ok: false, error: Object.values(fieldErrors)[0] ?? "Configuration invalide.", fieldErrors };
}

async function writeSetup(pharmacyId: string, settings: Record<string, unknown>, setup: RobotSetup): Promise<void> {
  await prisma.pharmacy.update({ where: { id: pharmacyId }, data: { settings: { ...settings, [ROBOT_SETTINGS_KEY]: setup } as Prisma.InputJsonValue } });
}

/** Le pharmacien désigne son robot : fabricant et modèle. Les paramètres techniques déjà enregistrés sont conservés. */
export async function saveRobotIdentity(scope: TenantScope, input: RobotIdentityInput): Promise<SaveRobotResult> {
  const identity = robotIdentitySchema.safeParse(input);
  if (!identity.success) return refuse(identity.error);
  const current = await prisma.pharmacy.findUnique({ where: { id: scope.pharmacyId }, select: { settings: true } });
  if (!current) return { ok: false, error: "Officine introuvable.", fieldErrors: {} };
  const settings = asObject(current.settings);
  const merged = mergeRobotSetup(readRobotSetup(settings[ROBOT_SETTINGS_KEY]), {
    ...identity.data,
    // « Autre fabricant » est le seul cas où le nom saisi a un sens.
    manufacturerOther: identity.data.manufacturer === "autre" ? identity.data.manufacturerOther : null,
  });
  if (!merged.success) return refuse(merged.error);
  await writeSetup(scope.pharmacyId, settings, merged.data);
  await recordAudit({
    action: "robot.setup_saved",
    entityType: "Pharmacy",
    entityId: scope.pharmacyId,
    pharmacyId: scope.pharmacyId,
    userId: scope.userId,
    metadata: { manufacturer: merged.data.manufacturer },
  });
  return { ok: true, setup: merged.data };
}

/**
 * L'assistance règle les paramètres techniques. Il faut que le robot ait déjà été désigné par le titulaire : on ne
 * crée pas un robot à sa place. L'audit nomme l'administrateur et ne retient ni l'adresse ni le chemin.
 */
export async function saveRobotTechnical(pharmacyId: string, input: RobotTechnicalInput, actor: { platformAdminId: string }): Promise<SaveRobotResult> {
  const technical = robotTechnicalSchema.safeParse(input);
  if (!technical.success) return refuse(technical.error);
  const current = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { settings: true } });
  if (!current) return { ok: false, error: "Officine introuvable.", fieldErrors: {} };
  const settings = asObject(current.settings);
  const existing = readRobotSetup(settings[ROBOT_SETTINGS_KEY]);
  if (!existing) return { ok: false, error: "Le titulaire n'a pas encore désigné son robot : les paramètres techniques viennent ensuite.", fieldErrors: {} };
  const merged = mergeRobotSetup(existing, technical.data);
  if (!merged.success) return refuse(merged.error);
  await writeSetup(pharmacyId, settings, merged.data);
  await recordAudit({
    action: "robot.technical_saved",
    entityType: "Pharmacy",
    entityId: pharmacyId,
    pharmacyId,
    userId: null,
    platformAdminId: actor.platformAdminId,
    metadata: { manufacturer: merged.data.manufacturer, linkKind: merged.data.linkKind, hasNetworkAddress: Boolean(merged.data.host) },
  });
  return { ok: true, setup: merged.data };
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
