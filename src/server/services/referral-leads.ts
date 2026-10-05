import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { recordProspectEvent, type SalesActor } from "@/server/services/sales/events";
import { notifyAdmins } from "@/server/services/sales/notifications";
import { referralAmountForNewFilleul } from "@/server/services/referral-offers";
import { resolveReferralCode } from "@/server/services/referral";
import { REFERRAL_DISCOUNT_PERCENT } from "@/core/billing/referral";
import type { NormalizedReferee } from "@/core/contracts/subscription-request";

/**
 * Les confrères proposés au parrainage.
 *
 * À l'inscription, une officine peut indiquer un confrère (e-mail, téléphone) à
 * parrainer. Rien n'est envoyé à cette personne, ni e-mail ni SMS : l'équipe la
 * contacte. Si elle ouvre ensuite son propre dossier avec la même adresse e-mail,
 * le dossier lui est rattaché ; et si son officine est créée, elle devient la
 * filleule de l'officine qui l'a proposée : son parrain passe à 20 % de moins par
 * mois (la remise est calculée dans core/billing/referral, appliquée par l'équipe).
 *
 * Statuts : NEW (à contacter) · CONTACTED · LINKED (la personne a ouvert son
 * dossier, rapprochée par son e-mail) · DECLINED.
 */

export const REFERRAL_LEAD_STATUSES = ["NEW", "CONTACTED", "LINKED", "DECLINED"] as const;
export type ReferralLeadStatus = (typeof REFERRAL_LEAD_STATUSES)[number];

export const REFERRAL_LEAD_STATUS_LABELS: Record<ReferralLeadStatus, string> = {
  NEW: "À contacter",
  CONTACTED: "Contacté",
  LINKED: "Dossier ouvert",
  DECLINED: "Décliné",
};

/** Les statuts qu'un administrateur fixe à la main : « Contacté » ou « Décliné ». « Dossier ouvert » vient du rapprochement seul. */
export const MANUAL_LEAD_STATUSES = ["CONTACTED", "DECLINED"] as const;
export type ManualLeadStatus = (typeof MANUAL_LEAD_STATUSES)[number];

/** Les confrères qu'un nouveau dossier peut encore rejoindre : ni déjà rapprochés, ni déclinés. */
const OPEN_STATUSES = ["NEW", "CONTACTED"];

const SYSTEM_SITE: SalesActor = { type: "SYSTEM", label: "Site PharmaBoost" };

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

const describeReferee = (referee: { name: string | null; email: string; phone: string }) => [referee.name, referee.email, referee.phone].filter(Boolean).join(" · ");

// ---------------------------------------------------------------- Proposer un confrère

/**
 * Enregistre le confrère que l'officine propose de parrainer : la fiche, un
 * événement sur son dossier, une notification à l'équipe et une trace d'audit
 * SANS donnée personnelle. Un même e-mail déjà proposé par le même dossier ne
 * crée pas de doublon (rien d'autre n'est écrit non plus).
 */
export async function proposeReferee(input: { referrerProspectId: string; referrerName: string; referee: NormalizedReferee; actor?: SalesActor }): Promise<{ created: boolean; leadId: string }> {
  const { referrerProspectId, referee } = input;
  const email = referee.email.trim().toLowerCase();
  const existing = await prisma.referralLead.findFirst({ where: { referrerProspectId, email: { equals: email, mode: "insensitive" } }, select: { id: true } });
  if (existing) return { created: false, leadId: existing.id };

  const lead = await prisma.referralLead.create({
    data: { referrerProspectId, contactName: referee.name, email, phone: referee.phone, status: "NEW" },
    select: { id: true },
  });
  const described = describeReferee({ ...referee, email });
  await recordProspectEvent({ prospectId: referrerProspectId, type: "NOTE", summary: `Confrère proposé au parrainage : ${described}`, actor: input.actor ?? SYSTEM_SITE, metadata: { referralLeadId: lead.id } });
  await notifyAdmins({
    type: "REFERRAL_LEAD",
    title: `Confrère proposé au parrainage — ${input.referrerName}`,
    body: `${input.referrerName} propose ${described}. À contacter par l'équipe : rien n'a été envoyé à cette personne.`,
    linkUrl: `/admin/dossiers/${referrerProspectId}`,
    severity: "INFO",
  });
  await recordAudit({ action: "referral.lead_proposed", entityType: "ReferralLead", entityId: lead.id, metadata: { referrerProspectId } });
  return { created: true, leadId: lead.id };
}

// ---------------------------------------------------------------- Rapprochement par l'e-mail

