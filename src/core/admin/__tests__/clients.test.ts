import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LATEST_AGENT_VERSION, agentVersionState, compareVersions } from "../agent-version";
import {
  activityLabel,
  aiCostCents,
  auditEntry,
  billingEventEntry,
  cancellationEventEntry,
  connectorNeedsAttention,
  connectorState,
  contractEntries,
  countActiveSince,
  countPharmacyFilters,
  parseWatchFilter,
  WATCH_FILTERS,
  WATCH_FILTER_LABELS,
  counterPostInError,
  counterPostState,
  describeAuditMetadata,
  emailEntry,
  invitationState,
  isInactivePharmacy,
  matchesPharmacySearch,
  matchesPharmacyStatus,
  noteEntry,
  normalizeSearch,
  parsePage,
  parsePharmacySort,
  parsePharmacyStatusFilter,
  parseTimelineKind,
  parseUserRole,
  paymentEntry,
  priceChangeEntry,
  prospectEventEntry,
  relaunchContext,
  searchParam,
  sortPharmacies,
  subscriptionEntries,
  teamLastLogin,
  truncate,
  userAccessState,
  type ContractTimelineFacts,
  type PharmacyListFacts,
} from "../clients";
import { mergeTimeline } from "../timeline";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
const secondsAgo = (n: number) => new Date(NOW.getTime() - n * 1000);

// ---------------------------------------------------------------- Version de l'agent

describe("version de l'agent PharmaBoost Connect", () => {
  it("la constante suit la version déclarée dans agent/src/index.ts", () => {
    const source = readFileSync(path.resolve(process.cwd(), "agent/src/index.ts"), "utf8");
    const match = source.match(/const VERSION = "([^"]+)"/);
    expect(match, "constante VERSION introuvable dans agent/src/index.ts").not.toBeNull();
    expect(match?.[1]).toBe(LATEST_AGENT_VERSION);
  });

  it("compare les versions segment par segment", () => {
    expect(compareVersions("0.4.1", "0.4.1")).toBe(0);
    expect(compareVersions("0.4.0", "0.4.1")).toBe(-1);
    expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("v0.4.1", "0.4.1")).toBe(0);
    expect(compareVersions("0.4.1-beta", "0.4.1")).toBe(-1);
    expect(compareVersions("0.4.1", "0.4.1-beta")).toBe(1);
  });

  it("une version absente ou illisible passe derrière toute version lisible", () => {
    expect(compareVersions(null, "0.1.0")).toBe(-1);
    expect(compareVersions("abc", "0.1.0")).toBe(-1);
    expect(compareVersions("0.1.0", undefined)).toBe(1);
    expect(compareVersions(null, null)).toBe(0);
  });

  it("dit si une installation est à jour, en retard ou inconnue", () => {
    expect(agentVersionState(LATEST_AGENT_VERSION).state).toBe("UP_TO_DATE");
    expect(agentVersionState("0.3.9", "0.4.1")).toMatchObject({ state: "OUTDATED", tone: "warning" });
    expect(agentVersionState("0.5.0", "0.4.1").state).toBe("AHEAD");
    expect(agentVersionState(null).state).toBe("UNKNOWN");
  });
});

// ---------------------------------------------------------------- Activité

