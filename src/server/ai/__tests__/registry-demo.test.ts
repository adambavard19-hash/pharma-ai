import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L'officine de démonstration ne sollicite aucun service externe, même quand la configuration du
 * serveur en branche un : modèle, lecture d'image, e-mail. Ici le serveur est configuré « en vrai »
 * (clés présentes, envoi autorisé) et la démonstration doit quand même rester chez elle.
 */

const env = vi.hoisted(() => ({
  current: {
    AI_PROVIDER: "anthropic",
    OCR_PROVIDER: "anthropic",
    ANTHROPIC_API_KEY: "cle-de-test",
    OCR_SEND_IMAGES_EXTERNALLY: true,
    EMAIL_PROVIDER: "resend",
    RESEND_API_KEY: "re_test",
    EMAIL_FROM: "PharmaBoost <contact@pharmaboost.test>",
    STORAGE_PROVIDER: "local",
  } as Record<string, unknown>,
}));
const resend = vi.hoisted(() => ({ sendEmail: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/config/env", () => ({ getEnv: () => env.current }));
vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/core/ai/providers/messaging-resend", () => ({
  ResendMessagingProvider: class {
    info = { id: "resend", label: "Resend", capability: "LIVE", description: "" };
    sendEmail = resend.sendEmail;
  },
}));

const registry = await import("../registry");

beforeEach(() => {
  resend.sendEmail.mockReset();
  resend.sendEmail.mockResolvedValue({ status: "SENT", provider: "resend", detail: "ok" });
});

const message = (to: string) => ({ to, fromName: "Pharmacie", subject: "Sujet", text: "Texte", html: "<p>Texte</p>" });

describe("l'intelligence", () => {
  it("une vraie officine reçoit le modèle configuré ; la démonstration, jamais", () => {
    expect(registry.getAIProvider().info.capability).toBe("LIVE");
    expect(registry.getAIProvider({ demo: false }).info.capability).toBe("LIVE");
    expect(registry.getAIProvider({ demo: true }).info.id).toBe("rule-based");
  });
});

describe("la lecture d'ordonnance", () => {
  it("une vraie officine reçoit le lecteur d'image ; la démonstration ne confie aucune image à un tiers", () => {
    expect(registry.getOCRProvider().info.capability).toBe("LIVE");
    const demo = registry.getOCRProvider({ demo: true });
    expect(demo.info.capability).toBe("SIMULATED");
    expect(demo.info.description).toMatch(/aucune image/i);
  });
});

describe("l'envoi d'e-mails", () => {
  it("la démonstration n'envoie rien, même vers une vraie adresse", async () => {
    const outcome = await registry.getMessagingProvider({ demo: true }).sendEmail(message("adambavard19@gmail.com"));
    expect(outcome).toMatchObject({ status: "SIMULATED", provider: "demo" });
    expect(resend.sendEmail).not.toHaveBeenCalled();
  });

  it("une vraie officine envoie vers une vraie adresse", async () => {
    const outcome = await registry.getMessagingProvider().sendEmail(message("adambavard19@gmail.com"));
    expect(outcome.status).toBe("SENT");
    expect(resend.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("une adresse réservée n'est jamais confiée au prestataire, même sans le drapeau démo", async () => {
    const outcome = await registry.getMessagingProvider().sendEmail(message("demo@pharmaboost.test"));
    expect(outcome.status).toBe("SIMULATED");
    expect(resend.sendEmail).not.toHaveBeenCalled();
  });
});
