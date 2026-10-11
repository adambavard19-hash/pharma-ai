import { describe, expect, it } from "vitest";
import { leavesApp } from "../native-app";

const ORIGIN = "https://pharmaboost.app";

describe("dans l'application iPhone, ce qui s'ouvre dans Safari", () => {
  it("reste dans l'application : tout ce qui est sous /m", () => {
    for (const href of ["/m", "/m/formations", "/m/challenges?onglet=equipe", `${ORIGIN}/m/moi`]) expect(leavesApp(href, ORIGIN)).toBe(false);
  });

  it("part dans Safari : le site, la confidentialité, le mot de passe oublié, un autre site", () => {
    for (const href of ["/decouvrir", "/decouvrir/confidentialite", "/login/oubli", "/mentions", "https://www.ansm.sante.fr/"]) expect(leavesApp(href, ORIGIN)).toBe(true);
  });

  it("une adresse qui commence seulement par « m » n'est pas l'application", () => {
    expect(leavesApp("/mentions-legales", ORIGIN)).toBe(true);
  });

  it("laisse au téléphone les liens e-mail et téléphone", () => {
    expect(leavesApp("mailto:contact@pharmaboost.app", ORIGIN)).toBe(false);
    expect(leavesApp("tel:0400000000", ORIGIN)).toBe(false);
  });
});
