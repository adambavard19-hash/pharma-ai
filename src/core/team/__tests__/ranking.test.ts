import { describe, expect, it } from "vitest";
import { buildTeamRanking } from "../ranking";

const members = [{ id: "lea", name: "Léa Martin" }, { id: "marc", name: "Marc Durand" }, { id: "zoe", name: "Zoé Petit" }];

describe("le classement de l'équipe", () => {
  it("compte les conseils proposés et validés de chacun, et classe par conseils validés", () => {
    const { rows, totals } = buildTeamRanking(members, [
      { userId: "marc", status: "PURCHASED", count: 6 },
      { userId: "marc", status: "DECLINED", count: 2 },
      { userId: "lea", status: "ACCEPTED", count: 4 },
      { userId: "lea", status: "PROPOSED", count: 4 },
    ]);
    expect(rows.map((row) => [row.name, row.proposed, row.validated, row.rank])).toEqual([["Marc Durand", 8, 6, 1], ["Léa Martin", 8, 4, 2], ["Zoé Petit", 0, 0, 3]]);
    expect(totals).toEqual({ proposed: 16, validated: 10, rate: 10 / 16 });
  });

  it("un conseil refusé, retiré ou resté sans réponse n'est pas validé", () => {
    const { rows } = buildTeamRanking(members, ["DECLINED", "REMOVED", "IGNORED", "PROPOSED"].map((status) => ({ userId: "lea", status, count: 1 })));
    expect(rows.find((row) => row.userId === "lea")).toMatchObject({ proposed: 4, validated: 0, rate: 0 });
  });

  it("tout collaborateur est dans le classement, même sans conseil : taux « — » (null), jamais un faux 0 %", () => {
    const { rows } = buildTeamRanking(members, []);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.rate === null && row.proposed === 0)).toBe(true);
  });

  it("à égalité, même rang", () => {
    const { rows } = buildTeamRanking(members, [{ userId: "lea", status: "ACCEPTED", count: 3 }, { userId: "marc", status: "ACCEPTED", count: 3 }]);
    expect(rows.map((row) => row.rank)).toEqual([1, 1, 3]);
  });

  it("les ventes d'un comptoir sans collaborateur (ou d'un ancien collaborateur) forment une ligne à part, sans rang", () => {
    const { rows, totals } = buildTeamRanking(members, [{ userId: null, status: "ACCEPTED", count: 2 }, { userId: "parti", status: "PURCHASED", count: 3 }, { userId: "lea", status: "ACCEPTED", count: 1 }]);
    const orphan = rows.at(-1)!;
    expect(orphan).toMatchObject({ userId: null, name: "Comptoir non attribué", proposed: 5, validated: 5, rank: 0 });
    expect(rows.slice(0, 3).every((row) => row.rank > 0)).toBe(true);
    expect(totals.proposed).toBe(6);
  });

  it("pas de ligne « non attribué » quand tout est attribué", () => {
    expect(buildTeamRanking(members, [{ userId: "lea", status: "ACCEPTED", count: 1 }]).rows.some((row) => row.userId === null)).toBe(false);
  });
});
