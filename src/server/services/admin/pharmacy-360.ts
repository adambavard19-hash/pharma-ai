import "server-only";
import { prisma } from "@/server/db/client";
import type { Prisma } from "@/generated/prisma";
import { catalogDiffers, contractualPrice } from "@/core/billing/contract-price";
import { agentVersionState } from "@/core/admin/agent-version";
import { mergeTimeline, filterTimeline, type TimelineEntry, type TimelineKind } from "@/core/admin/timeline";
import {
  auditEntry,
  billingEventEntry,
  cancellationEventEntry,
  connectorState,
  contractEntries,
  counterPostState,
  emailEntry,
  noteEntry,
  paymentEntry,
  priceChangeEntry,
  prospectEventEntry,
  relaunchContext,
  subscriptionEntries,
  teamLastLogin,
} from "@/core/admin/clients";
import { listNotes } from "./notes";
import { namesFor } from "./clients";

/**
 * La fiche 360° d'une officine cliente : identité, abonnement, contrats,
 * paiements, comptes, état technique, communications, dossier commercial,
 * notes internes et frise. Des faits d'entreprise uniquement : aucune table
 * clinique n'est lue (ni patient, ni ordonnance, ni analyse).
 *
 * `loadPharmacy360` charge le socle commun (en-tête, onglets, aperçu) ; chaque
 * onglet détaillé a son propre chargeur, qui ne s'exécute que s'il est ouvert.
 */

const PHARMACY_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  addressLine1: true,
  addressLine2: true,
  postalCode: true,
  city: true,
  finessNumber: true,
  siret: true,
  postCount: true,
  brandColor: true,
  isActive: true,
  isDemo: true,
  createdAt: true,
  onboardingCompletedAt: true,
  stockSyncedAt: true,
  organizationId: true,
  referralCode: true,
  /** Ce que cette officine apporte à son parrain par mois, figé à son inscription (null : le montant standard). */
  referralAmountCents: true,
  /** La fonction « nouveautés pour les patients » est-elle activée ? (un réglage, jamais une liste de patients) */
  patientNewsEnabled: true,
  organization: {
    select: {
      name: true,
      // Les officines du même groupe : leurs e-mails de facturation (portés par l'organisation) concernent aussi celle-ci.
      pharmacies: { orderBy: { createdAt: "asc" as const }, take: 100, select: { id: true } },
      subscription: {
        select: {
          id: true,
          status: true,
          trialStartsAt: true,
          trialEndsAt: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          cancelAt: true,
          canceledAt: true,
          endedAt: true,
          stripeSubscriptionId: true,
          nextInvoiceAt: true,
          lastPaymentAt: true,
          lastPaymentCents: true,
          lastPaymentFailedAt: true,
          suspendedAt: true,
          suspendedReason: true,
          contractId: true,
          contractPriceCents: true,
          createdAt: true,
          plan: { select: { id: true, name: true, monthlyPriceCents: true, trialDays: true } },
        },
      },
    },
  },
  referredBy: { select: { id: true, name: true } },
  referrals: { orderBy: { createdAt: "asc" as const }, select: { id: true, name: true, city: true, isActive: true, referralAmountCents: true } },
  memberships: {
    where: { user: { deletedAt: null } },
    // L'ordre choisi par le titulaire pour son équipe, puis l'ancienneté.
    orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
    select: { id: true, role: true, isActive: true, isPrincipal: true, createdAt: true, user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, rppsNumber: true, lastLoginAt: true, status: true, _count: { select: { memberships: true } } } } },
  },
  prospect: {
    select: {
      id: true,
      status: true,
      name: true,
      legalName: true,
      siret: true,
      addressLine1: true,
      postalCode: true,
      city: true,
      ownerName: true,
      email: true,
      phone: true,
      duplicateWarning: true,
      origin: true,
      demoAt: true,
      demoDoneAt: true,
      lastContactAt: true,
      nextActionAt: true,
      nextActionLabel: true,
      notes: true,
      monthlyPriceCents: true,
      blockedAt: true,
      blockedReason: true,
      lostReason: true,
      createdAt: true,
      salesRep: { select: { id: true, firstName: true, lastName: true, email: true } },
      contracts: { orderBy: { version: "desc" as const }, take: 1, select: { status: true, signedArchivedAt: true } },
    },
  },
  stockConnection: { select: { lgo: true, status: true, agentVersion: true, hostname: true, lastSeenAt: true, lastSyncAt: true, lastSyncLines: true, lastError: true, pairedAt: true, intervalSeconds: true } },
  postCountChanges: { orderBy: { createdAt: "desc" as const }, take: 5, select: { previous: true, next: true, actorLabel: true, createdAt: true } },
} satisfies Prisma.PharmacySelect;

