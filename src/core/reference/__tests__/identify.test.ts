import { describe, expect, it } from "vitest";
import {
  strengthTokens,
  strengthLabel,
  distinctStrengths,
  decideAutoAccept,
  identifyDrug,
  IDENTIFICATION_AUTO_SCORE,
  tokenize,
  type SpecialtyCandidate,
} from "../identify";

const specialty = (
  name: string,
  substances: string[],
  overrides: Partial<SpecialtyCandidate> = {},
): SpecialtyCandidate => ({
  id: name,
  cisCode: name,
  name,
  pharmaceuticalForm: null,
  substances,
  marketed: true,
  ...overrides,
});

const DOLIPRANE_1000 = specialty("DOLIPRANE 1000 mg, comprimé", ["PARACÉTAMOL"], {
  pharmaceuticalForm: "comprimé",
});
const DOLIPRANE_500 = specialty("DOLIPRANE 500 mg, comprimé", ["PARACÉTAMOL"], {
  pharmaceuticalForm: "comprimé",
});
const DOLIPRANE_1000_GELULE = specialty("DOLIPRANE 1000 mg, gélule", ["PARACÉTAMOL"], {
  pharmaceuticalForm: "gélule",
});

describe("tokenize", () => {
  it("sépare l'unité collée au nombre", () => {
    // L'ordonnance écrit « 1000mg », le catalogue « 1000 mg ». Sans cette
    // séparation, les deux ne se rencontreraient jamais.
    expect(tokenize("DOLIPRANE 1000mg")).toEqual(["DOLIPRANE", "1000", "MG"]);
    expect(tokenize("Doliprane 1000 mg, comprimé")).toEqual([
      "DOLIPRANE",
      "1000",
      "MG",
      "COMPRIME",
    ]);
  });

  it("ignore les accents et la ponctuation", () => {
    expect(tokenize("PARACÉTAMOL/CODÉINE")).toEqual(["PARACETAMOL", "CODEINE"]);
  });
});

describe("identifyDrug", () => {
  it("couvre entièrement un libellé d'ordonnance par la spécialité correspondante", () => {
    const [best] = identifyDrug({ drugName: "DOLIPRANE 1000 mg" }, [
      DOLIPRANE_500,
      DOLIPRANE_1000,
    ]);
    expect(best.candidate).toBe(DOLIPRANE_1000);
    expect(best.score).toBe(1);
  });

  it("écarte un autre dosage", () => {
    // « DOLIPRANE » est retrouvé, « 1000 » non : un zéro de différence suffit à
    // faire tomber le candidat sous le seuil de proposition.
    expect(identifyDrug({ drugName: "DOLIPRANE 1000 mg" }, [DOLIPRANE_500])).toHaveLength(0);
  });

  it("supporte une ordonnance plus détaillée que le catalogue", () => {
    // Cas courant : le prescripteur écrit la forme galénique complète alors que
    // la spécialité s'appelle simplement « …, comprimé ».
    const sécable = specialty("DOLIPRANE 1000 mg, comprimé", ["PARACÉTAMOL"], {
      pharmaceuticalForm: "comprimé pelliculé sécable",
    });
    const [best] = identifyDrug(
      { drugName: "DOLIPRANE 1000 mg comprimé pelliculé sécable" },
      [sécable],
    );
    expect(best.score).toBe(1);
  });

  it("retrouve une spécialité citée par sa substance, et le dit", () => {
    const [best] = identifyDrug({ drugName: "PARACETAMOL 1000" }, [DOLIPRANE_1000]);
    expect(best.candidate).toBe(DOLIPRANE_1000);
    expect(best.matchedOn).toBe("SUBSTANCE");
    expect(best.reasons.join(" ")).toContain("PARACÉTAMOL");
  });

  it("distingue le nom de spécialité de la substance", () => {
    const [best] = identifyDrug({ drugName: "DOLIPRANE 1000 mg" }, [DOLIPRANE_1000]);
    expect(best.matchedOn).toBe("NAME");
  });

  it("fait passer devant ce qui est encore commercialisé", () => {
    const arrete = specialty("DOLIPRANE 1000 mg, poudre", ["PARACÉTAMOL"], { marketed: false });
    const [first, second] = identifyDrug({ drugName: "DOLIPRANE 1000 mg" }, [
      arrete,
      DOLIPRANE_1000,
    ]);
    expect(first.candidate).toBe(DOLIPRANE_1000);
    expect(second.candidate).toBe(arrete);
    expect(second.reasons).toContain("commercialisation arrêtée");
  });

  it("ne rend rien pour un libellé vide", () => {
    expect(identifyDrug({ drugName: "" }, [DOLIPRANE_1000])).toEqual([]);
    expect(identifyDrug({ drugName: "  " }, [DOLIPRANE_1000])).toEqual([]);
  });
});

