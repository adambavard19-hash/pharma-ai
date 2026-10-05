import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateCampaignDraft } from "@/core/admin/campaigns";
import { mocks, prisma, reset, state } from "./campaigns-harness";

/**
 * La désinscription des offres : un lien signé qui ne porte que l'empreinte de
 * l'adresse, une page qui n'écrit rien tant qu'on ne confirme pas, un POST
 * explicite et idempotent — le même que celui des messageries (« un clic »).
 */

vi.mock("server-only", () => ({}));
vi.mock("@/config/env", () => ({ getEnv: () => ({ AUTH_SESSION_SECRET: "s".repeat(48), DATA_ENCRYPTION_KEY: "k".repeat(32) }) }));
vi.mock("@/server/db/client", async () => ({ prisma: (await import("./campaigns-harness")).prisma }));
vi.mock("@/server/audit/log", async () => ({ recordAudit: (await import("./campaigns-harness")).mocks.recordAudit }));
vi.mock("@/server/ai/registry", async () => ({ getMessagingProvider: (await import("./campaigns-harness")).messagingProvider }));
vi.mock("@/server/public-url", async () => ({ publicUrl: (await import("./campaigns-harness")).publicUrl }));
vi.mock("@/server/services/email-dispatch", async () => ({ traceDispatch: (await import("./campaigns-harness")).mocks.traceDispatch }));
vi.mock("@/server/services/email-context", async () => ({ platformEmailContext: (await import("./campaigns-harness")).mocks.platformEmailContext }));
vi.mock("@/server/services/notifications", async () => ({ createNotification: (await import("./campaigns-harness")).mocks.createNotification }));
vi.mock("@/server/services/sales/notifications", async () => ({ notifyAdmins: (await import("./campaigns-harness")).mocks.notifyAdmins }));
vi.mock("@/server/services/referral-offers", async () => {
  const { mocks } = await import("./campaigns-harness");
  return { startReferralOffer: mocks.startReferralOffer, endReferralOffer: mocks.endReferralOffer };
});
vi.mock("../campaign-audience", async () => {
  const { mocks } = await import("./campaigns-harness");
  return { resolveAudience: mocks.resolveAudience, recipientValues: mocks.recipientValues };
});

const svc = await import("../campaigns");
const { hashEmail, signPayload } = await import("@/server/security/tokens");
const route = await import("@/app/(public)/offres/desinscription/[token]/un-clic/route");

const YEAR = 365 * 24 * 60 * 60 * 1000;
const tokenOf = (url: string) => url.split("/offres/desinscription/")[1];
const decode = (token: string) => JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8")) as Record<string, unknown>;

beforeEach(() => {
  reset();
});

describe("le lien de désinscription", () => {
  it("mène à /offres/desinscription/{jeton signé} ; le jeton porte l'empreinte, jamais l'adresse", () => {
    const url = svc.optOutUrlFor("Titulaire@Officine.fr");
    expect(url).toMatch(/^https:\/\/pharmaboost\.test\/offres\/desinscription\/[\w-]+\.[\w-]+$/);
    const token = tokenOf(url);
    expect(decode(token)).toMatchObject({ h: hashEmail("titulaire@officine.fr"), t: "offers-optout" });
    expect(url.toLowerCase()).not.toContain("officine.fr");
    expect(Buffer.from(token.split(".")[0], "base64url").toString("utf8")).not.toContain("@");
  });

  it("valable trois ans", () => {
    const payload = decode(tokenOf(svc.optOutUrlFor("a@officine.fr"))) as { x: number };
    expect(payload.x - Date.now()).toBeGreaterThan(3 * YEAR - 60_000);
    expect(payload.x - Date.now()).toBeLessThanOrEqual(3 * YEAR);
  });

  it("une même adresse, quelle que soit sa casse, donne la même empreinte ; deux adresses, deux empreintes", () => {
    const hash = (email: string) => decode(tokenOf(svc.optOutUrlFor(email))).h;
    expect(hash("A@Officine.fr")).toBe(hash(" a@officine.fr "));
    expect(hash("a@officine.fr")).not.toBe(hash("b@officine.fr"));
  });
});

