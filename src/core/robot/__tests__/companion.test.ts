import { describe, expect, it } from "vitest";
import {
  appCompanionAllowed,
  counterMoodLine,
  HERO_LINES,
  isDemoLink,
  parseCompanionMemory,
  robotGreeting,
  SITE_SECTION_IDS,
  siteCompanionAllowed,
  siteSectionReaction,
} from "../companion";

describe("le robot au centre : le compagnon du site", () => {
  it("réagit à chaque section qu'on lit, sans jamais sourire devant la sécurité", () => {
    expect(siteSectionReaction("banniere")).toEqual({ mood: "curious", line: "Regardez, c'est moi au comptoir !" });
    expect(siteSectionReaction("questions")?.mood).toBe("thinking");
    expect(siteSectionReaction("securite")?.mood).toBe("concerned");
    expect(siteSectionReaction("tarif")).toEqual({ mood: "happy", line: "Faites le calcul !" });
    expect(siteSectionReaction("inconnue")).toBeNull();
    expect(siteSectionReaction(null)).toBeNull();
  });

  it("des phrases courtes, et aucune promesse chiffrée", () => {
    for (const id of SITE_SECTION_IDS) {
      const line = siteSectionReaction(id)?.line;
      if (!line) continue;
      expect(line.length).toBeLessThanOrEqual(48);
      expect(line).not.toMatch(/\d|€|%/);
    }
    for (const line of HERO_LINES) expect(line).not.toMatch(/\d|€|%/);
  });

  it("reconnaît un lien « Réserver une démo », où qu'il pointe", () => {
    expect(isDemoLink("/decouvrir/demo")).toBe(true);
    expect(isDemoLink("/decouvrir/demo/")).toBe(true);
    expect(isDemoLink("https://pharmaboost.app/decouvrir/demo?source=accueil")).toBe(true);
    expect(isDemoLink("/decouvrir/demonstration")).toBe(false);
    expect(isDemoLink("/decouvrir#tarif")).toBe(false);
    expect(isDemoLink(null)).toBe(false);
  });

  it("s'efface sur téléphone dans les pages à formulaire, jamais sur ordinateur", () => {
    expect(siteCompanionAllowed("/decouvrir/demo", true)).toBe(false);
    expect(siteCompanionAllowed("/decouvrir/abonnement", true)).toBe(false);
    expect(siteCompanionAllowed("/decouvrir", true)).toBe(true);
    expect(siteCompanionAllowed("/decouvrir/demo", false)).toBe(true);
  });

  it("lit sa mémoire de visite sans se tromper sur un contenu abîmé", () => {
    expect(parseCompanionMemory('{"minimised":true,"said":["banniere",3]}')).toEqual({ minimised: true, said: ["banniere"] });
    expect(parseCompanionMemory("pas du json")).toEqual({ minimised: false, said: [] });
    expect(parseCompanionMemory(null)).toEqual({ minimised: false, said: [] });
  });
});

describe("le robot au centre : le logiciel", () => {
  it("dit bonjour par le prénom selon l'heure", () => {
    expect(robotGreeting(9, "Paul")).toBe("Bonjour Paul !");
    expect(robotGreeting(17, "Paul")).toBe("Bonjour Paul !");
    expect(robotGreeting(18, "Paul")).toBe("Bonsoir Paul !");
    expect(robotGreeting(2, "Paul")).toBe("Bonsoir Paul !");
    expect(robotGreeting(4, "  ")).toBe("Bonjour !");
    expect(robotGreeting(20, null)).toBe("Bonsoir !");
  });

  it("le compagnon ne se pose ni sur l'écran de vente ni sur « Nouvelle vente »", () => {
    expect(appCompanionAllowed("/vente/nouvelle")).toBe(false);
    expect(appCompanionAllowed("/vente/cmabc123")).toBe(false);
    expect(appCompanionAllowed("/")).toBe(false);
    expect(appCompanionAllowed("/vente/cmabc123/fin")).toBe(true);
    expect(appCompanionAllowed("/stock")).toBe(true);
    expect(appCompanionAllowed("/equipe")).toBe(true);
  });

  it("sans phrase utile, il dit seulement ce qu'il fait", () => {
    expect(counterMoodLine("idle")).toContain("prochain scan");
    expect(counterMoodLine("thinking")).toContain("cherche");
    expect(counterMoodLine("concerned")).not.toMatch(/bravo/i);
  });
});
