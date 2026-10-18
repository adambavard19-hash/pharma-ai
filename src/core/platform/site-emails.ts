import { escapeHtml } from "@/core/documents/email";
import { shell } from "./sales-emails";
import { formatDemoSlot, googleCalendarLink } from "@/core/site/demo-slots";

/**
 * Les e-mails du site public : l'accusé de réception d'une demande (démo ou
 * abonnement) au pharmacien, et l'alerte à l'équipe PharmaBoost. Rédigés ici,
 * jamais par un prestataire.
 */

export type SiteLeadKind = "DEMO" | "SUBSCRIBE";

export type SiteLeadSummary = { /** Le commercial dont le lien a amené la demande (17 oct. 2026). */ salesRepName?: string | null;
  kind: SiteLeadKind;
  pharmacyName: string;
  contactName: string;
  email: string;
  phone: string | null;
  city: string | null;
  lgo: string | null;
  postCount: number | null;
  message: string | null;
  preferredSlot: string | null;
  /** Le créneau de démonstration réservé sur le site, s'il y en a un. */
  demoAt?: Date | null;
};

const KIND_LABEL: Record<SiteLeadKind, string> = { DEMO: "démonstration", SUBSCRIBE: "abonnement" };

export function buildSiteLeadAcknowledgement(v: SiteLeadSummary & { contactEmail: string }): { subject: string; text: string; html: string } {
  if (v.kind === "DEMO" && v.demoAt) return buildDemoConfirmation({ ...v, demoAt: v.demoAt });
  const next =
    v.kind === "DEMO"
      ? "Nous vous rappelons sous un jour ouvré pour fixer un créneau de vingt minutes, en visio ou par téléphone, sur votre poste de comptoir."
      : "Nous préparons votre espace et vous envoyons sous un jour ouvré votre contrat à signer en ligne, avec le mandat de prélèvement.";
  const text = [
    `Bonjour ${v.contactName},`,
    "",
    `Nous avons bien reçu votre demande de ${KIND_LABEL[v.kind]} pour ${v.pharmacyName}.`,
    next,
    "",
    `Une question entre-temps ? ${v.contactEmail}`,
    "",
    "PharmaBoost",
  ].join("\n");
  const html = shell(
    `Votre demande de ${KIND_LABEL[v.kind]} — PharmaBoost`,
    "Demande bien reçue",
    `<p style="margin:0;font-size:18px;line-height:26px;font-weight:600">Bonjour ${escapeHtml(v.contactName)},</p><p style="margin:12px 0 0;font-size:16px;line-height:25px;color:#374151">Nous avons bien reçu votre demande de ${KIND_LABEL[v.kind]} pour <strong>${escapeHtml(v.pharmacyName)}</strong>.</p><p style="margin:10px 0 0;font-size:15px;line-height:23px;color:#374151">${escapeHtml(next)}</p><p style="margin:18px 0 0;font-size:13px;line-height:19px;color:#6b7280">Une question entre-temps ? ${escapeHtml(v.contactEmail)}</p>`,
    "#0F766E",
  );
  return { subject: `Votre demande de ${KIND_LABEL[v.kind]} — PharmaBoost`, text, html };
}

