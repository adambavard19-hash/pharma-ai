/**
 * Progression de formation : un état toujours cohérent avec son pourcentage,
 * et des agrégats justes pour la personne comme pour l'équipe.
 */
import { describe, expect, it } from "vitest";
import { clampPercent, completionDate, nextProgress, progressOf, summarizeProgress, teamProgress, TRAINING_STATUS_LABELS } from "../progress";

describe("état d'un contenu pour une personne", () => {
  it("vaut « à faire » à 0 % sans ligne de progression", () => {
    expect(progressOf(null)).toEqual({ status: "TODO", percent: 0 });
    expect(progressOf({ status: "INCONNU", progressPercent: 50 })).toEqual({ status: "TODO", percent: 0 });
  });

  it("aligne le pourcentage sur l'état lu en base", () => {
    expect(progressOf({ status: "DONE", progressPercent: 40 })).toEqual({ status: "DONE", percent: 100 });
    expect(progressOf({ status: "TODO", progressPercent: 40 })).toEqual({ status: "TODO", percent: 0 });
    expect(progressOf({ status: "IN_PROGRESS", progressPercent: 100 })).toEqual({ status: "IN_PROGRESS", percent: 99 });
  });

  it("borne un pourcentage entre 0 et 100", () => {
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent(33.6)).toBe(34);
    expect(clampPercent(Number.NaN)).toBe(0);
  });

  it("parle français", () => {
    expect(TRAINING_STATUS_LABELS).toEqual({ TODO: "À faire", IN_PROGRESS: "En cours", DONE: "Terminé" });
  });
});

describe("gestes sur la progression", () => {
  it("« Commencer » passe en cours à 0 %, sans perdre une avancée déjà faite", () => {
    expect(nextProgress(null, { status: "IN_PROGRESS" })).toEqual({ status: "IN_PROGRESS", percent: 0 });
    expect(nextProgress({ status: "IN_PROGRESS", percent: 40 }, { status: "IN_PROGRESS" })).toEqual({ status: "IN_PROGRESS", percent: 40 });
  });

  it("« Terminé » met à 100 % ; reprendre un contenu terminé repart de 0 %", () => {
    expect(nextProgress({ status: "IN_PROGRESS", percent: 40 }, { status: "DONE" })).toEqual({ status: "DONE", percent: 100 });
    expect(nextProgress({ status: "DONE", percent: 100 }, { status: "IN_PROGRESS" })).toEqual({ status: "IN_PROGRESS", percent: 0 });
  });

  it("un état « en cours » n'atteint jamais 100 %", () => {
    expect(nextProgress(null, { status: "IN_PROGRESS", percent: 100 })).toEqual({ status: "IN_PROGRESS", percent: 99 });
  });

  it("un pourcentage seul décide de l'état", () => {
    expect(nextProgress(null, { percent: 100 })).toEqual({ status: "DONE", percent: 100 });
    expect(nextProgress(null, { percent: 30 })).toEqual({ status: "IN_PROGRESS", percent: 30 });
    expect(nextProgress(null, { percent: 0 })).toEqual({ status: "TODO", percent: 0 });
    expect(nextProgress({ status: "IN_PROGRESS", percent: 30 }, { percent: 0 })).toEqual({ status: "IN_PROGRESS", percent: 0 });
    expect(nextProgress({ status: "IN_PROGRESS", percent: 30 }, {})).toEqual({ status: "IN_PROGRESS", percent: 30 });
  });

  it("« À faire » remet à zéro", () => {
    expect(nextProgress({ status: "DONE", percent: 100 }, { status: "TODO" })).toEqual({ status: "TODO", percent: 0 });
  });

  it("garde la première date d'achèvement, l'efface si le contenu est repris", () => {
    const now = new Date("2026-10-02T10:00:00Z");
    const before = new Date("2026-09-01T10:00:00Z");
    expect(completionDate(null, { status: "DONE", percent: 100 }, now)).toEqual(now);
    expect(completionDate({ status: "DONE", completedAt: before }, { status: "DONE", percent: 100 }, now)).toEqual(before);
    expect(completionDate({ status: "DONE", completedAt: before }, { status: "IN_PROGRESS", percent: 0 }, now)).toBeNull();
  });
});

describe("agrégats de progression", () => {
  it("compte à faire, en cours et terminé, et l'avancée moyenne", () => {
    const summary = summarizeProgress(["a", "b", "c", "d"], [
      { contentId: "a", status: "DONE", progressPercent: 100 },
      { contentId: "b", status: "IN_PROGRESS", progressPercent: 50 },
    ]);
    expect(summary).toEqual({ total: 4, todo: 2, inProgress: 1, done: 1, percent: 38 });
  });

  it("ignore les lignes d'un contenu retiré du catalogue", () => {
    const summary = summarizeProgress(["a"], [
      { contentId: "a", status: "IN_PROGRESS", progressPercent: 20 },
      { contentId: "retire", status: "DONE", progressPercent: 100 },
    ]);
    expect(summary).toEqual({ total: 1, todo: 0, inProgress: 1, done: 0, percent: 20 });
  });

  it("vaut 0 % sans aucun contenu, sans division par zéro", () => {
    expect(summarizeProgress([], [])).toEqual({ total: 0, todo: 0, inProgress: 0, done: 0, percent: 0 });
  });

  it("montre chaque membre de l'équipe, même sans activité, les plus avancés d'abord", () => {
    const at = (day: number) => new Date(`2026-09-${String(day).padStart(2, "0")}T09:00:00Z`);
    const rows = teamProgress(
      [
        { userId: "u1", name: "Camille Martin", role: "TECHNICIAN" },
        { userId: "u2", name: "Bruno Petit", role: "PHARMACIST" },
        { userId: "u3", name: "Alice Durand", role: "STUDENT" },
      ],
      ["a", "b"],
      [
        { userId: "u1", contentId: "a", status: "IN_PROGRESS", progressPercent: 50, updatedAt: at(3) },
        { userId: "u2", contentId: "a", status: "DONE", progressPercent: 100, updatedAt: at(1) },
        { userId: "u2", contentId: "b", status: "IN_PROGRESS", progressPercent: 10, updatedAt: at(5) },
        { userId: "u3", contentId: "archive", status: "DONE", progressPercent: 100, updatedAt: at(9) },
      ],
    );
    expect(rows.map((row) => [row.userId, row.summary.percent, row.summary.done])).toEqual([
      ["u2", 55, 1],
      ["u1", 25, 0],
      ["u3", 0, 0],
    ]);
    expect(rows[0].lastActivityAt).toEqual(at(5));
    expect(rows[2].lastActivityAt).toBeNull();
  });
});
