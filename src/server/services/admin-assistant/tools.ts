import "server-only";
import { prisma } from "@/server/db/client";
import { adminSearch } from "@/server/services/admin/search";
import { loadAttention, loadKpis, loadToday } from "@/server/services/admin/cockpit";
import { listUnpaid } from "@/server/services/admin/billing-admin";
import { countSupportToAnswer } from "@/server/services/support";
import { countUnreadAdminNotifications } from "@/server/services/sales/notifications";
import { isPostOnline } from "@/core/admin/clients";
import { connectorNeedsAttention } from "@/core/admin/metrics";
import { PROSPECT_STATUS_LABELS, type ProspectStatusCode } from "@/core/sales/pipeline";
import { ASSISTANT_TOOL_NAMES } from "@/core/admin-assistant/assistant";

/**
 * Les outils du robot de la console : LECTURE SEULE, données d'entreprise
 * seulement. Chaque requête choisit explicitement ses champs (`select`) : aucun
 * patient, aucune ordonnance, aucun contenu de message de support, aucun
 * secret (empreintes de clés, jetons) ne peut en sortir. Chaque résultat est
 * compact et porte le lien de l'écran de la console où voir ou agir.
 */

type Input = Record<string, unknown>;
export type ToolOutput = Record<string, unknown>;

const DAY_MS = 24 * 3600 * 1000;
const PARIS = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const PARIS_DAY = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short", year: "numeric" });

export const when = (date: Date | null | undefined): string | null => (date ? PARIS.format(date) : null);
export const day = (date: Date | null | undefined): string | null => (date ? PARIS_DAY.format(date) : null);
export const euros = (cents: number | null | undefined): string | null => (typeof cents === "number" ? `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })} €` : null);
const short = (text: string | null | undefined, max = 120): string | null => (text ? (text.length > max ? `${text.slice(0, max - 1)}…` : text) : null);
const name = (person: { firstName: string; lastName: string } | null | undefined) => (person ? `${person.firstName} ${person.lastName}`.trim() : null);

function limitOf(input: Input, fallback = 15): number {
  const value = Number(input.limite);
  return Number.isInteger(value) && value >= 1 ? Math.min(value, 50) : fallback;
}
function daysOf(input: Input, fallback = 30): number {
  const value = Number(input.jours);
  return Number.isInteger(value) && value >= 1 ? Math.min(value, 365) : fallback;
}
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : null);

/** Une officine par identifiant, ou par nom (la plus proche) ; `null` si rien ne correspond. */
async function resolvePharmacy(ref: string): Promise<{ id: string; name: string } | null> {
  const byId = await prisma.pharmacy.findUnique({ where: { id: ref }, select: { id: true, name: true } }).catch(() => null);
  if (byId) return byId;
  return prisma.pharmacy.findFirst({ where: { name: { contains: ref, mode: "insensitive" } }, orderBy: [{ isDemo: "asc" }, { name: "asc" }], select: { id: true, name: true } });
}

async function resolveRep(ref: string): Promise<{ id: string; firstName: string; lastName: string } | null> {
  const select = { id: true, firstName: true, lastName: true } as const;
  const byId = await prisma.salesRep.findUnique({ where: { id: ref }, select }).catch(() => null);
  if (byId) return byId;
  const words = ref.split(/\s+/).filter(Boolean);
  return prisma.salesRep.findFirst({ where: { AND: words.map((w) => ({ OR: [{ firstName: { contains: w, mode: "insensitive" as const } }, { lastName: { contains: w, mode: "insensitive" as const } }, { email: { contains: w, mode: "insensitive" as const } }] })) }, select });
}

// ---------------------------------------------------------------- Les outils

