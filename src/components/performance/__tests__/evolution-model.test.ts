import { describe, expect, it } from "vitest";
import {
  MEASURES,
  availableMeasures,
  axisLabel,
  bucketDetail,
  buildScale,
  comparisonName,
  defaultMeasure,
  effectiveMeasure,
  formatTick,
  formatValue,
  granularityNoun,
  hasSignal,
  labelPlan,
  lastKnownIndex,
  measureValue,
  seriesValues,
  spokenRange,
} from "../evolution-model";
import { bucket } from "./fixtures-u1";

/** Ce que le graphique d'évolution dessine : mesures, échelle, étiquettes et mots. */

const norm = (text: string) => text.replace(/[\u00a0\u202f]/g, " ");

describe("les mesures", () => {
  it("quatre mesures ; le taux n'est offert que si le rapport sait en calculer un", () => {
    expect(availableMeasures(true)).toEqual(["revenue", "proposed", "accepted", "rate"]);
    expect(availableMeasures(false)).toEqual(["revenue", "proposed", "accepted"]);
  });

  it("une mesure choisie puis devenue indisponible retombe sur les conseils proposés", () => {
    expect(effectiveMeasure("rate", false)).toBe("proposed");
    expect(effectiveMeasure("rate", true)).toBe("rate");
    expect(effectiveMeasure("revenue", false)).toBe("revenue");
  });

  it("chaque mesure lit sa colonne de la tranche", () => {
    const b = bucket(0, { proposed: 12, accepted: 8, purchased: 3, revenueTtcCents: 28_700, acceptanceRate: 0.667 });
    expect(measureValue(b, "proposed")).toBe(12);
    expect(measureValue(b, "accepted")).toBe(8);
    expect(measureValue(b, "revenue")).toBe(28_700);
    expect(measureValue(b, "rate")).toBe(0.667);
    expect(seriesValues([b, bucket(1)], "revenue")).toEqual([28_700, 0]);
  });

  it("un taux absent reste null : il n'est jamais lu comme zéro", () => {
    expect(measureValue(bucket(0, { proposed: 2 }), "rate")).toBeNull();
    expect(seriesValues([bucket(0), bucket(1, { acceptanceRate: 0 })], "rate")).toEqual([null, 0]);
  });
});

describe("hasSignal et la mesure d'ouverture", () => {
  it("zéro et null ne sont pas un signal ; une valeur positive en est un", () => {
    expect(hasSignal([])).toBe(false);
    expect(hasSignal([0, 0, null])).toBe(false);
    expect(hasSignal([0, 3, null])).toBe(true);
    expect(hasSignal([Number.NaN])).toBe(false);
  });

  it("on ouvre sur le chiffre d'affaires s'il y en a, sinon sur les conseils proposés", () => {
    expect(defaultMeasure([bucket(0, { revenueTtcCents: 500, proposed: 4 })])).toBe("revenue");
    expect(defaultMeasure([bucket(0, { proposed: 4 })])).toBe("proposed");
    expect(defaultMeasure([bucket(0)])).toBe("revenue");
    expect(defaultMeasure([])).toBe("revenue");
  });
});

describe("l'échelle verticale", () => {
  it("un taux va toujours de 0 à 100 %, quelles que soient les valeurs", () => {
    expect(buildScale("rate", [[0.1, 0.2]])).toEqual({ max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] });
    expect(buildScale("rate", [[null]])).toEqual({ max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] });
  });

  it("des conseils : au moins jusqu'à 4, pour qu'un conseil ne remplisse pas le graphique", () => {
    expect(buildScale("proposed", [[1, 0, 1]])).toEqual({ max: 4, ticks: [0, 1, 2, 3, 4] });
    expect(buildScale("proposed", [[0, 0]])).toEqual({ max: 4, ticks: [0, 1, 2, 3, 4] });
  });

  it("des conseils : des graduations rondes (10 donne 0 · 5 · 10)", () => {
    expect(buildScale("proposed", [[3, 10, 7]])).toEqual({ max: 10, ticks: [0, 5, 10] });
  });

  it("la période précédente compte dans l'échelle quand elle est tracée", () => {
    expect(buildScale("accepted", [[2, 3], [20, 18]]).max).toBe(20);
  });

  it("le chiffre d'affaires reste en centimes entiers", () => {
    const { max, ticks } = buildScale("revenue", [[0, 28_700, 12_000]]);
    expect(max).toBe(30_000);
    expect(ticks.every((tick) => Number.isInteger(tick))).toBe(true);
  });

  it("sans aucun chiffre d'affaires, l'échelle de repli est de 100 €", () => {
    expect(buildScale("revenue", [[0, 0]]).max).toBe(10_000);
  });
});

