"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { loadConnectionOverview } from "@/server/services/connection-overview";
import { saveRobotTechnical, loadRobotSetup } from "@/server/services/robot-setup";
import { createPostPairing, disconnectAgent, requestPostSync, resolveSupportScope, revokeCounterPost, setPostExportPath, updateConnectionSettings } from "@/server/services/stock-sync";
import { buildConnectionTest, type ConnectionTestResult } from "@/core/stock/connection-test";
import { lgoLabel } from "@/core/stock/connectors";
import { LATEST_AGENT_VERSION } from "@/core/admin/agent-version";
import { robotTechnicalSchema, type RobotSetup, type RobotTechnicalInput } from "@/core/robot/integration";
import type { Serialized } from "./stock-sync";
import { fail, ok, type ActionResult } from "./types";

/**
 * L'ESPACE D'ASSISTANCE de la fiche officine (console PharmaBoost) : tout ce qui est technique dans la connexion d'une
 * officine — le test de connexion, les comptoirs (dossier d'export, relecture du stock, retrait, code d'installation),
 * le serveur (réglages, déconnexion) et les paramètres du robot. Ces gestes n'existent plus dans l'écran du
 * pharmacien : ils sont réservés à un administrateur de la plateforme, connecté à la console.
 *
 * L'officine est celle que la console désigne ; l'audit nomme l'administrateur (jamais le titulaire, qui n'a rien
 * fait) et ne retient ni chemin ni adresse. Aucune de ces fonctions ne lit de donnée de patient : un administrateur
 * plateforme n'obtient jamais l'accès aux données de soin.
 */

const REFUSALS = {
  NOT_FOUND: "Officine introuvable.",
  NO_OWNER: "Cette officine n'a pas de titulaire actif : créez ou réactivez son compte d'abord.",
} as const;

const id = z.string().trim().min(1).max(64);
const noControl = (value: string) => !/[\u0000-\u001f\u007f]/.test(value);
const path = z.string().trim().max(500).refine(noControl, "Caractère non valide.").optional().or(z.literal(""));

/** L'officine que la console désigne, une fois la session plateforme vérifiée (chaque action commence par `requirePlatformSession`). */
async function support(session: { admin: { id: string } }, pharmacyId: string) {
  const parsed = id.safeParse(pharmacyId);
  const target: Awaited<ReturnType<typeof resolveSupportScope>> = parsed.success ? await resolveSupportScope(parsed.data) : { ok: false, reason: "NOT_FOUND" };
  return { target, actor: { platformAdminId: session.admin.id } };
}

const refresh = (pharmacyId: string) => revalidatePath(`/admin/pharmacies/${pharmacyId}`);

export type AdminConnectionTest = Serialized<ConnectionTestResult>;

/** « Tester ma connexion », côté assistance : les mêmes contrôles réels, sur l'officine ouverte. Lecture seule. */
export async function adminTestConnectionAction(payload: { pharmacyId: string }): Promise<ActionResult<AdminConnectionTest>> {
  const session = await requirePlatformSession();
  const { target } = await support(session, payload.pharmacyId);
  if (!target.ok) return fail(REFUSALS[target.reason]);
  const now = new Date();
  const [loaded, robot] = await Promise.all([loadConnectionOverview(target.scope.pharmacyId, now), loadRobotSetup(target.scope.pharmacyId)]);
  const result = buildConnectionTest({
    now,
    lgo: loaded.lgo,
    lgoLabel: loaded.lgo ? lgoLabel(loaded.lgo) : null,
    overview: loaded.overview,
    connection: loaded.connection,
    posts: loaded.posts,
    latestAgentVersion: LATEST_AGENT_VERSION,
    robot,
  });
  return ok(JSON.parse(JSON.stringify(result)) as AdminConnectionTest);
}

/** Le nombre de bips reçus : l'« essai du bip » de l'assistance attend qu'il augmente. */
export async function adminScanCountAction(payload: { pharmacyId: string }): Promise<ActionResult<{ scanCount: number }>> {
  const session = await requirePlatformSession();
  const { target } = await support(session, payload.pharmacyId);
  if (!target.ok) return fail(REFUSALS[target.reason]);
  const loaded = await loadConnectionOverview(target.scope.pharmacyId);
  return ok({ scanCount: loaded.overview.sales.scanCount });
}

