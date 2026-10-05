/**
 * Ce que les écrans des campagnes disent, sans React : les adresses de filtre,
 * l'état à afficher (jamais « envoyée » pour un envoi simulé), la ligne de
 * résultat, et les conséquences d'une annulation. Pur, donc testé.
 */
import { CAMPAIGN_KINDS, CAMPAIGN_RECIPIENT_STATUS_LABELS, CAMPAIGN_STATUS_LABELS, type CampaignKindKey } from "@/core/admin/campaigns";
import { REFERRAL_DISCOUNT_CENTS } from "@/core/billing/referral";
import { formatEuros } from "@/core/billing/subscription";
import type { StatusLabel } from "@/core/admin/statuses";

// ---------------------------------------------------------------- Filtres de l'adresse

/** Adresse lisible (`?statut=programmee`) → code de la base. Une valeur inconnue est ignorée. */
export const CAMPAIGN_STATUS_PARAMS = { brouillon: "DRAFT", programmee: "SCHEDULED", "en-cours": "SENDING", envoyee: "SENT", annulee: "CANCELED" } as const;
export const CAMPAIGN_KIND_PARAMS = { bonus: "BONUS_OFFER", parrainage: "REFERRAL_OFFER", partenaires: "PARTNER_INVITATION", annonce: "ANNOUNCEMENT" } as const satisfies Record<string, CampaignKindKey>;
export const RECIPIENT_STATUS_PARAMS = { "en-attente": "PENDING", "en-cours": "SENDING", envoye: "SENT", simule: "SIMULATED", echec: "FAILED", ignore: "SKIPPED" } as const;

type ParamTable = Readonly<Record<string, string>>;

/** Le code désigné par une valeur d'adresse, ou `null`. */
export function codeFromParam<T extends ParamTable>(table: T, value: string | null | undefined): T[keyof T] | null {
  return value && Object.hasOwn(table, value) ? (table[value] as T[keyof T]) : null;
}

/** La valeur d'adresse d'un code, ou `null` (c'est « tous »). */
export function paramFromCode<T extends ParamTable>(table: T, code: string | null | undefined): Extract<keyof T, string> | null {
  const found = Object.entries(table).find(([, value]) => value === code);
  return found ? (found[0] as Extract<keyof T, string>) : null;
}

/** Un paramètre d'adresse : la première valeur, rognée, ou `null`. */
export function firstParam(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.trim() ? v.trim() : null;
}

/** Le numéro de page demandé : un entier ≥ 1. */
export function pageParam(value: string | string[] | undefined): number {
  const parsed = Number.parseInt(firstParam(value) ?? "1", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

/** Même valeur que le service (non exporté) : sert seulement à savoir s'il y a une page suivante. */
export const CAMPAIGNS_PER_PAGE = 20;
export const RECIPIENTS_PER_PAGE = 50;

export const hasNextPage = (page: number, perPage: number, total: number) => page * perPage < total;

// ---------------------------------------------------------------- État affiché

/**
 * L'état d'une campagne tel qu'il se lit. Un envoi simulé n'est jamais
 * « envoyé » : la messagerie n'était pas configurée, aucun e-mail n'est parti.
 */
export function campaignStatusLabel(campaign: { status: string; simulated: boolean }): StatusLabel {
  if (campaign.simulated && campaign.status === "SENT") return { label: "Simulée", tone: "warning" };
  if (campaign.simulated && campaign.status === "SENDING") return { label: "Envoi simulé en cours", tone: "warning" };
  return CAMPAIGN_STATUS_LABELS[campaign.status] ?? { label: campaign.status, tone: "neutral" };
}

export function recipientStatusLabel(status: string): StatusLabel {
  return CAMPAIGN_RECIPIENT_STATUS_LABELS[status] ?? { label: status, tone: "neutral" };
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString("fr-FR")} ${n > 1 ? many : one}`;

/** « 12 envoyés · 1 échec · 2 ignorés » (« simulés » pour un envoi simulé) ; `null` tant que rien n'a été tenté. */
export function resultLine(campaign: { simulated: boolean; sentCount: number; failedCount: number; skippedCount: number; startedAt: Date | null }): string | null {
  if (!campaign.startedAt) return null;
  const sent = campaign.simulated ? count(campaign.sentCount, "simulé", "simulés") : count(campaign.sentCount, "envoyé", "envoyés");
  return [sent, count(campaign.failedCount, "échec", "échecs"), count(campaign.skippedCount, "ignoré", "ignorés")].join(" · ");
}

/** La date que la liste montre, avec ce qu'elle désigne. Une programmation est un jour, pas une heure. */
export function dateLabel(campaign: { status: string; simulated: boolean; scheduledFor: Date | null; startedAt: Date | null; completedAt: Date | null; createdAt: Date }): { caption: string; date: Date; dayOnly: boolean } {
  if (campaign.status === "SCHEDULED" && campaign.scheduledFor) return { caption: "Programmée pour le", date: campaign.scheduledFor, dayOnly: true };
  if (campaign.status === "SENDING" && campaign.startedAt) return { caption: "Démarrée le", date: campaign.startedAt, dayOnly: false };
  if (campaign.status === "SENT" && (campaign.completedAt ?? campaign.startedAt)) return { caption: campaign.simulated ? "Simulée le" : "Envoyée le", date: (campaign.completedAt ?? campaign.startedAt)!, dayOnly: false };
  return { caption: "Créée le", date: campaign.createdAt, dayOnly: false };
}

// ---------------------------------------------------------------- Offre de parrainage

type OfferWindow = { amountCents: number; startsAt: Date; endsAt: Date | null; canceledAt: Date | null };

/** L'offre de parrainage liée : en cours, à venir, échue ou arrêtée (annulation de la campagne). */
export function referralOfferState(offer: OfferWindow, now: Date): StatusLabel {
  if (offer.canceledAt) return { label: "Arrêtée", tone: "neutral" };
  if (offer.endsAt && offer.endsAt.getTime() <= now.getTime()) return { label: "Terminée", tone: "neutral" };
  if (offer.startsAt.getTime() > now.getTime()) return { label: "À venir", tone: "info" };
  return { label: "En cours", tone: "success" };
}

/** Une offre au montant standard et sans fin n'en est pas une : aucune ligne `ReferralOffer` n'est créée. */
export function isStandardOffer(campaign: { offerAmountCents: number | null; offerEndsAt: Date | null }): boolean {
  return campaign.offerAmountCents === REFERRAL_DISCOUNT_CENTS && !campaign.offerEndsAt;
}

/** Ce qu'il faut dire d'une campagne de parrainage qui n'a pas (ou pas encore) d'offre liée. */
export function referralOfferExpectation(campaign: { kind: string; status: string; offerAmountCents: number | null; offerEndsAt: Date | null; referralOffer: unknown }): string | null {
  if (campaign.kind !== "REFERRAL_OFFER" || campaign.referralOffer) return null;
  const standard = isStandardOffer(campaign);
  if (campaign.status === "DRAFT" || campaign.status === "SCHEDULED") {
    return standard
      ? `Ce montant est le montant standard (${formatEuros(REFERRAL_DISCOUNT_CENTS)}) sans date de fin : aucune offre ne sera créée à l'envoi, le message ne fait que rappeler le parrainage.`
      : "L'offre de parrainage sera créée au moment de l'envoi : les officines qui s'inscrivent ensuite comme filleules apportent ce montant par mois.";
  }
  return standard ? `Aucune offre créée : montant standard (${formatEuros(REFERRAL_DISCOUNT_CENTS)}) sans date de fin.` : "Aucune offre de parrainage n'est liée à cette campagne.";
}

