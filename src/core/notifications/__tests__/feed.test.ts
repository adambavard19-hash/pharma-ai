import { describe, expect, it } from "vitest";
import { badgeLabel, buildFeed, groupSummary, categoryOf, dayBucket, entryIds, toneOf, whenLabel, type FeedItem } from "../feed";

const NOW = new Date("2026-10-11T14:00:00Z"); // 16 h à Paris
let n = 0;
const item = (over: Partial<FeedItem>): FeedItem => ({ id: `n${++n}`, type: "SYSTEM", severity: "INFO", title: "t", body: "b", linkUrl: null, createdAt: NOW, read: false, ...over });

describe("les jours de la cloche", () => {
  it("aujourd'hui, hier et plus tôt, au fuseau de Paris", () => {
    expect(dayBucket(new Date("2026-10-11T00:30:00Z"), NOW)).toBe("today"); // 2 h 30 à Paris
    expect(dayBucket(new Date("2026-10-10T21:30:00Z"), NOW)).toBe("yesterday"); // 23 h 30 la veille
    expect(dayBucket(new Date("2026-10-10T22:30:00Z"), NOW)).toBe("today"); // minuit et demi
    expect(dayBucket(new Date("2026-10-09T10:00:00Z"), NOW)).toBe("earlier");
  });

  it("le lendemain d'un changement d'heure reste « hier »", () => {
    const after = new Date("2026-10-26T09:00:00Z"); // lundi, heure d'hiver
    expect(dayBucket(new Date("2026-10-25T08:00:00Z"), after)).toBe("yesterday");
  });
});

describe("le fil", () => {
  it("regroupe les « stock faible » du même jour, garde les autres une par une", () => {
    const feed = buildFeed(
      [
        item({ type: "LOW_STOCK", body: "Gel : 2", createdAt: new Date("2026-10-11T08:00:00Z") }),
        item({ type: "LOW_STOCK", body: "Crème : 1", createdAt: new Date("2026-10-11T09:00:00Z"), read: true }),
        item({ type: "LOW_STOCK", body: "Lait : 3", createdAt: new Date("2026-10-11T10:00:00Z") }),
        item({ type: "TEAM_EVENT", createdAt: new Date("2026-10-11T11:00:00Z") }),
        item({ type: "OUT_OF_STOCK", createdAt: new Date("2026-10-11T07:00:00Z") }),
      ],
      NOW,
    );
    expect(feed).toHaveLength(1);
    const [today] = feed;
    expect(today.label).toBe("Aujourd'hui");
    expect(today.entries.map((entry) => (entry.kind === "group" ? entry.title : entry.item.type))).toEqual(["TEAM_EVENT", "3 produits en stock faible", "OUT_OF_STOCK"]);
    const group = today.entries[1];
    expect(group.kind === "group" && group.unread).toBe(2);
    expect(entryIds(group)).toHaveLength(3);
  });

  it("ne regroupe pas d'un jour sur l'autre, ni une alerte seule", () => {
    const feed = buildFeed([item({ type: "LOW_STOCK" }), item({ type: "LOW_STOCK", createdAt: new Date("2026-10-10T09:00:00Z") })], NOW);
    expect(feed.map((section) => section.bucket)).toEqual(["today", "yesterday"]);
    expect(feed.every((section) => section.entries.every((entry) => entry.kind === "single"))).toBe(true);
  });

  it("chaque notification n'apparaît qu'une fois, et une liste vide donne un fil vide", () => {
    const items = Array.from({ length: 7 }, (_, i) => item({ type: i % 2 ? "LOW_STOCK" : "SYSTEM", createdAt: new Date(NOW.getTime() - i * 36e5 * 10) }));
    const ids = buildFeed(items, NOW).flatMap((section) => section.entries.flatMap(entryIds));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(7);
    expect(buildFeed([], NOW)).toEqual([]);
  });
});