describe("les mots du graphique", () => {
  it("graduations : pourcentage entier, euros ronds, effectifs", () => {
    expect(norm(formatTick("rate", 0.25))).toBe("25 %");
    expect(norm(formatTick("revenue", 10_000))).toBe("100 €");
    expect(formatTick("proposed", 5)).toBe("5");
  });

  it("valeurs : le montant exact au centime, l'effectif, le taux entier, « — » pour l'inconnu", () => {
    expect(norm(formatValue("revenue", 28_705))).toBe("287,05 €");
    expect(norm(formatValue("revenue", 0))).toBe("0,00 €");
    expect(formatValue("accepted", 21)).toBe("21");
    expect(norm(formatValue("rate", 0.625))).toBe("63 %");
    expect(formatValue("rate", null)).toBe("—");
  });

  it("la granularité s'écrit « par heure », « par jour », « par semaine »", () => {
    expect(granularityNoun("hour")).toBe("par heure");
    expect(granularityNoun("day")).toBe("par jour");
    expect(granularityNoun("week")).toBe("par semaine");
  });

  it("le nom de la courbe de comparaison, sans le « vs »", () => {
    expect(comparisonName("vs hier")).toBe("Hier");
    expect(comparisonName("vs les 7 jours d'avant")).toBe("Les 7 jours d'avant");
    expect(comparisonName("vs le mois dernier")).toBe("Le mois dernier");
    expect(comparisonName("vs la période précédente")).toBe("La période précédente");
    expect(comparisonName("")).toBe("Période précédente");
  });

  it("les titres de mesure ne parlent de « vente » que pour le chiffre d'affaires confirmé", () => {
    expect(MEASURES.accepted.title).not.toMatch(/vend|vente|confirm/i);
    expect(MEASURES.proposed.title).not.toMatch(/vend|vente|confirm/i);
    expect(MEASURES.revenue.emptyText).toMatch(/vente confirmée/);
  });
});

describe("le détail sous la valeur", () => {
  it("proposés : dont N acceptés, avec l'accord", () => {
    expect(bucketDetail(bucket(0, { proposed: 5, accepted: 1 }), "proposed")).toBe("dont 1 accepté");
    expect(bucketDetail(bucket(0, { proposed: 5, accepted: 3 }), "proposed")).toBe("dont 3 acceptés");
    expect(bucketDetail(bucket(0, { proposed: 5, accepted: 0 }), "proposed")).toBe("dont 0 accepté");
  });

  it("acceptés : sur N proposés", () => {
    expect(bucketDetail(bucket(0, { proposed: 1, accepted: 1 }), "accepted")).toBe("sur 1 proposé");
    expect(bucketDetail(bucket(0, { proposed: 9, accepted: 4 }), "accepted")).toBe("sur 9 proposés");
  });

  it("chiffre d'affaires : les conseils achetés, rien s'il n'y en a pas", () => {
    expect(bucketDetail(bucket(0, { purchased: 1, revenueTtcCents: 900 }), "revenue")).toBe("1 conseil acheté");
    expect(bucketDetail(bucket(0, { purchased: 2, revenueTtcCents: 900 }), "revenue")).toBe("2 conseils achetés");
    expect(bucketDetail(bucket(0), "revenue")).toBeNull();
  });

  it("taux : un créneau sous 3 conseils tranchés le dit au lieu d'afficher un taux", () => {
    expect(bucketDetail(bucket(0, { acceptanceRate: null }), "rate")).toBe("Moins de 3 conseils tranchés : pas de taux");
    expect(bucketDetail(bucket(0, { acceptanceRate: 0.5 }), "rate")).toBeNull();
  });
});

