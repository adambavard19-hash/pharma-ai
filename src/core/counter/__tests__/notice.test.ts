import { describe, expect, it } from "vitest";
import { buildCounterNotice } from "../notice";

const base = {
  reference: "ORD-0021",
  prescriptionStatus: "ANALYZED",
  lineNames: ["DOLIPRANE 1000 mg, comprimé", "SPASFON LYOC 80 mg, lyophilisat oral"],
  alerts: [],
  recommendations: [],
  outcome: "PROPOSALS",
};

describe("l'avis de comptoir affiché sur le poste de caisse", () => {
  it("attend tant que l'analyse n'est pas finie", () => {
    expect(buildCounterNotice({ ...base, prescriptionStatus: "NEEDS_VERIFICATION" }).state).toBe("PENDING");
    expect(buildCounterNotice({ ...base, prescriptionStatus: "ANALYZING" }).state).toBe("PENDING");
  });

  it("se tait quand la vente est close", () => {
    expect(buildCounterNotice({ ...base, prescriptionStatus: "CANCELLED" }).state).toBe("CLOSED");
    expect(buildCounterNotice({ ...base, prescriptionStatus: "DELIVERED" }).state).toBe("CLOSED");
  });

  it("met les alertes avant les conseils, trois conseils au plus, sans la forme galénique", () => {
    const notice = buildCounterNotice({
      ...base,
      alerts: [
        { severity: "INFO", subjectType: "PRESCRIPTION_LINE", code: "VIGILANCE_USAGE", message: "Info", acknowledged: false },
        { severity: "WARNING", subjectType: "ANALYSIS", code: "INTERACTION_NO_REFERENTIAL", message: "Référentiel absent", acknowledged: false },
        { severity: "WARNING", subjectType: "PRODUCT", code: "DOCUMENTED_INTERACTION", message: "Interaction avec le millepertuis", acknowledged: false },
        { severity: "BLOCKING", subjectType: "ANALYSIS", code: "DRUG_NAME_UNREADABLE", message: "Ligne illisible", acknowledged: false },
        { severity: "BLOCKING", subjectType: "ANALYSIS", code: "DRUG_NAME_UNREADABLE", message: "Déjà acquittée", acknowledged: true },
      ],
      recommendations: [
        { name: "VITAMINE C 1 g, comprimé effervescent", priceCents: 890, reason: "Fatigue hivernale", status: "PROPOSED" },
        { name: "Retirée", priceCents: 100, reason: null, status: "REMOVED" },
        { name: "PROBIOTIQUE 30 gélules", priceCents: 1490, reason: "Antibiotique en cours", status: "ACCEPTED" },
        { name: "SÉRUM PHYSIOLOGIQUE", priceCents: null, reason: "Lavage de nez", status: "PROPOSED" },
        { name: "Quatrième", priceCents: 100, reason: "Trop", status: "PROPOSED" },
      ],
    });
    expect(notice.state).toBe("READY");
    expect(notice.subject).toBe("DOLIPRANE 1000 mg · SPASFON LYOC 80 mg");
    expect(notice.alerts).toEqual(["Ligne illisible", "Interaction avec le millepertuis"]);
    expect(notice.advice).toEqual(["VITAMINE C 1 g · 8,90 € · Fatigue hivernale", "PROBIOTIQUE 30 gélules · 14,90 € · Antibiotique en cours", "SÉRUM PHYSIOLOGIQUE · Lavage de nez"]);
  });

  it("dit pourquoi il n'y a rien, plutôt que de ne rien dire", () => {
    expect(buildCounterNotice({ ...base, outcome: "OUT_OF_STOCK" }).advice).toEqual(["Conseil possible mais produit absent du stock."]);
    expect(buildCounterNotice({ ...base, outcome: "NO_RELEVANT_NEED" }).advice).toEqual(["Rien à ajouter pour cette délivrance."]);
  });

  it("change d'empreinte quand une boîte s'ajoute, pas quand rien ne bouge", () => {
    const a = buildCounterNotice(base);
    const b = buildCounterNotice(base);
    const c = buildCounterNotice({ ...base, lineNames: [...base.lineNames, "SMECTA"] });
    expect(a.signature).toBe(b.signature);
    expect(a.signature).not.toBe(c.signature);
  });
});
