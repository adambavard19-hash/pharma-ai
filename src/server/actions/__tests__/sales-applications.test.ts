import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L'action publique « Devenir commercial » : le consentement, le pot de miel,
 * le CV relu par le serveur, la limite de débit. Le service d'arrivée est
 * simulé : ni base, ni e-mail.
 */
const mocks = vi.hoisted(() => ({ receive: vi.fn(), visitor: { ip: "203.0.113.1" } }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": `${mocks.visitor.ip}, 10.0.0.1` }) }));
vi.mock("@/server/services/sales-applications/intake", () => ({ receiveSalesApplication: mocks.receive }));

const { submitSalesApplicationAction } = await import("../sales-applications");

const PAYLOAD = {
  firstName: "Claire",
  lastName: "Martin",
  email: "claire.martin@exemple.fr",
  phone: "06 12 34 56 78",
  city: "Lyon",
  zone: "Rhône-Alpes",
  currentStatus: "FREELANCE",
  salesExperience: "Dix ans de vente en B2B.",
  healthExperience: "",
  message: "Je veux développer un produit utile.",
  consent: true,
  website: "",
};

function body(payload: unknown, cv?: File): FormData {
  const data = new FormData();
  data.set("payload", typeof payload === "string" ? payload : JSON.stringify(payload));
  if (cv) data.set("cv", cv);
  return data;
}
const pdfFile = (name = "cv.pdf", content = "%PDF-1.7 contenu") => new File([content], name, { type: "application/pdf" });

let visitor = 0;
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  visitor += 1;
  mocks.visitor.ip = `198.51.100.${visitor}`;
  mocks.receive.mockResolvedValue({ applicationId: "app_1", duplicate: false, acknowledged: true, cv: "none" });
});

describe("submitSalesApplicationAction", () => {
  it("enregistre une candidature valide et rend le reçu", async () => {
    const result = await submitSalesApplicationAction(body(PAYLOAD));
    expect(result).toMatchObject({ ok: true, data: { acknowledged: true, cv: "none" } });
    expect(mocks.receive).toHaveBeenCalledTimes(1);
    const [input, cv] = mocks.receive.mock.calls[0];
    expect(input).toMatchObject({ firstName: "Claire", email: "claire.martin@exemple.fr" });
    expect(input).not.toHaveProperty("website");
    expect(cv).toBeNull();
  });

  it("sans consentement : refus explicite, rien n'est enregistré", async () => {
    const result = await submitSalesApplicationAction(body({ ...PAYLOAD, consent: false }));
    expect(result).toMatchObject({ ok: false, fieldErrors: { consent: "Cochez cette case pour envoyer votre candidature." } });
    expect(mocks.receive).not.toHaveBeenCalled();
  });

  it("une saisie invalide revient avec ses messages par champ", async () => {
    const result = await submitSalesApplicationAction(body({ ...PAYLOAD, email: "oups", phone: "" }));
    expect(result).toMatchObject({ ok: false, fieldErrors: { email: "Adresse e-mail invalide.", phone: "Votre numéro de téléphone est requis." } });
    expect(mocks.receive).not.toHaveBeenCalled();
  });

  it("une requête illisible est refusée proprement", async () => {
    for (const bad of ["pas du json", "[", "x".repeat(25_000)]) {
      const result = await submitSalesApplicationAction(body(bad));
      expect(result.ok).toBe(false);
    }
    expect((await submitSalesApplicationAction(new FormData())).ok).toBe(false);
    expect(mocks.receive).not.toHaveBeenCalled();
  });

  it("pot de miel : réponse de succès, mais rien n'est enregistré ni envoyé", async () => {
    const result = await submitSalesApplicationAction(body({ ...PAYLOAD, website: "http://spam.example" }, pdfFile()));
    expect(result).toEqual({ ok: true, data: { acknowledged: false, cv: "none" }, message: undefined });
    expect(mocks.receive).not.toHaveBeenCalled();
  });

  it("un CV PDF est transmis au service, au nom nettoyé", async () => {
    mocks.receive.mockResolvedValue({ applicationId: "app_1", duplicate: false, acknowledged: true, cv: "saved" });
    const result = await submitSalesApplicationAction(body(PAYLOAD, pdfFile("../Mon CV <final>.pdf")));
    expect(result).toMatchObject({ ok: true, data: { cv: "saved" } });
    const cv = mocks.receive.mock.calls[0][1];
    expect(cv.fileName).toBe("Mon CV final.pdf");
    expect(new TextDecoder().decode(cv.bytes)).toBe("%PDF-1.7 contenu");
  });

  it("un fichier renommé en .pdf est refusé sur sa signature, avec l'erreur sur la question du CV", async () => {
    const result = await submitSalesApplicationAction(body(PAYLOAD, new File(["MZ programme"], "cv.pdf", { type: "application/pdf" })));
    expect(result).toMatchObject({ ok: false, error: "Votre CV n'a pas pu être pris en compte.", fieldErrors: { cv: expect.stringMatching(/PDF/) } });
    expect(mocks.receive).not.toHaveBeenCalled();
  });

  it("un CV de plus de 3 Mo est refusé", async () => {
    const big = new File(["%PDF-", new Uint8Array(3 * 1024 * 1024 + 1)], "gros.pdf", { type: "application/pdf" });
    const result = await submitSalesApplicationAction(body(PAYLOAD, big));
    expect(result).toMatchObject({ ok: false, fieldErrors: { cv: expect.stringMatching(/3 Mo/) } });
    expect(mocks.receive).not.toHaveBeenCalled();
  });

  it("un champ de fichier vide n'est pas un CV", async () => {
    await submitSalesApplicationAction(body(PAYLOAD, new File([], "", { type: "application/octet-stream" })));
    expect(mocks.receive.mock.calls[0][1]).toBeNull();
  });

  it("limite de débit : une quatrième tentative de la même adresse dans l'heure est refusée", async () => {
    for (let i = 0; i < 3; i += 1) expect((await submitSalesApplicationAction(body(PAYLOAD))).ok).toBe(true);
    const fourth = await submitSalesApplicationAction(body(PAYLOAD));
    expect(fourth.ok).toBe(false);
    expect(mocks.receive).toHaveBeenCalledTimes(3);
  });

  it("limite de débit : dix par adresse IP, toutes adresses e-mail confondues", async () => {
    for (let i = 0; i < 10; i += 1) expect((await submitSalesApplicationAction(body({ ...PAYLOAD, email: `candidat${i}@exemple.fr` }))).ok).toBe(true);
    expect((await submitSalesApplicationAction(body({ ...PAYLOAD, email: "onzieme@exemple.fr" }))).ok).toBe(false);
  });

  it("un CV refusé ne consomme pas la limite de débit", async () => {
    const bad = new File(["MZ"], "cv.pdf", { type: "application/pdf" });
    for (let i = 0; i < 5; i += 1) expect((await submitSalesApplicationAction(body(PAYLOAD, bad))).ok).toBe(false);
    expect((await submitSalesApplicationAction(body(PAYLOAD))).ok).toBe(true);
  });

  it("une panne du service répond par un message, jamais par une exception ni une trace", async () => {
    mocks.receive.mockRejectedValue(new Error("connexion refusée postgres://secret"));
    const result = await submitSalesApplicationAction(body(PAYLOAD));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Contact@pharmaboost\.app/);
      expect(result.error).not.toMatch(/postgres|secret/);
    }
  });
});
