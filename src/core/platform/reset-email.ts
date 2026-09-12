import { escapeHtml } from "@/core/documents/email";
import { TIME_ZONE } from "@/config/constants";

/**
 * L'e-mail « Définissez votre mot de passe » de la console PharmaBoost.
 *
 * Écrit ici, dans le domaine, comme les autres messages : le prestataire
 * transporte, il ne compose pas. Le lien est à usage unique et daté ; le
 * message ne contient ni mot de passe ni identifiant de session.
 */
export type AdminPasswordEmailVariables = {
  fullName: string;
  url: string;
  expiresAt: Date;
};

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function buildAdminPasswordEmail(v: AdminPasswordEmailVariables): { subject: string; text: string; html: string } {
  const until = formatDateTime(v.expiresAt);
  const text = [
    `Bonjour ${v.fullName},`,
    "",
    "Votre espace administrateur PharmaBoost est prêt. Définissez votre mot de passe en ouvrant ce lien :",
    v.url,
    "",
    `Ce lien est personnel, à usage unique, et reste valable jusqu'au ${until}.`,
    "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : rien ne sera modifié.",
    "",
    "PharmaBoost",
  ].join("\n");

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Définissez votre mot de passe — PharmaBoost</title></head>
<body style="margin:0;padding:0;background:#eef1f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden">
  <tr><td style="background:#111827;padding:22px 28px">
    <div style="font-size:13px;line-height:18px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.75)">PharmaBoost</div>
    <div style="font-size:22px;line-height:28px;font-weight:700;color:#ffffff;margin-top:4px">Votre espace administrateur</div>
  </td></tr>
  <tr><td style="padding:26px 28px 0">
    <p style="margin:0;font-size:18px;line-height:26px;font-weight:600">Bonjour ${escapeHtml(v.fullName)},</p>
    <p style="margin:12px 0 0;font-size:16px;line-height:25px;color:#374151">Votre espace administrateur est prêt. Définissez votre mot de passe pour y accéder.</p>
  </td></tr>
  <tr><td style="padding:24px 28px 0" align="center">
    <a href="${escapeHtml(v.url)}" style="display:block;background:#111827;color:#ffffff;text-decoration:none;font-size:17px;line-height:24px;font-weight:700;padding:16px 22px;border-radius:14px;text-align:center">Définir mon mot de passe</a>
  </td></tr>
  <tr><td style="padding:22px 28px 26px">
    <p style="margin:0;font-size:13px;line-height:19px;color:#6b7280">Ce lien est personnel, à usage unique, et reste valable jusqu'au ${escapeHtml(until)}.<br>Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : rien ne sera modifié.</p>
    <p style="margin:12px 0 0;font-size:12px;line-height:18px;color:#9ca3af">Ou copiez ce lien : ${escapeHtml(v.url)}</p>
  </td></tr>
</table></td></tr></table>
</body></html>`;

  return { subject: "Définissez votre mot de passe — PharmaBoost", text, html };
}
