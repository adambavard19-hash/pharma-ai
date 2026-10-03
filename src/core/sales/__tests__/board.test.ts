import { describe, expect, it } from "vitest";
import {
  BOARD_COLUMNS,
  SYSTEM_DROP_REFUSAL,
  buildBoard,
  buildFollowUps,
  compareCards,
  dayBucket,
  daysLate,
  defaultDemoInput,
  defaultFollowUpInput,
  demoBucket,
  dropDecision,
  isOverdue,
  moveTargets,
  parisDayInDays,
  parisDayInputToDate,
  parisInputToDate,
  parseStatusParam,
  pickNextAction,
  salesRepStagePills,
  statusAfterDemoCanceled,
  statusAfterDemoDone,
  statusAfterDemoScheduled,
  toParisInput,
  trialDaysLeft,
  validateDemoDate,
  validateFollowUpDate,
} from "../board";
import { PROSPECT_STATUSES } from "../pipeline";

// 3 octobre 2026, 23 h 30 à Paris (UTC+2) : tout près de minuit, pour éprouver le fuseau.
const NOW = new Date("2026-10-03T21:30:00.000Z");

describe("colonnes du pipeline", () => {
  it("une colonne par étape, dans l'ordre, les étapes contractuelles marquées automatiques", () => {
    expect(BOARD_COLUMNS.map((c) => c.status)).toEqual([...PROSPECT_STATUSES]);
    const system = BOARD_COLUMNS.filter((c) => c.kind === "system").map((c) => c.status);
    expect(system).toEqual(["CONTRACT_SENT", "CONTRACT_SIGNED", "PHARMACY_CREATED", "ACTIVATED"]);
    expect(BOARD_COLUMNS.find((c) => c.status === "DEMO_SCHEDULED")?.label).toBe("Démo programmée");
    expect(BOARD_COLUMNS.find((c) => c.status === "LOST")?.kind).toBe("manual");
  });
});

describe("règles de dépôt", () => {
  it("accepte les étapes manuelles, avec motif pour « Perdu » et date pour « Démo programmée »", () => {
    expect(dropDecision({ status: "PROSPECT" }, "CONTACTED")).toEqual({ ok: true, needs: null });
    expect(dropDecision({ status: "CONTACTED" }, "DEMO_SCHEDULED")).toEqual({ ok: true, needs: "demo" });
    expect(dropDecision({ status: "INTERESTED" }, "LOST")).toEqual({ ok: true, needs: "reason" });
    expect(dropDecision({ status: "DEMO_SCHEDULED" }, "DEMO_DONE")).toEqual({ ok: true, needs: null });
  });

  it("refuse les colonnes automatiques avec l'explication attendue", () => {
    for (const to of ["CONTRACT_SENT", "CONTRACT_SIGNED", "PHARMACY_CREATED", "ACTIVATED"]) {
      const decision = dropDecision({ status: "PROPOSAL_SENT" }, to);
      expect(decision.ok).toBe(false);
      if (!decision.ok) expect(decision.reason).toBe(SYSTEM_DROP_REFUSAL);
    }
  });

  it("un dossier déjà sous contrat ne revient pas en prospection, mais peut être perdu", () => {
    expect(dropDecision({ status: "CONTRACT_SENT" }, "INTERESTED").ok).toBe(false);
    expect(dropDecision({ status: "ACTIVATED" }, "DEMO_SCHEDULED").ok).toBe(false);
    expect(dropDecision({ status: "CONTRACT_SENT" }, "LOST")).toEqual({ ok: true, needs: "reason" });
  });

  it("un dossier perdu se rouvre, sauf si un contrat est en cours ou signé", () => {
    expect(dropDecision({ status: "LOST", contractStatus: null }, "CONTACTED").ok).toBe(true);
    expect(dropDecision({ status: "LOST", contractStatus: "REFUSED" }, "CONTACTED").ok).toBe(true);
    expect(dropDecision({ status: "LOST", contractStatus: "OPENED" }, "CONTACTED").ok).toBe(false);
    expect(dropDecision({ status: "LOST", contractStatus: "FINALIZED" }, "PROSPECT").ok).toBe(false);
  });

  it("même colonne : refus silencieux ; étape inconnue : refus", () => {
    expect(dropDecision({ status: "CONTACTED" }, "CONTACTED")).toMatchObject({ ok: false, silent: true });
    expect(dropDecision({ status: "CONTACTED" }, "SIGNED")).toMatchObject({ ok: false });
  });

  it("le menu « Déplacer vers… » liste toutes les autres étapes avec leur décision", () => {
    const targets = moveTargets({ status: "CONTACTED" });
    expect(targets).toHaveLength(PROSPECT_STATUSES.length - 1);
    expect(targets.find((t) => t.status === "CONTACTED")).toBeUndefined();
    expect(targets.find((t) => t.status === "ACTIVATED")?.decision.ok).toBe(false);
    expect(targets.find((t) => t.status === "LOST")?.decision).toEqual({ ok: true, needs: "reason" });
  });

  it("lit un statut d'adresse sous plusieurs formes", () => {
    expect(parseStatusParam("CONTACTED")).toBe("CONTACTED");
    expect(parseStatusParam("demo-scheduled")).toBe("DEMO_SCHEDULED");
    expect(parseStatusParam("inconnu")).toBeNull();
    expect(parseStatusParam(null)).toBeNull();
  });
});

