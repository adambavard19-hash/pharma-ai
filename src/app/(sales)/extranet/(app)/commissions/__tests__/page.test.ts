import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * La page « Mes commissions & bonus » de l'extranet : le tableau de bord de la
 * grille progressive (vrais gains, progression, récompenses, simulateur), le
 * détail des commissions, et le bloc « Mes factures » en lecture seule. Le
 * commercial de la session, et personne d'autre.
 */

const mocks = vi.hoisted(() => ({ requireSalesSession: vi.fn(), listCommissionsFor: vi.fn(), listInvoicesFor: vi.fn(), commissionOverviewFor: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/sales-session", () => ({ requireSalesSession: mocks.requireSalesSession }));
vi.mock("@/server/services/sales/commissions", () => ({ listCommissionsFor: mocks.listCommissionsFor, listInvoicesFor: mocks.listInvoicesFor, commissionOverviewFor: mocks.commissionOverviewFor }));

const page = await import("../page");

const render = async () => renderToStaticMarkup(await page.default());
/** Le texte visible, sans balises, espaces insécables ramenées à des espaces. */
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/[  ]/g, " ").replace(/\s+/g, " ");
const section = (html: string, id: string) => {
  const start = html.indexOf(`aria-labelledby="${id}"`);
  return start < 0 ? "" : html.slice(start, html.indexOf("</section>", start));
};

const NO_COMMISSIONS = { rows: [], thisMonthCents: 0, earnedCents: 0, pendingCents: 0, paidCents: 0, yearCents: 0 };
const PROGRESSIVE = { type: "PROGRESSIVE", value: 0 };

let seq = 0;
const row = (overrides: Record<string, unknown>) => {
  seq += 1;
  return { id: `com_${seq}`, type: "PROGRESSIVE", status: "EARNED", amountCents: 20_000, bonusTier: null, paidAt: null, dueAt: null, createdAt: new Date("2026-09-01T10:00:00Z"), prospect: { id: `pro_${seq}`, name: `Pharmacie ${seq}`, activatedAt: null, contracts: [] }, ...overrides };
};
const activations = (count: number) => Array.from({ length: count }, (_, index) => ({ prospectId: `act_${index + 1}`, name: `Officine ${index + 1}`, at: new Date(Date.UTC(2026, 0, 1 + index)), rank: index + 1 }));

beforeEach(() => {
  vi.resetAllMocks();
  seq = 0;
  mocks.requireSalesSession.mockResolvedValue({ rep: { id: "rep_1", fullName: "Marie Dupont" } });
  mocks.listCommissionsFor.mockResolvedValue(NO_COMMISSIONS);
  mocks.listInvoicesFor.mockResolvedValue([]);
  mocks.commissionOverviewFor.mockResolvedValue({ rule: PROGRESSIVE, activations: [], beforeGridTiers: [] });
});

describe("le périmètre", () => {
  it("sans session de commercial, rien n'est lu", async () => {
    const redirected = new Error("NEXT_REDIRECT /extranet/connexion");
    mocks.requireSalesSession.mockRejectedValue(redirected);
    await expect(render()).rejects.toBe(redirected);
    expect(mocks.listInvoicesFor).not.toHaveBeenCalled();
    expect(mocks.listCommissionsFor).not.toHaveBeenCalled();
    expect(mocks.commissionOverviewFor).not.toHaveBeenCalled();
  });

  it("ne lit que les données du commercial de la session", async () => {
    await render();
    expect(mocks.listInvoicesFor).toHaveBeenCalledWith("rep_1");
    expect(mocks.listCommissionsFor).toHaveBeenCalledWith("rep_1");
    expect(mocks.commissionOverviewFor).toHaveBeenCalledWith("rep_1");
  });
});

describe("le tableau de bord de la grille progressive", () => {
  it("25 pharmacies activées : les vrais gains, la commission actuelle, le prochain bonus et l'objectif", async () => {
    // Ses vraies lignes : 25 commissions de grille (9 × 200 + 10 × 250 + 6 × 300 = 6 100 €), Bronze versé, Argent en attente.
    const rows = [
      ...Array.from({ length: 9 }, () => row({ amountCents: 20_000, status: "PAID", paidAt: new Date("2026-09-30T10:00:00Z") })),
      ...Array.from({ length: 10 }, () => row({ amountCents: 25_000 })),
      ...Array.from({ length: 6 }, () => row({ amountCents: 30_000 })),
      row({ type: "BONUS", bonusTier: 10, amountCents: 20_000, status: "PAID", paidAt: new Date("2026-09-30T10:00:00Z") }),
      row({ type: "BONUS", bonusTier: 25, amountCents: 35_000, status: "FORECAST" }),
      row({ type: "PROGRESSIVE", amountCents: 30_000, status: "FORECAST" }),
    ];
    mocks.listCommissionsFor.mockResolvedValue({ ...NO_COMMISSIONS, rows, thisMonthCents: 55_000 });
    mocks.commissionOverviewFor.mockResolvedValue({ rule: PROGRESSIVE, activations: activations(25), beforeGridTiers: [] });
    const html = await render();
    const content = text(html);

    expect(content).toContain("Mes commissions & bonus");
    // Gains cumulés = commissions acquises (6 100 €) + bonus acquis (200 €) ; le prévisionnel est « à venir ».
    expect(section(html, "gains-cumules")).toBeTruthy();
    expect(text(section(html, "gains-cumules"))).toContain("6 300 €");
    expect(text(section(html, "gains-cumules"))).toContain("6 100 € de commissions · 200 € de bonus");
    expect(text(section(html, "gains-cumules"))).toContain("+650 € à venir");
    // « Acquis ce mois » : ce qui est devenu acquis ce mois-ci (date d'acquisition), pas ce qui a été créé.
    expect(text(section(html, "gains-cumules"))).toContain("Acquis ce mois 550 €");
    // Le hero est sur le dégradé PROFOND (petit texte blanc lisible), jamais sur celui des boutons.
    expect(section(html, "gains-cumules")).toContain("bg-brand-gradient-deep");
    expect(content).toContain("Pharmacies activées");
    // « Bonus débloqués » : ce qui est acquis (200 €), et l'état de chaque palier atteint, jamais un simple compte.
    expect(content).toContain("Bonus débloqués 200 € 1 versé · 1 en attente du 1er paiement (+350 €)");
    expect(content).toContain("Commission actuelle 300 € par pharmacie · palier maximal atteint");
    expect(content).toContain("Prochain bonus Or +500 €");
    expect(content).toContain("Encore 25 pharmacies à activer.");
    expect(html).toMatch(/role="progressbar"[^>]*aria-valuenow="25"/);

    // Mes récompenses : Bronze versé, Argent en attente du premier paiement, Or et Élite à débloquer.
    const rewards = text(section(html, "mes-recompenses"));
    expect(rewards).toMatch(/Bronze 10 pharmacies \+200 € Versé/);
    expect(rewards).toMatch(/Argent 25 pharmacies \+350 € En attente du 1er paiement/);
    expect(rewards).toMatch(/Or 50 pharmacies \+500 € À débloquer encore 25 pharmacies/);
    expect(rewards).toMatch(/Élite 100 pharmacies \+750 € À débloquer encore 75 pharmacies/);

    // La grille, palier actuel en évidence.
    expect(content).toContain("Dès la 20e pharmacie");
    expect(html).toMatch(/aria-current="step"[^>]*>(?:(?!<li).)*Dès la 20e pharmacie/);

    // Le simulateur part du vrai total et calcule avec la grille.
    expect(content).toContain("Simulateur de gains");
    expect(html).toMatch(/type="range"[^>]*value="25"/);
    expect(content).toContain("6 650 €"); // 6 100 € + 550 € de bonus, à 25
    // Deux « totaux » ne se contredisent pas : au vrai total, le simulateur dit ce que sont les vrais gains, et pourquoi ils diffèrent.
    expect(content).toContain("Vos gains réels acquis : 6 300 € — 350 € de bonus attendent le 1er paiement.");
    expect(content).toContain("Mes 25 activations");
    expect(content).not.toContain("Mon total");
    expect(content).toContain("Simulation cumulative, hors charges. Bonus attribués une seule fois par palier.");
    // La prochaine activation : 300 € (aucun palier de bonus à la 26e).
    expect(content).toContain("Votre prochaine activation : +300 €");
    expect(html).toContain('aria-live="polite"');
  });

  it("le détail montre les bonus d'abord (par palier), sous leur nom, et ce que vaut chaque commission de grille", async () => {
    const first = row({ prospect: { id: "act_1", name: "Pharmacie du Parc", activatedAt: new Date("2026-01-01T10:00:00Z"), contracts: [] } });
    const argent = row({ type: "BONUS", bonusTier: 25, amountCents: 35_000, status: "FORECAST", prospect: { id: "act_25", name: "Pharmacie de la Gare", activatedAt: new Date(), contracts: [] } });
    const bronze = row({ type: "BONUS", bonusTier: 10, amountCents: 20_000, status: "EARNED", prospect: { id: "act_10", name: "Pharmacie du Port", activatedAt: new Date(), contracts: [] } });
    const forecast = row({ status: "FORECAST", amountCents: 25_000, prospect: { id: "pro_new", name: "Pharmacie Nouvelle", activatedAt: null, contracts: [] } });
    const signed = row({ status: "EARNED", amountCents: 30_000, prospect: { id: "pro_signed", name: "Pharmacie Signée", activatedAt: null, contracts: [] } });
    const elsewhere = row({ status: "EARNED", amountCents: 30_000, prospect: { id: "pro_moved", name: "Pharmacie Partie", activatedAt: new Date(), contracts: [] } });
    mocks.listCommissionsFor.mockResolvedValue({ ...NO_COMMISSIONS, rows: [first, argent, forecast, bronze, signed, elsewhere] });
    mocks.commissionOverviewFor.mockResolvedValue({ rule: PROGRESSIVE, activations: activations(25), beforeGridTiers: [] });
    const detail = text(section(await render(), "detail-commissions"));
    expect(detail).toContain("Bonus Bronze 10 pharmacies activées · Pharmacie du Port");
    expect(detail.indexOf("Bonus Bronze")).toBeLessThan(detail.indexOf("Bonus Argent"));
    expect(detail.indexOf("Bonus Argent")).toBeLessThan(detail.indexOf("Pharmacie du Parc"));
    expect(detail).toContain("Pharmacie du Parc 1re pharmacie activée");
    expect(detail).toContain("Pharmacie Nouvelle prévision, avant activation");
    // Acquise à la signature mais pas encore activée : le montant est provisoire, jamais « acquis » sans le dire.
    expect(detail).toContain("Pharmacie Signée montant provisoire, fixé à l'activation");
    expect(detail).toContain("Pharmacie Partie montant figé : activation créditée à un autre commercial");
    // Les montants s'écrivent comme dans le tableau de bord : « 200 € », pas « 200,00 € ».
    expect(detail).toContain("200 €");
    expect(detail).not.toMatch(/200,00/);
  });

  it("au-delà de 20 commissions : les bonus et les 20 plus récentes, le reste se déplie", async () => {
    const rows = [row({ type: "BONUS", bonusTier: 10, amountCents: 20_000 }), ...Array.from({ length: 23 }, (_, index) => row({ prospect: { id: `pro_x${index}`, name: `Officine numéro ${index}`, activatedAt: null, contracts: [] } }))];
    mocks.listCommissionsFor.mockResolvedValue({ ...NO_COMMISSIONS, rows });
    mocks.commissionOverviewFor.mockResolvedValue({ rule: PROGRESSIVE, activations: activations(10), beforeGridTiers: [] });
    const html = section(await render(), "detail-commissions");
    const summaryAt = html.indexOf("<summary");
    expect(summaryAt).toBeGreaterThan(0);
    expect(text(html)).toContain("Voir les 3 autres commissions");
    expect(html.indexOf("Officine numéro 19")).toBeLessThan(summaryAt);
    expect(html.indexOf("Officine numéro 20")).toBeGreaterThan(summaryAt);
  });

  it("premier jour (aucune activation, aucune commission) : pas un mur de zéros, mais ce que rapporte la 1re activation et où agir", async () => {
    const html = await render();
    const content = text(html);
    expect(content).toContain("Gains cumulés 0 €");
    expect(text(section(html, "gains-cumules"))).toContain("Votre 1re pharmacie activée vous rapporte 200 €. À 10, le bonus Bronze ajoute 200 €.");
    expect(section(html, "gains-cumules")).toContain('href="/extranet/pipeline"');
    expect(text(section(html, "gains-cumules"))).not.toContain("Déjà versé");
    expect(content).toContain("Encore 10 pharmacies à activer.");
    // Le palier suivant tombe sur le bonus : on ne répète pas « encore 10 ».
    expect(content).toContain("Dès la 10e pharmacie, chaque activation rapporte 250 €.");
    expect(content).not.toContain("(encore 10");
    expect(content).toContain("Commission actuelle 200 € par pharmacie · 250 € dès la 10e");
    expect(content).toContain("Bonus débloqués 0 € prochain : Bronze à 10 pharmacies");
    expect(content).toContain("Aucune commission pour l'instant");
    // Le simulateur part du premier palier (10 : 2 250 €), le vrai total reste à un clic.
    expect(html).toMatch(/type="range"[^>]*value="10"/);
    expect(content).toContain("2 250 €");
    expect(content).toContain("Aujourd'hui (0)");
  });

  it("à 9 activations : la prochaine vaut 450 € (250 € + bonus Bronze)", async () => {
    mocks.commissionOverviewFor.mockResolvedValue({ rule: PROGRESSIVE, activations: activations(9), beforeGridTiers: [] });
    mocks.listCommissionsFor.mockResolvedValue({ ...NO_COMMISSIONS, rows: Array.from({ length: 9 }, () => row({})) });
    const content = text(await render());
    expect(content).toContain("Votre prochaine activation : +450 € (250 € + bonus Bronze)");
  });

  it("un bonus annulé n'est pas « débloqué » ; un palier atteint avant la grille le dit", async () => {
    mocks.commissionOverviewFor.mockResolvedValue({ rule: PROGRESSIVE, activations: activations(30), beforeGridTiers: [10] });
    mocks.listCommissionsFor.mockResolvedValue({ ...NO_COMMISSIONS, rows: [row({ type: "BONUS", bonusTier: 25, amountCents: 35_000, status: "CANCELLED" })] });
    const html = await render();
    const content = text(html);
    expect(content).toContain("Bonus débloqués 0 € 1 atteint avant la grille");
    const rewards = text(section(html, "mes-recompenses"));
    expect(rewards).toMatch(/Bronze 10 pharmacies \+200 € Atteint avant la grille/);
    expect(rewards).toMatch(/Argent 25 pharmacies \+350 € Annulé/);
  });

  it("au-delà de 150 activations : le simulateur part du vrai total, sa borne le dépasse", async () => {
    mocks.commissionOverviewFor.mockResolvedValue({ rule: PROGRESSIVE, activations: activations(160), beforeGridTiers: [] });
    const html = await render();
    expect(html).toMatch(/type="range"[^>]*max="200"[^>]*value="160"/);
    expect(text(html)).toContain("Mes 160 activations");
    expect(text(html)).toContain("Les quatre paliers sont atteints");
    expect(text(html)).toContain("Tous atteints");
  });

  it("un accord particulier (pourcentage) : les vrais gains, mais ni grille, ni bonus, ni simulateur", async () => {
    mocks.commissionOverviewFor.mockResolvedValue({ rule: { type: "PERCENT", value: 1250 }, activations: activations(3), beforeGridTiers: [] });
    mocks.listCommissionsFor.mockResolvedValue({ ...NO_COMMISSIONS, rows: [row({ type: "PERCENT", amountCents: 18_900 })] });
    const content = text(await render());
    expect(content).toContain("Gains cumulés 189 €");
    expect(content).toContain("accord particulier");
    expect(content).toContain("12,5 % de la première année");
    expect(content).not.toContain("Simulateur de gains");
    expect(content).not.toContain("Mes récompenses");
  });
});

describe("Mes factures", () => {
  it("aucune facture : on le dit, sans rien inventer", async () => {
    const html = await render();
    expect(html).toContain("Mes factures");
    expect(html).toContain("Aucune facture enregistrée pour l&#x27;instant");
  });

  it("numéro, date, montant et statut de chaque facture, et rien d'autre", async () => {
    mocks.listInvoicesFor.mockResolvedValue([
      { id: "inv_1", number: "FA-014", issuedAt: new Date("2026-10-01T12:00:00Z"), amountCents: 75_000, status: "APPROVED" },
      { id: "inv_2", number: "FA-013", issuedAt: new Date("2026-09-02T12:00:00Z"), amountCents: 30_000, status: "PAID" },
      { id: "inv_3", number: "FA-012", issuedAt: new Date("2026-08-01T12:00:00Z"), amountCents: 10_000, status: "REJECTED" },
    ]);
    const html = await render();
    const invoices = section(html, "mes-factures");
    expect(invoices).toContain("FA-014");
    expect(invoices).toContain("01/10/2026");
    expect(invoices).toMatch(/750,00\s€/);
    expect(invoices).toContain("Validée");
    expect(invoices).toContain("Payée");
    expect(invoices).toContain("Refusée");
    // Pas de lien vers une fiche ni de fichier : le commercial lit, il ne touche à rien.
    expect(invoices).not.toContain("/directeur");
    expect(invoices).not.toContain("/api/");
    expect(invoices).not.toContain("<form");
    expect(invoices).not.toContain("<button");
    // Et nulle part sur la page : aucun formulaire, aucun lien vers l'espace du directeur ou une API.
    expect(html).not.toContain("<form");
    expect(html).not.toContain("/directeur");
    expect(html).not.toContain("/api/");
  });
});
