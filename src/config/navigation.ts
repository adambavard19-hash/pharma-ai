import {
  BarChart3,
  Box,
  FlaskConical,
  GraduationCap,
  Handshake,
  Link2,
  MailCheck,
  Megaphone,
  PackageSearch,
  ScanLine,
  Settings,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { PERMISSIONS, type Permission } from "@/server/rbac/permissions";

/**
 * La navigation de PharmaBoost.
 *
 * Elle décrit le travail au comptoir, dans l'ordre où il se fait — on reçoit
 * une ordonnance, on a une minute. L'ancienne navigation décrivait les objets
 * du système (ordonnances, produits, stocks, ventes, analytics…) : c'était la
 * carte d'un ERP.
 *
 * Trois groupes, sous l'action principale « Au comptoir » : MA PHARMACIE (le
 * stock, ce que ça rapporte, les e-mails partis aux patients, les produits
 * manquants, les associations, l'équipe),
 * DÉCOUVRIR (se former, les partenaires, les actualités) et CONFIGURATION (les
 * paramètres). Chaque entrée porte une phrase (`description`) que le menu
 * montre au survol : on sait ce qu'il y a derrière avant de cliquer.
 *
 * Retours du fondateur du 13 oct. 2026 : « Patients » et « Suivis patients »
 * quittent le menu (au comptoir, seul le bilan part au patient, par e-mail :
 * c'est « E-mails aux patients ») ; « Mes comptoirs » aussi (le robot se
 * connecte seul, le stock s'envoie depuis « Mon stock ») — les postes vivent
 * dans Paramètres → « Postes du comptoir » ; « Mon assortiment », que personne
 * ne comprenait, devient « Produits manquants » ; « Réglementation » sort du
 * menu : ses conditions de délivrance sont sur la fiche de chaque médicament
 * (trouvée par la recherche ⌘K), qui mène aux « Dernières évolutions ».
 * Aucune page n'a été supprimée :
 * les anciennes adresses répondent toujours ou redirigent.
 *
 * Elle se plie au rôle, et c'est une décision de produit autant que de droits.
 * Consigne du fondateur (13 oct. 2026) : « Tout ce qui n'est pas le titulaire
 * comme espace doit avoir seulement comme onglets : Au comptoir, Mes
 * associations, E-mails aux patients, l'espace Découvrir, et Contact support. »
 * C'est `COLLABORATOR_MENU`, une liste blanche explicite ; le titulaire voit tout
 * le menu. « Contact support » n'est pas une entrée de ce tableau : c'est le lien
 * toujours visible en bas du menu, pour tout le monde. Un groupe sans entrée
 * visible n'est pas affiché.
 *
 * Tout ce qui a quitté ce menu reste atteignable (cf. `OFF_MENU_DESTINATIONS`) :
 * retirer du menu n'est pas supprimer. Ce qui disparaît, c'est la charge
 * mentale, pas la fonctionnalité.
 */

export type NavGroupKey = "pharmacie" | "decouvrir" | "configuration";

/** Les groupes du menu, dans l'ordre où ils s'affichent (l'action principale « Au comptoir » est au-dessus, hors groupe). */
export const NAV_GROUPS: { key: NavGroupKey; label: string }[] = [
  { key: "pharmacie", label: "Ma pharmacie" },
  { key: "decouvrir", label: "Découvrir" },
  { key: "configuration", label: "Configuration" },
];

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
  /**
   * Préfixes d'URL qui gardent l'entrée active. Indispensable pendant la
   * transition : `/vente/...` et `/ordonnances/...` désignent le même travail.
   */
  match?: string[];
  /** Une courte ligne sous le titre dans le menu (« Disponibilités et produits »). */
  subtitle?: string;
  /** Sous-chemins qui appartiennent à une autre entrée (Paramètres sans « Laboratoires & gammes »). */
  except?: string[];
  description: string;
  /**
   * L'action principale de l'application. Rendue comme une ligne mise en avant
   * en tête de la barre latérale, hors des groupes.
   */
  primary?: boolean;
  /** Le groupe du menu ; absent pour l'action principale. */
  group?: NavGroupKey;
};

