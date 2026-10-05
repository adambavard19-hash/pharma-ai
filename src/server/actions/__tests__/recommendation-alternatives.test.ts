import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma";
import { PERMISSIONS } from "@/server/rbac/permissions";

/**
 * « Proposer celle-ci » : le pharmacien met une autre référence du même besoin
 * à la place du conseil retenu. Une base en mémoire fait ce que fait la vraie :
 * une mise à jour conditionnelle, une transaction qui se défait en cas d'échec.
 */

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  recordAudit: vi.fn(),
  revalidatePath: vi.fn(),
  /** Appelé après la lecture du produit, avant l'écriture : permet de simuler une course. */
  betweenReadAndWrite: null as (() => void) | null,
  failEvent: false,
  reads: 0,
  db: { recommendation: {} as Row, products: {} as Record<string, Row>, events: [] as Row[] },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth/session", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/server/db/client", () => {
  const clone = <T>(value: T): T => structuredClone(value);
  const state = mocks.db;
  const select = (row: Row, fields: Row) => Object.fromEntries(Object.keys(fields).map((key) => [key, clone(row[key])]));

  const writeTo = {
    recommendation: {
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const row = state.recommendation;
        // Chaque condition posée par l'action doit tenir, ni plus ni moins : sans elle, rien ne protège.
        const holds = Object.entries(where).every(([key, condition]) =>
          typeof condition === "object" && condition !== null && "in" in condition ? (condition as { in: unknown[] }).in.includes(row[key]) : row[key] === condition,
        );
        if (!holds) return { count: 0 };
        for (const [key, value] of Object.entries(data)) row[key] = value === Prisma.DbNull ? null : clone(value);
        return { count: 1 };
      },
    },
    recommendationEvent: {
      create: async ({ data }: { data: Row }) => {
        if (mocks.failEvent) throw new Error("écriture de l'historique impossible");
        state.events.push(clone(data));
        return data;
      },
    },
  };

  return {
    prisma: {
      recommendation: {
        findUnique: async ({ where, select: fields }: { where: { id: string }; select: Row }) => {
          mocks.reads += 1;
          return state.recommendation.id === where.id ? select(state.recommendation, fields) : null;
        },
      },
      product: {
        findUnique: async ({ where, select: fields }: { where: { id: string }; select: Row }) => {
          mocks.reads += 1;
          const found = state.products[where.id];
          mocks.betweenReadAndWrite?.();
          return found ? select(found, fields) : null;
        },
      },
      // Une transaction qui se défait si elle échoue : jamais d'état à moitié échangé.
      $transaction: async (work: (tx: typeof writeTo) => Promise<unknown>) => {
        const before = { recommendation: clone(state.recommendation), events: clone(state.events) };
        try {
          return await work(writeTo);
        } catch (error) {
          state.recommendation = before.recommendation;
          state.events = before.events;
          throw error;
        }
      },
    },
  };
});

const { chooseAdviceAlternativeAction } = await import("../recommendations");

const SESSION = { scope: { pharmacyId: "ph_1", organizationId: "org_1", userId: "user_1" }, permissions: new Set<string>() };

const BREAKDOWN = { relevance: 1, safety: 1, availability: 1, patientFit: 0.95, pharmacistPreference: 0.5, validationHistory: 0.5, commercial: 0.8 };
const explanation = (detail: string) => [{ dimension: "relevance", label: "Pertinence du conseil", value: 1, weight: 0.4, detail, role: "SCORE" }];
const SERINGUE = { productId: "seringue", name: "Seringue nasale", salePriceCents: 590, stockQuantity: 4, label: "Seringue ou dispositif de lavage nasal", reason: "Pour laver le nez." };
const VIGILANCE = { population: "PREGNANCY", level: "CAUTION", status: true, text: "À vérifier.", origin: "PRODUCT", sources: ["Déclaré par la pharmacie"] };

