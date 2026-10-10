import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/config/env", () => ({ getEnv: () => ({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "cle", AI_MODEL: "modele-test" }) }));

const { extractFromDocument } = await import("../knowledge-extractor");

const reply = (items: unknown) => ({ content: [{ type: "tool_use", name: "proposer_conseils", input: { items } }], stop_reason: "tool_use" });

describe("l'appel au modèle", () => {
  it("transmet le document et la consigne stricte, et rend les propositions brutes", async () => {
    const create = vi.fn(async (_params: unknown) => reply([{ type: "RULE", quote: "x" }]));
    const result = await extractFromDocument({ title: "Fiche", note: "adulte", text: "Contenu du document." }, { create: create as never });
    expect(result).toEqual({ ok: true, items: [{ type: "RULE", quote: "x" }], model: "modele-test", parts: 1 });
    const call = create.mock.calls[0][0] as { system: string; messages: { content: string }[]; tool_choice: unknown };
    expect(call.system).toContain("N'ajoute AUCUNE connaissance médicale");
    expect(call.system).toContain("JAMAIS de contre-indication");
    expect(call.messages[0].content).toContain("Contenu du document.");
    expect(call.messages[0].content).toContain("adulte");
    expect(call.tool_choice).toEqual({ type: "tool", name: "proposer_conseils" });
  });

  it("lit un long document par parties et rassemble tout", async () => {
    const create = vi.fn(async () => reply([{ type: "ASSOCIATION", quote: "q" }]));
    const text = Array.from({ length: 12 }, (_, i) => `Paragraphe ${i}. ${"mot ".repeat(1000)}`).join("\n\n");
    const result = await extractFromDocument({ title: "Long", note: null, text }, { create });
    expect(result.ok && result.parts).toBeGreaterThan(1);
    expect(result.ok && result.items.length).toBe(create.mock.calls.length);
  });

  it("garde ce qui a pu être lu quand une partie échoue, et échoue franchement quand tout échoue", async () => {
    const text = Array.from({ length: 6 }, (_, i) => `Paragraphe ${i}. ${"mot ".repeat(1500)}`).join("\n\n");
    let calls = 0;
    const flaky = vi.fn(async () => { calls += 1; if (calls === 1) throw new Error("surcharge"); return reply([{ type: "RULE", quote: "q" }]); });
    expect((await extractFromDocument({ title: "L", note: null, text }, { create: flaky })).ok).toBe(true);
    const broken = vi.fn(async () => { throw new Error("réseau coupé"); });
    expect(await extractFromDocument({ title: "L", note: null, text }, { create: broken })).toMatchObject({ ok: false, error: expect.stringContaining("réseau coupé") });
  });

  it("une réponse sans outil n'invente rien : liste vide", async () => {
    const create = vi.fn(async () => ({ content: [{ type: "text" }], stop_reason: "end_turn" }));
    expect(await extractFromDocument({ title: "Fiche", note: null, text: "Texte." }, { create })).toMatchObject({ ok: true, items: [] });
  });
});
