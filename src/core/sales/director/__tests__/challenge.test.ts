import { describe, expect, it } from "vitest";
import {
  buildChallengeProgress,
  challengeLastDay,
  challengePeriodLabel,
  challengeTimingLabel,
  challengeState,
  challengeToForm,
  defaultChallengeForm,
  describeChallengeGoal,
  describeReached,
  describeReward,
  frenchDayLabel,
  groupChallengesByState,
  isInChallengeWindow,
  lockedFieldViolations,
  lockedFieldsFor,
  ordinalFr,
  progressPercent,
  shortRepName,
  validateChallengeForm,
  type ChallengeMetric,
  type ChallengeValues,
} from "../challenge";

/**
 * Les règles des challenges : l'état d'une période [début, fin[, l'avancement
 * chiffré, le classement, la saisie. Les jours sont des jours de Paris : le
 * 1er octobre 2026 à minuit y est 22 h UTC la veille (heure d'été), le 1er
 * novembre à minuit 23 h UTC la veille (heure d'hiver).
 */

const OCT_START = new Date("2026-09-30T22:00:00.000Z"); // 1er octobre 2026, 0 h à Paris
const OCT_END = new Date("2026-10-31T23:00:00.000Z"); // 1er novembre 2026, 0 h à Paris (exclu)
const challenge = { id: "ch_1", metric: "DEMOS_DONE" as ChallengeMetric, target: 5, isActive: true, startsAt: OCT_START, endsAt: OCT_END };

describe("l'état d'un challenge", () => {
  it("est à venir avant le début, en cours dans la période, terminé à la fin exacte", () => {
    expect(challengeState(challenge, new Date("2026-09-30T21:59:59.999Z"))).toBe("UPCOMING");
    expect(challengeState(challenge, new Date("2026-09-30T22:00:00.000Z"))).toBe("RUNNING");
    expect(challengeState(challenge, new Date("2026-10-31T22:59:59.999Z"))).toBe("RUNNING");
    expect(challengeState(challenge, new Date("2026-10-31T23:00:00.000Z"))).toBe("ENDED");
  });

  it("un challenge arrêté à la main est terminé, quelles que soient ses dates", () => {
    expect(challengeState({ ...challenge, isActive: false }, new Date("2026-10-10T10:00:00Z"))).toBe("ENDED");
    expect(challengeState({ ...challenge, isActive: false }, new Date("2026-08-10T10:00:00Z"))).toBe("ENDED");
  });

  it("la période est un intervalle [début, fin[", () => {
    expect(isInChallengeWindow(new Date("2026-09-30T21:59:59.999Z"), challenge)).toBe(false);
    expect(isInChallengeWindow(OCT_START, challenge)).toBe(true);
    expect(isInChallengeWindow(new Date("2026-10-31T22:59:59.999Z"), challenge)).toBe(true);
    expect(isInChallengeWindow(OCT_END, challenge)).toBe(false);
  });

  it("le dernier jour compté est la veille de la fin exclue", () => {
    expect(challengeLastDay(OCT_END)).toBe("2026-10-31");
  });
});

describe("la période, dite comme on la dit", () => {
  it("un mois entier, le 1er en toutes lettres", () => {
    expect(challengePeriodLabel(OCT_START, OCT_END)).toBe("du 1er au 31 octobre 2026");
  });
  it("d'un mois à l'autre, d'une année à l'autre, un seul jour", () => {
    expect(challengePeriodLabel(new Date("2026-10-19T22:00:00Z"), new Date("2026-11-30T23:00:00Z"))).toBe("du 20 octobre au 30 novembre 2026");
    expect(challengePeriodLabel(new Date("2026-12-14T23:00:00Z"), new Date("2027-01-15T23:00:00Z"))).toBe("du 15 décembre 2026 au 15 janvier 2027");
    expect(challengePeriodLabel(new Date("2026-10-04T22:00:00Z"), new Date("2026-10-05T22:00:00Z"))).toBe("le 5 octobre 2026");
  });
  it("l'objectif et la récompense en une ligne", () => {
    expect(describeChallengeGoal("DEMOS_DONE", 5)).toBe("5 démonstrations réalisées");
    expect(describeChallengeGoal("CONTRACTS_SIGNED", 1)).toBe("1 contrat signé");
    expect(describeChallengeGoal("ACTIVATIONS", 1200)).toMatch(/^1\s200 officines activées$/);
    expect(describeReward({ rewardLabel: "Prime de 200 €", rewardCents: 20000 })).toBe("Prime de 200 €");
    expect(describeReward({ rewardLabel: null, rewardCents: 15000 })).toMatch(/^150 €$/);
    expect(describeReward({ rewardLabel: null, rewardCents: null })).toBeNull();
  });
});

