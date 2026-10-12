import { headers } from "next/headers";
import { getEnv } from "@/config/env";
import { assistantAvailable, runAssistantLoop, type AssistantEvent } from "@/server/services/admin-assistant/run";
import { loadPublicPricing } from "@/server/services/public-pricing";
import { formatPriceEuros } from "@/core/pricing/official-offer";
import { PUBLIC_MAX_QUESTION, PUBLIC_MAX_TURNS, publicSystemPrompt } from "@/core/public-assistant/assistant";
import type { AssistantTurn } from "@/core/admin-assistant/assistant";
import { EXAMPLES, FAQ, SAFETY, STOCK_POINTS, TEAM_POINTS } from "@/app/(public)/decouvrir/_components/site-content";
import { SETUP_INCLUDES } from "@/app/(public)/decouvrir/_components/pricing-section";

/**
 * Le robot du site public : il répond aux visiteurs sur PharmaBoost à partir des SEULS contenus du site (aucun outil,
 * aucune base client). Modèle économique, réponses courtes, limite stricte par adresse IP et plafond global (coût).
 */

export const maxDuration = 60;

const WINDOW_MS = 10 * 60 * 1000;
const PER_IP_WINDOW = 6;
const PER_IP_DAY = 30;
const GLOBAL_PER_HOUR = 300;
const byIp = new Map<string, number[]>();
let global: number[] = [];

function throttled(ip: string, now = Date.now()): boolean {
  const stamps = (byIp.get(ip) ?? []).filter((at) => now - at < 24 * 3600 * 1000);
  global = global.filter((at) => now - at < 3600 * 1000);
  const recent = stamps.filter((at) => now - at < WINDOW_MS).length;
  if (recent >= PER_IP_WINDOW || stamps.length >= PER_IP_DAY || global.length >= GLOBAL_PER_HOUR) return true;
  stamps.push(now);
  global.push(now);
  byIp.set(ip, stamps);
  return false;
}

function parseTurns(body: unknown): AssistantTurn[] | null {
  const turns = body && typeof body === "object" ? (body as { turns?: unknown }).turns : null;
  if (!Array.isArray(turns) || turns.length === 0 || turns.length > 40) return null;
  const parsed: AssistantTurn[] = [];
  for (const turn of turns.slice(-PUBLIC_MAX_TURNS)) {
    if (!turn || typeof turn !== "object") return null;
    const { role, text } = turn as { role?: unknown; text?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof text !== "string") return null;
    parsed.push({ role, text: text.slice(0, role === "user" ? PUBLIC_MAX_QUESTION : 2000) });
  }
  while (parsed.length && parsed[0].role !== "user") parsed.shift();
  const last = parsed[parsed.length - 1];
  return last && last.role === "user" && last.text.trim() ? parsed : null;
}

export async function POST(request: Request) {
  const turns = parseTurns(await request.json().catch(() => null));
  if (!turns) return Response.json({ error: "Posez une question (500 caractères au plus)." }, { status: 400 });
  if (!assistantAvailable().ok) return Response.json({ error: "Le robot ne peut pas répondre pour l'instant. Écrivez-nous à contact@pharmaboost.app." }, { status: 503 });
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  if (throttled(ip)) return Response.json({ error: "Beaucoup de questions d'un coup : réessayez dans quelques minutes, ou réservez une démo." }, { status: 429 });

  const pricing = await loadPublicPricing();
  const system = publicSystemPrompt({
    pricing: { name: pricing.name, monthly: formatPriceEuros(pricing.monthlyPriceCents), setup: formatPriceEuros(pricing.setupFeeCents), commitmentMonths: pricing.commitmentMonths, referralPercent: pricing.referralDiscountPercent },
    setupIncludes: SETUP_INCLUDES,
    examples: EXAMPLES,
    stock: STOCK_POINTS,
    team: TEAM_POINTS,
    safety: SAFETY,
    faq: FAQ,
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AssistantEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // Le visiteur a fermé la page.
        }
      };
      try {
        await runAssistantLoop(
          {
            systemPrompt: system,
            dateContext: () => "Visiteur du site public pharmaboost.app.",
            tools: [],
            runTool: async () => ({ ok: false, output: { erreur: "Aucun outil." } }),
            labels: {},
            maxSteps: 1,
            model: getEnv().PUBLIC_ASSISTANT_MODEL,
            effort: "low",
            maxTokens: 1_200,
            serverFallback: false,
          },
          turns,
          send,
          { signal: request.signal },
        );
      } catch (error) {
        console.error("[robot-public] question en échec", error);
        send({ type: "error", message: "Le robot n'a pas pu répondre. Réessayez dans un instant, ou écrivez à contact@pharmaboost.app." });
      } finally {
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
