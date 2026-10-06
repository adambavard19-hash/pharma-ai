import { describe, expect, it, vi } from "vitest";
import { DemoMessagingProvider, guardReservedRecipients, isReservedAddress } from "../demo-messaging";
import type { MessagingProvider, OutgoingEmail } from "../../ports";

const email = (to: string): OutgoingEmail => ({ to, fromName: "Pharmacie", subject: "Sujet", text: "Texte", html: "<p>Texte</p>" });

describe("les adresses réservées", () => {
  it("reconnaît les domaines qui ne peuvent jamais recevoir de courrier", () => {
    for (const address of ["demo@pharmaboost.test", "x@exemple.invalid", "y@site.example", "z@machine.localhost", "Demo@PharmaBoost.TEST", " a@b.test "]) expect(isReservedAddress(address), address).toBe(true);
  });

  it("ne confond pas une vraie adresse avec une adresse réservée", () => {
    for (const address of ["adambavard19@gmail.com", "contact@pharmaboost.app", "test@gmail.com", "a@test.fr", "a@example.com", "a@mon.test.fr", "pas-une-adresse"]) expect(isReservedAddress(address), address).toBe(false);
  });
});

describe("la messagerie de démonstration", () => {
  it("n'envoie rien, à personne, et le dit", async () => {
    const outcome = await new DemoMessagingProvider().sendEmail();
    expect(outcome).toMatchObject({ status: "SIMULATED", provider: "demo" });
    expect(outcome.detail).toMatch(/aucun e-mail n'est parti/);
  });
});

describe("le garde-fou des adresses réservées", () => {
  const real = () => {
    const sendEmail = vi.fn(async () => ({ status: "SENT" as const, provider: "resend", detail: "ok" }));
    const provider: MessagingProvider = { info: { id: "resend", label: "Resend", capability: "LIVE", description: "" }, sendEmail };
    return { provider, sendEmail };
  };

  it("une adresse réservée n'est jamais confiée au prestataire", async () => {
    const { provider, sendEmail } = real();
    const outcome = await guardReservedRecipients(provider).sendEmail(email("demo@pharmaboost.test"));
    expect(outcome.status).toBe("SIMULATED");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("une vraie adresse passe, inchangée", async () => {
    const { provider, sendEmail } = real();
    const message = email("adambavard19@gmail.com");
    const outcome = await guardReservedRecipients(provider).sendEmail(message);
    expect(outcome.status).toBe("SENT");
    expect(sendEmail).toHaveBeenCalledWith(message);
  });

  it("garde l'identité du prestataire (l'écran « moteur » ne ment pas)", () => {
    const { provider } = real();
    expect(guardReservedRecipients(provider).info.id).toBe("resend");
  });
});