export const NAVIGATION: NavItem[] = [
  {
    href: "/vente/nouvelle",
    label: "Au comptoir",
    icon: ScanLine,
    permission: PERMISSIONS.PRESCRIPTION_CREATE,
    match: ["/vente", "/ordonnances", "/au-comptoir"],
    description: "Les délivrances en cours et les ventes terminées du jour",
    primary: true,
  },

  // --- Ma pharmacie
  {
    href: "/associations",
    label: "Mes associations",
    subtitle: "Conseils et associations personnalisés",
    icon: Link2,
    // Deuxième entrée du menu, juste après « Au comptoir » (consigne du fondateur, 13 oct. 2026 : rubrique importante).
    // Ouverte à toute l'équipe (consigne du 13 oct. 2026) : la voir demande ASSOCIATIONS_VIEW, l'écrire ASSOCIATIONS_MANAGE
    // (pharmacien, préparateur, titulaire) — une permission à part, qui n'ouvre pas les règles de conseil de l'officine.
    permission: PERMISSIONS.ASSOCIATIONS_VIEW,
    match: ["/associations"],
    description: "Quand un produit ou un médicament est dans la vente, les produits de votre stock que PharmaBoost propose avec",
    group: "pharmacie",
  },
  {
    href: "/stock",
    label: "Mon stock",
    subtitle: "Disponibilités et produits",
    icon: Box,
    // Espace du titulaire (consigne du 13 oct. 2026). STOCK_VIEW, que toute l'équipe détient, garde toujours la PAGE
    // (une carte du comptoir peut mener à la fiche d'un produit) ; l'ENTRÉE de menu, elle, est celle du titulaire.
    permission: PERMISSIONS.MANAGEMENT_MENU,
    match: ["/stock", "/stocks", "/produits"],
    description: "Ce que vous avez en rayon, la mise à jour du stock, les dates courtes",
    group: "pharmacie",
  },
  {
    href: "/pilotage",
    label: "Performances",
    subtitle: "Résultats et chiffre d'affaires",
    icon: BarChart3,
    // Même permission que le pilotage par collaborateur : la valeur chiffrée reste une vue de titulaire.
    // L'équipe au comptoir ne voit ni l'entrée ni la page. Deux pages, une entrée : on arrive sur « Mon équipe » (le classement de
    // chacun et les challenges, simple), qui mène à « Ce que PharmaBoost vous rapporte » (les ventes confirmées), qui y renvoie.
    permission: PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE,
    match: ["/resultats", "/pilotage", "/performance", "/analytics", "/ventes"],
    description: "Le classement de l'équipe, les challenges, et ce que les conseils PharmaBoost ont rapporté",
    group: "pharmacie",
  },
  {
    href: "/equipe",
    label: "Mon équipe",
    subtitle: "Collaborateurs et challenges",
    icon: UsersRound,
    // Gérer l'équipe est un acte de titulaire. Un pharmacien adjoint garde
    // TEAM_VIEW ailleurs, mais n'a rien à faire dans cet écran au comptoir.
    permission: PERMISSIONS.TEAM_MANAGE,
    match: ["/equipe"],
    description: "Inviter vos collaborateurs, approuver leurs demandes, voir qui travaille à quel comptoir",
    group: "pharmacie",
  },
  {
    href: "/emails-patients",
    label: "E-mails aux patients",
    subtitle: "Suivis et communications",
    icon: MailCheck,
    // Ouverte à l'équipe (consigne du 13 oct. 2026) : un collaborateur voit les bilans de SES ventes ; le titulaire
    // (ANALYTICS_VIEW_TEAM_PERFORMANCE) voit toute l'officine, tous comptoirs confondus.
    permission: PERMISSIONS.PATIENT_EMAILS_VIEW,
    match: ["/emails-patients"],
    description: "Les bilans envoyés par e-mail depuis le comptoir : quand, par qui, quels produits, envoyé ou non",
    group: "pharmacie",
  },
  {
    href: "/parametres/laboratoires/gammes",
    label: "Laboratoires & gammes",
    subtitle: "Catalogues et partenaires commerciaux",
    icon: FlaskConical,
    // Les gammes privilégiées, les challenges et les marques : des choix de titulaire, en entrée directe (retour du
    // fondateur du 13 oct. 2026 : « pas dans les paramètres »). Seul le titulaire a LAB_PROGRAMS_MANAGE.
    permission: PERMISSIONS.LAB_PROGRAMS_MANAGE,
    match: ["/parametres/laboratoires"],
    description: "Vos gammes privilégiées, les challenges des laboratoires, les marques mises en avant",
    group: "pharmacie",
  },
  {
    href: "/assortiment",
    label: "Produits manquants",
    subtitle: "Besoins et ruptures",
    icon: PackageSearch,
    // Réservé au titulaire, comme les partenaires : les besoins que le stock n'a pas couverts
    // ne remontent pas de l'équipe au comptoir, le titulaire les consulte ici.
    permission: PERMISSIONS.PARTNERS_MANAGE,
    match: ["/assortiment"],
    description: "Les conseils que PharmaBoost n'a pas pu proposer faute de produit en stock : ce qu'il faudrait référencer",
    group: "pharmacie",
  },

  // --- Découvrir
  {
    href: "/formation",
    label: "Formations",
    icon: GraduationCap,
    permission: PERMISSIONS.TRAINING_VIEW,
    match: ["/formation"],
    description: "Vidéos et fiches courtes pour bien connaître les produits et les gammes de l'officine",
    group: "decouvrir",
  },
  {
    href: "/partenaires",
    label: "Partenaires",
    icon: Handshake,
    // L'équipe consulte (PARTNERS_VIEW) ; masquer, contacter, commander restent au titulaire (PARTNERS_MANAGE),
    // boutons masqués à l'écran et refusés par le serveur.
    permission: PERMISSIONS.PARTNERS_VIEW,
    match: ["/partenaires"],
    description: "Les gammes des laboratoires partenaires : présentation, conditions, contact",
    group: "decouvrir",
  },
  {
    href: "/nouveautes",
    label: "Actualités",
    icon: Megaphone,
    // L'équipe lit l'historique des annonces (NEWS_VIEW) ; écrire aux patients abonnés reste un acte du titulaire
    // (NEWS_MANAGE), boutons masqués à l'écran et refusés par le serveur.
    permission: PERMISSIONS.NEWS_VIEW,
    match: ["/nouveautes"],
    description: "Prévenir vos patients abonnés des nouvelles gammes de la pharmacie",
    group: "decouvrir",
  },

  // --- Configuration
  {
    href: "/parametres",
    label: "Paramètres",
    icon: Settings,
    // SETTINGS_MANAGE et non PHARMACY_VIEW : régler l'officine n'est pas
    // consulter l'officine. Les réglages personnels d'un collaborateur vivent
    // dans « Mon compte », depuis le menu utilisateur.
    permission: PERMISSIONS.SETTINGS_MANAGE,
    match: ["/parametres", "/conseils"],
    except: ["/parametres/laboratoires"],
    description: "Officine, postes du comptoir, préférences de conseil, abonnement, conformité",
    group: "configuration",
  },
];

