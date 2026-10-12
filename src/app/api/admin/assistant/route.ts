import { getPlatformSession } from "@/server/auth/platform-session";
import { recordAudit } from "@/server/audit/log";
import { assistantAvailable, runAssistant, type AssistantEvent } from "@/server/services/admin-assistant/run";
import { assistantThrottled } from "@/server/services/admin-assistant/throttle";
import { ASSISTANT_MAX_QUESTION, type AssistantTurn } from "@/core/admin-assistant/assistant";

/**
 * Le robot de la console Super Admin. Session d'administrateur plateforme
 * exigée (un compte d'officine, de commercial ou de directeur reçoit 401).
 * La réponse arrive au fil de l'eau, une ligne JSON par événement.
 * Chaque question est journalisée (la question, les outils lus ; pas la réponse).
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
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Non authentifié" }, { status: 401 });
  const turns = parseTurns(await request.json().catch(() => null));
  if (!turns) return Response.json({ error: "Question vide ou trop longue." }, { status: 400 });
  const available = assistantAvailable();
  if (!available.ok) return Response.json({ error: available.reason }, { status: 503 });
  if (assistantThrottled(session.admin.id)) return Response.json({ error: "Beaucoup de questions d'un coup : réessaie dans quelques minutes." }, { status: 429 });

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
        await runAssistant(turns, (event) => {
          if (event.type === "done") steps = event.steps;
          send(event);
        }, { signal: request.signal });
      } catch (error) {
        console.error("[assistant] question en échec", error);
        send({ type: "error", message: "Le robot n'a pas pu répondre (service indisponible). Réessaie dans un instant." });
      } finally {
        await recordAudit({ action: "platform.assistant_question", entityType: "PlatformAdmin", entityId: session.admin.id, platformAdminId: session.admin.id, metadata: { question: question.slice(0, 300), tools: toolsUsed, steps } });
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
