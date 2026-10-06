import { describe, expect, it } from "vitest";
import type { AdviceFamily } from "../family";
import { reserveFamilies, type PortfolioProfile } from "../portfolio";

/**
 * La sélection équilibrée, sur des listes à la main : chaque élément porte
 * seulement ce que la fonction lit (famille, sécurité, routine). La liste est
 * déjà classée par priorité clinique — c'est l'ordre du tableau.
 */

type Item = { id: string; family: AdviceFamily; safety?: boolean; routineKey?: string | null };

const MED: AdviceFamily = "MEDICAMENT";
const COMP: AdviceFamily = "COMPLEMENT";
const PARA: AdviceFamily = "PARAPHARMACIE";

const item = (id: string, family: AdviceFamily, extra: Partial<PortfolioProfile> = {}): Item => ({ id, family, ...extra });
const profileOf = (entry: Item): PortfolioProfile => ({ family: entry.family, safety: entry.safety ?? false, routineKey: entry.routineKey ?? null });
const ids = (list: Item[]) => list.map((entry) => entry.id);
const select = (list: Item[], limit: number) => reserveFamilies(list, limit, profileOf);

/** `count` produits de parapharmacie classés p1, p2, … */
const parapharmacie = (count: number, from = 1) => Array.from({ length: count }, (_, index) => item(`p${from + index}`, PARA));

describe("sous le plafond, rien ne change", () => {
  it("rend la liste reçue, telle quelle, sans réservation", () => {
    const list = [item("a", PARA), item("b", COMP), item("c", PARA)];
    const { limited, reservations } = select(list, 8);
    expect(limited).toEqual(list);
    expect(reservations).toEqual([]);
  });

  it("même quand une famille manque : on ne réserve rien qui n'ait besoin de l'être", () => {
    const list = [...parapharmacie(8)];
    expect(ids(select(list, 8).limited)).toEqual(ids(list));
  });

  it("à la limite exacte, tout est gardé", () => {
    const list = [...parapharmacie(7), item("c1", COMP)];
    const { limited, reservations } = select(list, 8);
    expect(ids(limited)).toEqual(ids(list));
    expect(reservations).toEqual([]);
  });

  it("ne modifie pas la liste reçue", () => {
    const list = [...parapharmacie(9), item("c1", COMP)];
    const copy = [...list];
    select(list, 8);
    expect(list).toEqual(copy);
  });
});

describe("une place réservée à chaque famille présente", () => {
  it("dix besoins dont neuf de parapharmacie et un complément de faible priorité : le complément est gardé", () => {
    const list = [...parapharmacie(9), item("c1", COMP)];
    const { limited, reservations } = select(list, 8);
    expect(limited).toHaveLength(8);
    expect(ids(limited)).toEqual(["p1", "p2", "p3", "p4", "p5", "p6", "p7", "c1"]);
    expect(reservations).toHaveLength(1);
    expect(reservations[0].family).toBe(COMP);
    expect(ids(reservations[0].kept)).toEqual(["c1"]);
    expect(ids(reservations[0].displaced)).toEqual(["p8"]);
  });

  it("garde le MEILLEUR de la famille manquante, pas le dernier", () => {
    const list = [...parapharmacie(9), item("c1", COMP), item("c2", COMP)];
    expect(ids(select(list, 8).limited)).toContain("c1");
    expect(ids(select(list, 8).limited)).not.toContain("c2");
  });

  it("cède le DERNIER conseil d'une famille qui en compte au moins deux", () => {
    const list = [item("c1", COMP), item("c2", COMP), ...parapharmacie(7), item("m1", MED)];
    const { limited, reservations } = select(list, 8);
    // Retenus : c1, c2, p1 à p6. Le dernier, p6, est de la parapharmacie (six conseils) : c'est lui qui cède.
    expect(ids(limited)).toEqual(["c1", "c2", "p1", "p2", "p3", "p4", "p5", "m1"]);
    expect(ids(reservations[0].displaced)).toEqual(["p6"]);
  });

  it("le dernier retenu, seul de sa famille, n'est pas cédé : c'est celui d'avant", () => {
    const list = [item("p1", PARA), item("p2", PARA), item("p3", PARA), item("c1", COMP), item("m1", MED)];
    const { limited, reservations } = select(list, 4);
    expect(ids(limited)).toEqual(["p1", "p2", "c1", "m1"]);
    expect(ids(reservations[0].displaced)).toEqual(["p3"]);
  });

  it("deux familles manquantes : chacune reçoit sa place", () => {
    const list = [...parapharmacie(10), item("c1", COMP), item("m1", MED)];
    const { limited, reservations } = select(list, 8);
    expect(limited).toHaveLength(8);
    expect(ids(limited)).toEqual(expect.arrayContaining(["c1", "m1"]));
    expect(reservations.map((r) => r.family).sort()).toEqual([COMP, MED]);
  });

  it("quand une seule place peut être cédée, la famille manquante la mieux classée l'emporte", () => {
    const medicamentFirst = [item("p1", PARA), item("p2", PARA), item("m1", MED), item("c1", COMP)];
    expect(select(medicamentFirst, 2).reservations.map((r) => r.family)).toEqual([MED]);
    expect(ids(select(medicamentFirst, 2).limited)).toEqual(["p1", "m1"]);

    const complementFirst = [item("p1", PARA), item("p2", PARA), item("c1", COMP), item("m1", MED)];
    expect(select(complementFirst, 2).reservations.map((r) => r.family)).toEqual([COMP]);
    expect(ids(select(complementFirst, 2).limited)).toEqual(["p1", "c1"]);
  });
});

