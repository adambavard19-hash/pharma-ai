import { describe, expect, it } from "vitest";
import { availabilityOf, buildCounterNotice, detectedLabelOf } from "../notice";

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

describe("les conseils structurés de la fenêtre du poste (photo, disponibilité, prix)", () => {
  const rec = (over: Partial<Parameters<typeof buildCounterNotice>[0]["recommendations"][number]> = {}) => ({ name: "ELUDAY GENCIVE 500 ml", priceCents: 790, reason: "Sécheresse buccale", status: "PROPOSED", imageUrl: "https://images.openbeautyfacts.org/x.jpg", quantity: 6, alertThreshold: 2, ...over });
  const notice = (recommendations: ReturnType<typeof rec>[], stockReliable?: boolean) => buildCounterNotice({ ...base, lineNames: ["QUETIAPINE VIATRIS LP 50 mg, comprimé"], recommendations, ...(stockReliable === undefined ? {} : { stockReliable }) });

  it("porte pour chaque conseil son nom, son prix, sa raison, sa photo et sa disponibilité", () => {
    const { items, drugs } = notice([rec()]);
    expect(drugs).toEqual(["QUETIAPINE VIATRIS LP 50 mg"]);
    expect(items).toEqual([{ name: "ELUDAY GENCIVE 500 ml", priceCents: 790, reason: "Sécheresse buccale", availability: "IN_STOCK", quantity: 6, imageUrl: "https://images.openbeautyfacts.org/x.jpg" }]);
  });

  it("dit la disponibilité telle qu'elle est : en stock, stock faible, rupture, inconnue", () => {
    expect(availabilityOf(6, 2, true)).toBe("IN_STOCK");
    expect(availabilityOf(2, 2, true)).toBe("LOW_STOCK");
    expect(availabilityOf(0, 2, true)).toBe("OUT_OF_STOCK");
    expect(availabilityOf(null, 2, true)).toBe("UNKNOWN");
    expect(availabilityOf(undefined, 2, true)).toBe("UNKNOWN");
  });

  it("n'affiche ni prix ni « en stock » quand le stock n'est pas fiable : « à vérifier »", () => {
    const { items, advice } = notice([rec()], false);
    expect(items[0]).toMatchObject({ priceCents: null, availability: "UNKNOWN", quantity: null });
    expect(advice[0]).toBe("ELUDAY GENCIVE 500 ml · Sécheresse buccale");
  });

  it("garde les textes d'avant : sans information de stock, rien ne change pour les anciens postes", () => {
    const old = buildCounterNotice({ ...base, recommendations: [{ name: "PROBIOTIQUE 30 gélules", priceCents: 1490, reason: "Antibiotique en cours", status: "ACCEPTED" }] });
    expect(old.advice).toEqual(["PROBIOTIQUE 30 gélules · 14,90 € · Antibiotique en cours"]);
    expect(old.items[0]).toMatchObject({ availability: "UNKNOWN", imageUrl: null });
  });

  it("n'a aucun conseil structuré tant que l'analyse n'est pas finie, ou quand elle n'a rien à dire", () => {
    expect(buildCounterNotice({ ...base, prescriptionStatus: "ANALYZING" }).items).toEqual([]);
    expect(buildCounterNotice({ ...base, outcome: "NO_RELEVANT_NEED" }).items).toEqual([]);
  });
});

describe("le titre de ce qui a été bipé", () => {
  it("dit « médicament » pour un médicament, « produit » pour un produit, et reste neutre dans le doute", () => {
    expect(detectedLabelOf(["DRUG"])).toBe("Médicament détecté");
    expect(detectedLabelOf(["DRUG", "DRUG"])).toBe("Médicament détecté");
    expect(detectedLabelOf(["PRODUCT"])).toBe("Produit détecté");
    expect(detectedLabelOf(["DRUG", "PRODUCT"])).toBe("Détecté");
    expect(detectedLabelOf([])).toBe("Détecté");
    expect(detectedLabelOf(undefined)).toBe("Détecté");
  });
  it("le porte dans l'avis", () => {
    expect(buildCounterNotice({ ...base, lineKinds: ["PRODUCT"] }).detectedLabel).toBe("Produit détecté");
    expect(buildCounterNotice({ ...base, prescriptionStatus: "ANALYZING", lineKinds: ["DRUG", "DRUG"] }).detectedLabel).toBe("Médicament détecté");
  });
});
