import { escapeHtml } from "@/core/documents/email";
import { shell } from "./sales-emails";

/**
 * Les e-mails du site public : l'accusé de réception d'une demande (démo ou
 * abonnement) au pharmacien, et l'alerte à l'équipe PharmaBoost. Rédigés ici,
 * jamais par un prestataire.
 */

export type SiteLeadKind = "DEMO" | "SUBSCRIBE";

export type SiteLeadSummary = {
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
};

const KIND_LABEL: Record<SiteLeadKind, string> = { DEMO: "démonstration", SUBSCRIBE: "abonnement" };

export function buildSiteLeadAcknowledgement(v: SiteLeadSummary & { contactEmail: string }): { subject: string; text: string; html: string } {
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

export function buildSiteLeadAlert(v: SiteLeadSummary & { adminUrl: string }): { subject: string; text: string; html: string } {
  const rows: [string, string | null][] = [
    ["Officine", v.pharmacyName],
    ["Contact", v.contactName],
    ["E-mail", v.email],
    ["Téléphone", v.phone],
    ["Ville", v.city],
    ["Logiciel", v.lgo],
    ["Postes", v.postCount !== null ? String(v.postCount) : null],
    ["Créneau souhaité", v.preferredSlot],
    ["Message", v.message],
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
