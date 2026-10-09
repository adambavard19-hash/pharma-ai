/**
 * Les résultats de la fenêtre du poste de caisse, pour le titulaire : ce que la pharmacie a vu, vendu, laissé.
 *
 * Tout ici est une DÉCLARATION faite au comptoir (« Vendu » / « Non vendu »), jamais une vente lue dans le logiciel de gestion :
 * ces chiffres s'affichent à part des « ventes confirmées » de la page, et le disent. Une vente compte quand elle est terminée
 * (« Vente terminée ») : une vente restée ouverte ne fausse pas les totaux.
 *
 * Module pur : aucune base, aucune horloge.
 */

export type ClosedCounterSale = { post: string; proposed: number; sold: number; notSold: number; unanswered: number; emailSaved: boolean; report: string | null };
export type SoldAdvice = { post: string; product: string; challenge: string | null; shortDateOn: string | null };

export type PostResult = { post: string; sales: number; proposed: number; sold: number; notSold: number; unanswered: number };

export type CounterResults = {
  salesClosed: number;
  proposed: number;
  sold: number;
  notSold: number;
  unanswered: number;
  /** « Vendu » sur les conseils auxquels le pharmacien a répondu ; `null` quand il n'a répondu à aucun. */
  conversionRate: number | null;
  /** Par poste de caisse : le logiciel de gestion ne dit pas qui est au comptoir, on ne devine pas un collaborateur. */
  byPost: PostResult[];
  products: { name: string; sold: number }[];
  challengeSold: number;
  challenges: { title: string; sold: number }[];
  shortDateSold: number;
  emailsSaved: number;
  reportsSent: number;
};

const TOP_PRODUCTS = 8;

export function summariseCounterResults(input: { sales: ClosedCounterSale[]; soldAdvice: SoldAdvice[] }): CounterResults {
  const posts = new Map<string, PostResult>();
  let proposed = 0;
  let sold = 0;
  let notSold = 0;
  let unanswered = 0;
  let emailsSaved = 0;
  let reportsSent = 0;
  for (const sale of input.sales) {
    proposed += sale.proposed;
    sold += sale.sold;
    notSold += sale.notSold;
    unanswered += sale.unanswered;
    if (sale.emailSaved) emailsSaved += 1;
    if (sale.report === "SENT") reportsSent += 1;
    const row = posts.get(sale.post) ?? { post: sale.post, sales: 0, proposed: 0, sold: 0, notSold: 0, unanswered: 0 };
    row.sales += 1;
    row.proposed += sale.proposed;
    row.sold += sale.sold;
    row.notSold += sale.notSold;
    row.unanswered += sale.unanswered;
    posts.set(sale.post, row);
  }
  const products = new Map<string, number>();
  const challenges = new Map<string, number>();
  let challengeSold = 0;
  let shortDateSold = 0;
  for (const advice of input.soldAdvice) {
    products.set(advice.product, (products.get(advice.product) ?? 0) + 1);
    if (advice.challenge) {
      challengeSold += 1;
      challenges.set(advice.challenge, (challenges.get(advice.challenge) ?? 0) + 1);
    }
    if (advice.shortDateOn) shortDateSold += 1;
  }
  const answered = sold + notSold;
  return {
    salesClosed: input.sales.length,
    proposed,
    sold,
    notSold,
    unanswered,
    conversionRate: answered > 0 ? sold / answered : null,
    byPost: [...posts.values()].sort((a, b) => b.sold - a.sold || b.sales - a.sales || a.post.localeCompare(b.post, "fr")),
    products: [...products.entries()].map(([name, count]) => ({ name, sold: count })).sort((a, b) => b.sold - a.sold || a.name.localeCompare(b.name, "fr")).slice(0, TOP_PRODUCTS),
    challengeSold,
    challenges: [...challenges.entries()].map(([title, count]) => ({ title, sold: count })).sort((a, b) => b.sold - a.sold || a.title.localeCompare(b.title, "fr")),
    shortDateSold,
    emailsSaved,
    reportsSent,
  };
}

