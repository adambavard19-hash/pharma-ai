import { BadgePercent, BarChart3, Box, LayoutDashboard, CalendarClock, Flame, FlaskConical, GraduationCap, Handshake, History, Link2, MailCheck, Megaphone, PackageSearch, PlayCircle, ScanLine, Settings, UsersRound, type LucideIcon } from "lucide-react";
import { PERMISSIONS, type Permission } from "@/server/rbac/permissions";
import { PATIENT_APP_LIVE } from "@/core/patient-app/offers";

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
  /**
   * L'entrée qui l'accueille (fondateur, 5 nov. 2026 : un menu plus court) : quand la personne voit cette entrée-là, celle-ci
   * quitte le menu et devient un onglet de sa rubrique (`SECTIONS`). Sinon (un préparateur sans Résultats garde
   * « Historique »), elle reste au menu. La page ne change pas d'adresse.
   */
  mergedInto?: string;
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
    href: "/tableau-de-bord",
    label: "Vue d'ensemble",
    subtitle: "Toute la pharmacie en un écran",
    icon: LayoutDashboard,
    // Le titulaire seul (fondateur, 5 nov. 2026) : le taux de conseil, le classement, le surstock, les dates courtes, les produits
    // manquants et les alertes, sans ouvrir cinq rubriques.
    permission: PERMISSIONS.MANAGEMENT_MENU,
    match: ["/tableau-de-bord"],
    description: "Le taux de conseil, le classement de l'équipe, le surstock, les dates courtes, les produits manquants et ce qui demande votre attention",
    group: "pharmacie",
  },
  {
    href: "/pilotage",
    label: "Résultats",
    subtitle: "Performances et historique des ventes",
    icon: BarChart3,
    // Le titulaire y voit toute l'officine ; le pharmacien adjoint (ANALYTICS_VIEW, fondateur, 23 oct. 2026) seulement SES
    // conseils vendus et sa place dans l'équipe. Le préparateur et l'étudiant ne voient ni l'entrée ni la page. Pour le titulaire,
    // deux pages, une entrée : on arrive sur « Mon équipe » (les compteurs, le classement de chacun et les challenges), qui mène à
    // « Ce que PharmaBoost vous rapporte » (les ventes confirmées), qui y renvoie.
    permission: PERMISSIONS.ANALYTICS_VIEW,
    match: ["/resultats", "/pilotage", "/performance", "/analytics", "/ventes", "/historique"],
    description: "Le taux de conseil, le classement de l'équipe, les challenges, ce que les conseils PharmaBoost ont rapporté et chaque vente terminée",
    group: "pharmacie",
  },
  {
    href: "/historique",
    label: "Historique",
    subtitle: "Les ventes terminées",
    icon: History,
    // Chaque vente terminée au comptoir, une par une : toute l'équipe l'a (fondateur, 15 oct. 2026) — le titulaire voit toutes les
    // ventes, un membre de l'équipe seulement les siennes (la page filtre).
    permission: PERMISSIONS.PRESCRIPTION_CREATE,
    match: ["/historique"],
    mergedInto: "/pilotage",
    description: "Chaque vente terminée au comptoir : les boîtes scannées, les conseils proposés et vendus, le chiffre d'affaires ajouté",
    group: "pharmacie",
  },
  {
    href: "/associations",
    label: "Mes associations",
    subtitle: "Conseils et associations personnalisés",
    icon: Link2,
    // Après « Vue d'ensemble » et « Résultats » (ordre du fondateur, 5 nov. 2026 ; avant : juste après « Au comptoir », 13 oct.).
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
    except: ["/stock/dates-courtes"],
    description: "Ce que vous avez en rayon, la mise à jour du stock, les dates courtes",
    group: "pharmacie",
  },
  {
    href: "/stock/dates-courtes",
    label: "Dates courtes",
    subtitle: "Les boîtes qui approchent de leur date",
    icon: CalendarClock,
    // Dans l'espace de chacun (fondateur, 16 oct. 2026) : toute l'équipe voit la liste (STOCK_VIEW) ; le pharmacien, le
    // préparateur et le titulaire y scannent une boîte (STOCK_ADJUST). À la date, le produit en sort tout seul.
    permission: PERMISSIONS.STOCK_VIEW,
    match: ["/stock/dates-courtes"],
    description: "Scannez une boîte proche de sa date et indiquez combien il y en a : PharmaBoost la propose en priorité au comptoir",
    group: "pharmacie",
  },
  {
    href: "/surstock",
    label: "Surstock",
    subtitle: "Écouler les produits achetés en trop",
    icon: Flame,
    // Toute l'équipe voit les produits à pousser (STOCK_VIEW) ; le titulaire et le pharmacien lancent les campagnes
    // (RECOMMENDATION_RULES_MANAGE, vérifié par l'écran et le serveur). Fondateur, 25 oct. 2026.
    permission: PERMISSIONS.STOCK_VIEW,
    match: ["/surstock"],
    description: "Les produits en surstock passent en premier au comptoir, jusqu'à ce que le stock redescende",
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
  {
    href: "/emails-patients",
    label: "Patients",
    subtitle: "Bilans envoyés et communications",
    icon: MailCheck,
    // Ouverte à l'équipe (consigne du 13 oct. 2026) : un collaborateur voit les bilans de SES ventes ; le titulaire
    // (ANALYTICS_VIEW_TEAM_PERFORMANCE) voit toute l'officine, tous comptoirs confondus.
    permission: PERMISSIONS.PATIENT_EMAILS_VIEW,
    match: ["/emails-patients", "/nouveautes", "/offres-patients"],
    description: "Les bilans envoyés par e-mail depuis le comptoir : quand, par qui, quels produits, envoyé ou non",
    group: "pharmacie",
  },
  {
    href: "/parametres/laboratoires/gammes",
    label: "Laboratoires & partenaires",
    subtitle: "Gammes, challenges et partenaires",
    icon: FlaskConical,
    // Les gammes privilégiées, les challenges et les marques : des choix de titulaire, en entrée directe (retour du
    // fondateur du 13 oct. 2026 : « pas dans les paramètres »). Seul le titulaire a LAB_PROGRAMS_MANAGE.
    permission: PERMISSIONS.LAB_PROGRAMS_MANAGE,
    match: ["/parametres/laboratoires", "/partenaires"],
    description: "Vos gammes privilégiées, les challenges des laboratoires, les marques mises en avant et les laboratoires partenaires",
    group: "pharmacie",
  },
  {
    href: "/equipe",
    label: "Mon équipe",
    subtitle: "Collaborateurs et comptoirs",
    icon: UsersRound,
    // Gérer l'équipe est un acte de titulaire. Un pharmacien adjoint garde
    // TEAM_VIEW ailleurs, mais n'a rien à faire dans cet écran au comptoir.
    permission: PERMISSIONS.TEAM_MANAGE,
    match: ["/equipe"],
    description: "Inviter vos collaborateurs, approuver leurs demandes, voir qui travaille à quel comptoir",
    group: "pharmacie",
  },

  // --- Découvrir
  {
    href: "/prise-en-main",
    label: "Aide & formations",
    icon: PlayCircle,
    permission: PERMISSIONS.TRAINING_VIEW,
    match: ["/prise-en-main", "/formation"],
    description: "Les vidéos pour bien démarrer, puis les formations sur les produits et les gammes",
    group: "decouvrir",
  },
  {
    href: "/formation",
    label: "Formations",
    icon: GraduationCap,
    permission: PERMISSIONS.TRAINING_VIEW,
    match: ["/formation"],
    mergedInto: "/prise-en-main",
    description: "Vidéos et fiches courtes pour bien connaître les produits et les gammes de l'officine",
    group: "decouvrir",
  },
  {
    href: "/partenaires",
    label: "Partenaires",
    icon: Handshake,
    // Titulaires seulement (fondateur, 15 oct. 2026) : l'équipe garde les gammes partenaires sur la page de la vente, pas l'onglet.
    permission: PERMISSIONS.PARTNERS_MANAGE,
    match: ["/partenaires"],
    mergedInto: "/parametres/laboratoires/gammes",
    description: "Les gammes des laboratoires partenaires : présentation, conditions, contact",
    group: "decouvrir",
  },
  // L'appli des patients reste dans l'aperçu (fondateur, 21 oct. 2026) : ses offres aussi, absentes de pharmaboost.app.
  ...(PATIENT_APP_LIVE
    ? [
        {
          href: "/offres-patients",
          label: "Offres patients",
          icon: BadgePercent,
          // Un acte du titulaire : publier une remise pour sa pharmacie (NEWS_MANAGE, rejoué par le serveur). L'équipe n'a pas l'entrée.
          permission: PERMISSIONS.NEWS_MANAGE,
          match: ["/offres-patients"],
          mergedInto: "/emails-patients",
          description: "Les remises de votre pharmacie dans l'appli PharmaBoost : vos patients abonnés reviennent en profiter",
          group: "decouvrir" as const,
        },
      ]
    : []),
  {
    href: "/nouveautes",
    label: "Actualités",
    icon: Megaphone,
    // L'équipe lit l'historique des annonces (NEWS_VIEW) ; écrire aux patients abonnés reste un acte du titulaire
    // (NEWS_MANAGE), boutons masqués à l'écran et refusés par le serveur.
    permission: PERMISSIONS.NEWS_VIEW,
    match: ["/nouveautes"],
    mergedInto: "/emails-patients",
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
export const COLLABORATOR_MENU: readonly string[] = ["/vente/nouvelle", "/pilotage", "/historique", "/associations", "/stock/dates-courtes", "/surstock", "/emails-patients", "/prise-en-main", "/formation", "/nouveautes"];

/**
 * Les entrées que voit une personne : celles dont elle détient la permission, et, hors de l'espace du titulaire
 * (MANAGEMENT_MENU), seulement celles du menu d'un collaborateur. Les permissions des entrées sont choisies pour que le
 * filtre par permission seul donne déjà ce résultat pour chaque rôle (vérifié par les tests) ; la liste blanche le
 * garantit même si une permission de gestion était accordée individuellement.
 */
export function navigationFor(permissions: Iterable<string>): NavItem[] {
  const granted = new Set(permissions);
  const owner = granted.has(PERMISSIONS.MANAGEMENT_MENU);
  return collapseMerged(NAVIGATION.filter((item) => granted.has(item.permission) && (owner || COLLABORATOR_MENU.includes(item.href))));
}

/** Retire du menu les entrées devenues un onglet d'une rubrique que la personne voit déjà (`mergedInto`). */
export function collapseMerged(items: NavItem[]): NavItem[] {
  const shown = new Set(items.map((item) => item.href));
  return items.filter((item) => !item.mergedInto || !shown.has(item.mergedInto));
}

export type SectionKey = "resultats" | "patients" | "aide" | "laboratoires";

/**
 * Les onglets de chaque rubrique regroupée (fondateur, 5 nov. 2026) : une entrée de menu, plusieurs pages. Chaque onglet n'est
 * montré qu'à qui détient sa permission (celles des pages du titulaire, aucun rôle de l'équipe ne les a) ; une rubrique
 * réduite à un seul onglet n'en montre aucun.
 */
export const SECTIONS: Record<SectionKey, { href: string; label: string; permission: Permission }[]> = {
  resultats: [
    { href: "/pilotage", label: "Performances", permission: PERMISSIONS.ANALYTICS_VIEW },
    { href: "/resultats", label: "Ce que PharmaBoost rapporte", permission: PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE },
    { href: "/historique", label: "Historique des ventes", permission: PERMISSIONS.PRESCRIPTION_CREATE },
  ],
  patients: [
    { href: "/emails-patients", label: "Bilans envoyés", permission: PERMISSIONS.PATIENT_EMAILS_VIEW },
    { href: "/nouveautes", label: "Actualités aux patients", permission: PERMISSIONS.NEWS_VIEW },
    ...(PATIENT_APP_LIVE ? [{ href: "/offres-patients", label: "Offres patients", permission: PERMISSIONS.NEWS_MANAGE }] : []),
  ],
  aide: [
    { href: "/prise-en-main", label: "Prise en main", permission: PERMISSIONS.TRAINING_VIEW },
    { href: "/formation", label: "Formations", permission: PERMISSIONS.TRAINING_VIEW },
  ],
  laboratoires: [
    { href: "/parametres/laboratoires/gammes", label: "Gammes & challenges", permission: PERMISSIONS.LAB_PROGRAMS_MANAGE },
    { href: "/partenaires", label: "Partenaires", permission: PERMISSIONS.PARTNERS_MANAGE },
  ],
};

/** Les onglets d'une rubrique que voit une personne (aucun s'il n'en reste qu'un). */
export function sectionTabsFor(section: SectionKey, permissions: Iterable<string>): { href: string; label: string }[] {
  const granted = new Set(permissions);
  const tabs = SECTIONS[section].filter((tab) => granted.has(tab.permission));
  return tabs.length > 1 ? tabs.map(({ href, label }) => ({ href, label })) : [];
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