const CONTRACT_SELECT = {
  id: true,
  prospectId: true,
  pharmacyId: true,
  version: true,
  reference: true,
  status: true,
  monthlyPriceCents: true,
  durationMonths: true,
  trialDays: true,
  pharmacySignerName: true,
  pharmacySignerEmail: true,
  signatureProvider: true,
  reminderCount: true,
  lastReminderAt: true,
  escalatedAt: true,
  signedArchivedAt: true,
  startDate: true,
  sentAt: true,
  openedAt: true,
  pharmacySignedAt: true,
  companySignedAt: true,
  finalizedAt: true,
  refusedAt: true,
  refusalReason: true,
  expiresAt: true,
  createdAt: true,
  plan: { select: { name: true } },
} satisfies Prisma.ContractSelect;

export async function loadPharmacy360(id: string, now: Date = new Date()) {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id }, select: PHARMACY_SELECT });
  if (!pharmacy) return null;
  const prospectId = pharmacy.prospect?.id ?? null;
  const subscription = pharmacy.organization.subscription;
  const communicationWhere = communicationFilter(pharmacy);

  // Toutes les versions de contrat : celles du dossier et celles rattachées directement à l'officine.
  const [contracts, paymentCount, noteCount, emailCount, openIncidents, cancellationOpen] = await Promise.all([
    prisma.contract.findMany({ where: { OR: [{ pharmacyId: pharmacy.id }, ...(prospectId ? [{ prospectId }] : [])] }, orderBy: [{ createdAt: "desc" }], select: CONTRACT_SELECT }),
    prisma.billingPayment.count({ where: { organizationId: pharmacy.organizationId } }),
    prisma.adminNote.count({ where: { OR: [{ pharmacyId: pharmacy.id }, ...(prospectId ? [{ prospectId }] : [])] } }),
    prisma.emailDispatch.count({ where: communicationWhere }),
    prisma.platformIncident.count({ where: { pharmacyId: pharmacy.id, resolvedAt: null } }),
    prisma.cancellationRequest.findFirst({ where: { pharmacyId: pharmacy.id, status: { in: ["RECEIVED", "IN_PROGRESS", "CONFIRMED"] } }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, requestedAt: true, plannedEndAt: true } }),
  ]);

  const owners = pharmacy.memberships.filter((m) => m.role === "OWNER");
  const owner = owners.find((m) => m.isPrincipal && m.isActive) ?? owners.find((m) => m.isActive) ?? owners[0] ?? null;
  const latestContract = contracts[0] ?? null;
  const price = subscription ? contractualPrice(subscription, subscription.plan) : null;

  return {
    pharmacy,
    subscription,
    price: price && subscription ? { ...price, catalogCents: subscription.plan.monthlyPriceCents, catalogDiffers: catalogDiffers(subscription, subscription.plan) } : null,
    contracts,
    latestContract,
    owner,
    teamLastLoginAt: teamLastLogin(pharmacy.memberships.filter((m) => m.isActive).map((m) => m.user)),
    connector: { ...connectorState(pharmacy.stockConnection, now), version: agentVersionState(pharmacy.stockConnection?.agentVersion) },
    relaunch: relaunchContext({ contract: latestContract, subscription, now }),
    cancellationOpen,
    counts: { contracts: contracts.length, payments: paymentCount, users: pharmacy.memberships.length, notes: noteCount, emails: emailCount, openIncidents },
  };
}

export type Pharmacy360 = NonNullable<Awaited<ReturnType<typeof loadPharmacy360>>>;

