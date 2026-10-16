import { escapeHtml } from "@/core/documents/email";
import { PUBLIC_CONTACT_EMAIL } from "../../config/contact";

/**
 * Le gabarit unique des e-mails PharmaBoost envoyés aux officines, aux
 * commerciaux et à l'équipe : sobre, lisible sur mobile, robuste dans Gmail,
 * Outlook et Apple Mail (tableaux et styles en ligne, aucune feuille externe,
 * aucun emoji). Le texte brut accompagne toujours le HTML et fait foi.
 */

export const BRAND = {
  primary: "#0F766E",
  primaryDark: "#0B5C56",
  ink: "#0F172A",
  body: "#334155",
  muted: "#64748B",
  line: "#E2E8F0",
  canvas: "#F4F6F8",
  tint: "#F0FAF8",
  warning: "#B45309",
} as const;

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

export type EmailCompany = {
  legalName: string;
  /** « 10 rue de la Santé, 75013 Paris » */
  address?: string | null;
  siren?: string | null;
  contactEmail: string;
};

export type EmailContext = {
  /** URL publique de l'application, sans barre finale (https://pharmaboost.app). */
  baseUrl: string;
  /**
   * Logo hébergé publiquement (une adresse locale ne s'affiche pas dans une messagerie). L'en-tête est désormais le
   * bandeau de l'hélice d'ADN (robot et nom compris) : le logo n'y est plus dessiné ; le champ reste pour les appelants.
   */
  logoUrl?: string;
  company: EmailCompany;
};

export type EmailBlock =
  | { kind: "paragraph"; text: string; strong?: string[] }
  | { kind: "button"; url: string; label: string }
  | { kind: "details"; title?: string; rows: Array<[string, string]> }
  | { kind: "steps"; title?: string; items: string[] }
  | { kind: "note"; text: string }
  | { kind: "notice"; text: string; tone?: "info" | "warning" }
  | { kind: "link"; label: string; url: string }
  /** Deux à quatre chiffres clés côte à côte (« 12 conseils vendus »), avec, s'il y en a une, la comparaison. */
  | { kind: "stats"; items: Array<{ value: string; label: string; trend?: string | null; tone?: "up" | "down" | "flat" }> }
  /** Une courte liste à puces, avec son titre. */
  | { kind: "list"; title?: string; items: string[] }
  /** Une image (https), pleine largeur de la carte : le visuel d'une offre partenaire. */
  | { kind: "image"; url: string; alt: string };

export type EmailContent = {
  subject: string;
  /** Aperçu affiché par la messagerie à côté de l'objet. */
  preheader: string;
  /** Petit libellé au-dessus du titre (« Contrat d'abonnement »). */
  eyebrow?: string;
  title: string;
  greeting?: string;
  blocks: EmailBlock[];
  signature?: string;
  /** Pourquoi ce message : affiché en pied de page. */
  reason?: string;
  /**
   * Message promotionnel : l'adresse où le destinataire cesse de recevoir ces
   * offres, dite en pied de page. Sans elle, le pied de page reste celui d'un
   * message de service.
   */
  unsubscribeUrl?: string | null;
  /** Le libellé de ce lien (« Ne plus recevoir ce résumé ») ; par défaut « Ne plus recevoir ces offres ». */
  unsubscribeLabel?: string;
};

export type RenderedEmail = { subject: string; text: string; html: string };

function emphasize(text: string, strong: string[] = []): string {
  let html = escapeHtml(text);
  for (const word of strong) {
    const safe = escapeHtml(word);
    if (safe) html = html.split(safe).join(`<strong style="color:${BRAND.ink};font-weight:600">${safe}</strong>`);
  }
  return html;
}

