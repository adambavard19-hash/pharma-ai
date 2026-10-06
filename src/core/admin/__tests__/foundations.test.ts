import { describe, expect, it } from "vitest";
import {
  AUTOMATION_RULES,
  AUTOMATION_SCENARIOS,
  CATCH_UP_DAYS,
  calendarDaysUntil,
  clampOffset,
  contactTemplateChoices,
  describeOffset,
  dueDay,
  hasUnpaidFailure,
  isContextBoundTemplate,
  isDueNow,
  paymentSequenceError,
  planAutomations,
  resolveRules,
  unpaidSeriesStart,
  type FilleulCandidate,
  type PartnerCandidate,
  type PlannedAutomation,
  type SubscriptionCandidate,
} from "../automations";
import { EMAIL_TEMPLATES, emailTemplate, fillVariables, renderTemplateEmail, sampleValues, unknownVariables, validateTemplateText, variablesIn } from "../email-templates";
import { ADMIN_NAV, activeNavItem } from "../nav";
import { filterTimeline, groupTimelineByDay, mergeTimeline, type TimelineEntry } from "../timeline";
import { canMoveCancellation, CANCELLATION_STATUSES, CANCELLATION_TRANSITIONS } from "../statuses";
import { catalogDiffers, contractualPrice, initialContractPriceCents, mrrCents, validateContractPriceChange } from "@/core/billing/contract-price";
import { DEFAULT_EMAIL_CONTEXT } from "@/core/platform/email-layout";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-10T08:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

function sub(overrides: Partial<SubscriptionCandidate> = {}): SubscriptionCandidate {
  return { id: "sub_1", organizationId: "org_1", pharmacyId: "ph_1", status: "TRIALING", trialStartsAt: daysAgo(1), trialEndsAt: new Date(NOW.getTime() + 29 * DAY), lastPaymentAt: null, lastPaymentFailedAt: null, suspendedAt: null, ...overrides };
}

const enabled = (keys: string[], offsets: Record<string, number> = {}) => resolveRules(AUTOMATION_RULES.filter((r) => keys.includes(r.key)).map((r) => ({ key: r.key, enabled: true, offsetDays: offsets[r.key] ?? r.defaultOffsetDays })));

