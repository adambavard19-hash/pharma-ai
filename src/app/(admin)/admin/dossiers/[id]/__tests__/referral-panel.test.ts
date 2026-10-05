import { createElement, isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Le panneau « Parrainage » de la fiche d'un dossier : les confrères proposés (nom,
 * e-mail, téléphone, statut, dossier rapproché, gestes « Contacté » / « Décliné »), le
 * parrain d'un dossier parrainé, et un état vide discret. Service simulé, rendu côté serveur.
 */
const mocks = vi.hoisted(() => ({ loadReferralPanel: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: vi.fn() }) }));
vi.mock("@/server/actions/admin-referral-leads", () => ({ setReferralLeadStatusAction: vi.fn() }));
vi.mock("@/server/services/referral-leads", () => ({
  loadReferralPanel: mocks.loadReferralPanel,
  REFERRAL_LEAD_STATUS_LABELS: { NEW: "À contacter", CONTACTED: "Contacté", LINKED: "Dossier ouvert", DECLINED: "Décliné" },
}));

const { ReferralPanel } = await import("../referral-panel");

async function settle(node: ReactNode): Promise<ReactNode> {
  if (isValidElement(node) && typeof node.type === "function" && node.type.constructor.name === "AsyncFunction") return settle(await (node.type as (props: unknown) => Promise<ReactNode>)(node.props));
  return node;
}
const render = async () => {
  const html = renderToStaticMarkup((await settle(createElement(ReferralPanel as never, { prospectId: "p_1" } as never))) as React.ReactElement);
  return { html, text: html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/[\s  ]+/g, " ") };
};

const lead = (overrides: Record<string, unknown> = {}) => ({ id: "lead_1", name: "Dr Durand", email: "durand@pharmacie.fr", phone: "06 12 34 56 78", status: "NEW", createdAt: new Date("2026-10-05T08:00:00Z"), linkedProspect: null, ...overrides });
const panel = (overrides: Record<string, unknown> = {}) => ({ proposed: [], referredBy: { viaLead: null, viaCode: null }, ...overrides });

beforeEach(() => vi.clearAllMocks());

describe("panneau « Parrainage » d'un dossier", () => {
  it("état vide discret : une ligne, aucun bouton", async () => {
    mocks.loadReferralPanel.mockResolvedValue(panel());
    const { text, html } = await render();
    expect(text).toContain("Aucun confrère proposé au parrainage, et ce dossier n'est parrainé par personne.");
    expect(html).not.toContain("<button");
    expect(mocks.loadReferralPanel).toHaveBeenCalledWith("p_1");
  });

  it("liste les confrères proposés : nom, e-mail, téléphone, statut, date, et les deux gestes pour un confrère à contacter", async () => {
    mocks.loadReferralPanel.mockResolvedValue(panel({ proposed: [lead()] }));
    const { text, html } = await render();
    expect(text).toContain("Confrères proposés au parrainage");
    expect(text).toContain("Dr Durand");
    expect(text).toContain("durand@pharmacie.fr · 06 12 34 56 78");
    expect(text).toContain("Proposé le 05/10/2026");
    expect(text).toContain("À contacter");
    expect(text).toContain("L'équipe contacte ces personnes : rien ne leur est envoyé automatiquement.");
    expect(html).toContain("Contacté");
    expect(html).toContain("Décliné");
    expect((html.match(/<button/g) ?? []).length).toBe(2);
  });

  it("sans nom, l'adresse sert de titre ; un confrère déjà contacté n'a plus que le geste « Décliné »", async () => {
    mocks.loadReferralPanel.mockResolvedValue(panel({ proposed: [lead({ name: null, status: "CONTACTED" })] }));
    const { text, html } = await render();
    expect(text).toContain("durand@pharmacie.fr 06 12 34 56 78");
    expect((html.match(/<button/g) ?? []).length).toBe(1);
    expect(html).toContain("Décliné");
    expect(html).not.toMatch(/<button[^>]*>\s*(?:<svg[\s\S]*?<\/svg>)?\s*Contacté/);
  });

  it("un confrère dont le dossier est rapproché renvoie vers lui, sans geste (statut posé par le rapprochement)", async () => {
    mocks.loadReferralPanel.mockResolvedValue(panel({ proposed: [lead({ status: "LINKED", linkedProspect: { id: "p_2", name: "Pharmacie Durand" } })] }));
    const { text, html } = await render();
    expect(text).toContain("Dossier ouvert");
    expect(text).toContain("dossier ouvert : Pharmacie Durand");
    expect(html).toContain('href="/admin/dossiers/p_2"');
    expect(html).not.toContain("<button");
  });

  it("un confrère décliné peut être repassé « Contacté »", async () => {
    mocks.loadReferralPanel.mockResolvedValue(panel({ proposed: [lead({ status: "DECLINED" })] }));
    const { html } = await render();
    expect((html.match(/<button/g) ?? []).length).toBe(1);
  });

  it("« Parrainé par » : le dossier qui l'a proposé comme confrère, avec son lien", async () => {
    mocks.loadReferralPanel.mockResolvedValue(panel({ referredBy: { viaLead: { prospectId: "p_9", name: "Pharmacie du Port", pharmacyId: "ph_9" }, viaCode: null } }));
    const { text, html } = await render();
    expect(text).toContain("Parrainé par");
    expect(text).toContain("Pharmacie du Port");
    expect(text).toContain("l'a proposé comme confrère à parrainer");
    expect(html).toContain('href="/admin/dossiers/p_9"');
    expect(text).not.toContain("Aucun confrère proposé");
  });

  it("« Parrainé par » : l'officine dont il a saisi le code, avec son lien", async () => {
    mocks.loadReferralPanel.mockResolvedValue(panel({ referredBy: { viaLead: null, viaCode: { code: "PB-ABC234", pharmacyId: "ph_7", name: "Pharmacie Marraine" } } }));
    const { text, html } = await render();
    expect(text).toContain("Pharmacie Marraine");
    expect(text).toContain("code de parrainage PB-ABC234");
    expect(html).toContain('href="/admin/pharmacies/ph_7"');
  });

  it("la règle est rappelée : 20 % de moins par mois, une seule fois", async () => {
    mocks.loadReferralPanel.mockResolvedValue(panel({ proposed: [lead()] }));
    expect((await render()).text).toContain("fait passer son parrain à 20 % de moins par mois, une seule fois");
  });
});