/**
 * Les e-mails d'une officine : les siens, ceux de son dossier, et ceux de son
 * organisation (facturation) tracés au nom d'une autre officine du même groupe.
 *
 * Chaque branche commence par une colonne indexée (`pharmacyId`, `prospectId`) :
 * `organizationId` n'a pas d'index, et une branche sur elle seule ferait
 * parcourir toute la table `email_dispatches` à chaque ouverture de fiche. Rien
 * n'est perdu : tout envoi tracé avec une organisation l'est aussi avec son
 * officine (relances de facturation, modèles envoyés depuis la console).
 */
function communicationFilter(pharmacy: { id: string; organizationId: string; prospect: { id: string } | null; organization: { pharmacies: { id: string }[] } }): Prisma.EmailDispatchWhereInput {
  const siblings = pharmacy.organization.pharmacies.map((p) => p.id).filter((id) => id !== pharmacy.id);
  return {
    OR: [
      { pharmacyId: pharmacy.id },
      ...(pharmacy.prospect ? [{ prospectId: pharmacy.prospect.id }] : []),
      ...(siblings.length > 0 ? [{ pharmacyId: { in: siblings }, organizationId: pharmacy.organizationId }] : []),
    ],
  };
}

// ---------------------------------------------------------------- Aperçu

export async function loadOverviewExtras(base: Pharmacy360, now: Date = new Date()) {
  const [payments, pinnedNotes, timeline] = await Promise.all([
    prisma.billingPayment.findMany({ where: { organizationId: base.pharmacy.organizationId }, orderBy: { createdAt: "desc" }, take: 4, select: PAYMENT_SELECT }),
    listNotes({ pharmacyId: base.pharmacy.id, prospectId: base.pharmacy.prospect?.id ?? null }, { pinnedOnly: true, limit: 5 }),
    loadPharmacyTimeline(base, { limit: 8, now }),
  ]);
  return { payments, pinnedNotes, timeline };
}

// ---------------------------------------------------------------- Abonnement

export async function loadSubscriptionTab(base: Pharmacy360) {
  const [priceChanges, cancellations, invites] = await Promise.all([
    base.subscription ? prisma.subscriptionPriceChange.findMany({ where: { subscriptionId: base.subscription.id }, orderBy: { effectiveAt: "desc" }, take: 20 }) : [],
    prisma.cancellationRequest.findMany({ where: { pharmacyId: base.pharmacy.id }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, status: true, reason: true, reasonDetail: true, channel: true, requestedAt: true, plannedEndAt: true, confirmedAt: true, completedAt: true, canceledAt: true, stripeScheduled: true } }),
    prisma.subscriptionInvite.findMany({ where: { pharmacyId: base.pharmacy.id }, orderBy: { createdAt: "desc" }, take: 3, select: { id: true, sentTo: true, sentAt: true, sentCount: true, openedAt: true, completedAt: true, expiresAt: true, plan: { select: { name: true } } } }),
  ]);
  const names = await namesFor({ adminIds: priceChanges.map((c) => c.changedByAdminId) });
  return { priceChanges: priceChanges.map((c) => ({ ...c, by: c.changedByAdminId ? (names.admins.get(c.changedByAdminId) ?? null) : null })), cancellations, invites };
}

// ---------------------------------------------------------------- Paiements

const PAYMENT_SELECT = { id: true, status: true, amountCents: true, currency: true, periodStart: true, periodEnd: true, paidAt: true, failedAt: true, attemptCount: true, hostedInvoiceUrl: true, invoicePdfUrl: true, createdAt: true } as const;

export async function loadPaymentsTab(base: Pharmacy360) {
  return prisma.billingPayment.findMany({ where: { organizationId: base.pharmacy.organizationId }, orderBy: { createdAt: "desc" }, take: 120, select: PAYMENT_SELECT });
}

// ---------------------------------------------------------------- Technique

