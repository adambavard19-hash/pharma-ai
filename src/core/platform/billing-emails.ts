import { escapeHtml } from "@/core/documents/email";
import { button, dateTime, shell } from "./sales-emails";
import { formatEuros, formatFrenchDate } from "@/core/billing/subscription";

/**
 * Les e-mails de l'abonnement : le lien d'activation, la confirmation de
 * souscription, l'échec de paiement, la fin d'essai proche. Rédigés ici,
 * jamais par un prestataire ; aucun identifiant Stripe n'y figure.
 */

export function buildSubscriptionInviteEmail(v: {
  ownerName: string;
  pharmacyName: string;
  planName: string;
  monthlyPriceCents: number;
  trialDays: number;
  url: string;
  expiresAt: Date;
  contactEmail: string;
}): { subject: string; text: string; html: string } {
  const offer = v.trialDays > 0 ? `${v.trialDays === 30 || v.trialDays === 31 ? "Premier mois offert" : `${v.trialDays} jours offerts`}, puis ${formatEuros(v.monthlyPriceCents)} HT par mois.` : `${formatEuros(v.monthlyPriceCents)} HT par mois.`;
  const text = [
    `Bonjour ${v.ownerName},`,
    "",
    `Votre espace PharmaBoost pour ${v.pharmacyName} est prêt. Il ne reste qu'à activer votre abonnement « ${v.planName} » : ${offer}`,
    "Aucun débit pendant la période gratuite ; vous pouvez arrêter avant la fin de l'essai.",
    "",
    `Activer mon abonnement : ${v.url}`,
    "",
    `Ce lien est personnel et reste valable jusqu'au ${dateTime(v.expiresAt)}. Le paiement est sécurisé par Stripe : PharmaBoost ne voit ni ne conserve votre numéro de carte.`,
    `Une question ? ${v.contactEmail}`,
    "",
    "PharmaBoost",
  ].join("\n");
  const html = shell(
    `Activez votre abonnement PharmaBoost — ${v.pharmacyName}`,
    "Activez votre abonnement",
    `<p style="margin:0;font-size:18px;line-height:26px;font-weight:600">Bonjour ${escapeHtml(v.ownerName)},</p><p style="margin:12px 0 0;font-size:16px;line-height:25px;color:#374151">Votre espace PharmaBoost pour <strong>${escapeHtml(v.pharmacyName)}</strong> est prêt. Il ne reste qu'à activer votre abonnement « ${escapeHtml(v.planName)} » : <strong>${escapeHtml(offer)}</strong></p><p style="margin:10px 0 0;font-size:15px;line-height:23px;color:#374151">Aucun débit pendant la période gratuite ; vous pouvez arrêter avant la fin de l'essai.</p>${button(v.url, "Activer mon abonnement", "#0F766E")}<p style="margin:18px 0 0;font-size:13px;line-height:19px;color:#6b7280">Ce lien est personnel et reste valable jusqu'au ${escapeHtml(dateTime(v.expiresAt))}. Le paiement est sécurisé par Stripe : PharmaBoost ne voit ni ne conserve votre numéro de carte.<br>Une question ? ${escapeHtml(v.contactEmail)}</p>`,
    "#0F766E",
  );
  return { subject: `Activez votre abonnement PharmaBoost — ${v.pharmacyName}`, text, html };
}

export function buildSubscriptionStartedEmail(v: { ownerName: string; pharmacyName: string; planName: string; monthlyPriceCents: number; trialEndsAt: Date | null; appUrl: string }): { subject: string; text: string; html: string } {
  const next = v.trialEndsAt ? `Votre premier mois est offert : le premier prélèvement de ${formatEuros(v.monthlyPriceCents)} HT aura lieu le ${formatFrenchDate(v.trialEndsAt)}.` : `Votre abonnement de ${formatEuros(v.monthlyPriceCents)} HT par mois est actif.`;
  const text = [`Bonjour ${v.ownerName},`, "", `Votre abonnement PharmaBoost « ${v.planName} » pour ${v.pharmacyName} est activé. ${next}`, "", `Ouvrir PharmaBoost : ${v.appUrl}`, "", "Vous pouvez gérer votre moyen de paiement et vos factures depuis Paramètres → Mon abonnement.", "", "PharmaBoost"].join("\n");
  const html = shell(
    `Abonnement activé — ${v.pharmacyName}`,
    "Bienvenue dans PharmaBoost",
    `<p style="margin:0;font-size:18px;line-height:26px;font-weight:600">Bonjour ${escapeHtml(v.ownerName)},</p><p style="margin:12px 0 0;font-size:16px;line-height:25px;color:#374151">Votre abonnement PharmaBoost « ${escapeHtml(v.planName)} » pour <strong>${escapeHtml(v.pharmacyName)}</strong> est activé. ${escapeHtml(next)}</p>${button(v.appUrl, "Ouvrir PharmaBoost", "#0F766E")}<p style="margin:18px 0 0;font-size:13px;line-height:19px;color:#6b7280">Vous pouvez gérer votre moyen de paiement et vos factures depuis Paramètres → Mon abonnement.</p>`,
    "#0F766E",
  );
  return { subject: `Votre abonnement PharmaBoost est activé — ${v.pharmacyName}`, text, html };
}

