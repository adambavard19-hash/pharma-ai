/**
 * Le message qui accompagne la fiche patient.
 *
 * Il est écrit ICI, dans le domaine, et nulle part ailleurs. Le fournisseur
 * d'envoi ne compose rien : il transporte. Deux conséquences voulues —
 * le texte est le même quel que soit le prestataire, et il est testable sans
 * réseau.
 *
 * Règle de confidentialité, identique à celle des messages de suivi : le
 * courriel ne contient AUCUNE donnée de santé. Ni le nom d'un médicament, ni
 * une pathologie, ni un conseil. Un e-mail transite par des serveurs que
 * l'officine ne maîtrise pas et peut s'afficher sur un écran verrouillé ; seul
 * le lien, protégé par un jeton, mène au contenu.
 */

import { DOCUMENT_EMAIL_SIGNATURE_HINT } from "./types";

export type DocumentEmailVariables = {
  /** Prénom seul : un nom complet dans un objet d'e-mail en dit déjà trop. */
  patientFirstName: string;
  pharmacyName: string;
  pharmacyPhone: string | null;
  /** Lien sécurisé vers la fiche. */
  url: string;
  /** Date d'expiration du lien, pour que le patient sache qu'il doit l'ouvrir. */
  expiresAt: Date;
  /** Fiche de démonstration : le message doit le dire avant toute autre chose. */
  isDemo: boolean;
};

export type EmailMessage = {
  subject: string;
  /** Version texte — celle qui fait foi. */
  text: string;
  /** Version HTML, strictement équivalente au texte. */
  html: string;
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** Échappement HTML : le nom d'une officine peut contenir « & » ou « < ». */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildDocumentEmail(variables: DocumentEmailVariables): EmailMessage {
  const { patientFirstName, pharmacyName, pharmacyPhone, url, expiresAt, isDemo } = variables;

  const demoPrefix = isDemo
    ? "MESSAGE DE DÉMONSTRATION — cette fiche est fictive et ne concerne aucun patient réel.\n\n"
    : "";

  const lignes = [
    `Bonjour ${patientFirstName},`,
    "",
    `À la suite de votre passage à ${pharmacyName}, votre pharmacien a préparé une fiche récapitulative : le rappel de votre traitement et les conseils qu'il a validés pour vous.`,
    "",
    `Vous pouvez la consulter ici : ${url}`,
    "",
    `Ce lien est personnel et reste valable jusqu'au ${formatDate(expiresAt)}.`,
    "",
    "Cette fiche ne remplace ni votre ordonnance, ni l'avis de votre médecin.",
    pharmacyPhone
      ? `Une question ? Appelez votre pharmacie au ${pharmacyPhone}.`
      : "Une question ? Votre pharmacien reste à votre disposition.",
    "",
    DOCUMENT_EMAIL_SIGNATURE_HINT,
    pharmacyName,
  ];

  const text = demoPrefix + lignes.join("\n");

  // Le HTML reprend le texte ligne à ligne : aucune information supplémentaire
  // ne peut apparaître dans une version et pas dans l'autre.
  const html = [
    `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a">`,
    isDemo
      ? `<p style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 12px;font-size:13px;color:#9a3412">MESSAGE DE DÉMONSTRATION — cette fiche est fictive et ne concerne aucun patient réel.</p>`
      : "",
    `<p>Bonjour ${escapeHtml(patientFirstName)},</p>`,
    `<p>À la suite de votre passage à ${escapeHtml(pharmacyName)}, votre pharmacien a préparé une fiche récapitulative : le rappel de votre traitement et les conseils qu'il a validés pour vous.</p>`,
    `<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Consulter ma fiche</a></p>`,
    `<p style="font-size:13px;color:#525252">Ou copiez ce lien : ${escapeHtml(url)}<br>Ce lien est personnel et reste valable jusqu'au ${formatDate(expiresAt)}.</p>`,
    `<p style="font-size:13px;color:#525252">Cette fiche ne remplace ni votre ordonnance, ni l'avis de votre médecin.<br>${
      pharmacyPhone
        ? `Une question ? Appelez votre pharmacie au ${escapeHtml(pharmacyPhone)}.`
        : "Une question ? Votre pharmacien reste à votre disposition."
    }</p>`,
    `<p style="font-size:12px;color:#737373">${escapeHtml(DOCUMENT_EMAIL_SIGNATURE_HINT)}<br>${escapeHtml(pharmacyName)}</p>`,
    `</div>`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    // L'objet ne nomme ni médicament, ni pathologie : il peut s'afficher sur un
    // écran verrouillé, devant n'importe qui.
    subject: `${pharmacyName} — votre fiche conseil`,
    text,
    html,
  };
}