describe("activité et inactivité", () => {
  it("dernière connexion de l'équipe et comptes actifs", () => {
    const users = [{ lastLoginAt: daysAgo(20) }, { lastLoginAt: daysAgo(3) }, { lastLoginAt: null }];
    expect(teamLastLogin(users)?.toISOString()).toBe(daysAgo(3).toISOString());
    expect(teamLastLogin([{ lastLoginAt: null }])).toBeNull();
    expect(countActiveSince(users, 7, NOW)).toBe(1);
    expect(countActiveSince(users, 30, NOW)).toBe(2);
  });

  it("inactive : active, hors démo, sans connexion depuis 14 jours ou jamais", () => {
    const base = { isActive: true, isDemo: false };
    expect(isInactivePharmacy({ ...base, teamLastLoginAt: null }, NOW)).toBe(true);
    expect(isInactivePharmacy({ ...base, teamLastLoginAt: daysAgo(13) }, NOW)).toBe(false);
    expect(isInactivePharmacy({ ...base, teamLastLoginAt: daysAgo(15) }, NOW)).toBe(true);
    expect(isInactivePharmacy({ ...base, isDemo: true, teamLastLoginAt: null }, NOW)).toBe(false);
    expect(isInactivePharmacy({ ...base, isActive: false, teamLastLoginAt: null }, NOW)).toBe(false);
  });

  it("la pastille d'activité suit les seuils de 7 et 14 jours", () => {
    expect(activityLabel(null, NOW).tone).toBe("warning");
    expect(activityLabel(daysAgo(2), NOW)).toEqual({ label: "Active", tone: "success" });
    expect(activityLabel(daysAgo(10), NOW).label).toBe("Peu active");
    expect(activityLabel(daysAgo(30), NOW).label).toBe("Inactive depuis 30 j");
  });

  it("coût IA : micro-centimes ramenés en centimes", () => {
    expect(aiCostCents(0)).toBe(0);
    expect(aiCostCents(125_000)).toBe(13);
  });
});

// ---------------------------------------------------------------- Liste des officines

function row(overrides: Partial<PharmacyListFacts> = {}): PharmacyListFacts {
  return { name: "Pharmacie du Marché", city: "Lyon", siret: "12345678900011", email: "contact@marche.fr", isActive: true, isDemo: false, createdAt: daysAgo(100), memberEmails: ["titulaire@marche.fr"], subscription: null, teamLastLoginAt: null, ...overrides };
}

describe("filtres de la liste des officines", () => {
  it("statuts", () => {
    expect(matchesPharmacyStatus(row(), "actives")).toBe(true);
    expect(matchesPharmacyStatus(row({ isDemo: true }), "actives")).toBe(false);
    expect(matchesPharmacyStatus(row({ isActive: false }), "suspendues")).toBe(true);
    expect(matchesPharmacyStatus(row({ subscription: { status: "SUSPENDED", suspendedAt: daysAgo(1) } }), "suspendues")).toBe(true);
    expect(matchesPharmacyStatus(row({ subscription: { status: "TRIALING", suspendedAt: null } }), "essai")).toBe(true);
    expect(matchesPharmacyStatus(row({ subscription: { status: "PAST_DUE", suspendedAt: null } }), "abonnees")).toBe(true);
    expect(matchesPharmacyStatus(row({ subscription: { status: "TRIALING", suspendedAt: null } }), "abonnees")).toBe(false);
    expect(matchesPharmacyStatus(row(), "sans-abonnement")).toBe(true);
    expect(matchesPharmacyStatus(row({ subscription: { status: "CANCELED", suspendedAt: null } }), "sans-abonnement")).toBe(true);
    expect(matchesPharmacyStatus(row({ subscription: { status: "ACTIVE", suspendedAt: null } }), "sans-abonnement")).toBe(false);
    expect(matchesPharmacyStatus(row({ isDemo: true }), "demo")).toBe(true);
    expect(matchesPharmacyStatus(row(), null)).toBe(true);
  });

  it("recherche : nom sans accents, ville, SIRET avec espaces, e-mail d'un compte", () => {
    const r = row({ name: "Pharmacie de l'Étoile" });
    expect(matchesPharmacySearch(r, "etoile")).toBe(true);
    expect(matchesPharmacySearch(r, "LYON")).toBe(true);
    expect(matchesPharmacySearch(r, "123 456 789")).toBe(true);
    expect(matchesPharmacySearch(r, "titulaire@")).toBe(true);
    expect(matchesPharmacySearch(r, "marseille")).toBe(false);
    expect(matchesPharmacySearch(r, null)).toBe(true);
  });

  it("compteurs et tri par activité (jamais connectées à la fin)", () => {
    const rows = [row({ name: "B", teamLastLoginAt: null }), row({ name: "A", teamLastLoginAt: daysAgo(1), subscription: { status: "TRIALING", suspendedAt: null } }), row({ name: "C", teamLastLoginAt: daysAgo(5), isDemo: true })];
    expect(sortPharmacies(rows, "activite").map((r) => r.name)).toEqual(["A", "C", "B"]);
    expect(sortPharmacies(rows, "nom").map((r) => r.name)).toEqual(["A", "B", "C"]);
    const counts = countPharmacyFilters(rows);
    expect(counts).toMatchObject({ actives: 2, essai: 1, demo: 1, "sans-abonnement": 2 });
  });

  it("lecture des paramètres d'adresse", () => {
    expect(parsePharmacyStatusFilter("essai")).toBe("essai");
    expect(parsePharmacyStatusFilter("inconnu")).toBeNull();
    expect(parsePharmacySort(null)).toBe("recent");
    expect(parseUserRole("owner")).toBe("OWNER");
    expect(parseUserRole("ADMIN")).toBeNull();
    expect(parseTimelineKind("paiement")).toBe("paiement");
    expect(parseTimelineKind("patient")).toBeNull();
    expect(searchParam({ q: ["  lyon ", "x"] }, "q")).toBe("lyon");
    expect(searchParam({ q: "   " }, "q")).toBeNull();
    expect(parsePage("3")).toBe(3);
    expect(parsePage("-2")).toBe(1);
    expect(parsePage("abc")).toBe(1);
  });

  it("texte : recherche normalisée, coupure propre", () => {
    expect(normalizeSearch("  Élodie  MARTIN ")).toBe("elodie martin");
    expect(truncate("abcdef", 4)).toBe("abc…");
    expect(truncate("abc", 4)).toBe("abc");
  });
});

