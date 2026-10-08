"use server";

import { resolvePublicBaseUrl } from "@/server/public-url";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { createPairing, createPostInstallLink, createPostPairing, disconnectAgent, findOwnPostInstallLink, getConnection, isLgoId, listCounterPosts, reissuePostInstallLink, requestPostSync, revokeCounterPost, setPostExportPath, updateConnectionSettings } from "@/server/services/stock-sync";
import { LGO_DEFINITIONS, lgoLabel, stockFreshness } from "@/core/stock/connectors";
import { buildPostDownloadUrl, nextCounterLabel, POST_LINK_VALIDITY_LABEL } from "@/core/stock/install";
import { buildCounterInstallEmail } from "@/core/stock/install-email";
import { rateLimited } from "@/server/http/rate-limit";
import { chooseLgo, loadConnectionOverview } from "@/server/services/connection-overview";
import type { ConnectionOverview } from "@/core/stock/connection-overview";
import { getMessagingProvider } from "@/server/ai/registry";
import { publicUrl } from "@/server/public-url";
import { fail, ok, type ActionResult } from "./types";
import { PUBLIC_CONTACT_EMAIL } from "@/config/contact";

/** Réservé au titulaire (import de stock) : appairer, régler, révoquer l'agent. */

export async function createPairingAction(payload: { lgo: string }): Promise<ActionResult<{ code: string; expiresAt: string }>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  if (!isLgoId(payload.lgo)) return fail("Logiciel inconnu.");
  const pairing = await createPairing(session.scope, payload.lgo);
  revalidatePath("/connexion");
  return ok({ code: pairing.code, expiresAt: pairing.expiresAt.toISOString() }, "Code d'appairage généré. Il est valable une heure.");
}

const settingsSchema = z.object({
  intervalSeconds: z.coerce.number().int().min(60).max(3600),
  exportPath: z.string().trim().max(500).optional().or(z.literal("")),
  scansPath: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function updateConnectionSettingsAction(payload: z.input<typeof settingsSchema>): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const parsed = settingsSchema.safeParse(payload);
  if (!parsed.success) return fail("Réglages invalides (intervalle entre 1 et 60 minutes).");
  await updateConnectionSettings(session.scope, {
    intervalSeconds: parsed.data.intervalSeconds,
    exportPath: parsed.data.exportPath || null,
    scansPath: parsed.data.scansPath || null,
  });
  revalidatePath("/connexion");
  return ok(null, "Réglages enregistrés. L'agent les applique à son prochain signe de vie.");
}

export async function disconnectAgentAction(): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  await disconnectAgent(session.scope);
  revalidatePath("/connexion");
  revalidatePath("/stock");
  return ok(null, "Agent déconnecté : sa clé est révoquée.");
}

/** L'état de la connexion, pour l'assistant qui attend l'agent : interrogé toutes les dix secondes. */
export async function getConnectionStatusAction(): Promise<ActionResult<{ status: string; reachable: boolean; hostname: string | null; lastSyncAt: string | null; lastSyncLines: number | null; lastError: string | null; pairedAt: string | null }>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const connection = await getConnection(session.scope.pharmacyId);
  if (!connection) return ok({ status: "NONE", reachable: false, hostname: null, lastSyncAt: null, lastSyncLines: null, lastError: null, pairedAt: null });
  const paired = connection.status !== "PENDING" && connection.status !== "DISCONNECTED";
  return ok({
    status: connection.status,
    reachable: paired && stockFreshness({ lastSyncAt: connection.lastSyncAt, lastSeenAt: connection.lastSeenAt, intervalSeconds: connection.intervalSeconds }).state !== "DISCONNECTED",
    hostname: connection.hostname,
    lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
    lastSyncLines: connection.lastSyncLines,
    lastError: connection.lastError,
    pairedAt: connection.pairedAt?.toISOString() ?? null,
  });
}

/**
 * Les instructions d'installation, envoyées à l'adresse du titulaire : il les
 * ouvre sur le serveur de l'officine, ou les transmet à qui s'en occupe.
 * Jamais à une autre adresse que la sienne.
 */