async function overview(): Promise<ToolOutput> {
  const now = new Date();
  const [attention, kpis, today, supportToAnswer, gapsOpen, unreadNotifications, setups, upcomingDemos] = await Promise.all([
    loadAttention(now),
    loadKpis({ value: "30j", days: 30 }, now),
    loadToday(now),
    countSupportToAnswer(),
    prisma.knowledgeGap.count({ where: { status: "OPEN" } }),
    countUnreadAdminNotifications(),
    prisma.pharmacy.count({ where: { isDemo: false, setupStatus: { in: ["TO_SCHEDULE", "SCHEDULED"] } } }),
    prisma.prospect.count({ where: { demoAt: { gte: now, lt: new Date(now.getTime() + 7 * DAY_MS) } } }),
  ]);
  return {
    chiffres: {
      officines_actives: kpis.activePharmacies,
      abonnements_actifs: kpis.activeSubscriptions,
      essais_en_cours: kpis.trials,
      mrr: euros(kpis.mrrCents),
      nouveaux_abonnements_30j: kpis.newSubscriptions,
      resiliations_30j: kpis.cancellations,
    },
    a_traiter: {
      impayes: attention.paymentsLate,
      resiliations_ouvertes: attention.cancellationsOpen,
      contrats_a_contresigner: attention.contractsToCountersign,
      contrats_a_signer_par_l_officine: attention.contractsToSign,
      contrats_a_relancer: attention.contractsToRemind,
      essais_qui_finissent: attention.trialsEnding,
      relances_commerciales_en_retard: attention.followUpsLate,
      dossiers_sans_reponse: attention.prospectsNoReply,
      officines_inactives_14j: attention.inactivePharmacies,
      technique: attention.technical,
      invitations_en_attente: attention.invitationsPending,
      support_a_repondre: supportToAnswer,
      produits_a_connaitre: gapsOpen,
      mises_en_service_a_faire: setups,
      demos_7_prochains_jours: upcomingDemos,
      notifications_non_lues: unreadNotifications,
    },
    aujourd_hui: today.slice(0, 15).map((item) => ({ quoi: item.title, quand: item.precision === "time" ? when(item.at) : day(item.at), lien: item.href })),
    liens: { accueil: "/admin", paiements: "/admin/paiements", support: "/admin/support", demos: "/admin/demonstrations", relances: "/admin/relances-commerciales", conseils: "/admin/a-connaitre" },
  };
}

async function search(input: Input): Promise<ToolOutput> {
  const text = str(input.texte);
  if (!text || text.length < 2) return { erreur: "Donne au moins 2 caractères." };
  const results = await adminSearch(text);
  return { resultats: results.map((r) => ({ type: r.type, id: r.id, nom: r.title, detail: r.subtitle, etat: r.badge, lien: r.href })) };
}

const SUB_SELECT = { status: true, contractPriceCents: true, referralDiscountCents: true, commitmentEndsAt: true, cancelAtPeriodEnd: true, lastPaymentAt: true, lastPaymentFailedAt: true, plan: { select: { monthlyPriceCents: true } } } as const;

async function pharmacies(input: Input): Promise<ToolOutput> {
  const now = new Date();
  const filter = str(input.filtre) ?? "toutes";
  const city = str(input.ville);
  const limit = limitOf(input, 20);
  const inactiveSince = new Date(now.getTime() - 14 * DAY_MS);
  const where = {
    AND: [
      filter === "demo" ? { isDemo: true } : { isDemo: false },
      filter === "actives" ? { isActive: true } : {},
      filter === "suspendues" ? { isActive: false } : {},
      filter === "sans_abonnement" ? { organization: { subscription: null } } : {},
      filter === "inactives" ? { isActive: true, memberships: { none: { isActive: true, user: { deletedAt: null, lastLoginAt: { gte: inactiveSince } } } } } : {},
      filter === "probleme_technique" ? { OR: [{ counterPosts: { some: { revokedAt: null, lastExportError: { not: null } } } }, { stockConnection: { status: { in: ["ERROR", "DISCONNECTED"] } } }] } : {},
      city ? { city: { contains: city, mode: "insensitive" as const } } : {},
    ],
  };
  const [total, rows] = await Promise.all([
    prisma.pharmacy.count({ where }),
    prisma.pharmacy.findMany({
      where,
      take: limit,
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, city: true, isActive: true, isDemo: true, setupStatus: true, createdAt: true,
        organization: { select: { subscription: { select: SUB_SELECT } } },
        counterPosts: { where: { revokedAt: null }, select: { lastSeenAt: true, lastExportError: true } },
        stockConnection: { select: { status: true, lastSyncAt: true, lastSeenAt: true, intervalSeconds: true } },
        memberships: { where: { isActive: true, user: { deletedAt: null } }, select: { user: { select: { lastLoginAt: true } } } },
      },
    }),
  ]);
  return {
    total,
    affichees: rows.length,
    officines: rows.map((p) => {
      const sub = p.organization.subscription;
      const lastLogin = p.memberships.map((m) => m.user.lastLoginAt).filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
      return {
        id: p.id,
        nom: p.name,
        ville: p.city,
        etat: p.isDemo ? "démo" : p.isActive ? "active" : "suspendue",
        abonnement: sub ? { statut: sub.status, prix_mensuel: euros(sub.contractPriceCents ?? sub.plan.monthlyPriceCents), remise_parrainage: euros(sub.referralDiscountCents) } : null,
        mise_en_service: p.setupStatus,
        postes: { total: p.counterPosts.length, en_ligne: p.counterPosts.filter((c) => isPostOnline(c.lastSeenAt, now)).length, en_erreur: p.counterPosts.filter((c) => c.lastExportError).length },
        connecteur_stock: p.stockConnection ? { statut: p.stockConnection.status, a_surveiller: connectorNeedsAttention(p.stockConnection, now) } : null,
        derniere_connexion_equipe: when(lastLogin),
        lien: `/admin/pharmacies/${p.id}`,
      };
    }),
  };
}

