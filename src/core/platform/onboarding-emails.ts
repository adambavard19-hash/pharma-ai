import { escapeHtml } from "@/core/documents/email";
import { button, shell } from "./sales-emails";
import { websiteHtml } from "./email-layout";
import { presentationVideoHtml, presentationVideoText, type PresentationVideoLinks } from "./presentation-video";

/**
 * Le guide d'installation, envoyé au titulaire quand son espace est activé :
 * ce qu'il fait lui-même, dans l'ordre, sans qu'un commercial se déplace.
 * Rédigé ici, versionné, identique pour toutes les officines.
 */
export const INSTALLATION_STEPS: { title: string; body: string }[] = [
  {
    title: "Ouvrez votre espace",
    body: "Connectez-vous sur pharmaboost.app avec votre adresse e-mail et le mot de passe choisi grâce au lien de l'e-mail de création de votre espace.",
  },
  {
    title: "Ajoutez votre équipe",
    body: "Dans le menu, « Mon équipe » → « Ajouter un membre » : saisissez l'adresse e-mail de chaque pharmacien et préparateur.",
  },
  {
    title: "Donnez le mot de passe de la pharmacie",
    body: "Toujours dans « Mon équipe », un mot de passe unique est attribué à toute la pharmacie (par exemple « Menthe-4827 »). Donnez-le à l'équipe : chacun se connecte avec SON adresse e-mail et CE mot de passe. Vous, titulaire, gardez votre mot de passe personnel.",
  },
  {
    title: "Installez PharmaBoost sur chaque poste",
    body: "Sur chaque ordinateur du comptoir (celui où la douchette est branchée) : connectez-vous sur pharmaboost.app, ouvrez « Au comptoir », cliquez « Télécharger PharmaBoost pour mon ordinateur », puis ouvrez le fichier téléchargé (double-clic). Si Windows affiche un avertissement, cliquez « Informations complémentaires » puis « Exécuter quand même ». Une minute par poste : la pastille passe à « Connecté ».",
  },
  {
    title: "Envoyez votre stock",
    body: "Dans « Mon stock » → « Mettre à jour mon stock », déposez l'édition d'inventaire de votre logiciel de gestion : c'est ce qui permet au comptoir de proposer ce qui est vraiment en rayon.",
  },
];

export function buildInstallationGuideEmail(v: { ownerName: string; pharmacyName: string; appUrl: string; contactEmail: string; lgoLabel?: string | null; exportSteps?: string[]; video?: PresentationVideoLinks | null }): { subject: string; text: string; html: string } {
  const lgoText = v.lgoLabel && v.exportSteps?.length ? [`Votre logiciel : ${v.lgoLabel}. Pour sortir le stock :`, ...v.exportSteps.map((line) => `   • ${line}`), ""] : [];
  const lgoHtml = v.lgoLabel && v.exportSteps?.length ? `<div style="margin:6px 0 0;background:#f6f7f9;border-radius:12px;padding:14px 16px"><p style="margin:0;font-size:14px;line-height:21px;font-weight:600;color:#111827">Votre logiciel : ${escapeHtml(v.lgoLabel)}. Pour sortir le stock :</p><ul style="margin:8px 0 0;padding-left:20px;font-size:14px;line-height:21px;color:#374151">${v.exportSteps.map((line) => `<li style="margin:0 0 4px">${escapeHtml(line)}</li>`).join("")}</ul></div>` : "";
  const text = [
    `Bonjour ${v.ownerName},`,
    "",
    `Votre espace PharmaBoost pour ${v.pharmacyName} est prêt. Voici comment installer PharmaBoost sur chaque poste de votre comptoir, en cinq étapes, sans visite et sans toucher à votre serveur.`,
    "",
    ...INSTALLATION_STEPS.flatMap((step, index) => [`${index + 1}. ${step.title}`, `   ${step.body}`, ""]),
    ...lgoText,
    `Ouvrir PharmaBoost : ${v.appUrl}`,
    "",
    `Une question, un blocage ? Répondez à ce message ou écrivez à ${v.contactEmail} : nous vous rappelons.`,
    ...(v.video ? ["", ...presentationVideoText(v.video)] : []),
    "",
    "PharmaBoost",
    "Le site PharmaBoost : https://pharmaboost.app",
  ].join("\n");
  const html = shell(
    `Installer PharmaBoost sur vos postes — ${v.pharmacyName}`,
    "Installer PharmaBoost sur vos postes",
    `<p style="margin:0;font-size:18px;line-height:26px;font-weight:600">Bonjour ${escapeHtml(v.ownerName)},</p>
<p style="margin:12px 0 0;font-size:16px;line-height:25px;color:#374151">Votre espace PharmaBoost pour <strong>${escapeHtml(v.pharmacyName)}</strong> est prêt. Voici comment installer PharmaBoost sur chaque poste de votre comptoir, en cinq étapes, sans visite et sans toucher à votre serveur.</p>
<ol style="margin:18px 0 0;padding-left:22px;font-size:15px;line-height:23px;color:#374151">${INSTALLATION_STEPS.map((step) => `<li style="margin:0 0 12px"><strong style="color:#111827">${escapeHtml(step.title)}</strong><br>${escapeHtml(step.body)}</li>`).join("")}</ol>
${lgoHtml}
${button(v.appUrl, "Ouvrir PharmaBoost", "#0F766E")}
<p style="margin:18px 0 0;font-size:13px;line-height:19px;color:#6b7280">Une question, un blocage ? Répondez à ce message ou écrivez à ${escapeHtml(v.contactEmail)} : nous vous rappelons.</p>${v.video ? presentationVideoHtml(v.video) : ""}${websiteHtml()}`,
    "#0F766E",
  );
  return { subject: `Installer PharmaBoost sur vos postes — ${v.pharmacyName}`, text, html };
}
