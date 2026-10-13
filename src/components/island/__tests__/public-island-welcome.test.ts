import { describe, expect, it } from "vitest";
import { rememberWelcome, shouldWelcome, WELCOME_KEY } from "../public-island";

/** Une mémoire de session en mémoire vive. */
function memory() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
}

describe("l'île du site s'ouvre d'elle-même à l'arrivée, une fois par visite", () => {
  it("s'ouvre à la première arrivée, plus après", () => {
    const storage = memory();
    expect(shouldWelcome(storage, false)).toBe(true);
    // Un effet rejoué (mode strict) ne perd pas l'ouverture : on ne retient qu'à l'ouverture.
    expect(shouldWelcome(storage, false)).toBe(true);
    rememberWelcome(storage);
    expect(storage.getItem(WELCOME_KEY)).toBe("1");
    expect(shouldWelcome(storage, false)).toBe(false);
  });

  it("ne s'ouvre jamais seule pour qui a demandé à réduire les animations", () => {
    expect(shouldWelcome(memory(), true)).toBe(false);
  });

  it("mémoire refusée ou absente : elle s'ouvre quand même, sans planter", () => {
    const refused = { getItem: () => { throw new Error("refusé"); }, setItem: () => { throw new Error("refusé"); } };
    expect(shouldWelcome(refused, false)).toBe(true);
    expect(() => rememberWelcome(refused)).not.toThrow();
    expect(shouldWelcome(null, false)).toBe(true);
  });
});