// ---------------------------------------------------------------- Connecteur et postes

describe("état technique", () => {
  const fresh = { status: "CONNECTED", lastSyncAt: secondsAgo(60), lastSeenAt: secondsAgo(30), intervalSeconds: 300 };

  it("connecteur : chaque état et le filtre « erreurs »", () => {
    expect(connectorState(null, NOW).state).toBe("NONE");
    expect(connectorState({ ...fresh, status: "PENDING" }, NOW).state).toBe("PENDING");
    expect(connectorState({ ...fresh, status: "DISCONNECTED" }, NOW).state).toBe("REVOKED");
    expect(connectorState({ ...fresh, status: "ERROR" }, NOW).state).toBe("ERROR");
    expect(connectorState(fresh, NOW).state).toBe("FRESH");
    expect(connectorState({ ...fresh, lastSyncAt: secondsAgo(3000) }, NOW).state).toBe("STALE");
    expect(connectorState({ ...fresh, lastSeenAt: secondsAgo(4000) }, NOW).state).toBe("OFFLINE");
    expect(["ERROR", "REVOKED", "OFFLINE", "STALE"].every((s) => connectorNeedsAttention(s as never))).toBe(true);
    expect(connectorNeedsAttention("FRESH")).toBe(false);
    expect(connectorNeedsAttention("NONE")).toBe(false);
  });

  it("poste : en ligne sous 180 secondes, erreur d'export signalée, révoqué neutre", () => {
    const post = { lastSeenAt: secondsAgo(60), lastExportError: null, revokedAt: null, pairedAt: daysAgo(10) };
    expect(counterPostState(post, NOW)).toMatchObject({ state: "ONLINE", online: true });
    expect(counterPostState({ ...post, lastSeenAt: secondsAgo(181) }, NOW)).toMatchObject({ state: "OFFLINE", online: false, tone: "neutral" });
    expect(counterPostState({ ...post, lastExportError: "Dossier introuvable" }, NOW).state).toBe("EXPORT_ERROR");
    expect(counterPostState({ ...post, revokedAt: daysAgo(1) }, NOW).state).toBe("REVOKED");
    expect(counterPostState({ ...post, pairedAt: null }, NOW).state).toBe("PENDING");
    expect(counterPostInError({ ...post, lastExportError: "x" })).toBe(true);
    expect(counterPostInError({ ...post, lastExportError: "x", revokedAt: daysAgo(1) })).toBe(false);
  });
});

// ---------------------------------------------------------------- Comptes, invitations, relance

