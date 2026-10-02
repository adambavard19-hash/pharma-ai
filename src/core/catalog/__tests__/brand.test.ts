import { describe, expect, it } from "vitest";
import { brandKey, brandLabelOf, productMatchesBrand } from "../brand";

/**
 * La marque d'un produit, lue une seule fois pour tout PharmaBoost.
 *
 * Une gamme privilégiée, un challenge ou une formation reliés à une marque
 * doivent retrouver les mêmes produits à l'écran des réglages et dans le
 * moteur. Ces tests figent les trois garanties : le champ marque passe avant
 * le libellé, la marque se reconnaît comme un mot entier (jamais une
 * sous-chaîne), et les accents ou la casse ne séparent pas deux graphies.
 */

describe("brandLabelOf — la marque affichée", () => {
  it("prend le champ marque quand il est renseigné, avant le libellé", () => {
    expect(brandLabelOf("CREME HYDRATANTE 50ML", "Avène")).toBe("AVÈNE");
    expect(brandLabelOf("URIAGE EAU THERMALE", "  La Roche-Posay ")).toBe("LA ROCHE-POSAY");
  });

  it("se rabat sur le premier mot du libellé, en majuscules et sans ponctuation finale", () => {
    expect(brandLabelOf("ARKOGELULES Harpagophyton 45 gél.", null)).toBe("ARKOGELULES");
    expect(brandLabelOf("Uriage, eau thermale 300ml", undefined)).toBe("URIAGE");
    expect(brandLabelOf("  Avène   Cicalfate ", "")).toBe("AVÈNE");
  });

  it("ignore un champ marque vide ou fait d'espaces", () => {
    expect(brandLabelOf("BIOGAIA Protectis gouttes", "   ")).toBe("BIOGAIA");
  });

  it("ne prend pas pour une marque une forme, une abréviation ou un mot trop court", () => {
    expect(brandLabelOf("GEL DOUCHE SURGRAS 500ML", null)).toBeNull();
    expect(brandLabelOf("HE LAVANDE VRAIE 10ML", null)).toBeNull();
    expect(brandLabelOf("Spray nasal eau de mer", null)).toBeNull();
    expect(brandLabelOf("AB complexe", null)).toBeNull();
    expect(brandLabelOf("3M Micropore 2,5cm", null)).toBeNull();
    expect(brandLabelOf("", null)).toBeNull();
  });
});

describe("brandKey — la clé de comparaison", () => {
  it("efface casse, accents et espaces superflus", () => {
    expect(brandKey("AVÈNE")).toBe("avene");
    expect(brandKey("  La   Roche-Posay ")).toBe("la roche-posay");
    expect(brandKey("Avène")).toBe(brandKey("AVENE"));
  });

  it("donne une clé vide pour une marque vide", () => {
    expect(brandKey("   ")).toBe("");
  });
});

describe("productMatchesBrand — ce produit est-il de cette marque ?", () => {
  it("reconnaît le champ marque même quand le libellé ne la porte pas", () => {
    expect(productMatchesBrand({ name: "CREME HYDRATANTE 50ML", brand: "Avène" }, brandKey("AVENE"))).toBe(true);
    expect(productMatchesBrand({ name: "CREME HYDRATANTE 50ML", brand: "Uriage" }, brandKey("AVENE"))).toBe(false);
  });

  it("reconnaît la marque comme un mot entier du libellé, jamais comme une sous-chaîne", () => {
    expect(productMatchesBrand({ name: "ARKO ROYAL GELEE ROYALE", brand: null }, "arko")).toBe(true);
    expect(productMatchesBrand({ name: "ARKOGELULES HARPAGOPHYTON", brand: null }, "arko")).toBe(false);
    expect(productMatchesBrand({ name: "ANTIVOG SPRAY 50ML", brand: null }, "vog")).toBe(false);
    expect(productMatchesBrand({ name: "VOG SPRAY 50ML", brand: null }, "vog")).toBe(true);
  });

  it("ne se laisse pas séparer par les accents ni la casse", () => {
    expect(productMatchesBrand({ name: "AVÈNE EAU THERMALE 300ML", brand: null }, brandKey("Avene"))).toBe(true);
    expect(productMatchesBrand({ name: "avene cicalfate+ 40ml", brand: null }, brandKey("AVÈNE"))).toBe(true);
  });

  it("reconnaît une marque en plusieurs mots", () => {
    expect(productMatchesBrand({ name: "LA ROCHE-POSAY EFFACLAR GEL 200ML", brand: null }, brandKey("La Roche-Posay"))).toBe(true);
    expect(productMatchesBrand({ name: "ROCHE BOBOIS", brand: null }, brandKey("La Roche-Posay"))).toBe(false);
  });

  it("ne reconnaît rien avec une clé vide", () => {
    expect(productMatchesBrand({ name: "AVENE EAU THERMALE", brand: "Avène" }, "")).toBe(false);
  });

  it("retrouve, par la clé d'une marque suggérée, le produit dont elle vient", () => {
    const stock = [
      { name: "ARKOGELULES Harpagophyton", brand: null },
      { name: "Uriage, eau thermale 300ml", brand: null },
      { name: "CREME MAINS 50ML", brand: "Neutrogena" },
      { name: "AVÈNE Cicalfate+ 40ml", brand: null },
    ];
    for (const product of stock) {
      const label = brandLabelOf(product.name, product.brand);
      expect(label, product.name).not.toBeNull();
      expect(productMatchesBrand(product, brandKey(label ?? "")), product.name).toBe(true);
    }
  });
});
