import { escapeHtml } from "@/core/documents/email";
import { button, shell } from "./sales-emails";

/**
 * Le guide d'installation, envoyé au titulaire quand son espace est activé :
 * ce qu'il fait lui-même, dans l'ordre, sans qu'un commercial se déplace.
 * Rédigé ici, versionné, identique pour toutes les officines.
 */
export const INSTALLATION_STEPS: { title: string; body: string }[] = [
  {
    title: "Ouvrez PharmaBoost et complétez votre officine",
    body: "Connectez-vous avec votre adresse e-mail. L'accueil vous guide : coordonnées de l'officine, puis votre stock.",
  },
  {
    title: "Importez votre stock",
    body: "Dans votre logiciel de gestion, faites l'édition de l'inventaire (PDF, Excel ou CSV) et déposez le fichier dans PharmaBoost → Stock. C'est ce qui permet au comptoir de proposer ce qui est réellement en rayon.",
  },
  {
    title: "Reliez chaque poste de comptoir, en une ligne",
    body: "Sur l'ordinateur où la douchette est branchée : PharmaBoost → Stock → Connecter mon logiciel → « Ajouter un poste ». Copiez la ligne affichée, ouvrez PowerShell (clic droit sur le bouton Windows → Terminal), collez, Entrée. Deux minutes par poste. Dès lors, chaque boîte bipée dans votre logiciel ouvre le conseil sur l'écran.",
  },
  {
    title: "Faites suivre l'inventaire automatiquement",
    body: "Sous le poste relié, indiquez le dossier où votre logiciel enregistre son édition de stock (un dossier partagé, visible depuis ce poste). PharmaBoost le relit à chaque nouvel export : les livraisons sont comptées, les ventes se déduisent au bip.",
  },
  {
    title: "Invitez votre équipe",
    body: "PharmaBoost → Équipe : un compte par collaborateur, chacun reçoit son lien par e-mail. Vous suivez ensuite les conseils proposés, acceptés et vendus par chacun dans Performance.",
  },
];

export function buildInstallationGuideEmail(v: { ownerName: string; pharmacyName: string; appUrl: string; contactEmail: string }): { subject: string; text: string; html: string } {
  const text = [
    `Bonjour ${v.ownerName},`,
    "",
    `Votre espace PharmaBoost pour ${v.pharmacyName} est prêt. Voici les cinq étapes pour le mettre en service, sans intervention sur votre serveur et sans visite : une trentaine de minutes en tout.`,
    "",
    ...INSTALLATION_STEPS.flatMap((step, index) => [`${index + 1}. ${step.title}`, `   ${step.body}`, ""]),
    `Ouvrir PharmaBoost : ${v.appUrl}`,
    "",
    `Une question, un blocage ? Répondez à ce message ou écrivez à ${v.contactEmail} : nous vous rappelons.`,
    "",
    "PharmaBoost",
  ].join("\n");
  const html = shell(
    `Mettre PharmaBoost en service — ${v.pharmacyName}`,
    "Mettre PharmaBoost en service",
    `<p style="margin:0;font-size:18px;line-height:26px;font-weight:600">Bonjour ${escapeHtml(v.ownerName)},</p>
<p style="margin:12px 0 0;font-size:16px;line-height:25px;color:#374151">Votre espace PharmaBoost pour <strong>${escapeHtml(v.pharmacyName)}</strong> est prêt. Voici les cinq étapes pour le mettre en service, sans intervention sur votre serveur et sans visite : une trentaine de minutes en tout.</p>
<ol style="margin:18px 0 0;padding-left:22px;font-size:15px;line-height:23px;color:#374151">${INSTALLATION_STEPS.map((step) => `<li style="margin:0 0 12px"><strong style="color:#111827">${escapeHtml(step.title)}</strong><br>${escapeHtml(step.body)}</li>`).join("")}</ol>
${button(v.appUrl, "Ouvrir PharmaBoost", "#0F766E")}
<p style="margin:18px 0 0;font-size:13px;line-height:19px;color:#6b7280">Une question, un blocage ? Répondez à ce message ou écrivez à ${escapeHtml(v.contactEmail)} : nous vous rappelons.</p>`,
    "#0F766E",
  );
  return { subject: `Mettre PharmaBoost en service — ${v.pharmacyName}`, text, html };
}