describe("decideAutoAccept", () => {
  it("rattache seul quand la correspondance est totale et sans concurrent", () => {
    const decision = decideAutoAccept(identifyDrug({ drugName: "DOLIPRANE 1000 mg" }, [
      DOLIPRANE_1000,
    ]));
    expect(decision.accepted).toBe(true);
    if (decision.accepted) expect(decision.match.score).toBeGreaterThanOrEqual(IDENTIFICATION_AUTO_SCORE);
  });

  it("accepte deux formes du même médicament : la substance et le dosage sont les mêmes", () => {
    // Comprimé ou gélule, l'analyse de sécurité porte sur la même molécule au
    // même dosage : l'ambiguïté est sans conséquence.
    const decision = decideAutoAccept(
      identifyDrug({ drugName: "DOLIPRANE 1000 mg" }, [DOLIPRANE_1000, DOLIPRANE_1000_GELULE]),
    );
    expect(decision.accepted).toBe(true);
  });

  it("refuse quand deux substances différentes correspondent aussi bien", () => {
    // Cas réel : une marque déclinée en plusieurs molécules. Choisir au hasard
    // ferait porter l'analyse de sécurité sur le mauvais médicament.
    const a = specialty("HUMEX RHUME, comprimé", ["PARACÉTAMOL"]);
    const b = specialty("HUMEX RHUME, comprimé", ["IBUPROFÈNE"]);
    const decision = decideAutoAccept(identifyDrug({ drugName: "HUMEX RHUME comprimé" }, [a, b]));
    expect(decision.accepted).toBe(false);
    if (!decision.accepted) {
      expect(decision.reason).toBe("AMBIGUOUS_SUBSTANCE");
      expect(decision.candidates).toHaveLength(2);
    }
  });

  it("refuse quand l'ordonnance ne dit pas le dosage", () => {
    // « DOLIPRANE » seul couvre aussi bien le 500 que le 1000. Un zéro de
    // différence, et l'analyse ne parle plus du même traitement.
    const decision = decideAutoAccept(
      identifyDrug({ drugName: "DOLIPRANE" }, [DOLIPRANE_500, DOLIPRANE_1000]),
    );
    expect(decision.accepted).toBe(false);
    if (!decision.accepted) expect(decision.reason).toBe("AMBIGUOUS_DOSAGE");
  });

  it("propose sans rattacher quand une mention de l'ordonnance manque au candidat", () => {
    // L'ordonnance dit « effervescent », la spécialité ne l'est pas. Le
    // candidat reste plausible, mais le pharmacien doit le regarder.
    const decision = decideAutoAccept(
      identifyDrug({ drugName: "DOLIPRANE 1000 mg comprimé effervescent" }, [DOLIPRANE_1000]),
    );
    expect(decision.accepted).toBe(false);
    if (!decision.accepted) {
      expect(decision.reason).toBe("SCORE_TOO_LOW");
      expect(decision.candidates).toHaveLength(1);
    }
  });

  it("ne propose rien quand aucun candidat n'atteint le seuil", () => {
    const decision = decideAutoAccept(identifyDrug({ drugName: "DOLIPRANE 1000 mg" }, [
      DOLIPRANE_500,
    ]));
    expect(decision).toEqual({ accepted: false, reason: "NO_MATCH", candidates: [] });
  });

  it("refuse de choisir une marque quand l'ordonnance est écrite en DCI", () => {
    // « Paracétamol 1000 » ne nomme aucune spécialité : DOLIPRANE et EFFERALGAN
    // conviennent aussi bien. Afficher l'une des deux montrerait au pharmacien
    // une marque que le prescripteur n'a jamais écrite.
    const efferalgan = specialty("EFFERALGAN 1000 mg, comprimé", ["PARACÉTAMOL"], {
      pharmaceuticalForm: "comprimé",
    });
    const decision = decideAutoAccept(
      identifyDrug({ drugName: "PARACETAMOL 1000" }, [DOLIPRANE_1000, efferalgan]),
    );
    expect(decision.accepted).toBe(false);
    if (!decision.accepted) expect(decision.reason).toBe("SUBSTANCE_ONLY");
  });

  it("rattache quand une seule spécialité porte cette substance à ce dosage", () => {
    const decision = decideAutoAccept(
      identifyDrug({ drugName: "PARACETAMOL 1000" }, [DOLIPRANE_1000]),
    );
    expect(decision.accepted).toBe(true);
  });

  it("dit qu'il n'a rien trouvé plutôt que de rendre un candidat au hasard", () => {
    const decision = decideAutoAccept([]);
    expect(decision).toEqual({ accepted: false, reason: "NO_MATCH", candidates: [] });
  });
});

