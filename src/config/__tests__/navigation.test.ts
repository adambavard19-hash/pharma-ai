import { describe, expect, it } from "vitest";
import { Megaphone } from "lucide-react";
import { COLLABORATOR_MENU, NAVIGATION, NAV_GROUPS, OFF_MENU_DESTINATIONS, groupNavigation, isNavItemActive, navigationFor } from "../navigation";
import { PERMISSIONS, ROLE_PERMISSIONS, resolvePermissions, type Role } from "@/server/rbac/permissions";

/** Le menu que voit chaque rôle : exactement les entrées dont il détient la permission, comme le fait la barre latérale. */
const visibleFor = (role: Role) => NAVIGATION.filter((item) => ROLE_PERMISSIONS[role].includes(item.permission));
const menuOf = (role: Role) => visibleFor(role).map((item) => item.label);
const TEAM_ROLES = ["PHARMACIST", "TECHNICIAN", "STUDENT", "VIEWER"] as const;

describe("le menu, en trois groupes", () => {
  it("« Au comptoir » (l'action principale) d'abord, puis les groupes Ma pharmacie, Découvrir, Configuration", () => {
    expect(NAVIGATION[0]).toMatchObject({ label: "Au comptoir", href: "/vente/nouvelle", primary: true });
    expect(NAVIGATION[0].group).toBeUndefined();
    expect(NAV_GROUPS.map((group) => group.label)).toEqual(["Ma pharmacie", "Découvrir", "Configuration"]);
  });

  it("« Mes associations » vient tout de suite après « Au comptoir » (rubrique importante)", () => {
    expect(NAVIGATION.slice(0, 2).map((item) => item.label)).toEqual(["Au comptoir", "Mes associations"]);
    expect(menuOf("OWNER").slice(0, 2)).toEqual(["Au comptoir", "Mes associations"]);
    expect(menuOf("PHARMACIST").slice(0, 2)).toEqual(["Au comptoir", "Mes associations"]);
  });

  it("jamais deux fois le même nom : aucun groupe ne porte le nom d'une entrée", () => {
    const labels = new Set(NAVIGATION.map((item) => item.label));
    for (const group of NAV_GROUPS) expect(labels.has(group.label), group.label).toBe(false);
    expect(new Set(NAVIGATION.map((item) => item.label)).size).toBe(NAVIGATION.length);
  });

  it("chaque entrée dit en une phrase ce qu'il y a derrière (montrée au survol)", () => {
    for (const item of NAVIGATION) {
      expect(item.description.length, item.label).toBeGreaterThan(20);
      expect(item.description, item.label).not.toMatch(/assortiment/i);
    }
  });

  it("chaque groupe contient les entrées prévues, dans cet ordre", () => {
    const labels = (key: string) => NAVIGATION.filter((item) => item.group === key).map((item) => item.label);
    expect(labels("pharmacie")).toEqual(["Mes associations", "Mon stock", "Performances", "Mon équipe", "E-mails aux patients", "Laboratoires & gammes", "Produits manquants"]);
    expect(labels("decouvrir")).toEqual(["Formations", "Partenaires", "Actualités"]);
    expect(labels("configuration")).toEqual(["Paramètres"]);
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
    for (const href of ["/vente/nouvelle", "/stock", "/formation", "/partenaires", "/nouveautes", "/assortiment", "/equipe", "/pilotage", "/parametres"]) {
      expect(hrefs.has(href), href).toBe(true);
    }
    // Patients et Suivis ont quitté le menu (retour du fondateur du 13 oct. 2026) mais restent atteignables ; « Mes comptoirs »
    // est devenu l'onglet « Postes du comptoir » de Paramètres.
    const offMenu = new Set(OFF_MENU_DESTINATIONS.map((destination) => destination.href));
    for (const href of ["/patients", "/suivis", "/parametres/postes", "/reglementation"]) expect(offMenu.has(href), href).toBe(true);
    for (const href of ["/patients", "/suivis", "/connexion", "/reglementation"]) expect(hrefs.has(href), href).toBe(false);
    // « Ce que PharmaBoost vous rapporte » a quitté le menu : on y va depuis Performances (qui s'ouvre sur « Mon équipe »), et l'entrée s'allume pour elle.
    const performances = NAVIGATION.find((item) => item.label === "Performances");
    if (!performances) throw new Error("entrée absente");
    expect(isNavItemActive(performances, "/resultats")).toBe(true);
    expect(OFF_MENU_DESTINATIONS.some((destination) => destination.href === "/resultats")).toBe(true);
  });
});

/** Le menu d'un collaborateur, mot pour mot (consigne du fondateur du 13 oct. 2026) ; « Contact support » est le lien du bas, hors tableau. */
const COLLABORATOR_LABELS = ["Au comptoir", "Mes associations", "E-mails aux patients", "Formations", "Partenaires", "Actualités"];