export async function loadTechniqueTab(base: Pharmacy360, now: Date = new Date()) {
  const [posts, incidents, lastGuide, catalog, unclassified] = await Promise.all([
    prisma.counterPost.findMany({ where: { pharmacyId: base.pharmacy.id }, orderBy: [{ revokedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }], select: { id: true, hostname: true, label: true, version: true, lastSeenAt: true, lastScanAt: true, scanCount: true, lastExportAt: true, lastExportError: true, exportPath: true, pairedAt: true, revokedAt: true } }),
    prisma.platformIncident.findMany({ where: { pharmacyId: base.pharmacy.id }, orderBy: [{ resolvedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }], take: 30 }),
    prisma.auditLog.findFirst({ where: { pharmacyId: base.pharmacy.id, action: "pharmacy.install_guide_sent" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    // Des effectifs du catalogue de stock, jamais un contenu.
    prisma.pharmacy.findUnique({ where: { id: base.pharmacy.id }, select: { _count: { select: { products: true, drugStocks: true } } } }),
    prisma.product.count({ where: { pharmacyId: base.pharmacy.id, deletedAt: null, classifiedAt: null } }),
  ]);
  return {
    posts: posts.map((p) => ({ ...p, state: counterPostState(p, now), version: agentVersionState(p.version) })),
    incidents,
    lastGuide,
    catalogCount: (catalog?._count.products ?? 0) + (catalog?._count.drugStocks ?? 0),
    unclassified,
  };
}

// ---------------------------------------------------------------- Communication

export async function loadCommunicationTab(base: Pharmacy360) {
  const prospectId = base.pharmacy.prospect?.id ?? null;
  const links = [`/admin/pharmacies/${base.pharmacy.id}`, `/admin/abonnements/${base.pharmacy.id}`, ...(prospectId ? [`/admin/dossiers/${prospectId}`] : [])];
  const [emails, notifications] = await Promise.all([
    prisma.emailDispatch.findMany({
      where: communicationFilter(base.pharmacy),
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, kind: true, subject: true, templateKey: true, recipient: true, status: true, detail: true, trigger: true, ruleKey: true, sentByAdminId: true, deliveredAt: true, failedAt: true, createdAt: true },
    }),
    prisma.extranetNotification.findMany({
      where: { OR: links.map((link) => ({ linkUrl: { startsWith: link } })) },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, audience: true, type: true, severity: true, title: true, body: true, linkUrl: true, readAt: true, createdAt: true },
    }),
  ]);
  const names = await namesFor({ adminIds: emails.map((e) => e.sentByAdminId) });
  return { emails: emails.map((e) => ({ ...e, sentBy: e.sentByAdminId ? (names.admins.get(e.sentByAdminId) ?? null) : null })), notifications };
}

/** Les campagnes affichées sur la fiche : les plus récentes ; le total dit s'il y en a davantage. */
export const CAMPAIGNS_RECEIVED_LIMIT = 20;

/**
 * Les nouveautés pour les patients de cette officine, en AGRÉGATS : la fonction
 * est-elle activée, combien d'abonnés actifs, combien d'annonces parties et
 * quand la dernière. Jamais une adresse, jamais une liste de patients : en mode
 * sans patient, la console ne voit que des effectifs. Une annonce « envoyée »
 * a réellement contacté quelqu'un (ni échec complet, ni envoi simulé) ; les
 * envois simulés sont comptés à part.
 */
export async function loadNewsAggregates(base: Pharmacy360) {
  const pharmacyId = base.pharmacy.id;
  const [activeSubscribers, sent, simulated] = await Promise.all([
    prisma.patientNewsSubscription.count({ where: { pharmacyId, status: "ACTIVE" } }),
    prisma.patientNewsAnnouncement.aggregate({ where: { pharmacyId, status: { in: ["SENT", "PARTIAL"] }, simulated: false }, _count: { _all: true }, _max: { createdAt: true } }),
    prisma.patientNewsAnnouncement.count({ where: { pharmacyId, simulated: true } }),
  ]);
  return { enabled: base.pharmacy.patientNewsEnabled, activeSubscribers, announcementsSent: sent._count._all, announcementsSimulated: simulated, lastAnnouncementAt: sent._max.createdAt };
}

/**
 * Les campagnes de la console reçues par cette officine (destinataire figé par
 * `pharmacyId`) : le nom, la date et l'issue, avec le lien vers la campagne.
 * Aucune adresse n'est relue ici.
 */
export async function loadCampaignsReceived(base: Pharmacy360) {
  const where = { pharmacyId: base.pharmacy.id };
  const [rows, total] = await Promise.all([
    prisma.campaignRecipient.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: CAMPAIGNS_RECEIVED_LIMIT,
      select: { id: true, status: true, detail: true, sentAt: true, createdAt: true, campaign: { select: { id: true, name: true, kind: true } } },
    }),
    prisma.campaignRecipient.count({ where }),
  ]);
  return { rows, total };
}

