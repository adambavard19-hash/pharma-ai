import { describe, expect, it } from "vitest";
import { ACTIVITY_DAYS, ACTIVITY_EVENT_TYPES, HISTORY_REFUSAL, activityEntry, activitySince, commissionInputFromStored, deletionRefusal, footprintParts, groupByStage, invitationKind, parisMonthStart, parseCommissionInput, parseTeamStatus, teamSearchWhere } from "../team";

/** Les règles pures de l'équipe vue par le directeur : dates, invitation, recherche, commission, suppression, fil d'activité. */

describe("le début du mois, à l'heure de Paris", () => {
  it("en été (UTC+2), le 1er octobre commence à 22 h UTC la veille", () => {
    expect(parisMonthStart(new Date("2026-10-15T10:00:00Z")).toISOString()).toBe("2026-09-30T22:00:00.000Z");
  });

  it("en hiver (UTC+1), le 1er janvier commence à 23 h UTC la veille", () => {
    expect(parisMonthStart(new Date("2026-01-20T10:00:00Z")).toISOString()).toBe("2025-12-31T23:00:00.000Z");
  });

  it("à minuit passé à Paris, on est déjà dans le mois suivant (même si l'heure UTC est encore celle d'avant)", () => {
    // 31 octobre 23 h 30 UTC = 1er novembre 0 h 30 à Paris (heure d'été jusqu'au 25 octobre : UTC+1 depuis).
    expect(parisMonthStart(new Date("2026-10-31T23:30:00Z")).toISOString()).toBe("2026-10-31T23:00:00.000Z");
    // 30 septembre 22 h 30 UTC = 1er octobre 0 h 30 à Paris (UTC+2).
    expect(parisMonthStart(new Date("2026-09-30T22:30:00Z")).toISOString()).toBe("2026-09-30T22:00:00.000Z");
  });

  it("la fenêtre d'activité remonte de 30 jours exactement", () => {
    expect(ACTIVITY_DAYS).toBe(30);
    expect(activitySince(new Date("2026-10-31T12:00:00Z")).toISOString()).toBe("2026-10-01T12:00:00.000Z");
  });
});

describe("l'invitation", () => {
  const date = new Date("2026-10-01T09:00:00Z");
  it("jamais invité, invité sans connexion, connecté", () => {
    expect(invitationKind({ invitedAt: null, lastLoginAt: null })).toBe("NEVER");
    expect(invitationKind({ invitedAt: date, lastLoginAt: null })).toBe("SENT");
    expect(invitationKind({ invitedAt: date, lastLoginAt: date })).toBe("CONNECTED");
    // Une connexion prouve que l'accès marche, même sans date d'invitation (compte créé autrement).
    expect(invitationKind({ invitedAt: null, lastLoginAt: date })).toBe("CONNECTED");
  });
});

describe("la recherche et le filtre", () => {
  it("sans mot, rien n'est filtré ; chaque mot doit se retrouver quelque part", () => {
    expect(teamSearchWhere("")).toEqual({});
    expect(teamSearchWhere("   ")).toEqual({});
    expect(teamSearchWhere(null)).toEqual({});
    const where = teamSearchWhere(" dupont  lyon ");
    expect(where.AND).toHaveLength(2);
    expect((where.AND as { OR: unknown[] }[])[0].OR).toEqual([
      { firstName: { contains: "dupont", mode: "insensitive" } },
      { lastName: { contains: "dupont", mode: "insensitive" } },
      { email: { contains: "dupont", mode: "insensitive" } },
      { zone: { contains: "dupont", mode: "insensitive" } },
    ]);
  });

  it("borne le nombre de mots", () => {
    expect((teamSearchWhere("a b c d e f g h").AND as unknown[]).length).toBe(5);
  });

  it("le filtre d'adresse ne connaît que « actifs » et « inactifs »", () => {
    expect(parseTeamStatus("actifs")).toBe("actifs");
    expect(parseTeamStatus("inactifs")).toBe("inactifs");
    expect(parseTeamStatus("tous")).toBeNull();
    expect(parseTeamStatus(undefined)).toBeNull();
  });
});

describe("la saisie de la commission", () => {
  it("un montant en euros devient des centimes, un pourcentage des centièmes de pour cent", () => {
    expect(parseCommissionInput("FIXED", "250")).toBe(25000);
    expect(parseCommissionInput("FIXED", "250,50")).toBe(25050);
    expect(parseCommissionInput("FIXED", " 1 250 ")).toBe(125000);
    expect(parseCommissionInput("RECURRING", "25.5")).toBe(2550);
    expect(parseCommissionInput("PERCENT", "12,5")).toBe(1250);
    expect(parseCommissionInput("PERCENT", "0")).toBe(0);
  });

  it("refuse l'illisible, le négatif et ce qui dépasse le plafond de son type", () => {
    for (const text of ["", "abc", "-5", "12,345", "1e3", "12,"]) expect(parseCommissionInput("FIXED", text)).toBeNull();
    expect(parseCommissionInput("PERCENT", "100")).toBe(10000);
    expect(parseCommissionInput("PERCENT", "100,01")).toBeNull();
    expect(parseCommissionInput("FIXED", "100000")).toBe(10_000_000);
    expect(parseCommissionInput("FIXED", "100000,01")).toBeNull();
  });

  it("la valeur stockée se réécrit comme on la saisit", () => {
    expect(commissionInputFromStored(25000)).toBe("250");
    expect(commissionInputFromStored(25050)).toBe("250,5");
    expect(commissionInputFromStored(1250)).toBe("12,5");
    expect(parseCommissionInput("FIXED", commissionInputFromStored(25050))).toBe(25050);
  });
});

