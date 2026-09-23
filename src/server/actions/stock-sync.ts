"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { createPairing, createPostPairing, disconnectAgent, getConnection, isLgoId, revokeCounterPost, updateConnectionSettings } from "@/server/services/stock-sync";
import { LGO_DEFINITIONS, lgoLabel, stockFreshness } from "@/core/stock/connectors";
import { getMessagingProvider } from "@/server/ai/registry";
import { publicUrl } from "@/server/public-url";
import { fail, ok, type ActionResult } from "./types";

/** Réservé au titulaire (import de stock) : appairer, régler, révoquer l'agent. */

export async function createPairingAction(payload: { lgo: string }): Promise<ActionResult<{ code: string; expiresAt: string }>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  if (!isLgoId(payload.lgo)) return fail("Logiciel inconnu.");
  const pairing = await createPairing(session.scope, payload.lgo);
  revalidatePath("/stock/connexion");
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
  revalidatePath("/stock/connexion");
  return ok(null, "Réglages enregistrés. L'agent les applique à son prochain signe de vie.");
}

export async function disconnectAgentAction(): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  await disconnectAgent(session.scope);
  revalidatePath("/stock/connexion");
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
    `   Le code ${payload.code} est valable une heure. Passé ce délai, générez-en un nouveau dans PharmaBoost, page Stock > Connecter mon logiciel.`,
    "4. L'installateur crée les dossiers C:\\PharmaBoost\\Export et C:\\PharmaBoost\\Ordonnances, installe ce qu'il faut, et démarre l'agent. PharmaBoost affiche alors « agent connecté ».",
    "",
    `B. Dans ${lgoLabel(payload.lgo)}, pour sortir le stock (à refaire quand le stock doit être rafraîchi, chaque matin par exemple) :`,
    steps,
    "",
    "L'agent lit ce dossier et rien d'autre. Il n'écrit jamais dans votre logiciel.",
    "",
    "Besoin d'aide : contact@pharmaboost.app",
  ].join("\n");
  const outcome = await getMessagingProvider().sendEmail({
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
  revalidatePath("/stock/connexion");
  return ok({ code: pairing.code, expiresAt: pairing.expiresAt.toISOString(), postId: pairing.postId }, "Code de poste généré. Il est valable une heure.");
}

export async function revokePostAction(payload: { postId: string }): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  await revokeCounterPost(session.scope, payload.postId);
  revalidatePath("/stock/connexion");
  return ok(null, "Poste retiré : sa clé ne fonctionne plus.");
}