describe("unités de dosage", () => {
  const efferalgan = (name: string, form: string): SpecialtyCandidate => ({
    id: name,
    cisCode: name,
    name,
    pharmaceuticalForm: form,
    substances: ["PARACÉTAMOL"],
    marketed: true,
  });
  const catalogue = [
    efferalgan("EFFERALGAN 1000 mg, comprimé effervescent", "comprimé effervescent(e)"),
    efferalgan("EFFERALGAN 500 mg, comprimé", "comprimé"),
    efferalgan("EFFERALGAN 150 mg, suppositoire", "suppositoire"),
  ];

  it("ramène les grammes aux milligrammes : « 1 g » rencontre « 1000 mg »", () => {
    expect(strengthTokens("EFFERALGAN 1 g")).toEqual(["1000"]);
    expect(strengthTokens("0,5 g")).toEqual(["500"]);
    expect(strengthTokens("1,5 mg/ml")).toEqual(["1.5"]);
    expect(strengthTokens("250 microgrammes/dose 250")).toEqual(["250"]);
    expect(strengthTokens("RULID 150")).toEqual(["150"]);
  });

  it("rattache EFFERALGAN 1 g au 1000 mg, pas au 500 mg", () => {
    const matches = identifyDrug({ drugName: "EFFERALGAN", dosage: "1 g" }, catalogue);
    expect(matches[0].candidate.name).toBe("EFFERALGAN 1000 mg, comprimé effervescent");
    const decision = decideAutoAccept(matches);
    expect(decision.accepted).toBe(true);
  });

  it("refuse toujours un dosage divergent, même exprimé dans une autre unité", () => {
    const matches = identifyDrug({ drugName: "EFFERALGAN", dosage: "0,5 g" }, catalogue);
    expect(matches[0].candidate.name).toBe("EFFERALGAN 500 mg, comprimé");
  });
});

describe("dosages proposés au pharmacien", () => {
  it("extrait le dosage d'un nom de spécialité", () => {
    expect(strengthLabel("BILASTINE ARROW 20 mg, comprimé")).toBe("20 mg");
    expect(strengthLabel("TUSSIDANE 1,5 mg/ml, sirop")).toBe("1,5 mg/ml");
    expect(strengthLabel("BECOTIDE 250 microgrammes/dose, solution pour inhalation")).toBe("250 microgrammes/dose");
    expect(strengthLabel("DOLIPRANE, comprimé")).toBeNull();
  });

  it("liste les dosages distincts, triés, pour demander la précision manquante", () => {
    expect(
      distinctStrengths([
        { name: "BILASTINE TEVA 20 mg, comprimé" },
        { name: "BILASKA 10 mg, comprimé orodispersible" },
        { name: "BILASTINE EG 20 mg, comprimé" },
      ]),
    ).toEqual(["10 mg", "20 mg"]);
  });
});

describe("dénomination commune écrite comme un nom", () => {
  const generic = (name: string): SpecialtyCandidate => ({
    id: name,
    cisCode: name,
    name,
    pharmaceuticalForm: "comprimé",
    substances: ["BILASTINE"],
    marketed: true,
  });
  const catalogue = [generic("BILASKA 20 mg, comprimé"), generic("BILASTINE ARROW 20 mg, comprimé"), generic("BILASTINE BIOGARAN 20 mg, comprimé")];

  it("ne choisit jamais une marque à la place du prescripteur : « bilastine 20 mg » reste à choisir", () => {
    const matches = identifyDrug({ drugName: "BILASTINE", dosage: "20 mg" }, catalogue);
    expect(matches.every((m) => m.matchedOn === "SUBSTANCE")).toBe(true);
    const decision = decideAutoAccept(matches);
    expect(decision.accepted).toBe(false);
    if (!decision.accepted) expect(decision.reason).toBe("SUBSTANCE_ONLY");
  });

  it("rattache seul quand une seule spécialité porte ce dosage", () => {
    const decision = decideAutoAccept(identifyDrug({ drugName: "BILASTINE", dosage: "20 mg" }, [generic("BILASTINE ARROW 20 mg, comprimé")]));
    expect(decision.accepted).toBe(true);
  });
});