function alternative(productId: string, totalScore: number, overrides: Row = {}) {
  return {
    productId,
    totalScore,
    breakdown: { ...BREAKDOWN, commercial: totalScore },
    justification: `Référence retenue : ${productId}.`,
    shortReason: "Antibiothérapie : la flore intestinale peut être perturbée.",
    patientReason: `${productId} l'accompagne.`,
    counterScript: `« ${productId} l'accompagne. »`,
    precautions: [`Précaution de ${productId}`],
    explanation: explanation(`détail de ${productId}`),
    vigilances: [],
    shortDate: null,
    ...overrides,
  };
}

function seed(overrides: Row = {}) {
  mocks.db.recommendation = {
    id: "rec_1",
    pharmacyId: "ph_1",
    prescriptionId: "rx_1",
    productId: "prod-a",
    status: "PROPOSED",
    totalScore: 0.9,
    scoreBreakdown: { ...BREAKDOWN, commercial: 0.9, explanation: explanation("détail de prod-a") },
    justification: "Référence retenue : prod-a.",
    shortReason: "Antibiothérapie : la flore intestinale peut être perturbée.",
    patientReason: "prod-a l'accompagne.",
    counterScript: "« prod-a l'accompagne. »",
    precautions: ["Précaution de prod-a"],
    vigilances: null,
    companion: null,
    unitPriceCents: 1490,
    decidedByUserId: null,
    decidedAt: null,
    pharmacistNote: "Note du pharmacien",
    quantity: 2,
    alternatives: [
      alternative("prod-b", 0.85, { vigilances: [VIGILANCE], companion: SERINGUE }),
      alternative("prod-c", 0.8),
    ],
    ...overrides,
  };
  mocks.db.events = [];
}

function stock(id: string, overrides: Row = {}) {
  return {
    id,
    pharmacyId: "ph_1",
    name: `Produit ${id.slice(-1).toUpperCase()}`,
    salePriceCents: 1500,
    isActive: true,
    stockItem: { quantity: 6 },
    // L'argumentaire et les précautions de la fiche produit : l'échange n'en reprend rien.
    commercialClaims: ["Argument commercial de la fiche"],
    precautions: ["Précaution de la fiche"],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.betweenReadAndWrite = null;
  mocks.failEvent = false;
  mocks.reads = 0;
  mocks.requirePermission.mockResolvedValue(SESSION);
  seed();
  mocks.db.products = {
    "prod-a": stock("prod-a", { salePriceCents: 1490 }),
    "prod-b": stock("prod-b", { salePriceCents: 1690 }),
    "prod-c": stock("prod-c", { salePriceCents: 990 }),
    "prod-z": stock("prod-z"),
  };
});

const choose = (productId: string, recommendationId = "rec_1") => chooseAdviceAlternativeAction({ recommendationId, productId });
const row = () => mocks.db.recommendation;
const alternativeIds = () => (row().alternatives as { productId: string }[]).map((a) => a.productId);
const unchanged = () => {
  expect(row().productId).toBe("prod-a");
  expect(alternativeIds()).toEqual(["prod-b", "prod-c"]);
  expect(mocks.db.events).toEqual([]);
  expect(mocks.recordAudit).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
};

describe("l'autorisation", () => {
  it("exige le droit de trancher les recommandations", async () => {
    await choose("prod-b");
    expect(mocks.requirePermission).toHaveBeenCalledWith(PERMISSIONS.RECOMMENDATION_DECIDE);
  });

  it("sans ce droit, rien n'est lu ni écrit", async () => {
    mocks.requirePermission.mockRejectedValueOnce(new Error("FORBIDDEN"));
    await expect(choose("prod-b")).rejects.toThrow("FORBIDDEN");
    expect(mocks.reads).toBe(0);
    unchanged();
  });

  it("refuse une demande mal formée sans rien écrire", async () => {
    for (const payload of [{ recommendationId: "", productId: "prod-b" }, { recommendationId: "rec_1", productId: "" }]) {
      const result = await chooseAdviceAlternativeAction(payload);
      expect(result.ok).toBe(false);
    }
    unchanged();
  });
});

