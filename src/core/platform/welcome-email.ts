import { DEFAULT_EMAIL_CONTEXT, emailButtonHtml, emailFrame } from "./email-layout";
import { escapeHtml } from "@/core/documents/email";
import { TIME_ZONE } from "@/config/constants";
import { INSTALLATION_STEPS } from "./onboarding-emails";

/**
 * L'e-mail d'accueil d'un titulaire d'officine.
 *
 * Envoyé quand l'éditeur crée son compte. Il ne contient jamais le mot de
 * passe : un lien personnel, à usage unique et daté, permet au titulaire de
 * définir le sien. Le même gabarit sert au « mot de passe oublié ».
 */
export type UserPasswordEmailVariables = {
  firstName: string;
  pharmacyName: string | null;
  url: string;
  loginUrl: string;
  expiresAt: Date;
  /** `welcome` : premier accès · `reset` : demande de réinitialisation. */
  kind: "welcome" | "reset";
  /**
   * Au premier accès : la mise en service, dans le même message. Le logiciel
   * de gestion de l'officine, s'il est connu, donne ses propres étapes
   * d'export de stock.
   */
  onboarding?: { lgoLabel: string | null; exportSteps: string[]; contactEmail: string } | null;
};

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function buildUserPasswordEmail(v: UserPasswordEmailVariables): { subject: string; text: string; html: string } {
  const until = formatDateTime(v.expiresAt);
  const welcome = v.kind === "welcome";
  const subject = welcome
    ? `Bienvenue sur PharmaBoost${v.pharmacyName ? ` — ${v.pharmacyName}` : ""}`
    : "Réinitialisez votre mot de passe — PharmaBoost";
  const intro = welcome
    ? `Votre espace PharmaBoost${v.pharmacyName ? ` pour ${v.pharmacyName}` : ""} est prêt. Pour y accéder, définissez d'abord votre mot de passe :`
    : "Vous avez demandé à réinitialiser votre mot de passe PharmaBoost. Choisissez-en un nouveau ici :";

  const text = [
    `Bonjour ${v.firstName},`,
    "",
    intro,
    v.url,
    "",
    `Ce lien est personnel, à usage unique, et reste valable jusqu'au ${until}.`,
    `Ensuite, connectez-vous ici : ${v.loginUrl}`,
    "",
    ...(welcome && v.onboarding
      ? [
          "Ensuite, cinq étapes pour mettre PharmaBoost en service, sans visite et sans toucher à votre serveur (une trentaine de minutes en tout) :",
          "",
          ...INSTALLATION_STEPS.flatMap((step, index) => [`${index + 1}. ${step.title}`, `   ${step.body}`, ""]),
          ...(v.onboarding.lgoLabel
            ? [`Votre logiciel : ${v.onboarding.lgoLabel}. Pour sortir le stock :`, ...v.onboarding.exportSteps.map((line) => `   • ${line}`), ""]
            : []),
          `Une question, un blocage ? Répondez à ce message ou écrivez à ${v.onboarding.contactEmail} : nous vous rappelons.`,
        ]
      : welcome
        ? ["PharmaBoost vous accompagne au comptoir : ordonnance lue, conseils issus de votre stock, plan remis au patient."]
        : ["Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : rien ne sera modifié."]),
    "",
    "L'équipe PharmaBoost",
  ].join("\n");

  const onboardingHtml =
    welcome && v.onboarding
      ? `<div style="margin:8px 0 0;border-top:1px solid #E2E8F0;padding-top:22px">
    <p style="margin:0;font-size:16px;line-height:24px;font-weight:600;color:#0F172A">Ensuite, cinq étapes pour mettre PharmaBoost en service</p>
    <p style="margin:6px 0 0;font-size:14px;line-height:21px;color:#6b7280">Sans visite, sans toucher à votre serveur : une trentaine de minutes en tout.</p>
    <ol style="margin:14px 0 0;padding-left:22px;font-size:15px;line-height:23px;color:#374151">${INSTALLATION_STEPS.map((step) => `<li style="margin:0 0 12px"><strong style="color:#111827">${escapeHtml(step.title)}</strong><br>${escapeHtml(step.body)}</li>`).join("")}</ol>
    ${v.onboarding.lgoLabel ? `<div style="margin:6px 0 0;background:#f6f7f9;border-radius:12px;padding:14px 16px"><p style="margin:0;font-size:14px;line-height:21px;font-weight:600;color:#111827">Votre logiciel : ${escapeHtml(v.onboarding.lgoLabel)}. Pour sortir le stock :</p><ul style="margin:8px 0 0;padding-left:20px;font-size:14px;line-height:21px;color:#374151">${v.onboarding.exportSteps.map((line) => `<li style="margin:0 0 4px">${escapeHtml(line)}</li>`).join("")}</ul></div>` : ""}
    <p style="margin:16px 0 0;font-size:13px;line-height:19px;color:#64748B">Une question, un blocage ? Répondez à ce message ou écrivez à ${escapeHtml(v.onboarding.contactEmail)} : nous vous rappelons.</p>
  </div>`
      : "";

  const html = emailFrame(DEFAULT_EMAIL_CONTEXT, {
    subject,
    preheader: welcome ? "Votre accès PharmaBoost est prêt : définissez votre mot de passe." : "Choisissez un nouveau mot de passe PharmaBoost.",
    eyebrow: v.pharmacyName ?? undefined,
    title: welcome ? "Bienvenue sur PharmaBoost" : "Votre mot de passe",
    bodyHtml: `<p style="margin:0 0 16px;font-size:16px;line-height:26px;color:#0F172A">Bonjour ${escapeHtml(v.firstName)},</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:26px;color:#334155">${escapeHtml(intro)}</p>
    ${emailButtonHtml(v.url, welcome ? "Définir mon mot de passe" : "Choisir un nouveau mot de passe")}
    ${onboardingHtml}
    <p style="margin:18px 0 0;font-size:13px;line-height:20px;color:#64748B">Ce lien est personnel, à usage unique, et reste valable jusqu'au ${escapeHtml(until)}.<br>Ensuite, connectez-vous sur <a href="${escapeHtml(v.loginUrl)}" style="color:#0F766E">${escapeHtml(v.loginUrl)}</a>.</p>
    <p style="margin:10px 0 0;font-size:12px;line-height:18px;color:#94A3B8">${welcome ? "" : "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : rien ne sera modifié.<br>"}Ou copiez ce lien : ${escapeHtml(v.url)}</p>`,
    reason: welcome ? "Vous recevez ce message parce qu'un accès PharmaBoost vient d'être ouvert à votre nom." : "Vous recevez ce message à la suite d'une demande de nouveau mot de passe.",
  });

  return { subject, text, html };
}