describe("étapes après une démonstration", () => {
  it("programmer fait passer en « Démo programmée » sauf une fois le contrat parti", () => {
    expect(statusAfterDemoScheduled("CONTACTED")).toBe("DEMO_SCHEDULED");
    expect(statusAfterDemoScheduled("INTERESTED")).toBe("DEMO_SCHEDULED");
    expect(statusAfterDemoScheduled("DEMO_SCHEDULED")).toBeNull();
    expect(statusAfterDemoScheduled("CONTRACT_SENT")).toBeNull();
    expect(statusAfterDemoScheduled("LOST", "SENT")).toBeNull();
  });

  it("réalisée : ne fait pas reculer un dossier plus avancé, sauf dépôt explicite", () => {
    expect(statusAfterDemoDone("DEMO_SCHEDULED")).toBe("DEMO_DONE");
    expect(statusAfterDemoDone("INTERESTED")).toBeNull();
    expect(statusAfterDemoDone("INTERESTED", true)).toBe("DEMO_DONE");
    expect(statusAfterDemoDone("CONTRACT_SENT", true)).toBeNull();
    expect(statusAfterDemoDone("DEMO_DONE", true)).toBeNull();
  });

  it("annulée : le dossier qui attendait cette démo retrouve l'étape d'avant sa programmation", () => {
    expect(statusAfterDemoCanceled("DEMO_SCHEDULED", "PROPOSAL_SENT")).toBe("PROPOSAL_SENT");
    expect(statusAfterDemoCanceled("DEMO_SCHEDULED", "DEMO_DONE")).toBe("DEMO_DONE");
    // Historique illisible, ou étape d'avant non manuelle : « Contacté ».
    expect(statusAfterDemoCanceled("DEMO_SCHEDULED")).toBe("CONTACTED");
    expect(statusAfterDemoCanceled("DEMO_SCHEDULED", "CONTRACT_SENT")).toBe("CONTACTED");
    expect(statusAfterDemoCanceled("PROPOSAL_SENT", "CONTACTED")).toBeNull();
  });
});