/** La démo réservée sur le site : le créneau est confirmé, on dit quand et à quel numéro on appelle. */
function buildDemoConfirmation(v: SiteLeadSummary & { contactEmail: string; demoAt: Date }): { subject: string; text: string; html: string } {
  const when = formatDemoSlot(v.demoAt);
  const whenLower = when.charAt(0).toLowerCase() + when.slice(1);
  const call = v.phone ? `Nous vous appelons au ${v.phone} à cette heure-là.` : "Nous vous appelons à cette heure-là.";
  const calendar = googleCalendarLink(v.demoAt, `Démonstration PharmaBoost pour ${v.pharmacyName} : appel de 20 minutes${v.phone ? ` au ${v.phone}` : ""}. Une question : ${v.contactEmail}`);
  const subject = `Démo confirmée ${whenLower} — PharmaBoost`;
  const text = [
    `Bonjour ${v.contactName},`,
    "",
    `Votre démonstration de PharmaBoost pour ${v.pharmacyName} est confirmée :`,
    `${when} (heure de Paris), 20 minutes.`,
    call,
    "Nous vous montrons PharmaBoost en direct, sur votre poste de comptoir.",
    "",
    `Ajouter à mon agenda : ${calendar}`,
    `Un empêchement ? Répondez à cet e-mail ou écrivez à ${v.contactEmail} : nous trouvons un autre créneau.`,
    "",
    "PharmaBoost",
  ].join("\n");
  const html = shell(
    subject,
    "Votre démo est confirmée",
    `<p style="margin:0;font-size:18px;line-height:26px;font-weight:600">Bonjour ${escapeHtml(v.contactName)},</p><p style="margin:12px 0 0;font-size:16px;line-height:25px;color:#374151">Votre démonstration de PharmaBoost pour <strong>${escapeHtml(v.pharmacyName)}</strong> est confirmée.</p><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:18px 0 0;border-collapse:separate;background:#ECFDF5;border:1px solid #A7F3D0;border-radius:12px"><tr><td style="padding:16px 18px"><p style="margin:0;font-size:12px;line-height:16px;letter-spacing:0.08em;text-transform:uppercase;color:#047857;font-weight:700">Rendez-vous</p><p style="margin:6px 0 0;font-size:20px;line-height:28px;font-weight:700;color:#064E3B">${escapeHtml(when)}</p><p style="margin:4px 0 0;font-size:14px;line-height:21px;color:#065F46">Heure de Paris · 20 minutes${v.phone ? ` · appel au ${escapeHtml(v.phone)}` : ""}</p></td></tr></table><p style="margin:16px 0 0;font-size:15px;line-height:23px;color:#374151">${escapeHtml(call)} Nous vous montrons PharmaBoost en direct, sur votre poste de comptoir.</p><p style="margin:18px 0 0"><a href="${escapeHtml(calendar)}" style="display:inline-block;background:#0F766E;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 20px;border-radius:10px">Ajouter à mon agenda</a></p><p style="margin:18px 0 0;font-size:13px;line-height:19px;color:#6b7280">Un empêchement ? Répondez à cet e-mail ou écrivez à ${escapeHtml(v.contactEmail)} : nous trouvons un autre créneau.</p>`,
    "#0F766E",
  );
  return { subject, text, html };
}

export function buildSiteLeadAlert(v: SiteLeadSummary & { adminUrl: string }): { subject: string; text: string; html: string } {
  const rows: [string, string | null][] = [
    ["Officine", v.pharmacyName],
    ["Contact", v.contactName],
    ["E-mail", v.email],
    ["Téléphone", v.phone],
    ["Ville", v.city],
    ["Logiciel", v.lgo],
    ["Postes", v.postCount !== null ? String(v.postCount) : null],
    ["Démo réservée", v.demoAt ? `${formatDemoSlot(v.demoAt)} (heure de Paris)` : null],
    ["Créneau souhaité", v.preferredSlot],
    ["Message", v.message],
    ["Apporté par", v.salesRepName ?? null],
  ];
  const kept = rows.filter((row): row is [string, string] => Boolean(row[1]));
  const text = [`Nouvelle demande de ${KIND_LABEL[v.kind]} depuis le site.`, "", ...kept.map(([label, value]) => `${label} : ${value}`), "", `Dossier : ${v.adminUrl}`].join("\n");
  const html = shell(
    `Nouvelle demande de ${KIND_LABEL[v.kind]} — ${v.pharmacyName}`,
    `Nouvelle demande de ${KIND_LABEL[v.kind]}`,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:15px;line-height:23px;color:#374151">${kept.map(([label, value]) => `<tr><td style="padding:2px 14px 2px 0;color:#6b7280;vertical-align:top">${escapeHtml(label)}</td><td style="padding:2px 0">${escapeHtml(value)}</td></tr>`).join("")}</table><p style="margin:18px 0 0;font-size:14px"><a href="${escapeHtml(v.adminUrl)}" style="color:#0F766E">Ouvrir le dossier dans la console</a></p>`,
    "#0F766E",
  );
  return { subject: `Nouvelle demande de ${KIND_LABEL[v.kind]} — ${v.pharmacyName}`, text, html };
}
