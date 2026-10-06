import { describe, expect, it } from "vitest";
import { classifyPortfolio, HEALTH_LABELS, HEALTH_TONES } from "../portfolio";
import type { PortfolioHealth, PortfolioInput, SubscriptionReturn } from "../types";

const NOW = new Date("2026-10-15T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY);
}

function shown(ratio: number): SubscriptionReturn {
  return {
    status: "shown",
    monthLabel: "octobre 2026",
    monthlyPriceHtCents: 12_600,
    trialing: false,
    confirmedTtcCents: 0,
    confirmedHtCents: 0,
    confirmedLines: 10,
    pricedShare: 1,
    ratio,
    // Comme roi.ts : sous 1, jamais d'arrondi à « 1,0 fois ».
    ratioLabel: `${(ratio < 1 ? Math.min(0.9, Math.round(ratio * 10) / 10) : Math.round(ratio * 10) / 10).toFixed(1).replace(".", ",")} fois`,
    sentence: "",
  };
}

const HIDDEN: SubscriptionReturn = { status: "hidden", reason: "not_enough_sales", detail: "Pas assez de ventes." };

/** Une officine saine, ancienne, active, sans alerte ni forte valeur : « dans la bonne voie ». */
function pharmacy(overrides: Partial<PortfolioInput> = {}): PortfolioInput {
  return {
    pharmacyId: "ph-1",
    name: "Pharmacie du Centre",
    city: "Lyon",
    createdAt: daysAgo(120),
    subscription: { status: "ACTIVE", monthlyPriceHtCents: 12_600 },
    proposed: 60,
    accepted: 30,
    decided: 56,
    purchased: 12,
    confirmedTtcCents: 20_000,
    previousConfirmedTtcCents: 16_000,
    unpricedConfirmedLines: 0,
    recentAnalyses: 25,
    lastProposalAt: daysAgo(1),
    lastSaleAt: daysAgo(2),
    roi: shown(1.6),
    ...overrides,
  };
}

function one(overrides: Partial<PortfolioInput> = {}, now: Date = NOW) {
  const [row] = classifyPortfolio([pharmacy(overrides)], now);
  return row!;
}

describe("libellés et tons de santé", () => {
  it("les 5 libellés du cahier des charges", () => {
    expect(HEALTH_LABELS).toEqual({
      high_value: "Forte valeur",
      on_track: "Dans la bonne voie",
      needs_support: "À accompagner",
      getting_started: "Démarrage",
      no_data: "Pas encore démarré",
    });
  });

  it("chaque classe a un ton de pastille connu, et l'accompagnement est orange", () => {
    const tones = ["neutral", "brand", "accent", "success", "warning", "danger", "info"];
    for (const health of Object.keys(HEALTH_LABELS) as PortfolioHealth[]) {
      expect(tones).toContain(HEALTH_TONES[health]);
    }
    expect(HEALTH_TONES.high_value).toBe("success");
    expect(HEALTH_TONES.needs_support).toBe("warning");
  });
});

describe("règle 1 : démarrage (officine créée il y a moins de 14 jours)", () => {
  it("13 jours 23 h : démarrage, avec sa raison", () => {
    const row = one({ createdAt: new Date(NOW.getTime() - 14 * DAY + HOUR) });
    expect(row.health).toBe("getting_started");
    expect(row.reasons).toEqual(["Officine créée il y a 13 jours"]);
  });

  it("14 jours pile : plus en démarrage", () => {
    expect(one({ createdAt: daysAgo(14) }).health).toBe("on_track");
  });

  it("créée aujourd'hui : « il y a moins d'un jour » ; hier : « 1 jour » (singulier)", () => {
    expect(one({ createdAt: new Date(NOW.getTime() - 3 * HOUR) }).reasons).toEqual(["Officine créée il y a moins d'un jour"]);
    expect(one({ createdAt: daysAgo(1) }).reasons).toEqual(["Officine créée il y a 1 jour"]);
  });

  it("une date de création dans le futur (horloge décalée) reste un démarrage", () => {
    expect(one({ createdAt: new Date(NOW.getTime() + HOUR) }).health).toBe("getting_started");
  });

  it("passe avant TOUTES les autres règles, même sans aucun conseil et avec toutes les alertes", () => {
    const row = one({
      createdAt: daysAgo(5),
      proposed: 0,
      accepted: 40,
      decided: 0,
      purchased: 0,
      confirmedTtcCents: 0,
      recentAnalyses: 0,
      lastProposalAt: daysAgo(30),
      roi: shown(0.4),
    });
    expect(row.health).toBe("getting_started");
    expect(row.priority).toBe(30);
  });
});

