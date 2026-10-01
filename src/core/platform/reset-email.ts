import { DEFAULT_EMAIL_CONTEXT, emailButtonHtml, emailFrame } from "./email-layout";
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

  const html = emailFrame(DEFAULT_EMAIL_CONTEXT, {
    subject: "Définissez votre mot de passe — PharmaBoost",
    preheader: "Votre espace administrateur PharmaBoost est prêt.",
    eyebrow: "Espace administrateur",
    title: "Définissez votre mot de passe",
    bodyHtml: `<p style="margin:0 0 16px;font-size:16px;line-height:26px;color:#0F172A">Bonjour ${escapeHtml(v.fullName)},</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:26px;color:#334155">Votre espace administrateur est prêt. Définissez votre mot de passe pour y accéder.</p>
    ${emailButtonHtml(v.url, "Définir mon mot de passe")}
    <p style="margin:0;font-size:13px;line-height:20px;color:#64748B">Ce lien est personnel, à usage unique, et reste valable jusqu'au ${escapeHtml(until)}.<br>Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : rien ne sera modifié.</p>
    <p style="margin:10px 0 0;font-size:12px;line-height:18px;color:#94A3B8">Ou copiez ce lien : ${escapeHtml(v.url)}</p>`,
  });

  return { subject: "Définissez votre mot de passe — PharmaBoost", text, html };
}
