import { describe, expect, it } from "vitest";
import { classifyOutcome, decideCoach, MIN_OCCURRENCES, universeOfCategory, type CoachAdvice } from "../rules";
import { planClinicalFlags } from "../clinical";
import { narrate } from "../narrator";

const many = (count: number, advice: Partial<CoachAdvice>): CoachAdvice[] =>
  Array.from({ length: count }, () => ({ status: "DECLINED", reason: null, universe: "DERMOCOSMETIQUE", ruleKey: "rule-peau", ...advice }));
const candidate = { contentId: "c-derm", universe: "DERMOCOSMETIQUE", title: "Les bases de la dermocosmétique" };

describe("la table de classification : un refus n'est pas un manque de connaissance", () => {
  it.each([
    ["DECLINED", "PATIENT_REFUSED", "PATIENT_CHOICE"],
    ["DECLINED", "PRICE", "PATIENT_CHOICE"],
    ["DECLINED", "ALREADY_OWNED", "PATIENT_CHOICE"],
    ["DECLINED", "OUT_OF_STOCK", "STOCK_SIGNAL"],
    ["DECLINED", "CLINICALLY_INAPPROPRIATE", "CLINICAL_REVIEW"],
    ["DECLINED", "OTHER", "INCONCLUSIVE"],
    ["DECLINED", null, "INCONCLUSIVE"],
    ["IGNORED", null, "INCONCLUSIVE"],
    ["REMOVED", "CLINICALLY_INAPPROPRIATE", "CLINICAL_REVIEW"],
    ["PURCHASED", null, "VALIDATED"],
    ["ACCEPTED", "PRICE", "VALIDATED"],
    ["PROPOSED", null, "PENDING"],
  ])("%s + %s → %s", (status, reason, expected) => {
    expect(classifyOutcome(status, reason)).toBe(expected);
  });

  it("relie la catégorie du besoin à son univers", () => {
    expect(universeOfCategory("SOINS")).toBe("DERMOCOSMETIQUE");
    expect(universeOfCategory(null, "MAGNESIUM")).toBe("COMPLEMENTS_ALIMENTAIRES");
    expect(universeOfCategory("AUTRE")).toBeNull();
  });
});

