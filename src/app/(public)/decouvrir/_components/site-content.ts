/**
 * Les textes du site public repris ailleurs : l'accueil (`../page.tsx`) et la plaquette des commerciaux
 * (`src/components/plaquette`) lisent les mêmes listes. Une phrase corrigée ici change sur le site ET dans la plaquette :
 * aucune des deux ne peut dire autre chose que l'autre.
 *
 * Tout ce qui est affirmé ici existe dans l'application. Les ventes au comptoir sont DÉCLARÉES (Vendu / Non vendu).
 */

/**
 * Des cas réels du moteur, chacun adossé à une règle ou à une mise en garde : protection solaire sous doxycycline, ferments
 * lactiques sous amoxicilline, routine peau sous isotrétinoïne (« Conseil peau »), poche chaud/froid après l'arbre de questions,
 * paracétamol des remèdes contre le rhume (RCP Fervex), antiparasitaires pour chien (ANSES).
 */
export const EXAMPLES: { scan: string; context?: string; shows: string; note?: string; warning?: boolean; why: string }[] = [
  { scan: "DOXYCYCLINE", shows: "Protection solaire SPF 50+", why: "Ce traitement rend la peau plus sensible au soleil." },
  { scan: "AMOXICILLINE", shows: "Probiotique", note: "À distance de l'antibiotique", why: "L'antibiotique peut perturber la flore intestinale." },
  { scan: "ISOTRÉTINOÏNE", shows: "Routine : nettoyer, hydrater, protéger", note: "À éviter : gommages et peelings", why: "Ce traitement assèche et fragilise la peau." },
  { scan: "PARACÉTAMOL", context: "Le patient a mal au dos", shows: "Poche chaud/froid pour le dos", note: "Après « Où a-t-il mal ? »", why: "Le froid ou le chaud local complète le traitement." },
  { scan: "FERVEX", shows: "3 g de paracétamol par jour au maximum", warning: true, why: "Chaque sachet contient déjà du paracétamol." },
  { scan: "ANTIPARASITAIRE CHIEN", shows: "Danger pour le chat", warning: true, why: "Selon l'ANSES, la perméthrine des antiparasitaires pour chien est toxique pour le chat." },
];

export const STOCK_POINTS: { label: string; value: string; hint?: string }[] = [
  // La quantité vient du dernier envoi du stock : « stock exact » laissait croire à une lecture en direct.
  { label: "Stock", value: "Uniquement des produits en rayon, avec la quantité en stock sous chaque conseil" },
  // Dans l'ordre du départage (src/core/ai/engines/tiebreak.ts) : les laboratoires préférés, puis la date courte, puis le
  // challenge. Les dates courtes venaient d'abord à l'écran, et « la date courte d'abord » contredisait la ligne d'en dessous.
  {
    label: "Laboratoires",
    value: "Vos laboratoires préférés passent en premier",
    hint: "Dites simplement à PharmaBoost quels laboratoires vous préférez : quand deux produits répondent aussi bien au besoin, c'est le vôtre qui est proposé en premier. Le conseil reste choisi pour le patient, jamais pour le laboratoire.",
  },
  {
    label: "Dates courtes et challenges",
    value: "À conseil égal, après vos laboratoires préférés : la date courte, puis le challenge en cours",
    hint: "Vous les saisissez ; ils ne passent jamais devant le produit le plus adapté au patient.",
  },
  { label: "Associations", value: "Vos associations : ce produit vendu, celui-ci proposé — même sans ordonnance" },
  { label: "Marge", value: "Affichée sur l'écran de vente, quand le prix d'achat est connu" },
];

export const TEAM_POINTS: { label: string; value: string }[] = [
  { label: "Comptoirs", value: "Chaque comptoir est attribué à un collaborateur" },
  { label: "Classement", value: "Proposés, validés, taux — par jour, semaine, mois" },
  { label: "Challenges", value: "La progression de chacun, challenge par challenge" },
  { label: "Bilan mensuel", value: "Chaque mois, par e-mail, ce qui s'est passé au comptoir" },
  // Deux chemins : l'invitation par e-mail (aucune approbation), ou « Rejoindre mon officine » (le titulaire approuve).
  { label: "Équipe", value: "Invitée par e-mail, ou demande à rejoindre : vous approuvez" },
];

export const SAFETY: { label: string; value: string }[] = [
  { label: "Mises en garde", value: "Ce qu'il ne faut pas ajouter au traitement est signalé" },
  { label: "Posologie", value: "Les doses qui s'additionnent sont rappelées (3 g de paracétamol par jour au maximum)" },
  { label: "Vigilances", value: "Le complément qui ne va pas avec le traitement n'est pas proposé" },
  // Pas « relues » : toutes les règles attendent encore la relecture du pharmacien signataire (PENDING).
  { label: "Sources", value: "Règles écrites à partir de documents de pharmaciens et des sources officielles (RCP, HAS, ANSES)" },
  { label: "Décision", value: "Le pharmacien garde la validation finale" },
  { label: "Données", value: "Aucune fiche patient. L'e-mail du bilan est effacé après l'envoi." },
];

export const FAQ: { q: string; a: string }[] = [
  { q: "Compatible avec mon logiciel ?", a: "PharmaBoost fonctionne à côté de votre logiciel de gestion, sans le modifier. Premier déploiement : LGPI ; les autres logiciels s'installent avec nous." },
  // Ni durée ni « sans alerte » : l'installateur n'est pas encore signé, et la mise à jour seule n'a pas encore été vue sur un vrai poste.
  { q: "Comment s'installe PharmaBoost ?", a: "Un fichier à télécharger par poste de comptoir, un double-clic. Les mises à jour arrivent ensuite automatiquement, jamais pendant une vente. La mise en service est faite avec vous." },
  { q: "Qui décide du conseil ?", a: "Le pharmacien. Au comptoir, il note Vendu ou Non vendu ; sur l'écran de vente, il propose, remplace ou ignore." },
  { q: "Une IA choisit-elle les produits ?", a: "Non. Les produits viennent de règles écrites à partir de documents de pharmaciens et des sources officielles (RCP, HAS, ANSES), et de votre stock. L'IA aide à lire l'ordonnance et à reconnaître les produits de votre stock." },
  { q: "Faut-il paramétrer les conseils ?", a: "Non. La bibliothèque de conseils est commune : une correction faite une fois vaut pour toutes les pharmacies. Vous gardez vos associations et vos laboratoires préférés." },
  { q: "Quelles données sont conservées ?", a: "Aucune fiche patient. Le plan conseil est chiffré et remis au patient ; l'adresse e-mail donnée pour le bilan est effacée après l'envoi." },
  { q: "Est-ce un dispositif médical ?", a: "Non. C'est un outil d'aide au conseil : il ne diagnostique pas et ne prescrit pas." },
  { q: "Quel engagement ?", a: "Un seul abonnement, avec un engagement de 12 mois. La mise en service, installation, paramétrage et formation de l'équipe comprises, est facturée une seule fois." },
];