// ---------------------------------------------------------------- Commercial

export async function loadCommercialTab(base: Pharmacy360) {
  const prospectId = base.pharmacy.prospect?.id;
  if (!prospectId) return { tasks: [], events: [] };
  const [tasks, events] = await Promise.all([
    prisma.salesTask.findMany({ where: { prospectId }, orderBy: [{ doneAt: { sort: "asc", nulls: "first" } }, { dueAt: "asc" }], take: 30, select: { id: true, label: true, dueAt: true, doneAt: true, salesRep: { select: { firstName: true, lastName: true } } } }),
    prisma.prospectEvent.findMany({ where: { prospectId }, orderBy: { createdAt: "desc" }, take: 12, select: { id: true, type: true, summary: true, actorLabel: true, createdAt: true } }),
  ]);
  return { tasks, events };
}

// ---------------------------------------------------------------- Frise

/**
 * Les actions du journal qui peuvent concerner une officine. Les actions
 * commerciales (`sales.*`) n'y sont pas : chacune est doublée d'un événement
 * du dossier, déjà dans la frise.
 */
const AUDIT_ACTION_FILTER = [{ action: { startsWith: "platform." } }, { action: { startsWith: "billing." } }, { action: { in: ["pharmacy.install_guide_sent", "auth.password_link_sent"] } }];

/**
 * Les types d'entité par lesquels une ligne du journal sans officine désigne
 * malgré tout celle-ci (son abonnement, ses contrats, ses invitations à
 * s'abonner, ses comptes…). Filtrer aussi sur le type permet à la requête de
 * passer par l'index (entityType, entityId) au lieu de parcourir le journal.
 */
const PHARMACY_ENTITY_TYPES = ["Pharmacy", "Organization", "Prospect", "Subscription", "SubscriptionInvite", "Contract", "User"];

const TAKE = 200;

const TIMELINE_AUDIT_SELECT = { id: true, action: true, metadata: true, createdAt: true, platformAdminId: true } as const;

/**
 * Les lignes du journal d'audit qui concernent l'officine, en deux requêtes
 * bornées et indexées, sans jamais parcourir toute la table `audit_logs` (qui
 * reçoit aussi toute l'activité au comptoir de toutes les officines) :
 * - celles rattachées à l'officine (index pharmacyId, createdAt) ;
 * - celles sans officine qui désignent l'un de ses identifiants (index
 *   entityType, entityId). Les invitations à s'abonner et les contrats
 *   préparés, qui ne citaient l'officine que dans leurs métadonnées, sont
 *   retrouvés par l'identifiant de l'invitation ou du contrat.
 */
async function loadTimelineAudits(pharmacyId: string, entityIds: string[]) {
  const invites = await prisma.subscriptionInvite.findMany({ where: { pharmacyId }, orderBy: { createdAt: "desc" }, take: TAKE, select: { id: true } });
  const ids = [...new Set([...entityIds, ...invites.map((i) => i.id)])];
  const [own, linked] = await Promise.all([
    prisma.auditLog.findMany({ where: { pharmacyId, OR: AUDIT_ACTION_FILTER }, orderBy: { createdAt: "desc" }, take: TAKE, select: TIMELINE_AUDIT_SELECT }),
    prisma.auditLog.findMany({ where: { pharmacyId: null, entityType: { in: PHARMACY_ENTITY_TYPES }, entityId: { in: ids }, OR: AUDIT_ACTION_FILTER }, orderBy: { createdAt: "desc" }, take: TAKE, select: TIMELINE_AUDIT_SELECT }),
  ]);
  return [...own, ...linked].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, TAKE);
}

/**
 * La frise complète : dossier commercial, journal d'audit, Stripe (événements
 * et factures), contrats, e-mails, notes, résiliation, changements de tarif,
 * jalons de l'abonnement. Chaque source est bornée ; la fusion trie et
 * dédoublonne.
 */
