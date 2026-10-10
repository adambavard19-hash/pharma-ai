import { describe, expect, it } from "vitest";
import { buildCounterNotice } from "@/core/counter/notice";
import { VIGILANCE_RULES, containsParacetamol, evaluateVigilances } from "../engines/vigilance";
import { drug } from "./fixtures";
import { analyse } from "./scenarios-conseils";

/**
 * Le paracétamol : 3 g par jour au maximum chez l'adulte, tous produits confondus.
 *
 * Consigne du pharmacien fondateur (10 octobre 2026) : un Fervex contient déjà 500 mg de paracétamol par sachet ; le pharmacien peut
 * y ajouter un paracétamol en complément, mais PharmaBoost doit dire que la limite est de 3 g par jour, 1 g par prise, toutes les
 * 6 heures environ. Les RCP (Doliprane 1000 mg : 1 g par prise, 4 heures minimum, 3 g par jour ; Fervex adultes : 500 mg par sachet,
 * 3 sachets au plus) disent 4 heures au minimum : la phrase garde les deux.
 */

const FERVEX = drug({ name: "FERVEX ADULTES, granulés pour solution buvable en sachet", inn: "PARACETAMOL, ACIDE ASCORBIQUE, PHENIRAMINE", atcCode: "N02BE51", therapeuticClass: "Antalgique antipyrétique", commonSideEffects: [] });
const DOLIPRANE = drug({ name: "DOLIPRANE 1000 mg, comprimé", inn: "PARACETAMOL", atcCode: "N02BE01", therapeuticClass: "Antalgique antipyrétique", commonSideEffects: [] });
const keys = (drugs: ReturnType<typeof drug>[]) => evaluateVigilances(drugs).map((v) => v.key);
const find = (drugs: ReturnType<typeof drug>[], key: string) => evaluateVigilances(drugs).find((v) => v.key === key);

describe("Fervex : déjà du paracétamol dans la formule", () => {
  it("la carte dit 3 g par jour au maximum, 500 mg par sachet, 1 g par prise, 6 heures", () => {
    const warning = find([FERVEX], "paracetamol-combination-limit");
    expect(warning?.severity).toBe("WARNING");
    expect(warning?.title).toBe("Paracétamol : 3 g par jour au maximum");
    expect(warning?.explanation).toMatch(/500 mg par sachet/);
    expect(warning?.explanation).toMatch(/3 g par jour/);
    expect(warning?.explanation).toMatch(/1 g par prise/);
    expect(warning?.explanation).toMatch(/6 heures/);
    expect(warning?.patientAdvice).toMatch(/un sachet de Fervex en apporte 500 mg/);
    expect(warning?.sources.join(" ")).toMatch(/CIS 69329731/);
  });

  it("elle remplace le simple « bon usage » : une seule mise en garde, la plus précise", () => {
    expect(keys([FERVEX])).toContain("paracetamol-combination-limit");
    expect(keys([FERVEX])).not.toContain("usage-paracetamol");
  });

  it("même si le médicament est classé autrement (code ATC du paracétamol seul), le nom Fervex suffit", () => {
    const misfiled = drug({ name: "FERVEX ADULTES SANS SUCRE", inn: null, atcCode: "N02BE01", therapeuticClass: null, commonSideEffects: [] });
    expect(keys([misfiled])).toContain("paracetamol-combination-limit");
    expect(keys([misfiled])).not.toContain("usage-paracetamol");
  });

  it("Dolirhume, Humex, Actifed : la même mise en garde", () => {
    for (const name of ["DOLIRHUME PARACETAMOL ET PSEUDOEPHEDRINE 500 mg/30 mg, comprimé", "HUMEX RHUME comprimé", "ACTIFED RHUME JOUR ET NUIT"]) {
      const cold = drug({ name, inn: null, atcCode: "N02BE51", therapeuticClass: null, commonSideEffects: [] });
      expect(keys([cold]), name).toContain("paracetamol-combination-limit");
    }
  });
});

describe("le paracétamol seul : le même plafond, en rappel", () => {
  it("Doliprane : 3 g par jour au maximum, 1 g par prise, 6 heures environ (4 heures minimum selon la notice) — en rappel, pas en alerte", () => {
    const usage = find([DOLIPRANE], "usage-paracetamol");
    expect(usage?.severity).toBe("INFO");
    expect(usage?.explanation).toMatch(/3 g de paracétamol par jour au maximum/);
    expect(usage?.explanation).toMatch(/6 heures/);
    expect(usage?.explanation).toMatch(/4 heures au minimum/);
    expect(keys([DOLIPRANE])).not.toContain("paracetamol-combination-limit");
    expect(keys([DOLIPRANE])).not.toContain("paracetamol-double-dose");
  });
});

describe("Fervex ET Doliprane dans la même vente : les doses s'additionnent", () => {
  it("une alerte « deux produits au paracétamol », avec les deux noms et le plafond", () => {
    const double = find([FERVEX, DOLIPRANE], "paracetamol-double-dose");
    expect(double?.severity).toBe("WARNING");
    expect(double?.drugNames).toHaveLength(2);
    expect(double?.explanation).toMatch(/s'additionnent/);
    expect(double?.explanation).toMatch(/3 g par jour/);
    expect(double?.explanation).toMatch(/500 mg/);
  });

  it("un seul médicament au paracétamol : pas d'alerte de doublon ; deux fois le même : pas non plus", () => {
    expect(keys([FERVEX])).not.toContain("paracetamol-double-dose");
    expect(keys([DOLIPRANE, DOLIPRANE])).not.toContain("paracetamol-double-dose");
  });

  it("un médicament sans paracétamol ne compte pas", () => {
    const ibuprofene = drug({ name: "IBUPROFENE 400 mg", inn: "IBUPROFENE", atcCode: "M01AE01", therapeuticClass: null, commonSideEffects: [] });
    expect(keys([FERVEX, ibuprofene])).not.toContain("paracetamol-double-dose");
    expect(containsParacetamol(ibuprofene)).toBe(false);
    expect(containsParacetamol(FERVEX)).toBe(true);
  });
});

describe("la fenêtre du poste : la limite est lue en alerte, pas seulement sur l'écran de la vente", () => {
  it("l'alerte du Fervex traverse jusqu'à l'avis du poste (sévérité WARNING)", () => {
    const result = analyse([{ name: "Fervex adultes sachet", atc: "N02BE51", klass: "Antalgique antipyrétique" }], []);
    const finding = result.safetyFindings.find((f) => f.code === "VIGILANCE_USAGE" && /3 g par jour/.test(f.message));
    expect(finding?.severity).toBe("WARNING");
    const notice = buildCounterNotice({
      reference: "ORD-1",
      prescriptionStatus: "ANALYZED",
      lineNames: ["Fervex adultes sachet"],
      alerts: result.safetyFindings.map((f) => ({ severity: f.severity, subjectType: f.subjectType, code: f.code, message: f.message, acknowledged: false })),
      recommendations: [],
      outcome: null,
    });
    expect(notice.alerts.join(" ")).toMatch(/3 g par jour/);
    expect(notice.alerts.join(" ")).toMatch(/500 mg par sachet/);
  });

  it("chaque règle de vigilance reste sourcée et versionnée", () => {
    for (const key of ["usage-paracetamol", "paracetamol-combination-limit"]) {
      const rule = VIGILANCE_RULES.find((candidate) => candidate.key === key)!;
      expect(rule.sources.length, key).toBeGreaterThan(0);
      expect(rule.version, key).toMatch(/^\d+\.\d+$/);
      expect(rule.explanationTemplate, key).toContain("{drug}");
    }
  });
});