describe("règle 2 : pas encore démarré (JAMAIS de conseil, et aucune analyse sur 30 jours)", () => {
  const silent = { proposed: 0, accepted: 0, decided: 0, purchased: 0, confirmedTtcCents: 0, previousConfirmedTtcCents: 0, recentAnalyses: 0, roi: HIDDEN };

  it("jamais de conseil et aucune analyse : pas démarré, avec la raison exacte", () => {
    const row = one({ ...silent, lastProposalAt: null, lastSaleAt: null });
    expect(row.health).toBe("no_data");
    expect(row.reasons).toEqual(["Aucun conseil proposé pour l'instant"]);
    expect(row.priority).toBe(40);
  });

  it("une analyse dans les 30 jours suffit à ne plus être « pas démarré »", () => {
    expect(one({ ...silent, lastProposalAt: null, recentAnalyses: 1 }).health).not.toBe("no_data");
  });

  it("des conseils proposés ce mois-ci écartent la règle même si le dernier conseil est inconnu", () => {
    expect(one({ ...silent, proposed: 3, decided: 3, lastProposalAt: null }).health).not.toBe("no_data");
  });

  it("un dernier conseil il y a 90 jours, 91 jours ou 400 jours : l'officine a déjà utilisé PharmaBoost, elle est « à accompagner », jamais « pas démarrée »", () => {
    // Avant : au-delà de 90 jours, une officine arrêtée devenait « Pas encore démarré » (priorité 40) et sortait de la liste d'accompagnement.
    const ninety = one({ ...silent, lastProposalAt: daysAgo(90) });
    expect(ninety).toMatchObject({ health: "needs_support", reasons: ["Utilisation arrêtée depuis 90 jours"], priority: 101 });

    const ninetyOne = one({ ...silent, createdAt: daysAgo(100), lastProposalAt: daysAgo(91) });
    expect(ninetyOne).toMatchObject({ health: "needs_support", reasons: ["Utilisation arrêtée depuis 91 jours"], priority: 101 });
    expect(ninetyOne.reasons).not.toContain("Aucun conseil proposé pour l'instant");

    const fourHundred = one({ ...silent, createdAt: daysAgo(500), lastProposalAt: daysAgo(400) });
    expect(fourHundred).toMatchObject({ health: "needs_support", reasons: ["Utilisation arrêtée depuis 400 jours"], priority: 101 });
  });

  it("une officine perdue depuis 91 jours passe AVANT une officine jamais démarrée dans le tri « à voir en premier »", () => {
    const rows = classifyPortfolio(
      [
        pharmacy({ pharmacyId: "never", name: "Jamais", ...silent, lastProposalAt: null }),
        pharmacy({ pharmacyId: "lost", name: "Perdue", ...silent, lastProposalAt: daysAgo(91) }),
      ],
      NOW,
    );
    expect(rows.map((row) => [row.pharmacyId, row.health, row.priority])).toEqual([
      ["lost", "needs_support", 101],
      ["never", "no_data", 40],
    ]);
  });

  it("des conseils jadis et une analyse récente : toujours « à accompagner » pour l'arrêt des conseils", () => {
    const row = one({ ...silent, recentAnalyses: 4, lastProposalAt: daysAgo(91) });
    expect(row).toMatchObject({ health: "needs_support", reasons: ["Utilisation arrêtée depuis 91 jours"] });
  });
});

