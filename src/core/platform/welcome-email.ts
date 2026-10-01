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
      ? `<tr><td style="padding:26px 28px 0">
    <p style="margin:0;font-size:16px;line-height:24px;font-weight:600;color:#111827">Ensuite, cinq étapes pour mettre PharmaBoost en service</p>
    <p style="margin:6px 0 0;font-size:14px;line-height:21px;color:#6b7280">Sans visite, sans toucher à votre serveur : une trentaine de minutes en tout.</p>
    <ol style="margin:14px 0 0;padding-left:22px;font-size:15px;line-height:23px;color:#374151">${INSTALLATION_STEPS.map((step) => `<li style="margin:0 0 12px"><strong style="color:#111827">${escapeHtml(step.title)}</strong><br>${escapeHtml(step.body)}</li>`).join("")}</ol>
    ${v.onboarding.lgoLabel ? `<div style="margin:6px 0 0;background:#f6f7f9;border-radius:12px;padding:14px 16px"><p style="margin:0;font-size:14px;line-height:21px;font-weight:600;color:#111827">Votre logiciel : ${escapeHtml(v.onboarding.lgoLabel)}. Pour sortir le stock :</p><ul style="margin:8px 0 0;padding-left:20px;font-size:14px;line-height:21px;color:#374151">${v.onboarding.exportSteps.map((line) => `<li style="margin:0 0 4px">${escapeHtml(line)}</li>`).join("")}</ul></div>` : ""}
    <p style="margin:16px 0 0;font-size:13px;line-height:19px;color:#6b7280">Une question, un blocage ? Répondez à ce message ou écrivez à ${escapeHtml(v.onboarding.contactEmail)} : nous vous rappelons.</p>
  </td></tr>`
      : "";

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#eef1f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden">
  <tr><td style="background:#0F766E;padding:22px 28px">
    <div style="font-size:13px;line-height:18px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.8)">PharmaBoost</div>
    <div style="font-size:22px;line-height:28px;font-weight:700;color:#ffffff;margin-top:4px">${welcome ? "Bienvenue" : "Votre mot de passe"}${v.pharmacyName ? ` · ${escapeHtml(v.pharmacyName)}` : ""}</div>
  </td></tr>
  <tr><td style="padding:26px 28px 0">
    <p style="margin:0;font-size:18px;line-height:26px;font-weight:600">Bonjour ${escapeHtml(v.firstName)},</p>
    <p style="margin:12px 0 0;font-size:16px;line-height:25px;color:#374151">${escapeHtml(intro)}</p>
  </td></tr>
  <tr><td style="padding:24px 28px 0" align="center">
    <a href="${escapeHtml(v.url)}" style="display:block;background:#0F766E;color:#ffffff;text-decoration:none;font-size:17px;line-height:24px;font-weight:700;padding:16px 22px;border-radius:14px;text-align:center">${welcome ? "Définir mon mot de passe" : "Choisir un nouveau mot de passe"}</a>
  </td></tr>
  ${onboardingHtml}
  <tr><td style="padding:22px 28px 26px">
    <p style="margin:0;font-size:13px;line-height:19px;color:#6b7280">Ce lien est personnel, à usage unique, et reste valable jusqu'au ${escapeHtml(until)}.<br>Ensuite, connectez-vous sur <a href="${escapeHtml(v.loginUrl)}" style="color:#0F766E">${escapeHtml(v.loginUrl)}</a>.</p>
    <p style="margin:12px 0 0;font-size:12px;line-height:18px;color:#9ca3af">${welcome ? "" : "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : rien ne sera modifié.<br>"}Ou copiez ce lien : ${escapeHtml(v.url)}</p>
  </td></tr>
</table></td></tr></table>
</body></html>`;

  return { subject, text, html };
}