describe("automatisations : sûres par défaut", () => {
  it("sans réglage en base, toutes les règles sont désactivées et rien n'est planifié", () => {
    const rules = resolveRules([]);
    expect(rules.every((r) => !r.enabled)).toBe(true);
    expect(planAutomations({ rules, subscriptions: [sub()], cancellations: [], prospects: [], alreadyDone: new Set(), now: NOW })).toEqual([]);
  });

  it("une règle activée planifie ce qui est dû, une seule fois", () => {
    const planned = planAutomations({ rules: enabled(["trial.welcome"]), subscriptions: [sub()], cancellations: [], prospects: [], alreadyDone: new Set(), now: NOW });
    expect(planned).toHaveLength(1);
    expect(planned[0]).toMatchObject({ ruleKey: "trial.welcome", targetId: "sub_1", channel: "EMAIL", templateKey: "trial.welcome" });
    // Deuxième passage : la clé est consommée, rien n'est reproposé.
    const again = planAutomations({ rules: enabled(["trial.welcome"]), subscriptions: [sub()], cancellations: [], prospects: [], alreadyDone: new Set(planned.map((p) => p.dedupeKey)), now: NOW });
    expect(again).toEqual([]);
  });

  it("activer une règle ne rattrape pas les vieux dossiers : seulement l'échu des derniers jours", () => {
    const old = sub({ id: "sub_old", trialStartsAt: daysAgo(1 + CATCH_UP_DAYS + 1) });
    const recent = sub({ id: "sub_recent", trialStartsAt: daysAgo(2) });
    const planned = planAutomations({ rules: enabled(["trial.welcome"]), subscriptions: [old, recent], cancellations: [], prospects: [], alreadyDone: new Set(), now: NOW });
    expect(planned.map((p) => p.targetId)).toEqual(["sub_recent"]);
  });

  it("rien avant l'échéance (rappel de fin d'essai à J-5)", () => {
    const tooEarly = sub({ trialEndsAt: new Date(NOW.getTime() + 10 * DAY) });
    const due = sub({ id: "sub_due", trialEndsAt: new Date(NOW.getTime() + 5 * DAY - 60_000) });
    const planned = planAutomations({ rules: enabled(["trial.ending_soon"]), subscriptions: [tooEarly, due], cancellations: [], prospects: [], alreadyDone: new Set(), now: NOW });
    expect(planned.map((p) => p.targetId)).toEqual(["sub_due"]);
  });

  it("fin d'essai : seulement un essai non poursuivi, jamais un abonnement devenu actif", () => {
    const converted = sub({ id: "ok", status: "ACTIVE", trialEndsAt: daysAgo(1) });
    const lapsed = sub({ id: "lapsed", status: "PAUSED", trialEndsAt: daysAgo(1) });
    const planned = planAutomations({ rules: enabled(["trial.ended"], { "trial.ended": 0 }), subscriptions: [converted, lapsed], cancellations: [], prospects: [], alreadyDone: new Set(), now: NOW });
    expect(planned.map((p) => p.targetId)).toEqual(["lapsed"]);
  });

  it("paiement : relance tant que l'échec reste impayé, et une nouvelle série (après un paiement réussi) repart de zéro", () => {
    const failed = sub({ status: "PAST_DUE", lastPaymentFailedAt: daysAgo(2), unpaidSinceAt: daysAgo(2), lastPaymentAt: daysAgo(40) });
    const paidSince = sub({ id: "paid", status: "ACTIVE", lastPaymentFailedAt: daysAgo(2), lastPaymentAt: daysAgo(1) });
    expect(hasUnpaidFailure(failed)).toBe(true);
    expect(hasUnpaidFailure(paidSince)).toBe(false);
    const first = planAutomations({ rules: enabled(["payment.reminder_1"]), subscriptions: [failed, paidSince], cancellations: [], prospects: [], alreadyDone: new Set(), now: NOW });
    expect(first.map((p) => p.targetId)).toEqual(["sub_1"]);
    // Même série : clé déjà consommée.
    expect(planAutomations({ rules: enabled(["payment.reminder_1"]), subscriptions: [failed], cancellations: [], prospects: [], alreadyDone: new Set(first.map((p) => p.dedupeKey)), now: NOW })).toEqual([]);
    // Payé dix jours plus tard, puis un nouvel échec : nouvelle série, nouvelle clé.
    const newSeries = sub({ status: "PAST_DUE", lastPaymentAt: new Date(NOW.getTime() + 10 * DAY), lastPaymentFailedAt: new Date(NOW.getTime() + 20 * DAY), unpaidSinceAt: new Date(NOW.getTime() + 20 * DAY) });
    const inTwentyTwoDays = new Date(NOW.getTime() + 22 * DAY);
    expect(planAutomations({ rules: enabled(["payment.reminder_1"]), subscriptions: [newSeries], cancellations: [], prospects: [], alreadyDone: new Set(first.map((p) => p.dedupeKey)), now: inTwentyTwoDays })).toHaveLength(1);
  });

  it("paiement : ancré sur le début de la série impayée, une nouvelle tentative de Stripe ne relance pas la série", () => {
    // Premier échec le 1er octobre à 11 h (Paris), tentatives de Stripe à J+3, J+6, J+9 ; un passage chaque matin à 8 h 15 UTC.
    const firstFailure = new Date("2026-10-01T09:00:00Z");
    const attempts = [0, 3, 6, 9].map((d) => new Date(firstFailure.getTime() + d * DAY));
    const rules = enabled(["payment.reminder_1", "payment.reminder_2", "payment.internal_alert"]);
    const done = new Set<string>();
    const fired: { day: number; rule: string; anchorAt: string }[] = [];
    for (let day = 0; day <= 20; day += 1) {
      const now = new Date(Date.UTC(2026, 9, 1 + day, 8, 15));
      const lastAttempt = attempts.filter((a) => a.getTime() <= now.getTime()).at(-1) ?? null;
      const candidate = sub({ status: "PAST_DUE", trialStartsAt: null, trialEndsAt: null, lastPaymentAt: new Date("2026-09-01T09:00:00Z"), lastPaymentFailedAt: lastAttempt, unpaidSinceAt: lastAttempt ? firstFailure : null });
      for (const planned of planAutomations({ rules, subscriptions: [candidate], cancellations: [], prospects: [], alreadyDone: done, now })) {
        done.add(planned.dedupeKey);
        fired.push({ day, rule: planned.ruleKey, anchorAt: planned.anchorAt.toISOString() });
      }
    }
    expect(fired).toEqual([
      { day: 2, rule: "payment.reminder_1", anchorAt: firstFailure.toISOString() },
      { day: 7, rule: "payment.reminder_2", anchorAt: firstFailure.toISOString() },
      { day: 10, rule: "payment.internal_alert", anchorAt: firstFailure.toISOString() },
    ]);
  });

  it("série impayée : la plus ancienne facture due après le dernier paiement réussi, sinon le dernier échec", () => {
    const lastPaymentAt = new Date("2026-09-15T08:00:00Z");
    const lastPaymentFailedAt = new Date("2026-10-09T08:00:00Z");
    const invoices = [
      { status: "FAILED", createdAt: new Date("2026-09-01T08:00:00Z") }, // avant le dernier paiement : une autre série
      { status: "PAID", createdAt: new Date("2026-09-30T08:00:00Z") },
      { status: "VOID", createdAt: new Date("2026-09-30T09:00:00Z") },
      { status: "FAILED", createdAt: new Date("2026-10-05T08:00:00Z") },
      { status: "OPEN", createdAt: new Date("2026-10-02T08:00:00Z") },
    ];
    expect(unpaidSeriesStart({ lastPaymentAt, lastPaymentFailedAt }, invoices)?.toISOString()).toBe("2026-10-02T08:00:00.000Z");
    expect(unpaidSeriesStart({ lastPaymentAt, lastPaymentFailedAt }, [])).toBe(lastPaymentFailedAt);
    // Payé le 20 octobre, nouvel échec le 1er novembre : la série repart de la nouvelle facture.
    const nextSeries = [...invoices, { status: "FAILED", createdAt: new Date("2026-11-01T08:00:00Z") }];
    expect(unpaidSeriesStart({ lastPaymentAt: new Date("2026-10-20T08:00:00Z"), lastPaymentFailedAt: new Date("2026-11-04T08:00:00Z") }, nextSeries)?.toISOString()).toBe("2026-11-01T08:00:00.000Z");
  });

  it("une officine suspendue ne reçoit aucune relance automatique", () => {
    const suspended = sub({ suspendedAt: daysAgo(3), status: "SUSPENDED" });
    expect(planAutomations({ rules: enabled(["trial.welcome", "payment.reminder_1"]), subscriptions: [suspended], cancellations: [], prospects: [], alreadyDone: new Set(), now: NOW })).toEqual([]);
  });

  it("résiliation : accusé pour une demande ouverte, confirmation pour une demande confirmée", () => {
    const planned = planAutomations({
      rules: enabled(["cancellation.acknowledgement", "cancellation.confirmation"]),
      subscriptions: [],
      cancellations: [
        { id: "c_open", pharmacyId: "ph_1", status: "RECEIVED", requestedAt: daysAgo(0.5), confirmedAt: null },
        { id: "c_done", pharmacyId: "ph_2", status: "CONFIRMED", requestedAt: daysAgo(20), confirmedAt: daysAgo(0.2) },
        { id: "c_canceled", pharmacyId: "ph_3", status: "CANCELED", requestedAt: daysAgo(0.5), confirmedAt: null },
      ],
      prospects: [],
      alreadyDone: new Set(),
      now: NOW,
    });
    expect(planned.map((p) => `${p.ruleKey}:${p.targetId}`).sort()).toEqual(["cancellation.acknowledgement:c_open", "cancellation.confirmation:c_done"]);
  });

  it("suivi commercial : alerte interne pour un dossier ouvert en retard, jamais pour un dossier clos", () => {
    const planned = planAutomations({
      rules: enabled(["prospect.followup_overdue"]),
      subscriptions: [],
      cancellations: [],
      prospects: [
        { id: "p_late", status: "CONTACTED", nextActionAt: daysAgo(1.5), blockedAt: null, salesRepId: "rep_1" },
        { id: "p_lost", status: "LOST", nextActionAt: daysAgo(1.5), blockedAt: null, salesRepId: null },
      ],
      alreadyDone: new Set(),
      now: NOW,
    });
    expect(planned).toHaveLength(1);
    expect(planned[0]).toMatchObject({ targetId: "p_late", channel: "INTERNAL" });
  });

  it("suivi commercial : un contact noté après la date prévue vaut relance faite, aucune alerte", () => {
    const planned = planAutomations({
      rules: enabled(["prospect.followup_overdue"]),
      subscriptions: [],
      cancellations: [],
      prospects: [
        { id: "p_done", status: "CONTRACT_SENT", nextActionAt: daysAgo(1.5), lastContactAt: daysAgo(1.4), blockedAt: null, salesRepId: "rep_1" },
        { id: "p_stale", status: "CONTACTED", nextActionAt: daysAgo(1.5), lastContactAt: daysAgo(3), blockedAt: null, salesRepId: "rep_1" },
      ],
      alreadyDone: new Set(),
      now: NOW,
    });
    expect(planned.map((p) => p.targetId)).toEqual(["p_stale"]);
  });

  it("un délai réglé hors bornes est ramené dans les bornes", () => {
    const rule = AUTOMATION_RULES.find((r) => r.key === "trial.ending_soon")!;
    expect(clampOffset(rule, 3)).toBe(-1);
    expect(clampOffset(rule, -40)).toBe(-14);
    expect(describeOffset(-5)).toBe("J-5");
    expect(describeOffset(0)).toBe("Le jour même");
  });

  it("chaque règle e-mail pointe vers un modèle existant", () => {
    for (const rule of AUTOMATION_RULES) if (rule.channel === "EMAIL") expect(emailTemplate(rule.templateKey!)).not.toBeNull();
  });
});

