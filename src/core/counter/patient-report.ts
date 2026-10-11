/**
 * Le bilan que le patient reçoit par e-mail à la fin de sa vente, s'il a donné son accord.
 *
 * Il ne dit que ce que le pharmacien a CONFIRMÉ au comptoir : les produits conseillés qu'il a marqués « Vendu », avec la phrase
 * écrite pour le patient quand la règle en porte une et qu'elle ne peut pas nommer le traitement (`patientSafeReason`). Jamais un
 * médicament, jamais une posologie : au comptoir, une boîte bipée n'est pas une ordonnance validée, et rien ne remplace ce que le
 * pharmacien a dit de vive voix. Jamais de nom : le message ne cite ni le patient, ni son traitement.
 *
 * Module pur : aucune base, aucune horloge, aucun envoi.
 */

/**
 * Un produit retenu pour le bilan. Seuls `name` et `reason` sont obligatoires ; le reste ne s'affiche que s'il existe :
 *  - `imageUrl` : la photo du produit, seulement si c'est une image https qu'une messagerie sait montrer (pas de SVG) ;
 *  - `benefits` : les mots-clés « ce que ça apporte » de la règle validée qui l'a proposé (écrits et relus, jamais tirés d'un
 *    argumentaire) ;
 *  - `precautions` : les précautions d'emploi que la pharmacie a saisies sur sa fiche produit.
 * Les deux derniers passent par le même filtre que la phrase patient (`patientSafeLine`) avant d'arriver ici.
 */
/**
 * Un produit du bilan. `benefits` (« Pourquoi ce produit ? »), `usage` (« Comment l'utiliser ? ») et `precautions` ne viennent
 * que de sources relues ; une colonne sans contenu ne s'affiche pas.
 */
export type ReportProduct = { name: string; reason: string | null; imageUrl?: string | null; benefits?: string[]; usage?: string[]; precautions?: string[] };

/** Ce que le bilan dit de la pharmacie : le nom, et seulement ce que sa fiche contient (rien n'est deviné). */
export type ReportPharmacy = {
  name: string;
  brandColor?: string | null;
  logoUrl?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
};

export type PatientReport = { subject: string; text: string; html: string };

