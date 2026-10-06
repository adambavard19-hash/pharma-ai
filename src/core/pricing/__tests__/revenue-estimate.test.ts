import { describe, expect, it } from "vitest";
import { ESTIMATE_ASSUMPTIONS, MAX_CLIENTS_PER_DAY, estimateAdditionalRevenue, parseClientsPerDay } from "../revenue-estimate";

describe("l'estimation de chiffre d'affaires", () => {
  it("200 clients par jour : 20 conseillés, 140 € par jour, 3 500 € par mois", () => {
    expect(estimateAdditionalRevenue(200)).toEqual({ clientsPerDay: 200, advisedClientsPerDay: 20, perDayCents: 14_000, perMonthCents: 350_000 });
  });

  it("les hypothèses sont 10 %, 7 € le produit, 25 jours d'ouverture", () => {
    expect(ESTIMATE_ASSUMPTIONS).toEqual({ adviceRate: 0.1, averageProductCents: 700, openDaysPerMonth: 25 });
  });

  it("chaque étape est un entier : ce qui s'affiche se refait à la calculette", () => {
    const e = estimateAdditionalRevenue(155); // 15,5 clients conseillés → 16
    expect(e.advisedClientsPerDay).toBe(16);
    expect(e.perDayCents).toBe(e.advisedClientsPerDay * 700);
    expect(e.perMonthCents).toBe(e.perDayCents * 25);
  });

  it("zéro client : zéro, jamais un nombre inventé", () => {
    expect(estimateAdditionalRevenue(0)).toMatchObject({ advisedClientsPerDay: 0, perMonthCents: 0 });
  });

  it("borne la saisie démesurée et ignore le négatif", () => {
    expect(estimateAdditionalRevenue(9_999_999).clientsPerDay).toBe(MAX_CLIENTS_PER_DAY);
    expect(estimateAdditionalRevenue(-40).clientsPerDay).toBe(0);
  });
});

describe("parseClientsPerDay", () => {
  it("lit un nombre écrit à la française", () => {
    expect(parseClientsPerDay("200")).toBe(200);
    expect(parseClientsPerDay("1 200")).toBe(1_200);
    expect(parseClientsPerDay("1 200")).toBe(1_200);
    expect(parseClientsPerDay("200,4")).toBe(200);
  });
  it("une saisie vide, négative ou illisible vaut null : rien n'est deviné", () => {
    for (const bad of ["", "   ", "abc", "-5", "12e", "NaN"]) expect(parseClientsPerDay(bad)).toBeNull();
  });
  it("ramène une saisie énorme à la borne", () => {
    expect(parseClientsPerDay("100000")).toBe(MAX_CLIENTS_PER_DAY);
  });
});