describe("automatisations : échéances au jour de Paris", () => {
  const plan = (keys: string[], input: { subscriptions?: SubscriptionCandidate[]; cancellations?: Parameters<typeof planAutomations>[0]["cancellations"] }, now: Date, offsets: Record<string, number> = {}): PlannedAutomation[] =>
    planAutomations({ rules: enabled(keys, offsets), subscriptions: input.subscriptions ?? [], cancellations: input.cancellations ?? [], prospects: [], alreadyDone: new Set(), now });

  it("J+1 part le lendemain au passage du matin, même pour un essai commencé après ce passage", () => {
    // Essai commencé le 9 à 11 h 30 (Paris), après le passage de 8 h 15 UTC : la bienvenue part le 10 au matin.
    const started = sub({ trialStartsAt: new Date("2026-10-09T09:30:00Z") });
    expect(plan(["trial.welcome"], { subscriptions: [started] }, new Date("2026-10-10T08:15:00Z"))).toHaveLength(1);
    expect(plan(["trial.welcome"], { subscriptions: [started] }, new Date("2026-10-09T21:00:00Z"))).toEqual([]);
  });

  it("le jour se lit à Paris, pas en UTC : 0 h 30 le 10 (Paris) est le 10, pas le 9", () => {
    const started = sub({ trialStartsAt: new Date("2026-10-09T22:30:00Z") });
    expect(dueDay(started.trialStartsAt!, 1)).toBe("2026-10-11");
    expect(plan(["trial.welcome"], { subscriptions: [started] }, new Date("2026-10-10T08:15:00Z"))).toEqual([]);
    expect(plan(["trial.welcome"], { subscriptions: [started] }, new Date("2026-10-11T08:15:00Z"))).toHaveLength(1);
  });

  it("« Le jour même » part le jour même, quelle que soit l'heure de la demande", () => {
    const request = { id: "c_1", pharmacyId: "ph_1", status: "RECEIVED", requestedAt: new Date("2026-10-10T14:00:00Z"), confirmedAt: null };
    const [planned] = plan(["cancellation.acknowledgement"], { cancellations: [request] }, new Date("2026-10-10T16:00:00Z"));
    expect(planned).toMatchObject({ targetId: "c_1" });
    // Échue depuis minuit, heure de Paris.
    expect(planned.dueAt.toISOString()).toBe("2026-10-09T22:00:00.000Z");
    // Sans passage le soir même, le passage du lendemain matin la rattrape.
    expect(plan(["cancellation.acknowledgement"], { cancellations: [request] }, new Date("2026-10-11T08:15:00Z"))).toHaveLength(1);
  });

  it(`rattrapage : jusqu'à ${CATCH_UP_DAYS} jours calendaires après le jour d'échéance, pas au-delà`, () => {
    expect(isDueNow("2026-10-10", new Date("2026-10-09T21:59:00Z"))).toBe(false);
    expect(isDueNow("2026-10-10", new Date("2026-10-09T22:00:00Z"))).toBe(true);
    expect(isDueNow("2026-10-10", new Date("2026-10-12T21:59:00Z"))).toBe(true);
    expect(isDueNow("2026-10-10", new Date("2026-10-12T22:00:00Z"))).toBe(false);
  });

  it("{{jours_restants}} : des jours calendaires, pas des tranches de 24 h arrondies", () => {
    const trialEnd = new Date("2026-10-20T14:00:00Z");
    expect(calendarDaysUntil(trialEnd, new Date("2026-10-16T08:15:00Z"))).toBe(4);
    expect(Math.ceil((trialEnd.getTime() - new Date("2026-10-16T08:15:00Z").getTime()) / DAY)).toBe(5);
    expect(calendarDaysUntil(trialEnd, new Date("2026-10-20T06:00:00Z"))).toBe(0);
    expect(calendarDaysUntil(trialEnd, new Date("2026-10-22T06:00:00Z"))).toBe(0);
  });
});

describe("automatisations : ordre des relances de paiement", () => {
  const rules = (settings: Record<string, { enabled: boolean; offsetDays: number }>) => resolveRules(Object.entries(settings).map(([key, v]) => ({ key, ...v })));

  it("la deuxième relance part après la première, jamais le même jour", () => {
    const current = rules({ "payment.reminder_1": { enabled: true, offsetDays: 5 } });
    expect(paymentSequenceError(current, { key: "payment.reminder_2", enabled: true, offsetDays: 4 })).toMatch(/« Deuxième relance » doit partir après « Première relance » \(J\+5\) : choisissez au moins J\+6/);
    expect(paymentSequenceError(current, { key: "payment.reminder_2", enabled: true, offsetDays: 5 })).not.toBeNull();
    expect(paymentSequenceError(current, { key: "payment.reminder_2", enabled: true, offsetDays: 6 })).toBeNull();
  });

  it("la première relance ne peut pas être repoussée après la deuxième", () => {
    const current = rules({ "payment.reminder_2": { enabled: true, offsetDays: 7 } });
    expect(paymentSequenceError(current, { key: "payment.reminder_1", enabled: true, offsetDays: 8 })).toMatch(/doit partir avant « Deuxième relance » \(J\+7\)/);
    expect(paymentSequenceError(current, { key: "payment.reminder_1", enabled: true, offsetDays: 6 })).toBeNull();
  });

  it("l'alerte à l'équipe au plus tôt le jour de la dernière relance", () => {
    const current = rules({ "payment.reminder_1": { enabled: true, offsetDays: 2 }, "payment.reminder_2": { enabled: true, offsetDays: 7 } });
    expect(paymentSequenceError(current, { key: "payment.internal_alert", enabled: true, offsetDays: 6 })).toMatch(/au plus tôt le même jour que « Deuxième relance »/);
    expect(paymentSequenceError(current, { key: "payment.internal_alert", enabled: true, offsetDays: 7 })).toBeNull();
  });

  it("une règle désactivée ne compte pas ; désactiver est toujours permis ; les autres scénarios ne sont pas concernés", () => {
    const current = rules({ "payment.reminder_2": { enabled: false, offsetDays: 3 } });
    expect(paymentSequenceError(current, { key: "payment.reminder_1", enabled: true, offsetDays: 5 })).toBeNull();
    expect(paymentSequenceError(rules({ "payment.reminder_1": { enabled: true, offsetDays: 9 } }), { key: "payment.reminder_2", enabled: false, offsetDays: 2 })).toBeNull();
    expect(paymentSequenceError(current, { key: "trial.welcome", enabled: true, offsetDays: 0 })).toBeNull();
  });
});

