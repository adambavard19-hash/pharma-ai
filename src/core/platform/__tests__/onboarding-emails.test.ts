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
    expect(message.text).toContain("Ajouter un poste");
    expect(message.text).toContain("https://pharmaboost.app/");
    expect(message.text).toContain("contact@pharmaboost.app");
    expect(message.html).not.toContain("<script");
  });
});
