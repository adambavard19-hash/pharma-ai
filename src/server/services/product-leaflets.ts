import "server-only";
import { after } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/server/db/client";
import { getEnv } from "@/config/env";
import { checkLeaflet, LEAFLET_SCHEMA, LEAFLET_SEARCH_PROMPT, LEAFLET_SYSTEM_PROMPT, LEAFLET_TEXT_MAX, LEAFLET_TOOL_NAME, leafletKey, textOfHtml, type CheckedLeaflet } from "@/core/leaflet/leaflet";

/**
 * Les notices officielles des produits conseillés : lues UNE fois par produit (commun à toutes les pharmacies), puis reprises
 * dans le bilan du patient — indications, posologie, durée.
 *
 *  - Un médicament (CIS) : sa NOTICE OFFICIELLE sur la base publique des médicaments (onglet « Notice »).
 *  - Un autre produit (code-barres) : le modèle cherche sur internet la notice ou la page officielle du fabricant.
 * Dans les deux cas, chaque rubrique doit être appuyée d'une phrase retrouvée mot pour mot dans le texte réellement téléchargé
 * (`checkLeaflet`) ; sinon elle n'est pas gardée. Rien n'est jamais inventé.
 */

const USER_AGENT = "PharmaBoost/1.0 (contact@pharmaboost.app)";
const FETCH_TIMEOUT_MS = 15_000;
/** Une notice introuvable se recherche de nouveau après ce délai (le fabricant a pu publier sa page). */
const RETRY_NOT_FOUND_MS = 30 * 24 * 60 * 60 * 1000;
const RETRY_ERROR_MS = 6 * 60 * 60 * 1000;

export type LeafletTarget = { name: string; cisCode?: string | null; ean?: string | null };

