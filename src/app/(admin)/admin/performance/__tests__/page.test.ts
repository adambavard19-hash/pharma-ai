import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PortfolioHealth, PortfolioRow, SubscriptionReturn } from "@/core/performance/types";

/**
 * Le portefeuille de la console, rendu côté serveur sans navigateur ni base :
 * session console et service simulés. On lit le texte rendu, pas le balisage.
 */

const mocks = vi.hoisted(() => ({ requirePlatformSession: vi.fn(), loadPortfolioForPlatform: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/platform-session", () => ({ requirePlatformSession: mocks.requirePlatformSession }));
vi.mock("@/server/services/performance", () => ({ loadPortfolioForPlatform: mocks.loadPortfolioForPlatform }));

const page = await import("../page");
const { ETAT_FILTERS, etatFromParam, countByHealth } = await import("../_components/etat");
const { HEALTH_LABELS } = await import("@/core/performance/portfolio");
const { formatCents, formatCentsCompact } = await import("@/lib/format");
const { pctText } = await import("@/core/performance");
const { formatRate } = await import("@/components/performance/format");

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/[\s  ]+/g, " ");

const render = async (query: Record<string, string | string[] | undefined> = {}) => renderToStaticMarkup((await page.default({ searchParams: Promise.resolve(query) })) as never);
/** Le tableau seul (grand écran) : les noms y sont une fois, dans l'ordre du calcul. */
const tableOf = (html: string) => html.slice(html.indexOf("<table"), html.indexOf("</table>") + "</table>".length);
/** La liste de cartes seule (mobile). */
const cardsOf = (html: string) => html.slice(html.indexOf('<ul class="space-y-3 lg:hidden"'), html.lastIndexOf("</ul>") + "</ul>".length);

const NOW = new Date("2026-10-12T10:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

const shown = (overrides: Partial<Extract<SubscriptionReturn, { status: "shown" }>> = {}): SubscriptionReturn => ({
  status: "shown",
  monthLabel: "octobre 2026",
  monthlyPriceHtCents: 12_600,
  trialing: false,
  confirmedTtcCents: 128_700,
  confirmedHtCents: 53_000,
  confirmedLines: 14,
  pricedShare: 1,
  ratio: 4.2,
  ratioLabel: "4,2 fois",
  sentence: "PharmaBoost a généré 4,2 fois le montant de votre abonnement en ventes confirmées ce mois-ci.",
  ...overrides,
});

const hidden = (detail = "Moins de 5 ventes confirmées au prix connu ce mois-ci."): SubscriptionReturn => ({ status: "hidden", reason: "not_enough_sales", detail });

const row = (overrides: Partial<PortfolioRow> = {}): PortfolioRow => ({
  pharmacyId: "ph_1",
  name: "Pharmacie du Parc",
  city: "Lyon",
  createdAt: new Date("2026-01-10T09:00:00Z"),
  subscription: { status: "ACTIVE", monthlyPriceHtCents: 12_600 },
  proposed: 34,
  accepted: 21,
  decided: 30,
  purchased: 12,
  confirmedTtcCents: 128_700,
  previousConfirmedTtcCents: 100_000,
  unpricedConfirmedLines: 0,
  recentAnalyses: 40,
  lastProposalAt: daysAgo(1),
  lastSaleAt: daysAgo(2),
  roi: shown(),
  acceptanceRate: 0.7,
  deltaPct: 28.7,
  health: "on_track",
  reasons: [],
  priority: 10,
  ...overrides,
});

const totalsFor = (rows: PortfolioRow[], overrides: Record<string, number> = {}) => ({
  pharmacies: rows.length,
  withConfirmedSales: rows.filter((r) => r.confirmedTtcCents > 0).length,
  confirmedTtcCents: rows.reduce((sum, r) => sum + r.confirmedTtcCents, 0),
  highValue: rows.filter((r) => r.health === "high_value").length,
  needsSupport: rows.filter((r) => r.health === "needs_support").length,
  ...overrides,
});

const serve = (rows: PortfolioRow[], overrides: Record<string, number> = {}) => mocks.loadPortfolioForPlatform.mockResolvedValue({ rows, totals: totalsFor(rows, overrides), generatedAt: NOW });

/** Un portefeuille de trois officines, déjà rangé par le calcul : à accompagner, en route, forte valeur. */
const portfolio = () => [
  row({
    pharmacyId: "ph_support",
    name: "Pharmacie Arrêtée",
    city: "Brest",
    health: "needs_support",
    reasons: ["Utilisation arrêtée depuis 9 jours", "Conseils peu retenus"],
    proposed: 0,
    accepted: 0,
    purchased: 0,
    confirmedTtcCents: 0,
    previousConfirmedTtcCents: 0,
    deltaPct: null,
    acceptanceRate: null,
    lastProposalAt: daysAgo(9),
    lastSaleAt: null,
    roi: hidden("Aucune vente confirmée ce mois-ci."),
    priority: 90,
  }),
  row({ pharmacyId: "ph_track", name: "Pharmacie Régulière", city: "Nantes", health: "on_track", priority: 20 }),
  row({ pharmacyId: "ph_value", name: "Pharmacie Rayonnante", city: "Lille", health: "high_value", roi: shown({ ratio: 9.3, ratioLabel: "9,3 fois" }), priority: 5 }),
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mocks.requirePlatformSession.mockResolvedValue({ admin: { id: "adm_1" } });
  serve(portfolio());
});

describe("l'accès", () => {
  it("passe d'abord par la session console : sans session, aucune lecture du portefeuille", async () => {
    mocks.requirePlatformSession.mockRejectedValue(new Error("NEXT_REDIRECT /admin-connexion"));
    await expect(render()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.loadPortfolioForPlatform).not.toHaveBeenCalled();
  });

  it("lit le portefeuille une seule fois, à l'instant présent", async () => {
    await render({ etat: "forte-valeur" });
    expect(mocks.loadPortfolioForPlatform).toHaveBeenCalledTimes(1);
    expect(mocks.loadPortfolioForPlatform).toHaveBeenCalledWith({ now: NOW });
  });
});

describe("l'en-tête chiffré", () => {
  it("donne les officines mesurées, le CA confirmé du mois, la forte valeur et l'accompagnement", async () => {
    serve(portfolio(), { pharmacies: 40, withConfirmedSales: 12, confirmedTtcCents: 1_287_000, highValue: 3, needsSupport: 5 });
    const html = await render();
    const content = text(html);
    expect(content).toMatch(/Officines mesurées\s*12\b/);
    expect(content).toContain("sur 40 officines clientes, avec au moins une vente confirmée en octobre 2026");
    expect(content).toContain("CA confirmé en octobre 2026");
    expect(content).toContain(text(formatCentsCompact(1_287_000)));
    expect(content).toMatch(new RegExp(`${HEALTH_LABELS.high_value}\\s*3\\b`));
    expect(content).toMatch(new RegExp(`${HEALTH_LABELS.needs_support}\\s*5\\b`));
  });

  it("chaque classe de l'en-tête mène à sa liste", async () => {
    const html = await render();
    expect(html).toContain('href="/admin/performance?etat=forte-valeur"');
    expect(html).toContain('href="/admin/performance?etat=a-accompagner"');
  });

  it("« à accompagner » passe en orange et « forte valeur » en vert seulement au-dessus de zéro", async () => {
    const some = await render();
    expect(some).toMatch(/border-warning-100[^"]*"[^>]*href="\/admin\/performance\?etat=a-accompagner"/);
    serve([row()], { highValue: 0, needsSupport: 0 });
    const none = await render();
    expect(none).not.toContain("border-warning-100");
    expect(text(none)).toContain("Aucune officine ne demande d'aide");
  });

  it("un seul client : les accords du singulier", async () => {
    serve([row()], { pharmacies: 1, withConfirmedSales: 1 });
    expect(text(await render())).toContain("sur 1 officine cliente, avec au moins une vente confirmée");
  });
});

describe("le tableau, rangé par le calcul", () => {
  it("une ligne par officine, dans l'ordre du service (à voir en premier d'abord), chacune liée à son onglet Performance", async () => {
    const html = await render();
    const table = tableOf(html);
    const content = text(table);
    expect(content.indexOf("Pharmacie Arrêtée")).toBeLessThan(content.indexOf("Pharmacie Régulière"));
    expect(content.indexOf("Pharmacie Régulière")).toBeLessThan(content.indexOf("Pharmacie Rayonnante"));
    expect(table.match(/<tr/g)).toHaveLength(4);
    for (const id of ["ph_support", "ph_track", "ph_value"]) expect(table).toContain(`href="/admin/pharmacies/${id}?onglet=performance"`);
  });

  it("garde l'ordre du service même quand les priorités sont inversées dans les données", async () => {
    serve([...portfolio()].reverse());
    const content = text(tableOf(await render()));
    expect(content.indexOf("Pharmacie Rayonnante")).toBeLessThan(content.indexOf("Pharmacie Régulière"));
    expect(content.indexOf("Pharmacie Régulière")).toBeLessThan(content.indexOf("Pharmacie Arrêtée"));
  });

  it("chaque officine porte sa pastille de santé et ses raisons en clair", async () => {
    const content = text(tableOf(await render()));
    expect(content).toContain(HEALTH_LABELS.needs_support);
    expect(content).toContain(HEALTH_LABELS.on_track);
    expect(content).toContain(HEALTH_LABELS.high_value);
    expect(content).toContain("Utilisation arrêtée depuis 9 jours");
    expect(content).toContain("Conseils peu retenus");
  });

  it("les colonnes disent les conseils, les conseils achetés, le CA TTC du mois et sa variation", async () => {
    const content = text(tableOf(await render({ etat: "en-route" })));
    expect(content).toContain("Pharmacie Régulière");
    expect(content).toContain("Nantes");
    expect(content).toContain("34 proposés");
    expect(content).toContain("21 acceptés · 70 %");
    expect(content).toContain(text(formatCents(128_700)));
    expect(content).toContain("+29 % vs mois dernier");
  });

  it.each([
    ["20 sur 32 tranchés", 20, 32, "63 %"],
    ["23 sur 40 tranchés", 23, 40, "58 %"],
    ["29 sur 200 tranchés", 29, 200, "15 %"],
    ["57 sur 200 tranchés", 57, 200, "29 %"],
    ["21 sur 30 tranchés", 21, 30, "70 %"],
    ["tout accepté", 12, 12, "100 %"],
  ])("le taux d'acceptation est au pourcent entier, comme le tableau de bord de la fiche : %s → %s", async (_, accepted, decided, expected) => {
    serve([row({ proposed: decided + 2, accepted, decided, acceptanceRate: accepted / decided })]);
    const html = await render();
    for (const zone of [tableOf(html), cardsOf(html)]) {
      expect(text(zone)).toContain(`${accepted} acceptés · ${expected}`);
      expect(text(zone)).not.toMatch(/\d,\d %/);
    }
    // Un seul arrondi partout : la console dit la même chose que l'interface de l'officine (formatRate) et que le cœur (pctText).
    expect(text(pctText(accepted / decided))).toBe(expected);
    expect(text(formatRate(accepted / decided))).toBe(expected);
  });

  it("jamais de décimale : 62,5 % n'existe pas dans la console", async () => {
    serve([row({ accepted: 20, decided: 32, proposed: 34, acceptanceRate: 0.625 })]);
    const content = text(tableOf(await render()));
    expect(content).toContain("20 acceptés · 63 %");
    expect(content).not.toContain("62,5");
  });

  it("sans taux (aucun conseil tranché) : le nombre d'acceptés seul, sans pourcentage inventé", async () => {
    serve([row({ proposed: 2, accepted: 0, decided: 0, acceptanceRate: null })]);
    const content = text(tableOf(await render()));
    expect(content).toContain("2 proposés");
    expect(content).toMatch(/0 accepté(?! ·)/);
    expect(content).not.toContain("NaN");
  });

  it("une baisse est rouge avec le vrai signe moins ; une stabilité n'a ni flèche ni couleur d'alerte", async () => {
    serve([row({ pharmacyId: "a", name: "A", deltaPct: -12.4 }), row({ pharmacyId: "b", name: "B", deltaPct: 0.2 })]);
    const table = tableOf(await render());
    expect(text(table)).toContain("−12 % vs mois dernier");
    expect(table).toMatch(/text-danger-700[^>]*>(?:<svg[^>]*>.*?<\/svg>)?−12/);
    expect(text(table)).toContain("0 % vs mois dernier");
  });

  it("sans période de comparaison (rien le mois dernier) : aucun pourcentage inventé", async () => {
    serve([row({ deltaPct: null, previousConfirmedTtcCents: 0, confirmedTtcCents: 50_000 })]);
    const content = text(tableOf(await render()));
    expect(content).toContain("rien le mois dernier");
    expect(content).not.toContain("Infinity");
    expect(content).not.toContain("NaN");
  });

  it("une officine sans aucun conseil ce mois-ci le dit, sans taux ni pourcentage", async () => {
    const content = text(tableOf(await render({ etat: "a-accompagner" })));
    expect(content).toContain("Aucun conseil ce mois-ci");
    expect(content).not.toContain("0 proposé");
    expect(content).not.toContain("NaN");
  });

  it("la colonne compte des CONSEILS ACHETÉS : « Ventes confirmées » (des tickets) n'y figure plus, ni sur le tableau ni sur les cartes", async () => {
    const html = await render();
    const headers = [...tableOf(html).matchAll(/<th[^>]*>(.*?)<\/th>/g)].map((match) => text(match[1]).trim());
    expect(headers).toEqual(["Officine", "État", "Conseils", "Conseils achetés", "CA TTC du mois", "Retour sur abonnement", "Dernière activité"]);
    expect(text(cardsOf(html))).toContain("Conseils achetés");
    expect(text(tableOf(html))).not.toContain("Ventes confirmées");
    expect(text(cardsOf(html))).not.toContain("Ventes confirmées");
  });

  it("les lignes de vente sans prix sont dites dans leur unité, à côté des conseils achetés, hors chiffre d'affaires", async () => {
    serve([row({ purchased: 12, unpricedConfirmedLines: 3 }), row({ pharmacyId: "ph_2", name: "B", unpricedConfirmedLines: 0 })]);
    const content = text(tableOf(await render()));
    expect(content).toContain("dont 3 lignes de vente sans prix (hors CA)");
    expect(content).not.toMatch(/dont 3 sans prix/);
    expect(content.match(/sans prix/g)).toHaveLength(1);
  });

  it("une seule ligne sans prix : « 1 ligne de vente » au singulier", async () => {
    serve([row({ unpricedConfirmedLines: 1 })]);
    const content = text(tableOf(await render()));
    expect(content).toContain("dont 1 ligne de vente sans prix (hors CA)");
    expect(content).not.toContain("lignes de vente");
  });

  it("deux ventes d'un même conseil : 1 conseil acheté et 2 lignes sans prix, deux unités qui ne se lisent plus l'une dans l'autre", async () => {
    serve([row({ purchased: 1, unpricedConfirmedLines: 2 })]);
    const html = await render();
    const cell = /<td[^>]*>(?:(?!<\/td>).)*dont 2 lignes de vente sans prix(?:(?!<\/td>).)*<\/td>/s.exec(tableOf(html))?.[0] ?? "";
    expect(text(cell).trim()).toBe("1 dont 2 lignes de vente sans prix (hors CA)");
    // Sur mobile, la même cellule.
    expect(text(cardsOf(html))).toContain("dont 2 lignes de vente sans prix (hors CA)");
  });

  it("dernier conseil et dernière vente en relatif, « aucune » quand il n'y en a jamais eu", async () => {
    const html = await render({ etat: "a-accompagner" });
    const table = tableOf(html);
    expect(table).toMatch(new RegExp(`dateTime="${daysAgo(9).toISOString()}"`, "i"));
    expect(text(table)).toMatch(/Conseil : il y a 9 jours/);
    expect(text(table)).toContain("Vente : aucune");
  });
});

describe("le retour sur abonnement", () => {
  it("affiche « 4,2 fois » quand le calcul est fiable, avec la précision de l'essai", async () => {
    serve([row({ pharmacyId: "a", name: "A", roi: shown() }), row({ pharmacyId: "b", name: "B", roi: shown({ ratio: 0.6, ratioLabel: "0,6 fois", trialing: true }) })]);
    const content = text(tableOf(await render()));
    expect(content).toContain("4,2 fois");
    expect(content).toContain("le prix de l'abonnement");
    // En dessous de 1, on le dit tel quel : pas de maquillage.
    expect(content).toContain("0,6 fois");
    expect(content).toContain("le prix de l'abonnement après essai");
  });

  it("« Non mesurable » quand le calcul est masqué : la raison en infobulle, jamais un ratio douteux", async () => {
    const table = tableOf(await render({ etat: "a-accompagner" }));
    expect(text(table)).toContain("Non mesurable");
    expect(table).toContain('title="Aucune vente confirmée ce mois-ci."');
    expect(text(table)).not.toMatch(/\d fois/);
  });

  it("sur mobile, la raison d'un calcul masqué est écrite en clair (pas d'infobulle au toucher)", async () => {
    const cards = text(cardsOf(await render({ etat: "a-accompagner" })));
    expect(cards).toContain("Non mesurable");
    expect(cards).toContain("Aucune vente confirmée ce mois-ci.");
  });
});

describe("les cartes (mobile)", () => {
  it("une carte par officine, dans le même ordre que le tableau, avec le même lien et les mêmes raisons", async () => {
    const html = await render();
    const cards = cardsOf(html);
    expect(cards.match(/<li class="rounded-2xl/g)).toHaveLength(3);
    const content = text(cards);
    expect(content.indexOf("Pharmacie Arrêtée")).toBeLessThan(content.indexOf("Pharmacie Régulière"));
    expect(content.indexOf("Pharmacie Régulière")).toBeLessThan(content.indexOf("Pharmacie Rayonnante"));
    expect(cards).toContain('href="/admin/pharmacies/ph_support?onglet=performance"');
    expect(content).toContain("Utilisation arrêtée depuis 9 jours");
    expect(content).toContain("Conseils");
    expect(content).toContain("Conseils achetés");
    expect(content).toContain("CA TTC du mois");
    expect(content).toContain("Retour sur abonnement");
    expect(content).toContain("Dernière activité");
  });

  it("le tableau n'apparaît que sur grand écran, les cartes en dessous", async () => {
    const html = await render();
    expect(html.slice(0, html.indexOf("<table"))).toMatch(/class="[^"]*hidden lg:block[^"]*"\s*>\s*$/);
    expect(cardsOf(html)).toContain("lg:hidden");
  });
});

describe("les filtres par classe (?etat=)", () => {
  it("sans filtre : toutes les officines ; les pastilles portent les effectifs de chaque classe", async () => {
    const html = await render();
    const content = text(html);
    expect(content).toMatch(/Toutes\s*3\b/);
    expect(content).toMatch(new RegExp(`${HEALTH_LABELS.needs_support}\\s*1\\b`));
    expect(content).toMatch(new RegExp(`${HEALTH_LABELS.getting_started}\\s*0\\b`));
    expect(html).toMatch(/aria-current="true"[^>]*href="\/admin\/performance"|href="\/admin\/performance"[^>]*aria-current="true"/);
    expect(tableOf(html).match(/<tr/g)).toHaveLength(4);
  });

  it("chaque valeur de l'adresse ne garde que les officines de sa classe", async () => {
    const cases: [string, string[]][] = [
      ["a-accompagner", ["Pharmacie Arrêtée"]],
      ["en-route", ["Pharmacie Régulière"]],
      ["forte-valeur", ["Pharmacie Rayonnante"]],
    ];
    for (const [etat, names] of cases) {
      const table = text(tableOf(await render({ etat })));
      for (const name of ["Pharmacie Arrêtée", "Pharmacie Régulière", "Pharmacie Rayonnante"]) {
        if (names.includes(name)) expect(table).toContain(name);
        else expect(table).not.toContain(name);
      }
    }
  });

  it("garde l'ordre du calcul dans une classe qui compte plusieurs officines", async () => {
    serve([row({ pharmacyId: "a", name: "Zèbre", health: "needs_support", priority: 95 }), row({ pharmacyId: "b", name: "Abeille", health: "needs_support", priority: 90 }), row({ pharmacyId: "c", name: "Autre", health: "on_track" })]);
    const content = text(tableOf(await render({ etat: "a-accompagner" })));
    expect(content.indexOf("Zèbre")).toBeLessThan(content.indexOf("Abeille"));
    expect(content).not.toContain("Autre");
  });

  it("la pastille courante est marquée, et les autres mènent à leur filtre", async () => {
    const html = await render({ etat: "forte-valeur" });
    expect(html).toMatch(/aria-current="true"[^>]*href="\/admin\/performance\?etat=forte-valeur"|href="\/admin\/performance\?etat=forte-valeur"[^>]*aria-current="true"/);
    expect(html).toContain('href="/admin/performance?etat=a-accompagner"');
    expect(html).toContain('href="/admin/performance?etat=sans-donnees"');
  });

  it("une valeur inconnue (ou hostile) montre toutes les officines, sans erreur", async () => {
    for (const etat of ["n-importe-quoi", "<script>", "needs_support", ""]) {
      expect(tableOf(await render({ etat })).match(/<tr/g)).toHaveLength(4);
    }
  });

  it("un paramètre répété : seule la première valeur compte", async () => {
    expect(tableOf(await render({ etat: ["forte-valeur", "a-accompagner"] })).match(/<tr/g)).toHaveLength(2);
  });

  it("les aides : mots de l'adresse, classes et effectifs", () => {
    expect(ETAT_FILTERS.map((filter) => filter.health).sort()).toEqual(["getting_started", "high_value", "needs_support", "no_data", "on_track"]);
    expect(etatFromParam("a-accompagner")?.health).toBe("needs_support");
    expect(etatFromParam("forte-valeur")?.health).toBe("high_value");
    expect(etatFromParam("demarrage")?.health).toBe("getting_started");
    expect(etatFromParam("sans-donnees")?.health).toBe("no_data");
    expect(etatFromParam("en-route")?.health).toBe("on_track");
    expect(etatFromParam("autre")).toBeNull();
    expect(etatFromParam(null)).toBeNull();
    const health: PortfolioHealth[] = ["high_value", "high_value", "no_data"];
    expect(countByHealth(health.map((h) => ({ health: h })))).toEqual({ high_value: 2, on_track: 0, needs_support: 0, getting_started: 0, no_data: 1 });
  });
});

describe("les états vides, honnêtes", () => {
  it("aucune officine cliente : on le dit, sans tableau ni carte", async () => {
    serve([]);
    const html = await render();
    expect(text(html)).toContain("Aucune officine cliente pour l'instant");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("lg:hidden");
    expect(text(html)).not.toContain("Aucune vente confirmée en octobre 2026 pour l'instant");
  });

  it("un filtre sans officine : on le dit et on propose de tout voir", async () => {
    const html = await render({ etat: "sans-donnees" });
    const content = text(html);
    expect(content).toContain("Aucune officine dans cette catégorie");
    expect(content).toContain("Voir toutes les officines");
    expect(html).toMatch(/<a[^>]*href="\/admin\/performance"[^>]*>Voir toutes les officines/);
    expect(html).not.toContain("<table");
  });

  it("des officines mais aucune vente confirmée : on dit que rien n'est estimé", async () => {
    serve([row({ confirmedTtcCents: 0, previousConfirmedTtcCents: 0, purchased: 0, deltaPct: null, roi: hidden("Aucune vente confirmée ce mois-ci."), health: "no_data", reasons: ["Aucun conseil proposé pour l'instant"] })]);
    const content = text(await render());
    expect(content).toContain("Aucune vente confirmée en octobre 2026 pour l'instant");
    expect(content).toContain("rien n'est estimé");
    expect(content).toMatch(/Officines mesurées\s*0\b/);
    expect(content).toContain("Aucun conseil proposé pour l'instant");
  });

  it("dès qu'une officine a une vente confirmée, l'avis disparaît", async () => {
    expect(text(await render())).not.toContain("Aucune vente confirmée en octobre 2026 pour l'instant");
  });
});

describe("la note de méthode du pied de page", () => {
  it("dit la période, l'heure du calcul, ce que PharmaBoost lit et ce qu'il ne lit pas", async () => {
    const content = text(await render());
    expect(content).toContain("Du 1er du mois à maintenant (octobre 2026), calculé le 12/10/2026 12:00");
    expect(content).toContain("PharmaBoost ne lit pas la caisse du logiciel de gestion");
    expect(content).toContain("jamais qu'il est faible");
  });

  it("dit l'unité de chaque colonne : conseils achetés d'un côté, lignes de vente au prix saisi de l'autre", async () => {
    const content = text(await render());
    expect(content).toContain("« Conseils achetés » compte les conseils qui ont donné lieu à une vente");
    expect(content).toContain("le chiffre d'affaires ne compte que les lignes de vente au prix saisi");
  });
});
