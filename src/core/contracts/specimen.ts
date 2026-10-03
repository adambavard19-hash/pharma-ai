import { buildContractDocument, type ContractDocument, type ContractParty, type ContractPharmacy } from "./template";
import { printedAddress, type CompanyProfileInput } from "./snapshot";

/**
 * Aperçus du contrat pour la fiche société : le paragraphe des parties et le
 * bloc de signature affichés pendant la saisie, et le PDF spécimen. Rien n'y
 * est inventé : une valeur absente reste visible comme telle, entre crochets,
 * et l'officine est une officine fictive, marquée comme telle partout.
 */

export const SPECIMEN_MARK = "SPÉCIMEN — officine fictive, document sans valeur";

/** Ce qui s'imprime à la place d'un champ société non renseigné. */
export const COMPANY_PLACEHOLDERS = {
  legalName: "[Dénomination sociale]",
  address: "[adresse du siège]",
  representativeName: "[Représentant signataire]",
  representativeEmail: "[e-mail du signataire]",
} as const;

const filled = (value: string | null | undefined): string | null => {
  const text = (value ?? "").trim();
  return text ? text : null;
};

/**
 * La partie « Société » telle qu'elle s'imprimerait avec la saisie en cours.
 * Les champs facultatifs absents disparaissent du texte, comme dans un vrai
 * contrat ; les champs exigés absents restent visibles entre crochets.
 */
export function companyPartyForPreview(values: Partial<CompanyProfileInput> | null): ContractParty {
  const v = values ?? {};
  const address = printedAddress(filled(v.addressLine1), filled(v.postalCode), filled(v.city));
  return {
    legalName: filled(v.legalName) ?? COMPANY_PLACEHOLDERS.legalName,
    legalForm: filled(v.legalForm),
    address: address || COMPANY_PLACEHOLDERS.address,
    siren: filled(v.siren),
    representativeName: filled(v.representativeName) ?? COMPANY_PLACEHOLDERS.representativeName,
    representativeTitle: filled(v.representativeTitle),
    representativeEmail: filled(v.representativeEmail) ?? COMPANY_PLACEHOLDERS.representativeEmail,
  };
}

/** L'officine de l'aperçu en direct : des repères entre crochets, jamais des données. */
export const PREVIEW_PHARMACY: ContractPharmacy = {
  name: "[Nom de l'officine]",
  legalName: "[Raison sociale de l'officine]",
  ownerName: "[Signataire de l'officine]",
  ownerTitle: null,
  address: "[adresse de l'officine]",
  finessNumber: "[FINESS]",
  siret: "[SIRET]",
  email: "[e-mail du signataire de l'officine]",
};

/** L'officine du PDF spécimen : fictive, et le disant dans chaque champ. */
export const SPECIMEN_PHARMACY: ContractPharmacy = {
  name: SPECIMEN_MARK,
  legalName: null,
  ownerName: "Signataire fictif (spécimen)",
  ownerTitle: "pharmacien titulaire (spécimen)",
  address: "adresse fictive (spécimen)",
  finessNumber: null,
  siret: null,
  email: "specimen@exemple.invalid",
};

const PREVIEW_TERMS = { monthlyPriceCents: 0, durationMonths: 12, outletCount: 1 } as const;

/** Le paragraphe « Entre les soussignés » et les signatures, tels que le modèle les imprime. */
export function partiesPreview(company: ContractParty, pharmacy: ContractPharmacy = PREVIEW_PHARMACY, startDate: Date = new Date()): { heading: string; companyParagraph: string; pharmacyParagraph: string; signatures: ContractDocument["signatures"] } {
  const doc = buildContractDocument({ company, pharmacy, terms: { ...PREVIEW_TERMS, startDate }, reference: "APERÇU" });
  const parties = doc.sections[0];
  return { heading: parties.heading, companyParagraph: parties.paragraphs[0] ?? "", pharmacyParagraph: parties.paragraphs[1] ?? "", signatures: doc.signatures };
}

export type SpecimenPlan = { name: string; monthlyPriceCents: number; trialDays: number } | null;

/**
 * Le contrat spécimen : le vrai modèle, la fiche société enregistrée, une
 * officine fictive. Sans offre par défaut au catalogue, le tarif n'est pas
 * inventé : l'article 3 l'indique entre crochets.
 */
export function specimenDocument(input: { company: ContractParty; plan: SpecimenPlan; startDate: Date }): ContractDocument {
  const { company, plan, startDate } = input;
  const doc = buildContractDocument({
    company,
    pharmacy: SPECIMEN_PHARMACY,
    terms: { monthlyPriceCents: plan?.monthlyPriceCents ?? 0, durationMonths: 12, outletCount: 1, startDate, planName: plan?.name, trialDays: plan?.trialDays ?? 0 },
    reference: "SPÉCIMEN",
  });
  const sections = doc.sections.map((section) => {
    if (plan || !section.heading.startsWith("Article 3")) return section;
    const [, ...rest] = section.paragraphs;
    return {
      ...section,
      paragraphs: [
        "L'abonnement est facturé [tarif mensuel de l'offre retenue] € HT par mois pour 1 point de vente, payable mensuellement par prélèvement automatique sur le moyen de paiement enregistré par l'Officine. Les prix s'entendent hors taxes ; la TVA en vigueur s'applique.",
        ...rest,
      ],
    };
  });
  return {
    ...doc,
    title: `${doc.title} — SPÉCIMEN`,
    sections: [
      {
        heading: SPECIMEN_MARK,
        paragraphs: [
          "Ce document est un aperçu généré à la demande depuis la console PharmaBoost. Il montre comment la fiche de la société exploitante s'imprime dans les contrats. L'officine qui y figure est fictive ; ce document n'engage personne, n'est pas enregistré et ne peut pas être signé.",
        ],
      },
      ...sections,
    ],
  };
}