describe("le menu de chaque rôle : un groupe sans entrée visible n'est pas affiché", () => {
  it("le titulaire voit les trois groupes et tout son menu, inchangé", () => {
    expect(groupNavigation(visibleFor("OWNER")).map((group) => group.label)).toEqual(["Ma pharmacie", "Découvrir", "Configuration"]);
    expect(menuOf("OWNER")).toEqual(["Au comptoir", "Mes associations", "Mon stock", "Performances", "Mon équipe", "E-mails aux patients", "Laboratoires & gammes", "Produits manquants", "Formations", "Partenaires", "Actualités", "Paramètres"]);
    expect(navigationFor(resolvePermissions("OWNER")).map((item) => item.label)).toEqual(menuOf("OWNER"));
  });

  it("pharmacien, préparateur et étudiant : exactement Au comptoir, Mes associations, E-mails aux patients et Découvrir (Formations, Partenaires, Actualités)", () => {
    for (const role of ["PHARMACIST", "TECHNICIAN", "STUDENT"] as const) {
      expect(menuOf(role), role).toEqual(COLLABORATOR_LABELS);
      expect(groupNavigation(visibleFor(role)).map((group) => group.label), role).toEqual(["Ma pharmacie", "Découvrir"]);
    }
  });

  it("le rôle « Consultation » (lecture seule, il ne vend pas) n'a que la part lisible du même menu : ni comptoir ni bilans", () => {
    expect(menuOf("VIEWER")).toEqual(["Mes associations", "Formations", "Partenaires", "Actualités"]);
  });

  it("la liste blanche du collaborateur est explicite, et le filtre par permission du menu (barre latérale) y aboutit pour chaque rôle", () => {
    expect(NAVIGATION.filter((item) => COLLABORATOR_MENU.includes(item.href)).map((item) => item.label)).toEqual(COLLABORATOR_LABELS);
    for (const role of TEAM_ROLES) {
      const viaWhitelist = navigationFor(resolvePermissions(role)).map((item) => item.label);
      expect(menuOf(role), role).toEqual(viaWhitelist);
      for (const label of menuOf(role)) expect(COLLABORATOR_LABELS, `${role} : ${label}`).toContain(label);
    }
  });

  it("une permission de gestion accordée individuellement n'ajoute pas d'entrée hors de la liste blanche", () => {
    const granted = resolvePermissions("TECHNICIAN", [PERMISSIONS.LAB_PROGRAMS_MANAGE, PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.TEAM_MANAGE]);
    expect(navigationFor(granted).map((item) => item.label)).toEqual(COLLABORATOR_LABELS);
  });

  it("toute entrée hors du menu collaborateur est gardée par une permission qu'aucun rôle de l'équipe ne détient", () => {
    for (const item of NAVIGATION.filter((entry) => !COLLABORATOR_MENU.includes(entry.href))) {
      for (const role of TEAM_ROLES) expect(ROLE_PERMISSIONS[role], `${role} : ${item.label}`).not.toContain(item.permission);
    }
  });

  it("l'équipe au comptoir ne voit aucune entrée de gestion : ni Mon stock, ni Performances, ni Mon équipe, ni Laboratoires & gammes, ni Produits manquants, ni Paramètres", () => {
    for (const role of TEAM_ROLES) {
      const menu = menuOf(role);
      for (const gone of ["Mon stock", "Performances", "Produits manquants", "Mon équipe", "Laboratoires & gammes", "Paramètres"]) {
        expect(menu, `${role} : ${gone}`).not.toContain(gone);
      }
    }
  });

  it("le groupe Configuration disparaît entièrement pour qui n'a ni connexions ni paramètres", () => {
    for (const role of TEAM_ROLES) {
      expect(groupNavigation(visibleFor(role)).map((group) => group.key), role).not.toContain("configuration");
    }
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
    // Lisible par l'équipe (NEWS_VIEW) ; l'envoi reste NEWS_MANAGE, côté serveur.
    expect(entry).toMatchObject({ label: "Actualités", icon: Megaphone, permission: PERMISSIONS.NEWS_VIEW, match: ["/nouveautes"], group: "decouvrir" });
  });

  it("les intitulés : Mon stock, Mon équipe, Produits manquants (ex Mon assortiment), E-mails aux patients, Formations, Performances", () => {
    const byHref = (href: string) => NAVIGATION.find((item) => item.href === href)?.label;
    expect(byHref("/stock")).toBe("Mon stock");
    expect(byHref("/equipe")).toBe("Mon équipe");
    expect(byHref("/assortiment")).toBe("Produits manquants");
    expect(byHref("/emails-patients")).toBe("E-mails aux patients");
    expect(byHref("/formation")).toBe("Formations");
    expect(byHref("/pilotage")).toBe("Performances");
  });

  it("« E-mails aux patients » s'ouvre à l'équipe (ses propres bilans), « Produits manquants » reste une vue de titulaire", () => {
    expect(NAVIGATION.find((item) => item.href === "/emails-patients")?.permission).toBe(PERMISSIONS.PATIENT_EMAILS_VIEW);
    expect(NAVIGATION.find((item) => item.href === "/assortiment")?.permission).toBe(PERMISSIONS.PARTNERS_MANAGE);
    expect(menuOf("OWNER")).toEqual(expect.arrayContaining(["E-mails aux patients", "Produits manquants"]));
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

  it("Paramètres couvre l'onglet « Postes du comptoir », pas « Laboratoires & gammes »", () => {
    const entry = NAVIGATION.find((item) => item.href === "/parametres");
    if (!entry) throw new Error("entrée absente");
    expect(isNavItemActive(entry, "/parametres/postes")).toBe(true);
    expect(isNavItemActive(entry, "/parametres/laboratoires/gammes")).toBe(false);
  });

  it("Actualités ne s'allume pas sur Partenaires", () => {
    const entry = NAVIGATION.find((item) => item.href === "/nouveautes");
    if (!entry) throw new Error("entrée absente");
    expect(isNavItemActive(entry, "/nouveautes/archives")).toBe(true);
    expect(isNavItemActive(entry, "/nouveautes-patients")).toBe(false);
    expect(isNavItemActive(entry, "/partenaires")).toBe(false);
  });
});
