import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getAIProvider } from "@/server/ai/registry";
import { getEnv } from "@/config/env";
import { recordAudit } from "@/server/audit/log";
import type { TenantScope } from "@/server/db/tenant";

/**
 * « Aide » sur la bannière du poste (fondateur, 22 oct. 2026) : le pharmacien qui ne sait pas répondre à une demande du
 * patient pose sa question sur le conseil affiché, et reçoit une réponse courte. Rien du patient n'est envoyé (ni nom, ni
 * ordonnance) : la question écrite et la fiche du conseil, c'est tout.
 *
 * Le modèle ne remplace ni la notice, ni le RCP, ni le pharmacien : il le dit quand il ne sait pas, n'invente jamais une
 * posologie, et oriente vers le médecin quand il le faut.
 */

export const HELP_MAX_QUESTION = 400;

export type HelpAdvice = { name: string; reason?: string; posology?: string; tell?: string[] };

const SYSTEM = [
  "Tu aides un pharmacien d'officine, en France, au comptoir, pendant qu'un patient attend.",
  "Réponds en français, en 3 phrases au plus, simplement, sans titre ni liste longue.",
  "Appuie-toi sur les sources françaises de référence (RCP de la base de données publique des médicaments, ANSM, HAS, Vidal, notice du fabricant).",
  "N'invente jamais une posologie, une contre-indication ni une interaction : si tu n'es pas sûr, dis-le et renvoie à la notice ou au RCP.",
  "Pas de diagnostic. Signale quand il faut orienter le patient vers un médecin (signes de gravité, durée, populations fragiles).",
  "Jamais de médicament sur prescription obligatoire proposé sans ordonnance.",
].join("\n");

export function helpPrompt(question: string, advice: HelpAdvice): string {
  const lines = [
    `Conseil affiché sur la bannière : ${advice.name}`,
    advice.reason ? `Pourquoi ce conseil : ${advice.reason}` : null,
    advice.posology ? `Posologie connue : ${advice.posology}` : null,
    advice.tell?.length ? `À dire au patient : ${advice.tell.join(" ")}` : null,
    "",
    `Question du pharmacien : ${question}`,
  ];
  return lines.filter((line) => line !== null).join("\n");
}

export async function answerCounterHelp(params: { scope: TenantScope; pharmacyIsDemo: boolean; question: string; advice: HelpAdvice }): Promise<{ ok: true; answer: string } | { ok: false; error: string }> {
  const question = params.question.replace(/\s+/g, " ").trim().slice(0, HELP_MAX_QUESTION);
  if (question.length < 2) return { ok: false, error: "Question vide." };
  const ai = getAIProvider({ demo: params.pharmacyIsDemo });
  const apiKey = getEnv().ANTHROPIC_API_KEY;
  if (params.pharmacyIsDemo || ai.info.capability !== "LIVE" || !ai.info.id.startsWith("anthropic:") || !apiKey) return { ok: false, error: "L'aide n'est pas disponible pour le moment." };
  try {
    const client = new Anthropic({ apiKey, timeout: 25_000, maxRetries: 1 });
    const response = await client.messages.create({
      model: ai.info.id.slice("anthropic:".length),
      max_tokens: 800,
      system: SYSTEM,
      messages: [{ role: "user", content: helpPrompt(question, params.advice) }],
    });
    const answer = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join(" ").replace(/\s+/g, " ").trim().slice(0, 1400);
    if (!answer) return { ok: false, error: "Pas de réponse." };
    await recordAudit({ action: "counter.help_answered", entityType: "Pharmacy", entityId: params.scope.pharmacyId, pharmacyId: params.scope.pharmacyId, userId: params.scope.userId, metadata: { advice: params.advice.name.slice(0, 120) } }).catch(() => undefined);
    return { ok: true, answer };
  } catch (error) {
    console.error("[poste] aide du comptoir impossible", error);
    return { ok: false, error: "L'aide n'a pas pu répondre. Réessayez." };
  }
}

/** La fiche reçue de la bannière, relue et bornée : jamais plus que quelques lignes de texte. */
export function readHelpAdvice(raw: unknown): HelpAdvice | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const text = (input: unknown, max: number) => (typeof input === "string" ? input.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const name = text(value.name, 160);
  if (!name) return null;
  const tell = (Array.isArray(value.tell) ? value.tell : []).map((line) => text(line, 200)).filter(Boolean).slice(0, 4);
  return { name, ...(text(value.reason, 300) ? { reason: text(value.reason, 300) } : {}), ...(text(value.posology, 400) ? { posology: text(value.posology, 400) } : {}), ...(tell.length ? { tell } : {}) };
}
