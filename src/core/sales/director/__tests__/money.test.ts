import { describe, expect, it } from "vitest";
import { applyCommissionGesture, commissionGestureTarget, commissionGesturesFor, monthBounds, monthLabel, parseMonthParam, recentMonths, summarizeCommissions } from "../money";

describe("les gestes sur une commission", () => {
  it("valider : seulement une acquise → à payer ; une prévisionnelle attend la signature du contrat", () => {
    expect(applyCommissionGesture("FORECAST", "VALIDATE")).toMatchObject({ ok: false, error: expect.stringContaining("signature du contrat") });
    expect(applyCommissionGesture("EARNED", "VALIDATE")).toEqual({ ok: true, to: "PAYABLE" });
    expect(applyCommissionGesture("PAYABLE", "VALIDATE")).toEqual({ ok: false, error: "Cette commission est déjà à payer." });
    expect(applyCommissionGesture("PAID", "VALIDATE").ok).toBe(false);
    expect(applyCommissionGesture("CANCELLED", "VALIDATE").ok).toBe(false);
  });

  it("une prévisionnelle ne peut ni être validée ni être payée : pas de doublon à la finalisation du contrat", () => {
    // Sinon : validée puis payée, elle ne serait plus retrouvée par la finalisation, qui en créerait une seconde.
    expect(applyCommissionGesture("FORECAST", "VALIDATE").ok).toBe(false);
    expect(applyCommissionGesture("FORECAST", "PAY").ok).toBe(false);
  });

  it("payer : acquise ou à payer seulement, jamais une prévisionnelle", () => {
    expect(applyCommissionGesture("EARNED", "PAY")).toEqual({ ok: true, to: "PAID" });
    expect(applyCommissionGesture("PAYABLE", "PAY")).toEqual({ ok: true, to: "PAID" });
    expect(applyCommissionGesture("FORECAST", "PAY")).toMatchObject({ ok: false, error: expect.stringContaining("prévisionnelle") });
    expect(applyCommissionGesture("PAID", "PAY")).toMatchObject({ ok: false });
    expect(applyCommissionGesture("CANCELLED", "PAY")).toMatchObject({ ok: false });
  });

  it("annuler : tant que rien n'est payé", () => {
    for (const from of ["FORECAST", "EARNED", "PAYABLE"] as const) expect(applyCommissionGesture(from, "CANCEL")).toEqual({ ok: true, to: "CANCELLED" });
    expect(applyCommissionGesture("PAID", "CANCEL")).toEqual({ ok: false, error: "Une commission payée ne s'annule pas." });
    expect(applyCommissionGesture("CANCELLED", "CANCEL")).toMatchObject({ ok: false });
  });

  it("l'écran ne propose que les gestes possibles, et le statut visé est celui du geste", () => {
    expect(commissionGesturesFor("FORECAST")).toEqual(["CANCEL"]);
    expect(commissionGesturesFor("EARNED")).toEqual(["VALIDATE", "PAY", "CANCEL"]);
    expect(commissionGesturesFor("PAYABLE")).toEqual(["PAY", "CANCEL"]);
    expect(commissionGesturesFor("PAID")).toEqual([]);
    expect(commissionGesturesFor("CANCELLED")).toEqual([]);
    expect(commissionGestureTarget("VALIDATE")).toBe("PAYABLE");
    expect(commissionGestureTarget("PAY")).toBe("PAID");
    expect(commissionGestureTarget("CANCEL")).toBe("CANCELLED");
  });
});