describe("étape, côté commercial (extranet)", () => {
  const enabled = (current: string) => salesRepStagePills(current).pills.filter((p) => p.enabled).map((p) => p.status);

  it("un dossier en démo programmée ou réalisée change d'étape comme les autres étapes manuelles", () => {
    expect(enabled("DEMO_SCHEDULED")).toEqual(["PROSPECT", "CONTACTED", "DEMO_DONE", "INTERESTED", "PROPOSAL_SENT"]);
    expect(enabled("DEMO_DONE")).toEqual(["PROSPECT", "CONTACTED", "INTERESTED", "PROPOSAL_SENT"]);
    expect(salesRepStagePills("DEMO_SCHEDULED").followsContract).toBe(false);
    expect(salesRepStagePills("DEMO_DONE").followsContract).toBe(false);
  });

  it("« Démo programmée » ne se pose jamais sans date : pastille seulement pour montrer l'étape en cours", () => {
    expect(salesRepStagePills("CONTACTED").pills.map((p) => p.status)).not.toContain("DEMO_SCHEDULED");
    expect(enabled("CONTACTED")).toEqual(["PROSPECT", "DEMO_DONE", "INTERESTED", "PROPOSAL_SENT"]);
    expect(salesRepStagePills("DEMO_SCHEDULED").pills.find((p) => p.status === "DEMO_SCHEDULED")).toEqual({ status: "DEMO_SCHEDULED", current: true, enabled: false });
  });

  it("« l'étape suit le contrat » seulement pour une étape système ; un dossier perdu ne se rouvre pas d'une pression", () => {
    for (const status of ["CONTRACT_SENT", "CONTRACT_SIGNED", "PHARMACY_CREATED", "ACTIVATED"]) {
      expect(salesRepStagePills(status)).toMatchObject({ followsContract: true });
      expect(enabled(status)).toEqual([]);
    }
    expect(salesRepStagePills("LOST").followsContract).toBe(false);
    expect(enabled("LOST")).toEqual([]);
  });
});

describe("saisies à l'heure de Paris, quel que soit le fuseau du navigateur", () => {
  it("lit « AAAA-MM-JJTHH:mm » à l'heure de Paris, été comme hiver", () => {
    expect(parisInputToDate("2026-10-04T10:00")?.toISOString()).toBe("2026-10-04T08:00:00.000Z"); // UTC+2
    expect(parisInputToDate("2026-10-30T10:00")?.toISOString()).toBe("2026-10-30T09:00:00.000Z"); // UTC+1
  });

  it("le jour même d'un changement d'heure, l'heure saisie garde son décalage", () => {
    expect(parisInputToDate("2026-03-29T10:00")?.toISOString()).toBe("2026-03-29T08:00:00.000Z"); // passage à l'heure d'été à 2 h
    expect(parisInputToDate("2026-03-29T01:30")?.toISOString()).toBe("2026-03-29T00:30:00.000Z"); // encore l'hiver
    expect(parisInputToDate("2026-10-25T10:00")?.toISOString()).toBe("2026-10-25T09:00:00.000Z"); // retour à l'heure d'hiver à 3 h
    expect(parisInputToDate("2026-10-25T01:30")?.toISOString()).toBe("2026-10-24T23:30:00.000Z"); // encore l'été
  });

  it("refuse une saisie illisible ou un jour qui n'existe pas", () => {
    expect(parisInputToDate("2026-02-30T10:00")).toBeNull();
    expect(parisInputToDate("2026-10-04T24:00")).toBeNull();
    expect(parisInputToDate("demain")).toBeNull();
    expect(parisInputToDate("")).toBeNull();
    expect(parisDayInputToDate("2026-13-01")).toBeNull();
  });

  it("pré-remplit à l'heure de Paris, et l'aller-retour est exact", () => {
    expect(toParisInput(new Date("2026-10-04T08:00:00Z"))).toBe("2026-10-04T10:00");
    expect(toParisInput("2026-10-30T09:00:00.000Z")).toBe("2026-10-30T10:00");
    expect(toParisInput(new Date("2026-10-03T22:15:00Z"))).toBe("2026-10-04T00:15");
    const at = new Date("2026-12-14T15:45:00Z");
    expect(parisInputToDate(toParisInput(at))?.getTime()).toBe(at.getTime());
  });

  it("la démo proposée par défaut tombe vraiment à 10 h, heure de Paris", () => {
    expect(parisInputToDate(defaultDemoInput(NOW))?.toISOString()).toBe("2026-10-04T08:00:00.000Z");
  });

  it("une relance tombe à 9 h, heure de Paris, le jour choisi ; préréglages en jours de Paris", () => {
    expect(parisDayInputToDate("2026-10-04")?.toISOString()).toBe("2026-10-04T07:00:00.000Z");
    expect(parisDayInputToDate("2026-11-04")?.toISOString()).toBe("2026-11-04T08:00:00.000Z");
    // 23 h 30 à Paris le 3 octobre (21 h 30 UTC) : « dans 2 jours » = le 5, pas le 4.
    expect(parisDayInDays(NOW, 2)).toBe("2026-10-05");
    expect(parisDayInDays(new Date("2026-12-31T12:00:00Z"), 1)).toBe("2027-01-01");
    expect(validateFollowUpDate(parisDayInputToDate(defaultFollowUpInput(NOW)) as Date, NOW).ok).toBe(true);
  });
});

