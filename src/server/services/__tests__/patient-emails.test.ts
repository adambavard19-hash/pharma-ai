import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ followUp: { findMany: vi.fn() }, membership: { findMany: vi.fn() } }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: { counterSaleFollowUp: m.followUp, membership: m.membership } }));
vi.mock("@/server/db/demo-scope", () => ({ activityScope: () => ({ isDemo: false }) }));

import { listPatientEmails } from "../patient-emails";

const SCOPE = { pharmacyId: "ph_1", organizationId: "o", userId: "u" } as never;
const row = (over: Record<string, unknown> = {}) => ({
  consentAt: new Date("2026-10-13T08:00:00Z"),
  closedAt: new Date("2026-10-13T08:05:00Z"),
  closedPost: "Comptoir 2",
  reportStatus: "SENT",
  reportSentAt: new Date("2026-10-13T08:05:01Z"),
  prescription: { id: "s1", reference: "ORD-1", counterPost: "Comptoir 2", handledByUserId: "lea", recommendations: [{ product: { name: "Spray nasal" }, presentation: null }, { product: null, presentation: { specialty: { name: "DOLIPRANE 500 mg, gélule" } } }] },
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  m.membership.findMany.mockResolvedValue([{ user: { id: "lea", firstName: "Léa", lastName: "Martin" } }]);
});

describe("la liste des bilans envoyés", () => {
  it("lit l'officine de la session seulement, et seulement les bilans demandés (accord donné ou envoi tenté)", async () => {
    m.followUp.findMany.mockResolvedValue([]);
    await listPatientEmails(SCOPE, { days: 30, now: new Date("2026-10-13T12:00:00Z"), states: null });
    const where = m.followUp.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ pharmacyId: "ph_1", prescription: { pharmacyId: "ph_1", deletedAt: null, isDemo: false } });
    expect(where.updatedAt).toEqual({ gte: new Date("2026-09-13T12:00:00Z") });
    expect(where.OR).toEqual([{ consentAt: { not: null } }, { reportStatus: { in: ["SENT", "SIMULATED", "FAILED"] } }]);
    // L'adresse chiffrée n'est même pas lue.
    expect(JSON.stringify(m.followUp.findMany.mock.calls[0][0].select)).not.toContain("email");
  });

  it("date, comptoir, personne, produits du bilan (sans la forme du médicament), état", async () => {
    m.followUp.findMany.mockResolvedValue([row()]);
    const { rows } = await listPatientEmails(SCOPE, { days: 30, states: null });
    expect(rows).toEqual([{ saleId: "s1", reference: "ORD-1", at: new Date("2026-10-13T08:05:01Z"), comptoir: "Comptoir 2", person: "Léa Martin", products: ["Spray nasal", "DOLIPRANE 500 mg"], state: "SENT" }]);
    expect(m.membership.findMany.mock.calls[0][0].where).toMatchObject({ pharmacyId: "ph_1" });
  });

  it("filtre par état ; une personne hors de l'officine n'a pas de nom", async () => {
    m.followUp.findMany.mockResolvedValue([row(), row({ reportStatus: "FAILED", prescription: { ...row().prescription, id: "s2", handledByUserId: "etranger" } })]);
    m.membership.findMany.mockResolvedValue([]);
    const { rows } = await listPatientEmails(SCOPE, { days: 30, states: ["FAILED"] });
    expect(rows.map((item) => [item.saleId, item.state, item.person])).toEqual([["s2", "FAILED", null]]);
  });
});

describe("un collaborateur ne voit que les bilans de ses ventes", () => {
  it("handledBy : la requête ne lit que les ventes de cette personne, dans l'officine de la session", async () => {
    m.followUp.findMany.mockResolvedValue([]);
    await listPatientEmails(SCOPE, { days: 30, states: null, handledBy: "lea" });
    expect(m.followUp.findMany.mock.calls[0][0].where).toMatchObject({ pharmacyId: "ph_1", prescription: { pharmacyId: "ph_1", handledByUserId: "lea" } });
  });

  it("sans handledBy (le titulaire) : toute l'officine, aucun filtre par personne", async () => {
    m.followUp.findMany.mockResolvedValue([]);
    await listPatientEmails(SCOPE, { days: 30, states: null });
    expect(m.followUp.findMany.mock.calls[0][0].where.prescription).not.toHaveProperty("handledByUserId");
  });
});