export type MonthlyReportMail = { subject: string; text: string; html: string };

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** « 12 conseils vendus sur 31 proposés » : une phrase vraie, sans pourcentage quand il n'y a rien à comparer. */
export function describeResults(results: CounterResults): string[] {
  const lines = [`${results.salesClosed} vente${results.salesClosed > 1 ? "s" : ""} terminée${results.salesClosed > 1 ? "s" : ""} avec la fenêtre du poste de caisse.`];
  lines.push(`${results.proposed} conseil${results.proposed > 1 ? "s" : ""} proposé${results.proposed > 1 ? "s" : ""} · ${results.sold} déclaré${results.sold > 1 ? "s" : ""} vendu${results.sold > 1 ? "s" : ""} · ${results.notSold} non vendu${results.notSold > 1 ? "s" : ""} · ${results.unanswered} sans réponse.`);
  if (results.conversionRate !== null) lines.push(`${Math.round(results.conversionRate * 100)} % des conseils auxquels l'équipe a répondu ont été vendus.`);
  if (results.challengeSold > 0) lines.push(`${results.challengeSold} vente${results.challengeSold > 1 ? "s" : ""} dans un challenge laboratoire en cours.`);
  if (results.shortDateSold > 0) lines.push(`${results.shortDateSold} produit${results.shortDateSold > 1 ? "s" : ""} à date courte écoulé${results.shortDateSold > 1 ? "s" : ""}.`);
  return lines;
}

/**
 * Le rapport mensuel du titulaire. Il rappelle que ce sont des déclarations de l'équipe au comptoir, et ne contient aucune donnée de patient.
 * `null` quand le mois n'a aucune vente terminée : pas d'e-mail vide.
 */
export function buildMonthlyReport(input: { pharmacyName: string; monthLabel: string; results: CounterResults; resultsUrl: string }): MonthlyReportMail | null {
  const { results } = input;
  if (results.salesClosed === 0) return null;
  const pharmacy = input.pharmacyName.trim() || "votre pharmacie";
  const lines = describeResults(results);
  const top = results.products.slice(0, 5).map((product) => `${product.name} — ${product.sold}`);
  const posts = results.byPost.slice(0, 6).map((post) => `${post.post} — ${post.sold} vendu${post.sold > 1 ? "s" : ""} sur ${post.proposed} proposé${post.proposed > 1 ? "s" : ""}`);
  const note = "Ces chiffres sont les réponses « Vendu » / « Non vendu » données par l'équipe au comptoir : ce ne sont pas des ventes lues dans votre logiciel de gestion.";
  const subject = `Votre bilan du comptoir — ${input.monthLabel}`;
  const text = [
    `Bonjour,`,
    "",
    `Voici le bilan de ${input.monthLabel} pour ${pharmacy}.`,
    "",
    ...lines,
    ...(top.length ? ["", "Produits les plus vendus :", ...top.map((line) => `• ${line}`)] : []),
    ...(posts.length ? ["", "Par poste de caisse :", ...posts.map((line) => `• ${line}`)] : []),
    "",
    note,
    "",
    `Le détail : ${input.resultsUrl}`,
  ].join("\n");
  const list = (items: string[]) => (items.length ? `<ul style="margin:6px 0 14px;padding-left:18px">${items.map((item) => `<li>${escape(item)}</li>`).join("")}</ul>` : "");
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f4f7f5;font-family:Segoe UI,Arial,sans-serif;color:#101828">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #d6ebe0">
<tr><td style="padding:24px 28px 4px"><div style="font-size:13px;font-weight:600;color:#12805c">PharmaBoost · ${escape(pharmacy)}</div><h1 style="margin:6px 0 0;font-size:21px">Bilan du comptoir — ${escape(input.monthLabel)}</h1></td></tr>
<tr><td style="padding:10px 28px;font-size:15px;line-height:22px">${list(lines)}${top.length ? `<strong>Produits les plus vendus</strong>${list(top)}` : ""}${posts.length ? `<strong>Par poste de caisse</strong>${list(posts)}` : ""}</td></tr>
<tr><td style="padding:0 28px 18px;font-size:12.5px;line-height:19px;color:#667085">${escape(note)}</td></tr>
<tr><td style="padding:0 28px 24px"><a href="${escape(input.resultsUrl)}" style="display:inline-block;background:#12805c;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:10px">Voir le détail</a></td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