async function pharmacySheet(input: Input): Promise<ToolOutput> {
  const ref = str(input.officine);
  if (!ref) return { erreur: "Indique l'officine." };
  const found = await resolvePharmacy(ref);
  if (!found) return { erreur: `Aucune officine ne correspond à « ${ref} ».` };
  const now = new Date();
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [p, proposed, accepted, purchased, sales, threads, referrals] = await Promise.all([
    prisma.pharmacy.findUniqueOrThrow({
      where: { id: found.id },
      select: {
        id: true, name: true, city: true, postalCode: true, email: true, phone: true, siret: true, isActive: true, isDemo: true, createdAt: true, postCount: true,
        setupStatus: true, setupScheduledAt: true, setupDoneAt: true, stockSyncedAt: true, referralCode: true,
        referredBy: { select: { id: true, name: true } },
        organization: { select: { subscription: { select: { ...SUB_SELECT, id: true, createdAt: true, currentPeriodEnd: true, suspendedAt: true, suspendedReason: true, cancelAt: true, setupFeeCents: true, payments: { orderBy: { createdAt: "desc" }, take: 4, select: { status: true, amountCents: true, paidAt: true, failedAt: true, createdAt: true } } } } } },
        counterPosts: { where: { revokedAt: null }, orderBy: { createdAt: "asc" }, select: { label: true, hostname: true, version: true, lastSeenAt: true, lastScanAt: true, scanCount: true, lastExportError: true } },
        stockConnection: { select: { lgo: true, status: true, agentVersion: true, lastSeenAt: true, lastSyncAt: true, lastSyncLines: true, lastError: true, intervalSeconds: true } },
        memberships: { where: { isActive: true, user: { deletedAt: null } }, select: { role: true, isPrincipal: true, user: { select: { firstName: true, lastName: true, lastLoginAt: true } } } },
        prospect: { select: { id: true, status: true, salesRep: { select: { firstName: true, lastName: true } }, activatedAt: true } },
      },
    }),
    prisma.recommendation.count({ where: { pharmacyId: found.id, createdAt: { gte: since } } }),
    prisma.recommendation.count({ where: { pharmacyId: found.id, createdAt: { gte: since }, status: { in: ["ACCEPTED", "MODIFIED", "REPLACED", "PRESENTED", "PURCHASED"] } } }),
    prisma.recommendation.count({ where: { pharmacyId: found.id, createdAt: { gte: since }, status: "PURCHASED" } }),
    prisma.sale.aggregate({ where: { pharmacyId: found.id, createdAt: { gte: since } }, _count: true, _sum: { attributedCents: true } }),
    prisma.supportThread.findMany({ where: { pharmacyId: found.id, status: "OPEN" }, orderBy: { lastMessageAt: "desc" }, take: 5, select: { id: true, subject: true, lastMessageFrom: true, lastMessageAt: true, unreadForSupport: true } }),
    prisma.pharmacy.findMany({ where: { referredById: found.id }, select: { name: true, organization: { select: { subscription: { select: { status: true } } } } } }),
  ]);
  const sub = p.organization.subscription;
  return {
    officine: { id: p.id, nom: p.name, ville: [p.postalCode, p.city].filter(Boolean).join(" "), email: p.email, telephone: p.phone, siret: p.siret, etat: p.isDemo ? "démo" : p.isActive ? "active" : "suspendue", cliente_depuis: day(p.createdAt), postes_declares: p.postCount },
    abonnement: sub
      ? {
          statut: sub.status,
          prix_mensuel: euros(sub.contractPriceCents ?? sub.plan.monthlyPriceCents),
          remise_parrainage: euros(sub.referralDiscountCents),
          mise_en_service_facturee: euros(sub.setupFeeCents),
          fin_engagement: day(sub.commitmentEndsAt),
          resiliation_demandee: sub.cancelAtPeriodEnd ? day(sub.cancelAt ?? sub.currentPeriodEnd) : null,
          suspendu: sub.suspendedAt ? { depuis: day(sub.suspendedAt), raison: short(sub.suspendedReason) } : null,
          dernier_paiement: when(sub.lastPaymentAt),
          dernier_echec: when(sub.lastPaymentFailedAt),
          paiements: sub.payments.map((pay) => ({ statut: pay.status, montant: euros(pay.amountCents), le: day(pay.paidAt ?? pay.failedAt ?? pay.createdAt) })),
        }
      : null,
    mise_en_service: { statut: p.setupStatus, prevue: when(p.setupScheduledAt), faite: day(p.setupDoneAt) },
    postes: p.counterPosts.map((c) => ({ nom: c.label ?? c.hostname, version_agent: c.version, en_ligne: isPostOnline(c.lastSeenAt, now), vu: when(c.lastSeenAt), dernier_scan: when(c.lastScanAt), scans: c.scanCount, erreur: short(c.lastExportError) })),
    connecteur_lgo: p.stockConnection ? { lgo: p.stockConnection.lgo, statut: p.stockConnection.status, a_surveiller: connectorNeedsAttention(p.stockConnection, now), version: p.stockConnection.agentVersion, derniere_synchro: when(p.stockConnection.lastSyncAt), lignes: p.stockConnection.lastSyncLines, erreur: short(p.stockConnection.lastError) } : null,
    stock_recu: when(p.stockSyncedAt),
    equipe: p.memberships.map((m) => ({ nom: name(m.user), role: m.role, titulaire_principal: m.isPrincipal, derniere_connexion: when(m.user.lastLoginAt) })),
    usage_30j: { conseils_proposes: proposed, conseils_acceptes: accepted, conseils_achetes: purchased, ventes: sales._count, chiffre_attribue: euros(sales._sum.attributedCents ?? 0) },
    support_ouvert: threads.map((t) => ({ sujet: short(t.subject), dernier_message_de: t.lastMessageFrom, le: when(t.lastMessageAt), a_repondre: t.unreadForSupport, lien: `/admin/support/${t.id}` })),
    parrainage: { code: p.referralCode, parrainee_par: p.referredBy?.name ?? null, filleuls: referrals.map((r) => ({ nom: r.name, abonnement: r.organization.subscription?.status ?? null })) },
    dossier_commercial: p.prospect ? { etape: PROSPECT_STATUS_LABELS[p.prospect.status as ProspectStatusCode] ?? p.prospect.status, commercial: name(p.prospect.salesRep), activee_le: day(p.prospect.activatedAt), lien: `/admin/dossiers/${p.prospect.id}` } : null,
    liens: { fiche: `/admin/pharmacies/${p.id}`, abonnement: `/admin/pharmacies/${p.id}?onglet=abonnement`, technique: `/admin/pharmacies/${p.id}?onglet=technique`, utilisateurs: `/admin/pharmacies/${p.id}?onglet=utilisateurs` },
  };
}

