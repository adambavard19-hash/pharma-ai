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
        { name: "Quatrième", priceCents: 100, reason: "Dernier retenu", status: "PROPOSED" },
        { name: "Cinquième", priceCents: 100, reason: "Trop", status: "PROPOSED" },
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
    expect(items).toEqual([{ id: null, drug: null, challenge: null, shortDateOn: null, outcome: "NONE", name: "ELUDAY GENCIVE 500 ml", priceCents: 790, reason: "Sécheresse buccale", availability: "IN_STOCK", quantity: 6, imageUrl: "https://images.openbeautyfacts.org/x.jpg" }]);
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

describe("l'avis ne montre pas les explications sur nos propres propositions écartées", () => {
  const alerts = [
    { severity: "BLOCKING", subjectType: "PRODUCT", code: "SUBSTANCE_ALREADY_PRESCRIBED", message: "« ALLIUM CEPA COMPOSE » écarté : contient ALLIUM CEPA, déjà présent dans cette délivrance. Risque de doublement de dose.", acknowledged: false },
    { severity: "BLOCKING", subjectType: "PRODUCT", code: "PATIENT_ALLERGY", message: "« X » écarté : allergie déclarée (arnica).", acknowledged: false },
    { severity: "BLOCKING", subjectType: "PRODUCT", code: "PRESCRIPTION_REQUIRED", message: "« Y » écarté : soumis à prescription.", acknowledged: false },
    { severity: "WARNING", subjectType: "PRODUCT", code: "DOCUMENTED_INTERACTION", message: "Interaction avec le millepertuis", acknowledged: false },
  ];

  it("garde les vraies alertes sur ce qui est délivré, retire les « écarté »", () => {
    const notice = buildCounterNotice({ ...base, alerts });
    expect(notice.alerts).toEqual(["Interaction avec le millepertuis"]);
  });

  it("n'affiche rien d'alarmant quand il n'y a que des produits écartés : « rien à ajouter », pas une alerte", () => {
    const notice = buildCounterNotice({ ...base, alerts: alerts.slice(0, 3) });
    expect(notice.alerts).toEqual([]);
    expect(notice.advice).toEqual(["Rien à ajouter pour cette délivrance."]);
    expect(notice.items).toEqual([]);
  });
});

describe("seul parle dans la fenêtre du poste ce que la pharmacienne a validé", () => {
  const rec = (name: string, trusted?: boolean) => ({ name, priceCents: 590, reason: "Une raison", status: "PROPOSED", ...(trusted === undefined ? {} : { trusted }) });

  it("écarte un conseil dont la règle n'est pas relue, garde les autres", () => {
    const notice = buildCounterNotice({ ...base, recommendations: [rec("ADIARIL", false), rec("PASTILLES GORGE", true), rec("SANS INFORMATION")] });
    expect(notice.items.map((item) => item.name)).toEqual(["PASTILLES GORGE", "SANS INFORMATION"]);
  });

  it("quand tout a été supprimé de PharmaBoost : « rien à ajouter », pas une alerte, pas un conseil supprimé", () => {
    const notice = buildCounterNotice({ ...base, recommendations: [rec("ADIARIL", false)] });
    expect(notice.items).toEqual([]);
    expect(notice.advice).toEqual(["Rien à ajouter pour cette délivrance."]);
  });

  it("les trois conseils de la fenêtre sont pris parmi ceux qui ont le droit d'y être", () => {
    const notice = buildCounterNotice({ ...base, recommendations: [rec("A", false), rec("B", false), rec("C", true), rec("D", true), rec("E", true), rec("F", true), rec("G", true)] });
    expect(notice.items.map((item) => item.name)).toEqual(["C", "D", "E"]);
  });
});

