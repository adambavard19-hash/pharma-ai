import { describe, expect, it } from "vitest";
import {
  AUTOMATION_RULES,
  CATCH_UP_DAYS,
  calendarDaysUntil,
  clampOffset,
  contactTemplateChoices,
  describeOffset,
  dueDay,
  hasUnpaidFailure,
  isDueNow,
  paymentSequenceError,
  planAutomations,
  resolveRules,
  unpaidSeriesStart,
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
    for (const existing of ["/admin", "/admin/pharmacies", "/admin/abonnements", "/admin/abonnements/offres", "/admin/pipeline", "/admin/notifications", "/admin/formations", "/admin/challenges", "/admin/partenaires", "/admin/commerciaux", "/admin/equipe", "/admin/societe"]) {
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