describe("« Contacter » : les modèles proposés", () => {
  const keysOf = (list: { key: string }[]) => list.map((t) => t.key);

  it("ni relance de contrat ni résiliation hors de leur contexte", () => {
    const offered = keysOf(contactTemplateChoices(EMAIL_TEMPLATES, { audience: "Titulaire" }));
    expect(offered).not.toContain("contract.reminder");
    expect(offered).not.toContain("cancellation.received");
    expect(offered).not.toContain("cancellation.confirmed");
    expect(offered).toEqual(expect.arrayContaining(["trial.ending_soon", "payment.failed_reminder", "generic.message"]));
  });

  it("un modèle lié à un contexte reste proposé quand l'appelant le demande", () => {
    const offered = keysOf(contactTemplateChoices(EMAIL_TEMPLATES, { defaultTemplateKey: "cancellation.received" }));
    expect(offered).toContain("cancellation.received");
    expect(offered).not.toContain("cancellation.confirmed");
    expect(offered).not.toContain("contract.reminder");
  });
});

describe("tarif catalogue ≠ tarif contractuel", () => {
  it("un client signé à 290 € reste à 290 € quand le catalogue passe à 349 €", () => {
    const subscription = { contractPriceCents: 29000 };
    const planAfterChange = { monthlyPriceCents: 34900 };
    expect(contractualPrice(subscription, planAfterChange)).toEqual({ cents: 29000, source: "CONTRACT" });
    expect(catalogDiffers(subscription, planAfterChange)).toBe(true);
  });

  it("à la souscription, le tarif du contrat signé l'emporte sur le catalogue", () => {
    expect(initialContractPriceCents({ contractMonthlyPriceCents: 29000, planMonthlyPriceCents: 34900 })).toBe(29000);
    expect(initialContractPriceCents({ contractMonthlyPriceCents: null, planMonthlyPriceCents: 34900 })).toBe(34900);
  });

  it("une fiche ancienne sans tarif figé retombe sur l'offre, et le dit", () => {
    expect(contractualPrice({ contractPriceCents: null }, { monthlyPriceCents: 12900 })).toEqual({ cents: 12900, source: "CATALOG_FALLBACK" });
  });

  it("une modification de tarif exige un montant réel, différent, et un motif", () => {
    expect(validateContractPriceChange({ previousCents: 29000, nextCents: 29000, reason: "avenant" }).ok).toBe(false);
    expect(validateContractPriceChange({ previousCents: 29000, nextCents: 31000, reason: "x" }).ok).toBe(false);
    expect(validateContractPriceChange({ previousCents: 29000, nextCents: 50, reason: "Avenant signé" }).ok).toBe(false);
    expect(validateContractPriceChange({ previousCents: 29000, nextCents: 31000, reason: "  Avenant   signé le 3 octobre " })).toEqual({ ok: true, reason: "Avenant signé le 3 octobre" });
  });

  it("le MRR additionne les tarifs contractuels, hors essais, résiliations programmées et démos", () => {
    const rows = [
      { status: "ACTIVE", contractPriceCents: 29000, planMonthlyPriceCents: 34900, cancelAtPeriodEnd: false },
      { status: "PAST_DUE", contractPriceCents: null, planMonthlyPriceCents: 34900, cancelAtPeriodEnd: false },
      { status: "TRIALING", contractPriceCents: 34900, planMonthlyPriceCents: 34900, cancelAtPeriodEnd: false },
      { status: "ACTIVE", contractPriceCents: 34900, planMonthlyPriceCents: 34900, cancelAtPeriodEnd: true },
      { status: "ACTIVE", contractPriceCents: 34900, planMonthlyPriceCents: 34900, cancelAtPeriodEnd: false, isDemo: true },
      { status: "CANCELED", contractPriceCents: 34900, planMonthlyPriceCents: 34900, cancelAtPeriodEnd: false },
    ];
    expect(mrrCents(rows)).toBe(29000 + 34900);
    expect(mrrCents(rows, { includeTrials: true })).toBe(29000 + 34900 + 34900);
  });
});

describe("modèles d'e-mails", () => {
  it("chaque texte par défaut n'utilise que les variables déclarées de son modèle", () => {
    for (const t of EMAIL_TEMPLATES) expect(unknownVariables(t, t.defaults)).toEqual([]);
  });

  it("une variable inconnue est refusée à l'enregistrement", () => {
    const t = emailTemplate("trial.welcome")!;
    const checked = validateTemplateText(t, { subject: "Bienvenue {{officine}}", title: "Bienvenue", body: "Bonjour {{prenom}}, votre code {{code_secret}}." });
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.errors.body).toContain("{{code_secret}}");
  });

  it("le rendu remplace les variables, échappe le HTML et garde le bouton imposé", () => {
    const t = emailTemplate("contract.reminder")!;
    const html = renderTemplateEmail(DEFAULT_EMAIL_CONTEXT, t, { subject: "Rappel {{officine}}", title: "Signature", body: "Bonjour {{prenom}},\n\nMerci <b>!</b>" }, { prenom: "Camille", officine: "Pharmacie & Co", lien_contrat: "https://pharmaboost.app/contrat/abc" });
    expect(html.subject).toBe("Rappel Pharmacie & Co");
    expect(html.html).toContain("Bonjour Camille,");
    expect(html.html).toContain("Merci &lt;b&gt;!&lt;/b&gt;");
    expect(html.html).toContain("https://pharmaboost.app/contrat/abc");
    expect(html.text).toContain("Signer mon contrat : https://pharmaboost.app/contrat/abc");
  });

  it("une variable sans valeur devient vide, jamais « {{x}} » chez le client", () => {
    expect(fillVariables("Bonjour {{prenom}} !", {})).toBe("Bonjour  !");
    expect(variablesIn("{{ a }} et {{b}} et {{a}}")).toEqual(["a", "b"]);
    expect(Object.keys(sampleValues(emailTemplate("generic.message")!))).toContain("officine");
  });
});

