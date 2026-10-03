import { describe, expect, it } from "vitest";
import { AUTOMATION_RULES, CATCH_UP_DAYS, clampOffset, describeOffset, hasUnpaidFailure, planAutomations, resolveRules, type SubscriptionCandidate } from "../automations";
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

  it("paiement : relance tant que l'échec reste impayé, et une nouvelle occurrence repart de zéro", () => {
    const failed = sub({ status: "PAST_DUE", lastPaymentFailedAt: daysAgo(2), lastPaymentAt: daysAgo(40) });
    const paidSince = sub({ id: "paid", status: "ACTIVE", lastPaymentFailedAt: daysAgo(2), lastPaymentAt: daysAgo(1) });
    expect(hasUnpaidFailure(failed)).toBe(true);
    expect(hasUnpaidFailure(paidSince)).toBe(false);
    const first = planAutomations({ rules: enabled(["payment.reminder_1"]), subscriptions: [failed, paidSince], cancellations: [], prospects: [], alreadyDone: new Set(), now: NOW });
    expect(first.map((p) => p.targetId)).toEqual(["sub_1"]);
    const later = sub({ status: "PAST_DUE", lastPaymentFailedAt: daysAgo(2), lastPaymentAt: daysAgo(40) });
    // Même échec : clé déjà consommée. Un nouvel échec (autre date) : nouvelle clé.
    expect(planAutomations({ rules: enabled(["payment.reminder_1"]), subscriptions: [later], cancellations: [], prospects: [], alreadyDone: new Set(first.map((p) => p.dedupeKey)), now: NOW })).toEqual([]);
    const newFailure = sub({ status: "PAST_DUE", lastPaymentFailedAt: new Date(NOW.getTime() + 20 * DAY), lastPaymentAt: daysAgo(40) });
    const inTwentyTwoDays = new Date(NOW.getTime() + 22 * DAY);
    expect(planAutomations({ rules: enabled(["payment.reminder_1"]), subscriptions: [newFailure], cancellations: [], prospects: [], alreadyDone: new Set(first.map((p) => p.dedupeKey)), now: inTwentyTwoDays })).toHaveLength(1);
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