const DEMO_SELECT = { id: true, name: true, city: true, phone: true, ownerName: true, demoAt: true, demoDoneAt: true, status: true, salesRep: { select: { firstName: true, lastName: true } } } as const;

async function demos(input: Input): Promise<ToolOutput> {
  const now = new Date();
  const view = str(input.vue) ?? "a_venir";
  const days = daysOf(input, view === "a_venir" ? 14 : 30);
  const limit = limitOf(input, 20);
  const where =
    view === "a_venir"
      ? { demoAt: { gte: now, lt: new Date(now.getTime() + days * DAY_MS) } }
      : view === "a_confirmer"
        ? { demoAt: { lt: now, gte: new Date(now.getTime() - days * DAY_MS) }, demoDoneAt: null }
        : { demoAt: { lt: now, gte: new Date(now.getTime() - days * DAY_MS) } };
  const [total, rows] = await Promise.all([
    prisma.prospect.count({ where }),
    prisma.prospect.findMany({ where, orderBy: { demoAt: view === "a_venir" ? "asc" : "desc" }, take: limit, select: DEMO_SELECT }),
  ]);
  return {
    vue: view,
    fenetre_jours: days,
    total,
    demos: rows.map((d) => ({ officine: d.name, ville: d.city, contact: d.ownerName, telephone: d.phone, quand: when(d.demoAt), realisee: d.demoDoneAt ? day(d.demoDoneAt) : null, commercial: name(d.salesRep) ?? "sans commercial (console)", etape: PROSPECT_STATUS_LABELS[d.status as ProspectStatusCode] ?? d.status, lien: `/admin/dossiers/${d.id}` })),
    lien: "/admin/demonstrations",
  };
}

