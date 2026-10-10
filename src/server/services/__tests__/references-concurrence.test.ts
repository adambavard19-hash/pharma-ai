import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ count: vi.fn(), exists: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: { prescription: { count: m.count, findFirst: m.exists }, sale: { count: m.count, findFirst: m.exists } } }));

const { createWithReference, isReferenceCollision } = await import("../references");
const collision = () => Object.assign(new Error("Unique constraint"), { code: "P2002", meta: { target: ["pharmacyId", "reference"] } });

beforeEach(() => {
  vi.clearAllMocks();
  m.count.mockResolvedValue(0);
  m.exists.mockResolvedValue(null);
});

describe("deux créations simultanées dans la même pharmacie", () => {
  it("la seconde, refusée par la base, recalcule sa référence et réussit : aucun bip, aucune vente perdus", async () => {
    // Le concurrent a pris ORD-0001 pendant que ce poste calculait : la base refuse, puis le numéro suivant est libre.
    let competitorWrote = false;
    const create = vi.fn(async (reference: string) => { if (create.mock.calls.length === 1) { competitorWrote = true; throw collision(); } return { id: "x", reference }; });
    m.count.mockImplementation(async ({ where }: { where: { reference?: string } }) => (where.reference ? (competitorWrote && where.reference === "ORD-0001" ? 1 : 0) : competitorWrote ? 1 : 0));
    const result = await createWithReference("prescription", "ph1", create);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls.map((call) => call[0])).toEqual(["ORD-0001", "ORD-0002"]);
    expect(result.reference).toBe("ORD-0002");
  });

  it("vingt créations en même temps finissent toutes, avec vingt références différentes", async () => {
    const taken = new Set<string>();
    const create = async (reference: string) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      if (taken.has(reference)) throw collision();
      taken.add(reference);
      return reference;
    };
    // Le compteur de la base ne bouge qu'à l'écriture : tous les concurrents voient d'abord le même nombre.
    m.count.mockImplementation(async ({ where }: { where: { reference?: string } }) => (where.reference ? (taken.has(where.reference) ? 1 : 0) : taken.size));
    const results = await Promise.all(Array.from({ length: 20 }, () => createWithReference("prescription", "ph1", create, { attempts: 30 })));
    expect(new Set(results).size).toBe(20);
  });

  it("une autre erreur remonte tout de suite, sans réessai", async () => {
    const create = vi.fn(async () => { throw new Error("base indisponible"); });
    await expect(createWithReference("sale", "ph1", create)).rejects.toThrow("base indisponible");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("une collision qui ne finit jamais s'arrête, avec l'erreur d'origine", async () => {
    const create = vi.fn(async () => { throw collision(); });
    await expect(createWithReference("sale", "ph1", create, { attempts: 3 })).rejects.toMatchObject({ code: "P2002" });
    expect(create).toHaveBeenCalledTimes(3);
  });

  it("reconnaît une collision de référence, pas une autre contrainte d'unicité", () => {
    expect(isReferenceCollision(collision())).toBe(true);
    expect(isReferenceCollision(Object.assign(new Error("x"), { code: "P2002", meta: { target: ["email"] } }))).toBe(false);
    expect(isReferenceCollision(new Error("autre"))).toBe(false);
    expect(isReferenceCollision(null)).toBe(false);
  });
});
