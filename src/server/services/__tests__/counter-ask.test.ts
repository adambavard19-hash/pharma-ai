import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/services/counter-request", () => ({ adviseCounterRequest: vi.fn() }));

const { askNoticeBody } = await import("../counter-ask");
const { askWord } = await import("@/core/poste/island-bridge");

const proposal = (over: Record<string, unknown> = {}) => ({
  productId: "p1", name: "HYDRATIS PAST EFF MANGUE PASSION", brand: null, salePriceCents: 990, stockQuantity: 4, imageUrl: null, title: "Réhydratation", needKey: null,
  shortReason: "Compenser les pertes en eau et en sels.", counterScript: "Une pastille dans un verre d'eau.", patientReason: "", precautions: ["Diarrhée au-delà de 48 h : consultez."], question: "Depuis quand ?", totalScore: 1, ...over,
});
const answer = (proposals: unknown[], over: Record<string, unknown> = {}) => ({ id: "req1", summary: null, referToDoctor: false, referReason: null, needs: [], questions: ["Y a-t-il de la fièvre ?"], proposals, notes: [], blocked: [], providerId: "x", warnings: [], ...over }) as never;
const row = { id: "p1", ean: null, salePriceCents: 990, purchasePriceCents: 500, vatRate: 5.5, stockItem: { quantity: 4, alertThreshold: 2 } };

describe("« Demander un conseil » : la réponse dans la forme d'une vente bipée", () => {
  it("un conseil : nom de gamme, prix, marge, stock, fiche (posologie de la gamme, à dire au patient, questions)", () => {
    const body = askNoticeBody("diarrhée depuis hier", answer([proposal()]), [row]);
    expect(body.subject).toBe("diarrhée depuis hier");
    expect(body.items).toHaveLength(1);
    const item = body.items![0]!;
    expect(item.name).toBe("Hydratis, pastilles d'électrolytes · goût au choix");
    expect(item.priceCents).toBe(990);
    expect(item.marginCents).toBeGreaterThan(0);
    const sheet = item.sheet as { description: string; usage: { text: string }[]; ask: string[] };
    expect(sheet.description).toMatch(/par jour/);
    expect(sheet.usage.map((line) => line.text)).toContain("Diarrhée au-delà de 48 h : consultez.");
    expect(sheet.ask).toEqual(["Depuis quand ?", "Y a-t-il de la fièvre ?"]);
  });

  it("un prix sous le prix d'achat : ni prix ni marge ; orienter vers le médecin : une alerte ; rien en stock : un mot", () => {
    expect(askNoticeBody("x", answer([proposal()]), [{ ...row, purchasePriceCents: 5000 }]).items![0]).toMatchObject({ priceCents: null, marginCents: null });
    expect(askNoticeBody("x", answer([], { referToDoctor: true, referReason: "fièvre de plus de 3 jours" }), []).alerts).toEqual(["Orienter vers le médecin : fièvre de plus de 3 jours"]);
    expect(askNoticeBody("x", answer([]), []).advice).toEqual(["Aucun produit conseil du stock ne répond à cette demande."]);
  });

  it("le mot envoyé à l'agent : « DEMANDE » et le texte en base64, jamais vide", () => {
    expect(askWord("  Mal de gorge  ")).toBe(`DEMANDE ${Buffer.from("Mal de gorge").toString("base64")}`);
    expect(askWord(" ")).toBeNull();
  });
});
