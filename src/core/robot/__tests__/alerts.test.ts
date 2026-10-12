import { describe, expect, it } from "vitest";
import { activeAlerts, isOpeningHours, moodForAlerts, parisWhen, robotAlerts, type AlertInput } from "../alerts";

const NOW = new Date("2026-10-13T08:00:00Z"); // mardi 10 h à Paris

function input(overrides: Partial<AlertInput> = {}): AlertInput {
  return {
    now: NOW,
    local: { hour: 10, weekday: 2 },
    can: { manageTeam: false, updateStock: false, manageSettings: false },
    isDemo: false,
    challenges: [],
    challengeHref: null,
    shortDates: [],
    stockStale: false,
    stockAgeDays: null,
    lastDeposit: null,
    posts: [],
    joinRequests: [],
    proposedBonuses: [],
    myReachedObjectives: [],
    teamReachedObjectives: [],
    supportUnread: 0,
    subscription: null,
    setup: null,
    training: null,
    ...overrides,
  };
}

const OWNER = { manageTeam: true, updateStock: true, manageSettings: true };
const silentSince = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

describe("le robot signale", () => {
  it("officine neuve sans données : rien à dire, robot au repos", () => {
    const alerts = robotAlerts(input({ can: OWNER }));
    expect(alerts).toEqual([]);
    expect(moodForAlerts(alerts)).toBe("idle");
  });

  it("le titulaire voit les gestes d'équipe ; un préparateur ne les voit pas", () => {
    const data = {
      joinRequests: [{ id: "jr1", name: "Léa Martin", suggestedRole: "TECHNICIAN", roleLabel: "Préparateur" }],
      proposedBonuses: [{ id: "b1", userName: "Léa Martin", label: "Solaires" }],
      teamReachedObjectives: [{ id: "o1", userName: "Paul", title: "20 conseils" }],
      subscription: { status: "PAST_DUE" },
      setup: { status: "TO_SCHEDULE" as const, scheduledAt: null },
      stockStale: true,
      stockAgeDays: 9,
      lastDeposit: { id: "d1", status: "FAILED", receivedAt: NOW },
    };
    const owner = robotAlerts(input({ ...data, can: OWNER }));
    expect(owner.map((a) => a.kind)).toEqual(["billing", "stock-deposit", "join-request", "bonus-to-validate", "stock", "team-objective-reached", "setup"]);
    expect(owner.find((a) => a.kind === "join-request")?.actions.map((a) => a.kind)).toEqual(["approve-join", "refuse-join"]);
    expect(owner.find((a) => a.kind === "join-request")?.actions[0]).toMatchObject({ id: "jr1", role: "TECHNICIAN" });
    expect(owner.find((a) => a.kind === "bonus-to-validate")?.actions).toEqual([{ kind: "validate-bonus", id: "b1", label: "Valider la prime" }]);

    const technician = robotAlerts(input({ ...data, can: { manageTeam: false, updateStock: false, manageSettings: false } }));
    expect(technician).toEqual([]);
  });

  it("en démonstration : ni geste d'équipe, ni rappel de stock", () => {
    const alerts = robotAlerts(input({ can: OWNER, isDemo: true, stockStale: true, joinRequests: [{ id: "jr1", name: "Léa", suggestedRole: "TECHNICIAN", roleLabel: "Préparateur" }] }));
    expect(alerts.map((a) => a.kind)).toEqual(["join-request"]);
    expect(alerts[0].actions).toEqual([]);
  });

  it("un poste muet : aux heures d'ouverture seulement, ni rangé depuis des jours, et pour qui en a la charge", () => {
    const posts = [
      { id: "p1", label: "Comptoir 1", lastSeenAt: silentSince(45), assignedToMe: false },
      { id: "p2", label: "Comptoir 2", lastSeenAt: silentSince(5), assignedToMe: true },
      { id: "p3", label: "Ancien poste", lastSeenAt: silentSince(5 * 24 * 60), assignedToMe: false },
    ];
    const owner = robotAlerts(input({ can: OWNER, posts }));
    expect(owner.map((a) => a.kind)).toEqual(["post-offline"]);
    expect(owner[0].text).toContain("Comptoir 1");
    expect(owner[0].text).not.toContain("Ancien poste");
    expect(moodForAlerts(owner)).toBe("concerned");

    // Le préparateur n'entend parler que de SON comptoir.
    expect(robotAlerts(input({ posts }))).toEqual([]);
    expect(robotAlerts(input({ posts: [{ ...posts[0], assignedToMe: true }] })).map((a) => a.kind)).toEqual(["post-offline"]);

    // Dimanche, ou à 22 h : le poste est éteint, c'est normal.
    expect(robotAlerts(input({ can: OWNER, posts, local: { hour: 10, weekday: 0 } }))).toEqual([]);
    expect(robotAlerts(input({ can: OWNER, posts, local: { hour: 22, weekday: 3 } }))).toEqual([]);
    expect(isOpeningHours({ hour: 8, weekday: 6 })).toBe(true);
  });

  it("toute l'équipe : dates courtes, réponse du support, challenge proche, objectif atteint, formation", () => {
    const alerts = robotAlerts(
      input({
        shortDates: [{ label: "Biafine", quantity: 3, daysLeft: 12 }, { label: "Avène", quantity: 2, daysLeft: 40 }],
        supportUnread: 2,
        challenges: [{ id: "c1", title: "Solaires", teamUnits: 18, milestones: [{ units: 20, reached: false }], target: null, daysRemaining: 5 }],
        challengeHref: "/m/challenges",
        myReachedObjectives: [{ id: "o2", title: "10 conseils" }],
        training: { title: "Bien démarrer", href: "/m/formations/x", mode: "start", percent: 0 },
      }),
    );
    expect(alerts.map((a) => a.kind)).toEqual(["support", "short-date", "objective-reached", "challenge", "training"]);
    expect(alerts.find((a) => a.kind === "short-date")?.text).toBe("5 boîtes en date courte à proposer en premier : Biafine, Avène (la plus proche dans 12 jours).");
    expect(alerts.find((a) => a.kind === "challenge")?.text).toBe("Plus que 2 ventes « Solaires » pour le palier de 20.");
    expect(alerts.every((a) => a.actions.length === 0)).toBe(true);
  });

  it("« Plus tard » écarte une alerte jusqu'à son échéance ; un impayé ne s'écarte pas", () => {
    const alerts = robotAlerts(input({ can: OWNER, supportUnread: 1, subscription: { status: "UNPAID" } }));
    const snoozed = Object.fromEntries(alerts.map((a) => [a.key, NOW.getTime() + 1000]));
    expect(activeAlerts(alerts, snoozed, NOW.getTime()).map((a) => a.kind)).toEqual(["billing"]);
    expect(activeAlerts(alerts, snoozed, NOW.getTime() + 2000).map((a) => a.kind)).toEqual(["billing", "support"]);
  });

  it("dit la date de la mise en service à l'heure de Paris", () => {
    expect(parisWhen(new Date("2026-10-15T12:30:00Z"))).toBe("jeudi 15 octobre à 14 h 30");
    const [setup] = robotAlerts(input({ can: OWNER, setup: { status: "SCHEDULED", scheduledAt: new Date("2026-10-15T07:00:00Z") } }));
    expect(setup.text).toBe("Votre mise en service est planifiée le jeudi 15 octobre à 9 h.");
  });
});
