import { describe, expect, it } from "vitest";
import { adviceAnchor, adviceIdFromHash, isLinkId, saleAdvicePath, saleAdviceUrl } from "../sale-link";

/**
 * Un conseil de la bannière se lit en entier d'un clic : la page de la vente, dépliée sur ce conseil. L'adresse n'a
 * qu'une forme ; l'agent n'ouvre qu'elle, sur SON serveur, réécrite à partir des seuls identifiants reconnus.
 */

const SALE = "cmg1vente0001abcd";
const ADVICE = "cmg1conseil002xyz";
const SERVER = "https://pharmaboost.app";

describe("l'adresse d'un conseil", () => {
  it("la page de la vente, le conseil en paramètre (le serveur le déplie) et en ancre (la page y descend)", () => {
    expect(saleAdvicePath(SALE, ADVICE)).toBe(`/vente/${SALE}?conseil=${ADVICE}#conseil-${ADVICE}`);
    expect(saleAdvicePath(SALE)).toBe(`/vente/${SALE}`);
    expect(adviceAnchor(ADVICE)).toBe(`conseil-${ADVICE}`);
  });

  it("un identifiant douteux ne fait pas de lien (rien qui sorte du chemin ni ne se lise comme une commande)", () => {
    for (const bad of ["", "../admin", "a b", "a&b", "a#b", "a?b", "x".repeat(65), "vente/1", "é"]) {
      expect(saleAdvicePath(bad, ADVICE), bad).toBeNull();
      if (bad) expect(saleAdvicePath(SALE, bad), bad).toBeNull();
    }
    expect(isLinkId(42)).toBe(false);
  });

  it("l'ancre de la page redonne le conseil ; toute autre ancre, rien", () => {
    expect(adviceIdFromHash(`#conseil-${ADVICE}`)).toBe(ADVICE);
    for (const hash of ["", "#", "#zone-conseils", `#conseil-${ADVICE}&x`, "#conseil-", null, undefined]) expect(adviceIdFromHash(hash)).toBeNull();
  });
});

describe("ce que l'agent accepte d'ouvrir dans le navigateur du PC", () => {
  const link = `${SERVER}/vente/${SALE}?conseil=${ADVICE}#conseil-${ADVICE}`;

  it("la page d'une vente sur SON serveur, réécrite à l'identique", () => {
    expect(saleAdviceUrl(SERVER, link)).toBe(link);
    expect(saleAdviceUrl(`${SERVER}/`, link)).toBe(link);
    // Paramètre seul, ancre seule, ou la vente seule : la même forme, complétée.
    expect(saleAdviceUrl(SERVER, `${SERVER}/vente/${SALE}?conseil=${ADVICE}`)).toBe(link);
    expect(saleAdviceUrl(SERVER, `${SERVER}/vente/${SALE}#conseil-${ADVICE}`)).toBe(link);
    expect(saleAdviceUrl(SERVER, `${SERVER}/vente/${SALE}`)).toBe(`${SERVER}/vente/${SALE}`);
    // Le poste de développement.
    expect(saleAdviceUrl("http://localhost:3000", `http://localhost:3000/vente/${SALE}?conseil=${ADVICE}`)).toBe(`http://localhost:3000/vente/${SALE}?conseil=${ADVICE}#conseil-${ADVICE}`);
  });

  it("refuse tout le reste : autre serveur, autre port, autre protocole, autre page, identifiants, paramètres en plus", () => {
    const refused = [
      `https://pharmaboost.app.evil.fr/vente/${SALE}`,
      `https://evil.fr/vente/${SALE}`,
      `https://pharmaboost.app:8443/vente/${SALE}`,
      `http://pharmaboost.app/vente/${SALE}`,
      `https://user:pass@pharmaboost.app/vente/${SALE}`,
      `${SERVER}/admin`,
      `${SERVER}/vente/${SALE}/fin`,
      `${SERVER}/vente/../admin`,
      `${SERVER}/vente/${SALE}%2F..%2Fadmin`,
      `${SERVER}/vente/${SALE}?conseil=${ADVICE}&next=https://evil.fr`,
      `${SERVER}/vente/${SALE}?redirect=https://evil.fr`,
      `${SERVER}/vente/${SALE}?conseil=${ADVICE}#conseil-autre`,
      `${SERVER}/vente/${SALE}#ailleurs`,
      `javascript:alert(1)`,
      `file:///C:/Windows/System32/cmd.exe`,
      `${SERVER}/vente/${SALE} & calc.exe`,
      "/vente/relative",
      `${SERVER}/vente/${"x".repeat(400)}`,
      "",
    ];
    for (const candidate of refused) expect(saleAdviceUrl(SERVER, candidate), candidate).toBeNull();
    expect(saleAdviceUrl(SERVER, 42)).toBeNull();
    expect(saleAdviceUrl(SERVER, null)).toBeNull();
  });

  it("un serveur non sûr (http hors poste de développement) ou avec un chemin : rien ne s'ouvre", () => {
    expect(saleAdviceUrl("http://pharmaboost.app", `http://pharmaboost.app/vente/${SALE}`)).toBeNull();
    expect(saleAdviceUrl("https://pharmaboost.app/app", `https://pharmaboost.app/vente/${SALE}`)).toBeNull();
    expect(saleAdviceUrl("pas une adresse", `${SERVER}/vente/${SALE}`)).toBeNull();
  });
});
