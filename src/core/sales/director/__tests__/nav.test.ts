import { describe, expect, it } from "vitest";
import { DIRECTOR_HOME, DIRECTOR_LOGIN, DIRECTOR_NAV, activeDirectorNavItem, isDirectorNavActive } from "../nav";

describe("le menu du directeur", () => {
  it("compte six rubriques, dans l'ordre promis à toute l'équipe", () => {
    expect(DIRECTOR_NAV.map((item) => item.label)).toEqual(["Tableau de bord", "Commerciaux", "Candidatures", "Commissions", "Factures", "Challenges"]);
    expect(DIRECTOR_NAV.map((item) => item.href)).toEqual(["/directeur", "/directeur/commerciaux", "/directeur/candidatures", "/directeur/commissions", "/directeur/factures", "/directeur/challenges"]);
  });

  it("ne renvoie que dans l'espace du directeur : aucun lien vers la console ni vers l'extranet", () => {
    for (const item of DIRECTOR_NAV) {
      expect(item.href.startsWith("/directeur")).toBe(true);
      expect(item.href).not.toMatch(/^\/(admin|extranet)/);
      expect(item.description.length).toBeGreaterThan(10);
    }
    expect(DIRECTOR_HOME).toBe("/directeur");
    expect(DIRECTOR_LOGIN).toBe("/directeur/connexion");
  });

  it("n'a ni clé ni adresse en double", () => {
    expect(new Set(DIRECTOR_NAV.map((item) => item.key)).size).toBe(DIRECTOR_NAV.length);
    expect(new Set(DIRECTOR_NAV.map((item) => item.href)).size).toBe(DIRECTOR_NAV.length);
  });
});

describe("la rubrique courante", () => {
  const key = (pathname: string) => activeDirectorNavItem(pathname)?.key ?? null;

  it("la racine n'est que le tableau de bord : elle ne se rattache pas à toutes les pages", () => {
    expect(key("/directeur")).toBe("tableau-de-bord");
    expect(key("/directeur/")).toBe("tableau-de-bord");
    expect(key("/directeur/commerciaux")).toBe("commerciaux");
  });

  it("les pages de détail et de création restent dans leur rubrique", () => {
    expect(key("/directeur/commerciaux/nouveau")).toBe("commerciaux");
    expect(key("/directeur/commerciaux/ckx1")).toBe("commerciaux");
    expect(key("/directeur/candidatures/abc")).toBe("candidatures");
    expect(key("/directeur/factures/nouvelle")).toBe("factures");
    expect(key("/directeur/challenges/nouveau")).toBe("challenges");
    expect(key("/directeur/commissions")).toBe("commissions");
  });

  it("ignore la chaîne de requête, l'ancre et la barre finale", () => {
    expect(key("/directeur?periode=annee")).toBe("tableau-de-bord");
    expect(key("/directeur/factures/?statut=PAID#haut")).toBe("factures");
  });

  it("le préfixe s'arrête à une frontière de segment", () => {
    expect(key("/directeur/commerciauxx")).toBeNull();
    expect(key("/directeur/facturesbis/1")).toBeNull();
  });

  it("hors du menu : aucune rubrique (ni la console, ni l'extranet)", () => {
    expect(key("/admin")).toBeNull();
    expect(key("/extranet/commissions")).toBeNull();
    expect(key("/directeur/connexion")).toBeNull();
    expect(isDirectorNavActive(DIRECTOR_NAV[0], "/directeur/commerciaux")).toBe(false);
  });
});
