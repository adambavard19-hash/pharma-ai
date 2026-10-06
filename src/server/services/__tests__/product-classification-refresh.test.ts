import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `refreshDictionaryTags` : une correction du dictionnaire doit pouvoir RETIRER une étiquette qu'il
 * avait posée à tort. Le rafraîchissement conserve tout tag « non rafraîchissable » (posé par le
 * modèle ou par le pharmacien) : si les quatre étiquettes du conseil complet n'y figurent pas, un
 * coffret « lotion + peigne » garde « peigne anti-poux » pour toujours, même après correction.
 *
 * Prisma est simulé par une petite base en mémoire : ce qui est éprouvé est le calcul des
 * étiquettes, c'est-à-dire ce que le rafraîchissement écrit réellement.
 */

type Row = { id: string; name: string; description: string | null; category: string; matchingTags: string[] };

const db = vi.hoisted(() => {
  const state = { rows: [] as Row[], updates: [] as { id: string; data: { matchingTags: string[]; category: string } }[] };
  return {
    state,
    prisma: {
      product: {
        findMany: vi.fn(async () => state.rows),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: { matchingTags: string[]; category: string } }) => {
          state.updates.push({ id: where.id, data });
          const row = state.rows.find((candidate) => candidate.id === where.id)!;
          row.matchingTags = data.matchingTags;
          row.category = data.category;
          return row;
        }),
      },
    },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db.prisma }));
vi.mock("@/server/ai/registry", () => ({ getAIProvider: vi.fn() }));

import { refreshDictionaryTags } from "../product-classification";

const row = (id: string, name: string, matchingTags: string[], category = "DISPOSITIFS_MEDICAUX"): Row => ({ id, name, description: null, category, matchingTags });
const tagsOf = (id: string) => db.state.rows.find((candidate) => candidate.id === id)!.matchingTags;

beforeEach(() => {
  db.state.rows = [];
  db.state.updates = [];
});

describe("rafraîchir les étiquettes : les quatre étiquettes du conseil complet se retirent quand le dictionnaire se corrige", () => {
  it("un coffret « lotion + peigne » tagué à tort « peigne anti-poux » perd l'étiquette", async () => {
    db.state.rows = [row("paranix", "PARANIX Sol antipoux Hle ess Spr/100ml+peigne +peigne anti-poux", ["peigne anti-poux", "paranix", "antipoux"])];
    const summary = await refreshDictionaryTags({ pharmacyId: "pharmacie-1" });
    expect(summary.updated).toBe(1);
    expect(tagsOf("paranix")).not.toContain("peigne anti-poux");
    // Les mots du nom restent : ils servent à retrouver le produit au comptoir.
    expect(tagsOf("paranix")).toContain("paranix");
  });

  it("un kit de masques tagué à tort « chambre d'inhalation » perd l'étiquette", async () => {
    db.state.rows = [row("kit", "KIT MASQUE ADULTE AEROSOL CIRRUS", ["chambre d'inhalation", "kit"])];
    await refreshDictionaryTags({ pharmacyId: "pharmacie-1" });
    expect(tagsOf("kit")).not.toContain("chambre d'inhalation");
  });

  it("un collecteur d'urine tagué à tort « collecteur d'aiguilles » perd l'étiquette", async () => {
    db.state.rows = [row("urine", "MEDISET COLLECTEUR URINE 2L 30 NUIT", ["collecteur d'aiguilles", "collecteur", "urine"], "AUTRE")];
    await refreshDictionaryTags({ pharmacyId: "pharmacie-1" });
    expect(tagsOf("urine")).not.toContain("collecteur d'aiguilles");
  });

  it("un sirop de glucose tagué à tort « resucrage » perd l'étiquette", async () => {
    db.state.rows = [row("sirop", "SIROP DE GLUCOSE 125 ML", ["resucrage", "sirop", "glucose"], "NUTRITION")];
    await refreshDictionaryTags({ pharmacyId: "pharmacie-1" });
    expect(tagsOf("sirop")).not.toContain("resucrage");
  });

  it("une étiquette que le modèle ou le pharmacien a posée à la main reste", async () => {
    db.state.rows = [row("paranix", "PARANIX LOT ANTIPOUX 100ML + PEIGNE", ["peigne anti-poux", "choix du pharmacien"])];
    await refreshDictionaryTags({ pharmacyId: "pharmacie-1" });
    expect(tagsOf("paranix")).toContain("choix du pharmacien");
    expect(tagsOf("paranix")).not.toContain("peigne anti-poux");
  });
});

describe("rafraîchir les étiquettes : ce que le dictionnaire reconnaît toujours est conservé ou posé", () => {
  it("un vrai peigne, une vraie chambre, un vrai collecteur et du glucose gardent leur étiquette", async () => {
    db.state.rows = [
      row("peigne", "PEIGNE ANTI-POUX INOX", ["peigne anti-poux", "peigne", "anti", "poux", "inox"]),
      row("chambre", "BIOSYNEX CH/INHAL NOURISS 0-", ["chambre d'inhalation", "biosynex", "inhal", "nouriss"]),
      row("collecteur", "COLLECTEUR D'AIGUILLES DASTRI 1 L", ["collecteur d'aiguilles", "collecteur", "aiguilles", "dastri"]),
      row("glucose", "DEXTRO ENERGY CLASSIC 14 COMPRIMES", ["resucrage", "dextro", "energy", "classic", "comprimes"], "NUTRITION"),
    ];
    await refreshDictionaryTags({ pharmacyId: "pharmacie-1" });
    expect(tagsOf("peigne")).toContain("peigne anti-poux");
    expect(tagsOf("chambre")).toContain("chambre d'inhalation");
    expect(tagsOf("collecteur")).toContain("collecteur d'aiguilles");
    expect(tagsOf("glucose")).toContain("resucrage");
  });

  it("une chambre aux libellés abrégés, jamais étiquetée, reçoit l'étiquette au rafraîchissement", async () => {
    db.state.rows = [row("chambre", "INHAL'AIR CH/INHAL +6ANS/ADULTE", ["inhal", "air", "6ans", "adulte"])];
    await refreshDictionaryTags({ pharmacyId: "pharmacie-1" });
    expect(tagsOf("chambre")).toContain("chambre d'inhalation");
  });
});
