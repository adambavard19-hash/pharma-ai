import { formatEuros } from "./subscription";
import { referrerPriceCents } from "@/core/pricing/official-offer";

/**
 * Les conditions d'abonnement acceptées en ligne (case à cocher du formulaire de
 * souscription). Leur version est gardée sur le dossier avec l'heure
 * d'acceptation (`Prospect.termsVersion`, `termsAcceptedAt`) : changer ce texte,
 * c'est changer la version.
 *
 * Les montants viennent de l'offre affichée sur le site, jamais d'un chiffre
 * recopié ici. Le reste reprend le contrat d'abonnement (objet, données de santé,
 * droit applicable).
 */
export const SUBSCRIPTION_TERMS_VERSION = "conditions-abonnement-v2-2026-10";

export type TermsInput = {
  companyName: string;
  monthlyPriceCents: number;
  setupFeeCents: number;
  commitmentMonths: number;
  referralDiscountPercent: number;
  contactEmail: string;
};

export function buildSubscriptionTerms(v: TermsInput): { title: string; version: string; sections: { heading: string; paragraphs: string[] }[] } {
  const monthly = `${formatEuros(v.monthlyPriceCents)} HT`;
  const setup = `${formatEuros(v.setupFeeCents)} HT`;
  const first = `${formatEuros(v.monthlyPriceCents + v.setupFeeCents)} HT`;
  return {
    title: "Conditions d'abonnement à PharmaBoost",
    version: SUBSCRIPTION_TERMS_VERSION,
    sections: [
      {
        heading: "1. Objet",
        paragraphs: [
          `${v.companyName === "PharmaBoost" ? "PharmaBoost" : `${v.companyName} (« PharmaBoost »)`} met à disposition de l'officine abonnée (« l'Officine ») le service en ligne PharmaBoost : lecture des ordonnances, aide au conseil au comptoir à partir du stock de l'Officine, plan personnalisé remis au patient, suivi et pilotage de l'activité.`,
          "PharmaBoost est un outil d'assistance. Il ne prescrit pas et ne se substitue à aucune décision du pharmacien, qui reste seul responsable des conseils délivrés et des ventes réalisées.",
        ],
      },
      {
        heading: "2. Prix",
        paragraphs: [
          `L'abonnement est de ${monthly} par mois, pour tous les postes de comptoir de l'Officine. Une mise en service unique de ${setup} couvre l'installation et la configuration des postes, le paramétrage de l'Officine et l'import du stock, les tests et la formation de l'équipe.`,
          `La mise en service est facturée avec le premier mois : la première facture est de ${first}, puis ${monthly} chaque mois. Les prix s'entendent hors taxes ; la TVA au taux en vigueur (20 %) s'y ajoute.`,
          "Le prix de l'Officine est celui en vigueur le jour de sa souscription : une modification ultérieure des tarifs publiés ne le change pas.",
        ],
      },
      {
        heading: "3. Paiement",
        paragraphs: [
          "Le paiement est mensuel, par prélèvement SEPA ou par carte bancaire, au choix de l'Officine, sur la page de paiement sécurisée de notre prestataire Stripe. PharmaBoost ne voit ni ne conserve les coordonnées bancaires. Les factures sont disponibles dans PharmaBoost, Paramètres → Mon abonnement.",
          "En cas d'échec de paiement, de nouvelles tentatives sont faites et l'Officine en est prévenue par e-mail. Un impayé persistant après mise en demeure restée sans effet quinze jours peut entraîner la suspension du service ; aucune donnée n'est supprimée du fait d'une suspension.",
        ],
      },
      {
        heading: "4. Durée et engagement",
        paragraphs: [
          `L'abonnement prend effet le jour de la souscription, pour une durée minimale de ${v.commitmentMonths} mois. Une résiliation demandée pendant cette période prend effet à son terme ; les mois restants restent dus.`,
          `À l'issue des ${v.commitmentMonths} mois, l'abonnement se poursuit de mois en mois. Il peut alors être résilié à tout moment, avec effet à la fin du mois en cours, par simple demande à ${v.contactEmail}.`,
        ],
      },
      {
        heading: "5. Parrainage",
        paragraphs: [
          `Chaque officine abonnée dispose d'un code de parrainage. Tant qu'au moins une officine qu'elle a parrainée est abonnée et à jour de ses paiements, son abonnement passe à ${formatEuros(referrerPriceCents(v.monthlyPriceCents, v.referralDiscountPercent))} HT par mois (${v.referralDiscountPercent} % de moins) ; tant qu'au moins deux officines qu'elle a parrainées le sont, à ${formatEuros(referrerPriceCents(v.monthlyPriceCents, v.referralDiscountPercent * 2))} HT par mois (${v.referralDiscountPercent * 2} % de moins), jamais davantage. La remise s'applique aux factures suivantes ; elle cesse quand plus aucune officine parrainée n'est abonnée. L'officine parrainée paie le tarif normal.`,
        ],
      },
      {
        heading: "6. Données de santé et confidentialité",
        paragraphs: [
          "L'Officine est responsable du traitement des données de ses patients ; PharmaBoost agit en qualité de sous-traitant au sens du RGPD et n'y accède que pour fournir le service. À la fin de l'abonnement, l'Officine peut demander la restitution de ses données dans un format lisible, puis leur suppression.",
          "Chaque partie s'engage à la confidentialité des informations de l'autre partie dont elle aurait connaissance à l'occasion de l'abonnement.",
        ],
      },
      {
        heading: "7. Droit applicable",
        paragraphs: ["Les présentes conditions sont soumises au droit français. À défaut d'accord amiable, les tribunaux compétents sont ceux du siège de PharmaBoost."],
      },
    ],
  };
}