describe("comptes, invitations et relance contextuelle", () => {
  it("accès d'un compte", () => {
    expect(userAccessState({ status: "ACTIVE", memberships: [{ isActive: true }] }).state).toBe("ACTIVE");
    expect(userAccessState({ status: "ACTIVE", memberships: [{ isActive: false }] }).state).toBe("SUSPENDED");
    expect(userAccessState({ status: "SUSPENDED", memberships: [{ isActive: true }] }).state).toBe("SUSPENDED");
    expect(userAccessState({ status: "DISABLED", memberships: [] }).state).toBe("DISABLED");
    expect(userAccessState({ status: "INVITED", memberships: [{ isActive: true }] }).state).toBe("INVITED");
    expect(userAccessState({ status: "ACTIVE", memberships: [] }).state).toBe("ACTIVE");
  });

  it("invitation : en attente, expirée, en échec, complétée", () => {
    const inv = { expiresAt: daysAgo(-3), completedAt: null, revokedAt: null, sentAt: daysAgo(1), lastSendStatus: "SENT" };
    expect(invitationState(inv, NOW).state).toBe("PENDING");
    expect(invitationState({ ...inv, expiresAt: daysAgo(1) }, NOW).state).toBe("EXPIRED");
    expect(invitationState({ ...inv, lastSendStatus: "FAILED" }, NOW).state).toBe("FAILED");
    expect(invitationState({ ...inv, sentAt: null, lastSendStatus: null }, NOW).state).toBe("TO_SEND");
    expect(invitationState({ ...inv, completedAt: daysAgo(0) }, NOW).state).toBe("COMPLETED");
  });

  it("relancer : contrat en attente, sinon impayé, sinon fin d'essai, sinon rien", () => {
    const sub = { status: "ACTIVE", lastPaymentAt: daysAgo(30), lastPaymentFailedAt: null, trialEndsAt: null };
    const contract = { id: "c1", status: "SENT", pharmacySignerEmail: "t@o.fr", reminderCount: 1 };
    expect(relaunchContext({ contract, subscription: sub, now: NOW })).toEqual({ kind: "contract", contractId: "c1", signerEmail: "t@o.fr", reminderCount: 1 });
    expect(relaunchContext({ contract: { ...contract, status: "FINALIZED" }, subscription: { ...sub, lastPaymentFailedAt: daysAgo(2) }, now: NOW })).toEqual({ kind: "payment" });
    expect(relaunchContext({ contract: null, subscription: { ...sub, status: "PAST_DUE" }, now: NOW })).toEqual({ kind: "payment" });
    expect(relaunchContext({ contract: null, subscription: { ...sub, status: "TRIALING", trialEndsAt: daysAgo(-5) }, now: NOW })).toEqual({ kind: "trial" });
    expect(relaunchContext({ contract: null, subscription: { ...sub, status: "TRIALING", trialEndsAt: daysAgo(-20) }, now: NOW })).toBeNull();
    expect(relaunchContext({ contract: null, subscription: sub, now: NOW })).toBeNull();
    expect(relaunchContext({ contract: null, subscription: null, now: NOW })).toBeNull();
  });
});

// ---------------------------------------------------------------- Frise

