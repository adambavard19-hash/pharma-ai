import { escapeHtml, safeColor } from "@/core/documents/email";
import { FOLLOW_UP_ANSWERS } from "./answers";
import type { FollowUpTemplate, FollowUpVariables } from "./templates";

/**
 * La version HTML d'un message de suivi.
 *
 * Elle ne dit rien de plus que le texte (qui fait foi) : les mêmes phrases,
 * les trois mêmes réponses, le même lien de désinscription. Elle les met en
 * page pour un téléphone : une colonne, de grands boutons, la couleur de
 * l'officine.
 */
export function buildFollowUpEmailHtml(
  template: FollowUpTemplate,
  variables: FollowUpVariables,
  options: { brandColor?: string | null } = {},
): string {
  const color = safeColor(options.brandColor);
  const paragraphs = template
    .body(variables)
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    // Le bloc de question et la signature sont rendus à part, en boutons et en pied.
    .filter((block) => !block.startsWith("Comment allez-vous") && !block.startsWith("Votre plan personnalisé reste") && !block.startsWith("À bientôt") && !block.startsWith("Ce message ne contient") && !block.startsWith("Pour ne plus recevoir"));

  const buttons =
    template.asksFeedback && variables.responseLink
      ? `<tr><td style="padding:22px 28px 0">
    <p style="margin:0 0 12px;font-size:17px;line-height:24px;font-weight:600;color:#111827">Comment allez-vous depuis votre passage ?</p>
    ${FOLLOW_UP_ANSWERS.map(
      (answer) =>
        `<a href="${escapeHtml(`${variables.responseLink}?r=${answer.slug}`)}" style="display:block;margin-top:8px;background:#f6f7f9;color:#111827;text-decoration:none;font-size:16px;line-height:22px;font-weight:600;padding:14px 18px;border-radius:14px;border:1px solid #e5e7eb">${answer.emoji}&nbsp;&nbsp;${escapeHtml(answer.label)}</a>`,
    ).join("")}
  </td></tr>`
      : "";

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(template.subject(variables))}</title></head>
<body style="margin:0;padding:0;background:#eef1f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden">
  <tr><td style="background:${color};padding:22px 28px">
    <div style="font-size:13px;line-height:18px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.82)">${escapeHtml(variables.pharmacyName)}</div>
    <div style="font-size:22px;line-height:28px;font-weight:700;color:#ffffff;margin-top:4px">Des nouvelles de votre pharmacie</div>
  </td></tr>
  <tr><td style="padding:26px 28px 0">
    ${paragraphs.map((block, index) => `<p style="margin:${index === 0 ? 0 : "12px"} 0 0;font-size:${index === 0 ? 18 : 16}px;line-height:${index === 0 ? 26 : 25}px;color:${index === 0 ? "#111827" : "#374151"};${index === 0 ? "font-weight:600" : ""}">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`).join("")}
  </td></tr>
  ${buttons}
  <tr><td style="padding:24px 28px 0" align="center">
    <a href="${escapeHtml(variables.link)}" style="display:block;color:${color};text-decoration:none;font-size:15px;line-height:22px;font-weight:600;padding:12px 22px;border:1.5px solid ${color};border-radius:14px;text-align:center">Revoir mon plan personnalisé</a>
  </td></tr>
  <tr><td style="padding:22px 28px 26px">
    <p style="margin:0;font-size:15px;line-height:22px;color:#374151">À bientôt,<br>L'équipe de la <strong>${escapeHtml(variables.pharmacyName)}</strong></p>
    <p style="margin:16px 0 0;font-size:12px;line-height:18px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px">Ce message ne contient aucune information sur votre santé.<br><a href="${escapeHtml(variables.unsubscribeLink)}" style="color:#6b7280">Ne plus recevoir de suivi</a></p>
  </td></tr>
</table></td></tr></table>
</body></html>`;
}
