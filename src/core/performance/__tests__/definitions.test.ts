import { describe, expect, it } from "vitest";
import {
  METHOD_SECTIONS,
  MIN_DECIDED_FOR_RATE,
  PENDING_GRACE_HOURS,
  RHYTHM_MIN_DECIDED_SLOT,
  RHYTHM_MIN_DECIDED_TOTAL,
  ROI_MIN_PRICED_LINES,
  ROI_MIN_PRICED_SHARE,
} from "../definitions";

/**
 * Le panneau « Comment c'est calculé » dit ce que fait le code : chaque nombre
 * du texte est lu dans les constantes du calcul, et les mots suivent la règle
 * « un mot, une unité » (ventes confirmées = tickets, lignes de vente = lignes).
 */

const body = (title: string) => METHOD_SECTIONS.find((section) => section.title === title)?.body ?? "";
const allText = METHOD_SECTIONS.map((section) => `${section.title}. ${section.body}`).join("\n");

describe("panneau « Comment c'est calculé » : les mots", () => {
  it("le nombre de ventes confirmées ne compte que les ventes dont une ligne a un prix ; une ligne sans prix est signalée à part", () => {
    const text = body("Conseil accepté ou vente confirmée ?");
    expect(text).toContain("ne compte que celles dont au moins une ligne a un prix saisi");
    expect(text).toContain("une ligne sans prix est signalée à part et ne fait jamais de chiffre d'affaires");
  });

  it("une ligne de vente sans prix n'entre jamais dans le chiffre d'affaires : le texte ne dit plus qu'elle « est comptée comme vente »", () => {
    const text = body("Chiffre d'affaires attribué");
    expect(text).toContain("Une ligne de vente sans prix n'entre jamais dans le chiffre d'affaires");
    expect(text).not.toContain("comptée comme vente");
    expect(allText).not.toContain("comptée comme vente");
  });

  it("le retour sur abonnement parle de lignes de vente au prix connu, avec les seuils du calcul (5 lignes, 90 %)", () => {
    const text = body("Retour sur abonnement");
    expect(ROI_MIN_PRICED_LINES).toBe(5);
    expect(ROI_MIN_PRICED_SHARE).toBe(0.9);
    expect(text).toContain(`au moins ${ROI_MIN_PRICED_LINES} lignes de vente confirmées au prix connu`);
    expect(text).toContain(`au moins ${Math.round(ROI_MIN_PRICED_SHARE * 100)} %`);
    expect(text).not.toMatch(/au moins 5 ventes/);
  });

  it("le retour sur abonnement dit qu'il reste masqué quand l'abonnement couvre plusieurs officines", () => {
    expect(body("Retour sur abonnement")).toContain(
      "Il reste masqué quand l'abonnement couvre plusieurs officines : le chiffre d'affaires d'une seule ne se compare pas au prix du groupe.",
    );
  });

  it("« 7 derniers jours » = les 6 jours précédents et aujourd'hui", () => {
    expect(body("Comparaison")).toContain("les 7 derniers jours (les 6 jours précédents et aujourd'hui) contre les 7 jours d'avant");
  });

  it("dit le fuseau : « Heures et jours : fuseau de Paris. »", () => {
    expect(allText).toContain("Heures et jours : fuseau de Paris.");
  });

  it("le taux d'acceptation : 24 heures d'attente, arrondi au pourcent entier, même règle par produit et par univers", () => {
    const text = body("Taux d'acceptation");
    expect(PENDING_GRACE_HOURS).toBe(24);
    expect(text).toContain(`moins de ${PENDING_GRACE_HOURS} heures`);
    expect(text).toContain("Le taux par produit et par univers se calcule de la même façon.");
    expect(text).toContain("arrondi au pourcent entier");
  });

  it("les seuils du rythme écrits dans le texte sont ceux du calcul (30 conseils tranchés, 8 par créneau)", () => {
    const text = body("Heures et jours qui fonctionnent");
    expect(text).toContain(`${RHYTHM_MIN_DECIDED_TOTAL} conseils tranchés au moins`);
    expect(text).toContain(`au moins ${RHYTHM_MIN_DECIDED_SLOT} conseils tranchés`);
  });

  it("le seuil d'un taux sur peu de conseils est 3 conseils tranchés", () => {
    expect(MIN_DECIDED_FOR_RATE).toBe(3);
  });

  it("chaque rubrique a un titre et un texte, et aucun titre n'est répété", () => {
    for (const section of METHOD_SECTIONS) {
      expect(section.title.length).toBeGreaterThan(3);
      expect(section.body.length).toBeGreaterThan(30);
    }
    const titles = METHOD_SECTIONS.map((section) => section.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