describe("la sécurité passe toujours avant", () => {
  it("un conseil de sécurité n'est jamais déplacé, même le dernier retenu", () => {
    const list = [item("p1", PARA), item("p2", PARA), item("p3", PARA, { safety: true }), item("c1", COMP)];
    const { limited, reservations } = select(list, 3);
    expect(ids(limited)).toContain("p3");
    // p3 est protégé : c'est p2 qui cède.
    expect(ids(limited)).toEqual(["p1", "p3", "c1"]);
    expect(ids(reservations[0].displaced)).toEqual(["p2"]);
  });

  it("quand tout ce qui est retenu est de sécurité, rien n'est déplacé et la famille reste absente", () => {
    const list = [item("s1", PARA, { safety: true }), item("s2", PARA, { safety: true }), item("s3", PARA, { safety: true }), item("c1", COMP)];
    const { limited, reservations } = select(list, 3);
    expect(ids(limited)).toEqual(["s1", "s2", "s3"]);
    expect(reservations).toEqual([]);
  });

  it("un conseil de sécurité compte pour sa famille : le conseil de confort de la même famille peut céder", () => {
    // Complément : un de sécurité, un de confort ; le confort cède, la famille reste présente.
    const list = [item("s1", COMP, { safety: true }), item("c2", COMP), item("p1", PARA), item("m1", MED)];
    const { limited } = select(list, 3);
    expect(ids(limited)).toEqual(["s1", "p1", "m1"]);
  });

  it("un conseil de sécurité hors des premiers est le meilleur de sa famille : il passe, jamais un confort à sa place", () => {
    const list = [...parapharmacie(8), item("s1", COMP, { safety: true })];
    const { limited, reservations } = select(list, 8);
    expect(ids(limited)).toContain("s1");
    expect(reservations[0].family).toBe(COMP);
  });
});

describe("jamais le seul de sa famille", () => {
  it("chaque famille représentée parmi les premiers le reste après la réservation", () => {
    const list = [item("m1", MED), item("c1", COMP), ...parapharmacie(8)];
    const { limited } = select([...list, item("m2", MED)], 4);
    // Médicament, complément, deux parapharmacies : rien à réserver, mais rien ne doit disparaître non plus.
    expect(new Set(limited.map((entry) => entry.family))).toEqual(new Set([MED, COMP, PARA]));
  });

  it("quand chaque conseil retenu est le seul de sa famille, la famille manquante reste absente", () => {
    const list = [item("c1", COMP), item("p1", PARA), item("m1", MED), item("m2", MED)];
    // limite 2 → retenus c1, p1 (deux familles seules) ; le médicament ne prend la place de personne.
    const { limited, reservations } = select(list, 2);
    expect(ids(limited)).toEqual(["c1", "p1"]);
    expect(reservations).toEqual([]);
  });

  it("après une réservation, le conseil gardé n'est jamais cédé à son tour", () => {
    const list = [...parapharmacie(6), item("c1", COMP), item("m1", MED)];
    const { limited } = select(list, 4);
    // p1..p4 retenus ; c1 prend la place de p4, m1 celle de p3 — c1 n'est pas un candidat à la cession.
    expect(ids(limited)).toEqual(["p1", "p2", "c1", "m1"]);
  });
});