describe("les totaux par statut et par commercial", () => {
  const groups = [
    { salesRepId: "rep_a", status: "EARNED", count: 2, cents: 50_000 },
    { salesRepId: "rep_a", status: "PAYABLE", count: 1, cents: 25_000 },
    { salesRepId: "rep_a", status: "PAID", count: 3, cents: 75_000 },
    { salesRepId: "rep_a", status: "CANCELLED", count: 1, cents: 25_000 },
    { salesRepId: "rep_b", status: "FORECAST", count: 4, cents: 100_000 },
    { salesRepId: "rep_b", status: "EARNED", count: 1, cents: 25_000 },
  ];

  it("additionne chaque statut, y compris l'annulé, et met zéro quand il est absent", () => {
    const { byStatus } = summarizeCommissions(groups);
    expect(byStatus).toEqual({
      FORECAST: { count: 4, cents: 100_000 },
      EARNED: { count: 3, cents: 75_000 },
      PAYABLE: { count: 1, cents: 25_000 },
      PAID: { count: 3, cents: 75_000 },
      CANCELLED: { count: 1, cents: 25_000 },
    });
    expect(summarizeCommissions([]).byStatus.PAID).toEqual({ count: 0, cents: 0 });
  });

  it("un total par commercial, l'annulé exclu, du plus gros au plus petit", () => {
    const { byRep } = summarizeCommissions(groups);
    expect(byRep).toEqual([
      { salesRepId: "rep_a", count: 6, earnedCents: 50_000, payableCents: 25_000, paidCents: 75_000, totalCents: 150_000 },
      { salesRepId: "rep_b", count: 5, earnedCents: 25_000, payableCents: 0, paidCents: 0, totalCents: 125_000 },
    ]);
  });

  it("ignore un statut inconnu au lieu de fausser les totaux", () => {
    const { byStatus, byRep } = summarizeCommissions([{ salesRepId: "rep_a", status: "BIZARRE", count: 9, cents: 999 }]);
    expect(Object.values(byStatus).every((total) => total.count === 0 && total.cents === 0)).toBe(true);
    expect(byRep).toEqual([]);
  });

  it("un commercial n'ayant que de l'annulé n'apparaît pas", () => {
    expect(summarizeCommissions([{ salesRepId: "rep_a", status: "CANCELLED", count: 1, cents: 100 }]).byRep).toEqual([]);
  });
});

describe("le filtre par mois", () => {
  it("n'accepte que AAAA-MM", () => {
    expect(parseMonthParam("2026-10")).toBe("2026-10");
    for (const bad of ["2026-13", "2026-00", "26-10", "2026-1", "octobre", "", null, undefined, "2019-12", "2026-10-01"]) expect(parseMonthParam(bad), String(bad)).toBeNull();
  });

  it("les bornes suivent l'heure de Paris, début inclus et fin exclue", () => {
    // Octobre 2026 : heure d'été (UTC+2) jusqu'au 25 octobre, puis heure d'hiver (UTC+1).
    expect(monthBounds("2026-10")).toEqual({ start: new Date("2026-09-30T22:00:00Z"), end: new Date("2026-10-31T23:00:00Z") });
    // Janvier : UTC+1.
    expect(monthBounds("2026-01")).toEqual({ start: new Date("2025-12-31T23:00:00Z"), end: new Date("2026-01-31T23:00:00Z") });
    // Décembre : l'année change.
    expect(monthBounds("2026-12")).toEqual({ start: new Date("2026-11-30T23:00:00Z"), end: new Date("2026-12-31T23:00:00Z") });
    expect(monthBounds("n'importe quoi")).toBeNull();
  });

  it("une commission du 1er octobre à 00h30 (Paris) est d'octobre, pas de septembre", () => {
    const bounds = monthBounds("2026-10")!;
    const created = new Date("2026-09-30T22:30:00Z"); // 00:30 le 1er octobre à Paris
    expect(created >= bounds.start && created < bounds.end).toBe(true);
    const september = monthBounds("2026-09")!;
    expect(created >= september.start && created < september.end).toBe(false);
  });

  it("un libellé lisible", () => {
    expect(monthLabel("2026-10")).toBe("octobre 2026");
    expect(monthLabel("2027-02")).toBe("février 2027");
    expect(monthLabel("2026-08")).toBe("août 2026");
  });

  it("les douze derniers mois, du plus récent au plus ancien, en passant l'année", () => {
    const months = recentMonths(new Date("2026-02-15T10:00:00Z"), 4);
    expect(months).toEqual(["2026-02", "2026-01", "2025-12", "2025-11"]);
    expect(recentMonths(new Date("2026-10-06T10:00:00Z"))).toHaveLength(12);
    // Le 31 décembre à 23h30 UTC, il est déjà janvier à Paris.
    expect(recentMonths(new Date("2026-12-31T23:30:00Z"), 1)).toEqual(["2027-01"]);
  });
});