function blockHtml(block: EmailBlock): string {
  switch (block.kind) {
    case "paragraph":
      return `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:26px;color:${BRAND.body}">${emphasize(block.text, block.strong)}</p>`;
    case "button":
      // Bouton « à l'épreuve des balles » : une cellule colorée, lisible même sans CSS.
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr><td align="center" bgcolor="${BRAND.primary}" style="border-radius:8px;background:${BRAND.primary}"><a href="${escapeHtml(block.url)}" target="_blank" style="display:inline-block;padding:15px 28px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px">${escapeHtml(block.label)}</a></td></tr></table>`;
    case "details":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;border:1px solid ${BRAND.line};border-radius:8px;border-collapse:separate">${block.title ? `<tr><td colspan="2" style="padding:14px 18px 6px;font-family:${FONT};font-size:12px;line-height:16px;letter-spacing:.06em;text-transform:uppercase;color:${BRAND.muted}">${escapeHtml(block.title)}</td></tr>` : ""}${block.rows
        .map(
          ([label, value], i) =>
            `<tr><td valign="top" style="padding:${i === 0 && !block.title ? 14 : 8}px 12px ${i === block.rows.length - 1 ? 14 : 8}px 18px;font-family:${FONT};font-size:14px;line-height:20px;color:${BRAND.muted};width:38%">${escapeHtml(label)}</td><td valign="top" style="padding:${i === 0 && !block.title ? 14 : 8}px 18px ${i === block.rows.length - 1 ? 14 : 8}px 0;font-family:${FONT};font-size:14px;line-height:20px;color:${BRAND.ink};font-weight:600">${escapeHtml(value)}</td></tr>`,
        )
        .join("")}</table>`;
    case "steps":
      return `${block.title ? `<p style="margin:0 0 10px;font-family:${FONT};font-size:15px;line-height:22px;font-weight:600;color:${BRAND.ink}">${escapeHtml(block.title)}</p>` : ""}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px">${block.items
        .map(
          (item, i) =>
            `<tr><td valign="top" style="width:30px;padding:0 0 10px"><div style="width:22px;height:22px;border-radius:11px;background:${BRAND.tint};color:${BRAND.primary};font-family:${FONT};font-size:12px;line-height:22px;font-weight:700;text-align:center">${i + 1}</div></td><td valign="top" style="padding:1px 0 10px;font-family:${FONT};font-size:15px;line-height:22px;color:${BRAND.body}">${escapeHtml(item)}</td></tr>`,
        )
        .join("")}</table>`;
    case "note":
      return `<p style="margin:0 0 16px;font-family:${FONT};font-size:13px;line-height:20px;color:${BRAND.muted}">${escapeHtml(block.text)}</p>`;
    case "notice": {
      const color = block.tone === "warning" ? BRAND.warning : BRAND.primary;
      const bg = block.tone === "warning" ? "#FFF8EB" : BRAND.tint;
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px"><tr><td style="background:${bg};border-left:3px solid ${color};border-radius:4px;padding:12px 16px;font-family:${FONT};font-size:14px;line-height:21px;color:${BRAND.ink}">${escapeHtml(block.text)}</td></tr></table>`;
    }
    case "image":
      return /^https:\/\//.test(block.url) ? `<img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt)}" width="536" style="display:block;width:100%;max-width:536px;height:auto;border:0;border-radius:12px;margin:0 0 20px">` : "";
    case "link":
      return `<p style="margin:0 0 16px;font-family:${FONT};font-size:13px;line-height:20px;color:${BRAND.muted}">${escapeHtml(block.label)}<br><a href="${escapeHtml(block.url)}" style="color:${BRAND.primary};word-break:break-all">${escapeHtml(block.url)}</a></p>`;
    case "stats": {
      // Une cellule par chiffre ; sur un téléphone étroit, la table se resserre sans casser (largeurs en pourcentage).
      const width = Math.floor(100 / Math.max(1, block.items.length));
      const trendColor = (tone?: "up" | "down" | "flat") => (tone === "up" ? BRAND.primary : tone === "down" ? BRAND.warning : BRAND.muted);
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border-collapse:separate;border-spacing:0"><tr>${block.items
        .map(
          (item, i) =>
            `<td valign="top" width="${width}%" style="width:${width}%;padding:14px 12px;background:${BRAND.tint};${i === 0 ? "border-radius:8px 0 0 8px;" : ""}${i === block.items.length - 1 ? "border-radius:0 8px 8px 0;" : ""}${i > 0 ? "border-left:2px solid #FFFFFF;" : ""}"><div style="font-family:${FONT};font-size:24px;line-height:30px;font-weight:700;color:${BRAND.ink};letter-spacing:-.01em">${escapeHtml(item.value)}</div><div style="margin-top:2px;font-family:${FONT};font-size:12.5px;line-height:17px;color:${BRAND.body}">${escapeHtml(item.label)}</div>${item.trend ? `<div style="margin-top:4px;font-family:${FONT};font-size:12px;line-height:16px;font-weight:600;color:${trendColor(item.tone)}">${escapeHtml(item.trend)}</div>` : ""}</td>`,
        )
        .join("")}</tr></table>`;
    }
    case "list":
      return `${block.title ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:15px;line-height:22px;font-weight:600;color:${BRAND.ink}">${escapeHtml(block.title)}</p>` : ""}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px">${block.items
        .map((item) => `<tr><td valign="top" style="width:18px;padding:0 0 6px;font-family:${FONT};font-size:15px;line-height:22px;color:${BRAND.primary}">&#8226;</td><td valign="top" style="padding:0 0 6px;font-family:${FONT};font-size:15px;line-height:22px;color:${BRAND.body}">${escapeHtml(item)}</td></tr>`)
        .join("")}</table>`;
  }
}

function blockText(block: EmailBlock): string {
  switch (block.kind) {
    case "paragraph":
    case "note":
    case "notice":
      return block.text;
    case "button":
      return `${block.label} : ${block.url}`;
    case "details":
      return [block.title ? `${block.title} :` : null, ...block.rows.map(([l, v]) => `- ${l} : ${v}`)].filter(Boolean).join("\n");
    case "steps":
      return [block.title ? `${block.title} :` : null, ...block.items.map((item, i) => `${i + 1}. ${item}`)].filter(Boolean).join("\n");
    case "image":
      return "";
    case "link":
      return `${block.label}\n${block.url}`;
    case "stats":
      return block.items.map((item) => `- ${item.label} : ${item.value}${item.trend ? ` (${item.trend})` : ""}`).join("\n");
    case "list":
      return [block.title ? `${block.title} :` : null, ...block.items.map((item) => `• ${item}`)].filter(Boolean).join("\n");
  }
}

export const DEFAULT_EMAIL_CONTEXT: EmailContext = {
  baseUrl: "https://pharmaboost.app",
  company: { legalName: "PharmaBoost", contactEmail: PUBLIC_CONTACT_EMAIL },
};

/** Le site public : là où sont servies les images des e-mails quand l'adresse de l'application n'est pas publique. */
const PUBLIC_SITE = "https://pharmaboost.app";

/**
 * Le bandeau d'en-tête : l'hélice d'ADN vivante des pages de connexion, filmée en GIF (scripts/email-bandeau-adn.ts),
 * le robot et « PharmaBoost » dessinés dedans. Gmail, Apple Mail et iOS l'animent ; Outlook bureau, qui ne montre que la
 * première image d'un GIF, reçoit l'image fixe en 2× (commentaires conditionnels « mso »). Toujours en adresse absolue
 * https : depuis un poste de développement (http://localhost), les images viennent du site public.
 */
export const EMAIL_BANNER = {
  gif: "/email/bandeau-adn.gif",
  png: "/email/bandeau-adn.png",
  alt: "PharmaBoost — le copilote intelligent de l'officine",
  width: 600,
  height: 200,
} as const;

export function emailBannerUrls(baseUrl: string): { gif: string; png: string } {
  const base = baseUrl.replace(/\/+$/, "");
  const origin = /^https:\/\//.test(base) ? base : PUBLIC_SITE;
  return { gif: `${origin}${EMAIL_BANNER.gif}`, png: `${origin}${EMAIL_BANNER.png}` };
}

function bannerHtml(baseUrl: string): string {
  const { gif, png } = emailBannerUrls(baseUrl);
  const alt = escapeHtml(EMAIL_BANNER.alt);
  // Le texte de remplacement prend la place de l'image quand la messagerie bloque les images : sur le menthe, en vert profond.
  const style = `display:block;width:100%;max-width:${EMAIL_BANNER.width}px;height:auto;border:0;outline:none;text-decoration:none;border-radius:12px;background:#EFF4F2;font-family:${FONT};font-size:20px;line-height:28px;font-weight:700;color:#054038`;
  const img = (src: string) => `<img src="${escapeHtml(src)}" width="${EMAIL_BANNER.width}" height="${EMAIL_BANNER.height}" alt="${alt}" style="${style}">`;
  return `<!--[if mso]>${img(png)}<![endif]--><!--[if !mso]><!-->${img(gif)}<!--<![endif]-->`;
}

export type FrameInput = { subject: string; preheader?: string; eyebrow?: string; title: string; bodyHtml: string; reason?: string; unsubscribeUrl?: string | null; unsubscribeLabel?: string };

/** L'enveloppe commune : en-tête, carte, pied de page légal. Le corps est déjà en HTML. */
export function emailFrame(ctx: EmailContext, input: FrameInput): string {
  const base = ctx.baseUrl.replace(/\/+$/, "");
  const legal = `${base}/decouvrir/mentions-legales`;
  const privacy = `${base}/decouvrir/confidentialite`;
  const companyLine = [ctx.company.legalName, ctx.company.address, ctx.company.siren ? `SIREN ${ctx.company.siren}` : null].filter(Boolean).join(" · ");
  return `<!doctype html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(input.subject)}</title>
<style>
  @media (max-width:620px){ .pb-card{border-radius:0!important} .pb-pad{padding-left:22px!important;padding-right:22px!important} .pb-title{font-size:22px!important;line-height:30px!important} .pb-banner img{border-radius:0!important} }
  a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.canvas};-webkit-text-size-adjust:100%">
${input.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BRAND.canvas}">${escapeHtml(input.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.canvas}" style="background:${BRAND.canvas}">
<tr><td align="center" style="padding:32px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
    <tr><td class="pb-banner" style="padding:0 0 16px">${bannerHtml(base)}</td></tr>
    <tr><td class="pb-card" bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:12px;border:1px solid ${BRAND.line};border-top:4px solid ${BRAND.primary}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td class="pb-pad" style="padding:34px 40px 22px">
          ${input.eyebrow ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:12px;line-height:16px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;color:${BRAND.primary}">${escapeHtml(input.eyebrow)}</p>` : ""}
          <h1 class="pb-title" style="margin:0 0 22px;font-family:${FONT};font-size:24px;line-height:32px;font-weight:700;color:${BRAND.ink};letter-spacing:-.01em">${escapeHtml(input.title)}</h1>
          ${input.bodyHtml}
        </td></tr>
      </table>
    </td></tr>
    <tr><td class="pb-pad" style="padding:22px 16px 0;font-family:${FONT};font-size:12px;line-height:19px;color:${BRAND.muted}">
      ${input.reason ? `<p style="margin:0 0 10px">${escapeHtml(input.reason)}</p>` : ""}${input.unsubscribeUrl ? `<p style="margin:0 0 10px">${escapeHtml(input.unsubscribeLabel ?? "Ne plus recevoir ces offres")} : <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:${BRAND.muted}">me désinscrire</a></p>` : ""}
      <p style="margin:0 0 10px">Une question ? Écrivez-nous à <a href="mailto:${escapeHtml(ctx.company.contactEmail)}" style="color:${BRAND.primary};text-decoration:none">${escapeHtml(ctx.company.contactEmail)}</a>.</p>
      <p style="margin:0 0 10px">${escapeHtml(companyLine)}</p>
      <p style="margin:0"><a href="${escapeHtml(legal)}" style="color:${BRAND.muted}">Mentions légales</a> &nbsp;·&nbsp; <a href="${escapeHtml(privacy)}" style="color:${BRAND.muted}">Confidentialité</a></p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

export function renderEmail(ctx: EmailContext, content: EmailContent): RenderedEmail {
  const base = ctx.baseUrl.replace(/\/+$/, "");
  const signature = content.signature ?? "L'équipe PharmaBoost";
  const companyLine = [ctx.company.legalName, ctx.company.address, ctx.company.siren ? `SIREN ${ctx.company.siren}` : null].filter(Boolean).join(" · ");
  const bodyHtml = [
    content.greeting ? `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:26px;color:${BRAND.ink}">${escapeHtml(content.greeting)}</p>` : "",
    ...content.blocks.map(blockHtml),
    `<p style="margin:8px 0 8px;font-family:${FONT};font-size:16px;line-height:26px;color:${BRAND.body}">${escapeHtml(signature)}</p>`,
  ].join("\n");
  const html = emailFrame(ctx, { subject: content.subject, preheader: content.preheader, eyebrow: content.eyebrow, title: content.title, bodyHtml, reason: content.reason, unsubscribeUrl: content.unsubscribeUrl, unsubscribeLabel: content.unsubscribeLabel });

  const text = [
    content.title,
    "",
    ...(content.greeting ? [content.greeting, ""] : []),
    ...content.blocks.flatMap((b) => [blockText(b), ""]),
    signature,
    "",
    "—",
    ...(content.reason ? [content.reason] : []),
    ...(content.unsubscribeUrl ? [`${content.unsubscribeLabel ?? "Ne plus recevoir ces offres"} : ${content.unsubscribeUrl}`] : []),
    `Contact : ${ctx.company.contactEmail}`,
    companyLine,
    `Mentions légales : ${base}/decouvrir/mentions-legales`,
  ].join("\n");

  return { subject: content.subject, text, html };
}

/** Bouton seul, pour les gabarits qui composent leur HTML. */
export function emailButtonHtml(url: string, label: string): string {
  return blockHtml({ kind: "button", url, label });
}

/** 249,00 € HT */
export function eurosHt(cents: number): string {
  return `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € HT`;
}

/** « 30 jours offerts » → « Premier mois offert » quand c'est le cas. */
export function trialLabel(trialDays: number): string | null {
  if (!trialDays || trialDays <= 0) return null;
  if (trialDays >= 28 && trialDays <= 31) return "Premier mois offert";
  return `${trialDays} jours offerts`;
}
