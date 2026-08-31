import { describe, expect, it, vi } from "vitest";
import { NotConfiguredMessagingProvider } from "../messaging";
import { ResendMessagingProvider, type FetchLike } from "../messaging-resend";
import { SmtpMessagingProvider, type SmtpTransport } from "../messaging-smtp";
import { chooseMessagingProvider } from "../messaging-factory";
import type { OutgoingEmail } from "../../ports";

/**
 * La règle que ces tests protègent tient en une phrase : l'application ne dit
 * « transmis » que si le prestataire l'a confirmé. Aucun test n'appelle le
 * réseau — le transport est injecté.
 */

const MESSAGE: OutgoingEmail = {
  to: "patient@exemple.fr",
  subject: "Pharmacie Saint-Michel — votre fiche conseil",
  text: "Bonjour Christine,",
  html: "<p>Bonjour Christine,</p>",
};

function resendResponse(ok: boolean, status: number, body = "") {
  return { ok, status, text: async () => body };
}

describe("fournisseur non configuré", () => {
  it("ne prétend jamais avoir envoyé", async () => {
    const outcome = await new NotConfiguredMessagingProvider().sendEmail(MESSAGE);
    expect(outcome.status).toBe("SIMULATED");
    expect(outcome.detail).toContain("n'a PAS été transmis");
    expect(outcome.detail).toContain(MESSAGE.to);
  });

  it("dit ce qui manque quand un fournisseur a été demandé", async () => {
    const provider = new NotConfiguredMessagingProvider(
      "le fournisseur « resend » est demandé mais RESEND_API_KEY est absent de la configuration.",
    );
    expect(provider.info.capability).toBe("SIMULATED");
    expect(provider.info.description).toContain("RESEND_API_KEY");
    expect((await provider.sendEmail(MESSAGE)).status).toBe("SIMULATED");
  });
});

describe("Resend", () => {
  const config = { apiKey: "cle-de-test", from: "Pharmacie <contact@exemple.fr>" };

  it("transmet et confirme", async () => {
    const fetchImpl = vi.fn(async () => resendResponse(true, 200, '{"id":"abc"}')) as FetchLike;
    const outcome = await new ResendMessagingProvider(config, fetchImpl).sendEmail(MESSAGE);

    expect(outcome.status).toBe("SENT");
    expect(outcome.provider).toBe("resend");

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.to).toEqual([MESSAGE.to]);
    expect(body.subject).toBe(MESSAGE.subject);
    expect(body.text).toBe(MESSAGE.text);
    expect(init.headers.Authorization).toBe("Bearer cle-de-test");
  });

  it("rapporte un refus avec son motif, sans jamais le maquiller en succès", async () => {
    const fetchImpl = (async () =>
      resendResponse(false, 403, '{"message":"domaine non vérifié"}')) as FetchLike;
    const outcome = await new ResendMessagingProvider(config, fetchImpl).sendEmail(MESSAGE);

    expect(outcome.status).toBe("FAILED");
    expect(outcome.detail).toContain("403");
    expect(outcome.detail).toContain("domaine non vérifié");
  });

  it("ne laisse jamais fuir la clé dans le motif d'échec", async () => {
    const fetchImpl = (async () => resendResponse(false, 401, "unauthorized")) as FetchLike;
    const outcome = await new ResendMessagingProvider(config, fetchImpl).sendEmail(MESSAGE);
    expect(outcome.detail).not.toContain("cle-de-test");
  });

  it("survit à une panne réseau au lieu d'interrompre le comptoir", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as FetchLike;
    const outcome = await new ResendMessagingProvider(config, fetchImpl).sendEmail(MESSAGE);

    expect(outcome.status).toBe("FAILED");
    expect(outcome.detail).toContain("ECONNREFUSED");
    expect(outcome.detail).toContain("n'a pas été transmis");
  });

  it("renonce plutôt que d'attendre indéfiniment", async () => {
    const fetchImpl = (async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }) as unknown as FetchLike;
    const outcome = await new ResendMessagingProvider(
      { ...config, timeoutMs: 5 },
      fetchImpl,
    ).sendEmail(MESSAGE);

    expect(outcome.status).toBe("FAILED");
    expect(outcome.detail).toContain("délai");
  });
});