export async function loadPharmacyTimeline(base: Pharmacy360, options: { kinds?: TimelineKind[] | null; limit?: number; now?: Date } = {}): Promise<TimelineEntry[]> {
  const now = options.now ?? new Date();
  const { pharmacy, subscription, contracts } = base;
  const prospectId = pharmacy.prospect?.id ?? null;
  const want = (kind: TimelineKind) => !options.kinds || options.kinds.length === 0 || options.kinds.includes(kind);

  // Les identifiants qui désignent cette officine dans le journal d'audit.
  const entityIds = [pharmacy.id, pharmacy.organizationId, ...(prospectId ? [prospectId] : []), ...(subscription ? [subscription.id] : []), ...pharmacy.memberships.map((m) => m.user.id), ...contracts.map((c) => c.id)];

  const [events, audits, billingEvents, payments, emails, notes, cancellationEvents, priceChanges] = await Promise.all([
    prospectId ? prisma.prospectEvent.findMany({ where: { prospectId }, orderBy: { createdAt: "desc" }, take: TAKE, select: { id: true, type: true, summary: true, actorLabel: true, createdAt: true } }) : [],
    loadTimelineAudits(pharmacy.id, entityIds),
    want("abonnement") || want("paiement") ? prisma.billingEvent.findMany({ where: { OR: [{ pharmacyId: pharmacy.id }, { organizationId: pharmacy.organizationId }] }, orderBy: { receivedAt: "desc" }, take: TAKE, select: { id: true, type: true, summary: true, receivedAt: true, error: true } }) : [],
    want("paiement") ? prisma.billingPayment.findMany({ where: { organizationId: pharmacy.organizationId }, orderBy: { createdAt: "desc" }, take: TAKE, select: PAYMENT_SELECT }) : [],
    want("email") ? prisma.emailDispatch.findMany({ where: communicationFilter(pharmacy), orderBy: { createdAt: "desc" }, take: TAKE, select: { id: true, kind: true, subject: true, recipient: true, status: true, trigger: true, createdAt: true } }) : [],
    want("note") ? listNotes({ pharmacyId: pharmacy.id, prospectId }, { limit: TAKE }) : [],
    want("resiliation") ? prisma.cancellationEvent.findMany({ where: { request: { pharmacyId: pharmacy.id } }, orderBy: { createdAt: "desc" }, take: TAKE, select: { id: true, type: true, summary: true, fromStatus: true, toStatus: true, actorLabel: true, createdAt: true } }) : [],
    // Datés de leur enregistrement dans la frise (la date d'effet, souvent future, est dans le détail).
    want("tarif") && subscription ? prisma.subscriptionPriceChange.findMany({ where: { subscriptionId: subscription.id }, orderBy: { createdAt: "desc" }, take: TAKE, select: { id: true, previousCents: true, nextCents: true, reason: true, appliedToStripe: true, effectiveAt: true, createdAt: true, changedByAdminId: true } }) : [],
  ]);

  const names = await namesFor({ adminIds: [...audits.map((a) => a.platformAdminId), ...priceChanges.map((c) => c.changedByAdminId)] });
  const adminName = (adminId: string | null) => (adminId ? (names.admins.get(adminId) ?? null) : null);

  const merged = mergeTimeline(
    [
      events.map(prospectEventEntry),
      audits.map((row) => auditEntry(row, adminName(row.platformAdminId))).filter((entry): entry is TimelineEntry => entry !== null),
      billingEvents.map(billingEventEntry).filter((entry): entry is TimelineEntry => entry !== null),
      payments.map(paymentEntry),
      contracts.flatMap((contract) => contractEntries(contract, now)),
      emails.map(emailEntry),
      notes.map(noteEntry),
      cancellationEvents.map(cancellationEventEntry),
      priceChanges.map((change) => priceChangeEntry(change, adminName(change.changedByAdminId))),
      subscription ? subscriptionEntries(subscription, subscription.plan.name, now) : [],
    ],
    1000,
  );
  return filterTimeline(merged, options.kinds ?? null).slice(0, options.limit ?? 300);
}
