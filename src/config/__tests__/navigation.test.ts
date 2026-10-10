import { describe, expect, it } from "vitest";
import { Megaphone } from "lucide-react";
import { NAVIGATION, NAV_GROUPS, OFF_MENU_DESTINATIONS, groupNavigation, isNavItemActive } from "../navigation";
import { PERMISSIONS, ROLE_PERMISSIONS, type Role } from "@/server/rbac/permissions";

/** Le menu que voit chaque rôle : exactement les entrées dont il détient la permission, comme le fait la barre latérale. */
const visibleFor = (role: Role) => NAVIGATION.filter((item) => ROLE_PERMISSIONS[role].includes(item.permission));
const menuOf = (role: Role) => visibleFor(role).map((item) => item.label);
const TEAM_ROLES = ["PHARMACIST", "TECHNICIAN", "STUDENT", "VIEWER"] as const;

describe("le menu, en quatre groupes", () => {
  it("« Nouvelle vente » d'abord, puis Au comptoir, Ma pharmacie, Découvrir, Configuration", () => {
    expect(NAVIGATION[0]).toMatchObject({ label: "Nouvelle vente", href: "/vente/nouvelle", primary: true });
    expect(NAVIGATION[0].group).toBeUndefined();
    expect(NAV_GROUPS.map((group) => group.label)).toEqual(["Au comptoir", "Ma pharmacie", "Découvrir", "Configuration"]);
  });

  it("chaque groupe contient les entrées prévues, dans cet ordre", () => {
    const labels = (key: string) => NAVIGATION.filter((item) => item.group === key).map((item) => item.label);
    expect(labels("comptoir")).toEqual(["Patients", "Suivis patients", "Réglementation"]);
    expect(labels("pharmacie")).toEqual(["Mon stock", "Performances", "Mon assortiment", "Mes associations", "Mon équipe"]);
    expect(labels("decouvrir")).toEqual(["Formations", "Partenaires", "Actualités"]);
    expect(labels("configuration")).toEqual(["Mes comptoirs", "Paramètres"]);
  });

  it("l'ordre du tableau est celui de l'écran : les groupes se suivent sans se mélanger", () => {
    const order = NAVIGATION.filter((item) => item.group).map((item) => item.group);
    const compressed = order.filter((group, index) => group !== order[index - 1]);
    expect(compressed).toEqual(NAV_GROUPS.map((group) => group.key));
  });

  it("aucune adresse en double, aucune entrée sans groupe hors l'action principale", () => {
    expect(new Set(NAVIGATION.map((item) => item.href)).size).toBe(NAVIGATION.length);
    expect(NAVIGATION.filter((item) => !item.group && !item.primary)).toEqual([]);
  });

  it("rien n'a été retiré : toutes les adresses d'avant sont encore au menu ou atteignables", () => {
    const hrefs = new Set(NAVIGATION.map((item) => item.href));
    for (const href of ["/vente/nouvelle", "/patients", "/connexion", "/stock", "/reglementation", "/formation", "/partenaires", "/nouveautes", "/assortiment", "/suivis", "/equipe", "/pilotage", "/parametres"]) {
      expect(hrefs.has(href), href).toBe(true);
    }
    // « Ce que PharmaBoost vous rapporte » a quitté le menu : on y va depuis Performances (qui s'ouvre sur « Mon équipe »), et l'entrée s'allume pour elle.
    const performances = NAVIGATION.find((item) => item.label === "Performances");
    if (!performances) throw new Error("entrée absente");
    expect(isNavItemActive(performances, "/resultats")).toBe(true);
    expect(OFF_MENU_DESTINATIONS.some((destination) => destination.href === "/resultats")).toBe(true);
  });
});

