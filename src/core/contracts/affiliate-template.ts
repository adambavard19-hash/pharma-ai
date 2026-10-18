import { TIME_ZONE } from "@/config/constants";
import { AFFILIATE_SIGNUP_BONUS_CENTS, AFFILIATE_TIERS, monthlyAffiliateCommissionCents, type AffiliateTier } from "@/core/affiliation/terms";
import type { ContractDocument, ContractParty } from "./template";

/**
 * Le contrat d'affiliation PharmaBoost (18 oct. 2026), à la place de l'ancien
 * « contrat de commercial » qui n'a jamais existé dans le code.
 *
 * Un texte figé et versionné : chaque montant vient de la source unique
 * (`src/core/affiliation/terms.ts` pour les paliers et la prime, l'offre de la
 * console ou l'offre officielle pour l'exemple chiffré). La prime du directeur
 * commercial n'y figure jamais (elle vit à part, dans `director-terms.ts`).
 *
 * Ordre de signature : l'affilié, puis PharmaBoost (contresignature).
 */
export const AFFILIATE_CONTRACT_TEMPLATE_KEY = "affiliation-pharmaboost-v1";

export type AffiliateParty = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  zone?: string | null;
};

/** Les conditions imprimées, figées avec le contrat (colonne `termsSnapshot`). */
export type AffiliateContractTerms = {
  tiers: AffiliateTier[];
  signupBonusCents: number;
  /** Le tarif mensuel HT qui sert d'exemple chiffré (offre de la console, sinon offre officielle). */
  exampleMonthlyPriceCents: number;
  startDate: string;
};

/** Les conditions du jour, lues depuis la source unique de l'affiliation. */
export function currentAffiliateTerms(exampleMonthlyPriceCents: number, startDate: Date): AffiliateContractTerms {
  return { tiers: AFFILIATE_TIERS.map((tier) => ({ ...tier })), signupBonusCents: AFFILIATE_SIGNUP_BONUS_CENTS, exampleMonthlyPriceCents, startDate: startDate.toISOString() };
}

