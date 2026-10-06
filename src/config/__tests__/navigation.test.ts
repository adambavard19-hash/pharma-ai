import { describe, expect, it } from "vitest";
import { Megaphone, Sparkles } from "lucide-react";
import { NAVIGATION, isNavItemActive } from "../navigation";
import { PERMISSIONS, ROLE_PERMISSIONS, type Role } from "@/server/rbac/permissions";

/** Le menu que voit chaque rôle : exactement les entrées dont il détient la permission, comme le fait la barre latérale. */
const menuOf = (role: Role) => NAVIGATION.filter((item) => ROLE_PERMISSIONS[role].includes(item.permission)).map((item) => item.label);

describe("l'entrée « Nouveautés »", () => {
  const entry = NAVIGATION.find((item) => item.href === "/nouveautes");

  it("existe, avec l'icône Megaphone et la permission d'annoncer aux patients", () => {
    expect(entry).toBeDefined();
    expect(entry).toMatchObject({ label: "Nouveautés", icon: Megaphone, permission: PERMISSIONS.NEWS_MANAGE, match: ["/nouveautes"] });
    expect(entry?.primary).toBeUndefined();
  });

  it("se place avec les entrées du titulaire, juste après Partenaires", () => {
    const labels = NAVIGATION.map((item) => item.label);
    expect(labels.indexOf("Nouveautés")).toBe(labels.indexOf("Partenaires") + 1);
  });

  it("n'apparaît que pour le titulaire : ni le pharmacien, ni le préparateur, ni l'étudiant, ni la consultation", () => {
    expect(menuOf("OWNER")).toContain("Nouveautés");
    for (const role of ["PHARMACIST", "TECHNICIAN", "STUDENT", "VIEWER"] as const) expect(menuOf(role)).not.toContain("Nouveautés");
  });

  it("reste active sur la page et ses sous-adresses, sans déborder sur une adresse voisine", () => {
    if (!entry) throw new Error("entrée absente");
    expect(isNavItemActive(entry, "/nouveautes")).toBe(true);
    expect(isNavItemActive(entry, "/nouveautes/archives")).toBe(true);
    expect(isNavItemActive(entry, "/nouveautes-patients")).toBe(false);
    expect(isNavItemActive(entry, "/partenaires")).toBe(false);
  });

  it("n'ajoute aucune adresse en double au menu", () => {
    expect(new Set(NAVIGATION.map((item) => item.href)).size).toBe(NAVIGATION.length);
  });
});

describe("l'entrée « Assortiment » (les besoins que le stock n'a pas couverts)", () => {
  const entry = NAVIGATION.find((item) => item.href === "/assortiment");

  it("existe, avec la permission des partenaires : une décision du titulaire", () => {
    expect(entry).toMatchObject({ label: "Assortiment", permission: PERMISSIONS.PARTNERS_MANAGE, match: ["/assortiment"] });
  });

  it("n'apparaît que pour le titulaire : jamais dans le menu de l'équipe au comptoir", () => {
    expect(menuOf("OWNER")).toContain("Assortiment");
    for (const role of ["PHARMACIST", "TECHNICIAN", "STUDENT", "VIEWER"] as const) expect(menuOf(role)).not.toContain("Assortiment");
  });

  it("la permission qui la garde n'est détenue par aucun rôle de l'équipe", () => {
    for (const role of ["PHARMACIST", "TECHNICIAN", "STUDENT", "VIEWER"] as const) expect(ROLE_PERMISSIONS[role]).not.toContain(PERMISSIONS.PARTNERS_MANAGE);
  });
});

describe("l'entrée « Ce que ça rapporte » (la valeur mesurée des conseils)", () => {
  const entry = NAVIGATION.find((item) => item.href === "/resultats");

  it("existe, avec l'icône Sparkles et la permission de Pilotage : la valeur chiffrée est une vue de titulaire", () => {
    expect(entry).toMatchObject({
      label: "Ce que ça rapporte",
      icon: Sparkles,
      permission: PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE,
      match: ["/resultats"],
      description: "Les ventes confirmées issues des conseils PharmaBoost",
    });
    expect(entry?.primary).toBeUndefined();
  });

  it("se place juste avant Pilotage", () => {
    const labels = NAVIGATION.map((item) => item.label);
    expect(labels.indexOf("Ce que ça rapporte")).toBe(labels.indexOf("Pilotage") - 1);
  });

  it("n'apparaît que pour le titulaire : ni le pharmacien, ni le préparateur, ni l'étudiant, ni la consultation", () => {
    expect(menuOf("OWNER")).toContain("Ce que ça rapporte");
    for (const role of ["PHARMACIST", "TECHNICIAN", "STUDENT", "VIEWER"] as const) expect(menuOf(role)).not.toContain("Ce que ça rapporte");
  });

  it("reste active sur la page et ses sous-adresses, sans déborder sur Pilotage ni sur une adresse voisine", () => {
    if (!entry) throw new Error("entrée absente");
    expect(isNavItemActive(entry, "/resultats")).toBe(true);
    expect(isNavItemActive(entry, "/resultats/archives")).toBe(true);
    expect(isNavItemActive(entry, "/resultats-anciens")).toBe(false);
    expect(isNavItemActive(entry, "/pilotage")).toBe(false);
  });

  it("Pilotage ne s'allume pas sur cette page : les deux entrées restent distinctes", () => {
    const pilotage = NAVIGATION.find((item) => item.href === "/pilotage");
    if (!pilotage) throw new Error("entrée absente");
    expect(isNavItemActive(pilotage, "/resultats")).toBe(false);
  });
});
