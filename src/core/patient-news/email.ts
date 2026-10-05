import { escapeHtml, safeColor, type EmailMessage } from "@/core/documents/email";
import { NEWS_RETENTION_MONTHS } from "./constants";

// Le bloc facultatif de l'e-mail du plan est écrit avec ce message, dont il fait
// partie : il vit dans le domaine des documents pour que celui-ci n'importe pas
// les nouveautés (ce qui ferait un import circulaire). Il se retrouve ici, avec
// les autres textes que le patient lit au sujet des nouveautés.
export { buildNewsOptInBlock } from "@/core/documents/email";

/**
 * Les messages que reçoit un patient abonné aux nouveautés de sa pharmacie.
 *
 * Mêmes principes que l'e-mail du plan : le patient voit sa pharmacie, pas un
 * logiciel (aucun nom d'outil), le texte fait foi et le HTML ne dit rien de
 * plus, et rien de ce qui touche à sa santé n'y transite. Le pied de page est
 * identique partout : pourquoi il reçoit ce message, comment cesser de le
 * recevoir, combien de temps son adresse est gardée, à qui s'adresser.
 */

type Branding = { pharmacyName: string; pharmacyPhone: string | null; brandColor?: string | null };

function footer(pharmacyName: string, unsubscribeUrl: string) {
  const reason = `Vous recevez ce message parce que vous avez demandé à être informé(e) des nouveautés de ${pharmacyName}.`;
  const retention = `Votre adresse est conservée ${NEWS_RETENTION_MONTHS} mois au plus après votre accord, puis supprimée. Pour exercer vos droits d'accès, de rectification ou de suppression, adressez-vous à votre pharmacie.`;
  const noHealth = "Ce message ne contient aucune information sur votre santé.";
  return { reason, retention, noHealth, lines: [reason, `Se désinscrire : ${unsubscribeUrl}`, retention, noHealth] };
}

function phoneLine(phone: string | null): string {
  return phone ? `Une question ? Appelez votre pharmacie au ${phone}.` : "Une question ? Votre pharmacien reste à votre disposition.";
}

function phoneHtml(phone: string | null): string {
  return phone ? `Une question ? Appelez votre pharmacie au <strong>${escapeHtml(phone)}</strong>.` : "Une question ? Votre pharmacien reste à votre disposition.";
}

function paragraphsHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block, index) => `<p style="margin:${index === 0 ? 0 : "12px"} 0 0;font-size:16px;line-height:25px;color:#374151">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * La mise en page commune : bandeau à la couleur de l'officine, corps, pied de
 * page. Tableaux et styles en ligne, comme l'e-mail du plan : c'est ce que les
 * clients mail rendent de façon fiable.
 */
function frame(options: { subject: string; pharmacyName: string; color: string; heading: string; banner?: string | null; body: string; unsubscribeUrl: string }): string {
  const { pharmacyName, unsubscribeUrl } = options;
  const { reason, retention, noHealth } = footer(pharmacyName, unsubscribeUrl);
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(options.subject)}</title></head>
<body style="margin:0;padding:0;background:#eef1f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f4;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden">
  <tr><td style="background:${options.color};padding:26px 28px 22px">
    <div style="font-size:13px;line-height:18px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.82)">${escapeHtml(pharmacyName)}</div>
    <div style="font-size:24px;line-height:30px;font-weight:700;color:#ffffff;margin-top:6px">${escapeHtml(options.heading)}</div>
  </td></tr>${options.banner ? `\n  <tr><td style="padding:14px 28px 0"><div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:10px 12px;font-size:13px;line-height:18px;color:#9a3412">${escapeHtml(options.banner)}</div></td></tr>` : ""}
  ${options.body}
  <tr><td style="padding:22px 28px 26px">
    <p style="margin:0;font-size:12px;line-height:18px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px">${escapeHtml(reason)} <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280">Se désinscrire</a><br>${escapeHtml(retention)}<br>${escapeHtml(noHealth)}</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

const TEST_BANNER = "MESSAGE DE TEST : ce message n'a été envoyé qu'à vous. Aucun abonné ne l'a reçu.";

