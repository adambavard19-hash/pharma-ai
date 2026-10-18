import { escapeHtml } from "@/core/documents/email";
import { button, shell } from "@/core/platform/sales-emails";
import { DEFAULT_EMAIL_CONTEXT, renderEmail, type EmailContext } from "@/core/platform/email-layout";

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

export function buildSupportReplyEmail(v: SupportReplyInput, ctx: EmailContext = DEFAULT_EMAIL_CONTEXT): { subject: string; text: string; html: string } {
  return renderEmail(ctx, {
    website: true,
    subject: `PharmaBoost vous a répondu — ${v.subject}`,
    preheader: v.excerpt.slice(0, 120),
    eyebrow: "Contact support",
    title: "PharmaBoost vous a répondu",
    greeting: `Bonjour ${v.firstName},`,
    blocks: [
      { kind: "paragraph", text: `L'équipe PharmaBoost a répondu à votre question « ${v.subject} » :`, strong: [v.subject] },
      { kind: "notice", text: v.excerpt },
      { kind: "button", url: v.supportUrl, label: "Lire la réponse" },
      { kind: "note", text: "Pour continuer la discussion, répondez depuis PharmaBoost, menu « Contact support »." },
    ],
    reason: "Vous recevez ce message parce que vous avez écrit au support PharmaBoost.",
  });
}
