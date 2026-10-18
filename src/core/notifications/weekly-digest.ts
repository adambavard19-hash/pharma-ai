import { renderEmail, type EmailBlock, type EmailContext, type RenderedEmail } from "@/core/platform/email-layout";

/**
 * Le bilan de la semaine (fondateur, 18 oct. 2026 : « seulement toutes les semaines ») : la semaine écoulée au comptoir, en un coup d'œil,
 * chaque lundi matin.
 * - au titulaire : toute son officine (conseils proposés, vendus, chiffre d'affaires ajouté), le stock à surveiller, les challenges ;
 * - à chaque membre de l'équipe : SEULEMENT ses propres ventes (« seulement leur propre performance »).
 * Seulement des chiffres lus dans PharmaBoost, sur les ventes terminées ; jamais de donnée de patient, jamais d'estimation.
 * Une semaine sans conseil proposé n'envoie rien.
 *
 * Module pur : les chiffres arrivent calculés (services), l'envoi est ailleurs.
 */

export type DigestAudience = "owner" | "member";

export type DailyDigestInput = {
  audience: DigestAudience;
  pharmacyName: string;
  firstName?: string | null;
  /** « du lundi 12 au dimanche 18 octobre » */
  dayLabel: string;
  /** Les conseils de la semaine (ventes terminées) : proposés, vendus, chiffre d'affaires ajouté (centimes TTC). */
  advice: { sales: number; proposed: number; sold: number; revenueTtcCents: number } | null;
  /** Le rapport PDF de la semaine est joint à l'e-mail. */
  pdfAttached?: boolean;
  /** Titulaire seulement. */
  challenges?: { title: string; endsLabel: string }[];
  /** Titulaire seulement. */
  stock?: { out: number; low: number; outNames: string[] };
  links: { results: string; stock: string; unsubscribe: string };
};

const euros = (cents: number) => (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const plural = (count: number, one: string, many: string) => (count > 1 ? many : one);

/** Y a-t-il quelque chose de vrai à dire ? Au moins un conseil proposé dans la semaine. */
export function digestHasContent(input: Pick<DailyDigestInput, "advice">): boolean {
  return Boolean(input.advice && input.advice.proposed > 0);
}

export function buildDailyDigest(input: DailyDigestInput, ctx: EmailContext): RenderedEmail | null {
  const advice = input.advice;
  if (!advice || !digestHasContent(input)) return null;
  const pharmacy = input.pharmacyName.trim() || "votre officine";
  const owner = input.audience === "owner";
  const blocks: EmailBlock[] = [];

  if (!owner) blocks.push({ kind: "paragraph", text: "Voici vos ventes de la semaine au comptoir avec PharmaBoost : seulement les vôtres." });
  blocks.push({
    kind: "stats",
    items: [
      { value: String(advice.proposed), label: plural(advice.proposed, "conseil proposé", "conseils proposés"), trend: `dans ${advice.sales} ${plural(advice.sales, "vente", "ventes")}` },
      { value: String(advice.sold), label: plural(advice.sold, "conseil vendu", "conseils vendus"), trend: null },
      { value: euros(advice.revenueTtcCents), label: "de chiffre d'affaires ajouté (TTC)", trend: null },
    ],
  });
  const rate = Math.round((advice.sold / advice.proposed) * 1000) / 10;
  blocks.push({
    kind: "note",
    text: `Taux de vente : ${rate.toLocaleString("fr-FR")} % des conseils proposés ont été vendus. Compté sur les ventes terminées au comptoir : un conseil bipé (ou déclaré vendu) est vendu, au prix de vente de l'officine.${input.pdfAttached ? " Le rapport complet de la semaine est joint en PDF." : ""}`,
  });
  blocks.push({ kind: "button", url: input.links.results, label: owner ? "Voir les résultats de l'officine" : "Voir mes ventes" });

  const challenges = owner ? (input.challenges ?? []) : [];
  if (challenges.length > 0) {
    blocks.push({ kind: "list", title: plural(challenges.length, "Challenge en cours", "Challenges en cours"), items: challenges.slice(0, 5).map((challenge) => `${challenge.title} — ${challenge.endsLabel}`) });
  }
  const stock = owner ? input.stock : undefined;
  if (stock && (stock.out > 0 || stock.low > 0)) {
    const parts = [
      stock.out > 0 ? `${stock.out} ${plural(stock.out, "produit en rupture (plus proposé en conseil)", "produits en rupture (plus proposés en conseil)")}` : null,
      stock.low > 0 ? `${stock.low} ${plural(stock.low, "produit sous son seuil d'alerte", "produits sous leur seuil d'alerte")}` : null,
    ].filter((part): part is string => part !== null);
    blocks.push({ kind: "list", title: "Stock à surveiller", items: [...parts, ...(stock.outNames.length ? [`En rupture : ${stock.outNames.slice(0, 5).join(", ")}${stock.out > 5 ? "…" : ""}`] : [])] });
    blocks.push({ kind: "link", label: "Le stock dans PharmaBoost :", url: input.links.stock });
  }

  return renderEmail(ctx, {
    website: true,
    subject: owner ? `Votre bilan de la semaine — ${pharmacy}` : `Votre performance de la semaine — ${pharmacy}`,
    preheader: `${advice.proposed} ${plural(advice.proposed, "conseil proposé", "conseils proposés")}, ${advice.sold} ${plural(advice.sold, "vendu", "vendus")}, ${euros(advice.revenueTtcCents)} de chiffre d'affaires ajouté.`,
    eyebrow: `Bilan de la semaine · ${input.dayLabel}`,
    title: owner ? `La semaine de ${pharmacy}` : "Votre semaine au comptoir",
    greeting: input.firstName ? `Bonjour ${input.firstName},` : "Bonjour,",
    blocks,
    reason: owner
      ? `Vous recevez ce bilan chaque lundi après une semaine de ventes, en tant que titulaire de ${pharmacy}.`
      : `Vous recevez ce bilan chaque lundi après une semaine de ventes à ${pharmacy}. Il ne contient que vos propres ventes.`,
    unsubscribeUrl: input.links.unsubscribe,
    unsubscribeLabel: "Ne plus recevoir ce bilan",
  });
}