/** L'annonce d'une nouvelle gamme, telle qu'un abonné la reçoit. */
export function buildPatientNewsEmail(variables: Branding & { title: string; rangeLabel: string | null; message: string; unsubscribeUrl: string; isTest?: boolean }): EmailMessage {
  const { pharmacyName, pharmacyPhone, title, rangeLabel, message, unsubscribeUrl } = variables;
  const color = safeColor(variables.brandColor);
  const isTest = variables.isTest === true;
  const subject = isTest ? `[TEST] ${title}` : title;
  const notice = "Aucun médicament sur ordonnance n'est présenté dans ce message.";

  const text = [
    ...(isTest ? [TEST_BANNER, ""] : []),
    title,
    ...(rangeLabel ? [`Nouvelle gamme : ${rangeLabel}`] : []),
    "",
    message,
    "",
    notice,
    phoneLine(pharmacyPhone),
    "",
    pharmacyName,
    "",
    "---",
    ...footer(pharmacyName, unsubscribeUrl).lines,
  ].join("\n");

  const range = rangeLabel
    ? `<tr><td style="padding:22px 28px 0">
    <div style="background:#f6f7f9;border-radius:12px;padding:12px 16px">
      <div style="font-size:12px;line-height:16px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;font-weight:600">Nouvelle gamme</div>
      <div style="font-size:17px;line-height:24px;font-weight:600;color:#111827;margin-top:2px">${escapeHtml(rangeLabel)}</div>
    </div>
  </td></tr>`
    : "";
  const body = `${range}
  <tr><td style="padding:22px 28px 0">${paragraphsHtml(message)}</td></tr>
  <tr><td style="padding:22px 28px 0">
    <p style="margin:0;font-size:13px;line-height:19px;color:#6b7280">${escapeHtml(notice)}</p>
    <p style="margin:10px 0 0;font-size:15px;line-height:22px;color:#374151">${phoneHtml(pharmacyPhone)}</p>
    <p style="margin:14px 0 0;font-size:15px;line-height:22px;color:#374151"><strong>${escapeHtml(pharmacyName)}</strong></p>
  </td></tr>`;

  return { subject, text, html: frame({ subject, pharmacyName, color, heading: title, banner: isTest ? TEST_BANNER : null, body, unsubscribeUrl }) };
}

/**
 * Le message de confirmation : il dit au patient ce qu'il a accepté et lui
 * redonne, tout de suite, le moyen de revenir dessus. Il n'annonce rien.
 */
export function buildNewsWelcomeEmail(variables: Branding & { unsubscribeUrl: string }): EmailMessage {
  const { pharmacyName, pharmacyPhone, unsubscribeUrl } = variables;
  const color = safeColor(variables.brandColor);
  const subject = `Vous serez prévenu(e) des nouveautés — ${pharmacyName}`;
  const intro = `Merci : votre accord est enregistré. ${pharmacyName} vous écrira de temps en temps lorsqu'une nouvelle gamme arrive en pharmacie, au plus un message par semaine.`;
  const privacy = "Votre adresse n'est reliée ni à votre ordonnance, ni à votre plan, ni à un médicament.";
  const leave = `Vous changez d'avis ? Se désinscrire, en un clic et sans compte : ${unsubscribeUrl}`;

  const text = ["Bonjour,", "", intro, "", privacy, "", leave, phoneLine(pharmacyPhone), "", pharmacyName, "", "---", ...footer(pharmacyName, unsubscribeUrl).lines].join("\n");

  const body = `<tr><td style="padding:26px 28px 0">
    <p style="margin:0;font-size:18px;line-height:26px;font-weight:600">Bonjour,</p>
    <p style="margin:12px 0 0;font-size:16px;line-height:25px;color:#374151">${escapeHtml(intro)}</p>
    <p style="margin:12px 0 0;font-size:16px;line-height:25px;color:#374151">${escapeHtml(privacy)}</p>
  </td></tr>
  <tr><td style="padding:22px 28px 0">
    <p style="margin:0;font-size:15px;line-height:22px;color:#374151">Vous changez d'avis ? <a href="${escapeHtml(unsubscribeUrl)}" style="color:${color};font-weight:600">Se désinscrire</a>, en un clic et sans compte.</p>
    <p style="margin:10px 0 0;font-size:15px;line-height:22px;color:#374151">${phoneHtml(pharmacyPhone)}</p>
    <p style="margin:14px 0 0;font-size:15px;line-height:22px;color:#374151"><strong>${escapeHtml(pharmacyName)}</strong></p>
  </td></tr>`;

  return { subject, text, html: frame({ subject, pharmacyName, color, heading: "Vos nouveautés", body, unsubscribeUrl }) };
}

/**
 * L'en-tête qui fait apparaître « Se désabonner » dans la messagerie du patient.
 *
 * Seul `List-Unsubscribe` est posé : le lien mène à une page qui demande une
 * confirmation. L'en-tête `List-Unsubscribe-Post` (désinscription en un clic,
 * RFC 8058) promet qu'un POST sur ce lien désinscrit ; la page n'en traite
 * aucun, et la promettre ferait croire au patient qu'il est désinscrit alors
 * qu'il ne l'est pas.
 */
export function newsUnsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  return { "List-Unsubscribe": `<${unsubscribeUrl}>` };
}
