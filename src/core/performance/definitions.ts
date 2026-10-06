import type { AdviceStatus } from "./types";

/**
 * Les définitions du suivi de performance : une seule source, reprise par le
 * calcul, la narration et le panneau « Comment c'est calculé ».
 */

/** Statuts d'un conseil retenu par l'équipe (DECLINED = retenu, puis refusé par le patient). */
export const ACCEPTED_STATUSES: readonly AdviceStatus[] = ["ACCEPTED", "MODIFIED", "REPLACED", "PRESENTED", "PURCHASED", "DECLINED"];

/** Un conseil PROPOSED depuis moins de 24 h est « en attente » : il n'entre pas dans le dénominateur du taux. */
export const PENDING_GRACE_HOURS = 24;

/** Taux par créneau : sous ce nombre de conseils tranchés, pas de taux (un taux sur 1 ou 2 conseils ne veut rien dire). */
export const MIN_DECIDED_FOR_RATE = 3;

/** Rythme : fenêtre d'observation, volume minimal global et par créneau. */
export const RHYTHM_MIN_DECIDED_TOTAL = 30;
export const RHYTHM_MIN_DECIDED_SLOT = 8;
/** La meilleure fenêtre horaire dure deux heures. */
export const RHYTHM_WINDOW_HOURS = 2;

/** Retour sur abonnement : volume et fiabilité minimaux. */
export const ROI_MIN_PRICED_LINES = 5;
export const ROI_MIN_PRICED_SHARE = 0.9;

/** Portefeuille (Super Admin). */
export const PORTFOLIO_GETTING_STARTED_DAYS = 14;
export const PORTFOLIO_INACTIVE_DAYS = 7;
export const PORTFOLIO_LOW_ACCEPTANCE = 0.2;
export const PORTFOLIO_LOW_ACCEPTANCE_MIN_DECIDED = 20;
export const PORTFOLIO_NO_SALES_MIN_ACCEPTED = 10;
export const PORTFOLIO_HIGH_VALUE_ROI = 3;
export const PORTFOLIO_HIGH_VALUE_MIN_SALES = 10;
/** Taux de TVA appliqué au prix HT de l'abonnement pour le comparer à un CA TTC (SaaS, 20 %). */
export const SUBSCRIPTION_VAT_RATE = 20;

/** Le panneau « Comment c'est calculé » : texte repris tel quel par l'interface. */
export const METHOD_SECTIONS: { title: string; body: string }[] = [
  {
    title: "Ce qui est mesuré",
    body: "Chaque conseil que PharmaBoost propose à votre équipe au comptoir est enregistré avec la décision prise (accepté, retiré, jamais tranché) et, quand il donne lieu à une vente enregistrée dans PharmaBoost, avec cette vente. Rien n'est estimé : ce que vous voyez est ce qui a été saisi.",
  },
  {
    title: "Conseil accepté ou vente confirmée ?",
    body: "Un conseil accepté est un conseil que votre équipe a retenu. Ce n'est pas une vente : le patient peut refuser, ou la vente ne pas être enregistrée. Une vente confirmée est une vente enregistrée dans PharmaBoost qui contient la ligne issue du conseil. Le nombre de ventes confirmées ne compte que celles dont au moins une ligne a un prix saisi : une ligne sans prix est signalée à part et ne fait jamais de chiffre d'affaires. PharmaBoost ne lit pas la caisse de votre logiciel de gestion : seules les ventes enregistrées dans PharmaBoost sont comptées.",
  },
  {
    title: "Chiffre d'affaires attribué",
    body: "Il additionne les lignes de vente confirmées issues d'un conseil PharmaBoost, au prix réellement saisi, toutes taxes comprises. Une ligne de vente sans prix n'entre jamais dans le chiffre d'affaires : elle est signalée à part. Aucune marge n'est calculée : les prix d'achat sont souvent absents, elle serait inventée.",
  },
  {
    title: "Ce qui n'est pas compté",
    body: "Les produits ajoutés à la main par l'équipe (ce ne sont pas des conseils PharmaBoost : la page Pilotage, elle, les inclut dans son « CA additionnel », d'où un écart possible), les conseils d'ordonnances supprimées, les propositions spontanées du comptoir sans ordonnance (leur acceptation n'est pas suivie) et les ventes sans lien avec un conseil.",
  },
  {
    title: "Deux calendriers",
    body: "Les conseils (proposés, acceptés, achetés) sont comptés à la date où ils ont été proposés. Le chiffre d'affaires, les ventes et les achats de la courbe sont comptés à la date de la vente. Une vente faite le lendemain d'une proposition apparaît donc le jour de la vente.",
  },
  {
    title: "Taux d'acceptation",
    body: "Conseils acceptés divisés par les conseils proposés, sans compter ceux proposés depuis moins de 24 heures et pas encore tranchés. Au-delà de 24 heures, un conseil sans réponse compte comme non retenu. Le taux par produit et par univers se calcule de la même façon. Il est arrondi au pourcent entier, partout.",
  },
  {
    title: "Comparaison",
    body: "Chaque chiffre est comparé à la période précédente de même durée écoulée : aujourd'hui contre hier à la même heure, les 7 derniers jours (les 6 jours précédents et aujourd'hui) contre les 7 jours d'avant, ce mois-ci contre le mois dernier au même jour. Aucun pourcentage n'est affiché quand la période précédente est vide.",
  },
  {
    title: "Retour sur abonnement",
    body: "Il compare le chiffre d'affaires hors taxes des ventes confirmées du mois civil au prix mensuel hors taxes de votre contrat. Il n'apparaît que s'il repose sur assez de lignes de vente (au moins 5 lignes de vente confirmées au prix connu) dont presque toutes ont un prix (au moins 90 %). Il reste masqué quand l'abonnement couvre plusieurs officines : le chiffre d'affaires d'une seule ne se compare pas au prix du groupe. C'est du chiffre d'affaires, pas du bénéfice.",
  },
  {
    title: "Heures et jours qui fonctionnent",
    body: "Calculés sur les 90 derniers jours, à partir de 30 conseils tranchés au moins. Un créneau n'est comparé que s'il compte au moins 8 conseils tranchés.",
  },
  {
    title: "Fuseau horaire",
    body: "Heures et jours : fuseau de Paris. Les jours commencent à minuit, heure de Paris, pour toutes les officines.",
  },
];
