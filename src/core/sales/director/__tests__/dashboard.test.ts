import { describe, expect, it } from "vitest";
import { conversionRate, describeEventActor, describeReached, describeProspectEvent, parseDirectorPeriod, rankTeam, resolveDirectorPeriod, summarizeTeam, type TeamMemberStats } from "../dashboard";

const NBSP = /[  ]/g;
const plain = (text: string) => text.replace(NBSP, " ");

describe("la période choisie dans l'adresse", () => {
  it("connaît trois périodes et revient à « ce mois » pour le reste", () => {
    expect(parseDirectorPeriod("mois")).toBe("mois");
    expect(parseDirectorPeriod("30-jours")).toBe("30-jours");
    expect(parseDirectorPeriod("annee")).toBe("annee");
    expect(parseDirectorPeriod(undefined)).toBe("mois");
    expect(parseDirectorPeriod("")).toBe("mois");
    expect(parseDirectorPeriod("trimestre")).toBe("mois");
    expect(parseDirectorPeriod("toString")).toBe("mois");
    expect(parseDirectorPeriod(["annee", "mois"])).toBe("annee");
  });
});

describe("les bornes d'une période (heure de Paris)", () => {
  it("le mois commence le 1er à minuit, heure d'été comprise", () => {
    const period = resolveDirectorPeriod("mois", new Date("2026-10-06T10:00:00Z"));
    expect(period.start.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-10-06T10:00:00.000Z");
    expect(period.label).toBe("Ce mois");
    expect(period.phrase).toBe("Ce mois-ci");
  });

  it("le mois commence à minuit heure d'hiver une fois l'heure changée", () => {
    expect(resolveDirectorPeriod("mois", new Date("2026-11-15T12:00:00Z")).start.toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });

  it("un dossier ouvert le 1er à 0 h 30 compte pour le mois qui commence, pas pour le précédent", () => {
    // Le 1er octobre à 0 h 30 à Paris, c'est encore le 30 septembre en UTC.
    const now = new Date("2026-10-01T10:00:00Z");
    const { start } = resolveDirectorPeriod("mois", now);
    const openedAtHalfPastMidnight = new Date("2026-09-30T22:30:00Z");
    expect(openedAtHalfPastMidnight >= start).toBe(true);
    expect(new Date("2026-09-30T21:30:00Z") >= start).toBe(false);
  });

  it("le mois vu depuis Paris : le soir du dernier jour, on est encore dans le mois qui finit", () => {
    // 31 octobre 23 h 30 UTC = 1er novembre 0 h 30 à Paris (heure d'hiver : UTC+1) : nouveau mois.
    expect(resolveDirectorPeriod("mois", new Date("2026-10-31T23:30:00Z")).start.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    // 31 octobre 22 h 30 UTC = 31 octobre 23 h 30 à Paris : encore octobre.
    expect(resolveDirectorPeriod("mois", new Date("2026-10-31T22:30:00Z")).start.toISOString()).toBe("2026-09-30T22:00:00.000Z");
  });

  it("l'année commence le 1er janvier à minuit, heure d'hiver", () => {
    const period = resolveDirectorPeriod("annee", new Date("2026-10-06T10:00:00Z"));
    expect(period.start.toISOString()).toBe("2025-12-31T23:00:00.000Z");
    expect(period.label).toBe("Cette année");
  });

  it("« 30 jours » est glissant : trente fois vingt-quatre heures avant maintenant", () => {
    const now = new Date("2026-10-06T10:00:00Z");
    const period = resolveDirectorPeriod("30-jours", now);
    expect(period.start.toISOString()).toBe("2026-09-06T10:00:00.000Z");
    expect(period.end).toBe(now);
  });
});

describe("le taux de transformation", () => {
  it("part des dossiers ouverts qui ont atteint la signature", () => {
    expect(conversionRate(2, 8)).toBe(0.25);
    expect(conversionRate(0, 5)).toBe(0);
  });

  it("aucun dossier ouvert : pas de taux, jamais un 0 % inventé", () => {
    expect(conversionRate(0, 0)).toBeNull();
    expect(conversionRate(3, 0)).toBeNull();
  });

  it("reste entre 0 et 1", () => {
    expect(conversionRate(9, 3)).toBe(1);
    expect(conversionRate(-1, 3)).toBe(0);
  });
});

describe("la phrase de synthèse", () => {
  const base = { phrase: "Ce mois-ci", teamSize: 6, opened: 14, demos: 5, activated: 2 };

  it("dit les trois chiffres, comme dans le cahier des charges", () => {
    expect(summarizeTeam(base)).toBe("Ce mois-ci, votre équipe de 6 commerciaux a ouvert 14 dossiers, réalisé 5 démonstrations et activé 2 officines.");
  });

  it("accorde le singulier", () => {
    expect(summarizeTeam({ ...base, opened: 1, demos: 1, activated: 1 })).toBe("Ce mois-ci, votre équipe de 6 commerciaux a ouvert 1 dossier, réalisé 1 démonstration et activé 1 officine.");
  });

  it("dit un zéro par « pas encore », sans l'écrire en chiffre", () => {
    expect(summarizeTeam({ ...base, activated: 0 })).toBe("Ce mois-ci, votre équipe de 6 commerciaux a ouvert 14 dossiers et réalisé 5 démonstrations, mais n'a pas encore activé d'officine.");
    expect(summarizeTeam({ ...base, demos: 0, activated: 0 })).toBe("Ce mois-ci, votre équipe de 6 commerciaux a ouvert 14 dossiers, mais n'a pas encore réalisé de démonstration ni activé d'officine.");
  });

  it("rien du tout : le dit, sans chiffre", () => {
    expect(summarizeTeam({ ...base, opened: 0, demos: 0, activated: 0 })).toBe("Ce mois-ci, votre équipe de 6 commerciaux n'a pas encore ouvert de dossier, réalisé de démonstration ni activé d'officine.");
  });

  it("un seul commercial : « votre commercial », pas « votre équipe de 1 commerciaux »", () => {
    expect(summarizeTeam({ ...base, teamSize: 1 })).toBe("Ce mois-ci, votre commercial a ouvert 14 dossiers, réalisé 5 démonstrations et activé 2 officines.");
  });

  it("aucun commercial actif : invite à en ajouter un, sans phrase de bilan", () => {
    expect(summarizeTeam({ ...base, teamSize: 0, opened: 0, demos: 0, activated: 0 })).toBe("Votre équipe n'a pas encore de commercial actif. Ajoutez le premier pour commencer.");
  });

  it("reprend le début de phrase de la période", () => {
    expect(summarizeTeam({ ...base, phrase: "Depuis le début de l'année" })).toMatch(/^Depuis le début de l'année, votre équipe/);
    expect(plain(summarizeTeam({ ...base, phrase: "Sur les 30 derniers jours", opened: 1200 }))).toContain("a ouvert 1 200 dossiers");
  });
});

describe("l'avancement d'un challenge en une phrase", () => {
  it("dit combien de commerciaux ont atteint l'objectif, au singulier comme au pluriel", () => {
    expect(describeReached(2, 6)).toBe("2 commerciaux sur 6 ont atteint l'objectif.");
    expect(describeReached(1, 6)).toBe("1 commercial sur 6 a atteint l'objectif.");
  });

  it("dit les cas limites en toutes lettres : personne, tout le monde, un seul, aucun participant", () => {
    expect(describeReached(0, 6)).toBe("Aucun des 6 commerciaux n'a encore atteint l'objectif.");
    expect(describeReached(6, 6)).toBe("Les 6 commerciaux ont tous atteint l'objectif.");
    expect(describeReached(0, 1)).toBe("Le commercial n'a pas encore atteint l'objectif.");
    expect(describeReached(1, 1)).toBe("Le commercial a atteint l'objectif.");
    expect(describeReached(0, 0)).toBe("Aucun commercial actif ne participe.");
  });
});

const member = (id: string, name: string, activated: number, contractsSigned: number, demos: number, opened = 0): TeamMemberStats => ({ salesRepId: id, name, activated, contractsSigned, demos, opened });

describe("le classement", () => {
  it("trie par activations, puis contrats signés, puis démonstrations", () => {
    const { ranked } = rankTeam([member("a", "Alice", 1, 5, 9), member("b", "Bruno", 2, 0, 0), member("c", "Chloé", 1, 6, 0), member("d", "David", 1, 5, 10)]);
    expect(ranked.map((m) => m.name)).toEqual(["Bruno", "Chloé", "David", "Alice"]);
    expect(ranked.map((m) => m.rank)).toEqual([1, 2, 3, 4]);
  });

  it("à égalité sur les trois critères : même rang, ordre alphabétique, rang suivant sauté", () => {
    const { ranked } = rankTeam([member("a", "Zoé", 1, 1, 1), member("b", "Alice", 1, 1, 1), member("c", "Marc", 0, 3, 0)]);
    expect(ranked.map((m) => [m.name, m.rank])).toEqual([["Alice", 1], ["Zoé", 1], ["Marc", 3]]);
  });

  it("l'ordre ne dépend pas de celui de l'entrée", () => {
    const input = [member("a", "Zoé", 1, 1, 1), member("b", "Alice", 1, 1, 1), member("c", "Marc", 0, 3, 0)];
    expect(rankTeam([...input].reverse()).ranked.map((m) => m.name)).toEqual(rankTeam(input).ranked.map((m) => m.name));
  });

  it("ne classe pas ceux qui n'ont rien enregistré : ils sont rendus à part, sans rang", () => {
    const { ranked, quiet } = rankTeam([member("a", "Alice", 0, 0, 0, 0), member("b", "Bruno", 0, 0, 0, 3), member("c", "Chloé", 0, 0, 0, 0)]);
    expect(ranked.map((m) => m.name)).toEqual(["Bruno"]);
    expect(quiet.map((m) => m.name)).toEqual(["Alice", "Chloé"]);
    expect(quiet[0]).not.toHaveProperty("rank");
  });

  it("une équipe vide donne deux listes vides", () => {
    expect(rankTeam([])).toEqual({ ranked: [], quiet: [] });
  });

  it("ne rend que des chiffres : aucune note, aucun score, aucune couleur de jugement", () => {
    const { ranked } = rankTeam([member("a", "Alice", 1, 1, 1, 1)]);
    expect(Object.keys(ranked[0]).sort()).toEqual(["activated", "contractsSigned", "demos", "name", "opened", "rank", "salesRepId"]);
  });
});

describe("l'activité récente", () => {
  it("nomme chaque type d'événement connu en quelques mots", () => {
    expect(describeProspectEvent("CREATED", {})).toBe("Dossier ouvert");
    expect(describeProspectEvent("CONTRACT_SIGNED", {})).toBe("Contrat signé");
    expect(describeProspectEvent("ASSIGNED", {})).toBe("Dossier réaffecté");
    expect(describeProspectEvent("TASK_DONE", {})).toBe("Relance faite");
  });

  it("une note : jamais son contenu", () => {
    expect(describeProspectEvent("NOTE", { texte: "Le titulaire part en retraite, appeler sa fille au 06 12 34 56 78" })).toBe("Note ajoutée");
  });

  it("un changement d'étape cite les deux étapes, libellées", () => {
    expect(describeProspectEvent("STATUS_CHANGED", { from: "CONTACTED", to: "DEMO_SCHEDULED" })).toBe("Étape : Contacté → Démo programmée");
    expect(describeProspectEvent("STATUS_CHANGED", { to: "ACTIVATED" })).toBe("Étape : Activé");
  });

  it("un changement d'étape sans étapes lisibles reste neutre : ni code interne, ni texte libre", () => {
    expect(describeProspectEvent("STATUS_CHANGED", {})).toBe("Étape du dossier modifiée");
    expect(describeProspectEvent("STATUS_CHANGED", null)).toBe("Étape du dossier modifiée");
    expect(describeProspectEvent("STATUS_CHANGED", { from: "toString", to: "<script>" })).toBe("Étape du dossier modifiée");
  });

  it("un type inconnu (ajouté demain) reste lisible", () => {
    expect(describeProspectEvent("QUELQUE_CHOSE_DE_NEUF", {})).toBe("Dossier mis à jour");
  });

  it("dit qui a agi sans jamais montrer un identifiant", () => {
    expect(describeEventActor("SALES", "Marie Dupont")).toBe("Marie Dupont");
    expect(describeEventActor("SALES", "  ")).toBe("Un commercial");
    expect(describeEventActor("SYSTEM", "PharmaBoost")).toBe("PharmaBoost");
    expect(describeEventActor("SIGNER", "Jean Titulaire")).toBe("L'officine");
    expect(describeEventActor("ADMIN", null)).toBe("L'équipe PharmaBoost");
    expect(describeEventActor("DIRECTOR", null)).toBe("Direction commerciale");
  });
});
