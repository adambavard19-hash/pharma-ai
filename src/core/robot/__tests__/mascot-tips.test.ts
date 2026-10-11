import { describe, expect, it } from "vitest";
import { bestMoment, closestChallenge, counterTips, mobileTip, recapIsDue, visibleTip, type CounterTipInput, type TipChallenge } from "../mascot-tips";

const challenge = (over: Partial<TipChallenge> = {}): TipChallenge => ({ id: "c1", title: "NATURÉO", teamUnits: 37, milestones: [{ units: 20, reached: true }, { units: 40, reached: false }], target: null, daysRemaining: 5, ...over });
const empty: CounterTipInput = { challenges: [], shortDates: [], stockAgeDays: 1, canUpdateStock: true, challengeHref: "/equipe" };
const fresh = () => false;
const stale = () => true;

describe("les phrases du comptoir", () => {
  it("ne dit rien quand il n'y a rien d'utile", () => {
    expect(counterTips(empty, fresh)).toEqual([]);
  });

  it("dit le challenge proche d'un palier, en unités, sans montant", () => {
    const [tip] = counterTips({ ...empty, challenges: [challenge()] }, fresh);
    expect(tip.text).toBe("Plus que 3 ventes « NATURÉO » pour le palier de 40.");
    expect(tip.text).not.toMatch(/€/);
    expect(tip.action?.href).toBe("/equipe");
  });

  it("sans accès à « Mon équipe », la phrase reste mais sans lien", () => {
    const [tip] = counterTips({ ...empty, challengeHref: null, challenges: [challenge()] }, fresh);
    expect(tip.action).toBeNull();
  });

  it("se tait sur un challenge loin du palier, terminé, ou déjà au bout", () => {
    expect(closestChallenge([challenge({ teamUnits: 10 })])).toBeNull();
    expect(closestChallenge([challenge({ daysRemaining: 0 })])).toBeNull();
    expect(closestChallenge([challenge({ teamUnits: 45, milestones: [{ units: 40, reached: true }] })])).toBeNull();
  });

  it("prend le plus proche, et l'objectif quand il n'y a pas de palier", () => {
    const near = closestChallenge([challenge({ id: "a", teamUnits: 35 }), challenge({ id: "b", title: "Solaire", milestones: [], target: 100, teamUnits: 99 })]);
    expect(near?.challenge.id).toBe("b");
    expect(near?.label).toBe("objectif");
    expect(near?.missing).toBe(1);
  });

  it("ordonne : challenge, dates courtes, stock", () => {
    const tips = counterTips(
      { ...empty, challenges: [challenge()], shortDates: [{ label: "Crème A", quantity: 1, daysLeft: 9 }, { label: "Sirop B", quantity: 1, daysLeft: 12 }], stockAgeDays: 5 },
      stale,
    );
    expect(tips.map((tip) => tip.kind)).toEqual(["challenge", "short-date", "stock"]);
    expect(tips[1].text).toBe("2 boîtes en date courte à proposer en premier : Crème A, Sirop B.");
    expect(tips[2].text).toBe("Votre stock n'a pas été mis à jour depuis 5 jours.");
    expect(tips[2].dismissible).toBe(false);
  });

  it("dit « lots » quand les quantités ne sont pas connues, et cite deux noms au plus", () => {
    const [tip] = counterTips({ ...empty, shortDates: [{ label: "A", quantity: null, daysLeft: 3 }, { label: "B", quantity: 2, daysLeft: 4 }, { label: "C", quantity: 1, daysLeft: 5 }] }, fresh);
    expect(tip.text).toBe("3 lots en date courte à proposer en premier : A, B….");
  });

  it("ne parle du stock qu'à qui peut l'envoyer", () => {
    expect(counterTips({ ...empty, canUpdateStock: false, stockAgeDays: 9 }, stale)).toEqual([]);
    expect(counterTips({ ...empty, stockAgeDays: null }, stale)[0].text).toMatch(/jamais été envoyé/);
  });

  it("montre la première phrase non écartée ; le stock ne s'écarte pas", () => {
    const tips = counterTips({ ...empty, challenges: [challenge()], stockAgeDays: 7 }, stale);
    expect(visibleTip(tips, new Set())?.kind).toBe("challenge");
    expect(visibleTip(tips, new Set([tips[0].key, tips[1].key]))?.kind).toBe("stock");
    expect(visibleTip([], new Set())).toBeNull();
  });
});

describe("la bulle de l'Accueil mobile", () => {
  const now = new Date("2026-10-11T10:00:00Z");
  const training = { title: "Le conseil solaire", href: "/m/formations/x", mode: "continue" as const, percent: 40 };

  it("une prime validée cette semaine passe d'abord", () => {
    const tip = mobileTip({ bonuses: [{ id: "b", label: "Challenge été", status: "VALIDATED", validatedAt: new Date("2026-10-09T10:00:00Z") }], challenges: [challenge()], training, now });
    expect(tip?.kind).toBe("bonus");
  });
  it("une prime ancienne ou déjà versée ne compte plus", () => {
    const tip = mobileTip({ bonuses: [{ id: "b", label: "x", status: "PAID", validatedAt: now }, { id: "c", label: "y", status: "VALIDATED", validatedAt: new Date("2026-09-01T00:00:00Z") }], challenges: [], training, now });
    expect(tip?.kind).toBe("training");
    expect(tip?.text).toBe("Vous en êtes à 40 % de « Le conseil solaire ». On reprend ?");
  });
  it("puis le challenge, puis la formation, sinon rien", () => {
    expect(mobileTip({ bonuses: [], challenges: [challenge()], training, now })?.action?.href).toBe("/m/challenges");
    expect(mobileTip({ bonuses: [], challenges: [], training: { ...training, mode: "start", percent: 0 }, now })?.text).toMatch(/vous attend/);
    expect(mobileTip({ bonuses: [], challenges: [], training: null, now })).toBeNull();
  });
});

describe("« Votre journée »", () => {
  it("trouve l'heure où l'équipe a le plus validé", () => {
    expect(bestMoment([{ hour: 9, validated: 2 }, { hour: 15, validated: 4 }, { hour: 11, validated: 4 }])).toEqual({ hour: 11, validated: 4, label: "entre 11 h et 12 h" });
    expect(bestMoment([{ hour: 9, validated: 0 }])).toBeNull();
    expect(bestMoment([])).toBeNull();
  });
  it("s'affiche d'elle-même à partir de 18 h", () => {
    expect(recapIsDue(17)).toBe(false);
    expect(recapIsDue(18)).toBe(true);
  });
});
