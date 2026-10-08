import { escapeHtml } from "@/core/documents/email";
import { button, shell } from "@/core/platform/sales-emails";

/**
 * Les e-mails du support : l'alerte à l'équipe quand une officine écrit, et la notification à l'officine quand l'équipe
 * répond. Rédigés ici, transportés par le prestataire. Un extrait seulement du message : la discussion se lit dans la
 * console ou dans PharmaBoost, pas dans une boîte mail.
 */

export type SupportAlertInput = {
  pharmacyName: string;
  city: string | null;
  authorName: string;
  subject: string;
  topicLabel: string;
  excerpt: string;
  /** Première question de la discussion, ou message de plus. */
  isNewThread: boolean;
  /** Une réponse à un message de l'équipe, plutôt qu'un message de plus. */
  isReply: boolean;
  adminUrl: string;
};

export function buildSupportAlertEmail(v: SupportAlertInput): { subject: string; text: string; html: string } {
  const place = v.city ? `${v.pharmacyName} (${v.city})` : v.pharmacyName;
  const headline = v.isNewThread ? `${place} vous a posé une question` : v.isReply ? `${place} vous a répondu` : `${place} a ajouté un message`;
  const subject = `${v.isNewThread ? "Nouvelle question" : v.isReply ? "Réponse" : "Nouveau message"} de ${v.pharmacyName} — ${v.subject}`;
  const text = [`${headline}.`, "", `Sujet : ${v.subject}`, `Type : ${v.topicLabel}`, `De : ${v.authorName}`, "", v.excerpt, "", `Répondre : ${v.adminUrl}`].join("\n");
  const html = shell(
    subject,
    headline,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:15px;line-height:23px;color:#374151"><tr><td style="padding:2px 14px 2px 0;color:#6b7280;vertical-align:top">Sujet</td><td style="padding:2px 0">${escapeHtml(v.subject)}</td></tr><tr><td style="padding:2px 14px 2px 0;color:#6b7280;vertical-align:top">Type</td><td style="padding:2px 0">${escapeHtml(v.topicLabel)}</td></tr><tr><td style="padding:2px 14px 2px 0;color:#6b7280;vertical-align:top">De</td><td style="padding:2px 0">${escapeHtml(v.authorName)}</td></tr></table><blockquote style="margin:16px 0 0;padding:12px 16px;border-left:3px solid #0F766E;background:#f3f4f6;font-size:15px;line-height:23px;color:#374151;white-space:pre-line">${escapeHtml(v.excerpt)}</blockquote>${button(v.adminUrl, "Répondre dans la console")}`,
    "#0F766E",
  );
  return { subject, text, html };
}

export type SupportReplyInput = {
  firstName: string;
  subject: string;
  excerpt: string;
  supportUrl: string;
};

export function buildSupportReplyEmail(v: SupportReplyInput): { subject: string; text: string; html: string } {
  const subject = `PharmaBoost vous a répondu — ${v.subject}`;
  const text = [`Bonjour ${v.firstName},`, "", "L'équipe PharmaBoost a répondu à votre question :", "", `« ${v.excerpt} »`, "", `Lire la réponse et continuer la discussion : ${v.supportUrl}`, "", "Vous retrouvez toutes vos discussions dans PharmaBoost, menu « Contact support ».", "", "L'équipe PharmaBoost"].join("\n");
  const html = shell(
    subject,
    "PharmaBoost vous a répondu",
    `<p style="margin:0;font-size:18px;line-height:26px;font-weight:600">Bonjour ${escapeHtml(v.firstName)},</p><p style="margin:12px 0 0;font-size:16px;line-height:25px;color:#374151">L'équipe PharmaBoost a répondu à votre question « ${escapeHtml(v.subject)} » :</p><blockquote style="margin:16px 0 0;padding:12px 16px;border-left:3px solid #0F766E;background:#f3f4f6;font-size:15px;line-height:23px;color:#374151;white-space:pre-line">${escapeHtml(v.excerpt)}</blockquote>${button(v.supportUrl, "Lire la réponse")}<p style="margin:18px 0 0;font-size:13px;line-height:19px;color:#6b7280">Pour continuer la discussion, répondez depuis PharmaBoost, menu « Contact support ».</p>`,
    "#0F766E",
  );
  return { subject, text, html };
}
