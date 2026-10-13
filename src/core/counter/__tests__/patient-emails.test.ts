import { describe, expect, it } from "vitest";
import { patientEmailState, resolveEmailFilters, PATIENT_EMAIL_STATES } from "../patient-emails";

describe("« E-mails aux patients » : l'issue d'un bilan, telle que la base l'a enregistrée", () => {
  const closed = new Date("2026-10-13T08:00:00Z");
  it("envoyé, simulé, échec : repris tel quel", () => {
    expect(patientEmailState({ closedAt: closed, reportStatus: "SENT" })).toBe("SENT");
    expect(patientEmailState({ closedAt: closed, reportStatus: "SIMULATED" })).toBe("SIMULATED");
    expect(patientEmailState({ closedAt: closed, reportStatus: "FAILED" })).toBe("FAILED");
  });
  it("vente pas terminée : en attente ; terminée sans produit vendu : pas envoyé ; rien d'enregistré : inconnu (jamais deviné)", () => {
    expect(patientEmailState({ closedAt: null, reportStatus: null })).toBe("WAITING");
    expect(patientEmailState({ closedAt: closed, reportStatus: "NONE" })).toBe("NOTHING_SOLD");
    expect(patientEmailState({ closedAt: closed, reportStatus: null })).toBe("UNKNOWN");
  });
  it("aucune phrase ne parle d'ouverture ni d'adresse", () => {
    for (const state of Object.values(PATIENT_EMAIL_STATES)) expect(`${state.label} ${state.detail}`).not.toMatch(/ouvert|lu par|@/i);
  });
  it("filtres : 30 jours et tous par défaut ; une valeur inconnue retombe sur le défaut", () => {
    expect(resolveEmailFilters({})).toMatchObject({ period: { days: 30 }, state: { key: "tous", states: null } });
    expect(resolveEmailFilters({ periode: "7", etat: "echecs" })).toMatchObject({ period: { days: 7 }, state: { states: ["FAILED"] } });
    expect(resolveEmailFilters({ periode: "9999", etat: "n-importe" })).toMatchObject({ period: { days: 30 }, state: { key: "tous" } });
  });
});
