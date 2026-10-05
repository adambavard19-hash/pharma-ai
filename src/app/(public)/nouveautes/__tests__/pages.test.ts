import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Les deux pages publiques, rendues côté serveur sans navigateur ni base :
 * ce que le patient lit avant de donner (ou retirer) son accord.
 */

const mocks = vi.hoisted(() => ({ peekNewsOptIn: vi.fn(), peekNewsUnsubscribe: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/server/services/patient-news", () => mocks);
vi.mock("@/server/actions/patient-news", () => ({ confirmNewsOptInAction: vi.fn(), confirmNewsUnsubscribeAction: vi.fn() }));

const optIn = await import("../abonnement/[token]/page");
const unsubscribe = await import("../desinscription/[token]/page");
const notFoundPage = await import("../not-found");

const render = async (page: { default: (props: { params: Promise<{ token: string }> }) => Promise<React.ReactNode> | React.ReactNode }, token = "jeton-123") =>
  renderToStaticMarkup((await page.default({ params: Promise.resolve({ token }) })) as React.ReactElement);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.peekNewsOptIn.mockResolvedValue({ pharmacyName: "Pharmacie Saint-Michel", brandColor: "#0F766E", alreadySubscribed: false });
  mocks.peekNewsUnsubscribe.mockResolvedValue({ pharmacyName: "Pharmacie Saint-Michel", alreadyUnsubscribed: false });
});

describe("la page d'abonnement", () => {
  it("dit ce que le patient recevra, ce qui n'y est pas, qui est responsable, combien de temps, et comment partir", async () => {
    const html = await render(optIn);
    expect(html).toContain("Pharmacie Saint-Michel");
    expect(html).toContain("Être prévenu(e) des nouveautés de votre pharmacie");
    expect(html).toContain("au plus un par semaine");
    expect(html).toContain("Aucune information sur votre santé");
    expect(html).toContain("ni à votre ordonnance, ni à votre plan, ni à un médicament");
    expect(html).toContain("Pharmacie Saint-Michel est responsable de ce traitement");
    expect(html).toContain("36 mois au plus à compter de votre accord");
    expect(html).toContain("depuis chaque message");
    expect(html).toContain("adressez-vous à votre pharmacie");
    expect(html).toContain("rien n&#x27;est enregistré tant que vous n&#x27;avez pas confirmé");
  });

  it("l'abonnement est un bouton, rien n'est coché d'avance ; le jeton voyage en champ caché", async () => {
    const html = await render(optIn, "jeton-xyz");
    expect(html).toContain('<form');
    expect(html).toContain('type="hidden" name="token" value="jeton-xyz"');
    expect(html).toContain("Oui, tenez-moi informé(e)");
    expect(html).toContain('type="submit"');
    expect(html).not.toMatch(/checkbox|checked/i);
  });

  it("le patient voit sa pharmacie, jamais un logiciel", async () => {
    expect(await render(optIn)).not.toMatch(/pharmaboost|pharma\.ai/i);
  });

  it("reprend la couleur de l'officine, et se replie sur une couleur sûre", async () => {
    mocks.peekNewsOptIn.mockResolvedValue({ pharmacyName: "P", brandColor: "#123456", alreadySubscribed: false });
    expect(await render(optIn)).toContain("background-color:#123456");
    mocks.peekNewsOptIn.mockResolvedValue({ pharmacyName: "P", brandColor: "red;background:url(x)", alreadySubscribed: false });
    const html = await render(optIn);
    expect(html).toContain("background-color:#0F766E");
    expect(html).not.toContain("url(x)");
  });

  it("échappe le nom de la pharmacie", async () => {
    mocks.peekNewsOptIn.mockResolvedValue({ pharmacyName: "Pharmacie <b>Test</b> & Co", brandColor: "#0F766E", alreadySubscribed: false });
    const html = await render(optIn);
    expect(html).not.toContain("<b>Test</b>");
    expect(html).toContain("Pharmacie &lt;b&gt;Test&lt;/b&gt; &amp; Co");
  });

  it("déjà abonné : on le dit, sans formulaire ni bouton", async () => {
    mocks.peekNewsOptIn.mockResolvedValue({ pharmacyName: "Pharmacie Saint-Michel", brandColor: "#0F766E", alreadySubscribed: true });
    const html = await render(optIn);
    expect(html).toContain("Vous êtes déjà inscrit(e)");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<button");
  });

  it("jeton invalide : page introuvable", async () => {
    mocks.peekNewsOptIn.mockResolvedValue(null);
    await expect(render(optIn)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.peekNewsOptIn).toHaveBeenCalledWith("jeton-123");
  });

  it("ne se laisse pas indexer et ne nomme pas le logiciel dans ses métadonnées", () => {
    expect(optIn.metadata).toMatchObject({ title: { absolute: "Nouveautés de votre pharmacie" }, applicationName: "Votre pharmacie", robots: { index: false, follow: false } });
    expect(JSON.stringify(optIn.metadata)).not.toMatch(/pharmaboost/i);
  });
});

describe("la page de désinscription", () => {
  it("demande confirmation, explique ce qui est effacé et ce qui est gardé", async () => {
    const html = await render(unsubscribe, "jeton-xyz");
    expect(html).toContain("Nouveautés de Pharmacie Saint-Michel");
    expect(html).toContain("Votre adresse sera effacée");
    expect(html).toContain("trace illisible");
    expect(html).toContain('type="hidden" name="token" value="jeton-xyz"');
    expect(html).toContain("Ne plus recevoir les nouveautés");
    expect(html).not.toMatch(/pharmaboost|pharma\.ai/i);
  });

  it("déjà désinscrit : on le dit, sans formulaire", async () => {
    mocks.peekNewsUnsubscribe.mockResolvedValue({ pharmacyName: "Pharmacie Saint-Michel", alreadyUnsubscribed: true });
    const html = await render(unsubscribe);
    expect(html).toContain("Vous ne recevez plus les nouveautés");
    expect(html).not.toContain("<form");
  });

  it("jeton invalide : page introuvable", async () => {
    mocks.peekNewsUnsubscribe.mockResolvedValue(null);
    await expect(render(unsubscribe)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("ne se laisse pas indexer", () => {
    expect(unsubscribe.metadata).toMatchObject({ robots: { index: false, follow: false } });
  });
});

describe("le lien introuvable", () => {
  it("une page sobre, sans détail technique ni nom d'outil, qui renvoie vers la pharmacie", () => {
    const html = renderToStaticMarkup(notFoundPage.default() as React.ReactElement);
    expect(html).toContain("Ce lien n&#x27;est plus valide");
    expect(html).toContain("Votre pharmacie reste joignable");
    expect(html).not.toMatch(/pharmaboost|404|token|erreur/i);
    expect(JSON.stringify(notFoundPage.metadata)).not.toMatch(/pharmaboost/i);
  });
});