describe("l'isolation d'officine", () => {
  it("ne touche pas une recommandation d'une autre officine", async () => {
    seed({ pharmacyId: "ph_2" });
    const result = await choose("prod-b");
    expect(result).toMatchObject({ ok: false, error: "Recommandation introuvable dans cette officine." });
    expect(row().productId).toBe("prod-a");
    expect(mocks.db.events).toEqual([]);
  });

  it("ne connaît pas une recommandation qui n'existe pas", async () => {
    expect(await choose("prod-b", "rec_inconnue")).toMatchObject({ ok: false, error: "Recommandation introuvable dans cette officine." });
    unchanged();
  });

  it("refuse une alternative dont le produit appartient à une autre officine", async () => {
    mocks.db.products["prod-b"] = stock("prod-b", { pharmacyId: "ph_2" });
    expect(await choose("prod-b")).toMatchObject({ ok: false, error: "Produit introuvable dans cette officine." });
    unchanged();
  });

  it("refuse une alternative dont le produit n'existe plus ou n'est plus actif", async () => {
    delete mocks.db.products["prod-b"];
    expect(await choose("prod-b")).toMatchObject({ ok: false, error: "Produit introuvable dans cette officine." });
    mocks.db.products["prod-c"] = stock("prod-c", { isActive: false });
    expect(await choose("prod-c")).toMatchObject({ ok: false, error: "Produit introuvable dans cette officine." });
    unchanged();
  });
});

describe("ce que le serveur accepte : ce que le moteur a admis", () => {
  it("refuse un produit qui ne figure pas dans les alternatives enregistrées, même valable et en stock", async () => {
    expect(await choose("prod-z")).toMatchObject({ ok: false, error: "Cette référence ne fait pas partie des alternatives retenues pour ce conseil." });
    unchanged();
  });

  it("refuse la référence déjà retenue", async () => {
    seed({ alternatives: [alternative("prod-a", 0.9), alternative("prod-c", 0.8)] });
    expect((await choose("prod-a")).ok).toBe(false);
    expect(row().productId).toBe("prod-a");
    expect(mocks.db.events).toEqual([]);
  });

  it("refuse tout quand le conseil n'a aucune alternative enregistrée (analyse ancienne)", async () => {
    for (const alternatives of [null, [], "illisible"]) {
      seed({ alternatives });
      expect((await choose("prod-b")).ok).toBe(false);
      expect(row().productId).toBe("prod-a");
    }
    expect(mocks.db.events).toEqual([]);
  });

  it("refuse une alternative en rupture, ou sans fiche de stock", async () => {
    mocks.db.products["prod-b"] = stock("prod-b", { stockItem: { quantity: 0 } });
    mocks.db.products["prod-c"] = stock("prod-c", { stockItem: null });
    expect(await choose("prod-b")).toMatchObject({ ok: false, error: "Produit B n'est plus en stock : choisissez une autre référence." });
    expect((await choose("prod-c")).ok).toBe(false);
    unchanged();
  });

  it("refuse quand le conseil actuel n'est pas reconstituable : on ne perd pas la référence retenue", async () => {
    seed({ scoreBreakdown: { manual: true } });
    expect(await choose("prod-b")).toMatchObject({ ok: false });
    expect(row().productId).toBe("prod-a");
    expect(mocks.db.events).toEqual([]);
  });

  it("n'échange pas un conseil porté par un médicament du catalogue national (aucun produit de l'officine)", async () => {
    seed({ productId: null });
    expect((await choose("prod-b")).ok).toBe(false);
    expect(row().productId).toBeNull();
    expect(mocks.db.events).toEqual([]);
  });
});