describe("la page : un GET n'écrit rien", () => {
  const token = () => tokenOf(svc.optOutUrlFor("a@officine.fr"));

  it("dit si l'adresse est déjà désinscrite, sans rien écrire ni journaliser", async () => {
    expect(await svc.peekOfferOptOut(token())).toEqual({ alreadyOptedOut: false });
    state.optOuts.push({ id: "opt_1", emailHash: hashEmail("a@officine.fr") });
    expect(await svc.peekOfferOptOut(token())).toEqual({ alreadyOptedOut: true });
    expect(prisma.marketingOptOut.create).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("refuse tout jeton qui n'est pas un jeton de désinscription valide : fantaisiste, falsifié, d'un autre usage, expiré", async () => {
    const good = token();
    const [body, mac] = good.split(".");
    const forgedBody = Buffer.from(JSON.stringify({ h: hashEmail("autre@officine.fr"), t: "offers-optout", x: Date.now() + YEAR })).toString("base64url");
    const bad = [
      "",
      "n-importe-quoi",
      "a.b",
      `${body}.${mac.slice(0, -2)}xx`,
      `${forgedBody}.${mac}`,
      signPayload({ h: hashEmail("a@officine.fr"), t: "autre-usage" }, YEAR),
      signPayload({ h: "pas-une-empreinte", t: "offers-optout" }, YEAR),
      signPayload({ h: 42, t: "offers-optout" }, YEAR),
      signPayload({ t: "offers-optout" }, YEAR),
      signPayload({ h: hashEmail("a@officine.fr"), t: "offers-optout" }, -1000),
    ];
    for (const value of bad) {
      expect(await svc.peekOfferOptOut(value)).toBeNull();
      expect(await svc.confirmOfferOptOut(value)).toEqual({ ok: false, error: expect.stringContaining("Ce lien n'est plus valide") });
    }
    expect(state.optOuts).toHaveLength(0);
    expect(prisma.marketingOptOut.create).not.toHaveBeenCalled();
  });
});

describe("la confirmation : un POST explicite, idempotent", () => {
  it("inscrit l'empreinte, journalise sans adresse, et ne garde rien d'autre", async () => {
    const token = tokenOf(svc.optOutUrlFor("Titulaire@officine.fr"));
    expect(await svc.confirmOfferOptOut(token)).toEqual({ ok: true });
    expect(state.optOuts).toHaveLength(1);
    expect(state.optOuts[0]).toMatchObject({ emailHash: hashEmail("titulaire@officine.fr"), source: "LINK", emailMasked: null, campaignId: null });
    expect(JSON.stringify(state.optOuts)).not.toContain("@");
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
    expect(mocks.recordAudit).toHaveBeenCalledWith({ action: "marketing.opted_out", entityType: "MarketingOptOut", entityId: state.optOuts[0].id, metadata: { source: "LINK" } });
    expect(JSON.stringify(mocks.recordAudit.mock.calls)).not.toContain("@");
  });

  it("rejouée, elle réussit encore sans écrire une seconde ligne ni un second audit", async () => {
    const token = tokenOf(svc.optOutUrlFor("a@officine.fr"));
    expect(await svc.confirmOfferOptOut(token)).toEqual({ ok: true });
    expect(await svc.confirmOfferOptOut(token)).toEqual({ ok: true });
    expect(await svc.confirmOfferOptOut(tokenOf(svc.optOutUrlFor("A@OFFICINE.fr")))).toEqual({ ok: true });
    expect(state.optOuts).toHaveLength(1);
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
  });

  it("deux confirmations simultanées (la clé unique l'arbitre) : une ligne, deux succès, un audit", async () => {
    const token = tokenOf(svc.optOutUrlFor("a@officine.fr"));
    const results = await Promise.all([svc.confirmOfferOptOut(token), svc.confirmOfferOptOut(token), svc.confirmOfferOptOut(token)]);
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(state.optOuts).toHaveLength(1);
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
  });

  it("une panne de base n'est pas avalée : elle remonte, on ne dit pas « c'est fait » à tort", async () => {
    prisma.marketingOptOut.create.mockRejectedValueOnce(new Error("base indisponible"));
    await expect(svc.confirmOfferOptOut(tokenOf(svc.optOutUrlFor("a@officine.fr")))).rejects.toThrow("base indisponible");
    expect(state.optOuts).toHaveLength(0);
  });
});

describe("le POST « en un clic » des messageries et du bouton de la page", () => {
  const context = (token: string) => ({ params: Promise.resolve({ token }) });
  const post = (token: string, ip: string) => route.POST(new Request("http://localhost/x", { method: "POST", headers: { "x-forwarded-for": ip, "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" }), context(token));

  it("POST : désinscrit, répond 200, idempotent", async () => {
    const token = tokenOf(svc.optOutUrlFor("a@officine.fr"));
    const first = await post(token, "10.0.0.1");
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });
    expect((await post(token, "10.0.0.1")).status).toBe(200);
    expect(state.optOuts.map((o) => o.emailHash)).toEqual([hashEmail("a@officine.fr")]);
  });

  it("POST avec un jeton invalide : 400, rien d'écrit, aucun détail sur la raison", async () => {
    const response = await post("n-importe-quoi", "10.0.0.2");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: expect.stringContaining("Ce lien n'est plus valide") });
    expect(state.optOuts).toHaveLength(0);
  });

  it("GET : n'écrit rien, renvoie vers la page de confirmation", async () => {
    const token = tokenOf(svc.optOutUrlFor("a@officine.fr"));
    const attempt = route.GET(new Request("http://localhost/x"), context(token));
    await expect(attempt).rejects.toMatchObject({ digest: expect.stringContaining(`/offres/desinscription/${token}`) });
    expect(state.optOuts).toHaveLength(0);
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("limite de débit : au-delà de 30 demandes par heure et par adresse IP, 429 sans écriture", async () => {
    const token = tokenOf(svc.optOutUrlFor("a@officine.fr"));
    for (let i = 0; i < 30; i += 1) expect((await post(token, "10.0.0.9")).status).toBe(200);
    const limited = await post(token, "10.0.0.9");
    expect(limited.status).toBe(429);
    expect((await post(token, "10.0.0.10")).status).toBe(200);
  });

  it("la route répond aux POST des messageries sur l'adresse même de l'en-tête List-Unsubscribe", async () => {
    const checked = validateCampaignDraft({ kind: "ANNOUNCEMENT", name: "Annonce", subject: "Une information", title: "Une information", body: "Bonjour {{prenom}}, une information.", audience: "pharmacies.all_active" });
    if (!checked.ok) throw new Error(checked.error);
    // L'en-tête d'un message de test se termine par /un-clic : c'est ce chemin que la route sert.
    await svc.sendCampaignTest(checked.value, "adm_1", "admin@pharma.ai");
    const header = (mocks.sendEmail.mock.calls[0][0] as { headers: Record<string, string> }).headers["List-Unsubscribe"];
    const token = /desinscription\/(.+)\/un-clic>$/.exec(header)?.[1] ?? "";
    expect((await post(token, "10.0.0.20")).status).toBe(200);
    expect(state.optOuts.map((o) => o.emailHash)).toEqual([hashEmail("admin@pharma.ai")]);
  });
});
