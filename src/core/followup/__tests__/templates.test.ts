import { describe, expect, it } from "vitest";
import { FOLLOW_UP_TEMPLATES, findTemplate, proposedDueDate } from "../templates";

/**
 * Le message de suivi ne doit jamais exposer de donnée de santé.
 *
 * C'est la garantie centrale du pilier : un e-mail traverse des serveurs, des
 * boîtes partagées, des écrans de téléphone posés sur une table. Le contenu de
 * santé reste derrière un lien à durée limitée ; le message, lui, ne dit que
 * qu'un suivi existe.
 */

const VARIABLES = {
  patientFirstName: "Claire",
  pharmacyName: "Pharmacie Saint-Michel",
  link: "https://exemple.fr/fiche/JETON",
  unsubscribeLink: "https://exemple.fr/desinscription/JETON",
};

/**
 * Vocabulaire médical qui n'a rien à faire dans un message sortant. La liste
 * couvre ce qu'un gabarit pourrait être tenté d'écrire pour « personnaliser ».
 */
const HEALTH_TERMS =
  /\b(antibiotique|antibiothérapie|anti-inflammatoire|corticoïde|diabète|hypertension|cholestérol|dépression|anxiété|cancer|grossesse|allergie|ordonnance de|posologie|comprimé|gélule|mg\b|cure de|molécule|traitement par)\b/i;

describe("gabarits de suivi — aucune donnée de santé ne sort", () => {
  it.each(FOLLOW_UP_TEMPLATES.map((template) => [template.key, template] as const))(
    "« %s » n'écrit aucun terme médical",
    (_key, template) => {
      expect(template.subject(VARIABLES)).not.toMatch(HEALTH_TERMS);
      expect(template.body(VARIABLES)).not.toMatch(HEALTH_TERMS);
    },
  );

  it.each(FOLLOW_UP_TEMPLATES.map((template) => [template.key, template] as const))(
    "« %s » porte le lien sécurisé et la désinscription",
    (_key, template) => {
      const body = template.body(VARIABLES);
      expect(body).toContain(VARIABLES.link);
      expect(body).toContain(VARIABLES.unsubscribeLink);
      expect(body).toContain(VARIABLES.patientFirstName);
      expect(body).toContain(VARIABLES.pharmacyName);
    },
  );

  it.each(FOLLOW_UP_TEMPLATES.map((template) => [template.key, template] as const))(
    "« %s » annonce lui-même qu'il ne contient rien de médical",
    (_key, template) => {
      expect(template.body(VARIABLES)).toContain(
        "Ce message ne contient aucune information sur votre santé",
      );
    },
  );

  /**
   * Le gabarit ne reçoit que quatre variables. Ce test échoue si quelqu'un en
   * ajoute une : ajouter un champ, c'est autoriser une donnée de plus à sortir
   * de l'officine, et cela doit être un choix conscient.
   */
  it("n'expose que quatre variables au gabarit", () => {
    expect(Object.keys(VARIABLES).sort()).toEqual([
      "link",
      "patientFirstName",
      "pharmacyName",
      "unsubscribeLink",
    ]);
  });
});

describe("échéance proposée", () => {
  it("cale la fin de cure sur la durée réelle du traitement", () => {
    const template = findTemplate("course-end")!;
    const from = new Date("2026-03-01T12:00:00Z");

    const short = proposedDueDate(template, from, 5);
    const long = proposedDueDate(template, from, 90);

    expect(Math.round((short.getTime() - from.getTime()) / 86_400_000)).toBeCloseTo(5, 0);
    expect(Math.round((long.getTime() - from.getTime()) / 86_400_000)).toBeCloseTo(90, 0);
  });

  it("retombe sur le délai par défaut quand la durée est inconnue", () => {
    const template = findTemplate("tolerance-check")!;
    const from = new Date("2026-03-01T12:00:00Z");
    const due = proposedDueDate(template, from, null);
    expect(Math.round((due.getTime() - from.getTime()) / 86_400_000)).toBeCloseTo(3, 0);
  });

  it("ignore une durée de traitement absurde", () => {
    const template = findTemplate("course-end")!;
    const from = new Date("2026-03-01T12:00:00Z");
    const due = proposedDueDate(template, from, 0);
    expect(Math.round((due.getTime() - from.getTime()) / 86_400_000)).toBeCloseTo(7, 0);
  });
});