describe("l'axe horizontal", () => {
  it("peu d'étiquettes sur petit écran (3 au plus), une demi-douzaine sur grand écran", () => {
    for (const count of [1, 2, 5, 7, 14, 24, 31, 35, 53]) {
      const plan = labelPlan(count);
      const narrow = plan.filter((item) => item.show !== "wide");
      const wide = plan.filter((item) => item.show !== "narrow");
      expect(narrow.length, `étroit ${count}`).toBeLessThanOrEqual(3);
      expect(wide.length, `large ${count}`).toBeLessThanOrEqual(6);
      expect(narrow.length).toBeGreaterThan(0);
    }
  });

  it("la première étiquette est toujours écrite, sur tous les écrans", () => {
    for (const count of [1, 2, 9, 30]) expect(labelPlan(count)[0]).toEqual({ index: 0, show: "always" });
  });

  it("aucune série : aucune étiquette", () => {
    expect(labelPlan(0)).toEqual([]);
  });

  it("14 points : 0 · 3 · 6 · 9 · 12 sur grand écran, 0 · 5 · 10 sur petit", () => {
    const plan = labelPlan(14);
    expect(plan.filter((item) => item.show !== "narrow").map((item) => item.index)).toEqual([0, 3, 6, 9, 12]);
    expect(plan.filter((item) => item.show !== "wide").map((item) => item.index)).toEqual([0, 5, 10]);
  });
});