async function fetchText(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" }, signal: controller.signal, redirect: "follow" });
    clearTimeout(timer);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/** Le texte de la notice officielle d'un médicament : l'onglet « Notice » de sa fiche sur la base publique. */
async function bdpmNoticeText(cisCode: string): Promise<{ url: string; text: string } | null> {
  const url = `https://base-donnees-publique.medicaments.gouv.fr/medicament/${cisCode}/extrait#tab-notice`;
  const html = await fetchText(url.replace(/#.*$/, ""));
  if (!html) return null;
  const start = html.indexOf('id="tabpanel-notice-panel"');
  if (start < 0) return null;
  const end = html.indexOf('class="fr-tabs__panel', start + 40);
  const text = textOfHtml(html.slice(start, end > start ? end : undefined));
  return text.length > 200 ? { url, text } : null;
}

type ModelClient = { create: (params: Record<string, unknown>) => Promise<{ content: { type: string; name?: string; input?: unknown }[]; stop_reason?: string | null }> };

function modelClient(): { client: ModelClient; model: string } | null {
  const env = getEnv();
  if (env.AI_PROVIDER !== "anthropic" || !env.ANTHROPIC_API_KEY) return null;
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return { client: { create: (params) => anthropic.messages.create(params as never) as never }, model: env.AI_MODEL };
}

const toolCall = (response: Awaited<ReturnType<ModelClient["create"]>>) => response.content.find((block) => block.type === "tool_use" && block.name === LEAFLET_TOOL_NAME)?.input;

/** Lit une notice déjà téléchargée (médicament) : le modèle en tire les trois rubriques, la vérification garde les vraies. */
async function readNotice(target: LeafletTarget, text: string, deps: { client: ModelClient; model: string }): Promise<CheckedLeaflet> {
  const response = await deps.client.create({
    model: deps.model,
    max_tokens: 1500,
    system: LEAFLET_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Produit : « ${target.name} ».\n\nNotice officielle :\n<<<\n${text.slice(0, LEAFLET_TEXT_MAX)}\n>>>` }],
    tools: [{ name: LEAFLET_TOOL_NAME, description: "Enregistre les rubriques de la notice.", input_schema: LEAFLET_SCHEMA }],
    tool_choice: { type: "tool", name: LEAFLET_TOOL_NAME },
  });
  return checkLeaflet(toolCall(response), text);
}

/** Un produit sans notice publique connue : le modèle cherche la page officielle ; on la télécharge nous-mêmes pour vérifier. */
async function searchNotice(target: LeafletTarget, deps: { client: ModelClient; model: string }): Promise<{ checked: CheckedLeaflet; url: string | null }> {
  const response = await deps.client.create({
    model: deps.model,
    max_tokens: 2500,
    system: `${LEAFLET_SYSTEM_PROMPT}\n\n${LEAFLET_SEARCH_PROMPT}`,
    messages: [{ role: "user", content: `Produit : « ${target.name} »${target.ean ? ` (code-barres ${target.ean})` : ""}.` }],
    tools: [
      { type: "web_search_20250305", name: "web_search", max_uses: 4 },
      { name: LEAFLET_TOOL_NAME, description: "Enregistre les rubriques de la notice ou de la page officielle lue.", input_schema: LEAFLET_SCHEMA },
    ],
  });
  const claimed = toolCall(response);
  const url = checkLeaflet(claimed, "").sourceUrl;
  if (!url) return { checked: { found: false, sourceUrl: null, fields: {}, quotes: {}, discarded: [] }, url: null };
  const html = await fetchText(url);
  if (!html) return { checked: { found: false, sourceUrl: url, fields: {}, quotes: {}, discarded: [] }, url };
  return { checked: checkLeaflet(claimed, textOfHtml(html)), url };
}

/** Lit et enregistre la notice d'un produit si elle manque (ou si sa dernière recherche est assez ancienne). */
export async function ensureLeaflet(target: LeafletTarget, deps: { client?: ModelClient; model?: string; now?: Date } = {}): Promise<void> {
  const key = leafletKey(target);
  if (!key) return;
  const now = deps.now ?? new Date();
  const existing = await prisma.productLeaflet.findUnique({ where: { key }, select: { status: true, updatedAt: true } });
  if (existing?.status === "FOUND") return;
  if (existing?.status === "NOT_FOUND" && now.getTime() - existing.updatedAt.getTime() < RETRY_NOT_FOUND_MS) return;
  if (existing?.status === "ERROR" && now.getTime() - existing.updatedAt.getTime() < RETRY_ERROR_MS) return;
  const ai = deps.client && deps.model ? { client: deps.client, model: deps.model } : modelClient();
  if (!ai) return;

  let checked: CheckedLeaflet;
  let sourceUrl: string | null;
  let sourceKind: string;
  try {
    if (key.startsWith("cis:")) {
      const notice = await bdpmNoticeText(key.slice(4));
      if (!notice) {
        await save(key, target.name, { status: "NOT_FOUND", sourceKind: "BDPM" });
        return;
      }
      checked = await readNotice(target, notice.text, ai);
      sourceUrl = notice.url;
      sourceKind = "BDPM";
    } else {
      const found = await searchNotice(target, ai);
      checked = found.checked;
      sourceUrl = found.url;
      sourceKind = "FABRICANT";
    }
  } catch {
    await save(key, target.name, { status: "ERROR" });
    return;
  }
  await save(key, target.name, {
    status: checked.found ? "FOUND" : "NOT_FOUND",
    indications: checked.fields.indications ?? null,
    posology: checked.fields.posology ?? null,
    duration: checked.fields.duration ?? null,
    quotes: checked.quotes,
    sourceUrl: checked.found ? sourceUrl : null,
    sourceKind,
    model: ai.model,
  });
}

async function save(key: string, productName: string, data: { status: string; indications?: string | null; posology?: string | null; duration?: string | null; quotes?: object; sourceUrl?: string | null; sourceKind?: string; model?: string }) {
  const values = { productName: productName.slice(0, 200), status: data.status, indications: data.indications ?? null, posology: data.posology ?? null, duration: data.duration ?? null, quotes: (data.quotes ?? {}) as never, sourceUrl: data.sourceUrl ?? null, sourceKind: data.sourceKind ?? null, model: data.model ?? null, fetchedAt: new Date() };
  await prisma.productLeaflet.upsert({ where: { key }, create: { key, ...values }, update: values });
}

/**
 * Après une analyse : les notices des produits proposés sont lues en arrière-plan (au plus quelques-unes), pour qu'elles soient
 * prêtes quand le pharmacien envoie le bilan. Rien ne ralentit le comptoir.
 */
export function prefetchLeafletsForRun(analysisRunId: string): void {
  const task = (async () => {
    try {
      const proposed = await prisma.recommendation.findMany({
        where: { analysisRunId },
        select: { product: { select: { name: true, ean: true } }, presentation: { select: { specialty: { select: { name: true, cisCode: true } } } } },
        take: 6,
      });
      const targets = proposed.map((rec) => ({ name: rec.product?.name ?? rec.presentation?.specialty.name ?? "", ean: rec.product?.ean ?? null, cisCode: rec.presentation?.specialty.cisCode ?? null }));
      const unique = [...new Map(targets.map((target) => [leafletKey(target), target])).entries()].filter(([key]) => key).slice(0, 4).map(([, target]) => target);
      for (const target of unique) await ensureLeaflet(target).catch(() => undefined);
    } catch {
      // Une notice est un plus : son absence ne gêne jamais l'analyse.
    }
  })();
  try {
    after(() => task);
  } catch {
    // Hors requête (script, test) : la promesse continue seule.
  }
}

/** Les notices connues de ces produits, pour le bilan du patient (seulement celles vérifiées). */
export async function leafletsFor(targets: LeafletTarget[]): Promise<Map<string, { indications: string | null; posology: string | null; duration: string | null; sourceUrl: string | null; sourceKind: string | null }>> {
  const keys = targets.map(leafletKey).filter((key): key is string => Boolean(key));
  const rows = keys.length ? await prisma.productLeaflet.findMany({ where: { key: { in: keys }, status: "FOUND" }, select: { key: true, indications: true, posology: true, duration: true, sourceUrl: true, sourceKind: true } }) : [];
  return new Map(rows.map((row) => [row.key, row]));
}
