import { renderEmail, type EmailBlock, type EmailContext, type RenderedEmail } from "@/core/platform/email-layout";

/**
 * Le résumé hebdomadaire du titulaire : chaque lundi, la semaine écoulée de son officine, en un coup d'œil. Seulement des chiffres
 * lus dans PharmaBoost (conseils proposés, conseils achetés, chiffre d'affaires des ventes confirmées, challenges, stock) ; jamais
 * de donnée de patient, jamais d'estimation. Une semaine où il n'y a rien à dire n'envoie rien.
 *
 * Module pur : les chiffres arrivent calculés (services), l'envoi est ailleurs.
 */

export type WeekMetric = { value: number; previous: number; deltaPct: number | null; trend: "up" | "down" | "flat" | "none" };

export type WeeklyDigestInput = {
  pharmacyName: string;
  firstName?: string | null;
  /** « du lundi 5 au dimanche 11 octobre » */
  weekLabel: string;
  advice: { proposed: WeekMetric; purchased: WeekMetric; revenueTtcCents: WeekMetric } | null;
  challenges: { title: string; endsLabel: string }[];
  stock: { out: number; low: number; outNames: string[] };
  links: { results: string; stock: string; challenges: string; unsubscribe: string };
};

const euros = (cents: number) => `${Math.round(cents / 100).toLocaleString("fr-FR")} €`;
const plural = (count: number, one: string, many: string) => (count > 1 ? many : one);

/** « +12 % », « −8 % », « stable », « nouveau » : la comparaison avec la semaine d'avant, dite simplement. */
export function trendLabel(metric: WeekMetric): { text: string; tone: "up" | "down" | "flat" } | null {
  if (metric.trend === "none") return null;
  if (metric.deltaPct === null) return { text: "nouveau cette semaine", tone: "up" };
  if (metric.deltaPct === 0) return { text: "stable", tone: "flat" };
  const sign = metric.deltaPct > 0 ? "+" : "−";
  return { text: `${sign}${Math.abs(Math.round(metric.deltaPct))} % vs semaine d'avant`, tone: metric.deltaPct > 0 ? "up" : "down" };
}

/** Y a-t-il quelque chose de vrai à dire cette semaine ? */
export function digestHasContent(input: Pick<WeeklyDigestInput, "advice" | "challenges" | "stock">): boolean {
  const advice = input.advice;
  return Boolean(advice && (advice.proposed.value > 0 || advice.purchased.value > 0 || advice.revenueTtcCents.value > 0)) || input.challenges.length > 0 || input.stock.out > 0 || input.stock.low > 0;
}

export function buildWeeklyDigest(input: WeeklyDigestInput, ctx: EmailContext): RenderedEmail | null {
  if (!digestHasContent(input)) return null;
  const pharmacy = input.pharmacyName.trim() || "votre officine";
  const blocks: EmailBlock[] = [];
  const advice = input.advice;

  if (advice && (advice.proposed.value > 0 || advice.purchased.value > 0 || advice.revenueTtcCents.value > 0)) {
    const stat = (value: string, label: string, metric: WeekMetric) => {
      const trend = trendLabel(metric);
      return { value, label, trend: trend?.text ?? null, tone: trend?.tone };
    };
    blocks.push({
      kind: "stats",
      items: [
        stat(String(advice.proposed.value), plural(advice.proposed.value, "conseil proposé", "conseils proposés"), advice.proposed),
        stat(String(advice.purchased.value), plural(advice.purchased.value, "conseil acheté", "conseils achetés"), advice.purchased),
        stat(euros(advice.revenueTtcCents.value), "de ventes confirmées (TTC)", advice.revenueTtcCents),
      ],
    });
    blocks.push({ kind: "note", text: "Ventes confirmées : les lignes de vente nées d'un conseil PharmaBoost dont le prix est connu. Un conseil accepté sans vente n'y est pas compté." });
    blocks.push({ kind: "button", url: input.links.results, label: "Voir les résultats de la semaine" });
  } else {
    blocks.push({ kind: "paragraph", text: "Aucun conseil n'a été proposé cette semaine : aucune délivrance n'a été scannée avec PharmaBoost." });
  }

  if (input.challenges.length > 0) {
    blocks.push({ kind: "list", title: plural(input.challenges.length, "Challenge en cours", "Challenges en cours"), items: input.challenges.slice(0, 5).map((challenge) => `${challenge.title} — ${challenge.endsLabel}`) });
  }

  if (input.stock.out > 0 || input.stock.low > 0) {
    const parts = [
      input.stock.out > 0 ? `${input.stock.out} ${plural(input.stock.out, "produit en rupture (plus proposé en conseil)", "produits en rupture (plus proposés en conseil)")}` : null,
      input.stock.low > 0 ? `${input.stock.low} ${plural(input.stock.low, "produit sous son seuil d'alerte", "produits sous leur seuil d'alerte")}` : null,
    ].filter((part): part is string => part !== null);
    blocks.push({ kind: "list", title: "Stock à surveiller", items: [...parts, ...(input.stock.outNames.length ? [`En rupture : ${input.stock.outNames.slice(0, 5).join(", ")}${input.stock.out > 5 ? "…" : ""}`] : [])] });
    blocks.push({ kind: "link", label: "Le stock dans PharmaBoost :", url: input.links.stock });
  }

  const purchased = advice?.purchased.value ?? 0;
  return renderEmail(ctx, {
    subject: `Votre semaine — ${pharmacy}`,
    preheader: advice && advice.proposed.value > 0 ? `${advice.proposed.value} conseils proposés, ${purchased} achetés, ${euros(advice.revenueTtcCents.value)} de ventes confirmées.` : `Le point de la semaine de ${pharmacy}.`,
    eyebrow: `Résumé de la semaine · ${input.weekLabel}`,
    title: `La semaine de ${pharmacy}`,
    greeting: input.firstName ? `Bonjour ${input.firstName},` : "Bonjour,",
    blocks,
    reason: `Vous recevez ce résumé chaque lundi, en tant que titulaire de ${pharmacy}.`,
    unsubscribeUrl: input.links.unsubscribe,
    unsubscribeLabel: "Ne plus recevoir ce résumé",
  });
}
