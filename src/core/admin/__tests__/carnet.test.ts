import { describe, expect, it } from "vitest";
import { addDays, carnetStats, groupOpen, readCarnet, type CarnetItem } from "../carnet";

const base: CarnetItem = { id: "a", title: "Rappeler", kind: "TACHE", status: "A_FAIRE", priority: "NORMALE", category: "Autre", due: null, time: null, place: "", notes: "", checklist: [], createdAt: "2026-10-29T08:00:00.000Z", doneAt: null, createdBy: "" };
const note = (patch: Partial<CarnetItem>): CarnetItem => ({ ...base, ...patch });

describe("le carnet du fondateur", () => {
  it("écarte une note illisible sans perdre les autres", () => {
    expect(readCarnet({ items: [base, { id: "x" }, 3] })).toHaveLength(1);
    expect(readCarnet(null)).toEqual([]);
  });

  it("range ce qui reste à faire : en retard, aujourd'hui (par heure), la semaine, plus tard, sans date", () => {
    const today = "2026-10-29";
    const groups = groupOpen(
      [
        note({ id: "late", due: "2026-10-27" }),
        note({ id: "t2", due: today, time: "16:00" }),
        note({ id: "t1", due: today, time: "09:30" }),
        note({ id: "week", due: addDays(today, 3) }),
        note({ id: "later", due: addDays(today, 20) }),
        note({ id: "none" }),
        note({ id: "done", due: today, status: "FAIT", doneAt: "2026-10-29T10:00:00.000Z" }),
      ],
      today,
    );
    expect(groups.late.map((item) => item.id)).toEqual(["late"]);
    expect(groups.today.map((item) => item.id)).toEqual(["t1", "t2"]);
    expect(groups.week.map((item) => item.id)).toEqual(["week"]);
    expect(groups.later.map((item) => item.id)).toEqual(["later"]);
    expect(groups.undated.map((item) => item.id)).toEqual(["none"]);
  });

  it("compte ce qui est fait ces 7 derniers jours", () => {
    const stats = carnetStats([note({ status: "FAIT", doneAt: "2026-10-28T10:00:00.000Z" }), note({ id: "b", due: "2026-10-20" })], "2026-10-29");
    expect(stats).toEqual({ open: 1, late: 1, today: 0, doneWeek: 1 });
  });
});
