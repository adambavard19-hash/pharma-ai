import { escapeHtml } from "@/core/documents/email";

/**
 * Les e-mails de l'extranet commercial : invitation d'un commercial, et
 * transmission d'un contrat au titulaire. Rédigés ici, transportés par le
 * prestataire ; aucun mot de passe, aucun montant de commission n'y figure.
 */
function shell(title: string, headline: string, inner: string, color = "#111827"): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#eef1f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden">
<tr><td style="background:${color};padding:22px 28px"><div style="font-size:13px;line-height:18px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.75)">PharmaBoost</div><div style="font-size:22px;line-height:28px;font-weight:700;color:#ffffff;margin-top:4px">${escapeHtml(headline)}</div></td></tr>
<tr><td style="padding:26px 28px 28px">${inner}</td></tr></table></td></tr></table></body></html>`;
}

const button = (url: string, label: string, color = "#111827") =>
  `<a href="${escapeHtml(url)}" style="display:block;margin-top:22px;background:${color};color:#ffffff;text-decoration:none;font-size:17px;line-height:24px;font-weight:700;padding:16px 22px;border-radius:14px;text-align:center">${escapeHtml(label)}</a>`;

const dateTime = (d: Date) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(d);

export function buildSalesInvitationEmail(v: { firstName: string; url: string; expiresAt: Date }): { subject: string; text: string; html: string } {
  const text = [
    `Bonjour ${v.firstName},`,
    "",
    "Votre espace commercial PharmaBoost est prêt. Définissez votre mot de passe pour y accéder :",
    v.url,
    "",
    `Ce lien est personnel, à usage unique, et reste valable jusqu'au ${dateTime(v.expiresAt)}.`,
    "",
    "L'équipe PharmaBoost",
  ].join("\n");
  const html = shell(
    "Votre espace commercial — PharmaBoost",
    "Votre espace commercial",
    `<p style="margin:0;font-size:18px;line-height:26px;font-weight:600">Bonjour ${escapeHtml(v.firstName)},</p><p style="margin:12px 0 0;font-size:16px;line-height:25px;color:#374151">Votre espace commercial PharmaBoost est prêt. Définissez votre mot de passe pour y accéder.</p>${button(v.url, "Définir mon mot de passe")}<p style="margin:18px 0 0;font-size:13px;line-height:19px;color:#6b7280">Ce lien est personnel, à usage unique, et reste valable jusqu'au ${escapeHtml(dateTime(v.expiresAt))}.</p>`,
  );
  return { subject: "Votre espace commercial — PharmaBoost", text, html };
}

export function buildContractEmail(v: {
  ownerName: string;
  pharmacyName: string;
  salesRepName: string;
  salesRepEmail: string;
  salesRepPhone: string | null;
  url: string;
  signingUrl: string | null;
  expiresAt: Date;
}): { subject: string; text: string; html: string } {
  const text = [
    `Bonjour ${v.ownerName},`,
    "",
    `À la suite de nos échanges, vous trouverez le contrat d'abonnement PharmaBoost préparé pour ${v.pharmacyName}.`,
    `Consulter le contrat : ${v.url}`,
    ...(v.signingUrl ? [`Signer électroniquement : ${v.signingUrl}`] : ["La signature électronique vous sera proposée dans un second temps ; d'ici là, vous pouvez le lire et nous poser vos questions."]),
    "",
    `Ce lien est personnel et reste valable jusqu'au ${dateTime(v.expiresAt)}.`,
    `Votre interlocuteur : ${v.salesRepName} — ${v.salesRepEmail}${v.salesRepPhone ? ` — ${v.salesRepPhone}` : ""}`,
    "",
    "PharmaBoost",
  ].join("\n");
  const html = shell(
    `Votre contrat PharmaBoost — ${v.pharmacyName}`,
    "Votre contrat d'abonnement",
    `<p style="margin:0;font-size:18px;line-height:26px;font-weight:600">Bonjour ${escapeHtml(v.ownerName)},</p><p style="margin:12px 0 0;font-size:16px;line-height:25px;color:#374151">À la suite de nos échanges, vous trouverez le contrat d'abonnement PharmaBoost préparé pour <strong>${escapeHtml(v.pharmacyName)}</strong>.</p>${button(v.url, "Consulter le contrat", "#0F766E")}${v.signingUrl ? button(v.signingUrl, "Signer électroniquement") : `<p style="margin:16px 0 0;font-size:14px;line-height:21px;color:#374151">La signature électronique vous sera proposée dans un second temps ; d'ici là, vous pouvez le lire et nous poser vos questions.</p>`}<p style="margin:18px 0 0;font-size:13px;line-height:19px;color:#6b7280">Ce lien est personnel et reste valable jusqu'au ${escapeHtml(dateTime(v.expiresAt))}.<br>Votre interlocuteur : <strong>${escapeHtml(v.salesRepName)}</strong> — ${escapeHtml(v.salesRepEmail)}${v.salesRepPhone ? ` — ${escapeHtml(v.salesRepPhone)}` : ""}</p>`,
    "#0F766E",
  );
  return { subject: `Votre contrat PharmaBoost — ${v.pharmacyName}`, text, html };
}