describe("le coach décide", () => {
  it("des « Non vendu » sans motif, nombreux, sans formation suivie dans l'univers → une formation, preuve en agrégats seulement", () => {
    const outcome = decideCoach({ advice: [...many(6, {}), ...many(1, { status: "PURCHASED" })], trainings: [], quizzes: [], candidates: [candidate] });
    expect(outcome.suggestions).toHaveLength(1);
    const [suggestion] = outcome.suggestions;
    expect(suggestion.contentId).toBe("c-derm");
    expect(Object.keys(suggestion.evidence).sort()).toEqual(
      ["averageQuizScore", "clinicalReview", "inconclusive", "patientChoice", "proposed", "stockSignal", "trainingsCompleted", "universe", "validated", "windowDays"].sort(),
    );
    expect(suggestion.evidence).toMatchObject({ proposed: 7, validated: 1, inconclusive: 6, trainingsCompleted: 0 });
    expect(suggestion.explanation).toBe(
      "Vous avez peu suivi de formations sur la dermocosmétique ; 6 conseils de cet univers n'ont pas abouti ces 30 derniers jours, sans raison donnée par le patient. Une formation courte peut aider.",
    );
  });

  it("un « Non vendu » sans motif, seul, ne déclenche jamais rien", () => {
    expect(decideCoach({ advice: many(1, {}), trainings: [], quizzes: [], candidates: [candidate] }).suggestions).toEqual([]);
    expect(decideCoach({ advice: many(MIN_OCCURRENCES - 1, {}), trainings: [], quizzes: [], candidates: [candidate] }).suggestions).toEqual([]);
  });

  it("des « Non vendu » nombreux mais une formation suivie et de bons quiz : non concluant, rien", () => {
    const outcome = decideCoach({ advice: many(10, {}), trainings: [{ universe: "DERMOCOSMETIQUE", completed: true }], quizzes: [{ universe: "DERMOCOSMETIQUE", score: 85 }], candidates: [candidate] });
    expect(outcome.suggestions).toEqual([]);
  });

  it("une formation suivie mais des quiz faibles → la formation est suggérée, la phrase cite les quiz", () => {
    const outcome = decideCoach({ advice: many(6, {}), trainings: [{ universe: "DERMOCOSMETIQUE", completed: true }], quizzes: [{ universe: "DERMOCOSMETIQUE", score: 40 }], candidates: [candidate] });
    expect(outcome.suggestions[0].explanation).toMatch(/^Vos quiz sur la dermocosmétique sont à 40 % de moyenne/);
  });

  it.each(["PATIENT_REFUSED", "PRICE", "ALREADY_OWNED", "OUT_OF_STOCK"])("refus « %s » répétés → aucune formation", (reason) => {
    expect(decideCoach({ advice: many(20, { reason }), trainings: [], quizzes: [], candidates: [candidate] }).suggestions).toEqual([]);
  });

  it("« pas adapté à ce patient » → un signalement de la RÈGLE, jamais une formation", () => {
    const outcome = decideCoach({ advice: many(12, { reason: "CLINICALLY_INAPPROPRIATE" }), trainings: [], quizzes: [], candidates: [candidate] });
    expect(outcome.suggestions).toEqual([]);
    expect(outcome.clinicalSignals).toEqual([{ ruleKey: "rule-peau", count: 12 }]);
  });

  it("les conseils aboutissent la plupart du temps : rien, même avec des non concluants", () => {
    const outcome = decideCoach({ advice: [...many(5, {}), ...many(10, { status: "PURCHASED" })], trainings: [], quizzes: [], candidates: [candidate] });
    expect(outcome.suggestions).toEqual([]);
  });

  it("aucune formation relue dans l'univers : rien (on n'invente pas de contenu)", () => {
    expect(decideCoach({ advice: many(8, {}), trainings: [], quizzes: [], candidates: [] }).suggestions).toEqual([]);
  });

  it("un narrateur qui échoue ou divague laisse la phrase des règles", async () => {
    const [suggestion] = decideCoach({ advice: many(6, {}), trainings: [], quizzes: [], candidates: [candidate] }).suggestions;
    expect(await narrate(suggestion, { name: "panne", explain: async () => Promise.reject(new Error("réseau")) })).toBe(suggestion.explanation);
    expect(await narrate(suggestion, { name: "vide", explain: async () => "  " })).toBe(suggestion.explanation);
    expect(await narrate(suggestion, { name: "llm", explain: async () => "Une phrase reformulée." })).toBe("Une phrase reformulée.");
  });
});

describe("la remontée clinique", () => {
  const day = (d: number) => new Date(Date.UTC(2026, 9, d));
  const refusals = [day(2), day(5), day(9)].map((at) => ({ ruleKey: "rule-peau", at }));

  it("crée un signalement ouvert avec le compte et la période", () => {
    expect(planClinicalFlags(refusals, [])).toEqual([{ kind: "create", ruleKey: "rule-peau", count: 3, periodStart: day(2), periodEnd: day(9) }]);
  });

  it("idempotent : relancé sur les mêmes refus, rien ne change", () => {
    const flag = { id: "f1", ruleKey: "rule-peau", status: "OPEN", count: 3, periodStart: day(2), reviewedAt: null, createdAt: day(2) };
    expect(planClinicalFlags(refusals, [flag])).toEqual([]);
    expect(planClinicalFlags([...refusals, { ruleKey: "rule-peau", at: day(10) }], [flag])).toEqual([{ kind: "update", id: "f1", ruleKey: "rule-peau", count: 4, periodEnd: day(10) }]);
  });

  it("après décision, seuls les refus postérieurs rouvrent un signalement", () => {
    const closed = { id: "f1", ruleKey: "rule-peau", status: "CONFIRMED_OK", count: 3, periodStart: day(2), reviewedAt: day(6), createdAt: day(2) };
    expect(planClinicalFlags(refusals, [closed])).toEqual([{ kind: "create", ruleKey: "rule-peau", count: 1, periodStart: day(9), periodEnd: day(9) }]);
  });
});
