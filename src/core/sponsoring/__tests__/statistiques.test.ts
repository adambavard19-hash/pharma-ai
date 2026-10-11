import { describe, expect, it } from "vitest";
import { DedupeMemory, dedupeKey, EVENT_COLUMN, groupTotals, MAX_EVENTS_PER_BATCH, periodStart, sanitizeEvents, statDay, totalsOf, type StatRow } from "../stats";

/** Les compteurs des campagnes : agrégés, sans identité, protégés contre les doublons. */

const NOW = new Date("2026-10-11T15:30:00Z");
const ID = "cmv409gdd0006ahmscknpfr63";

describe("ce que l'écran peut envoyer", () => {
  it("garde les événements bien formés, sans doublon, et ignore tout champ en plus (dont une identité)", () => {
    const events = sanitizeEvents([
      { kind: "impression", campaignId: ID, placement: "HOME_FEED", userId: "u1", email: "x@y.fr" },
      { kind: "impression", campaignId: ID, placement: "HOME_FEED" },
      { kind: "click", campaignId: ID, placement: "HOME_FEED" },
      { kind: "achat", campaignId: ID, placement: "HOME_FEED" },
      { kind: "click", campaignId: "../../etc", placement: "HOME_FEED" },
      { kind: "click", campaignId: ID, placement: "PARTOUT" },
      null,
      "texte",
    ]);
    expect(events).toEqual([
      { kind: "impression", campaignId: ID, placement: "HOME_FEED" },
      { kind: "click", campaignId: ID, placement: "HOME_FEED" },
    ]);
    expect(Object.keys(events[0])).toEqual(["kind", "campaignId", "placement"]);
  });

  it("borne la taille d'un lot", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ kind: "impression", campaignId: `${ID.slice(0, 20)}${String(i).padStart(4, "0")}`, placement: "HOME_FEED" }));
    expect(sanitizeEvents(many).length).toBe(MAX_EVENTS_PER_BATCH);
    expect(sanitizeEvents("pas un tableau")).toEqual([]);
  });
});

describe("dédoublonnage sans identité", () => {
  const event = { kind: "impression" as const, campaignId: ID, placement: "HOME_FEED" as const };

  it("une empreinte SHA-256 qui ne contient pas la session, et qui change chaque jour", () => {
    const key = dedupeKey("session-secrete", event, statDay(NOW));
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain("session-secrete");
    const tomorrow = new Date(statDay(NOW).getTime() + 86_400_000);
    expect(dedupeKey("session-secrete", event, tomorrow)).not.toBe(key);
    expect(dedupeKey("autre-session", event, statDay(NOW))).not.toBe(key);
  });

  it("une même session ne compte qu'une fois par jour ; une autre session compte", () => {
    const memory = new DedupeMemory();
    const day = statDay(NOW);
    expect(memory.firstTime(dedupeKey("s1", event, day), NOW.getTime())).toBe(true);
    expect(memory.firstTime(dedupeKey("s1", event, day), NOW.getTime() + 1000)).toBe(false);
    expect(memory.firstTime(dedupeKey("s2", event, day), NOW.getTime())).toBe(true);
  });

  it("la mémoire est bornée", () => {
    const memory = new DedupeMemory(3);
    for (const key of ["a", "b", "c", "d"]) memory.firstTime(key, 0);
    expect(memory.firstTime("a", 1)).toBe(true);
  });
});

describe("agrégats", () => {
  const row = (overrides: Partial<StatRow>): StatRow => ({ campaignId: "c1", placement: "HOME_FEED", day: statDay(NOW), impressions: 0, clicks: 0, views: 0, trainingsStarted: 0, trainingsCompleted: 0, infoRequests: 0, ...overrides });

  it("totaux et taux de clic ; pas de taux sans impression", () => {
    const totals = totalsOf([row({ impressions: 80, clicks: 4 }), row({ placement: "DISCOVER_TOP", impressions: 20, clicks: 6, views: 3 })]);
    expect(totals).toMatchObject({ impressions: 100, clicks: 10, views: 3, ctr: 0.1 });
    expect(totalsOf([]).ctr).toBeNull();
  });

  it("par emplacement", () => {
    const groups = groupTotals([row({ impressions: 5 }), row({ impressions: 7 }), row({ placement: "DISCOVER_TOP", impressions: 1 })], (r) => r.placement);
    expect(groups.map((g) => [g.key, g.totals.impressions])).toEqual([["HOME_FEED", 12], ["DISCOVER_TOP", 1]]);
  });

  it("une ligne de statistique n'a AUCUN champ de personne", () => {
    expect(Object.keys(row({}))).not.toEqual(expect.arrayContaining(["userId"]));
    expect(Object.values(EVENT_COLUMN)).toEqual(["impressions", "clicks", "views", "trainingsStarted", "trainingsCompleted", "infoRequests"]);
  });

  it("périodes : jour UTC, 7 jours inclus", () => {
    expect(statDay(NOW).toISOString()).toBe("2026-10-11T00:00:00.000Z");
    expect(periodStart("7j", NOW)?.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(periodStart("tout", NOW)).toBeNull();
  });
});
