import { escapeHtml, type EmailMessage } from "@/core/documents/email";

/**
 * L'e-mail « nouvelle offre » de l'appli des patients (fondateur, 22 oct. 2026) : envoyé une fois, à l'ouverture de l'offre,
 * aux seuls inscrits qui ont coché « Me prévenir des nouvelles offres ». Un lien retire l'accord d'un clic.
 */
export type OfferAlertInput = {
  /** « Pharmacie Saint-Michel » pour une offre de pharmacie, le nom du laboratoire pour une offre de laboratoire. */
  from: string;
  funding: "PHARMACY" | "LAB";
  title: string;
  rangeLabel: string;
  discountPercent: number;
  endsAt: Date;
  /** Réservée aux abonnés et l'inscrit ne l'est pas : on le lui dit, sans cacher l'offre. */
  locked: boolean;
  offerUrl: string;
  unsubscribeUrl: string;
};

const DAY = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });

export function buildOfferAlertEmail(input: OfferAlertInput): EmailMessage {
  const headline = `-${input.discountPercent} % · ${input.rangeLabel}`;
  const where = input.funding === "LAB" ? "dans toutes les pharmacies PharmaBoost" : `chez ${input.from}`;
  const until = `jusqu'au ${DAY.format(input.endsAt)}`;
  const lockedLine = "Cette offre est réservée aux abonnés PharmaBoost+ : ouvrez l'appli pour en profiter.";
  const subject = input.funding === "LAB" ? `Nouvelle offre ${input.from} : ${headline}` : `${input.from} : nouvelle offre ${headline}`;
  const text = [
    "Bonjour,",
    "",
    `Nouvelle offre ${where} : ${input.title}`,
    `${headline}, ${until}.`,
    ...(input.locked ? ["", lockedLine] : []),
    "",
    `Voir l'offre et obtenir votre code : ${input.offerUrl}`,
    "Montrez le code-barres au comptoir : il est bipé une fois.",
    "",
    `Ne plus recevoir ces e-mails : ${input.unsubscribeUrl}`,
    "",
    "PharmaBoost",
  ].join("\n");
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#F4F7F6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0F2B26">
  <div style="max-width:520px;margin:0 auto;padding:24px 16px">
    <div style="background:#fff;border-radius:16px;padding:24px">
      <div style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#0E8A7B;font-weight:700">Nouvelle offre ${escapeHtml(where)}</div>
      <div style="margin-top:10px;font-size:22px;line-height:28px;font-weight:800">${escapeHtml(headline)}</div>
      <p style="margin:8px 0 0;font-size:15px;line-height:22px;color:#374151">${escapeHtml(input.title)} — ${escapeHtml(until)}.</p>
      ${input.locked ? `<p style="margin:12px 0 0;font-size:14px;line-height:21px;color:#92400E;background:#FEF3C7;border-radius:10px;padding:10px 12px">${escapeHtml(lockedLine)}</p>` : ""}
      <p style="margin:20px 0 0"><a href="${escapeHtml(input.offerUrl)}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#0E8A7B;color:#fff;font-weight:700;text-decoration:none">Voir l'offre</a></p>
      <p style="margin:14px 0 0;font-size:13px;line-height:19px;color:#64748B">Montrez le code-barres au comptoir : il est bipé une fois.</p>
    </div>
    <p style="margin:16px 0 0;text-align:center;font-size:12px;line-height:18px;color:#94A3A0">Vous recevez cet e-mail parce que vous avez demandé à être prévenu des nouvelles offres dans l'appli PharmaBoost.<br><a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#94A3A0">Ne plus recevoir ces e-mails</a></p>
  </div>
</body></html>`;
  return { subject, text, html };
}
