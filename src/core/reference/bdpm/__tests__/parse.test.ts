import { describe, expect, it } from "vitest";
import {
  BdpmFormatError,
  parseTable,
  toCompositionRow,
  toGenericMemberRow,
  toPrescriptionConditionRow,
  toPresentationRow,
  toSmrOpinionRow,
  toSpecialtyRow,
} from "../parse";
import { bdpmFileSpec } from "../spec";

const SPECIALTIES = bdpmFileSpec("SPECIALTIES");
const COMPOSITIONS = bdpmFileSpec("COMPOSITIONS");

const columns = (line: string) => line.split("\t");

/** Lignes réelles de la source, reprises telles quelles. */
const SPECIALTY_LINE =
  "61266250\tA 313 200 000 UI POUR CENT, pommade\tpommade\tcutanée\tAutorisation active\t" +
  "Procédure nationale\tCommercialisée\t12/03/1998\t\t\t PHARMA DEVELOPPEMENT\tNon";
const PRESENTATION_LINE =
  "60002283\t4949729\tplaquette(s) PVC PVDC aluminium de 30 comprimé(s)\tPrésentation active\t" +
  "Déclaration de commercialisation\t16/03/2011\t3400949497294\toui\t100%\t44,38\t45,40\t1,02\t";
const COMPOSITION_LINE = "60002283\tcomprimé\t42215\tANASTROZOLE\t1,00 mg\tun comprimé\tSA\t1";

describe("parseTable", () => {
  it("lit les deux styles de fin de ligne présents dans la source", () => {
    // Mesuré : CIS_CIP_bdpm.txt est en LF seul, les cinq autres en CRLF.
    expect(parseTable(`${SPECIALTY_LINE}\n${SPECIALTY_LINE}\n`, SPECIALTIES).rows).toHaveLength(2);
    expect(parseTable(`${SPECIALTY_LINE}\r\n${SPECIALTY_LINE}\r\n`, SPECIALTIES).rows).toHaveLength(2);
  });

  it("ne laisse pas le retour chariot dans la dernière colonne", () => {
    const [row] = parseTable(`${SPECIALTY_LINE}\r\n`, SPECIALTIES).rows;
    expect(row.at(-1)).toBe("Non");
  });

  it("refuse le fichier entier si le nombre de colonnes a changé", () => {
    // Un fichier avec une colonne de plus se lirait sans erreur et rangerait
    // chaque valeur dans le mauvais champ. On préfère l'arrêt net.
    expect(() => parseTable(`${SPECIALTY_LINE}\tsurprise\n`, SPECIALTIES)).toThrow(BdpmFormatError);
    expect(() => parseTable("61266250\tA 313\n", SPECIALTIES)).toThrow(BdpmFormatError);
  });

  it("nomme le fichier et la ligne en cause, et cite le contenu lu", () => {
    try {
      parseTable(`${SPECIALTY_LINE}\n61266250\tA 313\n`, SPECIALTIES);
      throw new Error("aurait dû échouer");
    } catch (error) {
      expect(error).toBeInstanceOf(BdpmFormatError);
      // L'erreur doit se diagnostiquer seule : sans le contenu cité, il faut
      // aller ouvrir un fichier de plusieurs mégaoctets pour comprendre.
      expect((error as Error).message).toMatch(/CIS_bdpm\.txt, ligne 2/);
      expect((error as Error).message).toContain("Contenu lu");
      expect((error as Error).message).toContain("61266250⇥A 313");
    }
  });

  it("tolère la tabulation de fin de ligne des fichiers qui en ont une", () => {
    expect(parseTable(`${COMPOSITION_LINE}\t\r\n`, COMPOSITIONS).rows).toHaveLength(1);
    expect(parseTable(`${COMPOSITION_LINE}\t\r\n`, COMPOSITIONS).rows[0]).toHaveLength(8);
  });

  it("refuse une colonne surnuméraire qui, elle, porte une valeur", () => {
    expect(() => parseTable(`${COMPOSITION_LINE}\tvaleur\r\n`, COMPOSITIONS)).toThrow(
      BdpmFormatError,
    );
  });

  it("ignore les lignes vides sans les compter", () => {
    expect(parseTable(`${SPECIALTY_LINE}\n\n${SPECIALTY_LINE}\n\n`, SPECIALTIES).rows).toHaveLength(2);
  });
});

describe("parseTable — enregistrements repliés sur plusieurs lignes", () => {
  // La source n'échappe pas ses champs : un libellé contenant un retour à la
  // ligne se répartit sur plusieurs lignes physiques. Compter les colonnes
  // ligne à ligne échouait alors sur la seconde moitié, avec « 1 colonne au
  // lieu de 2 » — le cas rencontré sur CIS_CPD_bdpm.txt.
  const CPD = bdpmFileSpec("PRESCRIPTION_CONDITIONS");

  it("reconstitue un libellé replié et conserve le retour à la ligne", () => {
    const table = parseTable(
      "60355340\tprescription réservée aux spécialistes\r\nen cardiologie\r\n60371024\tliste I\r\n",
      CPD,
    );
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]).toEqual([
      "60355340",
      "prescription réservée aux spécialistes\nen cardiologie",
    ]);
    expect(table.rows[1]).toEqual(["60371024", "liste I"]);
  });

  it("compte et donne à voir ce qu'il a recollé", () => {
    // Recoller en silence reviendrait à retoucher la source sans le dire.
    const table = parseTable("60355340\tdébut\r\nsuite\r\n", CPD);
    expect(table.joinedRecords).toBe(1);
    expect(table.joinedSamples[0]).toContain("ligne 1");
    expect(table.joinedSamples[0]).toContain("suite");
  });

  it("garde le contrôle strict des colonnes après reconstitution", () => {
    // Le point qui compte : reconstituer les enregistrements ne relâche rien.
    // Une colonne ajoutée par la source arrête toujours le fichier entier.
    expect(() => parseTable("60355340\tliste I\tnouveau champ\r\n", CPD)).toThrow(
      /3 colonnes au lieu de 2/,
    );
    expect(() =>
      parseTable("60355340\tprescription\r\nrepliée\tavec une colonne en trop\r\n", CPD),
    ).toThrow(/3 colonnes au lieu de 2/);
  });

  it("refuse un fichier qui ne commence pas par une clé", () => {
    // Le cas d'une page d'erreur HTML téléchargée à la place du fichier.
    try {
      parseTable("<!DOCTYPE html>\n<html><body>404</body></html>\n", CPD);
      throw new Error("aurait dû échouer");
    } catch (error) {
      expect(error).toBeInstanceOf(BdpmFormatError);
      expect((error as Error).message).toContain("page d'erreur");
    }
  });

  it("refuse d'engouffrer un fichier entier dans un seul enregistrement", () => {
    const content = ["60355340\tliste I", "a", "b", "c", "d", "e"].join("\r\n");
    expect(() => parseTable(content, CPD)).toThrow(/n'est plus un libellé replié/);
  });
});

