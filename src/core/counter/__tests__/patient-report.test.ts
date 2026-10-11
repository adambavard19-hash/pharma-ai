import { describe, expect, it } from "vitest";
import { brandColorOf, buildPatientReport, emailImageUrl, inkOn, maskEmail, parsePatientEmail, patientSafeLine, patientSafeReason, postalAddress, reportProducts, telLink, treatmentWords } from "../patient-report";

describe("le bilan envoyé au patient", () => {
  it("ne dit que les produits retenus, avec leur phrase patient quand il y en a une", () => {
    const mail = buildPatientReport({ pharmacyName: "Pharmacie du Port", products: [{ name: "ELUDAY GENCIVE 500 ml", reason: "Apaise la bouche sèche." }, { name: "SÉRUM PHYSIOLOGIQUE", reason: null }] });
    expect(mail?.subject).toBe("Votre bilan Pharmacie du Port");
    expect(mail?.text).toContain("• ELUDAY GENCIVE 500 ml");
    expect(mail?.text).toContain("Apaise la bouche sèche.");
    expect(mail?.text).toContain("• SÉRUM PHYSIOLOGIQUE");
    expect(mail?.html).toContain("Votre bilan du jour");
  });

  it("n'envoie rien quand aucun produit n'est retenu", () => {
    expect(buildPatientReport({ pharmacyName: "Pharmacie du Port", products: [] })).toBeNull();
    expect(buildPatientReport({ pharmacyName: "Pharmacie du Port", products: [{ name: "   ", reason: "x" }] })).toBeNull();
  });

  it("ne cite ni médicament, ni posologie, ni nom : seulement ce que la pharmacie a retenu", () => {
    const mail = buildPatientReport({ pharmacyName: "Pharmacie du Port", products: [{ name: "ELUDAY", reason: null }] });
    expect(mail?.text).not.toMatch(/posologie|mg|comprimé|ordonnance/i);
    expect(mail?.text).toContain("ne remplace ni l'avis de votre pharmacien");
    expect(mail?.text).toContain("vous avez donné votre accord");
  });

  it("protège le HTML et écarte les doublons", () => {
    const mail = buildPatientReport({ pharmacyName: "Pharmacie <b>X</b>", products: [{ name: "A & B", reason: "<script>x</script>" }, { name: "a & b", reason: null }] });
    expect(mail?.html).not.toContain("<script>");
    expect(mail?.html).toContain("A &amp; B");
    expect(reportProducts([{ name: "A", reason: null }, { name: "a", reason: null }])).toHaveLength(1);
  });

  it("garde huit produits au plus", () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ name: `Produit ${index}`, reason: null }));
    expect(reportProducts(many)).toHaveLength(8);
  });
});