async function prospects(input: Input): Promise<ToolOutput> {
  const now = new Date();
  const limit = limitOf(input, 20);
  const stage = str(input.etape);
  const repRef = str(input.commercial);
  const rep = repRef ? await resolveRep(repRef) : null;
  if (repRef && !rep) return { erreur: `Aucun commercial ne correspond à « ${repRef} ».` };
  const where = {
    AND: [
      stage ? { status: stage as ProspectStatusCode } : {},
      rep ? { salesRepId: rep.id } : {},
      input.sans_commercial === true ? { salesRepId: null } : {},
      input.relance_en_retard === true ? { nextActionAt: { lt: now }, status: { notIn: ["ACTIVATED", "LOST"] as ProspectStatusCode[] } } : {},
    ],
  };
  const [byStage, total, rows] = await Promise.all([
    prisma.prospect.groupBy({ by: ["status"], _count: true, where: rep ? { salesRepId: rep.id } : {} }),
    prisma.prospect.count({ where }),
    prisma.prospect.findMany({ where, orderBy: { updatedAt: "desc" }, take: limit, select: { id: true, name: true, city: true, status: true, nextActionAt: true, nextActionLabel: true, demoAt: true, lastContactAt: true, salesRep: { select: { firstName: true, lastName: true } }, createdAt: true } }),
  ]);
  return {
    par_etape: Object.fromEntries(byStage.map((g) => [PROSPECT_STATUS_LABELS[g.status as ProspectStatusCode] ?? g.status, g._count])),
    total_filtre: total,
    dossiers: rows.map((p) => ({ nom: p.name, ville: p.city, etape: PROSPECT_STATUS_LABELS[p.status as ProspectStatusCode] ?? p.status, commercial: name(p.salesRep), prochaine_action: p.nextActionLabel ? `${p.nextActionLabel} — ${when(p.nextActionAt)}` : null, demo: when(p.demoAt), dernier_contact: day(p.lastContactAt), cree: day(p.createdAt), lien: `/admin/dossiers/${p.id}` })),
    lien: "/admin/pipeline",
  };
}

async function billing(input: Input): Promise<ToolOutput> {
  const now = new Date();
  const view = str(input.vue) ?? "resume";
  const limit = limitOf(input, 20);
  if (view === "impayes") {
    const rows = await listUnpaid(now);
    return { total: rows.length, impayes: rows.slice(0, limit).map((r) => ({ officine: r.pharmacyName, ville: r.city, statut: r.status, montant: euros(r.failedCents), depuis: day(r.failedAt), jours_de_retard: r.daysLate, tentatives: r.attemptCount, relances_envoyees: r.dispatches.length + r.manualReminders, suspendue: r.suspended, lien: r.pharmacyId ? `/admin/pharmacies/${r.pharmacyId}?onglet=paiements` : "/admin/paiements" })), lien: "/admin/paiements" };
  }
  if (view === "paiements_recents") {
    const days = daysOf(input, 30);
    const rows = await prisma.billingPayment.findMany({ where: { createdAt: { gte: new Date(now.getTime() - days * DAY_MS) } }, orderBy: { createdAt: "desc" }, take: limit, select: { status: true, amountCents: true, paidAt: true, failedAt: true, createdAt: true, subscription: { select: { organization: { select: { pharmacies: { take: 1, select: { id: true, name: true, isDemo: true } } } } } } } });
    const paid = rows.filter((r) => r.status === "PAID");
    return { fenetre_jours: days, encaisse: euros(paid.reduce((s, r) => s + r.amountCents, 0)), paiements: rows.map((r) => { const ph = r.subscription.organization.pharmacies[0]; return { officine: ph ? `${ph.name}${ph.isDemo ? " (démo)" : ""}` : null, statut: r.status, montant: euros(r.amountCents), le: day(r.paidAt ?? r.failedAt ?? r.createdAt), lien: ph ? `/admin/pharmacies/${ph.id}?onglet=paiements` : "/admin/paiements" }; }), lien: "/admin/paiements" };
  }
  if (view === "resiliations") {
    const rows = await prisma.cancellationRequest.findMany({ where: { status: { in: ["RECEIVED", "IN_PROGRESS", "CONFIRMED"] } }, orderBy: { requestedAt: "desc" }, take: limit, select: { id: true, status: true, reason: true, requestedAt: true, plannedEndAt: true, pharmacy: { select: { id: true, name: true, isDemo: true } } } });
    return { resiliations: rows.map((r) => ({ officine: `${r.pharmacy.name}${r.pharmacy.isDemo ? " (démo)" : ""}`, statut: r.status, raison: r.reason, demandee: day(r.requestedAt), fin_prevue: day(r.plannedEndAt), lien: `/admin/resiliations/${r.id}` })), lien: "/admin/resiliations" };
  }
  if (view === "mises_en_service") {
    const rows = await prisma.pharmacy.findMany({ where: { isDemo: false, setupStatus: { not: null } }, orderBy: [{ setupStatus: "asc" }, { setupScheduledAt: "asc" }], take: limit, select: { id: true, name: true, city: true, setupStatus: true, setupScheduledAt: true, setupDoneAt: true } });
    return { mises_en_service: rows.map((p) => ({ officine: p.name, ville: p.city, statut: p.setupStatus, prevue: when(p.setupScheduledAt), faite: day(p.setupDoneAt), lien: `/admin/abonnements/${p.id}` })), lien: "/admin/abonnements" };
  }
  const [kpis, byStatus] = await Promise.all([
    loadKpis({ value: "30j", days: 30 }, now),
    prisma.subscription.groupBy({ by: ["status"], _count: true, where: { organization: { pharmacies: { some: { isDemo: false } } } } }),
  ]);
  return { mrr: euros(kpis.mrrCents), abonnements_par_statut: Object.fromEntries(byStatus.map((g) => [g.status, g._count])), essais: kpis.trials, nouveaux_30j: kpis.newSubscriptions, resiliations_30j: kpis.cancellations, impayes: kpis.paymentsLate, contrats_en_attente: kpis.contracts, lien: "/admin/abonnements" };
}