export async function emailInstallInstructionsAction(payload: { lgo: string; code: string; serverUrl: string }): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  if (!isLgoId(payload.lgo) || !/^\d{6}$/.test(payload.code)) return fail("Instructions incomplètes.");
  const definition = LGO_DEFINITIONS.find((lgo) => lgo.id === payload.lgo);
  if (!definition) return fail("Logiciel inconnu.");
  const command = `powershell -ExecutionPolicy Bypass -File .\\install-windows.ps1 -Code ${payload.code} -Lgo ${payload.lgo}${payload.serverUrl === "https://pharmaboost.app" ? "" : ` -Serveur ${payload.serverUrl}`}`;
  const download = publicUrl("/api/agent/telecharger");
  const steps = definition.exportSteps.map((step, index) => `${index + 1}. ${step}`).join("\n");
  const text = [
    `Connecter le stock de votre officine à PharmaBoost (${lgoLabel(payload.lgo)})`,
    "",
    "A. Sur l'ordinateur serveur de l'officine (celui où tourne le logiciel), une seule fois :",
    `1. Connectez-vous à PharmaBoost avec votre compte, puis téléchargez l'agent : ${download}`,
    "2. Décompressez le dossier reçu.",
    "3. Ouvrez PowerShell en administrateur (clic droit sur le menu Démarrer > Terminal (administrateur)), placez-vous dans le dossier décompressé, et collez :",
    "",
    `   ${command}`,
    "",
    `   Le code ${payload.code} est valable une heure. Passé ce délai, générez-en un nouveau dans PharmaBoost, page Ma connexion.`,
    "4. L'installateur crée les dossiers C:\\PharmaBoost\\Export et C:\\PharmaBoost\\Ordonnances, installe ce qu'il faut, et démarre l'agent. PharmaBoost affiche alors « agent connecté ».",
    "",
    `B. Dans ${lgoLabel(payload.lgo)}, pour sortir le stock (à refaire quand le stock doit être rafraîchi, chaque matin par exemple) :`,
    steps,
    "",
    "L'agent lit ce dossier et rien d'autre. Il n'écrit jamais dans votre logiciel.",
    "",
    `Besoin d'aide : ${PUBLIC_CONTACT_EMAIL}`,
  ].join("\n");
  const outcome = await getMessagingProvider({ demo: session.scope.isDemo }).sendEmail({
    to: session.user.email,
    fromName: "PharmaBoost",
    subject: `PharmaBoost — connecter le stock de l'officine (${lgoLabel(payload.lgo)})`,
    text,
    html: `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;white-space:pre-wrap">${text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string)}</pre>`,
  });
  if (outcome.status !== "SENT" && outcome.status !== "SIMULATED") return fail(`Envoi impossible : ${outcome.detail}`);
  return ok(null, `Instructions envoyées à ${session.user.email}.`);
}

/** Un code d'appairage pour un poste de caisse (douchette). Une heure, un seul usage. */
export async function createPostPairingAction(payload: { label?: string | null }): Promise<ActionResult<{ code: string; expiresAt: string; postId: string }>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const label = payload.label?.trim().slice(0, 60) || null;
  const pairing = await createPostPairing(session.scope, label);
  revalidatePath("/connexion");
  return ok({ code: pairing.code, expiresAt: pairing.expiresAt.toISOString(), postId: pairing.postId }, "Code de poste généré. Il est valable une heure.");
}

export async function revokePostAction(payload: { postId: string }): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  await revokeCounterPost(session.scope, payload.postId);
  revalidatePath("/connexion");
  return ok(null, "Poste retiré : sa clé ne fonctionne plus.");
}

export async function setPostExportPathAction(payload: { postId: string; exportPath: string }): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const exportPath = payload.exportPath.trim().slice(0, 300) || null;
  await setPostExportPath(session.scope, payload.postId, exportPath);
  revalidatePath("/connexion");
  return ok(null, exportPath ? "Dossier enregistré : le poste relira l'export à chaque changement." : "Ce poste n'envoie plus de stock.");
}

export async function requestPostSyncAction(payload: { postId: string }): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  try {
    await requestPostSync(session.scope, payload.postId);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Impossible de demander la mise à jour.");
  }
  revalidatePath("/connexion");
  return ok(null, "Demande envoyée : le poste relit l'export dans la minute.");
}

/**
 * Le lien d'installation d'un poste : `downloadUrl` est la page où l'on télécharge
 * l'installateur Windows (le lien à envoyer par e-mail) ; `command` est la même
 * installation en une ligne, pour une personne qui prend la main à distance.
 */
export type InstallLinkView = { token: string; expiresAt: string; postId: string; label: string; command: string; downloadUrl: string };

function installLinkView(token: string, expiresAt: Date, postId: string, label: string): InstallLinkView {
  const base = resolvePublicBaseUrl().url.replace(/\/$/, "");
  const command = `powershell -ExecutionPolicy Bypass -Command "irm ${base}/api/agent/installer/${token} | iex"`;
  return { token, expiresAt: expiresAt.toISOString(), postId, label, command, downloadUrl: buildPostDownloadUrl(base, token) };
}

