/**
 * Le bilan que le patient reçoit par e-mail à la fin de sa vente, s'il a donné son accord.
 *
 * Il ne dit que ce que le pharmacien a CONFIRMÉ au comptoir : les produits conseillés qu'il a marqués « Vendu », avec la phrase
 * écrite pour le patient quand la règle en porte une. Jamais un médicament, jamais une posologie : au comptoir, une boîte bipée
 * n'est pas une ordonnance validée, et rien ne remplace ce que le pharmacien a dit de vive voix. Jamais de donnée de santé ni
 * de nom : le message ne cite ni le patient, ni son traitement.
 *
 * Module pur : aucune base, aucune horloge, aucun envoi.
 */

export type ReportProduct = { name: string; reason: string | null };

export type PatientReport = { subject: string; text: string; html: string };

const escape = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const clean = (value: string | null | undefined): string => (value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();

/** Ce qui est retenu pour le patient : seulement des produits « Vendu », chacun une fois, avec une phrase courte ou rien. */
export function reportProducts(products: ReportProduct[]): ReportProduct[] {
  const seen = new Set<string>();
  const kept: ReportProduct[] = [];
  for (const product of products) {
    const name = clean(product.name);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const reason = clean(product.reason);
    kept.push({ name, reason: reason ? reason.slice(0, 300) : null });
  }
  return kept.slice(0, 8);
}

/** `null` quand il n'y a rien à dire : sans produit retenu, aucun e-mail ne part. */
export function buildPatientReport(input: { pharmacyName: string; products: ReportProduct[] }): PatientReport | null {
  const products = reportProducts(input.products);
  if (products.length === 0) return null;
  const pharmacy = clean(input.pharmacyName) || "votre pharmacie";
  const subject = `Votre bilan ${pharmacy}`;
  const closing = "Ce message ne remplace ni l'avis de votre pharmacien, ni celui de votre médecin. En cas de doute, demandez conseil à votre pharmacie.";
  const consent = `Vous recevez ce message parce que vous avez donné votre accord au comptoir de ${pharmacy}. Votre adresse n'est utilisée que pour cet envoi.`;

  const text = [
    "Bonjour,",
    "",
    `Voici le récapitulatif des produits que votre pharmacien vous a conseillés aujourd'hui à ${pharmacy}.`,
    "",
    ...products.flatMap((product) => [`• ${product.name}`, ...(product.reason ? [`  ${product.reason}`] : []), ""]),
    closing,
    "",
    consent,
  ].join("\n");

  const items = products
    .map((product) => `<li style="margin:0 0 14px"><strong style="color:#101828">${escape(product.name)}</strong>${product.reason ? `<br><span style="color:#475467">${escape(product.reason)}</span>` : ""}</li>`)
    .join("");
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f4f7f5;font-family:Segoe UI,Arial,sans-serif;color:#101828">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #d6ebe0">
<tr><td style="padding:24px 28px 8px"><div style="font-size:13px;font-weight:600;color:#12805c">${escape(pharmacy)}</div><h1 style="margin:6px 0 0;font-size:21px">Votre bilan du jour</h1></td></tr>
<tr><td style="padding:8px 28px 4px;font-size:15px;line-height:22px">Voici le récapitulatif des produits que votre pharmacien vous a conseillés aujourd'hui.</td></tr>
<tr><td style="padding:12px 28px 4px;font-size:15px;line-height:22px"><ul style="margin:0;padding:0 0 0 18px">${items}</ul></td></tr>
<tr><td style="padding:8px 28px 20px;font-size:12.5px;line-height:19px;color:#667085">${escape(closing)}</td></tr>
<tr><td style="padding:14px 28px;border-top:1px solid #eaecf0;font-size:12px;line-height:18px;color:#667085">${escape(consent)}</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}

/** Une adresse e-mail saisie au comptoir : lue, nettoyée, refusée si elle n'a pas la forme d'une adresse. */
export function parsePatientEmail(raw: string | null | undefined): { ok: true; email: string } | { ok: false; error: string } {
  const email = clean(raw).toLowerCase();
  if (!email) return { ok: false, error: "Saisissez l'adresse e-mail du patient." };
  if (email.length > 160) return { ok: false, error: "Cette adresse est trop longue." };
  if (!/^[a-z0-9._%+'-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(email) || email.includes("..")) return { ok: false, error: "Cette adresse e-mail ne semble pas valide." };
  return { ok: true, email };
}

/** « j***@gmail.com » : pour les journaux, jamais l'adresse entière. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}