describe("la phrase patient ne nomme jamais ce que la pharmacie a délivré", () => {
  const amoxicillin = { names: ["AMOXICILLINE ARROW 1 g, comprimé dispersible"], substances: ["AMOXICILLINE TRIHYDRATÉE"] };
  const safe = (reason: string, template: string, sale = [amoxicillin], productName = "FLORE INTESTINALE 10 gélules") => patientSafeReason({ reason, template, productName, sale });

  it("un modèle qui contient {drug} : la phrase ne part pas, même rendue avec un nom inattendu", () => {
    expect(safe("Votre antibiotique (AMOXICILLINE) peut déséquilibrer la flore.", "Votre antibiotique ({drug}) peut déséquilibrer la flore.")).toBeNull();
    expect(safe("Votre antibiotique (CLAMOXYL) peut déséquilibrer la flore.", "Votre antibiotique ({drug}) peut déséquilibrer la flore.", [])).toBeNull();
  });

  it("un modèle inconnu : rien ne prouve que la phrase est sûre, elle ne part pas", () => {
    expect(patientSafeReason({ reason: "Accompagne la flore.", template: null, productName: "X", sale: [] })).toBeNull();
    expect(patientSafeReason({ reason: "Accompagne la flore.", template: undefined, productName: "X", sale: [] })).toBeNull();
  });

  it("un modèle sans {drug} : la phrase part, sauf si elle cite un nom ou une substance de la vente (casse et accents ignorés)", () => {
    expect(safe("Accompagne la flore pendant la cure.", "Accompagne la flore pendant la cure.")).toBe("Accompagne la flore pendant la cure.");
    expect(safe("Pendant l'amoxicilline, accompagne la flore.", "x")).toBeNull();
    expect(safe("Pendant un traitement par Amoxicilline trihydratée.", "x", [{ names: [], substances: ["AMOXICILLINE TRIHYDRATÉE"] }])).toBeNull();
    expect(safe("À distance du paracetamol.", "x", [{ names: ["DOLIPRANE 1000 mg, comprimé"], substances: ["PARACÉTAMOL"] }])).toBeNull();
    expect(safe("Le Doliprane ne suffit pas toujours.", "x", [{ names: ["DOLIPRANE 1000 mg, comprimé"], substances: [] }])).toBeNull();
  });

  it("ni la forme du médicament, ni un mot court, ni le nom du produit conseillé ne font taire la phrase", () => {
    const doliprane = [{ names: ["DOLIPRANE 1000 mg, comprimé"], substances: ["PARACÉTAMOL"] }];
    expect(safe("Ce comprimé se croque.", "x", doliprane)).toBe("Ce comprimé se croque.");
    expect(safe("Riche en fer.", "x", [{ names: ["FER 80 mg"], substances: [] }])).toBe("Riche en fer.");
    // Le produit vendu, passé au scan, est lui-même une ligne de la vente : son nom figure déjà dans le bilan.
    expect(safe("FLORE INTESTINALE accompagne la flore.", "{product} accompagne la flore.", [...doliprane, { names: ["FLORE INTESTINALE 10 gélules"], substances: [] }])).toBe("FLORE INTESTINALE accompagne la flore.");
  });

  it("une phrase vide reste vide", () => {
    expect(safe("   ", "x")).toBeNull();
    expect(patientSafeReason({ reason: null, template: "x", productName: "X", sale: [] })).toBeNull();
  });

  it("les mots d'un traitement : noms sans leur forme, substances, cinq lettres au moins, sans accents", () => {
    expect(treatmentWords([amoxicillin]).sort()).toEqual(["amoxicilline", "arrow", "trihydratee"]);
    expect(treatmentWords([{ names: [null, "Œstrogel, gel"], substances: [undefined, "ESTRADIOL"] }]).sort()).toEqual(["estradiol", "oestrogel"]);
  });
});

describe("l'adresse du patient", () => {
  it("accepte une adresse bien formée, en minuscules", () => {
    expect(parsePatientEmail("  Jean.Dupont@Gmail.com ")).toEqual({ ok: true, email: "jean.dupont@gmail.com" });
  });
  it("refuse ce qui n'est pas une adresse", () => {
    for (const bad of ["", "   ", "jean", "jean@", "@gmail.com", "jean@gmail", "jean..d@gmail.com", "jean dupont@gmail.com", null, undefined]) {
      expect(parsePatientEmail(bad as string).ok).toBe(false);
    }
  });
  it("ne montre jamais l'adresse entière dans un journal", () => {
    expect(maskEmail("jean.dupont@gmail.com")).toBe("j***@gmail.com");
    expect(maskEmail("n'importe quoi")).toBe("***");
  });
});