describe("jours, au fuseau de Paris", () => {
  it("classe une échéance en retard, aujourd'hui ou à venir selon le jour parisien", () => {
    expect(dayBucket(new Date("2026-10-02T23:30:00Z"), NOW)).toBe("aujourdhui"); // 3 oct. 1 h 30 à Paris
    expect(dayBucket(new Date("2026-10-03T22:30:00Z"), NOW)).toBe("a-venir"); // 4 oct. 0 h 30 à Paris
    expect(dayBucket(new Date("2026-10-01T10:00:00Z"), NOW)).toBe("retard");
    expect(daysLate(new Date("2026-10-01T10:00:00Z"), NOW)).toBe(2);
    expect(daysLate(new Date("2026-10-05T10:00:00Z"), NOW)).toBe(0);
    expect(demoBucket(new Date("2026-10-01T10:00:00Z"), NOW)).toBe("passees");
  });

  it("une prochaine action est dépassée dès le lendemain de son échéance", () => {
    expect(isOverdue(new Date("2026-10-03T06:00:00Z"), NOW)).toBe(false);
    expect(isOverdue(new Date("2026-10-02T06:00:00Z"), NOW)).toBe(true);
    expect(isOverdue(null, NOW)).toBe(false);
  });

  it("jours d'essai restants, jamais négatifs", () => {
    expect(trialDaysLeft(new Date("2026-10-08T21:30:00Z"), NOW)).toBe(5);
    expect(trialDaysLeft(new Date("2026-10-01T00:00:00Z"), NOW)).toBe(0);
    expect(trialDaysLeft(null, NOW)).toBeNull();
  });

  it("dates proposées : demain à Paris", () => {
    expect(defaultDemoInput(NOW)).toBe("2026-10-04T10:00");
    expect(defaultFollowUpInput(NOW)).toBe("2026-10-04");
  });

  it("une démo se programme aujourd'hui ou plus tard, au plus un an à l'avance", () => {
    expect(validateDemoDate(new Date("2026-10-03T08:00:00Z"), NOW).ok).toBe(true); // ce matin
    expect(validateDemoDate(new Date("2026-10-02T08:00:00Z"), NOW).ok).toBe(false);
    expect(validateDemoDate(new Date("2027-11-01T08:00:00Z"), NOW).ok).toBe(false);
    expect(validateDemoDate(new Date("invalide"), NOW).ok).toBe(false);
    expect(validateFollowUpDate(new Date("2026-10-04T07:00:00Z"), NOW).ok).toBe(true);
    expect(validateFollowUpDate(new Date("2026-09-30T07:00:00Z"), NOW).ok).toBe(false);
  });
});