/**
 * Le menu d'un collaborateur (tout rôle autre que le titulaire) : ces entrées, et rien d'autre — plus le lien
 * « Contact support », toujours en bas du menu. Consigne du fondateur du 13 oct. 2026.
 */
export const COLLABORATOR_MENU: readonly string[] = ["/vente/nouvelle", "/associations", "/emails-patients", "/formation", "/partenaires", "/nouveautes"];

/**
 * Les entrées que voit une personne : celles dont elle détient la permission, et, hors de l'espace du titulaire
 * (MANAGEMENT_MENU), seulement celles du menu d'un collaborateur. Les permissions des entrées sont choisies pour que le
 * filtre par permission seul donne déjà ce résultat pour chaque rôle (vérifié par les tests) ; la liste blanche le
 * garantit même si une permission de gestion était accordée individuellement.
 */
export function navigationFor(permissions: Iterable<string>): NavItem[] {
  const granted = new Set(permissions);
  const owner = granted.has(PERMISSIONS.MANAGEMENT_MENU);
  return NAVIGATION.filter((item) => granted.has(item.permission) && (owner || COLLABORATOR_MENU.includes(item.href)));
}

/** Les entrées visibles, rangées par groupe (dans l'ordre du menu) ; un groupe vide n'est pas rendu. */
export function groupNavigation(items: NavItem[]): { key: NavGroupKey; label: string; items: NavItem[] }[] {
  return NAV_GROUPS.map((group) => ({ ...group, items: items.filter((item) => item.group === group.key) })).filter((group) => group.items.length > 0);
}

/**
 * Les écrans sortis du menu mais conservés.
 *
 * Ils restent accessibles par un lien contextuel (un chiffre de l'accueil, la
 * cloche de la barre supérieure, une fiche patient). Les lister ici évite
 * qu'ils deviennent des pages orphelines que plus rien n'atteint.
 *
 * L'équipe, les règles de conseil et les postes du comptoir n'y figurent qu'en
 * rappel : ce sont des onglets de Paramètres, donc atteignables depuis le menu.
 */
export const OFF_MENU_DESTINATIONS: {
  href: string;
  label: string;
  reachableFrom: string;
}[] = [
  {
    href: "/patients",
    label: "Patients",
    reachableFrom: "une vente (la fiche du patient, quand il en a une) — sorti du menu le 13 oct. 2026 : au comptoir, seul le bilan part au patient",
  },
  {
    href: "/suivis",
    label: "Suivis patients",
    reachableFrom: "la fin d'une vente (proposer un suivi) et la cloche — sorti du menu le 13 oct. 2026",
  },
  {
    href: "/parametres/postes",
    label: "Postes du comptoir",
    reachableFrom: "Paramètres (onglet « Postes du comptoir ») ; /connexion et /installation y redirigent",
  },
  {
    href: "/reglementation",
    label: "Réglementation",
    reachableFrom: "la fiche d'un médicament (recherche ⌘K → un médicament), encart « Réglementation » → « Toutes les règles et les dernières évolutions »",
  },
  {
    href: "/support",
    label: "Contact support",
    reachableFrom: "le lien « Contact support », toujours visible en bas du menu",
  },
  {
    href: "/resultats",
    label: "Ce que PharmaBoost vous rapporte",
    reachableFrom: "Performances (le lien « Les ventes et le chiffre d'affaires »)",
  },
  {
    href: "/performance",
    label: "Performance de l'officine",
    reachableFrom: "l'espace Pilotage",
  },
  { href: "/analytics", label: "Analytics détaillées", reachableFrom: "l'espace Pilotage" },
  { href: "/ventes", label: "Journal des ventes", reachableFrom: "l'espace Pilotage" },
  { href: "/ordonnances", label: "Historique des ordonnances", reachableFrom: "la fiche patient" },
  { href: "/notifications", label: "Notifications", reachableFrom: "la cloche" },
];

/** Vrai si l'URL courante appartient à l'entrée de menu donnée. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  const prefixes = item.match ?? [item.href];
  if (item.except?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return false;
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