describe("l'allure d'une notification", () => {
  it("une catégorie que la personne reconnaît", () => {
    expect(categoryOf({ type: "SYSTEM", linkUrl: "/support/abc", severity: "INFO" })).toBe("support");
    expect(categoryOf({ type: "SYSTEM", linkUrl: "/parametres?onglet=abonnement", severity: "INFO" })).toBe("abonnement");
    expect(categoryOf({ type: "IMPORT_COMPLETED", linkUrl: "/connexion", severity: "SUCCESS" })).toBe("comptoir");
    expect(categoryOf({ type: "TEAM_EVENT", linkUrl: "/equipe", severity: "INFO" })).toBe("equipe");
  });

  it("un échec est toujours en rouge", () => {
    expect(toneOf({ type: "TEAM_EVENT", linkUrl: null, severity: "CRITICAL" })).toBe("danger");
    expect(toneOf({ type: "IMPORT_FAILED", linkUrl: null, severity: "WARNING" })).toBe("danger");
    expect(toneOf({ type: "LOW_STOCK", linkUrl: null, severity: "WARNING" })).toBe("warning");
  });

  it("le badge : rien à zéro, 9+ au-delà", () => {
    expect(badgeLabel(0)).toBeNull();
    expect(badgeLabel(4)).toBe("4");
    expect(badgeLabel(12)).toBe("9+");
  });
});

describe("quand, en clair", () => {
  it("dit la même chose que la section", () => {
    expect(whenLabel(new Date("2026-10-11T13:48:00Z"), NOW)).toBe("il y a 12 min");
    expect(whenLabel(new Date("2026-10-11T10:30:00Z"), NOW)).toBe("il y a 3 h");
    // 39 heures avant, mais la veille au calendrier : « hier », jamais « avant-hier ».
    expect(whenLabel(new Date("2026-10-10T06:36:00Z"), new Date("2026-10-11T21:40:00Z"))).toBe("hier à 08 h 36");
    expect(whenLabel(new Date("2026-10-09T08:05:00Z"), NOW)).toBe("ven. 9 oct. à 10 h 05");
    expect(whenLabel(new Date("2025-12-30T08:05:00Z"), NOW)).toContain("2025");
  });

  it("regroupe aussi les ventes avec des conseils à valider", () => {
    const feed = buildFeed([item({ type: "RECOMMENDATION_PENDING", linkUrl: "/vente/a" }), item({ type: "RECOMMENDATION_PENDING", linkUrl: "/vente/b" })], NOW);
    const [entry] = feed[0].entries;
    expect(entry.kind === "group" && [entry.title, entry.linkUrl]).toEqual(["2 ventes avec des conseils à valider", "/ventes"]);
  });
});

describe("le résumé d'un groupe", () => {
  it("des noms distincts, trois au plus, puis le reste", () => {
    expect(groupSummary(["A", "B", "A", null, "C", "D", "E"])).toBe("A, B, C et 2 autres");
    expect(groupSummary(["A", "B"])).toBe("A, B");
    expect(groupSummary([null])).toBe("");
  });

  it("le produit d'une alerte de stock, le numéro d'une vente", () => {
    const stock = buildFeed([item({ type: "LOW_STOCK", body: "Gel douche : 2 unité(s) restante(s)" }), item({ type: "LOW_STOCK", body: "Lait solaire : 1 unité(s)" }), item({ type: "OUT_OF_STOCK", body: "Échinacée est en rupture. Il ne sera plus proposé." }), item({ type: "OUT_OF_STOCK", body: "Échinacée est en rupture. Il ne sera plus proposé." })], NOW)[0].entries;
    expect(stock.map((entry) => entry.kind === "group" && entry.summary)).toEqual(["Gel douche, Lait solaire", "Échinacée"]);
    const sales = buildFeed([item({ type: "RECOMMENDATION_PENDING", body: "5 conseil(s) proposé(s) pour l'ordonnance ORD-0780." }), item({ type: "RECOMMENDATION_PENDING", body: "1 conseil(s) proposé(s) pour l'ordonnance ORD-0783." })], NOW)[0].entries;
    expect(sales[0].kind === "group" && sales[0].summary).toBe("ORD-0780, ORD-0783");
    // Deux alertes pour la même vente : une vente.
    const same = buildFeed([item({ type: "RECOMMENDATION_PENDING", body: "pour l'ordonnance ORD-0780." }), item({ type: "RECOMMENDATION_PENDING", body: "pour l'ordonnance ORD-0780." })], NOW)[0].entries[0];
    expect(same.kind === "group" && [same.title, same.items.length]).toEqual(["1 vente avec des conseils à valider", 2]);
  });

  it("« Poste de caisse relié » est un comptoir", () => {
    expect(categoryOf({ type: "IMPORT_COMPLETED", linkUrl: "/stock/connexion", severity: "SUCCESS" })).toBe("comptoir");
    expect(categoryOf({ type: "IMPORT_COMPLETED", linkUrl: "/stock", severity: "SUCCESS" })).toBe("import");
  });
});
