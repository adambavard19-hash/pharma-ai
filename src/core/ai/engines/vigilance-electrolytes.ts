import type { VigilanceRule } from "./vigilance";

/**
 * Électrolytes de réhydratation : quand un traitement demande de ne pas les
 * proposer d'office.
 *
 * D'après le document de travail du pharmacien associé « Médicaments et
 * électrolytes — associations possibles, conditions de conseil et situations
 * nécessitant une validation pharmaceutique » (17 septembre 2026), sourcé
 * VIDAL et RFCRPV. Son principe : les électrolytes se proposent devant des
 * pertes hydriques RÉELLES, jamais sur le seul traitement. Le conseil
 * lui-même vit dans `advice.ts` (règle `rehydration-digestive`, avec sa
 * question) ; ici, les traitements qui imposent d'abord une vérification.
 *
 * Les hyperkaliémiants, diurétiques, IPP, lithium et AINS sont traités dans
 * leurs vigilances existantes (`vigilance.ts`, `vigilance-base-maitre.ts`).
 */
export const ELECTROLYTE_VIGILANCES: VigilanceRule[] = [
  {
    key: "sglt2-dehydration",
    version: "1.0",
    kind: "MONITORING",
    severity: "WARNING",
    title: "Surveillance",
    subtitle: "Inhibiteur du SGLT2 détecté",
    atcPrefixes: ["A10BK"],
    substances: ["dapagliflozine", "empagliflozine", "canagliflozine", "ertugliflozine"],
    explanationTemplate:
      "{drug} augmente l'élimination urinaire de glucose et d'eau : soif, hypotension, diarrhée, vomissements ou forte chaleur exposent à une déshydratation. Les électrolytes ne se proposent pas d'office : rechercher ces signes ; un patient réellement déshydraté, qui vomit ou mange très peu, relève d'une évaluation médicale (le traitement peut devoir être suspendu). Sous antidiabétique, vérifier la glycémie et la présence de sucres dans le produit.",
    concerned: ["Électrolytes de réhydratation : après recherche des signes, pas d'office", "Glycémie et sucres du produit à vérifier"],
    patientAdvice: "En cas de diarrhée, de vomissements, de forte chaleur ou si vous mangez très peu, buvez et appelez votre médecin : ce traitement demande parfois une pause.",
    blockTags: [],
    cautionTags: ["réhydratation"],
    precautionText: "Inhibiteur du SGLT2 sur l'ordonnance : rechercher soif, hypotension, pertes ; déshydratation réelle = avis médical, pas une simple vente.",
    sources: ["RCP dapagliflozine, empagliflozine (ANSM) — mises en garde : déplétion volémique", "Document de travail « Médicaments et électrolytes » (officine, sept. 2026)"],
  },
  {
    key: "digoxin-antiarrhythmic-electrolytes",
    version: "1.0",
    kind: "MONITORING",
    severity: "WARNING",
    title: "Surveillance",
    subtitle: "Digoxine ou antiarythmique détecté",
    atcPrefixes: ["C01AA05", "C01B"],
    substances: ["digoxine", "amiodarone", "flecainide", "sotalol", "propafenone"],
    explanationTemplate:
      "Un trouble du potassium ou du magnésium augmente la toxicité de {drug}. On ne corrige pas empiriquement un déséquilibre électrolytique : diarrhée, vomissements ou forte chaleur justifient un ionogramme et un avis, pas des électrolytes en vente libre.",
    concerned: ["Électrolytes et potassium : ionogramme avant toute correction"],
    patientAdvice: "En cas de diarrhée ou de vomissements prolongés, consultez : votre traitement cardiaque est sensible aux sels de l'organisme.",
    blockTags: [],
    cautionTags: ["réhydratation", "potassium", "magnésium"],
    precautionText: "Digoxine ou antiarythmique sur l'ordonnance : pas de correction empirique, ionogramme d'abord.",
    sources: ["RCP digoxine (ANSM) — mises en garde : troubles électrolytiques", "Document de travail « Médicaments et électrolytes » (officine, sept. 2026)"],
  },
  {
    key: "clindamycin-diarrhea",
    version: "1.0",
    kind: "MONITORING",
    severity: "INFO",
    title: "Surveillance",
    subtitle: "Clindamycine détectée",
    atcPrefixes: ["J01FF01"],
    substances: ["clindamycine"],
    explanationTemplate:
      "Sous {drug}, une diarrhée importante ou persistante peut signaler une colite à Clostridioides difficile : elle appelle un avis médical, pas un antidiarrhéique ni de simples électrolytes.",
    concerned: ["Électrolytes et antidiarrhéiques : pas en réponse à une diarrhée importante sous clindamycine"],
    patientAdvice: "Une diarrhée abondante, avec fièvre ou douleurs, pendant ou après ce traitement : consultez sans attendre.",
    blockTags: [],
    cautionTags: ["réhydratation", "diarrhée"],
    precautionText: "Clindamycine sur l'ordonnance : une diarrhée importante relève d'un avis médical, pas d'une compensation.",
    sources: ["RCP clindamycine (ANSM) — mises en garde : colite pseudo-membraneuse", "Document de travail « Médicaments et électrolytes » (officine, sept. 2026)"],
  },
  {
    key: "colchicine-gi-overdose",
    version: "1.0",
    kind: "MONITORING",
    severity: "WARNING",
    title: "Surveillance",
    subtitle: "Colchicine détectée",
    atcPrefixes: ["M04AC01"],
    substances: ["colchicine"],
    explanationTemplate:
      "Sous {drug}, diarrhée, nausées ou vomissements sont les premiers signes d'un surdosage : ils imposent un avis médical (arrêt ou réduction de dose), pas des électrolytes ni un antidiarrhéique qui masqueraient le signal.",
    concerned: ["Électrolytes et antidiarrhéiques : jamais en réponse à des troubles digestifs sous colchicine"],
    patientAdvice: "Diarrhée, nausées ou vomissements sous colchicine : arrêtez de prendre le comprimé suivant et appelez votre médecin ou votre pharmacien.",
    blockTags: [],
    cautionTags: ["réhydratation", "diarrhée"],
    precautionText: "Colchicine sur l'ordonnance : les troubles digestifs sont un signe de surdosage — avis médical, pas de compensation.",
    sources: ["RCP Colchicine Opocalcium (ANSM) — surdosage et mises en garde", "Document de travail « Médicaments et électrolytes » (officine, sept. 2026)"],
  },
];