describe("l'axe horizontal : six points en semaine (360 px)", () => {
  // Les mêmes semaines que sur la page : 31 août → 5 octobre, six points, tels que la série les nomme.
  const weekLabels = ["sem. du 31 août", "sem. du 7 sept.", "sem. du 14 sept.", "sem. du 21 sept.", "sem. du 28 sept.", "sem. du 5 oct."];

  /**
   * Les étiquettes écrites (celles du petit écran) avec leur emprise en px, comme
   * le fait la page : bord gauche à x % de la largeur, décalé de -x % de sa
   * propre largeur (translateX(-x %)). Largeur d'un caractère : 6 px à 11 px de corps.
   */
  function narrowBoxes(labels: string[], plotWidth: number) {
    const count = labels.length;
    return labelPlan(count)
      .filter((item) => item.show !== "wide")
      .map(({ index }) => {
        const width = labels[index].length * 6;
        const x = count > 1 ? index / (count - 1) : 0;
        const left = x * (plotWidth - width);
        return { label: labels[index], left, right: left + width };
      });
  }
  const overlaps = (boxes: { left: number; right: number }[]) => boxes.some((box, i) => i > 0 && box.left < boxes[i - 1].right);

  it("six points : trois étiquettes (0, 2, 4) sur petit écran, les six sur grand écran", () => {
    const plan = labelPlan(6);
    expect(plan.filter((item) => item.show !== "wide").map((item) => item.index)).toEqual([0, 2, 4]);
    expect(plan.filter((item) => item.show !== "narrow").map((item) => item.index)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("en semaine, l'étiquette est courte : « 14 sept. », sans « sem. du » (le titre dit déjà « par semaine »)", () => {
    expect(weekLabels.map((label) => axisLabel(label, "week"))).toEqual(["31 août", "7 sept.", "14 sept.", "21 sept.", "28 sept.", "5 oct."]);
  });

  it("le reste ne change pas : jours, heures, et une étiquette de semaine déjà courte", () => {
    expect(axisLabel("12 oct.", "day")).toBe("12 oct.");
    expect(axisLabel("14 h", "hour")).toBe("14 h");
    expect(axisLabel("2 h bis", "hour")).toBe("2 h bis");
    expect(axisLabel("14 sept.", "week")).toBe("14 sept.");
    // seul le préfixe de début disparaît
    expect(axisLabel("sem. du 7 sept.", "day")).toBe("sem. du 7 sept.");
  });

  it("à 360 px (tracé de 232 px), les trois étiquettes courtes ne se chevauchent pas ; avec « sem. du » elles se chevauchaient", () => {
    const shortLabels = weekLabels.map((label) => axisLabel(label, "week"));
    const short = narrowBoxes(shortLabels, 232);
    expect(short.map((box) => box.label)).toEqual(["31 août", "14 sept.", "28 sept."]);
    expect(overlaps(short)).toBe(false);
    // l'écart le plus étroit entre deux étiquettes voisines : au moins 20 px
    for (let i = 1; i < short.length; i += 1) expect(short[i].left - short[i - 1].right).toBeGreaterThan(20);

    const long = narrowBoxes(weekLabels, 232);
    expect(overlaps(long)).toBe(true);
  });

  it("même chose à 320 px (tracé de 192 px) et à 375 px (tracé de 247 px)", () => {
    const shortLabels = weekLabels.map((label) => axisLabel(label, "week"));
    expect(overlaps(narrowBoxes(shortLabels, 192))).toBe(false);
    expect(overlaps(narrowBoxes(shortLabels, 247))).toBe(false);
  });

  it("sur grand écran, six étiquettes courtes de 48 px tiennent dans un tracé de 520 px", () => {
    const shortLabels = weekLabels.map((label) => axisLabel(label, "week"));
    const count = shortLabels.length;
    const boxes = labelPlan(count)
      .filter((item) => item.show !== "narrow")
      .map(({ index }) => {
        const width = shortLabels[index].length * 6;
        const left = (index / (count - 1)) * (520 - width);
        return { left, right: left + width };
      });
    expect(boxes).toHaveLength(6);
    expect(overlaps(boxes)).toBe(false);
  });

  it("le pas large : 30 points donnent 0 · 5 · 10 · 15 · 20 · 25 (un pas de 6 au lieu de 5 en écrirait 5 seulement)", () => {
    const plan = labelPlan(30);
    expect(plan.filter((item) => item.show !== "narrow").map((item) => item.index)).toEqual([0, 5, 10, 15, 20, 25]);
    expect(plan.filter((item) => item.show !== "wide").map((item) => item.index)).toEqual([0, 10, 20]);
  });

  it("le pas étroit : 7 points donnent 0 · 3 · 6 ; 3 points donnent 0 · 1 · 2", () => {
    expect(labelPlan(7).filter((item) => item.show !== "wide").map((item) => item.index)).toEqual([0, 3, 6]);
    expect(labelPlan(3).filter((item) => item.show !== "wide").map((item) => item.index)).toEqual([0, 1, 2]);
  });
});

describe("la légende lue à voix haute", () => {
  it("un seul point à la fin, même quand l'étiquette finit déjà par un point : « de 5 oct. à 11 oct. »", () => {
    expect(spokenRange("5 oct.", "11 oct.")).toBe("de 5 oct. à 11 oct.");
    expect(spokenRange("sem. du 31 août", "sem. du 5 oct.")).toBe("de sem. du 31 août à sem. du 5 oct.");
    expect(spokenRange("sem. du 31 août", "sem. du 5 oct.")).not.toContain("..");
  });

  it("une étiquette sans point final reçoit celui de la phrase : « de 14 h à 23 h. »", () => {
    expect(spokenRange("14 h", "23 h")).toBe("de 14 h à 23 h.");
    expect(spokenRange("30 sept.", "6 oct.")).toBe("de 30 sept. à 6 oct.");
  });
});

describe("le point final", () => {
  it("le dernier point connu, en sautant les trous", () => {
    expect(lastKnownIndex([1, 2, 3])).toBe(2);
    expect(lastKnownIndex([1, null, null])).toBe(0);
    expect(lastKnownIndex([null, null])).toBeNull();
    expect(lastKnownIndex([])).toBeNull();
    expect(lastKnownIndex([4, 0])).toBe(1);
  });
});