const escape = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const clean = (value: string | null | undefined): string => (value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();

/** Un mot plus court ne désigne pas un médicament à coup sûr (« fer », « gel », « 1 g ») : il ferait taire des phrases pour rien. */
export const TREATMENT_WORD_MIN = 5;

/** Minuscules, sans accents ni ligatures : « Paracétamol » et « PARACETAMOL » sont le même mot. */
const fold = (value: string): string =>
  value.toLowerCase().replace(/œ/g, "oe").replace(/æ/g, "ae").normalize("NFD").replace(/[̀-ͯ]/g, "");

const wordsOf = (value: string): string[] => fold(value).split(/[^a-z]+/).filter((word) => word.length >= TREATMENT_WORD_MIN);

/** Une ligne de la vente : le nom lu au scan (ou celui de la spécialité) et ses substances publiées. */
export type SaleTreatment = { names: (string | null | undefined)[]; substances: (string | null | undefined)[] };

/**
 * Les mots qui désignent un traitement de la vente : chaque mot d'au moins TREATMENT_WORD_MIN lettres de ses noms et de ses
 * substances. Un nom perd sa forme (« DOLIPRANE 1000 mg, comprimé » → « doliprane ») : « comprimé » ou « solution » ne
 * désignent personne, et les garder ferait taire toute phrase qui parle d'une crème ou d'une solution.
 */
export function treatmentWords(lines: SaleTreatment[]): string[] {
  const words = new Set<string>();
  for (const line of lines) {
    for (const name of line.names) for (const word of wordsOf((name ?? "").replace(/,[\s\S]*$/, ""))) words.add(word);
    for (const substance of line.substances) for (const word of wordsOf(substance ?? "")) words.add(word);
  }
  return [...words];
}

/**
 * La phrase « patient » d'un produit vendu, seulement si elle ne peut pas nommer ce que la pharmacie a délivré ; sinon `null`, et
 * le bilan donne le nom du produit seul.
 *
 * Deux verrous, parce que la phrase est un texte rendu : le moteur y a remplacé `{drug}` par le médicament de l'ordonnance
 * (« Votre antibiotique ({drug}) peut… » devient « Votre antibiotique (AMOXICILLINE) peut… »).
 *  1. Le modèle de la règle : s'il contient `{drug}`, ou s'il est inconnu (règle disparue, définition illisible), la phrase ne
 *     part pas : rien ne prouve qu'elle ne nomme pas le médicament.
 *  2. Le texte lui-même : s'il contient un mot d'un nom ou d'une substance de la vente (casse et accents ignorés), il ne part
 *     pas non plus. C'est le filet d'une phrase rendue avant une réécriture de la règle, ou d'un modèle qui cite une substance.
 * Les mots du produit conseillé sont permis : son nom est déjà écrit dans le bilan, juste au-dessus de la phrase, et une boîte du
 * produit vendu passée au scan est elle-même une ligne de la vente.
 */
export function patientSafeReason(input: { reason: string | null | undefined; template: string | null | undefined; productName: string; sale: SaleTreatment[] }): string | null {
  const reason = clean(input.reason);
  if (!reason) return null;
  if (!input.template || input.template.includes("{drug}")) return null;
  const allowed = new Set(wordsOf(input.productName));
  const text = ` ${fold(reason).replace(/[^a-z]+/g, " ")} `;
  for (const word of treatmentWords(input.sale)) {
    if (!allowed.has(word) && text.includes(word)) return null;
  }
  return reason;
}

/**
 * Une ligne écrite à l'avance (mot-clé d'une règle validée, précaution d'emploi saisie par la pharmacie) : elle part telle quelle,
 * sauf si elle contient un mot d'un nom ou d'une substance de la vente — le même verrou que pour la phrase patient. Pas de modèle
 * ici : ces lignes ne sont jamais rendues avec le médicament.
 */
export function patientSafeLine(input: { line: string | null | undefined; productName: string; sale: SaleTreatment[] }): string | null {
  const line = clean(input.line);
  if (!line) return null;
  const allowed = new Set(wordsOf(input.productName));
  const text = ` ${fold(line).replace(/[^a-z]+/g, " ")} `;
  for (const word of treatmentWords(input.sale)) {
    if (!allowed.has(word) && text.includes(word)) return null;
  }
  return line;
}

/** Une image qu'une messagerie montre : https, pas de SVG (Gmail et Outlook ne les affichent pas), d'une longueur raisonnable. */
export function emailImageUrl(url: string | null | undefined, base?: string | null): string | null {
  const raw = clean(url);
  if (!raw || raw.length > 600) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw, base && /^https:\/\//.test(base) ? base : undefined);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (/\.svg$/i.test(parsed.pathname)) return null;
  return parsed.toString();
}

const lines = (values: (string | null | undefined)[] | undefined, max: number, length: number): string[] => {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const value of values ?? []) {
    const line = clean(value);
    if (!line || line.length > length || seen.has(line.toLowerCase())) continue;
    seen.add(line.toLowerCase());
    kept.push(line);
  }
  return kept.slice(0, max);
};

/** Ce qui est retenu pour le patient : seulement des produits « Vendu », chacun une fois, avec une phrase courte ou rien. */
export function reportProducts(products: ReportProduct[]): ReportProduct[] {
  const seen = new Set<string>();
  const kept: ReportProduct[] = [];
  for (const product of products) {
    const name = clean(product.name);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const reason = clean(product.reason);
    kept.push({
      name,
      reason: reason ? reason.slice(0, 300) : null,
      imageUrl: product.imageUrl ?? null,
      benefits: lines(product.benefits, 3, 80),
      usage: lines(product.usage, 2, 200),
      precautions: lines(product.precautions, 2, 160),
    });
  }
  return kept.slice(0, 8);
}

