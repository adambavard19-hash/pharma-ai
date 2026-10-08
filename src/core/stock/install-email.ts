import { escapeHtml } from "@/core/documents/email";
import { button, shell } from "@/core/platform/sales-emails";

/**
 * L'e-mail du lien d'installation d'un comptoir : ce qui se lit sur l'ordinateur du comptoir, en trois gestes.
 * Le lien est celui de la page de téléchargement (`/installer/<jeton>`), à usage unique, valable sept jours.
 * Jamais de jeton ailleurs que dans ce lien, jamais de ligne de commande : l'e-mail est pour le titulaire.
 */
export function buildCounterInstallEmail(v: { pharmacyName: string; counterLabel: string; downloadUrl: string; validity: string; contactEmail: string }): { subject: string; text: string; html: string } {
  const subject = `Installer PharmaBoost sur ${v.counterLabel} — ${v.pharmacyName}`;
  const steps = ["Ouvrez ce lien sur l'ordinateur du comptoir (Windows 10 ou 11).", "Téléchargez le fichier, puis double-cliquez-le : une minute, rien à taper.", `Dans PharmaBoost, « ${v.counterLabel} » passe à « Connecté ».`];
  const text = [
    `Installer PharmaBoost sur ${v.counterLabel} (${v.pharmacyName})`,
    "",
    ...steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    `Le lien : ${v.downloadUrl}`,
    "",
    `Valable ${v.validity}, pour un seul comptoir. Ne le transmettez qu'à la personne qui installe.`,
    `Un blocage ? Écrivez à ${v.contactEmail} : nous vous rappelons.`,
    "",
    "PharmaBoost",
  ].join("\n");
  const html = shell(
    subject,
    `Installer PharmaBoost sur ${v.counterLabel}`,
    `<p style="margin:0;font-size:16px;line-height:25px;color:#374151">Pour <strong>${escapeHtml(v.pharmacyName)}</strong>, en trois gestes :</p>
<ol style="margin:14px 0 0;padding-left:22px;font-size:15px;line-height:23px;color:#374151">${steps.map((step) => `<li style="margin:0 0 8px">${escapeHtml(step)}</li>`).join("")}</ol>
${button(v.downloadUrl, "Ouvrir le lien d'installation", "#0F766E")}
<p style="margin:18px 0 0;font-size:13px;line-height:19px;color:#6b7280">Valable ${escapeHtml(v.validity)}, pour un seul comptoir. Ne le transmettez qu'à la personne qui installe. Un blocage ? Écrivez à ${escapeHtml(v.contactEmail)} : nous vous rappelons.</p>`,
    "#0F766E",
  );
  return { subject, text, html };
}
