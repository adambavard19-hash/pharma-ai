import { TIME_ZONE } from "@/config/constants";
import { AFFILIATE_SIGNUP_BONUS_CENTS, type AffiliateTier } from "@/core/affiliation/terms";
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
 *
 * v2 (fondateur, 20 oct. 2026) : l'apporteur d'affaires touche 100 € HT par pharmacie apportée et signée, une seule
 * fois, une fois sa mise en service réglée ; plus de commission mensuelle. Les contrats v1 signés restent tels quels
 * (texte figé avec eux).
 */
export const AFFILIATE_CONTRACT_TEMPLATE_KEY = "affiliation-pharmaboost-v2";

export type AffiliateParty = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  zone?: string | null;
};

/** Les conditions imprimées, figées avec le contrat (colonne `termsSnapshot`). */
export type AffiliateContractTerms = {
  /** Paliers du pourcentage mensuel : contrats v1 seulement, vide depuis la v2. */
  tiers: AffiliateTier[];
  signupBonusCents: number;
  /** Le tarif mensuel HT qui sert d'exemple chiffré (offre de la console, sinon offre officielle). */
  exampleMonthlyPriceCents: number;
  startDate: string;
};

/** Les conditions du jour, lues depuis la source unique de l'affiliation. */
export function currentAffiliateTerms(exampleMonthlyPriceCents: number, startDate: Date): AffiliateContractTerms {
  return { tiers: [], signupBonusCents: AFFILIATE_SIGNUP_BONUS_CENTS, exampleMonthlyPriceCents, startDate: startDate.toISOString() };
}

const euros = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} € HT`;
const dateFr = (d: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, day: "numeric", month: "long", year: "numeric" }).format(d);

export function buildAffiliateContractDocument(input: {
  reference: string;
  company: ContractParty;
  affiliate: AffiliateParty;
  terms: AffiliateContractTerms;
  countersigner: { name: string; email: string };
}): ContractDocument {
  const { company, affiliate, terms } = input;
  const fullName = `${affiliate.firstName} ${affiliate.lastName}`.trim();
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
          "Est une pharmacie apportée par l'Affilié celle dont le dossier est rattaché à l'Affilié dans PharmaBoost (lien d'affiliation, dossier créé depuis son espace, pharmacie indiquée par l'Affilié sur le site de la Société) et qui souscrit un abonnement PharmaBoost. Le rattachement enregistré dans PharmaBoost fait foi.",
        ],
      },
      {
        heading: "Article 3 — Rémunération",
        paragraphs: [
          `Prime d'apport : pour chaque pharmacie apportée qui signe son abonnement PharmaBoost, l'Affilié perçoit une prime unique de ${euros(terms.signupBonusCents)}, due une seule fois par pharmacie, dès que la mise en service de cette pharmacie a été effectivement réglée à la Société.`,
          "Cette prime constitue l'intégralité de la rémunération de l'Affilié : aucune commission mensuelle ni aucun pourcentage de l'abonnement n'est dû.",
        ],
      },
      {
        heading: "Article 4 — Facturation et paiement",
        paragraphs: [
          "Les primes acquises apparaissent dans l'espace de l'Affilié. L'Affilié adresse sa facture à la Société depuis cet espace ; la Société la règle par virement dans les trente jours de sa réception. Les montants s'entendent hors taxes ; l'Affilié est seul responsable de ses obligations fiscales et sociales.",
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
          "Après la fin du contrat, les primes des pharmacies apportées avant cette date restent dues dans les conditions de l'article 3, sauf résiliation pour manquement grave de l'Affilié.",
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