/**
 * Un NOUVEAU dossier dont l'e-mail est celui d'un confrère proposé (statut NEW ou
 * CONTACTED, casse ignorée) lui est rattaché : le confrère passe LINKED, un
 * événement est écrit sur les deux dossiers. Un seul confrère par dossier
 * parrainé (clé unique), le plus anciennement proposé l'emporte.
 *
 * Ne lève jamais : le rapprochement est un accessoire de la création du dossier,
 * qui existe déjà. Une panne ici est journalisée, le dossier n'en est pas affecté.
 */
export async function reconcileNewProspect(prospect: { id: string; email: string | null; name: string }, actor: SalesActor): Promise<{ linked: boolean; leadId: string | null }> {
  const none = { linked: false, leadId: null };
  const email = prospect.email?.trim();
  if (!email) return none;
  try {
    const lead = await prisma.referralLead.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, status: { in: OPEN_STATUSES }, referredProspectId: null, referrerProspectId: { not: prospect.id } },
      orderBy: { createdAt: "asc" },
      select: { id: true, referrerProspectId: true, referrerProspect: { select: { name: true } } },
    });
    if (!lead) return none;
    // Conditionnel : si deux dossiers se créent en même temps pour la même adresse, un seul gagne.
    const claimed = await prisma.referralLead.updateMany({ where: { id: lead.id, referredProspectId: null, status: { in: OPEN_STATUSES } }, data: { referredProspectId: prospect.id, status: "LINKED" } });
    if (claimed.count !== 1) return none;
    await recordProspectEvent({ prospectId: prospect.id, type: "NOTE", summary: `Confrère proposé au parrainage par « ${lead.referrerProspect.name} » : ce dossier lui est rattaché.`, actor, metadata: { referralLeadId: lead.id, referrerProspectId: lead.referrerProspectId } });
    await recordProspectEvent({ prospectId: lead.referrerProspectId, type: "NOTE", summary: `Le confrère proposé au parrainage a ouvert son dossier : « ${prospect.name} ».`, actor, metadata: { referralLeadId: lead.id, referredProspectId: prospect.id } });
    await recordAudit({ action: "referral.lead_linked", entityType: "ReferralLead", entityId: lead.id, metadata: { referrerProspectId: lead.referrerProspectId, referredProspectId: prospect.id } });
    return { linked: true, leadId: lead.id };
  } catch (error) {
    if (!isUniqueViolation(error)) console.error("[parrainage] rapprochement du confrère impossible", error);
    return none;
  }
}

// ---------------------------------------------------------------- Rattachement à la création de l'officine

export type LeadReferrer = { id: string; name: string; prospectId: string };

/** L'officine qui a proposé ce dossier comme confrère, si elle existe déjà ; `null` sinon (pas de confrère proposé, ou son dossier n'a pas encore d'officine). */
export async function referrerFromLead(prospectId: string): Promise<LeadReferrer | null> {
  const lead = await prisma.referralLead.findUnique({
    where: { referredProspectId: prospectId },
    select: { referrerProspect: { select: { id: true, pharmacy: { select: { id: true, name: true } } } } },
  });
  const pharmacy = lead?.referrerProspect.pharmacy;
  return lead && pharmacy ? { id: pharmacy.id, name: pharmacy.name, prospectId: lead.referrerProspect.id } : null;
}

/** Ce qu'on écrit sur les deux dossiers quand l'officine du confrère est rattachée à son parrain. */
export async function recordLeadAttachment(input: { referredProspectId: string; referredName: string; referrer: LeadReferrer; actor: SalesActor }): Promise<void> {
  const { referrer, actor } = input;
  await recordProspectEvent({ prospectId: input.referredProspectId, type: "NOTE", summary: `Parrainage rattaché : l'officine est la filleule de « ${referrer.name} » (confrère proposé à son inscription).`, actor, metadata: { referrerPharmacyId: referrer.id } });
  await recordProspectEvent({ prospectId: referrer.prospectId, type: "NOTE", summary: `L'officine « ${input.referredName} », proposée au parrainage par ce dossier, est créée : elle est votre filleule, votre abonnement passe à ${REFERRAL_DISCOUNT_PERCENT} % de moins par mois.`, actor, metadata: { referredProspectId: input.referredProspectId } });
}

/**
 * Pour une officine créée directement dans la console (le dossier est ouvert
 * après elle) : si son dossier est celui d'un confrère proposé, et qu'elle n'a pas
 * de parrain, l'officine qui l'a proposée devient son parrain. Ne change rien
 * quand un parrain est déjà renseigné. Ne lève jamais : l'officine existe déjà.
 */