const DEFAULT_BRAND = "#0F766E";
/** Le robot PharmaBoost, fixe (ancienne version du bilan ; gardé pour les e-mails déjà partis). */
export const REPORT_ROBOT_PATH = "/email/robot-192.png";
/**
 * Le robot VIVANT du bilan (demande du fondateur, 11 oct. 2026) : une image animée sur fond blanc — il flotte, cligne des yeux,
 * sa lampe pulse. Gmail, Apple Mail et la plupart des messageries la jouent ; Outlook sur ordinateur montre la première image.
 * Généré par `npx tsx scripts/logo-robot.ts --email`.
 */
export const REPORT_ROBOT_GIF_PATH = "/email/robot-vivant.gif";
/** Le grand robot vivant de l'accueil du bilan, entre des feuilles, sur le vert pâle de l'encart (EMAIL_HERO_BACKGROUND). */
export const REPORT_HERO_ROBOT_PATH = "/email/robot-bilan.gif";
const EMAIL_HERO_BACKGROUND = "#EAF5F0";

/** « Dimanche 11 octobre 2026 », à l'heure de Paris. */
export function reportDate(date: Date): string {
  const text = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** La couleur de la pharmacie, si c'est bien une couleur ; sinon celle de PharmaBoost. */
export function brandColorOf(value: string | null | undefined): string {
  const color = clean(value);
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : DEFAULT_BRAND;
}

/** Texte blanc sur une couleur foncée, texte sombre sur une couleur claire (luminance relative, WCAG). */
export function inkOn(hex: string): string {
  const channel = (index: number) => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return luminance > 0.45 ? "#101828" : "#FFFFFF";
}

/** « 04 78 00 00 00 » → « tel:+33478000000 ». `null` si ce n'est pas un numéro. */
export function telLink(phone: string | null | undefined): string | null {
  const digits = clean(phone).replace(/[^\d+]/g, "");
  if (/^0\d{9}$/.test(digits)) return `tel:+33${digits.slice(1)}`;
  if (/^\+\d{8,15}$/.test(digits)) return `tel:${digits}`;
  return null;
}

/** L'adresse en une ligne, seulement avec ce que la fiche contient. */
export function postalAddress(pharmacy: ReportPharmacy): string | null {
  const street = [pharmacy.addressLine1, pharmacy.addressLine2].map(clean).filter(Boolean).join(", ");
  const town = [pharmacy.postalCode, pharmacy.city].map(clean).filter(Boolean).join(" ");
  if (!street && !town) return null;
  return [street, town].filter(Boolean).join(", ");
}

/** `null` quand il n'y a rien à dire : sans produit retenu, aucun e-mail ne part. */
export function buildPatientReport(input: { pharmacyName?: string; pharmacy?: ReportPharmacy; products: ReportProduct[]; assetBaseUrl?: string | null; date?: Date }): PatientReport | null {
  const products = reportProducts(input.products);
  if (products.length === 0) return null;
  const details: ReportPharmacy = input.pharmacy ?? { name: input.pharmacyName ?? "" };
  const pharmacy = clean(details.name || input.pharmacyName) || "votre pharmacie";
  const base = input.assetBaseUrl && /^https:\/\//.test(input.assetBaseUrl) ? input.assetBaseUrl.replace(/\/$/, "") : "https://pharmaboost.app";
  const brand = brandColorOf(details.brandColor);
  const ink = inkOn(brand);
  const logo = emailImageUrl(details.logoUrl, base);
  const asset = (path: string) => `${base}${path}`;
  const day = input.date ? reportDate(input.date) : null;
  const tel = telLink(details.phone);
  const phone = clean(details.phone);
  const address = postalAddress(details);
  const maps = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${pharmacy}, ${address}`)}` : null;

  const subject = `Votre bilan ${pharmacy}`;
  const closing = "Ce message ne remplace ni l'avis de votre pharmacien, ni celui de votre médecin. En cas de doute, demandez conseil à votre pharmacie.";
  const consent = `Vous recevez ce message parce que vous avez donné votre accord au comptoir de ${pharmacy}. Votre adresse n'est utilisée que pour cet envoi.`;

  const text = [
    `Votre bilan personnalisé — ${pharmacy}${day ? ` — ${day}` : ""}`,
    "",
    "Bonjour,",
    "",
    `Voici le récapitulatif des produits que votre pharmacien vous a conseillés aujourd'hui à ${pharmacy}.`,
    "",
    ...products.flatMap((product) => [
      `• ${product.name}`,
      ...(product.reason ? [`  ${product.reason}`] : []),
      ...(product.benefits?.length ? [`  Pourquoi ce produit : ${product.benefits.join(", ")}`] : []),
      ...(product.usage ?? []).map((line) => `  Comment l'utiliser : ${line}`),
      ...(product.precautions ?? []).map((line) => `  Précaution d'emploi : ${line}`),
      "",
    ]),
    ...(address || phone ? [`${pharmacy}`, ...(address ? [address] : []), ...(phone ? [`Téléphone : ${phone}`] : []), ""] : []),
    closing,
    "",
    consent,
  ].join("\n");

  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";
  const DARK = "#0B3B47";
  const icon = (name: string, size = 22) => `<img src="${escape(asset(`/email/icone-${name}.png`))}" width="${size}" height="${size}" alt="" style="display:block;width:${size}px;height:${size}px;border:0">`;
  const city = clean(details.city);

  // Une colonne d'une carte produit : icône, titre, lignes. Rien quand il n'y a rien à dire.
  const column = (iconName: string, title: string, titleColor: string, body: string[]) =>
    body.length
      ? `<td class="stack" valign="top" style="padding:0 5px 10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F9F7;border-radius:12px"><tr><td style="padding:12px 12px 13px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="middle" style="padding-right:8px">${icon(iconName, 20)}</td><td valign="middle" style="font-size:14px;line-height:19px;font-weight:700;color:${titleColor}">${title}</td></tr></table>
${body.map((line) => `<div style="margin-top:6px;font-size:13.5px;line-height:20px;color:#475467">${escape(line)}</div>`).join("")}
</td></tr></table></td>`
      : "";

  const card = (product: ReportProduct) => {
    const image = emailImageUrl(product.imageUrl, base);
    const visual = image
      ? `<img src="${escape(image)}" width="132" height="132" alt="" style="display:block;width:132px;height:132px;object-fit:contain;border:0">`
      : `<table role="presentation" width="132" height="132" cellpadding="0" cellspacing="0"><tr><td align="center" valign="middle">${icon("produits", 44)}</td></tr></table>`;
    const columns = [
      column("pourquoi", "Pourquoi ce produit ?", DARK, product.benefits ?? []),
      column("utiliser", "Comment l'utiliser ?", DARK, product.usage ?? []),
      column("precaution", "Précautions", "#B42318", product.precautions ?? []),
    ].join("");
    return `<tr><td style="padding:0 0 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #E4ECE9;border-radius:16px"><tr>
<td class="stack center" width="150" valign="top" style="padding:16px 0 16px 16px"><table role="presentation" width="148" cellpadding="0" cellspacing="0" style="background:#F4F8F7;border-radius:14px"><tr><td align="center" valign="middle" style="padding:8px">${visual}</td></tr></table></td>
<td class="stack" valign="top" style="padding:16px 16px 6px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td valign="top" style="font-size:19px;line-height:25px;font-weight:800;color:#101828">${escape(product.name)}</td>
<td class="hide-sm" valign="top" align="right" style="padding-left:10px;white-space:nowrap"><span style="display:inline-block;padding:4px 12px;border-radius:999px;background:#E3F4EC;color:#0B6B4F;font-size:12.5px;line-height:18px;font-weight:600">Conseillé aujourd'hui</span></td>
</tr></table>
${product.reason ? `<div style="margin-top:6px;font-size:14.5px;line-height:22px;color:#475467">${escape(product.reason)}</div>` : ""}
${columns ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px"><tr>${columns}</tr></table>` : ""}
</td></tr></table></td></tr>`;
  };

  const gestures = ["Utilisez les produits selon les conseils de votre pharmacien.", "N'hésitez pas à nous recontacter en cas de question.", "En cas de doute ou de persistance des symptômes, demandez conseil à un professionnel de santé."];
  const gesturesRow = `<tr><td class="pad" style="padding:6px 32px 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_HERO_BACKGROUND};border-radius:16px"><tr><td style="padding:16px 18px 6px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="middle" style="padding-right:8px">${icon("feuille", 22)}</td><td valign="middle" style="font-size:17px;font-weight:800;color:${DARK}">Les bons gestes à retenir</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px"><tr>
${gestures.map((line) => `<td class="stack" valign="top" width="33%" style="padding:6px 8px 12px 0"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="top" style="padding:1px 8px 0 0">${icon("coche", 20)}</td><td valign="top" style="font-size:13.5px;line-height:20px;color:#344054">${escape(line)}</td></tr></table></td>`).join("")}
</tr></table></td></tr></table></td></tr>`;

  const button = (href: string, label: string, primary: boolean, iconName: string) =>
    `<td class="btn" style="padding:0 8px 8px 0"><a href="${escape(href)}" style="display:inline-block;padding:12px 18px;border-radius:12px;font-size:15px;font-weight:700;text-decoration:none;white-space:nowrap;${primary ? `background:${brand};color:${ink};border:1px solid ${brand}` : `background:#ffffff;color:#101828;border:1px solid #B9C7C2`}"><img src="${escape(asset(`/email/icone-${iconName}.png`))}" width="16" height="16" alt="" style="display:inline-block;width:16px;height:16px;vertical-align:-3px;margin-right:8px;border:0">${label}</a></td>`;
  const buttons = [tel ? button(tel, "Appeler ma pharmacie", true, ink === "#FFFFFF" ? "appel" : "itineraire") : "", maps ? button(maps, "Itinéraire", false, "itineraire") : ""].join("");
  const contact = `<tr><td class="pad" style="padding:0 32px 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F9F7;border-radius:16px">
<tr><td style="padding:18px 18px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td class="stack" valign="top" style="padding-bottom:10px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="top" style="padding:2px 12px 0 0">${icon("lieu", 30)}</td><td valign="top">
<div style="font-size:16px;font-weight:800;color:#101828">Votre pharmacie</div>
<div style="margin-top:4px;font-size:14.5px;line-height:21px;font-weight:700;color:#344054">${escape(pharmacy)}</div>
${address ? `<div style="font-size:14px;line-height:21px;color:#475467">${escape(address)}</div>` : ""}${phone ? `<div style="font-size:14px;line-height:21px;color:#475467">${escape(phone)}</div>` : ""}
</td></tr></table></td>
${buttons ? `<td class="stack" valign="middle" align="right" style="padding-bottom:10px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${buttons}</tr></table></td>` : ""}
</tr></table></td></tr>
<tr><td style="padding:0 18px 16px"><table role="presentation" cellpadding="0" cellspacing="0" style="border-top:1px solid #E1EAE6;width:100%"><tr><td valign="middle" width="32" style="padding:12px 8px 0 0">${icon("feuille", 24)}</td><td valign="middle" style="padding-top:12px;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:15.5px;line-height:22px;color:${DARK}">Toute l'équipe de ${escape(pharmacy)} reste à votre écoute !</td></tr></table></td></tr>
</table></td></tr>`;

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escape(subject)}</title>
<style>
@media only screen and (max-width:620px){
  .stack{display:block!important;width:100%!important;box-sizing:border-box}
  .center{text-align:center!important}
  .center table{margin:0 auto}
  .hide-sm{display:none!important}
  .pad{padding-left:14px!important;padding-right:14px!important}
  .hero-text{padding:22px 20px 8px!important}
  .btn{display:inline-block!important}
}
</style></head>
<body style="margin:0;padding:0;background:#EEF3F1;font-family:${font};color:#101828;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">Votre bilan personnalisé : les produits conseillés aujourd'hui par ${escape(pharmacy)}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF3F1"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #DFE8E4">

<tr><td class="pad" style="padding:22px 32px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td class="stack" valign="middle"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td valign="middle" style="padding-right:14px"><img src="${escape(logo ?? asset("/email/croix-pharmacie.png"))}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;border-radius:12px;object-fit:contain;border:0"></td>
<td valign="middle"><div style="font-size:24px;line-height:30px;font-weight:800;color:${DARK}">${escape(pharmacy)}</div>${city ? `<div style="margin-top:2px;font-size:11.5px;letter-spacing:.22em;text-transform:uppercase;color:#667085">${escape(city)}</div>` : ""}</td>
</tr></table></td>
${day ? `<td class="stack" valign="middle" align="right" style="padding-top:6px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="middle" style="padding-right:10px">${icon("date", 28)}</td><td valign="middle"><div style="font-size:14px;font-weight:700;color:#101828">Bilan du conseil</div><div style="font-size:13.5px;color:#475467">${escape(day)}</div></td></tr></table></td>` : ""}
</tr></table></td></tr>

<tr><td class="pad" style="padding:0 32px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_HERO_BACKGROUND};border-radius:18px"><tr>
<td class="stack hero-text" valign="top" style="padding:26px 10px 22px 28px">
<div style="font-size:28px;line-height:34px;font-weight:800;color:${DARK}">Votre bilan personnalisé</div>
<div style="margin-top:14px;font-size:16px;line-height:24px;font-weight:700;color:#101828">Bonjour,</div>
<div style="margin-top:4px;font-size:15.5px;line-height:24px;color:#344054">À la suite de votre passage à la pharmacie, retrouvez ci-dessous les produits que votre pharmacien vous a conseillés, avec quelques repères pour bien les utiliser.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;background:#D9EEE5;border-radius:12px"><tr><td valign="middle" width="30" style="padding:12px 0 12px 14px">${icon("soin", 26)}</td><td valign="middle" style="padding:12px 14px;font-size:14px;line-height:21px;color:#1D4D45">Ces conseils ont été choisis avec vous au comptoir. N'hésitez pas à nous recontacter si vous avez la moindre question.</td></tr></table>
</td>
<td class="stack center" valign="middle" width="210" align="center" style="padding:14px 18px 14px 0">
<img src="${escape(asset(REPORT_HERO_ROBOT_PATH))}" width="170" height="170" alt="Le robot PharmaBoost" style="display:block;width:170px;height:170px;margin:0 auto;border:0">
<img src="${escape(asset("/email/prenez-soin.png"))}" width="190" height="48" alt="Prenez soin de vous !" style="display:block;width:190px;height:48px;margin:0 auto;border:0">
</td></tr></table></td></tr>

<tr><td class="pad" style="padding:6px 32px 12px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="top" style="padding:2px 12px 0 0">${icon("produits", 30)}</td><td valign="top">
<div style="font-size:20px;line-height:26px;font-weight:800;color:${DARK}">Les produits conseillés par votre pharmacien</div>
<div style="margin-top:4px;font-size:14.5px;line-height:21px;color:#475467">Voici les produits que nous vous avons recommandés aujourd'hui, avec quelques conseils pour bien les utiliser.</div>
</td></tr></table></td></tr>

<tr><td class="pad" style="padding:4px 32px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${products.map(card).join("")}</table></td></tr>
${gesturesRow}
${address || phone ? contact : ""}

<tr><td class="pad" style="padding:6px 32px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #EAECF0"><tr>
<td class="stack" valign="top" width="55%" style="padding:16px 12px 0 0"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="top" style="padding:1px 8px 0 0">${icon("cadenas", 18)}</td><td valign="top" style="font-size:12px;line-height:18px;color:#667085"><strong style="color:#344054">Confidentialité</strong><br>${escape(consent)}</td></tr></table></td>
<td class="stack" valign="top" style="padding:16px 0 0"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="top" style="padding:1px 8px 0 0">${icon("info", 18)}</td><td valign="top" style="font-size:12px;line-height:18px;color:#667085">${escape(closing)}</td></tr></table></td>
</tr></table></td></tr>
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