async function salesTeam(input: Input): Promise<ToolOutput> {
  const ref = str(input.commercial);
  const rep = ref ? await resolveRep(ref) : null;
  if (ref && !rep) return { erreur: `Aucun commercial ne correspond à « ${ref} ».` };
  const [reps, directors] = await Promise.all([
    prisma.salesRep.findMany({
      where: rep ? { id: rep.id } : {},
      orderBy: [{ isActive: "desc" }, { lastName: "asc" }],
      select: {
        id: true, firstName: true, lastName: true, email: true, phone: true, zone: true, isActive: true, lastLoginAt: true, commissionType: true,
        prospects: { select: { status: true, demoDoneAt: true } },
        commissions: { select: { status: true, amountCents: true } },
        invoices: { select: { status: true, amountCents: true } },
      },
    }),
    rep ? Promise.resolve([]) : prisma.salesDirector.findMany({ select: { firstName: true, lastName: true, email: true, isActive: true, lastLoginAt: true, invitedAt: true } }),
  ]);
  const sumBy = <T extends { status: string; amountCents: number }>(rows: T[]) => Object.fromEntries(Object.entries(rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + r.amountCents }), {})).map(([k, v]) => [k, euros(v)]));
  return {
    commerciaux: reps.map((r) => ({
      nom: name(r), email: r.email, telephone: r.phone, zone: r.zone, actif: r.isActive, derniere_connexion: when(r.lastLoginAt), type_commission: r.commissionType,
      dossiers: r.prospects.length, demos_realisees: r.prospects.filter((p) => p.demoDoneAt).length, activees: r.prospects.filter((p) => p.status === "ACTIVATED").length,
      commissions_par_statut: sumBy(r.commissions), factures_par_statut: sumBy(r.invoices),
      lien: `/admin/commerciaux/${r.id}`,
    })),
    directeur_commercial: directors.map((d) => ({ nom: name(d), email: d.email, actif: d.isActive, invite: day(d.invitedAt), derniere_connexion: when(d.lastLoginAt) })),
    liens: { commerciaux: "/admin/commerciaux", directeur: "/admin/directeur-commercial" },
  };
}

async function commissionsAndInvoices(input: Input): Promise<ToolOutput> {
  const limit = limitOf(input, 20);
  const cStatus = str(input.commissions) ?? "toutes";
  const iStatus = str(input.factures) ?? "toutes";
  const cWhere = cStatus === "toutes" ? {} : { status: cStatus as "FORECAST" };
  const iWhere = iStatus === "toutes" ? {} : { status: iStatus as "RECEIVED" };
  const [cTotals, commissions, iTotals, invoices] = await Promise.all([
    prisma.commission.groupBy({ by: ["status"], _count: true, _sum: { amountCents: true } }),
    prisma.commission.findMany({ where: cWhere, orderBy: { updatedAt: "desc" }, take: limit, select: { type: true, status: true, amountCents: true, dueAt: true, paidAt: true, bonusTier: true, salesRep: { select: { id: true, firstName: true, lastName: true } }, prospect: { select: { id: true, name: true } }, invoice: { select: { number: true } } } }),
    prisma.salesInvoice.groupBy({ by: ["status"], _count: true, _sum: { amountCents: true } }),
    prisma.salesInvoice.findMany({ where: iWhere, orderBy: { issuedAt: "desc" }, take: limit, select: { number: true, status: true, amountCents: true, issuedAt: true, periodLabel: true, paidAt: true, salesRep: { select: { id: true, firstName: true, lastName: true } } } }),
  ]);
  return {
    totaux_commissions: Object.fromEntries(cTotals.map((g) => [g.status, { nombre: g._count, montant: euros(g._sum.amountCents ?? 0) }])),
    commissions: commissions.map((c) => ({ commercial: name(c.salesRep), dossier: c.prospect.name, type: c.bonusTier ? `bonus palier ${c.bonusTier}` : c.type, statut: c.status, montant: euros(c.amountCents), echeance: day(c.dueAt), payee: day(c.paidAt), facture: c.invoice?.number ?? null, lien: `/admin/commerciaux/${c.salesRep.id}` })),
    totaux_factures: Object.fromEntries(iTotals.map((g) => [g.status, { nombre: g._count, montant: euros(g._sum.amountCents ?? 0) }])),
    factures: invoices.map((f) => ({ numero: f.number, commercial: name(f.salesRep), statut: f.status, montant: euros(f.amountCents), periode: f.periodLabel, emise: day(f.issuedAt), payee: day(f.paidAt), lien: `/admin/commerciaux/${f.salesRep.id}` })),
    lien: "/admin/commerciaux",
  };
}