// ---------------------------------------------------------------- Conséquences d'une annulation

/** Ce que l'annulation fait, dit avant qu'on la confirme. */
export function cancelConsequences(campaign: { status: string; kind: string }): string[] {
  if (campaign.status === "SCHEDULED") return ["Rien n'est encore parti : la campagne ne partira pas au jour prévu.", "L'annulation est définitive : une campagne annulée ne se reprend pas, il faudra en créer une nouvelle."];
  const lines = [
    "Les destinataires encore en attente sont abandonnés : ils sont marqués « ignorés » et ne recevront rien.",
    "Les messages déjà partis ne se rappellent pas.",
  ];
  if (campaign.kind === "REFERRAL_OFFER") lines.push("L'offre de parrainage liée prend fin : les officines qui s'inscrivent ensuite ne l'obtiennent plus. Les filleuls déjà inscrits gardent leur montant.");
  lines.push("L'annulation est définitive : une campagne annulée ne se reprend pas.");
  return lines;
}

/** Le libellé d'un type, ou le code tel quel s'il est inconnu (jamais une page cassée sur une valeur inattendue). */
export function kindLabel(kind: string): string {
  return Object.hasOwn(CAMPAIGN_KINDS, kind) ? CAMPAIGN_KINDS[kind as CampaignKindKey].label : kind;
}

/** Le montant d'une offre, dit en toutes lettres : c'est ce que l'on confirme. `null` pour un type sans offre. */
export function offerHeadline(kind: string, cents: number | null): string | null {
  if (cents === null) return null;
  if (kind === "REFERRAL_OFFER") return `${formatEuros(cents)} par filleul et par mois`;
  if (kind === "BONUS_OFFER") return `${formatEuros(cents)} de bonus`;
  return formatEuros(cents);
}

/** Ce que l'envoi (ou la programmation) fait de l'offre, dit avant la confirmation. */
export function offerSendLines(kind: string, cents: number | null, hasEnd: boolean, mode: "send" | "schedule"): string[] {
  if (kind === "BONUS_OFFER") return ["Le bonus est annoncé dans le message ; l'équipe l'applique à la main. Aucun crédit automatique n'existe."];
  if (kind !== "REFERRAL_OFFER" || cents === null) return [];
  if (cents === REFERRAL_DISCOUNT_CENTS && !hasEnd) return [`Ce montant est le montant standard (${formatEuros(cents)}) sans date de fin : aucune offre n'est créée, le message ne fait que rappeler le parrainage.`];
  return [
    mode === "send"
      ? `Le montant de ${formatEuros(cents)} par filleul et par mois est réellement appliqué : les officines qui s'inscrivent comme filleules pendant l'offre l'apportent à leur parrain, chaque mois. Les filleuls déjà inscrits gardent leur montant.`
      : "L'offre de parrainage est créée au moment de l'envoi, pas maintenant. Elle s'applique alors aux officines qui s'inscrivent comme filleules ; les filleuls déjà inscrits gardent leur montant.",
  ];
}

/**
 * Les destinataires d'une campagne : le nombre confirmé ou figé, « — » tant
 * qu'il n'a pas été calculé (un brouillon, ou une campagne annulée avant tout
 * envoi). Jamais un zéro inventé.
 */
export function recipientsLabel(campaign: { status: string; recipientCount: number; startedAt: Date | null }): string {
  if (campaign.status === "DRAFT" || (campaign.status === "CANCELED" && !campaign.startedAt)) return "—";
  return campaign.recipientCount.toLocaleString("fr-FR");
}
