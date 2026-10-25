"use server";

import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { isCommercialDemoPharmacy } from "@/core/demo/identity";
import { prisma } from "@/server/db/client";
import { decryptField } from "@/server/security/encryption";
import { settleAndAnalyse } from "@/server/services/counter-settle";
import { readCounterNotice } from "@/server/services/counter-notice";
import { counterTeamFor, setCounterServedBy } from "@/server/services/counter-served";
import { answerCounterQuestion } from "@/server/services/counter-questions";
import { composePatientReport, decideCounterAdvice, finishCounterSale, saveCounterEmail } from "@/server/services/counter-window";
import { recordCounterScan } from "@/server/services/counter-scan";
import { DEMO_POST } from "@/core/demo/identity";
import type { AgentContext } from "@/server/services/stock-sync";
import { buildDoneInfo, buildHostEntry, type HostDone, type HostEntry, type NoticeBody } from "../../../agent/src/notice-center";
import { getEnv } from "@/config/env";
import { fail, ok, type ActionResult } from "./types";

/**
 * La démonstration au comptoir (/demo/comptoir) : la vraie île du poste de caisse, posée sur un faux logiciel de gestion,
 * pilotée par la session du présentateur au lieu de la clé d'un poste. Chaque geste passe par les MÊMES services que les
 * routes /api/agent/conseil/* : analyse, Vendu / Non vendu, questions, e-mail, « Qui a servi ? », Vente terminée.
 *
 * Réservé à l'officine de démonstration : ailleurs, refus avant toute lecture. L'officine vient TOUJOURS de la session.
 * Le bilan n'est jamais envoyé (messagerie de démonstration) : il est rendu ici pour être montré à l'écran.
 */

const NOT_DEMO = "Ce geste n'existe que dans l'officine de démonstration.";
const id = z.string().min(1).max(80).regex(/^[\w-]+$/);

async function demoAgent(): Promise<AgentContext | null> {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_CREATE);
  if (!isCommercialDemoPharmacy(session.pharmacy)) return null;
  return { connectionId: null, postId: null, scope: session.scope, pharmacyIsDemo: true, intervalSeconds: 300, exportPath: null, scansPath: null };
}

/** L'avis de la vente, écrit EXACTEMENT comme l'agent l'envoie à l'île (même `buildHostEntry`). Les photos restent des adresses. */
async function entryOf(agent: AgentContext, prescriptionId: string): Promise<{ entry: HostEntry; state: NoticeBody["state"] } | null> {
  const read = await readCounterNotice(agent.scope.pharmacyId, prescriptionId);
  if (!read) return null;
  const served = await counterTeamFor(agent.scope.pharmacyId, prescriptionId).catch(() => ({ team: [], servedBy: null }));
  const body = { ok: true, ...read.notice, followUp: read.followUp, ...served } as unknown as NoticeBody;
  const images = new Map<string, string>();
  for (const item of body.items ?? []) {
    if (item.imageUrl && (item.imageUrl.startsWith("/") || item.imageUrl.startsWith("https://"))) images.set(item.imageUrl, item.imageUrl);
  }
  return { entry: buildHostEntry({ prescriptionId, serverUrl: getEnv().APP_URL, body, images }), state: body.state };
}

export type DemoCounterEntry = { entry: HostEntry; ready: boolean };

/** Après le dernier bip : la vente est analysée (comme au poste, une seule fois) et l'avis revient pour l'île. */
export async function demoCounterNoticeAction(payload: { prescriptionId: string }): Promise<ActionResult<DemoCounterEntry>> {
  const agent = await demoAgent();
  if (!agent) return fail(NOT_DEMO);
  const prescriptionId = id.safeParse(payload.prescriptionId);
  if (!prescriptionId.success) return fail("Vente inconnue.");
  try {
    await settleAndAnalyse(agent.scope, prescriptionId.data);
  } catch (error) {
    console.error("[démo comptoir] analyse", error instanceof Error ? error.message : error);
  }
  const read = await entryOf(agent, prescriptionId.data);
  if (!read) return fail("Vente inconnue.");
  return ok({ entry: read.entry, ready: read.state !== "PENDING" });
}

const wordSchema = z.object({ prescriptionId: id, word: z.enum(["VENDU", "NONVENDU", "ANNULER", "REPONSE", "EMAIL", "EMAIL_RETIRER", "SERVI"]), argument: z.string().max(300).optional() });

/** Un geste fait dans l'île (le « mot » qu'elle renvoie à l'agent) ; l'avis à jour revient pour être redessiné. */
export async function demoCounterWordAction(payload: z.input<typeof wordSchema>): Promise<ActionResult<DemoCounterEntry>> {
  const agent = await demoAgent();
  if (!agent) return fail(NOT_DEMO);
  const parsed = wordSchema.safeParse(payload);
  if (!parsed.success) return fail("Geste inconnu.");
  const { prescriptionId, word, argument = "" } = parsed.data;
  let error: string | null = null;
  if (word === "VENDU" || word === "NONVENDU" || word === "ANNULER") {
    const outcome = word === "VENDU" ? "SOLD" : word === "NONVENDU" ? "NOT_SOLD" : "NONE";
    const result = await decideCounterAdvice(agent, { prescriptionId, recommendationId: argument, outcome });
    if (!result.ok) error = result.error;
  } else if (word === "REPONSE") {
    const [node, choice] = argument.split(":");
    const result = node && choice ? await answerCounterQuestion({ pharmacyId: agent.scope.pharmacyId, userId: null, source: "POSTE", prescriptionId, node, choice }) : { ok: false as const, error: "Réponse illisible." };
    if (!result.ok) error = result.error;
  } else if (word === "EMAIL" || word === "EMAIL_RETIRER") {
    const email = word === "EMAIL" ? Buffer.from(argument, "base64").toString("utf8").trim() : null;
    const result = await saveCounterEmail(agent, { prescriptionId, email: email || null, consent: Boolean(email) });
    if (!result.ok) error = result.error;
  } else if (word === "SERVI") {
    const result = await setCounterServedBy(agent, { prescriptionId, userId: argument });
    if (!result.ok) error = result.error;
  }
  if (error) return fail(error);
  const read = await entryOf(agent, prescriptionId);
  if (!read) return fail("Vente inconnue.");
  return ok({ entry: read.entry, ready: read.state !== "PENDING" });
}

