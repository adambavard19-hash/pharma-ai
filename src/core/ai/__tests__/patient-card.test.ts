import { describe, expect, it } from "vitest";
import { validatePatientCard } from "../patient-card";
import { buildPatientReport } from "../../counter/patient-report";

const good = {
  link: "Votre traitement peut dessécher la peau : cette crème lavante sans savon assure une toilette douce.",
  keyPoints: [
    { icon: "soin", title: "Sans savon", text: "Base lavante douce pour peau sensible." },
    { icon: "feuille", title: "Apaisante", text: "Limite les tiraillements après la douche." },
    { icon: "coche", title: "Quotidien", text: "Convient à toute la famille." },
  ],
  usage: ["Appliquer sur peau humide, faire mousser, rincer."],
  tip: "Préférez une eau tiède et des douches courtes.",
};
const ctx = { productName: "LIPIKAR SYNDET AP + Cr lavante", forbidden: ["KETOCONAZOLE VIATRIS 2 %, gel en sachet-dose", "kétoconazole"] };

describe("la fiche patient d'un produit conseillé", () => {
  it("une fiche correcte passe", () => {
    expect(validatePatientCard(good, ctx).card?.keyPoints).toHaveLength(3);
  });
  it("une fiche qui nomme le médicament ou sa substance est refusée", () => {
    const { card, problems } = validatePatientCard({ ...good, link: "Avec le kétoconazole, la peau se dessèche : utilisez cette crème lavante douce." }, ctx);
    expect(card).toBeNull();
    expect(problems.join()).toContain("nomme le traitement");
  });
  it("une promesse de guérison est refusée", () => {
    expect(validatePatientCard({ ...good, link: "Cette crème guérit votre peau pendant votre traitement." }, ctx).card).toBeNull();
  });
  it("les mots de forme (gel, sachet…) ne bloquent pas", () => {
    expect(validatePatientCard({ ...good, usage: ["Appliquer en sachet unidose sur peau humide, puis rincer."] }, ctx).card).not.toBeNull();
  });
  it("le bilan montre la fiche : le lien avec le traitement, les points clés, les gestes, le bon à savoir, et le bandeau ADN", () => {
    const mail = buildPatientReport({ pharmacyName: "Pharmacie du Port", products: [{ name: "LIPIKAR SYNDET AP +", reason: null, card: validatePatientCard(good, ctx).card }], assetBaseUrl: "https://pharmaboost.app" })!;
    expect(mail.text).toContain("Pourquoi avec votre traitement : Votre traitement peut dessécher la peau");
    expect(mail.text).toContain("✓ Sans savon");
    expect(mail.text).toContain("Bon à savoir : Préférez une eau tiède");
    expect(mail.html).toContain("Pourquoi avec votre traitement");
    expect(mail.html).toContain("/email/bandeau-adn.gif");
  });
});
