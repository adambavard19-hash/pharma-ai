import { beforeEach, describe, expect, it, vi } from "vitest";

/** La recherche ⌘K trouve un médicament et ouvre sa fiche, avec ses conditions de délivrance (l'ex-page « Réglementation »). */
const m = vi.hoisted(() => ({ drugSpecialty: { findMany: vi.fn() }, prescription: { findMany: vi.fn() } }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/demo-scope", () => ({ activityScope: () => ({ isDemo: false }) }));
vi.mock("@/server/db/client", () => ({ prisma: { drugSpecialty: m.drugSpecialty, prescription: m.prescription } }));

import { globalSearch } from "../search";

const session = (permissions: string[]) => ({ scope: { pharmacyId: "ph_1" }, permissions: new Set(permissions) }) as never;

beforeEach(() => {
  vi.resetAllMocks();
  m.prescription.findMany.mockResolvedValue([]);
  m.drugSpecialty.findMany.mockResolvedValue([{ cisCode: "60234100", name: "DOLIPRANE 1000 mg, comprimé", prescriptionConditions: [] }, { cisCode: "6111", name: "AMOXICILLINE 1 g, comprimé", prescriptionConditions: [{ label: "Liste I" }] }]);
});

describe("un médicament dans la recherche de l'en-tête", () => {
  it("ouvre sa fiche (/medicaments/[cis]) ; dit s'il est sur ordonnance ; sans la forme dans le titre", async () => {
    const results = await globalSearch(session(["prescription:view"]), "doli");
    expect(results).toEqual([
      { type: "drug", id: "60234100", title: "DOLIPRANE 1000 mg", subtitle: "comprimé · conditions de délivrance", badge: null, href: "/medicaments/60234100" },
      { type: "drug", id: "6111", title: "AMOXICILLINE 1 g", subtitle: "comprimé · conditions de délivrance", badge: "Sur ordonnance", href: "/medicaments/6111" },
    ]);
    expect(m.drugSpecialty.findMany.mock.calls[0][0].where).toMatchObject({ withdrawnAt: null });
  });

  it("sans accès aux ordonnances, aucun médicament n'est cherché", async () => {
    expect(await globalSearch(session([]), "doli")).toEqual([]);
    expect(m.drugSpecialty.findMany).not.toHaveBeenCalled();
  });
});
