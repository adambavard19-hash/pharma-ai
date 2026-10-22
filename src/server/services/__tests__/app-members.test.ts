import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  patientOfferCode: { findUnique: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: () => ({ sendEmail: vi.fn() }) }));

import { redeemOfferCodeAtCounter } from "../app-members";
import { makeOfferCode } from "@/core/patient-app/offers";

const now = new Date("2026-10-22T12:00:00Z");
const code = makeOfferCode("11223344");
const offer = { funding: "PHARMACY", pharmacyId: "ph1", status: "ACTIVE", startsAt: new Date("2026-10-01"), endsAt: new Date("2026-11-30"), discountPercent: 20, rangeLabel: "Avène Solaire" };

describe("un code d'offre bipé au comptoir", () => {
  beforeEach(() => {
    db.patientOfferCode.findUnique.mockReset();
    db.patientOfferCode.updateMany.mockReset().mockResolvedValue({ count: 1 });
  });

  it("un EAN du commerce ne touche pas la base : le bip suit son chemin", async () => {
    expect(await redeemOfferCodeAtCounter("ph1", "3401528534805", "POSTE5", now)).toEqual({ kind: "not-offer" });
    expect(db.patientOfferCode.findUnique).not.toHaveBeenCalled();
  });

  it("un code au bon format mais inconnu (étiquette interne de la pharmacie) : le bip suit son chemin", async () => {
    db.patientOfferCode.findUnique.mockResolvedValue(null);
    expect(await redeemOfferCodeAtCounter("ph1", code, "POSTE5", now)).toEqual({ kind: "not-offer" });
  });

  it("valide dans sa pharmacie : utilisé une fois, avec le poste", async () => {
    db.patientOfferCode.findUnique.mockResolvedValue({ id: "c1", redeemedAt: null, offer });
    const result = await redeemOfferCodeAtCounter("ph1", code, "POSTE5", now);
    expect(result).toMatchObject({ kind: "redeemed" });
    expect(db.patientOfferCode.updateMany).toHaveBeenCalledWith({ where: { id: "c1", redeemedAt: null }, data: { redeemedAt: now, redeemedPharmacyId: "ph1", redeemedPost: "POSTE5" } });
  });

  it("déjà utilisé, terminé, ou d'une autre pharmacie : refusé, rien n'est écrit", async () => {
    db.patientOfferCode.findUnique.mockResolvedValueOnce({ id: "c1", redeemedAt: now, offer });
    expect(await redeemOfferCodeAtCounter("ph1", code, "P", now)).toMatchObject({ kind: "refused", message: expect.stringContaining("déjà utilisée") });
    db.patientOfferCode.findUnique.mockResolvedValueOnce({ id: "c1", redeemedAt: null, offer: { ...offer, endsAt: new Date("2026-10-20") } });
    expect(await redeemOfferCodeAtCounter("ph1", code, "P", now)).toMatchObject({ kind: "refused", message: expect.stringContaining("terminée") });
    db.patientOfferCode.findUnique.mockResolvedValueOnce({ id: "c1", redeemedAt: null, offer });
    expect(await redeemOfferCodeAtCounter("ph2", code, "P", now)).toMatchObject({ kind: "refused", message: expect.stringContaining("autre pharmacie") });
    expect(db.patientOfferCode.updateMany).not.toHaveBeenCalled();
  });

  it("une offre de laboratoire passe dans n'importe quelle pharmacie du réseau", async () => {
    db.patientOfferCode.findUnique.mockResolvedValue({ id: "c1", redeemedAt: null, offer: { ...offer, funding: "LAB", pharmacyId: null } });
    expect(await redeemOfferCodeAtCounter("ph9", code, "P", now)).toMatchObject({ kind: "redeemed" });
  });

  it("deux bips simultanés : un seul gagne", async () => {
    db.patientOfferCode.findUnique.mockResolvedValue({ id: "c1", redeemedAt: null, offer });
    db.patientOfferCode.updateMany.mockResolvedValue({ count: 0 });
    expect(await redeemOfferCodeAtCounter("ph1", code, "P", now)).toMatchObject({ kind: "refused" });
  });
});