/**
 * Un nouveau comptoir : « Comptoir 2 », « Comptoir 3 »… et son lien. `downloadUrl` est la page où l'on télécharge
 * l'installateur Windows (le lien à envoyer) ; `command` est la même installation en une ligne, pour une personne
 * qui prend la main à distance (l'assistance).
 */
export async function createPostInstallLinkAction(payload: { label?: string | null }): Promise<ActionResult<InstallLinkView>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const typed = payload.label?.trim().slice(0, 60) || null;
  const label = typed ?? nextCounterLabel((await listCounterPosts(session.scope.pharmacyId)).map((post) => post.label ?? post.hostname));
  const link = await createPostInstallLink(session.scope, label);
  revalidatePath("/connexion");
  return ok(installLinkView(link.token, link.expiresAt, link.postId, label), "Lien d'installation prêt, valable sept jours.");
}

/** Un nouveau lien pour un comptoir qui n'est pas encore installé : le lien perdu ou expiré. */
export async function reissuePostInstallLinkAction(payload: { postId: string }): Promise<ActionResult<InstallLinkView>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const result = await reissuePostInstallLink(session.scope, String(payload.postId ?? ""));
  if (!result.ok) return fail(result.error);
  revalidatePath("/connexion");
  return ok(installLinkView(result.token, result.expiresAt, String(payload.postId), result.label ?? "Comptoir"), "Nouveau lien prêt, valable sept jours. L'ancien ne marche plus.");
}

/**
 * Le lien d'installation, envoyé PAR E-MAIL à l'adresse du titulaire connecté, et à aucune autre : il ouvre
 * l'e-mail sur l'ordinateur du comptoir, ou le fait suivre. Le jeton doit être celui d'un lien de SON officine,
 * encore valable et pas encore utilisé. Un envoi simulé (adresse de démonstration, envoi non configuré) n'est
 * jamais présenté comme un envoi réel.
 */
export async function emailPostInstallLinkAction(payload: { token: string }): Promise<ActionResult<{ to: string }>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  if (rateLimited(`counter-link-mail:${session.scope.pharmacyId}`, 10, 60 * 60 * 1000)) return fail("Trop d'envois pour le moment : copiez le lien, ou réessayez dans une heure.");
  const link = await findOwnPostInstallLink(session.scope, String(payload.token ?? ""));
  if (!link) return fail("Ce lien n'est plus valable. Obtenez-en un nouveau.");
  const base = resolvePublicBaseUrl().url.replace(/\/$/, "");
  const message = buildCounterInstallEmail({ pharmacyName: link.pharmacyName, counterLabel: link.label ?? "un comptoir", downloadUrl: buildPostDownloadUrl(base, String(payload.token)), validity: POST_LINK_VALIDITY_LABEL, contactEmail: PUBLIC_CONTACT_EMAIL });
  let outcome: Awaited<ReturnType<ReturnType<typeof getMessagingProvider>["sendEmail"]>>;
  try {
    outcome = await getMessagingProvider({ demo: session.scope.isDemo }).sendEmail({ to: session.user.email, fromName: "PharmaBoost", subject: message.subject, text: message.text, html: message.html });
  } catch {
    return fail("L'e-mail n'a pas pu partir. Copiez le lien à la place.");
  }
  if (outcome.status === "SENT") return ok({ to: session.user.email }, `Lien envoyé à ${session.user.email}.`);
  if (outcome.status === "SIMULATED") return fail("E-mail non envoyé : l'envoi est simulé sur cette installation. Copiez le lien à la place.");
  return fail(`L'e-mail n'a pas pu partir (${outcome.detail}). Copiez le lien à la place.`);
}

/** Le logiciel de l'officine, choisi dans l'assistant « Ma connexion » : rien n'est installé ni annoncé par ce choix. */
export async function chooseLgoAction(payload: { lgo: string }): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  if (!isLgoId(payload.lgo)) return fail("Logiciel inconnu.");
  await chooseLgo(session.scope.pharmacyId, payload.lgo);
  revalidatePath("/connexion");
  return ok(null);
}

/** Un état sans date ni objet : ce que l'assistant relit toutes les dix secondes. Aucune clé, aucun code. */
export type Serialized<T> = T extends Date ? string : T extends (infer U)[] ? Serialized<U>[] : T extends object ? { [K in keyof T]: Serialized<T[K]> } : T;
export type OverviewSnapshot = { overview: Serialized<ConnectionOverview>; lgo: string | null };

export async function getConnectionOverviewAction(): Promise<ActionResult<OverviewSnapshot>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const loaded = await loadConnectionOverview(session.scope.pharmacyId);
  return ok({ overview: JSON.parse(JSON.stringify(loaded.overview)) as Serialized<ConnectionOverview>, lgo: loaded.lgo });
}