describe("le bilan aux couleurs de la pharmacie", () => {
  const pharmacy = { name: "Pharmacie du Port", brandColor: "#1d4ed8", phone: "04 91 00 00 00", addressLine1: "8 quai des Belges", postalCode: "13001", city: "Marseille" };

  it("en-tête à la couleur de la pharmacie, son logo s'il est public, sinon le robot PharmaBoost", () => {
    const withoutLogo = buildPatientReport({ pharmacy, products: [{ name: "ELUDAY", reason: null }], assetBaseUrl: "https://pharmaboost.app" });
    expect(withoutLogo?.html).toContain("background:#1D4ED8");
    expect(withoutLogo?.html).toContain("https://pharmaboost.app/email/robot-192.png");
    const withLogo = buildPatientReport({ pharmacy: { ...pharmacy, logoUrl: "https://cdn.exemple.fr/logo.png" }, products: [{ name: "ELUDAY", reason: null }] });
    expect(withLogo?.html).toContain("https://cdn.exemple.fr/logo.png");
    expect(withLogo?.html).not.toContain("robot-192.png");
  });

  it("coordonnées et boutons : appeler et itinéraire, seulement avec ce que la fiche contient", () => {
    const mail = buildPatientReport({ pharmacy, products: [{ name: "ELUDAY", reason: null }] });
    expect(mail?.html).toContain('href="tel:+33491000000"');
    expect(mail?.html).toContain("Appeler ma pharmacie");
    expect(mail?.html).toContain("https://www.google.com/maps/search/?api=1&amp;query=Pharmacie%20du%20Port%2C%208%20quai%20des%20Belges%2C%2013001%20Marseille");
    expect(mail?.text).toContain("8 quai des Belges, 13001 Marseille");
    const bare = buildPatientReport({ pharmacy: { name: "Pharmacie du Port" }, products: [{ name: "ELUDAY", reason: null }] });
    expect(bare?.html).not.toContain("tel:");
    expect(bare?.html).not.toContain("Itinéraire");
    expect(bare?.html).not.toContain("Votre pharmacie</div>");
  });

  it("une carte par produit : photo https (jamais SVG ni http), mots-clés, précautions d'emploi", () => {
    const mail = buildPatientReport({
      pharmacy,
      assetBaseUrl: "https://pharmaboost.app",
      products: [
        { name: "Crème A", reason: null, imageUrl: "https://images.openbeautyfacts.org/a.jpg", benefits: ["Hydratation", "Hydratation"], precautions: ["Usage externe."] },
        { name: "Crème B", reason: null, imageUrl: "/produits/b.svg" },
        { name: "Crème C", reason: null, imageUrl: "http://exemple.fr/c.jpg" },
      ],
    });
    expect(mail?.html).toContain("https://images.openbeautyfacts.org/a.jpg");
    expect(mail?.html).not.toContain("b.svg");
    expect(mail?.html).not.toContain("http://exemple.fr");
    expect(mail?.html.match(/Hydratation/g)).toHaveLength(1);
    expect(mail?.text).toContain("Précaution d'emploi : Usage externe.");
  });

  it("tout ce qui vient de la base est échappé", () => {
    const mail = buildPatientReport({ pharmacy: { name: "P <b>", phone: "04 91 00 00 00", city: "<i>Ville</i>" }, products: [{ name: "X", reason: null, benefits: ["<script>"], precautions: ["a & b"] }] });
    expect(mail?.html).not.toMatch(/<script>|<i>|<b>/);
    expect(mail?.html).toContain("a &amp; b");
  });

  it("les petites règles : couleur, encre, téléphone, adresse, image", () => {
    expect(brandColorOf("javascript:alert(1)")).toBe("#0F766E");
    expect(inkOn("#0F766E")).toBe("#FFFFFF");
    expect(inkOn("#FDE68A")).toBe("#101828");
    expect(telLink("0478000000")).toBe("tel:+33478000000");
    expect(telLink("+33 4 78 00 00 00")).toBe("tel:+33478000000");
    expect(telLink("appelez-nous")).toBeNull();
    expect(postalAddress({ name: "x" })).toBeNull();
    expect(emailImageUrl("/email/robot.png", "https://pharmaboost.app")).toBe("https://pharmaboost.app/email/robot.png");
    expect(emailImageUrl("/email/robot.png", "http://localhost:3000")).toBeNull();
  });

  it("une ligne écrite à l'avance (mot-clé, précaution) ne part pas si elle nomme le traitement délivré", () => {
    const sale = [{ names: ["DOLIPRANE 1000 mg, comprimé"], substances: ["PARACÉTAMOL"] }];
    expect(patientSafeLine({ line: "À distance du paracétamol.", productName: "Crème", sale })).toBeNull();
    expect(patientSafeLine({ line: "Usage externe.", productName: "Crème", sale })).toBe("Usage externe.");
  });
});