describe("toSpecialtyRow", () => {
  it("lit une ligne réelle", () => {
    expect(toSpecialtyRow(columns(SPECIALTY_LINE))).toEqual({
      cisCode: "61266250",
      name: "A 313 200 000 UI POUR CENT, pommade",
      pharmaceuticalForm: "pommade",
      administrationRoutes: ["cutanée"],
      authorizationStatus: "Autorisation active",
      authorizationProcedure: "Procédure nationale",
      marketingStatus: "Commercialisée",
      authorizedAt: new Date("1998-03-12T00:00:00.000Z"),
      bdmStatus: null,
      europeanAuthorizationNumber: null,
      holders: ["PHARMA DEVELOPPEMENT"],
      enhancedMonitoring: false,
    });
  });

  it("écarte une ligne sans clé naturelle", () => {
    expect(toSpecialtyRow(columns(SPECIALTY_LINE.replace("61266250", "")))).toBeNull();
  });
});

describe("toPresentationRow", () => {
  it("lit le code-barres, le prix et le taux d'une ligne réelle", () => {
    const row = toPresentationRow(columns(PRESENTATION_LINE));
    expect(row).toMatchObject({
      cisCode: "60002283",
      cip7: "4949729",
      cip13: "3400949497294",
      approvedForCommunities: true,
      reimbursementRateRaw: "100%",
      reimbursementRate: 100,
      priceCents: 4438,
      totalPriceCents: 4540,
      dispensingFeeCents: 102,
      reimbursementNotice: null,
    });
  });

  it("conserve le taux tel qu'écrit en plus du taux dérivé", () => {
    const row = toPresentationRow(columns(PRESENTATION_LINE.replace("100%", "65 %")));
    expect(row?.reimbursementRateRaw).toBe("65 %");
    expect(row?.reimbursementRate).toBe(65);
  });
});

describe("toCompositionRow", () => {
  it("lit une ligne réelle", () => {
    expect(toCompositionRow(columns(COMPOSITION_LINE))).toEqual({
      cisCode: "60002283",
      element: "comprimé",
      substanceCode: "42215",
      substanceLabel: "ANASTROZOLE",
      dosage: "1,00 mg",
      dosageReference: "un comprimé",
      nature: "SA",
      linkNumber: "1",
    });
  });

  it("accepte la fraction thérapeutique", () => {
    expect(toCompositionRow(columns(COMPOSITION_LINE.replace("\tSA\t", "\tFT\t")))?.nature).toBe(
      "FT",
    );
  });

  it("écarte une nature inconnue", () => {
    // Le sel et la molécule active ne sont pas la même chose pour le moteur de
    // conseil : une troisième nature ne doit pas être rangée d'office.
    expect(toCompositionRow(columns(COMPOSITION_LINE.replace("\tSA\t", "\tST\t")))).toBeNull();
  });
});

describe("toGenericMemberRow", () => {
  const line = "1\tCIMETIDINE 200 mg - TAGAMET 200 mg, comprimé pelliculé\t65383183\t0\t1";

  it("lit une ligne réelle", () => {
    expect(toGenericMemberRow(columns(line))).toEqual({
      groupExternalId: "1",
      groupLabel: "CIMETIDINE 200 mg - TAGAMET 200 mg, comprimé pelliculé",
      cisCode: "65383183",
      type: 0,
      sortOrder: 1,
    });
  });

  it("écarte un type de générique hors codification", () => {
    expect(toGenericMemberRow(columns(line.replace("\t0\t", "\t9\t")))).toBeNull();
  });
});

describe("toPrescriptionConditionRow et toSmrOpinionRow", () => {
  it("lisent des lignes réelles", () => {
    expect(
      toPrescriptionConditionRow(columns("60355340\tréservé à l'usage professionnel DENTAIRE")),
    ).toEqual({ cisCode: "60355340", label: "réservé à l'usage professionnel DENTAIRE" });

    expect(
      toSmrOpinionRow(
        columns("63318475\tCT-15956\tInscription (CT)\t20170208\tImportant\tLe service médical…"),
      ),
    ).toEqual({
      cisCode: "63318475",
      hasDossierCode: "CT-15956",
      evaluationType: "Inscription (CT)",
      opinionDate: new Date("2017-02-08T00:00:00.000Z"),
      value: "Important",
      label: "Le service médical…",
    });
  });
});