describe("le pourcentage de l'objectif", () => {
  it("est arrondi à l'entier inférieur : 100 seulement si l'objectif est atteint", () => {
    expect(progressPercent(199, 200)).toBe(99);
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(2, 3)).toBe(66);
    expect(progressPercent(5, 5)).toBe(100);
    expect(progressPercent(7, 5)).toBe(140);
    expect(progressPercent(0, 5)).toBe(0);
    expect(progressPercent(3, 0)).toBe(0);
  });
  it("le nom court : prénom et initiale du nom", () => {
    expect(shortRepName("Marie", "Dupont")).toBe("Marie D.");
    expect(shortRepName("Marie", "  dupont ")).toBe("Marie D.");
    expect(shortRepName("Marie", "")).toBe("Marie");
  });
});

describe("l'avancement par commercial", () => {
  const reps = [
    { id: "r_chloe", firstName: "Chloé", lastName: "Petit" },
    { id: "r_alice", firstName: "Alice", lastName: "Martin" },
    { id: "r_bob", firstName: "Bob", lastName: "Durand" },
    { id: "r_dan", firstName: "Dan", lastName: "Roux" },
  ];
  const now = new Date("2026-10-15T10:00:00Z");

  it("compte, classe, et calcule les totaux : 5, 3, 3 et 0 sur un objectif de 5", () => {
    const result = buildChallengeProgress({ challenge, reps, values: new Map([["r_alice", 5], ["r_bob", 3], ["r_chloe", 3]]), now });
    expect(result.state).toBe("RUNNING");
    expect(result.reps.map((r) => [r.name, r.value, r.percent, r.reached, r.rank])).toEqual([
      ["Alice Martin", 5, 100, true, 1],
      ["Bob Durand", 3, 60, false, 2],
      ["Chloé Petit", 3, 60, false, 2],
      ["Dan Roux", 0, 0, false, null],
    ]);
    expect(result.reps.every((r) => r.target === 5)).toBe(true);
    expect(result.totals).toEqual({ participants: 4, reached: 1, reachedShare: 0.25, totalValue: 11, totalTarget: 20 });
    // Le classement ne contient pas celui qui n'a rien réalisé.
    expect(result.ranking.map((r) => r.salesRepId)).toEqual(["r_alice", "r_bob", "r_chloe"]);
  });

  it("le rang saute après des ex æquo : 1, 1, 3", () => {
    const result = buildChallengeProgress({ challenge, reps: reps.slice(0, 3), values: { r_alice: 4, r_bob: 4, r_chloe: 2 }, now });
    expect(result.reps.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it("dépasser l'objectif compte : 7 sur 5 vaut 140 %", () => {
    const result = buildChallengeProgress({ challenge, reps: reps.slice(0, 1), values: { r_chloe: 7 }, now });
    expect(result.reps[0]).toMatchObject({ value: 7, percent: 140, reached: true });
    expect(result.totals.reachedShare).toBe(1);
  });

  it("une valeur absente, négative ou illisible vaut zéro ; un nombre décimal est tronqué", () => {
    const result = buildChallengeProgress({ challenge, reps: reps.slice(0, 3), values: { r_alice: -2, r_bob: Number.NaN, r_chloe: 2.9 }, now });
    expect(result.reps.map((r) => [r.salesRepId, r.value])).toEqual([["r_chloe", 2], ["r_alice", 0], ["r_bob", 0]]);
  });

  it("sans commercial, les totaux sont à zéro (jamais une division par zéro)", () => {
    const result = buildChallengeProgress({ challenge, reps: [], values: {}, now });
    expect(result.totals).toEqual({ participants: 0, reached: 0, reachedShare: 0, totalValue: 0, totalTarget: 0 });
    expect(result.reps).toEqual([]);
  });

  it("garde le nom court pour les autres commerciaux et l'état du challenge", () => {
    const ended = buildChallengeProgress({ challenge, reps: reps.slice(1, 2), values: { r_alice: 1 }, now: new Date("2026-11-02T10:00:00Z") });
    expect(ended.state).toBe("ENDED");
    expect(ended.reps[0].shortName).toBe("Alice M.");
  });
});

describe("le tri des listes", () => {
  const make = (id: string, startsAt: string, endsAt: string, isActive = true) => ({ id, isActive, startsAt: new Date(startsAt), endsAt: new Date(endsAt) });
  it("en cours (fin la plus proche d'abord), à venir (début le plus proche), terminés (le plus récent)", () => {
    const now = new Date("2026-10-15T10:00:00Z");
    const list = [
      make("fini_ancien", "2026-07-31T22:00:00Z", "2026-08-31T22:00:00Z"),
      make("courant_long", "2026-09-30T22:00:00Z", "2026-11-30T23:00:00Z"),
      make("futur_loin", "2026-12-31T23:00:00Z", "2027-01-31T23:00:00Z"),
      make("fini_recent", "2026-08-31T22:00:00Z", "2026-09-30T22:00:00Z"),
      make("courant_court", "2026-10-09T22:00:00Z", "2026-10-31T23:00:00Z"),
      make("futur_proche", "2026-10-31T23:00:00Z", "2026-11-30T23:00:00Z"),
      make("arrete", "2026-10-01T00:00:00Z", "2026-10-31T23:00:00Z", false),
    ];
    const groups = groupChallengesByState(list, now);
    expect(groups.running.map((c) => c.id)).toEqual(["courant_court", "courant_long"]);
    expect(groups.upcoming.map((c) => c.id)).toEqual(["futur_proche", "futur_loin"]);
    expect(groups.ended.map((c) => c.id)).toEqual(["arrete", "fini_recent", "fini_ancien"]);
  });
});

describe("la saisie d'un challenge", () => {
  const valid = { title: "  Le mois des démos ", description: "", metric: "DEMOS_DONE", target: "5", startsDay: "2026-10-01", endsDay: "2026-10-31", rewardLabel: "Prime de 200 €", rewardEuros: "200" };
  const fields = (input: Record<string, unknown>) => {
    const result = validateChallengeForm({ ...valid, ...input });
    return result.ok ? null : result.fieldErrors;
  };

  it("accepte une saisie complète et la convertit : jours de Paris, fin exclue, centimes", () => {
    const result = validateChallengeForm(valid);
    expect(result).toEqual({
      ok: true,
      value: { title: "Le mois des démos", description: null, metric: "DEMOS_DONE", target: 5, startsAt: OCT_START, endsAt: OCT_END, rewardLabel: "Prime de 200 €", rewardCents: 20000 },
    });
  });

  it("la récompense et la description sont facultatives ; l'objectif peut être un nombre", () => {
    const result = validateChallengeForm({ ...valid, target: 12, rewardLabel: "", rewardEuros: "", description: " Un défi " });
    expect(result.ok && result.value).toMatchObject({ target: 12, rewardLabel: null, rewardCents: null, description: "Un défi" });
  });

  it("lit un montant avec virgule : 200,50 € = 20 050 centimes", () => {
    const result = validateChallengeForm({ ...valid, rewardEuros: "200,50" });
    expect(result.ok && result.value.rewardCents).toBe(20050);
  });

  it("refuse chaque champ fautif, en français, sur le bon champ", () => {
    expect(fields({ title: "ab" })).toEqual({ title: "Donnez un titre au challenge (3 caractères au moins)." });
    expect(fields({ title: "x".repeat(81) })).toEqual({ title: "80 caractères au plus." });
    expect(fields({ description: "x".repeat(501) })).toEqual({ description: "500 caractères au plus." });
    expect(fields({ metric: "NOTES" })).toEqual({ metric: "Choisissez ce que le challenge compte." });
    expect(fields({ target: "0" })).toEqual({ target: "L'objectif est un nombre entier, d'au moins 1." });
    expect(fields({ target: "5,5" })).toEqual({ target: "L'objectif est un nombre entier, d'au moins 1." });
    expect(fields({ target: "cinq" })).toEqual({ target: "L'objectif est un nombre entier, d'au moins 1." });
    expect(fields({ target: "1001" })?.target).toMatch(/ne peut pas dépasser 1\s000/);
    expect(fields({ rewardEuros: "beaucoup" })).toEqual({ rewardEuros: "Saisissez un montant en euros (exemple : 200)." });
    expect(fields({ rewardEuros: "100001" })?.rewardEuros).toMatch(/ne peut pas dépasser 100\s000 €/);
    expect(fields({ rewardLabel: "x".repeat(121) })).toEqual({ rewardLabel: "120 caractères au plus." });
  });

  it("un montant de prime sans texte est refusé : la récompense se dit en clair", () => {
    expect(fields({ rewardLabel: "", rewardEuros: "200" })).toEqual({ rewardLabel: "Décrivez la récompense (« prime de 200 € ») ou retirez le montant." });
    expect(fields({ rewardLabel: "", rewardEuros: "0" })).toBeNull();
  });

  it("refuse des jours absents, inexistants, inversés ou trop éloignés", () => {
    expect(fields({ startsDay: "" })).toEqual({ startsDay: "Choisissez le premier jour du challenge." });
    expect(fields({ startsDay: "2026-02-31" })).toEqual({ startsDay: "Choisissez le premier jour du challenge." });
    expect(fields({ endsDay: "01/11/2026" })).toEqual({ endsDay: "Choisissez le dernier jour du challenge." });
    expect(fields({ startsDay: "2026-10-31", endsDay: "2026-10-01" })).toEqual({ endsDay: "Le dernier jour ne peut pas précéder le premier." });
    expect(fields({ startsDay: "2026-01-01", endsDay: "2027-01-02" })).toEqual({ endsDay: "Un challenge dure un an au plus." });
    // 366 jours en tout, premier et dernier jour compris : permis.
    expect(fields({ startsDay: "2026-01-01", endsDay: "2027-01-01" })).toBeNull();
    expect(fields({ startsDay: "2028-01-01", endsDay: "2028-12-31" })).toBeNull();
  });

  it("un seul jour est un challenge valide, dont la fin tombe au lendemain 0 h", () => {
    const result = validateChallengeForm({ ...valid, startsDay: "2026-10-05", endsDay: "2026-10-05" });
    expect(result.ok && [result.value.startsAt.toISOString(), result.value.endsAt.toISOString()]).toEqual(["2026-10-04T22:00:00.000Z", "2026-10-05T22:00:00.000Z"]);
  });

  it("la fin passée est refusée à la création, pas un début passé", () => {
    const now = new Date("2026-10-15T10:00:00Z");
    expect(validateChallengeForm({ ...valid, startsDay: "2026-09-01", endsDay: "2026-09-30" }, { now, requireFutureEnd: true })).toMatchObject({ ok: false, fieldErrors: { endsDay: expect.stringContaining("déjà passé") } });
    expect(validateChallengeForm({ ...valid, startsDay: "2026-10-01", endsDay: "2026-10-15" }, { now, requireFutureEnd: true }).ok).toBe(true);
    expect(validateChallengeForm({ ...valid, startsDay: "2026-10-01", endsDay: "2026-10-14" }, { now, requireFutureEnd: true }).ok).toBe(false);
  });

  it("le message général est celui du premier champ fautif", () => {
    const result = validateChallengeForm({ ...valid, title: "", target: "0" });
    expect(result).toMatchObject({ ok: false, error: "Donnez un titre au challenge (3 caractères au moins)." });
  });

  it("les valeurs d'un challenge existant reviennent telles quelles dans le formulaire", () => {
    const form = challengeToForm({ title: "Mois des démos", description: null, metric: "DEMOS_DONE", target: 5, startsAt: OCT_START, endsAt: OCT_END, rewardLabel: "Prime", rewardCents: 20050 });
    expect(form).toEqual({ title: "Mois des démos", description: "", metric: "DEMOS_DONE", target: "5", startsDay: "2026-10-01", endsDay: "2026-10-31", rewardLabel: "Prime", rewardEuros: "200,50" });
    const again = validateChallengeForm(form);
    expect(again.ok && [again.value.startsAt, again.value.endsAt, again.value.rewardCents]).toEqual([OCT_START, OCT_END, 20050]);
  });

  it("un nouveau challenge commence aujourd'hui (jour de Paris) et finit avec le mois", () => {
    expect(defaultChallengeForm(new Date("2026-10-06T10:00:00Z"))).toMatchObject({ startsDay: "2026-10-06", endsDay: "2026-10-31", metric: "DEMOS_DONE", target: "5" });
    expect(defaultChallengeForm(new Date("2028-02-10T10:00:00Z")).endsDay).toBe("2028-02-29");
    // 0 h 30 à Paris le 1er novembre : c'est déjà novembre.
    expect(defaultChallengeForm(new Date("2026-10-31T23:30:00Z"))).toMatchObject({ startsDay: "2026-11-01", endsDay: "2026-11-30" });
  });
});

describe("ce qui ne se modifie plus", () => {
  const current = { metric: "DEMOS_DONE" as ChallengeMetric, target: 5, startsAt: OCT_START, endsAt: OCT_END };
  const next = (patch: Partial<ChallengeValues>): ChallengeValues => ({ title: "T", description: null, rewardLabel: null, rewardCents: null, ...current, ...patch });

  it("à venir : tout se modifie ; en cours : ni la métrique ni le premier jour ; terminé : que les textes", () => {
    expect(lockedFieldsFor("UPCOMING")).toEqual({ metric: false, target: false, startsDay: false, endsDay: false });
    expect(lockedFieldsFor("RUNNING")).toEqual({ metric: true, target: false, startsDay: true, endsDay: false });
    expect(lockedFieldsFor("ENDED")).toEqual({ metric: true, target: true, startsDay: true, endsDay: true });
  });

  it("repère les champs verrouillés qu'on voudrait changer", () => {
    const other = { metric: "ACTIVATIONS" as ChallengeMetric, target: 9, startsAt: new Date("2026-10-02T22:00:00Z"), endsAt: new Date("2026-11-30T23:00:00Z") };
    expect(lockedFieldViolations(current, next(other), "UPCOMING")).toEqual([]);
    expect(lockedFieldViolations(current, next(other), "RUNNING")).toEqual(["metric", "startsDay"]);
    expect(lockedFieldViolations(current, next(other), "ENDED")).toEqual(["metric", "target", "startsDay", "endsDay"]);
    expect(lockedFieldViolations(current, next({}), "ENDED")).toEqual([]);
  });
});

describe("le calendrier d'un challenge, en une phrase", () => {
  const at = (iso: string) => new Date(iso);
  it("en cours : le nombre de jours restants, le dernier jour compris", () => {
    expect(challengeTimingLabel(challenge, at("2026-10-15T10:00:00Z"))).toBe("Plus que 16 jours");
    expect(challengeTimingLabel(challenge, at("2026-10-30T10:00:00Z"))).toBe("Dernier jour demain");
    expect(challengeTimingLabel(challenge, at("2026-10-31T10:00:00Z"))).toBe("Dernier jour aujourd'hui");
    // 0 h 30 à Paris le 1er novembre : le challenge est déjà terminé.
    expect(challengeTimingLabel(challenge, at("2026-10-31T23:30:00Z"))).toBe("Terminé le 31 octobre 2026");
  });
  it("à venir : le nombre de jours avant le début", () => {
    expect(challengeTimingLabel(challenge, at("2026-09-28T10:00:00Z"))).toBe("Commence dans 3 jours");
    expect(challengeTimingLabel(challenge, at("2026-09-30T10:00:00Z"))).toBe("Commence demain");
    // 23 h à Paris la veille : c'est encore « demain ».
    expect(challengeTimingLabel(challenge, at("2026-09-30T21:00:00Z"))).toBe("Commence demain");
    // Un début en milieu de journée (rare) : le jour même.
    expect(challengeTimingLabel({ ...challenge, startsAt: at("2026-10-01T12:00:00Z") }, at("2026-10-01T09:00:00Z"))).toBe("Commence aujourd'hui");
  });
  it("terminé ou arrêté à la main : la date, en toutes lettres", () => {
    expect(challengeTimingLabel(challenge, at("2026-12-01T10:00:00Z"))).toBe("Terminé le 31 octobre 2026");
    expect(challengeTimingLabel({ ...challenge, isActive: false, endsAt: at("2026-10-12T13:00:00Z") }, at("2026-12-01T10:00:00Z"))).toBe("Arrêté le 12 octobre 2026");
  });
  it("les jours et les rangs s'écrivent comme on les dit", () => {
    expect(frenchDayLabel("2026-11-01")).toBe("1er novembre 2026");
    expect(frenchDayLabel("2026-10-31")).toBe("31 octobre 2026");
    expect([1, 2, 3, 11].map(ordinalFr)).toEqual(["1er", "2e", "3e", "11e"]);
  });
});

describe("la phrase qui résume un challenge", () => {
  it("dit combien de commerciaux ont atteint l'objectif, au singulier comme au pluriel", () => {
    expect(describeReached({ participants: 6, reached: 3 })).toBe("3 commerciaux sur 6 ont atteint l'objectif.");
    expect(describeReached({ participants: 6, reached: 1 })).toBe("1 commercial sur 6 a atteint l'objectif.");
    expect(describeReached({ participants: 6, reached: 0 })).toBe("Aucun des 6 commerciaux n'a encore atteint l'objectif.");
    expect(describeReached({ participants: 1, reached: 1 })).toBe("Le commercial a atteint l'objectif.");
    expect(describeReached({ participants: 1, reached: 0 })).toBe("Le commercial n'a pas encore atteint l'objectif.");
    expect(describeReached({ participants: 0, reached: 0 })).toBe("Aucun commercial actif ne participe pour l'instant.");
  });
});