const euros = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} € HT`;
const dateFr = (d: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, day: "numeric", month: "long", year: "numeric" }).format(d);

function tierLine(tier: AffiliateTier): string {
  const range = tier.max === null ? `à partir de ${tier.min} pharmacies abonnées` : `de ${tier.min} à ${tier.max} pharmacie${tier.max > 1 ? "s" : ""} abonnée${tier.max > 1 ? "s" : ""}`;
  return `${tier.ratePercent} % ${range}`;
}

export function buildAffiliateContractDocument(input: {
  reference: string;
  company: ContractParty;
  affiliate: AffiliateParty;
  terms: AffiliateContractTerms;
  countersigner: { name: string; email: string };
}): ContractDocument {
  const { company, affiliate, terms } = input;
  const fullName = `${affiliate.firstName} ${affiliate.lastName}`.trim();
  const first = terms.tiers[0];
  const last = terms.tiers[terms.tiers.length - 1];
  const example = terms.exampleMonthlyPriceCents;
  return {
    templateKey: AFFILIATE_CONTRACT_TEMPLATE_KEY,
    title: "Contrat d'affiliation PharmaBoost",
    reference: input.reference,
    sections: [
      {
        heading: "Entre les soussignés",
        paragraphs: [
          `${company.legalName}${company.legalForm ? `, ${company.legalForm}` : ""}, dont le siège est situé ${company.address}${company.siren ? `, immatriculée sous le numéro SIREN ${company.siren}` : ""}, représentée par ${input.countersigner.name}, ci-après « la Société »,`,
          `et ${fullName}, ${affiliate.email}${affiliate.phone ? `, ${affiliate.phone}` : ""}${affiliate.zone ? `, secteur : ${affiliate.zone}` : ""}, ci-après « l'Affilié ».`,
        ],
      },
      {
        heading: "Article 1 — Objet",
        paragraphs: [
          "L'Affilié fait connaître le service PharmaBoost à des pharmacies d'officine et les met en relation avec la Société. Il agit en toute indépendance : il n'est ni salarié, ni mandataire de la Société, n'a aucun lien de subordination avec elle et ne signe aucun engagement en son nom.",
          "Les conditions proposées aux pharmacies sont exclusivement celles de l'offre officielle publiée par la Société ; l'Affilié ne promet aucune remise, aucun délai ni aucun service qui n'y figure pas.",
        ],
      },
      {
        heading: "Article 2 — Pharmacie apportée",
        paragraphs: [
          "Est une pharmacie apportée par l'Affilié celle dont le dossier est rattaché à l'Affilié dans PharmaBoost (lien d'affiliation, dossier créé depuis son espace) et qui souscrit un abonnement PharmaBoost. Le rattachement enregistré dans PharmaBoost fait foi.",
        ],
      },
      {
        heading: "Article 3 — Rémunération",
        paragraphs: [
          `Commission mensuelle : pour chaque mois au cours duquel une pharmacie apportée est abonnée au dernier jour du mois, l'Affilié perçoit un pourcentage de l'abonnement mensuel hors taxes de cette pharmacie. Ce pourcentage dépend du nombre de pharmacies apportées par l'Affilié et abonnées à la fin du mois : ${terms.tiers.map(tierLine).join(" ; ")}.`,
          "Le taux du palier atteint s'applique à toutes les pharmacies apportées de l'Affilié pour le mois considéré. Il est recalculé chaque mois et inscrit sur chaque ligne de commission.",
          `Prime d'apport : l'Affilié perçoit en outre une prime unique de ${euros(terms.signupBonusCents)} par pharmacie apportée, due une seule fois, lorsque la mise en service de cette pharmacie a été effectivement réglée.`,
          "Durée : la commission mensuelle est due à vie, pour chaque mois où la pharmacie apportée reste abonnée. Elle cesse dès que la pharmacie n'est plus abonnée à la fin d'un mois, et reprend si elle se réabonne.",
          `Exemple : pour un abonnement de ${euros(example)} par mois, la commission mensuelle est de ${euros(monthlyAffiliateCommissionCents(example, first.ratePercent / 100))} par pharmacie au premier palier (${first.ratePercent} %) et de ${euros(monthlyAffiliateCommissionCents(example, last.ratePercent / 100))} par pharmacie au dernier palier (${last.ratePercent} %).`,
        ],
      },
      {
        heading: "Article 4 — Facturation et paiement",
        paragraphs: [
          "Les commissions acquises apparaissent chaque mois dans l'espace de l'Affilié. L'Affilié adresse sa facture à la Société depuis cet espace ; la Société la règle par virement dans les trente jours de sa réception. Les montants s'entendent hors taxes ; l'Affilié est seul responsable de ses obligations fiscales et sociales.",
        ],
      },
      {
        heading: "Article 5 — Engagements de l'Affilié",
        paragraphs: [
          "L'Affilié présente PharmaBoost loyalement, sans pratique commerciale trompeuse ni démarchage abusif. Il garde confidentielles les informations de la Société et des pharmacies dont il a connaissance. Il n'a jamais accès aux données des patients des pharmacies.",
        ],
      },
      {
        heading: "Article 6 — Durée et résiliation",
        paragraphs: [
          `Le présent contrat prend effet le ${dateFr(new Date(terms.startDate))} pour une durée indéterminée. Chaque partie peut y mettre fin à tout moment par écrit, avec un préavis d'un mois.`,
          "Après la fin du contrat, les commissions mensuelles des pharmacies apportées restent dues dans les conditions de l'article 3, sauf résiliation pour manquement grave de l'Affilié.",
        ],
      },
      {
        heading: "Article 7 — Droit applicable",
        paragraphs: ["Le présent contrat est soumis au droit français. À défaut d'accord amiable, les tribunaux compétents sont ceux du siège de la Société."],
      },
      {
        heading: "Article 8 — Signature",
        paragraphs: [
          "Le présent contrat est signé électroniquement, d'abord par l'Affilié, puis contresigné par la Société. Il n'est formé qu'une fois les deux signatures recueillies ; chaque partie en reçoit alors l'exemplaire signé.",
        ],
      },
    ],
    signatures: [
      { role: "AFFILIATE", label: "L'Affilié (signe en premier)", name: fullName, email: affiliate.email },
      { role: "COMPANY", label: "Pour la Société (contresigne)", name: input.countersigner.name, email: input.countersigner.email },
    ],
  };
}

/** La référence imprimée : « PB-AFF-2026-DUPONT-V1 ». */
export function affiliateContractReference(lastName: string, version: number, year: number): string {
  const slug =
    lastName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20) || "AFFILIE";
  return `PB-AFF-${year}-${slug}-V${version}`;
}