describe("navigation de la console", () => {
  it("toutes les adresses existantes restent rangées dans un espace", () => {
    const hrefs = ADMIN_NAV.flatMap((s) => [s.href, ...s.items.map((i) => i.href)]);
    for (const existing of ["/admin", "/admin/pharmacies", "/admin/abonnements", "/admin/abonnements/offres", "/admin/pipeline", "/admin/notifications", "/admin/formations", "/admin/challenges", "/admin/partenaires", "/admin/commerciaux", "/admin/candidatures-commerciales", "/admin/equipe", "/admin/societe"]) {
      expect(hrefs).toContain(existing);
    }
  });

  it("la rubrique la plus précise l'emporte (Offres & tarifs plutôt qu'Abonnements)", () => {
    expect(activeNavItem("/admin/abonnements/offres").item?.label).toBe("Offres & tarifs");
    expect(activeNavItem("/admin/abonnements/abc123").item?.label).toBe("Abonnements");
    expect(activeNavItem("/admin/dossiers/xyz").item?.label).toBe("Prospects");
    expect(activeNavItem("/admin/partenaires/marques/1").space.key).toBe("administration");
    expect(activeNavItem("/admin").space.key).toBe("overview");
  });

  it("« Campagnes » ouvre l'espace Communication, devant les autres rubriques, sans en déplacer aucune", () => {
    const communication = ADMIN_NAV.find((space) => space.key === "communication")!;
    expect(communication.items.map((item) => item.href)).toEqual(["/admin/campagnes", "/admin/communications", "/admin/emails/modeles", "/admin/relances", "/admin/notifications"]);
    expect(communication.items[0]).toMatchObject({ label: "Campagnes" });
    expect(communication.items[0].description.length).toBeGreaterThan(20);
    // L'espace garde son adresse : l'historique reste ce qu'on ouvre en cliquant sur « Communication ».
    expect(communication.href).toBe("/admin/communications");
  });

  it("les pages d'une campagne se rattachent à « Campagnes », sans prendre la place de l'historique ni des relances", () => {
    for (const path of ["/admin/campagnes", "/admin/campagnes/nouvelle", "/admin/campagnes/ckx123abc", "/admin/campagnes/ckx123abc/modifier"]) {
      expect(activeNavItem(path)).toMatchObject({ space: { key: "communication" }, item: { label: "Campagnes" } });
    }
    expect(activeNavItem("/admin/communications").item?.label).toBe("Historique");
    expect(activeNavItem("/admin/relances").item?.label).toBe("Relances automatiques");
    expect(activeNavItem("/admin/emails/modeles/trial.welcome").item?.label).toBe("Modèles d'e-mails");
  });

  it("« Candidatures commerciales » suit « Commerciaux » dans l'espace Commercial, sans prendre la place d'aucune autre rubrique", () => {
    const commercial = ADMIN_NAV.find((space) => space.key === "commercial")!;
    const hrefs = commercial.items.map((item) => item.href);
    expect(hrefs).toEqual(["/admin/pipeline", "/admin/prospects", "/admin/demonstrations", "/admin/relances-commerciales", "/admin/commerciaux", "/admin/candidatures-commerciales", "/admin/directeur-commercial"]);
    for (const path of ["/admin/candidatures-commerciales", "/admin/candidatures-commerciales/ckx123abc"]) {
      expect(activeNavItem(path)).toMatchObject({ space: { key: "commercial" }, item: { label: "Candidatures commerciales" } });
    }
    // Les adresses voisines gardent leur rubrique : « commerciaux » n'est pas un préfixe de « candidatures-commerciales ».
    expect(activeNavItem("/admin/commerciaux/ckx123abc").item?.label).toBe("Commerciaux");
    expect(activeNavItem("/admin/relances-commerciales").item?.label).toBe("Relances commerciales");
    expect(commercial.href).toBe("/admin/pipeline");
  });

  it("« Directeur commercial » ferme l'espace Commercial et garde sa propre rubrique", () => {
    const item = ADMIN_NAV.find((space) => space.key === "commercial")!.items.find((entry) => entry.href === "/admin/directeur-commercial")!;
    expect(item.label).toBe("Directeur commercial");
    expect(item.description).toBe("Le compte qui gère l'équipe commerciale depuis son propre espace.");
    expect(activeNavItem("/admin/directeur-commercial")).toMatchObject({ space: { key: "commercial" }, item: { label: "Directeur commercial" } });
    // « commercial » n'est préfixe d'aucune rubrique voisine, et inversement.
    expect(activeNavItem("/admin/commerciaux").item?.label).toBe("Commerciaux");
  });

  it("« Stocks reçus » ferme l'espace Clients, sans déplacer aucune autre rubrique", () => {
    const clients = ADMIN_NAV.find((space) => space.key === "clients")!;
    expect(clients.items.map((item) => item.href)).toEqual(["/admin/pharmacies", "/admin/utilisateurs", "/admin/activite", "/admin/performance", "/admin/acces", "/admin/technique", "/admin/depots-stock"]);
    expect(clients.items.at(-1)).toMatchObject({ label: "Stocks reçus", description: "Le dernier stock reçu de chaque officine, et chaque fichier envoyé." });
    // L'espace garde son adresse : « Clients » ouvre toujours la liste des officines.
    expect(clients.href).toBe("/admin/pharmacies");
    expect(activeNavItem("/admin/depots-stock")).toMatchObject({ space: { key: "clients" }, item: { label: "Stocks reçus" } });
    // Le fichier d'un dépôt reste rattaché à la même rubrique ; « État technique » garde la sienne.
    expect(activeNavItem("/admin/depots-stock/ckx123abc").item?.label).toBe("Stocks reçus");
    expect(activeNavItem("/admin/technique").item?.label).toBe("État technique");
  });

  it("« Performance » suit « Activité » dans l'espace Clients, avec sa phrase, sans prendre la place des fiches officines", () => {
    const clients = ADMIN_NAV.find((space) => space.key === "clients")!;
    const hrefs = clients.items.map((item) => item.href);
    expect(hrefs.indexOf("/admin/performance")).toBe(hrefs.indexOf("/admin/activite") + 1);
    expect(clients.items.find((item) => item.href === "/admin/performance")).toEqual({
      href: "/admin/performance",
      label: "Performance",
      description: "La valeur générée par PharmaBoost, officine par officine : qui en tire beaucoup, qui a besoin d'accompagnement.",
    });
    expect(activeNavItem("/admin/performance")).toMatchObject({ space: { key: "clients" }, item: { label: "Performance" } });
    // L'onglet « Performance » d'une fiche est une page de la fiche (`?onglet=`) : la rubrique reste « Officines clientes ».
    expect(activeNavItem("/admin/pharmacies/ckx123abc")).toMatchObject({ space: { key: "clients" }, item: { label: "Officines clientes" } });
    // Les rubriques voisines gardent la leur.
    expect(activeNavItem("/admin/activite").item?.label).toBe("Activité");
  });

  it("chaque rubrique de la console a une adresse unique et une description", () => {
    const hrefs = ADMIN_NAV.flatMap((space) => space.items.map((item) => item.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const item of ADMIN_NAV.flatMap((space) => space.items)) expect(item.description.trim().length).toBeGreaterThan(0);
  });
});

describe("frise d'une officine", () => {
  const e = (id: string, iso: string, kind: TimelineEntry["kind"] = "dossier"): TimelineEntry => ({ id, at: new Date(iso), kind, title: id });

  it("fusionne, dédoublonne et trie du plus récent au plus ancien", () => {
    const merged = mergeTimeline([[e("a", "2026-10-02T10:00:00Z"), e("b", "2026-10-05T10:00:00Z")], [e("b", "2026-10-05T10:00:00Z"), e("c", "2026-10-03T10:00:00Z", "email")]]);
    expect(merged.map((m) => m.id)).toEqual(["b", "c", "a"]);
    expect(filterTimeline(merged, ["email"]).map((m) => m.id)).toEqual(["c"]);
  });

  it("regroupe par jour, au fuseau de Paris", () => {
    const groups = groupTimelineByDay([e("late", "2026-10-02T22:30:00Z"), e("early", "2026-10-02T21:30:00Z")]);
    expect(groups.map((g) => g.day)).toEqual(["2026-10-03", "2026-10-02"]);
  });
});

describe("résiliations : passages permis", () => {
  it("on avance ou on annule ; une demande terminée ou annulée ne rouvre jamais", () => {
    expect(canMoveCancellation("RECEIVED", "IN_PROGRESS")).toBe(true);
    expect(canMoveCancellation("CONFIRMED", "COMPLETED")).toBe(true);
    expect(canMoveCancellation("COMPLETED", "RECEIVED")).toBe(false);
    expect(canMoveCancellation("CANCELED", "IN_PROGRESS")).toBe(false);
    for (const status of CANCELLATION_STATUSES) expect(CANCELLATION_TRANSITIONS[status]).not.toContain(status);
  });
});

describe("automatisations : parrainage et partenaires", () => {
  const filleul = (overrides: Partial<FilleulCandidate> = {}): FilleulCandidate => ({ id: "ph_filleul", referrerId: "ph_parrain", isDemo: false, createdAt: daysAgo(1), ...overrides });
  const partner = (overrides: Partial<PartnerCandidate> = {}): PartnerCandidate => ({ id: "pa_1", status: "ACTIVE", brandCount: 0, createdAt: daysAgo(5), ...overrides });
  const plan = (keys: string[], input: { filleuls?: FilleulCandidate[]; partners?: PartnerCandidate[]; alreadyDone?: Set<string> }, now: Date = NOW, offsets: Record<string, number> = {}) =>
    planAutomations({ rules: enabled(keys, offsets), subscriptions: [], cancellations: [], prospects: [], filleuls: input.filleuls, partners: input.partners, alreadyDone: input.alreadyDone ?? new Set(), now });

  it("les deux scénarios et leurs règles existent, désactivés par défaut, avec les bornes prévues", () => {
    expect(AUTOMATION_SCENARIOS.REFERRAL.label).toBe("Parrainage");
    expect(AUTOMATION_SCENARIOS.PARTNER.label).toBe("Partenaires");
    const resolved = resolveRules([]);
    const filleulRule = resolved.find((r) => r.key === "referral.filleul_joined")!;
    const partnerRule = resolved.find((r) => r.key === "partner.range_invitation")!;
    expect(filleulRule).toMatchObject({ scenario: "REFERRAL", channel: "EMAIL", templateKey: "referral.filleul_joined", enabled: false, offsetDays: 0, minOffsetDays: 0, maxOffsetDays: 3 });
    expect(partnerRule).toMatchObject({ scenario: "PARTNER", channel: "EMAIL", templateKey: "partner.range_invitation", enabled: false, offsetDays: 5, minOffsetDays: 1, maxOffsetDays: 30, audience: "Partenaire" });
  });

  it("chaque règle appartient à un scénario déclaré (l'écran des relances les itère)", () => {
    for (const rule of AUTOMATION_RULES) expect(Object.keys(AUTOMATION_SCENARIOS)).toContain(rule.scenario);
    for (const scenario of Object.keys(AUTOMATION_SCENARIOS)) expect(AUTOMATION_RULES.some((r) => r.scenario === scenario)).toBe(true);
  });

  it("désactivées, elles ne planifient rien, même avec des candidats dus", () => {
    const rules = resolveRules([]);
    expect(planAutomations({ rules, subscriptions: [], cancellations: [], prospects: [], filleuls: [filleul()], partners: [partner()], alreadyDone: new Set(), now: NOW })).toEqual([]);
  });

  it("sans candidats fournis (appels d'avant), elles ne planifient rien", () => {
    expect(plan(["referral.filleul_joined", "partner.range_invitation"], {})).toEqual([]);
  });

  it("filleul inscrit : le message va au PARRAIN, la cible est le filleul, une clé par filleul et par jour d'inscription", () => {
    const [planned] = plan(["referral.filleul_joined"], { filleuls: [filleul({ createdAt: new Date("2026-10-09T14:00:00Z") })] });
    expect(planned).toMatchObject({ ruleKey: "referral.filleul_joined", targetType: "Pharmacy", targetId: "ph_filleul", pharmacyId: "ph_parrain", channel: "EMAIL", templateKey: "referral.filleul_joined", dedupeKey: "referral.filleul_joined:ph_filleul:2026-10-09" });
  });

  it("filleul inscrit : ni officine de démonstration, ni officine sans parrain", () => {
    const planned = plan(["referral.filleul_joined"], { filleuls: [filleul({ id: "demo", isDemo: true }), filleul({ id: "sans_parrain", referrerId: null }), filleul({ id: "reel" })] });
    expect(planned.map((p) => p.targetId)).toEqual(["reel"]);
  });

  it(`filleul inscrit : rattrapage de ${CATCH_UP_DAYS} jours, pas au-delà ; le délai réglé décale l'envoi`, () => {
    // Inscrit le 10 à midi (Paris) ; délai 0 : dû le 10, rattrapé jusqu'au 12.
    const signedUp = filleul({ createdAt: new Date("2026-10-10T10:00:00Z") });
    expect(plan(["referral.filleul_joined"], { filleuls: [signedUp] }, new Date("2026-10-10T08:15:00Z"))).toHaveLength(1);
    expect(plan(["referral.filleul_joined"], { filleuls: [signedUp] }, new Date("2026-10-12T08:15:00Z"))).toHaveLength(1);
    expect(plan(["referral.filleul_joined"], { filleuls: [signedUp] }, new Date("2026-10-13T08:15:00Z"))).toEqual([]);
    // Délai de 3 jours : rien le 12, dû le 13.
    expect(plan(["referral.filleul_joined"], { filleuls: [signedUp] }, new Date("2026-10-12T08:15:00Z"), { "referral.filleul_joined": 3 })).toEqual([]);
    expect(plan(["referral.filleul_joined"], { filleuls: [signedUp] }, new Date("2026-10-13T08:15:00Z"), { "referral.filleul_joined": 3 })).toHaveLength(1);
  });

  it("activer la règle ne rattrape pas les filleuls des derniers mois", () => {
    const old = [filleul({ id: "f_30", createdAt: daysAgo(30) }), filleul({ id: "f_90", createdAt: daysAgo(90) }), filleul({ id: "f_recent", createdAt: daysAgo(1) })];
    expect(plan(["referral.filleul_joined"], { filleuls: old }).map((p) => p.targetId)).toEqual(["f_recent"]);
  });

  it("une clé déjà consommée n'est jamais reproposée", () => {
    const [first] = plan(["referral.filleul_joined"], { filleuls: [filleul()] });
    expect(plan(["referral.filleul_joined"], { filleuls: [filleul()], alreadyDone: new Set([first.dedupeKey]) })).toEqual([]);
  });

  it("deux filleuls du même parrain : deux déclenchements distincts", () => {
    const planned = plan(["referral.filleul_joined"], { filleuls: [filleul({ id: "f1" }), filleul({ id: "f2" })] });
    expect(new Set(planned.map((p) => p.dedupeKey)).size).toBe(2);
    expect(new Set(planned.map((p) => p.pharmacyId))).toEqual(new Set(["ph_parrain"]));
  });

  it("invitation partenaire : cible Partner, aucune officine destinataire, due après le délai (5 jours par défaut)", () => {
    const [planned] = plan(["partner.range_invitation"], { partners: [partner({ createdAt: new Date("2026-10-05T09:00:00Z") })] });
    expect(planned).toMatchObject({ ruleKey: "partner.range_invitation", targetType: "Partner", targetId: "pa_1", pharmacyId: null, channel: "EMAIL", templateKey: "partner.range_invitation", dedupeKey: "partner.range_invitation:pa_1:2026-10-05" });
    // Fiche créée le 8 : pas avant le 13.
    const recent = [partner({ createdAt: new Date("2026-10-08T09:00:00Z") })];
    expect(plan(["partner.range_invitation"], { partners: recent })).toEqual([]);
    expect(plan(["partner.range_invitation"], { partners: recent }, new Date("2026-10-13T08:15:00Z"))).toHaveLength(1);
  });

  it("invitation partenaire : seulement sans aucune marque, et ni suspendu ni archivé", () => {
    const planned = plan(["partner.range_invitation"], {
      partners: [
        partner({ id: "avec_marque", brandCount: 1 }),
        partner({ id: "suspendu", status: "SUSPENDED" }),
        partner({ id: "archive", status: "ARCHIVED" }),
        partner({ id: "brouillon", status: "DRAFT" }),
        partner({ id: "test", status: "TEST" }),
        partner({ id: "actif", status: "ACTIVE" }),
      ],
    });
    expect(planned.map((p) => p.targetId).sort()).toEqual(["actif", "brouillon", "test"]);
  });

  it(`invitation partenaire : rattrapage de ${CATCH_UP_DAYS} jours, pas au-delà ; même au délai maximal`, () => {
    const longest = AUTOMATION_RULES.find((r) => r.key === "partner.range_invitation")!.maxOffsetDays;
    expect(plan(["partner.range_invitation"], { partners: [partner({ createdAt: daysAgo(5 + CATCH_UP_DAYS) })] })).toHaveLength(1);
    expect(plan(["partner.range_invitation"], { partners: [partner({ createdAt: daysAgo(5 + CATCH_UP_DAYS + 1) })] })).toEqual([]);
    expect(plan(["partner.range_invitation"], { partners: [partner({ createdAt: daysAgo(longest + CATCH_UP_DAYS) })] }, NOW, { "partner.range_invitation": longest })).toHaveLength(1);
    expect(plan(["partner.range_invitation"], { partners: [partner({ createdAt: daysAgo(40) })] })).toEqual([]);
  });

  it("une fiche partenaire ne reçoit qu'une invitation, quelle que soit la suite", () => {
    const [first] = plan(["partner.range_invitation"], { partners: [partner()] });
    expect(plan(["partner.range_invitation"], { partners: [partner()], alreadyDone: new Set([first.dedupeKey]) })).toEqual([]);
  });
});

describe("modèles d'e-mails : parrainage et partenaires", () => {
  const referral = emailTemplate("referral.filleul_joined")!;
  const invitation = emailTemplate("partner.range_invitation")!;

  it("deux modèles de plus, dans leur catégorie et pour leur public", () => {
    expect(referral).toMatchObject({ category: "Parrainage", audience: "Titulaire" });
    expect(invitation).toMatchObject({ category: "Partenaire", audience: "Partenaire" });
    expect(new Set(EMAIL_TEMPLATES.map((t) => t.key)).size).toBe(EMAIL_TEMPLATES.length);
  });

  it("le message de parrainage ne cite que le nom de l'officine parrainée et la remise : « votre abonnement passe à 20 % de moins »", () => {
    expect(variablesIn(`${referral.defaults.subject}\n${referral.defaults.title}\n${referral.defaults.body}`).sort()).toEqual(["filleul", "montant_remise", "prenom"]);
    const rendered = renderTemplateEmail(DEFAULT_EMAIL_CONTEXT, referral, referral.defaults, { prenom: "Camille", filleul: "Pharmacie du Marché", montant_remise: "20 %", lien_espace: "https://pharmaboost.app/parametres?onglet=abonnement" });
    expect(rendered.subject).toBe("Pharmacie du Marché a rejoint PharmaBoost avec votre code de parrainage");
    expect(rendered.text).toContain("votre abonnement passe à 20 % de moins par mois");
    expect(rendered.text).toContain("appliquée à votre abonnement par l'équipe PharmaBoost");
    expect(rendered.text).toContain("elle ne se cumule pas");
    expect(rendered.text).toContain("Voir mon parrainage : https://pharmaboost.app/parametres?onglet=abonnement");
    expect(rendered.text).not.toContain("{{");
    // Plus aucun montant fixe par filleul.
    expect(rendered.text).not.toMatch(/10\s?€|réduit votre abonnement de/);
  });

  it("la variable de remise du parrainage s'exemplifie en pourcentage, jamais en euros", () => {
    const variable = referral.variables.find((v) => v.key === "montant_remise")!;
    expect(variable.sample).toBe("20 %");
    expect(variable.label).toContain("pourcentage");
  });

  it("l'invitation d'un partenaire n'a ni officine, ni abonnement, ni lien d'espace : seulement ce qui a un sens pour lui", () => {
    const keys = invitation.variables.map((v) => v.key);
    expect(keys).toEqual(expect.arrayContaining(["prenom", "nom_partenaire", "lien_candidature", "contact"]));
    for (const forbidden of ["officine", "prix", "offre", "lien_espace", "lien_contrat", "date_fin_essai"]) expect(keys).not.toContain(forbidden);
    expect(unknownVariables(invitation, { subject: "Bonjour {{officine}}", title: "Titre", body: "Texte {{prix}}" })).toEqual(["officine", "prix"]);
  });

  it("l'invitation renvoie au formulaire public, ne promet ni portail ni diffusion, et rappelle qu'on n'achète pas une recommandation", () => {
    const rendered = renderTemplateEmail(DEFAULT_EMAIL_CONTEXT, invitation, invitation.defaults, { prenom: "Claire", nom_partenaire: "Laboratoires Exemple", lien_candidature: "https://pharmaboost.app/decouvrir/partenaires", contact: "contact@pharmaboost.app" });
    expect(rendered.html).toContain("https://pharmaboost.app/decouvrir/partenaires");
    expect(rendered.text).toContain("Déposer ma gamme : https://pharmaboost.app/decouvrir/partenaires");
    expect(rendered.text).toContain("un partenaire n'achète jamais une recommandation");
    expect(rendered.text).toContain("Laboratoires Exemple");
    const lower = rendered.text.toLowerCase();
    for (const promise of ["portail", "espace partenaire", "garanti", "visibilité", "vendre plus", "augmenter vos ventes"]) expect(lower).not.toContain(promise);
    expect(rendered.text).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(rendered.text).not.toContain("{{");
  });

  it("un modèle de parrainage ou de partenaire ne se renseigne que par sa règle : il n'est pas un envoi manuel", () => {
    expect(isContextBoundTemplate("referral.filleul_joined")).toBe(true);
    expect(isContextBoundTemplate("partner.range_invitation")).toBe(true);
    expect(isContextBoundTemplate("trial.welcome")).toBe(false);
  });
});

describe("« Contacter » : les modèles de parrainage et de partenaire", () => {
  const keysOf = (list: { key: string }[]) => list.map((t) => t.key);

  it("un modèle « Partenaire » n'est jamais proposé à un titulaire ni à un prospect, avec ou sans public précisé", () => {
    expect(keysOf(contactTemplateChoices(EMAIL_TEMPLATES, { audience: "Titulaire" }))).not.toContain("partner.range_invitation");
    expect(keysOf(contactTemplateChoices(EMAIL_TEMPLATES, { audience: "Prospect" }))).not.toContain("partner.range_invitation");
    expect(keysOf(contactTemplateChoices(EMAIL_TEMPLATES, {}))).not.toContain("partner.range_invitation");
    // Même demandé comme modèle par défaut, il ne passe pas dans la liste d'un public qui n'est pas le sien.
    expect(keysOf(contactTemplateChoices(EMAIL_TEMPLATES, { audience: "Titulaire", defaultTemplateKey: "partner.range_invitation" }))).not.toContain("partner.range_invitation");
    expect(keysOf(contactTemplateChoices(EMAIL_TEMPLATES, { defaultTemplateKey: "partner.range_invitation" }))).not.toContain("partner.range_invitation");
  });

  it("la liste d'un partenaire ne contient que ses modèles (et le message libre), jamais ceux des officines", () => {
    const offered = keysOf(contactTemplateChoices(EMAIL_TEMPLATES, { audience: "Partenaire", defaultTemplateKey: "partner.range_invitation" }));
    expect(offered.sort()).toEqual(["generic.message", "partner.range_invitation"]);
  });

  it("le message de parrainage n'est pas proposé dans « Contacter » : il lui manque le filleul et son montant", () => {
    expect(keysOf(contactTemplateChoices(EMAIL_TEMPLATES, { audience: "Titulaire" }))).not.toContain("referral.filleul_joined");
    expect(keysOf(contactTemplateChoices(EMAIL_TEMPLATES, {}))).not.toContain("referral.filleul_joined");
  });

  it("rien ne change pour les officines et les prospects : mêmes modèles qu'avant", () => {
    expect(keysOf(contactTemplateChoices(EMAIL_TEMPLATES, { audience: "Titulaire" })).sort()).toEqual(["generic.message", "payment.failed_reminder", "payment.unpaid_final", "subscription.welcome", "trial.ending_soon", "trial.ended", "trial.onboarding", "trial.welcome"].sort());
    expect(keysOf(contactTemplateChoices(EMAIL_TEMPLATES, { audience: "Prospect" })).sort()).toEqual(["commercial.followup", "generic.message"]);
  });
});
