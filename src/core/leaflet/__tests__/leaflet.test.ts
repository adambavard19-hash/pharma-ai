import { describe, expect, it } from "vitest";
import { checkLeaflet, leafletKey, quoteInText, textOfHtml } from "../leaflet";

const NOTICE = "1. QU'EST-CE QUE DOLIPRANE ET DANS QUELS CAS EST-IL UTILISÉ ? Ce médicament est indiqué en cas de douleur et/ou fièvre telles que maux de tête. 3. COMMENT PRENDRE DOLIPRANE ? La posologie usuelle est de 1 comprimé à 1 000 mg par prise, à renouveler au bout de 4 heures minimum. Ne pas dépasser 3 g par jour. La durée du traitement est limitée à 3 jours en cas de fièvre et 5 jours en cas de douleur.";

describe("la notice officielle d'un produit conseillé", () => {
  it("garde une rubrique seulement si sa phrase est dans la notice, mot pour mot (accents et casse mis de côté)", () => {
    const checked = checkLeaflet(
      {
        found: true,
        indications: "Douleur et fièvre (maux de tête…).",
        indications_quote: "Ce médicament est indiqué en cas de douleur et/ou fièvre telles que maux de tête",
        posology: "1 comprimé de 1 000 mg par prise, au moins 4 heures entre deux prises, 3 g par jour au maximum.",
        posology_quote: "la posologie usuelle est de 1 comprimé à 1 000 mg par prise",
        duration: "Jamais plus de 7 jours.",
        duration_quote: "La durée du traitement est limitée à 7 jours",
      },
      NOTICE,
    );
    expect(checked.found).toBe(true);
    expect(checked.fields.indications).toContain("Douleur");
    expect(checked.fields.posology).toContain("1 000 mg");
    expect(checked.fields.duration).toBeUndefined();
    expect(checked.discarded).toEqual(["duration"]);
  });

  it("rien de vérifié : pas de notice (jamais une rubrique inventée)", () => {
    expect(checkLeaflet({ found: true, posology: "2 gélules par jour", posology_quote: "prendre deux gélules chaque jour" }, NOTICE).found).toBe(false);
    expect(checkLeaflet({ found: false }, NOTICE).found).toBe(false);
    expect(quoteInText("court", NOTICE)).toBe(false);
  });

  it("lit le texte d'une page, et choisit la notice officielle d'un médicament avant le code-barres", () => {
    expect(textOfHtml("<p>Posologie&nbsp;: 1 g</p><script>x()</script>")).toBe("Posologie : 1 g");
    expect(leafletKey({ cisCode: "60234100", ean: "3400935955838" })).toBe("cis:60234100");
    expect(leafletKey({ ean: "3 401 560 127 548" })).toBe("ean:3401560127548");
    expect(leafletKey({ ean: "12" })).toBeNull();
  });
});