describe("le menu de chaque rôle : un groupe sans entrée visible n'est pas affiché", () => {
  it("le titulaire voit les quatre groupes", () => {
    expect(groupNavigation(visibleFor("OWNER")).map((group) => group.label)).toEqual(["Au comptoir", "Ma pharmacie", "Découvrir", "Configuration"]);
  });

  it("l'équipe au comptoir ne voit aucune entrée de gestion : ni Performances, ni assortiment, ni équipe, ni partenaires, ni actualités, ni connexions, ni paramètres", () => {
    for (const role of TEAM_ROLES) {
      const menu = menuOf(role);
      for (const gone of ["Performances", "Mon assortiment", "Mon équipe", "Partenaires", "Actualités", "Mes comptoirs", "Paramètres"]) {
        expect(menu, `${role} : ${gone}`).not.toContain(gone);
      }
    }
  });

  it("le groupe Configuration disparaît entièrement pour qui n'a ni connexions ni paramètres", () => {
    for (const role of TEAM_ROLES) {
      expect(groupNavigation(visibleFor(role)).map((group) => group.key), role).not.toContain("configuration");
    }
  });

  it("le pharmacien garde le comptoir, le stock et les formations", () => {
    const menu = menuOf("PHARMACIST");
    for (const kept of ["Nouvelle vente", "Patients", "Suivis patients", "Mon stock", "Formations"]) expect(menu).toContain(kept);
  });

  it("les entrées du titulaire restent gardées par des permissions qu'aucun rôle de l'équipe ne détient", () => {
    for (const role of TEAM_ROLES) {
      expect(ROLE_PERMISSIONS[role]).not.toContain(PERMISSIONS.PARTNERS_MANAGE);
      expect(ROLE_PERMISSIONS[role]).not.toContain(PERMISSIONS.NEWS_MANAGE);
      expect(ROLE_PERMISSIONS[role]).not.toContain(PERMISSIONS.TEAM_MANAGE);
      expect(ROLE_PERMISSIONS[role]).not.toContain(PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE);
    }
  });
});

describe("les intitulés", () => {
  it("« Actualités » (ex-Nouveautés) garde l'icône, la permission et l'adresse", () => {
    const entry = NAVIGATION.find((item) => item.href === "/nouveautes");
    expect(entry).toMatchObject({ label: "Actualités", icon: Megaphone, permission: PERMISSIONS.NEWS_MANAGE, match: ["/nouveautes"], group: "decouvrir" });
  });

  it("les nouveaux intitulés : Mon stock, Mon équipe, Mon assortiment, Mes comptoirs, Suivis patients, Formations, Performances", () => {
    const byHref = (href: string) => NAVIGATION.find((item) => item.href === href)?.label;
    expect(byHref("/stock")).toBe("Mon stock");
    expect(byHref("/equipe")).toBe("Mon équipe");
    expect(byHref("/assortiment")).toBe("Mon assortiment");
    expect(byHref("/connexion")).toBe("Mes comptoirs");
    expect(byHref("/suivis")).toBe("Suivis patients");
    expect(byHref("/formation")).toBe("Formations");
    expect(byHref("/pilotage")).toBe("Performances");
  });
});

describe("l'entrée « Performances » (ex « Ce que ça rapporte » et « Pilotage »)", () => {
  const entry = NAVIGATION.find((item) => item.href === "/pilotage");

  it("garde la permission de titulaire des deux anciennes entrées", () => {
    expect(entry?.permission).toBe(PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE);
    expect(menuOf("OWNER")).toContain("Performances");
  });

  it("s'allume sur les deux pages, et sur les adresses du pilotage", () => {
    if (!entry) throw new Error("entrée absente");
    for (const path of ["/resultats", "/resultats/archives", "/pilotage", "/performance", "/analytics", "/ventes"]) expect(isNavItemActive(entry, path), path).toBe(true);
  });

  it("ne déborde pas sur une adresse voisine ni sur la vente", () => {
    if (!entry) throw new Error("entrée absente");
    expect(isNavItemActive(entry, "/resultats-anciens")).toBe(false);
    expect(isNavItemActive(entry, "/vente/nouvelle")).toBe(false);
    expect(isNavItemActive(entry, "/stock")).toBe(false);
  });
});

describe("reste active sur sa page et ses sous-adresses, sans déborder", () => {
  it("Mon stock couvre /stock et ses sous-pages (mise à jour, qualité du catalogue), pas /stocks-autres", () => {
    const entry = NAVIGATION.find((item) => item.href === "/stock");
    if (!entry) throw new Error("entrée absente");
    expect(isNavItemActive(entry, "/stock")).toBe(true);
    expect(isNavItemActive(entry, "/stock/mise-a-jour")).toBe(true);
    expect(isNavItemActive(entry, "/stock/qualite")).toBe(true);
    expect(isNavItemActive(entry, "/stock-autre")).toBe(false);
  });

  it("Mes comptoirs couvre /connexion et son guide", () => {
    const entry = NAVIGATION.find((item) => item.href === "/connexion");
    if (!entry) throw new Error("entrée absente");
    expect(isNavItemActive(entry, "/connexion/guide")).toBe(true);
    expect(isNavItemActive(entry, "/installation")).toBe(true);
  });

  it("Actualités ne s'allume pas sur Partenaires", () => {
    const entry = NAVIGATION.find((item) => item.href === "/nouveautes");
    if (!entry) throw new Error("entrée absente");
    expect(isNavItemActive(entry, "/nouveautes/archives")).toBe(true);
    expect(isNavItemActive(entry, "/nouveautes-patients")).toBe(false);
    expect(isNavItemActive(entry, "/partenaires")).toBe(false);
  });
});