async function support(input: Input): Promise<ToolOutput> {
  const filter = str(input.filtre) ?? "a_repondre";
  const limit = limitOf(input, 20);
  const where = filter === "a_repondre" ? { status: "OPEN" as const, unreadForSupport: true } : filter === "ouvertes" ? { status: "OPEN" as const } : {};
  const [total, rows] = await Promise.all([
    prisma.supportThread.count({ where }),
    prisma.supportThread.findMany({ where, orderBy: { lastMessageAt: "desc" }, take: limit, select: { id: true, subject: true, topic: true, status: true, lastMessageFrom: true, lastMessageAt: true, unreadForSupport: true, isDemo: true, createdAt: true, pharmacy: { select: { name: true, city: true } }, _count: { select: { messages: true } } } }),
  ]);
  return {
    filtre: filter,
    total,
    discussions: rows.map((t) => ({ officine: `${t.pharmacy.name}${t.isDemo ? " (démo)" : ""}`, ville: t.pharmacy.city, sujet: short(t.subject), theme: t.topic, statut: t.status, dernier_message_de: t.lastMessageFrom, le: when(t.lastMessageAt), a_repondre: t.unreadForSupport, messages: t._count.messages, ouverte: day(t.createdAt), lien: `/admin/support/${t.id}` })),
    note: "Le contenu des messages n'est pas transmis au robot : ouvrir le lien pour les lire.",
    lien: "/admin/support",
  };
}

async function adviceQueue(input: Input): Promise<ToolOutput> {
  const limit = limitOf(input, 15);
  const [gaps, gapsCount, rulesToValidate, proposals, flags] = await Promise.all([
    prisma.knowledgeGap.findMany({ where: { status: "OPEN" }, orderBy: [{ occurrences: "desc" }, { createdAt: "asc" }], take: limit, select: { kind: true, label: true, reason: true, occurrences: true, pharmacyIds: true, createdAt: true } }),
    prisma.knowledgeGap.count({ where: { status: "OPEN" } }),
    prisma.centralAdviceRule.count({ where: { status: "ACTIVE" } }),
    prisma.knowledgeProposal.count({ where: { status: "PENDING" } }),
    prisma.clinicalReviewFlag.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
  ]);
  return {
    produits_a_connaitre: { total: gapsCount, plus_frequents: gaps.map((g) => ({ produit: short(g.label), pourquoi: short(g.reason), vu: g.occurrences, officines: g.pharmacyIds.length, depuis: day(g.createdAt) })), lien: "/admin/a-connaitre" },
    regles_en_ligne_non_validees_par_donna: { total: rulesToValidate, lien: "/admin/conseils" },
    propositions_base_de_connaissances: { total: proposals, lien: "/admin/connaissances" },
    alertes_validation_clinique: { total: flags, lien: "/admin/validation-clinique" },
  };
}

const ACCEPTED = ["ACCEPTED", "MODIFIED", "REPLACED", "PRESENTED", "PURCHASED"] as const;

async function usage(input: Input): Promise<ToolOutput> {
  const days = daysOf(input, 30);
  const limit = limitOf(input, 10);
  const since = new Date(Date.now() - days * DAY_MS);
  const ref = str(input.officine);
  const one = ref ? await resolvePharmacy(ref) : null;
  if (ref && !one) return { erreur: `Aucune officine ne correspond à « ${ref} ».` };
  const scope = { isDemo: false, createdAt: { gte: since }, ...(one ? { pharmacyId: one.id } : {}) };
  const [byStatus, sales, perPharmacy] = await Promise.all([
    prisma.recommendation.groupBy({ by: ["status"], _count: true, where: scope }),
    prisma.sale.aggregate({ where: scope, _count: true, _sum: { totalCents: true, attributedCents: true, attributedMarginCents: true } }),
    one ? Promise.resolve([]) : prisma.recommendation.groupBy({ by: ["pharmacyId"], _count: true, where: scope, orderBy: { _count: { pharmacyId: "desc" } }, take: limit }),
  ]);
  const count = (statuses: readonly string[]) => byStatus.filter((g) => statuses.includes(g.status)).reduce((s, g) => s + g._count, 0);
  const proposed = byStatus.reduce((s, g) => s + g._count, 0);
  const names = perPharmacy.length ? await prisma.pharmacy.findMany({ where: { id: { in: perPharmacy.map((g) => g.pharmacyId) } }, select: { id: true, name: true } }) : [];
  const acceptedPer = perPharmacy.length ? await prisma.recommendation.groupBy({ by: ["pharmacyId"], _count: true, where: { ...scope, pharmacyId: { in: perPharmacy.map((g) => g.pharmacyId) }, status: { in: [...ACCEPTED] } } }) : [];
  return {
    periode_jours: days,
    officine: one?.name ?? "toutes (hors démo)",
    conseils: { proposes: proposed, acceptes: count(ACCEPTED), achetes: count(["PURCHASED"]), refuses: count(["DECLINED"]), ignores: count(["IGNORED"]), taux_acceptation: proposed ? `${Math.round((count(ACCEPTED) / proposed) * 100)} %` : null },
    ventes: { nombre: sales._count, chiffre_total: euros(sales._sum.totalCents ?? 0), chiffre_attribue_aux_conseils: euros(sales._sum.attributedCents ?? 0), marge_attribuee: euros(sales._sum.attributedMarginCents ?? 0) },
    classement_officines: perPharmacy.map((g) => ({ officine: names.find((n) => n.id === g.pharmacyId)?.name ?? g.pharmacyId, conseils_proposes: g._count, acceptes: acceptedPer.find((a) => a.pharmacyId === g.pharmacyId)?._count ?? 0, lien: `/admin/pharmacies/${g.pharmacyId}?onglet=performance` })),
    lien: "/admin/performance",
  };
}