export async function attachReferrerFromLead(input: { prospectId: string; pharmacyId: string; pharmacyName: string; actor: SalesActor }): Promise<{ attached: boolean }> {
  try {
    const referrer = await referrerFromLead(input.prospectId);
    if (!referrer || referrer.id === input.pharmacyId) return { attached: false };
    const referralAmountCents = await referralAmountForNewFilleul();
    const claimed = await prisma.pharmacy.updateMany({ where: { id: input.pharmacyId, referredById: null }, data: { referredById: referrer.id, referralAmountCents } });
    if (claimed.count !== 1) return { attached: false };
    await recordLeadAttachment({ referredProspectId: input.prospectId, referredName: input.pharmacyName, referrer, actor: input.actor });
    return { attached: true };
  } catch (error) {
    console.error("[parrainage] rattachement au parrain impossible", error);
    return { attached: false };
  }
}

// ---------------------------------------------------------------- Console : fiche du dossier

export type ReferralPanelData = {
  /** Les confrères que CE dossier a proposés. */
  proposed: { id: string; name: string | null; email: string; phone: string; status: ReferralLeadStatus; createdAt: Date; linkedProspect: { id: string; name: string } | null }[];
  /** Le parrain de CE dossier : le dossier qui l'a proposé comme confrère, et/ou l'officine dont il a saisi le code. */
  referredBy: { viaLead: { prospectId: string; name: string; pharmacyId: string | null } | null; viaCode: { code: string; pharmacyId: string; name: string } | null };
};

export async function loadReferralPanel(prospectId: string): Promise<ReferralPanelData> {
  const [proposed, referredFrom, prospect] = await Promise.all([
    prisma.referralLead.findMany({
      where: { referrerProspectId: prospectId },
      orderBy: { createdAt: "asc" },
      select: { id: true, contactName: true, email: true, phone: true, status: true, createdAt: true, referredProspect: { select: { id: true, name: true } } },
    }),
    prisma.referralLead.findUnique({ where: { referredProspectId: prospectId }, select: { referrerProspect: { select: { id: true, name: true, pharmacyId: true } } } }),
    prisma.prospect.findUnique({ where: { id: prospectId }, select: { referralCode: true } }),
  ]);
  const byCode = prospect?.referralCode ? await resolveReferralCode(prospect.referralCode) : null;
  return {
    proposed: proposed.map((lead) => ({
      id: lead.id,
      name: lead.contactName,
      email: lead.email,
      phone: lead.phone,
      status: (REFERRAL_LEAD_STATUSES as readonly string[]).includes(lead.status) ? (lead.status as ReferralLeadStatus) : "NEW",
      createdAt: lead.createdAt,
      linkedProspect: lead.referredProspect,
    })),
    referredBy: {
      viaLead: referredFrom ? { prospectId: referredFrom.referrerProspect.id, name: referredFrom.referrerProspect.name, pharmacyId: referredFrom.referrerProspect.pharmacyId } : null,
      viaCode: byCode && prospect?.referralCode ? { code: prospect.referralCode, pharmacyId: byCode.id, name: byCode.name } : null,
    },
  };
}

// ---------------------------------------------------------------- Console : marquer « Contacté » ou « Décliné »

type AdminActor = SalesActor & { type: "ADMIN" };

/**
 * Marque un confrère « Contacté » ou « Décliné ». Un confrère déjà rapproché
 * (« Dossier ouvert ») ne se change plus à la main : c'est un fait, pas un avis.
 * Un confrère décliné peut être repassé « Contacté » (erreur corrigée).
 */
export async function setReferralLeadStatus(leadId: string, status: ManualLeadStatus, actor: AdminActor): Promise<{ ok: true; changed: boolean; referrerProspectId: string } | { ok: false; error: string }> {
  const lead = await prisma.referralLead.findUnique({ where: { id: leadId }, select: { id: true, status: true, email: true, referrerProspectId: true } });
  if (!lead) return { ok: false, error: "Confrère introuvable." };
  if (lead.status === "LINKED") return { ok: false, error: "Ce confrère a déjà ouvert son dossier : son statut ne se change plus à la main." };
  if (lead.status === status) return { ok: true, changed: false, referrerProspectId: lead.referrerProspectId };
  // Conditionnel : si le confrère vient d'être rapproché, rien n'est écrasé.
  const updated = await prisma.referralLead.updateMany({ where: { id: lead.id, status: { in: ["NEW", "CONTACTED", "DECLINED"] } }, data: { status } });
  if (updated.count !== 1) return { ok: false, error: "Ce confrère vient de changer : rechargez la page." };
  await recordProspectEvent({ prospectId: lead.referrerProspectId, type: "NOTE", summary: `Confrère proposé au parrainage (${lead.email}) : marqué « ${REFERRAL_LEAD_STATUS_LABELS[status]} ».`, actor, metadata: { referralLeadId: lead.id, from: lead.status, to: status } });
  await recordAudit({ action: "referral.lead_status_changed", entityType: "ReferralLead", entityId: lead.id, platformAdminId: actor.id, metadata: { referrerProspectId: lead.referrerProspectId, from: lead.status, to: status } });
  return { ok: true, changed: true, referrerProspectId: lead.referrerProspectId };
}
