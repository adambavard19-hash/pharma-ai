import { getSession } from "@/server/auth/session";
import { recordAudit } from "@/server/audit/log";
import { assistantAvailable, type AssistantEvent } from "@/server/services/admin-assistant/run";
import { assistantThrottled } from "@/server/services/admin-assistant/throttle";
import { runPharmacyAssistant } from "@/server/services/pharmacy-assistant/run";
import { viewersOf } from "@/server/services/pharmacy-assistant/viewer";
import { ASSISTANT_MAX_QUESTION, type AssistantTurn } from "@/core/admin-assistant/assistant";

/**
 * Le robot du logiciel officine (onglet « Discussion » de l'île). Session d'officine exigée ; il ne lit que l'officine
 * ACTIVE de la session, et seulement ce que la personne a le droit de voir. Réponse au fil de l'eau (une ligne JSON par
 * événement). Chaque question est journalisée (la question, les outils lus ; pas la réponse).
 *
 * L'officine de démonstration commerciale n'appelle aucun service externe (règle de `TenantScope.isDemo`) : le robot
 * le dit au lieu de répondre.
 */

export const maxDuration = 120;

function parseTurns(body: unknown): AssistantTurn[] | null {
  const turns = body && typeof body === "object" ? (body as { turns?: unknown }).turns : null;
  if (!Array.isArray(turns) || turns.length === 0 || turns.length > 40) return null;
  const parsed: AssistantTurn[] = [];
  for (const turn of turns) {
    if (!turn || typeof turn !== "object") return null;
    const { role, text } = turn as { role?: unknown; text?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof text !== "string") return null;
    parsed.push({ role, text });
  }
  const last = parsed[parsed.length - 1];
  if (last.role !== "user" || !last.text.trim() || last.text.length > ASSISTANT_MAX_QUESTION) return null;
  return parsed;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Non authentifié" }, { status: 401 });
  const turns = parseTurns(await request.json().catch(() => null));
  if (!turns) return Response.json({ error: "Question vide ou trop longue." }, { status: 400 });
  if (session.pharmacy.isDemo || session.scope.isDemo) return Response.json({ error: "Dans la pharmacie de démonstration, le robot ne répond pas aux questions (aucun service externe n'y est appelé)." }, { status: 403 });
  const available = assistantAvailable();
  if (!available.ok) return Response.json({ error: "Le robot ne peut pas répondre pour l'instant." }, { status: 503 });
  if (assistantThrottled(`officine:${session.scope.userId}`)) return Response.json({ error: "Beaucoup de questions d'un coup : réessaie dans quelques minutes." }, { status: 429 });

  const { viewer, alertViewer } = viewersOf(session);
  const question = turns[turns.length - 1].text.trim();
  const toolsUsed: string[] = [];
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AssistantEvent) => {
        if (event.type === "tool") toolsUsed.push(event.name);
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // Le navigateur a fermé la connexion : on termine sans bruit.
        }
      };
      let steps = 0;
      try {
        await runPharmacyAssistant(
          { scope: session.scope, viewer, alertViewer, pharmacyIsDemo: session.pharmacy.isDemo, pharmacyName: session.pharmacy.name, firstName: session.user.firstName, roleLabel: session.roleLabel },
          turns,
          (event) => {
            if (event.type === "done") steps = event.steps;
            send(event);
          },
          { signal: request.signal },
        );
      } catch (error) {
        console.error("[robot-officine] question en échec", error);
        send({ type: "error", message: "Le robot n'a pas pu répondre (service indisponible). Réessaie dans un instant." });
      } finally {
        await recordAudit({
          action: "robot.assistant_question",
          entityType: "Pharmacy",
          entityId: session.scope.pharmacyId,
          pharmacyId: session.scope.pharmacyId,
          userId: session.scope.userId,
          metadata: { question: question.slice(0, 300), tools: toolsUsed, steps },
        }).catch(() => undefined);
        try {
          controller.close();
        } catch {
          // déjà fermé
        }
      }
    },
  });
  return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