export function buildPaymentFailedEmail(v: { ownerName: string; pharmacyName: string; amountCents: number; nextAttemptAt: Date | null; manageUrl: string }): { subject: string; text: string; html: string } {
  const retry = v.nextAttemptAt ? `Une nouvelle tentative aura lieu le ${formatFrenchDate(v.nextAttemptAt)}.` : "Aucune nouvelle tentative n'est programmée.";
  const text = [`Bonjour ${v.ownerName},`, "", `Le prélèvement de ${formatEuros(v.amountCents)} pour l'abonnement PharmaBoost de ${v.pharmacyName} a échoué. ${retry}`, "", `Mettre à jour mon moyen de paiement : ${v.manageUrl}`, "", "Sans régularisation, l'accès à PharmaBoost pourra être suspendu.", "", "PharmaBoost"].join("\n");
  const html = shell(
    `Paiement échoué — ${v.pharmacyName}`,
    "Un prélèvement a échoué",
    `<p style="margin:0;font-size:18px;line-height:26px;font-weight:600">Bonjour ${escapeHtml(v.ownerName)},</p><p style="margin:12px 0 0;font-size:16px;line-height:25px;color:#374151">Le prélèvement de <strong>${escapeHtml(formatEuros(v.amountCents))}</strong> pour l'abonnement PharmaBoost de <strong>${escapeHtml(v.pharmacyName)}</strong> a échoué. ${escapeHtml(retry)}</p>${button(v.manageUrl, "Mettre à jour mon moyen de paiement", "#b45309")}<p style="margin:18px 0 0;font-size:13px;line-height:19px;color:#6b7280">Sans régularisation, l'accès à PharmaBoost pourra être suspendu.</p>`,
    "#b45309",
  );
  return { subject: `Paiement échoué — abonnement PharmaBoost de ${v.pharmacyName}`, text, html };
}

export function buildTrialEndingEmail(v: { ownerName: string; pharmacyName: string; monthlyPriceCents: number; trialEndsAt: Date; manageUrl: string }): { subject: string; text: string; html: string } {
  const text = [`Bonjour ${v.ownerName},`, "", `Votre mois offert sur PharmaBoost (${v.pharmacyName}) se termine le ${formatFrenchDate(v.trialEndsAt)}. À cette date, le premier prélèvement de ${formatEuros(v.monthlyPriceCents)} HT aura lieu sur le moyen de paiement enregistré.`, "", `Vérifier mon moyen de paiement : ${v.manageUrl}`, "", "PharmaBoost"].join("\n");
  const html = shell(
    `Fin de votre mois offert — ${v.pharmacyName}`,
    "Votre mois offert se termine bientôt",
    `<p style="margin:0;font-size:18px;line-height:26px;font-weight:600">Bonjour ${escapeHtml(v.ownerName)},</p><p style="margin:12px 0 0;font-size:16px;line-height:25px;color:#374151">Votre mois offert sur PharmaBoost (<strong>${escapeHtml(v.pharmacyName)}</strong>) se termine le <strong>${escapeHtml(formatFrenchDate(v.trialEndsAt))}</strong>. À cette date, le premier prélèvement de ${escapeHtml(formatEuros(v.monthlyPriceCents))} HT aura lieu sur le moyen de paiement enregistré.</p>${button(v.manageUrl, "Vérifier mon moyen de paiement", "#0F766E")}`,
    "#0F766E",
  );
  return { subject: `Votre mois offert PharmaBoost se termine le ${formatFrenchDate(v.trialEndsAt)}`, text, html };
}
