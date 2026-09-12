/**
 * Le message qui accompagne le plan personnalisé du patient.
 *
 * Il est écrit ICI, dans le domaine, et nulle part ailleurs. Le fournisseur
 * d'envoi ne compose rien : il transporte. Le texte est le même quel que soit
 * le prestataire, et il est testable sans réseau.
 *
 * Règle de confidentialité, identique à celle des messages de suivi : le
 * courriel ne contient AUCUNE donnée de santé. Ni le nom d'un médicament, ni
 * une pathologie, ni un conseil. L'aperçu « Matin | Midi | Soir » ne fait que
 * compter les prises : un e-mail transite par des serveurs que l'officine ne
 * maîtrise pas et s'affiche sur un écran verrouillé. Seul le lien, protégé par
 * un jeton, mène au contenu.
 *
 * Le patient voit sa pharmacie, pas un logiciel : aucun nom d'outil n'apparaît.
 */

import type { DayPlanSummary } from "./compose";
import { DOCUMENT_EMAIL_SIGNATURE_HINT } from "./types";
import { TIME_ZONE } from "@/config/constants";

export type DocumentEmailVariables = {
  /** Prénom seul : un nom complet dans un objet d'e-mail en dit déjà trop. */
  patientFirstName: string;
  pharmacyName: string;
  pharmacyPhone: string | null;
  /** Couleur de l'officine, pour que le message lui ressemble. */
  brandColor?: string | null;
  /** Date du passage, dite en toutes lettres. */
  passageAt: Date;
  /** Aperçu du plan : des moments et des nombres, jamais un nom. */
  dayPlan: DayPlanSummary[];
  /** Lien sécurisé vers le plan. */
  url: string;
  /** Lien qui ouvre le plan prêt à imprimer — même jeton, même page. */
  printUrl?: string | null;
  /** Date d'expiration du lien, pour que le patient sache qu'il doit l'ouvrir. */
  expiresAt: Date;
  /** Plan de démonstration : le message doit le dire avant toute autre chose. */
  isDemo: boolean;
};

export type EmailMessage = {
  subject: string;
  /** Version texte — celle qui fait foi. */
  text: string;
  /** Version HTML, strictement équivalente au texte, mise en page pour mobile. */
  html: string;
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, day: "numeric", month: "long", year: "numeric" }).format(date);
}

/** Échappement HTML : le nom d'une officine peut contenir « & » ou « < ». */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Une couleur d'officine invalide ne doit pas casser un e-mail : repli sur le vert par défaut. */
export function safeColor(value: string | null | undefined, fallback = "#0F766E"): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function prises(count: number): string {
  if (count === 0) return "—";
  return `${count} prise${count > 1 ? "s" : ""}`;
}