/**
 * Le produit conseillé, bipé à la caisse : comme au comptoir, c'est le bip qui le déclare « Vendu » (`recordCounterScan` le
 * reconnaît parmi les conseils de la vente ouverte). Le code bipé est celui du produit conseillé, lu en base.
 */
export async function demoCounterSellAction(payload: { prescriptionId: string; recommendationId: string }): Promise<ActionResult<DemoCounterEntry & { name: string }>> {
  const agent = await demoAgent();
  if (!agent) return fail(NOT_DEMO);
  const prescriptionId = id.safeParse(payload.prescriptionId);
  const recommendationId = id.safeParse(payload.recommendationId);
  if (!prescriptionId.success || !recommendationId.success) return fail("Conseil inconnu.");
  const rec = await prisma.recommendation.findFirst({
    where: { id: recommendationId.data, prescriptionId: prescriptionId.data, pharmacyId: agent.scope.pharmacyId },
    select: { product: { select: { name: true, ean: true } }, presentation: { select: { cip13: true, specialty: { select: { name: true } } } } },
  });
  const code = rec?.product?.ean ?? rec?.presentation?.cip13 ?? null;
  if (!rec || !code) return fail("Ce conseil n'a pas de code à biper.");
  const post = await prisma.counterPost.findFirst({ where: { pharmacyId: agent.scope.pharmacyId, hostname: DEMO_POST.hostname, revokedAt: null }, select: { id: true } });
  if (!post) return fail("Le poste de caisse de démonstration est absent : réinitialisez la démo.");
  const scanned = await recordCounterScan({ ...agent, postId: post.id }, { code, post: DEMO_POST.hostname, scannedAt: new Date() });
  if (!scanned.ok) return fail(scanned.error);
  const read = await entryOf(agent, prescriptionId.data);
  if (!read) return fail("Vente inconnue.");
  return ok({ entry: read.entry, ready: true, name: rec.product?.name ?? rec.presentation?.specialty.name ?? "" });
}

export type DemoBilan = { to: string; subject: string; html: string; from: string };
export type DemoCounterFinish = { done: HostDone; bilan: DemoBilan | null };

/**
 * « Vente terminée » : la vente se ferme comme au poste (mêmes chiffres, même « 3e conseil vendu aujourd'hui »), et le bilan
 * que le patient recevrait est rendu pour l'écran. Rien ne part : la messagerie de la démonstration ne transmet rien.
 */
export async function demoCounterFinishAction(payload: { prescriptionId: string }): Promise<ActionResult<DemoCounterFinish>> {
  const agent = await demoAgent();
  if (!agent) return fail(NOT_DEMO);
  const prescriptionId = id.safeParse(payload.prescriptionId);
  if (!prescriptionId.success) return fail("Vente inconnue.");
  const saleId = prescriptionId.data;
  // Lus AVANT la fermeture : elle efface l'adresse du patient une fois le bilan parti.
  const [read, followUp] = await Promise.all([
    readCounterNotice(agent.scope.pharmacyId, saleId),
    prisma.counterSaleFollowUp.findFirst({ where: { prescriptionId: saleId, pharmacyId: agent.scope.pharmacyId }, select: { emailEncrypted: true, consentAt: true } }),
  ]);
  const sold = (read?.notice.items ?? []).filter((item) => item.outcome === "SOLD");
  const email = followUp?.consentAt ? decryptField(followUp.emailEncrypted) : null;

  const result = await finishCounterSale(agent, { prescriptionId: saleId });
  if (!result.ok) return fail(result.error);
  const done = buildDoneInfo({ saleId, result, emailWasSaved: Boolean(email) });
  // Au rendez-vous, le bilan « part » dans la boîte du patient montrée à l'écran : la ligne le dit comme au poste.
  const shown = { ...done, lines: done.lines.map((line) => (line.startsWith("Bilan préparé") ? "✓ Bilan envoyé au patient." : line)) };

  let bilan: DemoBilan | null = null;
  if (email && sold.length > 0) {
    const composed = await composePatientReport({ agent, prescriptionId: saleId, email, soldIds: sold.map((item) => item.id).filter((value): value is string => Boolean(value)), fallbackNames: sold.map((item) => item.name) }).catch((error: unknown) => {
      console.error("[démo comptoir] bilan", error instanceof Error ? error.message : error);
      return null;
    });
    if (composed) bilan = { to: email, subject: composed.mail.subject, html: composed.mail.html, from: composed.pharmacy?.name || "PharmaBoost" };
  }
  return ok({ done: shown, bilan });
}
