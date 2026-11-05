import { describe, expect, it } from "vitest";
import { buildSiteLeadAcknowledgement } from "../site-emails";

/** La démo sur Zoom (fondateur, 5 nov. 2026) : le lien de la réunion dans la confirmation ; sans Zoom, on appelle comme avant. */
const base = { kind: "DEMO" as const, pharmacyName: "Pharmacie du Port", contactName: "Marc", email: "marc@port.fr", phone: "06 12 34 56 78", city: "Marseille", lgo: null, postCount: null, message: null, preferredSlot: null, demoAt: new Date("2026-11-12T09:00:00Z"), contactEmail: "contact@pharmaboost.app" };

describe("la confirmation d'une démo", () => {
  it("avec Zoom : le lien de la réunion, la salle d'attente, et plus d'appel au téléphone", () => {
    const mail = buildSiteLeadAcknowledgement({ ...base, meetingUrl: "https://zoom.us/j/123456789" });
    expect(mail.text).toContain("Rejoindre la démo sur Zoom : https://zoom.us/j/123456789");
    expect(mail.text).toContain("salle d'attente");
    expect(mail.text).not.toContain("Nous vous appelons au");
    expect(mail.html).toContain("https://zoom.us/j/123456789");
  });

  it("sans Zoom : l'appel au numéro donné, comme avant", () => {
    const mail = buildSiteLeadAcknowledgement({ ...base });
    expect(mail.text).toContain("Nous vous appelons au 06 12 34 56 78");
    expect(mail.text).not.toContain("Zoom");
  });
});
