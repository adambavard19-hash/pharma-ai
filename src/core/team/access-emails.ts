import { DEFAULT_EMAIL_CONTEXT, emailButtonHtml, emailFrame } from "@/core/platform/email-layout";
import { escapeHtml } from "@/core/documents/email";
import { TIME_ZONE } from "@/config/constants";

/**
 * Les messages de l'entrée dans une officine : l'invitation du titulaire, l'alerte quand un collaborateur demande à rejoindre, la réponse du
 * titulaire. Aucun ne contient de mot de passe ; les liens sont personnels et datés.
 */

type Message = { subject: string; text: string; html: string };

const day = (date: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, day: "numeric", month: "long" }).format(date);
const greet = (firstName: string | null) => (firstName ? `Bonjour ${firstName},` : "Bonjour,");
const para = (text: string) => `<p style="margin:0 0 16px;font-size:16px;line-height:26px;color:#334155">${escapeHtml(text)}</p>`;
const hello = (firstName: string | null) => `<p style="margin:0 0 16px;font-size:16px;line-height:26px;color:#0F172A">${escapeHtml(greet(firstName))}</p>`;

export function buildTeamInvitationEmail(v: { firstName: string | null; pharmacyName: string; inviterName: string; roleLabel: string; url: string; expiresAt: Date }): Message {
  const subject = `${v.inviterName} vous invite à rejoindre ${v.pharmacyName} sur PharmaBoost`;
  const intro = `${v.inviterName} vous a ouvert un accès à PharmaBoost pour ${v.pharmacyName}, en tant que ${v.roleLabel}. Créez votre compte en une minute :`;
  const text = [greet(v.firstName), "", intro, v.url, "", `Ce lien est personnel, à usage unique, et reste valable jusqu'au ${day(v.expiresAt)}. Vous choisirez votre mot de passe vous-même.`, "Si vous ne connaissez pas cette officine, ignorez ce message : rien ne sera créé.", "", "L'équipe PharmaBoost"].join("\n");
  const html = emailFrame(DEFAULT_EMAIL_CONTEXT, {
    subject,
    preheader: `Créez votre compte pour rejoindre ${v.pharmacyName}.`,
    eyebrow: v.pharmacyName,
    title: "Vous êtes invité(e) sur PharmaBoost",
    bodyHtml: `${hello(v.firstName)}${para(intro)}${emailButtonHtml(v.url, "Créer mon compte")}
    <p style="margin:18px 0 0;font-size:13px;line-height:20px;color:#64748B">Ce lien est personnel, à usage unique, et reste valable jusqu'au ${escapeHtml(day(v.expiresAt))}. Vous choisirez votre mot de passe vous-même.</p>
    <p style="margin:10px 0 0;font-size:12px;line-height:18px;color:#94A3B8">Si vous ne connaissez pas cette officine, ignorez ce message : rien ne sera créé.<br>Ou copiez ce lien : ${escapeHtml(v.url)}</p>`,
    reason: `Vous recevez ce message parce que le titulaire de ${v.pharmacyName} vous a invité(e).`,
  });
  return { subject, text, html };
}

export function buildJoinRequestAlertEmail(v: { ownerFirstName: string; pharmacyName: string; requesterName: string; requesterEmail: string; roleLabel: string; url: string }): Message {
  const subject = `${v.requesterName} demande à rejoindre ${v.pharmacyName}`;
  const intro = `${v.requesterName} (${v.requesterEmail}) demande à rejoindre ${v.pharmacyName} en tant que ${v.roleLabel}. Tant que vous n'avez pas approuvé, cette personne n'a accès à rien.`;
  const text = [greet(v.ownerFirstName), "", intro, "", `Approuver ou refuser : ${v.url}`, "", "Si vous ne connaissez pas cette personne, refusez la demande.", "", "L'équipe PharmaBoost"].join("\n");
  const html = emailFrame(DEFAULT_EMAIL_CONTEXT, {
    subject,
    preheader: "Une demande de rattachement attend votre réponse.",
    eyebrow: v.pharmacyName,
    title: "Une demande attend votre réponse",
    bodyHtml: `${hello(v.ownerFirstName)}${para(intro)}${emailButtonHtml(v.url, "Voir la demande")}
    <p style="margin:18px 0 0;font-size:13px;line-height:20px;color:#64748B">Si vous ne connaissez pas cette personne, refusez la demande : elle n'aura jamais accès à votre officine.</p>`,
    reason: "Vous recevez ce message parce que vous êtes titulaire de cette officine sur PharmaBoost.",
  });
  return { subject, text, html };
}

export function buildJoinDecisionEmail(v: { firstName: string; pharmacyName: string; approved: boolean; roleLabel: string | null; loginUrl: string }): Message {
  const subject = v.approved ? `Votre accès à ${v.pharmacyName} est prêt` : `Votre demande pour ${v.pharmacyName}`;
  const intro = v.approved
    ? `Le titulaire de ${v.pharmacyName} a approuvé votre demande${v.roleLabel ? ` : vous êtes ${v.roleLabel}` : ""}. Connectez-vous avec votre adresse e-mail et le mot de passe que vous avez choisi.`
    : `Le titulaire de ${v.pharmacyName} n'a pas donné suite à votre demande de rattachement. Si c'est une erreur, adressez-vous directement à lui.`;
  const text = [greet(v.firstName), "", intro, ...(v.approved ? ["", v.loginUrl] : []), "", "L'équipe PharmaBoost"].join("\n");
  const html = emailFrame(DEFAULT_EMAIL_CONTEXT, {
    subject,
    preheader: v.approved ? "Vous pouvez vous connecter." : "Réponse à votre demande.",
    eyebrow: v.pharmacyName,
    title: v.approved ? "Votre accès est prêt" : "Votre demande de rattachement",
    bodyHtml: `${hello(v.firstName)}${para(intro)}${v.approved ? emailButtonHtml(v.loginUrl, "Me connecter") : ""}`,
    reason: "Vous recevez ce message à la suite de votre demande pour rejoindre une officine.",
  });
  return { subject, text, html };
}

/** Une demande de rattachement venue d'une adresse qui a déjà un compte : on le lui dit par e-mail, jamais sur l'écran (qui reste le même pour tous). */
export function buildAccountExistsEmail(v: { firstName: string; loginUrl: string; resetUrl: string }): Message {
  const subject = "Vous avez déjà un compte PharmaBoost";
  const intro = "Vous venez de demander à rejoindre une officine, mais cette adresse e-mail a déjà un compte PharmaBoost. Connectez-vous avec ce compte ; si vous avez oublié votre mot de passe, vous pouvez en choisir un nouveau. Pour changer d'officine, demandez au titulaire de vous inviter.";
  const text = [greet(v.firstName), "", intro, "", `Se connecter : ${v.loginUrl}`, `Mot de passe oublié : ${v.resetUrl}`, "", "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.", "", "L'équipe PharmaBoost"].join("\n");
  const html = emailFrame(DEFAULT_EMAIL_CONTEXT, {
    subject,
    preheader: "Cette adresse a déjà un compte.",
    title: "Vous avez déjà un compte",
    bodyHtml: `${hello(v.firstName)}${para(intro)}${emailButtonHtml(v.loginUrl, "Me connecter")}<p style="margin:18px 0 0;font-size:13px;line-height:20px;color:#64748B">Mot de passe oublié ? <a href="${escapeHtml(v.resetUrl)}" style="color:#0F766E">Choisir un nouveau mot de passe</a>.<br>Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>`,
    reason: "Vous recevez ce message parce que cette adresse a été saisie sur la page « Rejoindre mon officine ».",
  });
  return { subject, text, html };
}
