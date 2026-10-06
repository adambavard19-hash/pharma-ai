import { escapeHtml } from "@/core/documents/email";
import { TIME_ZONE } from "@/config/constants";
import { DEFAULT_EMAIL_CONTEXT, emailButtonHtml, emailFrame } from "./email-layout";

/**
 * Les e-mails de l'extranet commercial : invitation d'un commercial, et
 * transmission d'un contrat au titulaire. Rédigés ici, transportés par le
 * prestataire ; aucun mot de passe, aucun montant de commission n'y figure.
 */
/**
 * L'enveloppe commune des e-mails de la plateforme : elle délègue au gabarit
 * PharmaBoost (logo, carte, pied de page légal). La couleur reste acceptée
 * pour compatibilité ; le gabarit garde une identité unique.
 */
export function shell(title: string, headline: string, inner: string, _color = "#111827"): string {
  void _color;
  return emailFrame(DEFAULT_EMAIL_CONTEXT, { subject: title, title: headline, bodyHtml: inner });
}

export const button = (url: string, label: string, _color = "#111827") => {
  void _color;
  return emailButtonHtml(url, label);
};

export const dateTime = (d: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(d);

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

/**
 * L'e-mail du directeur commercial : invitation à la création de son espace,
 * ou (`kind: "reset"`) lien pour changer un mot de passe oublié. Le lien est
 * personnel, à usage unique et daté ; ni mot de passe ni montant n'y figure.
 */
export function buildDirectorInvitationEmail(v: { firstName: string; url: string; expiresAt: Date; kind?: "invitation" | "reset" }): { subject: string; text: string; html: string } {
  const reset = v.kind === "reset";
  const subject = reset ? "Réinitialiser votre mot de passe — PharmaBoost" : "Votre espace de direction commerciale — PharmaBoost";
  const headline = reset ? "Réinitialiser votre mot de passe" : "Votre espace de direction commerciale";
  const intro = reset
    ? "Vous avez demandé à réinitialiser votre mot de passe. Choisissez-en un nouveau avec le lien ci-dessous."
    : "Votre espace de direction commerciale PharmaBoost est prêt. Définissez votre mot de passe pour y accéder. Vous y suivrez vos commerciaux, leurs dossiers, leurs commissions et leurs challenges.";
  const action = reset ? "Choisir un nouveau mot de passe" : "Définir mon mot de passe";
  const until = dateTime(v.expiresAt);
  const ignore = "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : rien ne sera modifié.";
  const text = [
    `Bonjour ${v.firstName},`,
    "",
    intro,
    v.url,
    "",
    `Ce lien est personnel, à usage unique, et reste valable jusqu'au ${until}.`,
    ...(reset ? [ignore] : []),
    "",
    "L'équipe PharmaBoost",
  ].join("\n");
  const html = shell(
    subject,
    headline,
    `<p style="margin:0;font-size:18px;line-height:26px;font-weight:600">Bonjour ${escapeHtml(v.firstName)},</p><p style="margin:12px 0 0;font-size:16px;line-height:25px;color:#374151">${escapeHtml(intro)}</p>${button(v.url, action)}<p style="margin:18px 0 0;font-size:13px;line-height:19px;color:#6b7280">Ce lien est personnel, à usage unique, et reste valable jusqu'au ${escapeHtml(until)}.${reset ? `<br>${escapeHtml(ignore)}` : ""}</p>`,
  );
  return { subject, text, html };
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