describe("ce qui empêche de supprimer un commercial", () => {
  it("rien : suppression possible, aucun refus", () => {
    expect(footprintParts({ prospects: 0, commissions: 0, invoices: 0, tasks: 0 })).toEqual([]);
    expect(deletionRefusal({ prospects: 0, commissions: 0, invoices: 0, tasks: 0 })).toBeNull();
  });

  it("dit ce qu'il reste, au singulier comme au pluriel", () => {
    expect(footprintParts({ prospects: 1, commissions: 2, invoices: 1, tasks: 3 })).toEqual(["1 dossier", "2 commissions", "1 facture", "3 tâches"]);
    expect(deletionRefusal({ prospects: 3, commissions: 0, invoices: 0, tasks: 0 })).toBe(`${HISTORY_REFUSAL} À son nom : 3 dossiers.`);
  });

  it("un seul élément d'historique suffit à refuser", () => {
    for (const key of ["prospects", "commissions", "invoices", "tasks"] as const) {
      const footprint = { prospects: 0, commissions: 0, invoices: 0, tasks: 0, [key]: 1 };
      expect(deletionRefusal(footprint)).toContain("Ce commercial a un historique : désactivez-le ou réaffectez ses dossiers.");
    }
  });
});

describe("le portefeuille par étape", () => {
  it("suit l'ordre du pipeline et omet les étapes vides", () => {
    const groups = groupByStage([
      { id: "a", status: "ACTIVATED" },
      { id: "b", status: "PROSPECT" },
      { id: "c", status: "DEMO_DONE" },
      { id: "d", status: "PROSPECT" },
    ]);
    expect(groups.map((group) => [group.status, group.items.map((item) => item.id)])).toEqual([
      ["PROSPECT", ["b", "d"]],
      ["DEMO_DONE", ["c"]],
      ["ACTIVATED", ["a"]],
    ]);
    expect(groupByStage([])).toEqual([]);
  });
});

describe("le fil d'activité", () => {
  it("ne laisse passer aucun événement de contrat, d'e-mail ni de signature", () => {
    for (const type of ["CONTRACT_GENERATED", "CONTRACT_SENT", "CONTRACT_OPENED", "CONTRACT_SIGNED", "CONTRACT_REFUSED", "CONTRACT_EXPIRED", "CONTRACT_REMINDER", "SIGNED_PDF_ARCHIVED", "SIGNATURE_ERROR", "EMAIL_SENT"]) {
      expect(ACTIVITY_EVENT_TYPES as readonly string[]).not.toContain(type);
    }
    expect(ACTIVITY_EVENT_TYPES as readonly string[]).toContain("STATUS_CHANGED");
  });

  it("un événement ordinaire : le résumé en titre, l'officine en détail, l'auteur dessous", () => {
    const entry = activityEntry({ id: "e1", type: "STATUS_CHANGED", summary: "Contacté → Démo réalisée.", actorType: "SALES", actorLabel: "Marie Dupont", createdAt: new Date("2026-10-04T09:00:00Z"), prospect: { name: "Pharmacie du Centre" } });
    expect(entry).toMatchObject({ id: "event:e1", kind: "dossier", title: "Contacté → Démo réalisée.", detail: "Pharmacie du Centre", actor: "Marie Dupont" });
  });

  it("une note : titre neutre, texte coupé à 240 caractères avec le nom de l'officine", () => {
    const entry = activityEntry({ id: "e2", type: "NOTE", summary: "x".repeat(300), actorType: "SALES", actorLabel: null, createdAt: new Date("2026-10-04T09:00:00Z"), prospect: { name: "Pharmacie du Port" } });
    expect(entry.kind).toBe("note");
    expect(entry.title).toBe("Note ajoutée");
    expect(entry.detail?.startsWith("Pharmacie du Port : ")).toBe(true);
    expect(entry.detail?.endsWith("…")).toBe(true);
    expect(entry.detail?.length).toBe("Pharmacie du Port : ".length + 240);
    expect(entry.actor).toBeNull();
  });

  it("une note de la console ou du système : jamais son texte, seulement qu'elle existe", () => {
    for (const actorType of ["ADMIN", "SYSTEM", "SIGNER", "DIRECTOR"]) {
      const entry = activityEntry({ id: "e3", type: "NOTE", summary: "Le titulaire a dit qu'il quitte son officine.", actorType, actorLabel: "L'équipe", createdAt: new Date("2026-10-04T09:00:00Z"), prospect: { name: "Pharmacie du Port" } });
      expect(entry.title).toBe("Note ajoutée par l'équipe");
      expect(entry.detail).toBe("Pharmacie du Port");
    }
  });

  it("relances et commissions sont rangées sous « Commercial »", () => {
    for (const type of ["TASK_DONE", "COMMISSION_PAID", "ASSIGNED"]) {
      expect(activityEntry({ id: type, type, summary: "s", actorType: "SALES", actorLabel: null, createdAt: new Date(), prospect: { name: "P" } }).kind).toBe("commercial");
    }
  });
});
