import { describe, expect, it } from "vitest";
import { siteLeadSchema } from "../lead-form";
import { partnerApplicationSchema } from "@/core/partners/application-form";

const lead = { kind: "DEMO" as const, pharmacyName: "Pharmacie du Centre", contactName: "Camille Martin", email: "contact@pharmaboost.app" };

describe("règles partagées des formulaires du site", () => {
  it("laisse passer le pot de miel rempli jusqu'à l'action, qui répond sans rien enregistrer", () => {
    const parsed = siteLeadSchema.safeParse({ ...lead, website: "https://robot.example" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.website).toBe("https://robot.example");
  });

  it("refuse une demande sans nom d'officine ni e-mail valide, avec le libellé affiché à la personne", () => {
    const parsed = siteLeadSchema.safeParse({ ...lead, pharmacyName: "", email: "pas-une-adresse" });
    expect(parsed.success).toBe(false);
    const messages = parsed.success ? [] : parsed.error.issues.map((i) => i.message);
    expect(messages).toContain("Le nom de l'officine est requis.");
    expect(messages).toContain("Adresse e-mail invalide.");
  });

  it("candidature partenaire : le consentement reste obligatoire et le site est normalisé", () => {
    const base = { company: "Laboratoires Solaria", brand: "Solaria", contactFirstName: "Camille", contactLastName: "Martin", email: "contact@pharmaboost.app", websiteUrl: "www.solaria-exemple.fr" };
    expect(partnerApplicationSchema.safeParse({ ...base, consent: false }).success).toBe(false);
    const ok = partnerApplicationSchema.safeParse({ ...base, consent: true });
    expect(ok.success && ok.data.websiteUrl).toBe("https://www.solaria-exemple.fr");
  });
});