export function buildDocumentEmail(variables: DocumentEmailVariables): EmailMessage {
  const { patientFirstName, pharmacyName, pharmacyPhone, url, expiresAt, isDemo, dayPlan } = variables;
  const color = safeColor(variables.brandColor);
  const printUrl = variables.printUrl ?? null;
  const passage = formatDate(variables.passageAt);
  const hasPlan = dayPlan.some((moment) => moment.count > 0);

  const demoLine =
    "MESSAGE DE DÉMONSTRATION — ce plan est fictif et ne concerne aucun patient réel.";

  const lignes = [
    ...(isDemo ? [demoLine, ""] : []),
    `Bonjour ${patientFirstName},`,
    "",
    `À la suite de votre passage à la ${pharmacyName} le ${passage}, vous trouverez votre plan personnalisé préparé avec votre pharmacien.`,
    "",
    ...(hasPlan
      ? [
          "Votre traitement",
          dayPlan.map((moment) => `${moment.label} : ${prises(moment.count)}`).join("  |  "),
          "",
        ]
      : []),
    `Consulter mon plan : ${url}`,
    ...(printUrl ? [`Télécharger / imprimer : ${printUrl}`] : []),
    "",
    `Ce lien est personnel et reste valable jusqu'au ${formatDate(expiresAt)}.`,
    "Ce plan ne remplace ni votre ordonnance, ni l'avis de votre médecin.",
    pharmacyPhone
      ? `Une question ? Appelez votre pharmacie au ${pharmacyPhone}.`
      : "Une question ? Votre pharmacien reste à votre disposition.",
    "",
    DOCUMENT_EMAIL_SIGNATURE_HINT,
    pharmacyName,
  ];

  const text = lignes.join("\n");

  // Mise en page en tableaux et styles en ligne : c'est ce que les clients mail
  // (Gmail, Mail iOS, Outlook) rendent de façon fiable. Une seule colonne, des
  // cibles tactiles hautes, une police système : lisible à 65 ans sur un iPhone.
  const cell = (moment: DayPlanSummary) =>
    `<td align="center" style="padding:14px 6px;border-radius:12px;background:#f6f7f9;width:33%">
      <div style="font-size:22px;line-height:26px">${moment.icon}</div>
      <div style="font-size:12px;line-height:16px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;margin-top:6px">${escapeHtml(moment.label)}</div>
      <div style="font-size:16px;line-height:22px;font-weight:600;color:#111827;margin-top:2px">${prises(moment.count)}</div>
    </td>`;

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(`Votre plan personnalisé — ${pharmacyName}`)}</title></head>
<body style="margin:0;padding:0;background:#eef1f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f4;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden">
  <tr><td style="background:${color};padding:26px 28px 22px">
    <div style="font-size:13px;line-height:18px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.82)">${escapeHtml(pharmacyName)}</div>
    <div style="font-size:24px;line-height:30px;font-weight:700;color:#ffffff;margin-top:6px">Votre plan personnalisé</div>
  </td></tr>
  ${
    isDemo
      ? `<tr><td style="padding:14px 28px 0"><div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:10px 12px;font-size:13px;line-height:18px;color:#9a3412">${escapeHtml(demoLine)}</div></td></tr>`
      : ""
  }
  <tr><td style="padding:26px 28px 0">
    <p style="margin:0;font-size:18px;line-height:26px;font-weight:600">Bonjour ${escapeHtml(patientFirstName)},</p>
    <p style="margin:12px 0 0;font-size:16px;line-height:25px;color:#374151">À la suite de votre passage à la ${escapeHtml(pharmacyName)} le ${escapeHtml(passage)}, vous trouverez votre plan personnalisé préparé avec votre pharmacien.</p>
  </td></tr>
  ${
    hasPlan
      ? `<tr><td style="padding:24px 28px 0">
    <div style="font-size:12px;line-height:16px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;font-weight:600">Votre traitement</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="margin-top:8px;border-collapse:separate"><tr>${dayPlan.map(cell).join("")}</tr></table>
    <p style="margin:10px 0 0;font-size:13px;line-height:19px;color:#6b7280">Le détail — quel médicament, quelle dose — se trouve dans votre plan, protégé par un lien personnel.</p>
  </td></tr>`
      : ""
  }
  <tr><td style="padding:26px 28px 0" align="center">
    <a href="${escapeHtml(url)}" style="display:block;background:${color};color:#ffffff;text-decoration:none;font-size:17px;line-height:24px;font-weight:700;padding:16px 22px;border-radius:14px;text-align:center">Consulter mon plan</a>
    ${
      printUrl
        ? `<a href="${escapeHtml(printUrl)}" style="display:block;margin-top:10px;color:${color};text-decoration:none;font-size:15px;line-height:22px;font-weight:600;padding:12px 22px;border:1.5px solid ${color};border-radius:14px;text-align:center">Télécharger / imprimer</a>`
        : ""
    }
  </td></tr>
  <tr><td style="padding:22px 28px 0">
    <p style="margin:0;font-size:13px;line-height:19px;color:#6b7280">Ce lien est personnel et reste valable jusqu'au ${escapeHtml(formatDate(expiresAt))}.<br>Ce plan ne remplace ni votre ordonnance, ni l'avis de votre médecin.</p>
    <p style="margin:10px 0 0;font-size:15px;line-height:22px;color:#374151">${
      pharmacyPhone
        ? `Une question ? Appelez votre pharmacie au <strong>${escapeHtml(pharmacyPhone)}</strong>.`
        : "Une question ? Votre pharmacien reste à votre disposition."
    }</p>
  </td></tr>
  <tr><td style="padding:22px 28px 26px">
    <p style="margin:0;font-size:12px;line-height:18px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px">${escapeHtml(DOCUMENT_EMAIL_SIGNATURE_HINT)}<br><strong style="color:#6b7280">${escapeHtml(pharmacyName)}</strong></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  return {
    // L'objet ne nomme ni médicament, ni pathologie : il peut s'afficher sur un
    // écran verrouillé, devant n'importe qui.
    subject: `Votre plan personnalisé — ${pharmacyName}`,
    text,
    html,
  };
}
