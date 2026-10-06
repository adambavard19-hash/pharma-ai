import { NextResponse, after } from "next/server";
import { prisma } from "@/server/db/client";
import { AGENT_FILE_MAX_BYTES, authenticateAgent, type AgentContext } from "@/server/services/stock-sync";
import { continueAfterStockDeposit, receiveStockDeposit } from "@/server/services/stock-deposits";
import { cleanDepositFileName } from "@/core/stock-deposit/rules";
import type { DepositView } from "@/core/stock-deposit/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Ce que voit le titulaire sur sa liaison, et ce que reçoit l'agent, quand le
 * moteur lève une exception : jamais le texte de l'exception (hôte de la base,
 * requête) ; il reste dans les journaux du serveur.
 */
const SYNC_FAILED = "Synchronisation impossible : réessayez dans quelques minutes.";

/** L'échec est visible dans PharmaBoost : sur la liaison du serveur, ou sur le poste de caisse qui a envoyé l'export. */
async function markError(agent: AgentContext, error: string): Promise<void> {
  if (agent.connectionId) await prisma.stockConnection.update({ where: { id: agent.connectionId }, data: { lastError: error, status: "ERROR" } }).catch(() => undefined);
  else if (agent.postId) await prisma.counterPost.update({ where: { id: agent.postId }, data: { lastExportError: error } }).catch(() => undefined);
}

/** Fichier reçu : la liaison (ou le poste) garde la date et le nombre de lignes, et l'erreur d'avant s'efface. */
async function markReceived(agent: AgentContext, deposit: DepositView, duplicate: boolean): Promise<void> {
  const now = new Date();
  // Un fichier en attente n'a pas mis le stock à jour : l'équipe tranche, il n'y a rien à reprocher au dossier.
  // Un doublon d'un dépôt encore en lecture n'a pas de résultat à dater : on ne marque pas « 0 ligne ».
  const applied = deposit.status !== "HELD" && !(duplicate && deposit.lines === null);
  if (agent.connectionId) {
    await prisma.stockConnection.update({
      where: { id: agent.connectionId },
      data: { lastSeenAt: now, lastError: null, status: "CONNECTED", ...(applied ? { lastSyncAt: now, lastSyncLines: deposit.lines ?? 0 } : {}) },
    });
  } else if (agent.postId) {
    await prisma.counterPost.update({ where: { id: agent.postId }, data: { lastExportError: null, ...(applied ? { lastExportAt: now } : {}) } });
  }
}

/**
 * L'export de stock du LGO, tel quel. Il passe par le même moteur que les
 * autres chemins (`receiveStockDeposit`) : fichier gardé 90 jours, historique,
 * garde-fou de taille, remise à zéro des produits absents. La réponse faite à
 * l'agent ne change pas ; seul un fichier en attente de l'équipe y ajoute `held`.
 */
export async function POST(request: Request) {
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ ok: false, error: "Clé d'agent inconnue ou révoquée." }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Aucun fichier reçu." }, { status: 400 });
  // Le mémo posé dans le dossier d'export n'est pas un stock : l'agent le mémorise comme envoyé et ne le renvoie plus.
  // Aucun dépôt, aucune notification, aucune écriture sur la liaison.
  if (/^LISEZMOI/i.test(cleanDepositFileName(file.name))) return NextResponse.json({ ok: true, lines: 0, created: 0, updated: 0, invalid: 0, ignored: true });
  if (file.size === 0) return NextResponse.json({ ok: false, error: "Aucun fichier reçu." }, { status: 400 });
  if (file.size > AGENT_FILE_MAX_BYTES) return NextResponse.json({ ok: false, error: "Export trop volumineux (25 Mo au plus)." }, { status: 413 });

  let result: Awaited<ReturnType<typeof receiveStockDeposit>>;
  try {
    result = await receiveStockDeposit({ scope: agent.scope, pharmacyIsDemo: agent.pharmacyIsDemo, fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()), source: "AGENT" });
  } catch (error) {
    console.error(`[agent/stock] dépôt impossible : ${error instanceof Error ? error.message : String(error)}`);
    await markError(agent, SYNC_FAILED);
    return NextResponse.json({ ok: false, error: SYNC_FAILED }, { status: 422 });
  }
  if (!result.ok) {
    await markError(agent, result.error);
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  }

  const { deposit } = result;
  if (deposit.status === "FAILED") {
    const error = deposit.message ?? SYNC_FAILED;
    await markError(agent, error);
    return NextResponse.json({ ok: false, error }, { status: 422 });
  }
  await markReceived(agent, deposit, result.duplicate);

  if (deposit.status === "HELD") return NextResponse.json({ ok: true, held: true, lines: deposit.lines ?? 0, created: 0, updated: 0, invalid: 0 });

  if (deposit.status === "APPLIED" && !result.duplicate) {
    // La compréhension des produits nouveaux se poursuit après la réponse.
    const scope = agent.scope;
    after(() => continueAfterStockDeposit(scope));
  }
  return NextResponse.json({ ok: true, lines: deposit.lines ?? 0, created: deposit.created ?? 0, updated: deposit.updated ?? 0, invalid: deposit.invalid ?? 0 });
}
