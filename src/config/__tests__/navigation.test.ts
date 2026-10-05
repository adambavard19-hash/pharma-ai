import { describe, expect, it } from "vitest";
import { Megaphone } from "lucide-react";
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
