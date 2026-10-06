import { describe, expect, it } from "vitest";
import { applicationEventActorId, auditIdentity, DIRECTOR_EVENT_PREFIX, splitEventActors } from "../rep-actor";

/**
 * Qui agit : un identifiant d'administrateur (forme historique), un acteur
 * administrateur ou le directeur commercial. L'audit et l'historique des
 * candidatures portent l'identité qui convient, sans jamais les confondre.
 */

describe("l'identité de l'audit", () => {
  it("la forme historique (une chaîne) est un administrateur de la console", () => {
    expect(auditIdentity("adm_1")).toEqual({ platformAdminId: "adm_1" });
  });

  it("aucun acteur (envoi automatique) : pas d'administrateur", () => {
    expect(auditIdentity(null)).toEqual({ platformAdminId: null });
  });

  it("un acteur administrateur : platformAdminId, jamais salesDirectorId", () => {
    expect(auditIdentity({ type: "ADMIN", id: "adm_1", label: "Alice Admin" })).toEqual({ platformAdminId: "adm_1" });
  });

  it("le directeur : salesDirectorId, jamais platformAdminId", () => {
    const identity = auditIdentity({ type: "DIRECTOR", id: "dir_1", label: "Diane Directrice" });
    expect(identity).toEqual({ salesDirectorId: "dir_1" });
    expect(identity).not.toHaveProperty("platformAdminId");
  });
});

describe("l'auteur d'un événement de candidature", () => {
  it("un administrateur garde son identifiant tel quel (les anciens événements restent lisibles)", () => {
    expect(applicationEventActorId("adm_1")).toBe("adm_1");
    expect(applicationEventActorId({ type: "ADMIN", id: "adm_1", label: "Alice" })).toBe("adm_1");
    expect(applicationEventActorId(null)).toBeNull();
  });

  it("le directeur s'écrit « director:<id> » : il ne se confond jamais avec un administrateur", () => {
    expect(applicationEventActorId({ type: "DIRECTOR", id: "dir_1", label: "Diane" })).toBe(`${DIRECTOR_EVENT_PREFIX}dir_1`);
    expect(applicationEventActorId({ type: "DIRECTOR", id: "adm_1", label: "Diane" })).not.toBe(applicationEventActorId("adm_1"));
  });

  it("sépare les auteurs d'un historique, sans doublon, en ignorant les événements sans auteur", () => {
    expect(splitEventActors(["adm_1", "director:dir_1", null, "adm_1", "director:dir_1", "director:dir_2", "adm_2"])).toEqual({ adminIds: ["adm_1", "adm_2"], directorIds: ["dir_1", "dir_2"] });
    expect(splitEventActors([null, null])).toEqual({ adminIds: [], directorIds: [] });
    expect(splitEventActors([])).toEqual({ adminIds: [], directorIds: [] });
  });
});
