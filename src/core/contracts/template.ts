/**
 * Le modèle de contrat d'abonnement PharmaBoost.
 *
 * Un texte figé et versionné, dans le code : chaque champ variable est injecté
 * depuis des données vérifiées (société, pharmacie, conditions). Le commercial
 * ne rédige rien et ne signe rien pour la société ; il déclenche l'envoi.
 */
export type ContractParty = {
  legalName: string;
  legalForm?: string | null;
  address: string;
  siren?: string | null;
  representativeName: string;
  representativeTitle?: string | null;
  representativeEmail: string;
};

export type ContractPharmacy = {
  name: string;
  ownerName: string;
  address: string;
  finessNumber?: string | null;
  siret?: string | null;
  email: string;
};

export type ContractTerms = {
  monthlyPriceCents: number;
  durationMonths: number;
  /** Nombre de points de vente couverts. */
  outletCount: number;
  startDate: Date;
};

export type ContractDocument = {
  templateKey: string;
  title: string;
  reference: string;
  sections: { heading: string; paragraphs: string[] }[];
  signatures: { role: "PHARMACY" | "COMPANY"; label: string; name: string; email: string }[];
};

export const CONTRACT_TEMPLATE_KEY = "abonnement-pharmaboost-v1";

const euros = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} € HT`;
const dateFr = (d: Date) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(d);

export function buildContractDocument(input: {
  company: ContractParty;
  pharmacy: ContractPharmacy;
  terms: ContractTerms;
  reference: string;
}): ContractDocument {
  const { company, pharmacy, terms } = input;
  const yearly = terms.monthlyPriceCents * 12;
  return {
    templateKey: CONTRACT_TEMPLATE_KEY,
    title: "Contrat d'abonnement au service PharmaBoost",
    reference: input.reference,
    sections: [
      {
        heading: "Entre les soussignés",
        paragraphs: [
          `${company.legalName}${company.legalForm ? `, ${company.legalForm}` : ""}, dont le siège est situé ${company.address}${company.siren ? `, immatriculée sous le numéro SIREN ${company.siren}` : ""}, représentée par ${company.representativeName}${company.representativeTitle ? `, ${company.representativeTitle}` : ""}, ci-après « la Société »,`,
          `et ${pharmacy.name}, ${pharmacy.address}${pharmacy.finessNumber ? `, FINESS ${pharmacy.finessNumber}` : ""}${pharmacy.siret ? `, SIRET ${pharmacy.siret}` : ""}, représentée par ${pharmacy.ownerName}, pharmacien titulaire, ci-après « l'Officine ».`,
        ],
      },
      {
        heading: "Article 1 — Objet",
        paragraphs: [
          "La Société met à disposition de l'Officine le service en ligne PharmaBoost : lecture des ordonnances, aide au conseil au comptoir à partir du stock de l'Officine, plan personnalisé remis au patient, suivi du patient et pilotage de l'activité.",
          "PharmaBoost est un outil d'assistance. Il ne prescrit pas et ne se substitue à aucune décision du pharmacien, qui reste seul responsable des conseils délivrés et des ventes réalisées.",
        ],
      },
      {
        heading: "Article 2 — Durée",
        paragraphs: [
          `Le présent contrat prend effet le ${dateFr(terms.startDate)} pour une durée de ${terms.durationMonths} mois. Il se renouvelle ensuite tacitement par périodes de douze mois, sauf dénonciation par l'une des parties trois mois avant l'échéance, par lettre recommandée ou courrier électronique avec accusé de réception.`,
        ],
      },
      {
        heading: "Article 3 — Conditions financières",
        paragraphs: [
          `L'abonnement est facturé ${euros(terms.monthlyPriceCents)} par mois pour ${terms.outletCount} point${terms.outletCount > 1 ? "s" : ""} de vente, soit ${euros(yearly)} par an, payable mensuellement à réception de facture. Les prix s'entendent hors taxes ; la TVA en vigueur s'applique.`,
          "Tout retard de paiement entraîne l'application des pénalités légales et, après mise en demeure restée sans effet quinze jours, la suspension du service.",
        ],
      },
      {
        heading: "Article 4 — Données de santé et confidentialité",
        paragraphs: [
          "L'Officine est responsable du traitement des données de ses patients ; la Société agit en qualité de sous-traitant au sens du RGPD et n'y accède que pour fournir le service. Les données sont hébergées chez un prestataire respectant la réglementation applicable à l'hébergement de données de santé.",
          "Chaque partie s'engage à la confidentialité des informations de l'autre partie dont elle aurait connaissance à l'occasion du contrat.",
        ],
      },
      {
        heading: "Article 5 — Résiliation",
        paragraphs: [
          "En cas de manquement grave de l'une des parties non réparé trente jours après notification écrite, l'autre partie peut résilier le contrat de plein droit. À la fin du contrat, l'Officine peut demander la restitution de ses données dans un format lisible, puis leur suppression.",
        ],
      },
      {
        heading: "Article 6 — Droit applicable",
        paragraphs: ["Le présent contrat est soumis au droit français. À défaut d'accord amiable, les tribunaux compétents sont ceux du siège de la Société."],
      },
    ],
    signatures: [
      { role: "PHARMACY", label: "Pour l'Officine", name: pharmacy.ownerName, email: pharmacy.email },
      { role: "COMPANY", label: "Pour la Société", name: company.representativeName, email: company.representativeEmail },
    ],
  };
}