async function journal(input: Input): Promise<ToolOutput> {
  const days = daysOf(input, 7);
  const limit = limitOf(input, 25);
  const action = str(input.action);
  const ref = str(input.officine);
  const one = ref ? await resolvePharmacy(ref) : null;
  if (ref && !one) return { erreur: `Aucune officine ne correspond à « ${ref} ».` };
  const rows = await prisma.auditLog.findMany({
    where: { createdAt: { gte: new Date(Date.now() - days * DAY_MS) }, ...(action ? { action: { contains: action } } : {}), ...(one ? { pharmacyId: one.id } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { action: true, entityType: true, entityId: true, createdAt: true, platformAdminId: true, pharmacy: { select: { name: true } }, user: { select: { firstName: true, lastName: true } } },
  });
  const adminIds = [...new Set(rows.map((r) => r.platformAdminId).filter((id): id is string => Boolean(id)))];
  const admins = adminIds.length ? await prisma.platformAdmin.findMany({ where: { id: { in: adminIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
  return {
    fenetre_jours: days,
    entrees: rows.map((r) => ({ action: r.action, sur: r.entityType, le: when(r.createdAt), par: name(admins.find((a) => a.id === r.platformAdminId)) ?? name(r.user) ?? "système", officine: r.pharmacy?.name ?? null })),
    lien: "/admin/journal",
  };
}

async function notifications(input: Input): Promise<ToolOutput> {
  const limit = limitOf(input, 15);
  const unreadOnly = input.non_lues_seulement === true;
  const rows = await prisma.extranetNotification.findMany({ where: { audience: "ADMIN", ...(unreadOnly ? { readAt: null } : {}) }, orderBy: [{ createdAt: "desc" }], take: limit, select: { type: true, severity: true, title: true, body: true, linkUrl: true, readAt: true, createdAt: true } });
  return { notifications: rows.map((n) => ({ titre: short(n.title), detail: short(n.body, 160), gravite: n.severity, lue: Boolean(n.readAt), le: when(n.createdAt), lien: n.linkUrl })), lien: "/admin/notifications" };
}

const HANDLERS: Record<string, (input: Input) => Promise<ToolOutput>> = {
  vue_d_ensemble: overview,
  rechercher: search,
  officines: pharmacies,
  fiche_officine: pharmacySheet,
  demonstrations: demos,
  dossiers: prospects,
  facturation: billing,
  equipe_commerciale: salesTeam,
  commissions_et_factures: commissionsAndInvoices,
  support,
  conseils_a_valider: adviceQueue,
  usage,
  journal,
  notifications,
};

/** Exécute un outil ; une erreur devient un résultat lisible pour le modèle, jamais une exception. */
export async function runAssistantTool(toolName: string, rawInput: unknown): Promise<{ ok: boolean; output: ToolOutput }> {
  const handler = ASSISTANT_TOOL_NAMES.includes(toolName) ? HANDLERS[toolName] : undefined;
  if (!handler) return { ok: false, output: { erreur: `Outil inconnu : ${toolName}` } };
  const input = rawInput && typeof rawInput === "object" && !Array.isArray(rawInput) ? (rawInput as Input) : {};
  try {
    return { ok: true, output: await handler(input) };
  } catch (error) {
    console.error(`[assistant] outil ${toolName} en échec`, error);
    return { ok: false, output: { erreur: "Cette donnée n'a pas pu être lue. Dis-le simplement." } };
  }
}

export const ASSISTANT_HANDLER_NAMES = Object.keys(HANDLERS);