describe("la fenêtre qui reste ouverte pendant toute la vente", () => {
  const rec = (over: Partial<Parameters<typeof buildCounterNotice>[0]["recommendations"][number]> = {}) => ({ id: "r1", name: "ELUDAY GENCIVE 500 ml", forDrug: "QUETIAPINE VIATRIS LP 50 mg, comprimé", priceCents: 790, reason: "Sécheresse buccale", status: "PROPOSED", quantity: 6, alertThreshold: 2, ...over });
  const notice = (recommendations: ReturnType<typeof rec>[]) => buildCounterNotice({ ...base, lineNames: ["QUETIAPINE VIATRIS LP 50 mg, comprimé"], recommendations });

  it("chaque conseil dit quel médicament il concerne, sans la forme", () => {
    expect(notice([rec()]).items[0]).toMatchObject({ id: "r1", drug: "QUETIAPINE VIATRIS LP 50 mg", outcome: "NONE" });
  });

  it("« Vendu » et « Non vendu » marquent le conseil sans le faire disparaître", () => {
    const { items } = notice([rec({ id: "a", status: "PURCHASED" }), rec({ id: "b", name: "AUTRE", status: "DECLINED" }), rec({ id: "c", name: "TROISIEME" })]);
    expect(items.map((item) => [item.id, item.outcome])).toEqual([["a", "SOLD"], ["b", "NOT_SOLD"], ["c", "NONE"]]);
  });

  it("un challenge et une date courte ne sont portés que s'ils sont connus", () => {
    const { items } = notice([rec({ challengeTitle: "Challenge Avène été", shortDateOn: "2026-11-30" }), rec({ id: "r2", name: "SANS" })]);
    expect(items[0]).toMatchObject({ challenge: "Challenge Avène été", shortDateOn: "2026-11-30" });
    expect(items[1]).toMatchObject({ challenge: null, shortDateOn: null });
  });

  it("un même produit n'est conseillé qu'une fois, même pour deux médicaments", () => {
    const { items } = notice([rec({ id: "x1", forDrug: "A" }), rec({ id: "x2", forDrug: "B" })]);
    expect(items.map((item) => item.id)).toEqual(["x1"]);
  });

  it("répondre à un conseil change l'empreinte : la fenêtre se redessine", () => {
    const before = notice([rec()]).signature;
    expect(notice([rec({ status: "PURCHASED" })]).signature).not.toBe(before);
    expect(notice([rec({ challengeTitle: "Challenge" })]).signature).not.toBe(before);
    expect(notice([rec({ shortDateOn: "2026-11-30" })]).signature).not.toBe(before);
  });
});


describe("les questions de l'arbre du comptoir dans l'avis du poste", () => {
  const question = (selected: string[]) => ({
    id: "douleur-fievre:why",
    node: "why",
    text: "Pourquoi le patient prend-il DOLIPRANE 1000 mg ?",
    mode: "MULTI" as const,
    choices: ["FEVER", "PAIN"].map((key) => ({ key, label: key === "FEVER" ? "Fièvre" : "Douleur localisée", selected: selected.includes(key) })),
    answered: selected.length > 0,
  });
  const ready = { ...base, recommendations: [], outcome: "PROPOSALS" };

  it("une question à poser n'est PAS « rien à ajouter » : l'avis est prêt, avec la question", () => {
    const notice = buildCounterNotice({ ...ready, questions: [question([])] });
    expect(notice.state).toBe("READY");
    expect(notice.questions).toHaveLength(1);
    expect(notice.advice).toEqual([]);
    expect(notice.advice.join(" ")).not.toMatch(/Rien à ajouter/);
  });

  it("sans question, rien ne change : l'avis dit pourquoi il n'y a rien", () => {
    const notice = buildCounterNotice(ready);
    expect(notice.questions).toEqual([]);
    expect(notice.advice[0]).toMatch(/Rien à ajouter|Conseil possible|Conseils écartés/);
  });

  it("l'empreinte change quand une réponse est donnée : la fenêtre se redessine", () => {
    const before = buildCounterNotice({ ...ready, questions: [question([])] });
    const after = buildCounterNotice({ ...ready, questions: [question(["PAIN"])] });
    expect(after.signature).not.toBe(before.signature);
    // …et reste la même quand rien ne bouge.
    expect(buildCounterNotice({ ...ready, questions: [question(["PAIN"])] }).signature).toBe(after.signature);
  });

  it("les phrases d'orientation (fièvre depuis plus de 3 jours) accompagnent les questions", () => {
    const notice = buildCounterNotice({ ...ready, questions: [question(["FEVER"])], guidance: ["Fièvre depuis 3 jours ou plus : orienter vers le médecin."] });
    expect(notice.guidance).toEqual(["Fièvre depuis 3 jours ou plus : orienter vers le médecin."]);
  });

  it("une vente close ou en attente n'a aucune question", () => {
    expect(buildCounterNotice({ ...ready, prescriptionStatus: "CANCELLED", questions: [question([])] }).questions).toEqual([]);
    expect(buildCounterNotice({ ...ready, prescriptionStatus: "NEEDS_VERIFICATION", questions: [question([])] }).questions).toEqual([]);
  });
});