describe("règle 3 : à accompagner (une seule raison suffit)", () => {
  it("utilisation arrêtée : 6 jours 23 h, non ; 7 jours pile, oui", () => {
    expect(one({ lastProposalAt: new Date(NOW.getTime() - 7 * DAY + HOUR) }).health).toBe("on_track");
    const row = one({ lastProposalAt: daysAgo(7) });
    expect(row.health).toBe("needs_support");
    expect(row.reasons).toEqual(["Utilisation arrêtée depuis 7 jours"]);
  });

  it("utilisation arrêtée : la durée est dite en jours entiers (9 jours)", () => {
    expect(one({ lastProposalAt: new Date(NOW.getTime() - 9 * DAY - 5 * HOUR) }).reasons).toEqual(["Utilisation arrêtée depuis 9 jours"]);
  });

  it("utilisation arrêtée : jamais de conseil (null) n'est pas une utilisation arrêtée", () => {
    // Pas de conseil du tout mais des analyses : ni arrêtée ni pas démarrée.
    const row = one({ lastProposalAt: null, proposed: 0, accepted: 0, decided: 0, purchased: 0, confirmedTtcCents: 0, roi: HIDDEN });
    expect(row.health).toBe("on_track");
  });

  it("conseils peu retenus : 19 % sur 20 tranchés, oui", () => {
    const row = one({ accepted: 3, decided: 20, roi: HIDDEN });
    expect(row.health).toBe("needs_support");
    expect(row.reasons).toEqual(["Conseils peu retenus (3 acceptés sur 20 tranchés, soit 15 %)"]);
  });

  it("conseils peu retenus : le pourcentage écrit est le même que partout (14,5 % → 15 %, jamais 14 %)", () => {
    // 29 ÷ 200 = 14,499999999999998 en machine : un Math.round nu écrirait 14 %.
    const row = one({ accepted: 29, decided: 200, roi: HIDDEN });
    expect(row.reasons).toEqual(["Conseils peu retenus (29 acceptés sur 200 tranchés, soit 15 %)"]);
  });

  it("conseils peu retenus : 20 % pile n'est pas « peu retenu » (4 sur 20, 7 sur 35)", () => {
    expect(one({ accepted: 4, decided: 20, roi: HIDDEN }).health).toBe("on_track");
    expect(one({ accepted: 7, decided: 35, roi: HIDDEN }).health).toBe("on_track");
  });

  it("conseils peu retenus : sous 20 conseils tranchés, un taux ne veut rien dire", () => {
    expect(one({ accepted: 0, decided: 19, roi: HIDDEN }).health).toBe("on_track");
    expect(one({ accepted: 0, decided: 20, roi: HIDDEN }).health).toBe("needs_support");
  });

  it("ventes pas enregistrées : 10 acceptés sans aucune vente, oui ; 9, non", () => {
    const base = { accepted: 10, decided: 30, purchased: 0, confirmedTtcCents: 0, unpricedConfirmedLines: 0, lastSaleAt: null, roi: HIDDEN };
    const row = one(base);
    expect(row.health).toBe("needs_support");
    expect(row.reasons).toEqual([
      "Ventes pas enregistrées dans PharmaBoost : la valeur n'est pas mesurable (10 conseils acceptés ce mois-ci, aucune vente confirmée)",
    ]);
    expect(one({ ...base, accepted: 9 }).health).toBe("on_track");
  });

  it("ventes pas enregistrées : une vente sans prix est une vente enregistrée, la raison ne s'applique pas", () => {
    const row = one({ accepted: 12, decided: 30, purchased: 0, confirmedTtcCents: 0, unpricedConfirmedLines: 2, roi: HIDDEN });
    expect(row.health).toBe("on_track");
  });

  it("retour sur abonnement sous 1 : 0,99, oui ; 1,0 pile, non", () => {
    const row = one({ roi: shown(0.99) });
    expect(row.health).toBe("needs_support");
    expect(row.reasons).toEqual(["La valeur mesurée reste sous le prix de l'abonnement (0,9 fois)"]);
    expect(one({ roi: shown(1) }).health).toBe("on_track");
  });

  it("retour masqué : jamais une alerte « sous le prix de l'abonnement »", () => {
    expect(one({ roi: HIDDEN }).health).toBe("on_track");
  });

  it("les raisons s'additionnent, dans l'ordre : arrêtée, peu retenus, ventes, retour < 1", () => {
    const row = one({
      lastProposalAt: daysAgo(9),
      accepted: 10,
      decided: 60,
      purchased: 0,
      confirmedTtcCents: 0,
      unpricedConfirmedLines: 0,
      roi: shown(0.6),
    });
    expect(row.health).toBe("needs_support");
    expect(row.reasons).toHaveLength(4);
    expect(row.reasons[0]).toBe("Utilisation arrêtée depuis 9 jours");
    expect(row.reasons[1]).toMatch(/^Conseils peu retenus/);
    expect(row.reasons[2]).toMatch(/^Ventes pas enregistrées dans PharmaBoost/);
    expect(row.reasons[3]).toMatch(/^La valeur mesurée reste sous le prix de l'abonnement/);
    expect(row.priority).toBe(104);
  });
});

describe("règle 4 : forte valeur", () => {
  it("retour affiché ≥ 3 : 3,0 pile, oui ; 2,99, non", () => {
    const row = one({ roi: shown(3) });
    expect(row.health).toBe("high_value");
    expect(row.reasons).toEqual(["Retour sur abonnement de 3,0 fois ce mois-ci"]);
    expect(one({ roi: shown(2.99) }).health).toBe("on_track");
  });

  it("retour masqué : CA ≥ 3 fois le prix mensuel converti en TTC et ≥ 10 ventes, au centime près", () => {
    // 126 € HT × 1,2 = 151,20 € TTC ; × 3 = 453,60 € = 45 360 c
    const base = { roi: HIDDEN, purchased: 10 };
    const row = one({ ...base, confirmedTtcCents: 45_360 });
    expect(row.health).toBe("high_value");
    expect(row.reasons).toEqual(["Plus de 3 fois le prix de l'abonnement en ventes confirmées ce mois-ci (10 conseils achetés)"]);
    expect(one({ ...base, confirmedTtcCents: 45_359 }).health).toBe("on_track");
  });

  it("retour masqué : 9 ventes ne suffisent pas, même avec un très gros CA", () => {
    expect(one({ roi: HIDDEN, purchased: 9, confirmedTtcCents: 500_000 }).health).toBe("on_track");
  });

  it("retour masqué et prix du contrat inconnu : on ne devine pas, pas de forte valeur", () => {
    expect(one({ roi: HIDDEN, subscription: null, purchased: 30, confirmedTtcCents: 500_000 }).health).toBe("on_track");
    expect(one({ roi: HIDDEN, subscription: { status: "ACTIVE", monthlyPriceHtCents: null }, purchased: 30, confirmedTtcCents: 500_000 }).health).toBe("on_track");
    expect(one({ roi: HIDDEN, subscription: { status: "CANCELED", monthlyPriceHtCents: 12_600 }, purchased: 30, confirmedTtcCents: 500_000 }).health).toBe("on_track");
  });

  it("abonnement partagé entre plusieurs officines : jamais « forte valeur » sur le CA d'une seule, même très gros", () => {
    const shared = { status: "ACTIVE", monthlyPriceHtCents: 12_600, shared: true };
    const hidden: SubscriptionReturn = { status: "hidden", reason: "shared_subscription", detail: "Cet abonnement couvre plusieurs officines." };
    const base = { roi: hidden, purchased: 30, confirmedTtcCents: 500_000 };
    expect(one({ ...base, subscription: shared }).health).toBe("on_track");
    // Le même chiffre d'affaires, pour une officine seule à son abonnement : forte valeur.
    expect(one({ ...base, subscription: { ...shared, shared: false } }).health).toBe("high_value");
  });

  it("abonnement partagé : le retour masqué ne déclenche pas non plus « sous le prix de l'abonnement » (pas de ratio du tout)", () => {
    const hidden: SubscriptionReturn = { status: "hidden", reason: "shared_subscription", detail: "Cet abonnement couvre plusieurs officines." };
    const row = one({ subscription: { status: "ACTIVE", monthlyPriceHtCents: 49_900, shared: true }, roi: hidden, confirmedTtcCents: 1000, purchased: 1 });
    expect(row.health).toBe("on_track");
    expect(row.reasons).toEqual(["Aucun signal d'alerte ce mois-ci"]);
  });

  it("retour AFFICHÉ sous 3 : le repli sur le CA TTC ne s'applique pas (le retour affiché fait foi)", () => {
    expect(one({ roi: shown(2), purchased: 40, confirmedTtcCents: 900_000 }).health).toBe("on_track");
  });

  it("l'accompagnement passe avant la forte valeur : une officine qui remplit les deux règles prend la première", () => {
    // Retour 4,2 fois mais utilisation arrêtée depuis 8 jours.
    const row = one({ roi: shown(4.2), lastProposalAt: daysAgo(8) });
    expect(row.health).toBe("needs_support");
    expect(row.reasons).toEqual(["Utilisation arrêtée depuis 8 jours"]);
  });
});

describe("règle 5 : dans la bonne voie, et l'ordre des règles", () => {
  it("une officine sans signal d'alerte ni forte valeur", () => {
    const row = one();
    expect(row.health).toBe("on_track");
    expect(row.reasons).toEqual(["Aucun signal d'alerte ce mois-ci"]);
    expect(row.priority).toBe(20);
  });

  it("le même cas passe de règle en règle quand on aggrave l'officine", () => {
    expect(one().health).toBe("on_track");
    expect(one({ roi: shown(3.4) }).health).toBe("high_value");
    expect(one({ roi: shown(3.4), accepted: 2, decided: 56 }).health).toBe("needs_support");
    expect(one({ roi: shown(3.4), accepted: 2, decided: 56, proposed: 0, lastProposalAt: null, recentAnalyses: 0 }).health).toBe("no_data");
    expect(one({ roi: shown(3.4), accepted: 2, decided: 56, proposed: 0, lastProposalAt: null, recentAnalyses: 0, createdAt: daysAgo(3) }).health).toBe("getting_started");
  });
});

describe("priorité et tri « à voir en premier »", () => {
  it("l'ordre des classes : accompagner, pas démarré, démarrage, bonne voie, forte valeur", () => {
    const rows = classifyPortfolio(
      [
        pharmacy({ pharmacyId: "a", name: "A haute valeur", roi: shown(4) }),
        pharmacy({ pharmacyId: "b", name: "B bonne voie" }),
        pharmacy({ pharmacyId: "c", name: "C démarrage", createdAt: daysAgo(2) }),
        pharmacy({ pharmacyId: "d", name: "D pas démarré", proposed: 0, accepted: 0, decided: 0, lastProposalAt: null, recentAnalyses: 0, roi: HIDDEN }),
        pharmacy({ pharmacyId: "e", name: "E à accompagner", lastProposalAt: daysAgo(10) }),
      ],
      NOW,
    );
    expect(rows.map((row) => row.health)).toEqual(["needs_support", "no_data", "getting_started", "on_track", "high_value"]);
    const priorities = rows.map((row) => row.priority);
    expect(priorities).toEqual([...priorities].sort((x, y) => y - x));
    expect(new Set(priorities).size).toBe(5);
  });

  it("plus il y a de raisons d'accompagner, plus l'officine remonte", () => {
    const rows = classifyPortfolio(
      [
        pharmacy({ pharmacyId: "a", name: "Aaa", lastProposalAt: daysAgo(10) }),
        pharmacy({ pharmacyId: "z", name: "Zzz", lastProposalAt: daysAgo(10), roi: shown(0.5) }),
      ],
      NOW,
    );
    expect(rows.map((row) => row.pharmacyId)).toEqual(["z", "a"]);
    expect(rows.map((row) => row.priority)).toEqual([102, 101]);
  });

  it("même priorité : ordre alphabétique (accents et casse ignorés), puis identifiant", () => {
    const rows = classifyPortfolio(
      [
        pharmacy({ pharmacyId: "3", name: "Pharmacie Zola" }),
        pharmacy({ pharmacyId: "2", name: "pharmacie émile" }),
        pharmacy({ pharmacyId: "1", name: "Pharmacie Arc" }),
        pharmacy({ pharmacyId: "0", name: "Pharmacie Arc" }),
      ],
      NOW,
    );
    expect(rows.map((row) => row.pharmacyId)).toEqual(["0", "1", "2", "3"]);
  });

  it("ne modifie pas la liste reçue et gère une liste vide", () => {
    const inputs = [pharmacy({ pharmacyId: "b", name: "B" }), pharmacy({ pharmacyId: "a", name: "A", lastProposalAt: daysAgo(30) })];
    const copy = [...inputs];
    classifyPortfolio(inputs, NOW);
    expect(inputs).toEqual(copy);
    expect(classifyPortfolio([], NOW)).toEqual([]);
  });
});

describe("champs calculés de la ligne", () => {
  it("garde tous les champs d'entrée et ajoute taux d'acceptation, variation, santé, raisons, priorité", () => {
    const input = pharmacy();
    const [row] = classifyPortfolio([input], NOW);
    expect(row).toMatchObject({ ...input, acceptanceRate: 30 / 56, deltaPct: 25, health: "on_track" });
    expect(Array.isArray(row!.reasons)).toBe(true);
    expect(typeof row!.priority).toBe("number");
  });

  it("taux d'acceptation : accepté ÷ tranchés, null sans dénominateur, jamais au-dessus de 100 %", () => {
    expect(one({ accepted: 0, decided: 0 }).acceptanceRate).toBeNull();
    expect(one({ accepted: 5, decided: 4 }).acceptanceRate).toBe(1);
  });

  it("variation du CA : jamais de pourcentage quand le mois précédent vaut 0", () => {
    expect(one({ confirmedTtcCents: 20_000, previousConfirmedTtcCents: 0 }).deltaPct).toBeNull();
    expect(one({ confirmedTtcCents: 0, previousConfirmedTtcCents: 0 }).deltaPct).toBeNull();
    expect(one({ confirmedTtcCents: 0, previousConfirmedTtcCents: 4000 }).deltaPct).toBe(-100);
    expect(one({ confirmedTtcCents: 12_900, previousConfirmedTtcCents: 10_000 }).deltaPct).toBe(29);
  });
});