describe("frise de l'officine depuis les lignes brutes", () => {
  it("événements du dossier : nature et couleur", () => {
    expect(prospectEventEntry({ id: "e1", type: "CONTRACT_SIGNED", summary: "Contrat signé", actorLabel: "Signataire", createdAt: daysAgo(1) })).toMatchObject({ id: "prospect-event:e1", kind: "contrat", tone: "success", actor: "Signataire" });
    expect(prospectEventEntry({ id: "e2", type: "EMAIL_SENT", summary: "x", actorLabel: null, createdAt: NOW }).kind).toBe("email");
    expect(prospectEventEntry({ id: "e3", type: "TASK_CREATED", summary: "x", actorLabel: null, createdAt: NOW }).kind).toBe("commercial");
    expect(prospectEventEntry({ id: "e4", type: "PHARMACY_CREATED", summary: "x", actorLabel: null, createdAt: NOW }).kind).toBe("dossier");
  });

  it("journal d'audit : libellé, détail lisible, sources déjà racontées écartées", () => {
    const suspended = auditEntry({ id: "a1", action: "billing.access_suspended", metadata: { reason: "Impayé depuis septembre" }, createdAt: NOW }, "Adam B.");
    expect(suspended).toMatchObject({ id: "audit:a1", kind: "acces", title: "Accès suspendu", tone: "danger", actor: "Adam B.", detail: "Motif : Impayé depuis septembre" });
    const updated = auditEntry({ id: "a2", action: "platform.pharmacy_updated", metadata: { changes: { name: { from: "A", to: "B" } } }, createdAt: NOW }, null);
    expect(updated?.detail).toBe("nom : A → B");
    expect(auditEntry({ id: "a3", action: "platform.note_added", metadata: {}, createdAt: NOW }, null)).toBeNull();
    expect(auditEntry({ id: "a4", action: "billing.contract_price_changed", metadata: {}, createdAt: NOW }, null)).toBeNull();
    expect(auditEntry({ id: "a5", action: "patient.health_viewed", metadata: {}, createdAt: NOW }, null)).toBeNull();
    expect(auditEntry({ id: "a6", action: "billing.nouvelle_action", metadata: {}, createdAt: NOW }, null)).toMatchObject({ kind: "abonnement" });
    // Les gestes commerciaux sont racontés par l'événement du dossier qui les double.
    expect(auditEntry({ id: "a7", action: "sales.demo_scheduled", metadata: {}, createdAt: NOW }, null)).toBeNull();
    expect(describeAuditMetadata("platform.pharmacy_status_changed", { isActive: false })).toBe("Officine suspendue");
    expect(describeAuditMetadata("x", null)).toBeNull();
  });

  it("Stripe : une facture ne revient pas en double, sauf traitement en erreur", () => {
    expect(billingEventEntry({ id: "b1", type: "invoice.paid", summary: "Facture payée", receivedAt: NOW, error: null })).toBeNull();
    expect(billingEventEntry({ id: "b2", type: "invoice.paid", summary: "Facture payée", receivedAt: NOW, error: "boom" })).toMatchObject({ kind: "paiement", tone: "danger" });
    expect(billingEventEntry({ id: "b3", type: "customer.subscription.updated", summary: "Abonnement mis à jour", receivedAt: NOW, error: null })).toMatchObject({ kind: "abonnement", title: "Stripe : Abonnement mis à jour" });
  });

  it("paiement : date du fait, montant, couleur du statut", () => {
    const entry = paymentEntry({ id: "p1", status: "FAILED", amountCents: 29000, createdAt: daysAgo(5), paidAt: null, failedAt: daysAgo(4), periodStart: null, periodEnd: null, attemptCount: 3 });
    expect(entry).toMatchObject({ id: "payment:p1", kind: "paiement", tone: "danger", title: "Paiement échoué — 290 €", detail: "3 tentatives" });
    expect(entry.at.toISOString()).toBe(daysAgo(4).toISOString());
  });

  it("contrat : une entrée par étape datée ; l'expiration seulement si le contrat a expiré", () => {
    const contract: ContractTimelineFacts = { id: "k1", version: 2, status: "SENT", monthlyPriceCents: 29000, pharmacySignerEmail: "t@o.fr", createdAt: daysAgo(10), sentAt: daysAgo(9), openedAt: daysAgo(8), pharmacySignedAt: null, companySignedAt: null, finalizedAt: null, refusedAt: null, refusalReason: null, expiresAt: daysAgo(1) };
    expect(contractEntries(contract, NOW).map((e) => e.id)).toEqual(["contract:k1:created", "contract:k1:sent", "contract:k1:opened"]);
    const expired = contractEntries({ ...contract, status: "EXPIRED" }, NOW);
    expect(expired.at(-1)).toMatchObject({ id: "contract:k1:expired", tone: "warning" });
  });

  it("e-mail, note, résiliation, tarif, jalons d'abonnement", () => {
    expect(emailEntry({ id: "m1", kind: "CONTRACT_REMINDER", subject: null, recipient: "t@o.fr", status: "BOUNCED", trigger: "AUTOMATIC", createdAt: NOW })).toMatchObject({ title: "Relance de contrat", tone: "danger", detail: "À t@o.fr · Adresse rejetée · Automatique" });
    expect(noteEntry({ id: "n1", body: "x".repeat(400), pinned: true, authorLabel: "Adam", createdAt: NOW }).detail?.length).toBe(240);
    expect(cancellationEventEntry({ id: "c1", type: "STATUS_CHANGED", summary: "Demande confirmée", fromStatus: "RECEIVED", toStatus: "CONFIRMED", actorLabel: "Adam", createdAt: NOW })).toMatchObject({ kind: "resiliation", detail: "Demande reçue → Confirmée", tone: "danger" });
    expect(priceChangeEntry({ id: "t1", previousCents: 29000, nextCents: 34900, reason: "Avenant signé", appliedToStripe: false, effectiveAt: NOW, createdAt: NOW }, "Adam").title).toBe("Tarif contractuel : 290 € → 349 € HT par mois");
    const milestones = subscriptionEntries({ id: "s1", createdAt: daysAgo(20), trialStartsAt: daysAgo(20), trialEndsAt: daysAgo(-10), canceledAt: null, endedAt: null }, "PharmaBoost", NOW);
    expect(milestones.map((e) => e.id)).toEqual(["subscription:s1:created", "subscription:s1:trial-start"]);
  });

  it("tarif : daté de son enregistrement, la date d'effet future dans le détail (défaut corrigé)", () => {
    // Abonnement Stripe : le nouveau tarif s'applique à l'échéance, un mois plus tard.
    const change = { id: "t2", previousCents: 29000, nextCents: 25000, reason: "Geste commercial", appliedToStripe: true, effectiveAt: new Date("2026-11-04T09:00:00.000Z"), createdAt: daysAgo(2) };
    const entry = priceChangeEntry(change, "Adam");
    expect(entry.at.toISOString()).toBe(daysAgo(2).toISOString());
    expect(entry.detail).toBe("Motif : Geste commercial · appliqué chez Stripe, effet à l'échéance du 04/11/2026");
    expect(priceChangeEntry({ ...change, appliedToStripe: false, effectiveAt: daysAgo(2) }, null).detail).toBe("Motif : Geste commercial · fiche seule, Stripe inchangé, effet le 01/10/2026");
    // Un fait du jour passe devant ce changement d'avant-hier : rien n'est épinglé en tête jusqu'à l'échéance.
    const merged = mergeTimeline([[entry], [noteEntry({ id: "n2", body: "Appel du jour", pinned: false, authorLabel: "Adam", createdAt: NOW })]]);
    expect(merged.map((e) => e.id)).toEqual(["note:n2", "price-change:t2"]);
  });

  it("la fusion trie du plus récent au plus ancien, toutes sources confondues", () => {
    const merged = mergeTimeline([
      [noteEntry({ id: "n1", body: "Appel", pinned: false, authorLabel: "Adam", createdAt: daysAgo(3) })],
      [paymentEntry({ id: "p1", status: "PAID", amountCents: 29000, createdAt: daysAgo(1), paidAt: daysAgo(1), failedAt: null, periodStart: null, periodEnd: null, attemptCount: 1 })],
      [prospectEventEntry({ id: "e1", type: "CREATED", summary: "Dossier créé", actorLabel: null, createdAt: daysAgo(30) })],
    ]);
    expect(merged.map((e) => e.kind)).toEqual(["paiement", "note", "dossier"]);
  });
});

describe("« À surveiller »", () => {
  it("trois pastilles, chacune avec son libellé ; une valeur inconnue n'en est pas une", () => {
    expect(WATCH_FILTERS).toEqual(["technique", "inactives", "stock"]);
    for (const filter of WATCH_FILTERS) expect(WATCH_FILTER_LABELS[filter].length).toBeGreaterThan(3);
    expect(parseWatchFilter("stock")).toBe("stock");
    expect(parseWatchFilter("n-importe-quoi")).toBeNull();
    expect(parseWatchFilter(null)).toBeNull();
  });
});
