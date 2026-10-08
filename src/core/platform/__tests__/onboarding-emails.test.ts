import { describe, expect, it } from "vitest";
import { INSTALLATION_STEPS, buildInstallationGuideEmail } from "../onboarding-emails";

describe("le guide d'installation envoyé au titulaire", () => {
  it("donne les cinq étapes, dans l'ordre, sans visite ni intervention sur le serveur", () => {
    const message = buildInstallationGuideEmail({ ownerName: "Marie Dupont", pharmacyName: "Pharmacie du Centre", appUrl: "https://pharmaboost.app/", contactEmail: "contact@pharmaboost.app" });
    expect(INSTALLATION_STEPS).toHaveLength(5);
    expect(message.subject).toContain("Pharmacie du Centre");
    for (const [index, step] of INSTALLATION_STEPS.entries()) {
      expect(message.text).toContain(`${index + 1}. ${step.title}`);
      expect(message.html).toContain(step.title);
    }
    expect(message.text).toContain("Mes connexions");
    expect(message.text).toContain("https://pharmaboost.app/");
    expect(message.text).toContain("contact@pharmaboost.app");
    expect(message.html).not.toContain("<script");
  });
});

import { buildUserPasswordEmail } from "../welcome-email";

describe("l'e-mail d'accueil du titulaire", () => {
  it("porte le lien, les cinq étapes et les étapes d'export de son logiciel", () => {
    const message = buildUserPasswordEmail({
      firstName: "Marie",
      pharmacyName: "Pharmacie du Centre",
      url: "https://pharmaboost.app/mot-de-passe/abc",
      loginUrl: "https://pharmaboost.app/login",
      expiresAt: new Date("2026-10-02T10:00:00Z"),
      kind: "welcome",
      onboarding: { lgoLabel: "LGPI", exportSteps: ["Dans LGPI, ouvrez le module Inventaire, puis Édition."], contactEmail: "contact@pharmaboost.app" },
    });
    expect(message.subject).toContain("Bienvenue");
    expect(message.text).toContain("https://pharmaboost.app/mot-de-passe/abc");
    for (const step of INSTALLATION_STEPS) expect(message.text).toContain(step.title);
    expect(message.text).toContain("Votre logiciel : LGPI");
    expect(message.html).toContain("module Inventaire");
    expect(message.text).toContain("contact@pharmaboost.app");
  });

  it("reste court pour un simple mot de passe oublié", () => {
    const message = buildUserPasswordEmail({ firstName: "Marie", pharmacyName: null, url: "https://x/y", loginUrl: "https://x/login", expiresAt: new Date(), kind: "reset" });
    expect(message.text).not.toContain(INSTALLATION_STEPS[0]!.title);
  });
});