describe("tri des cartes", () => {
  const card = (name: string, status: string, extra: Partial<{ nextActionAt: string | null; demoAt: string | null; updatedAt: string }> = {}) => ({ name, status, nextActionAt: null, demoAt: null, updatedAt: "2026-09-01T10:00:00Z", ...extra });

  it("relances dépassées d'abord (la plus ancienne en tête), puis prochaine action, puis modification récente", () => {
    const cards = [
      card("Sans action récente", "CONTACTED", { updatedAt: "2026-10-02T10:00:00Z" }),
      card("Sans action ancienne", "CONTACTED", { updatedAt: "2026-09-02T10:00:00Z" }),
      card("Action demain", "CONTACTED", { nextActionAt: "2026-10-04T08:00:00Z" }),
      card("Retard 1 j", "CONTACTED", { nextActionAt: "2026-10-02T08:00:00Z" }),
      card("Retard 5 j", "CONTACTED", { nextActionAt: "2026-09-28T08:00:00Z" }),
    ];
    expect([...cards].sort((a, b) => compareCards(a, b, NOW)).map((c) => c.name)).toEqual(["Retard 5 j", "Retard 1 j", "Action demain", "Sans action récente", "Sans action ancienne"]);
  });

  it("en « Démo programmée », la démo la plus proche passe devant", () => {
    const cards = [card("Démo jeudi", "DEMO_SCHEDULED", { demoAt: "2026-10-08T08:00:00Z" }), card("Démo lundi", "DEMO_SCHEDULED", { demoAt: "2026-10-05T08:00:00Z" })];
    expect([...cards].sort((a, b) => compareCards(a, b, NOW)).map((c) => c.name)).toEqual(["Démo lundi", "Démo jeudi"]);
  });

  it("range par colonne avec compteurs ; pas de retard compté dans les colonnes closes", () => {
    const board = buildBoard([card("A", "CONTACTED", { nextActionAt: "2026-09-28T08:00:00Z" }), card("B", "CONTACTED"), card("C", "LOST", { nextActionAt: "2026-09-28T08:00:00Z" })], NOW);
    const contacted = board.find((c) => c.status === "CONTACTED")!;
    expect(contacted.count).toBe(2);
    expect(contacted.overdue).toBe(1);
    expect(board.find((c) => c.status === "LOST")!.overdue).toBe(0);
    expect(board.find((c) => c.status === "PROSPECT")!.count).toBe(0);
  });
});

describe("prochaine action et relances", () => {
  it("la prochaine action est la plus proche des candidates", () => {
    const a = { at: new Date("2026-10-10T08:00:00Z"), label: "Relancer" };
    const b = { at: new Date("2026-10-05T08:00:00Z"), label: "Démonstration" };
    expect(pickNextAction([a, null, b])).toEqual({ at: b.at, label: "Démonstration" });
    expect(pickNextAction([null, undefined])).toEqual({ at: null, label: null });
  });

  it("fusionne tâches et prochaines actions sans doublon, hors dossiers clos, par échéance", () => {
    const rep = { id: "r1", firstName: "Léa", lastName: "Martin" };
    const items = buildFollowUps(
      {
        tasks: [
          { id: "t1", label: "Rappeler", dueAt: new Date("2026-10-06T08:00:00Z"), salesRep: rep, prospect: { id: "p1", name: "Pharmacie A", city: "Lyon", status: "CONTACTED" } },
          { id: "t2", label: "Ancienne", dueAt: new Date("2026-09-20T08:00:00Z"), salesRep: rep, prospect: { id: "p9", name: "Pharmacie Close", city: null, status: "LOST" } },
        ],
        dossiers: [
          { id: "p2", name: "Pharmacie B", city: null, status: "PROSPECT", nextActionAt: new Date("2026-10-01T08:00:00Z"), nextActionLabel: null, salesRep: null, hasOpenTask: false },
          { id: "p1", name: "Pharmacie A", city: "Lyon", status: "CONTACTED", nextActionAt: new Date("2026-10-06T08:00:00Z"), nextActionLabel: "Rappeler", salesRep: rep, hasOpenTask: true },
        ],
      },
      NOW,
    );
    expect(items.map((i) => i.key)).toEqual(["dossier:p2", "task:t1"]);
    expect(items[0]).toMatchObject({ kind: "dossier", label: "Relancer", bucket: "retard", daysLate: 2, salesRep: null });
    expect(items[1]).toMatchObject({ kind: "task", taskId: "t1", bucket: "a-venir", salesRep: { id: "r1", name: "Léa Martin" } });
  });
});