describe("SMTP", () => {
  const config = {
    host: "smtp.exemple.fr",
    port: 587,
    secure: false,
    user: "contact@exemple.fr",
    password: "secret",
    from: "Pharmacie <contact@exemple.fr>",
  };

  it("transmet et confirme", async () => {
    const transport: SmtpTransport = {
      sendMail: async () => ({ messageId: "<1@exemple.fr>", rejected: [] }),
    };
    const outcome = await new SmtpMessagingProvider(config, transport).sendEmail(MESSAGE);
    expect(outcome.status).toBe("SENT");
    expect(outcome.detail).toContain("smtp.exemple.fr");
  });

  it("traite un destinataire rejeté comme un échec, pas comme un envoi", async () => {
    const transport: SmtpTransport = {
      sendMail: async () => ({ messageId: "<1@exemple.fr>", rejected: [MESSAGE.to] }),
    };
    const outcome = await new SmtpMessagingProvider(config, transport).sendEmail(MESSAGE);
    expect(outcome.status).toBe("FAILED");
    expect(outcome.detail).toContain(MESSAGE.to);
  });

  it("rapporte le motif du serveur sans lever", async () => {
    const transport: SmtpTransport = {
      sendMail: async () => {
        throw new Error("535 authentification refusée");
      },
    };
    const outcome = await new SmtpMessagingProvider(config, transport).sendEmail(MESSAGE);
    expect(outcome.status).toBe("FAILED");
    expect(outcome.detail).toContain("535");
  });

  it("ne divulgue pas le mot de passe dans ses messages", async () => {
    const transport: SmtpTransport = {
      sendMail: async () => {
        throw new Error("535 authentification refusée");
      },
    };
    const provider = new SmtpMessagingProvider(config, transport);
    const outcome = await provider.sendEmail(MESSAGE);
    expect(`${provider.info.description}${outcome.detail}`).not.toContain("secret");
  });
});

describe("choix du fournisseur", () => {
  it("sans fournisseur demandé, rien ne part et l'écran le dit", () => {
    const provider = chooseMessagingProvider({ provider: "none" });
    expect(provider.info.capability).toBe("SIMULATED");
  });

  it("refuse d'activer Resend sans clé, plutôt que d'échouer en silence", () => {
    const provider = chooseMessagingProvider({ provider: "resend", from: "a@b.fr" });
    expect(provider.info.capability).toBe("SIMULATED");
    expect(provider.info.description).toContain("RESEND_API_KEY");
  });

  it("refuse d'activer SMTP sans hôte ni expéditeur, et nomme les deux", () => {
    const provider = chooseMessagingProvider({ provider: "smtp" });
    expect(provider.info.capability).toBe("SIMULATED");
    expect(provider.info.description).toContain("SMTP_HOST");
    expect(provider.info.description).toContain("EMAIL_FROM");
    expect(provider.info.description).toContain("sont absents");
  });

  it("active Resend dès que la configuration est complète", () => {
    const provider = chooseMessagingProvider({
      provider: "resend",
      from: "a@b.fr",
      resendApiKey: "cle",
    });
    expect(provider.info.capability).toBe("LIVE");
    expect(provider.info.id).toBe("resend");
  });

  it("active SMTP en STARTTLS par défaut, jamais en clair implicite", () => {
    const provider = chooseMessagingProvider({
      provider: "smtp",
      from: "a@b.fr",
      smtpHost: "smtp.exemple.fr",
    });
    expect(provider.info.capability).toBe("LIVE");
    expect(provider.info.label).toContain("smtp.exemple.fr");
  });
});