describe("les statuts", () => {
  for (const status of ["ACCEPTED", "DECLINED", "REMOVED", "PURCHASED", "IGNORED"]) {
    it(`un conseil ${status} est tranché : rien ne change`, async () => {
      seed({ status });
      expect(await choose("prod-b")).toMatchObject({ ok: false, error: "Ce conseil est déjà tranché : annulez d'abord la décision pour changer de référence." });
      expect(row().productId).toBe("prod-a");
      expect(row().status).toBe(status);
      expect(mocks.db.events).toEqual([]);
    });
  }

  for (const status of ["PROPOSED", "PRESENTED", "MODIFIED", "REPLACED"]) {
    it(`un conseil ${status} attend encore une décision : l'échange passe, le statut ne bouge pas`, async () => {
      seed({ status });
      expect((await choose("prod-b")).ok).toBe(true);
      expect(row().productId).toBe("prod-b");
      expect(row().status).toBe(status);
    });
  }
});

describe("l'échange", () => {
  it("rétablit exactement ce que le moteur avait produit pour l'alternative", async () => {
    const result = await choose("prod-b");
    expect(result).toEqual({ ok: true, data: null, message: "Conseil remplacé par Produit B." });

    expect(row()).toMatchObject({
      productId: "prod-b",
      totalScore: 0.85,
      scoreBreakdown: { ...BREAKDOWN, commercial: 0.85, explanation: explanation("détail de prod-b") },
      justification: "Référence retenue : prod-b.",
      shortReason: "Antibiothérapie : la flore intestinale peut être perturbée.",
      patientReason: "prod-b l'accompagne.",
      counterScript: "« prod-b l'accompagne. »",
      precautions: ["Précaution de prod-b"],
      companion: SERINGUE,
    });
    expect(row().vigilances).toEqual([VIGILANCE]);
  });

  it("prend le prix du jour, pas l'argumentaire commercial ni les précautions de la fiche produit", async () => {
    await choose("prod-b");
    expect(row().unitPriceCents).toBe(1690);
    expect(row().patientReason).not.toContain("Argument commercial");
    expect(row().precautions).not.toContain("Précaution de la fiche");
  });

  it("garde ce qui n'est pas le produit : quantité, note du pharmacien, décision", async () => {
    await choose("prod-b");
    expect(row()).toMatchObject({ quantity: 2, pharmacistNote: "Note du pharmacien", decidedByUserId: null, decidedAt: null, status: "PROPOSED" });
  });

  it("l'ancienne référence devient une alternative, l'alternative choisie en sort, par score décroissant", async () => {
    await choose("prod-b");
    const alternatives = row().alternatives as { productId: string; totalScore: number }[];
    expect(alternatives.map((a) => [a.productId, a.totalScore])).toEqual([["prod-a", 0.9], ["prod-c", 0.8]]);
    // L'ancienne référence garde tout ce qu'il faut pour revenir : son score, ses textes, ses précautions.
    expect(alternatives[0]).toMatchObject({
      justification: "Référence retenue : prod-a.",
      patientReason: "prod-a l'accompagne.",
      counterScript: "« prod-a l'accompagne. »",
      precautions: ["Précaution de prod-a"],
      breakdown: { ...BREAKDOWN, commercial: 0.9 },
    });
  });

  it("efface les vigilances et le produit associé de l'ancienne référence quand l'alternative n'en porte pas", async () => {
    seed({ vigilances: [VIGILANCE], companion: SERINGUE });
    await choose("prod-c");
    expect(row().vigilances).toBeNull();
    expect(row().companion).toBeNull();
    // … et les retrouve en revenant en arrière.
    mocks.db.products["prod-a"] = stock("prod-a", { salePriceCents: 1490 });
    await choose("prod-a");
    expect(row().vigilances).toEqual([VIGILANCE]);
    expect(row().companion).toEqual(SERINGUE);
  });

  it("note l'échange dans l'historique et l'audit, avec des identifiants seulement", async () => {
    await choose("prod-b");
    expect(mocks.db.events).toEqual([
      { recommendationId: "rec_1", type: "REPLACED", userId: "user_1", metadata: { alternative: true, fromProductId: "prod-a", toProductId: "prod-b" } },
    ]);
    expect(mocks.recordAudit).toHaveBeenCalledWith({
      action: "recommendation.replaced",
      entityType: "Recommendation",
      entityId: "rec_1",
      pharmacyId: "ph_1",
      userId: "user_1",
      metadata: { alternative: true, fromProductId: "prod-a", toProductId: "prod-b" },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/vente/rx_1");
  });

  it("revient en arrière : choisir l'ancienne référence rétablit le conseil d'origine, liste comprise", async () => {
    const original = structuredClone(row());
    await choose("prod-b");
    expect(row().productId).toBe("prod-b");
    await choose("prod-a");

    expect(row()).toMatchObject({
      productId: "prod-a",
      totalScore: 0.9,
      scoreBreakdown: original.scoreBreakdown,
      justification: original.justification,
      patientReason: original.patientReason,
      counterScript: original.counterScript,
      precautions: original.precautions,
      unitPriceCents: 1490,
      status: "PROPOSED",
    });
    expect(row().vigilances).toBeNull();
    expect(row().companion).toBeNull();
    expect(row().alternatives).toEqual(original.alternatives);
    expect(mocks.db.events).toHaveLength(2);
  });

  it("garde au plus trois alternatives, sans doublon, à chaque échange", async () => {
    seed({ alternatives: [alternative("prod-b", 0.85), alternative("prod-c", 0.8), alternative("prod-z", 0.7)] });
    await choose("prod-c");
    const ids = alternativeIds();
    expect(ids).toEqual(["prod-a", "prod-b", "prod-z"]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeLessThanOrEqual(3);
  });
});

describe("la concurrence", () => {
  it("deux clics simultanés sur deux alternatives : un seul passe, la liste reste saine", async () => {
    const [first, second] = await Promise.all([choose("prod-b"), choose("prod-c")]);
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
    const failed = first.ok ? second : first;
    expect(failed).toMatchObject({ ok: false, error: "Ce conseil vient d'être modifié : rechargez l'écran avant de choisir une référence." });

    const winner = first.ok ? "prod-b" : "prod-c";
    const loser = winner === "prod-b" ? "prod-c" : "prod-b";
    expect(row().productId).toBe(winner);
    expect([...alternativeIds()].sort()).toEqual(["prod-a", loser]);
    expect(mocks.db.events).toHaveLength(1);
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
  });

  it("deux clics sur la même alternative : un seul échange", async () => {
    const results = await Promise.all([choose("prod-b"), choose("prod-b")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(row().productId).toBe("prod-b");
    expect([...alternativeIds()].sort()).toEqual(["prod-a", "prod-c"]);
    expect(mocks.db.events).toHaveLength(1);
  });

  it("une acceptation arrivée entre la lecture et l'écriture empêche l'échange", async () => {
    mocks.betweenReadAndWrite = () => {
      row().status = "ACCEPTED";
    };
    expect(await choose("prod-b")).toMatchObject({ ok: false, error: "Ce conseil vient d'être modifié : rechargez l'écran avant de choisir une référence." });
    expect(row().productId).toBe("prod-a");
    expect(alternativeIds()).toEqual(["prod-b", "prod-c"]);
    expect(mocks.db.events).toEqual([]);
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("un remplacement à la main arrivé entre la lecture et l'écriture empêche l'échange", async () => {
    mocks.betweenReadAndWrite = () => {
      row().productId = "prod-z";
    };
    expect((await choose("prod-b")).ok).toBe(false);
    expect(row().productId).toBe("prod-z");
    expect(mocks.db.events).toEqual([]);
  });
});

describe("la transaction", () => {
  it("si l'historique ne s'écrit pas, le conseil n'est pas échangé", async () => {
    mocks.failEvent = true;
    await expect(choose("prod-b")).rejects.toThrow("écriture de l'historique impossible");
    unchanged();
  });
});