export async function adminRevokePostAction(payload: { pharmacyId: string; postId: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const { target, actor } = await support(session, payload.pharmacyId);
  if (!target.ok) return fail(REFUSALS[target.reason]);
  await revokeCounterPost(target.scope, id.parse(payload.postId), actor);
  refresh(target.scope.pharmacyId);
  return ok(null, "Poste retiré : sa clé ne fonctionne plus.");
}

export async function adminSetPostExportPathAction(payload: { pharmacyId: string; postId: string; exportPath: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const { target, actor } = await support(session, payload.pharmacyId);
  if (!target.ok) return fail(REFUSALS[target.reason]);
  const parsed = path.safeParse(payload.exportPath);
  if (!parsed.success) return fail("Dossier invalide.");
  const exportPath = parsed.data?.slice(0, 300) || null;
  try {
    await setPostExportPath(target.scope, id.parse(payload.postId), exportPath, actor);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Impossible d'enregistrer le dossier.");
  }
  refresh(target.scope.pharmacyId);
  return ok(null, exportPath ? "Dossier enregistré : le poste relira l'export à chaque changement." : "Ce poste n'envoie plus de stock.");
}

export async function adminRequestPostSyncAction(payload: { pharmacyId: string; postId: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const { target, actor } = await support(session, payload.pharmacyId);
  if (!target.ok) return fail(REFUSALS[target.reason]);
  try {
    await requestPostSync(target.scope, id.parse(payload.postId), actor);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Impossible de demander la relecture.");
  }
  refresh(target.scope.pharmacyId);
  return ok(null, "Demande envoyée : le poste relit l'export dans la minute.");
}

/** Un code à six chiffres (une heure, un seul usage) pour installer un comptoir avec l'archive du programme. Rendu ici, une fois. */
export async function adminCreatePostPairingAction(payload: { pharmacyId: string }): Promise<ActionResult<{ code: string; expiresAt: string; postId: string }>> {
  const session = await requirePlatformSession();
  const { target, actor } = await support(session, payload.pharmacyId);
  if (!target.ok) return fail(REFUSALS[target.reason]);
  const pairing = await createPostPairing(target.scope, null, actor);
  refresh(target.scope.pharmacyId);
  return ok({ code: pairing.code, expiresAt: pairing.expiresAt.toISOString(), postId: pairing.postId }, "Code de poste généré. Il est valable une heure.");
}

const settingsSchema = z.object({
  pharmacyId: id,
  intervalSeconds: z.coerce.number().int().min(60).max(3600),
  exportPath: path,
  scansPath: path,
});

export async function adminUpdateConnectionSettingsAction(payload: { pharmacyId: string; intervalSeconds: number | string; exportPath?: string; scansPath?: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const { target, actor } = await support(session, payload.pharmacyId);
  if (!target.ok) return fail(REFUSALS[target.reason]);
  const parsed = settingsSchema.safeParse(payload);
  if (!parsed.success) return fail("Réglages invalides (intervalle entre 1 et 60 minutes, dossiers sans caractère spécial).");
  try {
    await updateConnectionSettings(target.scope, { intervalSeconds: parsed.data.intervalSeconds, exportPath: parsed.data.exportPath || null, scansPath: parsed.data.scansPath || null }, actor);
  } catch {
    return fail("Aucun serveur n'est relié pour cette officine : il n'y a pas de réglages à enregistrer.");
  }
  refresh(target.scope.pharmacyId);
  return ok(null, "Réglages enregistrés. Le programme les applique à son prochain signe de vie.");
}

export async function adminDisconnectAgentAction(payload: { pharmacyId: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const { target, actor } = await support(session, payload.pharmacyId);
  if (!target.ok) return fail(REFUSALS[target.reason]);
  try {
    await disconnectAgent(target.scope, actor);
  } catch {
    return fail("Aucun serveur n'est relié pour cette officine.");
  }
  refresh(target.scope.pharmacyId);
  return ok(null, "Serveur déconnecté : sa clé est révoquée.");
}

/** Les paramètres techniques d'une future intégration du robot : réservés à l'assistance, après que le titulaire a désigné son robot. */
export async function adminSaveRobotTechnicalAction(payload: { pharmacyId: string } & RobotTechnicalInput): Promise<ActionResult<RobotSetup>> {
  const session = await requirePlatformSession();
  const { target, actor } = await support(session, payload.pharmacyId);
  if (!target.ok) return fail(REFUSALS[target.reason]);
  const { pharmacyId, ...technical } = payload;
  void pharmacyId;
  const parsed = robotTechnicalSchema.safeParse(technical);
  if (!parsed.success) return fail("Paramètres invalides.", Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message])));
  const result = await saveRobotTechnical(target.scope.pharmacyId, parsed.data, actor);
  if (!result.ok) return fail(result.error, result.fieldErrors);
  refresh(target.scope.pharmacyId);
  return ok(result.setup, "Paramètres du robot enregistrés. L'intégration n'est pas disponible : rien n'est lu du robot.");
}