describe("une famille sans candidat reste absente", () => {
  it("rien n'est inventé : sans complément dans la liste, il n'y en a pas dans la sélection", () => {
    const list = [...parapharmacie(10)];
    const { limited, reservations } = select(list, 8);
    expect(ids(limited)).toEqual(ids(list.slice(0, 8)));
    expect(limited.some((entry) => entry.family === COMP || entry.family === MED)).toBe(false);
    expect(reservations).toEqual([]);
  });

  it("tout ce qui est gardé figurait dans la liste reçue", () => {
    const list = [...parapharmacie(9), item("c1", COMP)];
    for (const kept of select(list, 8).limited) expect(list).toContain(kept);
  });

  it("une liste vide donne une sélection vide", () => {
    expect(select([], 8)).toEqual({ limited: [], reservations: [] });
  });

  it("une limite nulle ne garde rien", () => {
    expect(select([item("p1", PARA)], 0).limited).toEqual([]);
  });
});

describe("une routine compte pour un seul conseil", () => {
  const routine = (key: string, steps: number, family: AdviceFamily = PARA) => Array.from({ length: steps }, (_, index) => item(`${key}-${index + 1}`, family, { routineKey: key }));

  it("trois étapes + six conseils seuls = sept conseils : tout passe sous un plafond de sept", () => {
    const list = [...routine("r", 3), ...parapharmacie(6)];
    const { limited } = select(list, 7);
    expect(limited).toHaveLength(9);
  });

  it("une routine retenue l'est en entier, jamais coupée par la limite", () => {
    const list = [item("p1", PARA), ...routine("r", 3), item("p2", PARA)];
    const { limited } = select(list, 2);
    expect(ids(limited)).toEqual(["p1", "r-1", "r-2", "r-3"]);
  });

  it("une routine ne se déplace qu'entière : jamais une étape isolée de sa routine", () => {
    const list = [item("p1", PARA), ...routine("r", 3), item("c1", COMP)];
    const { limited, reservations } = select(list, 2);
    // La routine (trois étapes, un conseil) cède sa place au complément : toutes ses étapes partent ensemble.
    expect(ids(limited)).toEqual(["p1", "c1"]);
    expect(ids(reservations[0].displaced)).toEqual(["r-1", "r-2", "r-3"]);
  });

  it("une routine gardée pour une famille arrive avec toutes ses étapes", () => {
    const list = [...parapharmacie(3), ...routine("r", 3, COMP)];
    const { limited, reservations } = select(list, 3);
    expect(ids(limited)).toEqual(["p1", "p2", "r-1", "r-2", "r-3"]);
    expect(ids(reservations[0].kept)).toEqual(["r-1", "r-2", "r-3"]);
  });

  it("une routine dont une étape est de sécurité est protégée en entier", () => {
    const steps = [item("r-1", PARA, { routineKey: "r", safety: true }), item("r-2", PARA, { routineKey: "r" })];
    const list = [item("p1", PARA), ...steps, item("c1", COMP)];
    const { limited } = select(list, 2);
    expect(ids(limited)).toEqual(["r-1", "r-2", "c1"]);
  });

  it("une routine qui est la seule porteuse d'une famille n'est pas cédée", () => {
    const mixed = [item("r-1", PARA, { routineKey: "r" }), item("r-2", COMP, { routineKey: "r" })];
    const list = [item("p1", PARA), ...mixed, item("m1", MED)];
    // Retenus : p1 et la routine (parapharmacie + complément). Complément seul porté par la routine : elle reste ; p1 cède.
    const { limited } = select(list, 2);
    expect(ids(limited)).toEqual(["r-1", "r-2", "m1"]);
  });

  it("des étapes de la même routine séparées par d'autres lignes restent ensemble", () => {
    const list = [item("r-1", PARA, { routineKey: "r" }), item("p1", PARA), item("r-2", PARA, { routineKey: "r" }), item("p2", PARA)];
    expect(ids(select(list, 2).limited)).toEqual(["r-1", "p1", "r-2"]);
  });
});

describe("l'ordre de sortie est celui de la priorité clinique", () => {
  it("le conseil réservé prend sa place d'origine dans la liste, c'est-à-dire la fin", () => {
    const list = [item("p1", PARA), item("p2", PARA), item("p3", PARA), item("c1", COMP)];
    const { limited } = select(list, 3);
    expect(ids(limited)).toEqual(["p1", "p2", "c1"]);
  });

  it("jamais plus de conseils que le plafond, une routine comptant pour un", () => {
    const list = [
      ...parapharmacie(6),
      item("r-1", PARA, { routineKey: "r" }),
      item("r-2", PARA, { routineKey: "r" }),
      item("c1", COMP),
      item("m1", MED),
      item("c2", COMP),
    ];
    const { limited } = select(list, 5);
    const conseils = new Set(limited.map((entry) => entry.routineKey ?? entry.id));
    expect(conseils.size).toBeLessThanOrEqual(5);
  });
});
