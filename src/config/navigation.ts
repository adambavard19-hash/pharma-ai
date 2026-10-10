import {
  BarChart3,
  Box,
  Boxes,
  CalendarCheck,
  GraduationCap,
  Handshake,
  Link2,
  Megaphone,
  Plug,
  ScanLine,
  ScrollText,
  Settings,
  Users,
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
 * Quatre groupes, dans l'ordre d'une journée : AU COMPTOIR (le patient devant
 * soi), MA PHARMACIE (le stock, ce que ça rapporte, l'assortiment, l'équipe),
 * DÉCOUVRIR (se former, les partenaires, les actualités) et CONFIGURATION (les
 * connexions, les paramètres). Seuls les intitulés et les regroupements ont
 * changé : aucune page n'a été retirée.
 *
 * Elle se plie au rôle, et c'est une décision de produit autant que de droits :
 * un collaborateur voit peu d'entrées — vendre, patients, suivis, stock — et
 * rien de la gestion. Le titulaire voit les mêmes, plus ses vues de gestion. Un
 * groupe sans entrée visible n'est pas affiché. Personne n'a à traverser des
 * écrans qui ne le concernent pas pour atteindre le sien.
 *
 * Tout ce qui a quitté ce menu reste atteignable (cf. `OFF_MENU_DESTINATIONS`) :
 * retirer du menu n'est pas supprimer. Ce qui disparaît, c'est la charge
 * mentale, pas la fonctionnalité.
 */

export type NavGroupKey = "comptoir" | "pharmacie" | "decouvrir" | "configuration";

/** Les groupes du menu, dans l'ordre où ils s'affichent. */
export const NAV_GROUPS: { key: NavGroupKey; label: string }[] = [
  { key: "comptoir", label: "Au comptoir" },
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
    label: "Nouvelle vente",
    icon: ScanLine,
    permission: PERMISSIONS.PRESCRIPTION_CREATE,
    match: ["/vente", "/ordonnances"],
    description: "Scanner une ordonnance et conseiller le patient",
    primary: true,
  },

  // --- Au comptoir
  {
    href: "/patients",
    label: "Patients",
    icon: Users,
    permission: PERMISSIONS.PATIENT_VIEW,
    match: ["/patients"],
    description: "Fiches, historique et consentements",
    group: "comptoir",
  },
  {
    href: "/suivis",
    label: "Suivis patients",
    icon: CalendarCheck,
    permission: PERMISSIONS.FOLLOWUP_VIEW,
    match: ["/suivis"],
    description: "Les patients à recontacter aujourd'hui",
    group: "comptoir",
  },
  {
    href: "/reglementation",
    label: "Réglementation",
    icon: ScrollText,
    permission: PERMISSIONS.PRESCRIPTION_VIEW,
    description: "Ordonnances d'exception, sécurisées, dernières évolutions",
    group: "comptoir",
  },

  // --- Ma pharmacie
  {
    href: "/stock",
    label: "Mon stock",
    icon: Box,
    permission: PERMISSIONS.STOCK_VIEW,
    match: ["/stock", "/stocks", "/produits"],
    description: "Ce qui est en rayon — et ce qui manque",
    group: "pharmacie",
  },
  {
    href: "/pilotage",
    label: "Performances",
    icon: BarChart3,
    // Même permission que le pilotage par collaborateur : la valeur chiffrée reste une vue de titulaire.
    // L'équipe au comptoir ne voit ni l'entrée ni la page. Deux pages, une entrée : on arrive sur « Mon équipe » (le classement de
    // chacun et les challenges, simple), qui mène à « Ce que PharmaBoost vous rapporte » (les ventes confirmées), qui y renvoie.
    permission: PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE,
    match: ["/resultats", "/pilotage", "/performance", "/analytics", "/ventes"],
    description: "Le classement de l'équipe, les challenges, et ce que les conseils ont rapporté",
    group: "pharmacie",
  },
  {
    href: "/assortiment",
    label: "Mon assortiment",
    icon: Boxes,
    // Réservé au titulaire, comme les partenaires : les besoins que le stock n'a pas couverts
    // ne remontent pas de l'équipe au comptoir, le titulaire les consulte ici.
    permission: PERMISSIONS.PARTNERS_MANAGE,
    match: ["/assortiment"],
    description: "Les besoins que votre stock n'a pas couverts, et ce qui existe chez nos partenaires",
    group: "pharmacie",
  },
  {
    href: "/associations",
    label: "Mes associations",
    icon: Link2,
    // Décider quel produit en appelle quel autre est un acte de pharmacien (ou de titulaire) : la même permission que
    // les règles de conseil de l'officine. L'équipe au comptoir voit le résultat sur la carte, pas l'écran.
    permission: PERMISSIONS.RECOMMENDATION_RULES_MANAGE,
    match: ["/associations"],
    description: "Quand un produit est vendu, quel autre produit PharmaBoost propose avec",
    group: "pharmacie",
  },
  {
    href: "/equipe",
    label: "Mon équipe",
    icon: UsersRound,
    // Gérer l'équipe est un acte de titulaire. Un pharmacien adjoint garde
    // TEAM_VIEW ailleurs, mais n'a rien à faire dans cet écran au comptoir.
    permission: PERMISSIONS.TEAM_MANAGE,
    match: ["/equipe"],
    description: "Comptes, accès et rôles de vos collaborateurs",
    group: "pharmacie",
  },

  // --- Découvrir
  {
    href: "/formation",
    label: "Formations",
    icon: GraduationCap,
    permission: PERMISSIONS.TRAINING_VIEW,
    match: ["/formation"],
    description: "Les formations utiles sur les produits et les gammes de l'officine",
    group: "decouvrir",
  },
  {
    href: "/partenaires",
    label: "Partenaires",
    icon: Handshake,
    // Décision d'achat : l'entrée de menu est celle du titulaire. L'équipe
    // au comptoir atteint une gamme depuis la carte « À découvrir ».
    permission: PERMISSIONS.PARTNERS_MANAGE,
    match: ["/partenaires"],
    description: "Les gammes partenaires disponibles pour l'officine",
    group: "decouvrir",
  },
  {
    href: "/nouveautes",
    label: "Actualités",
    icon: Megaphone,
    // Écrire aux patients abonnés est un acte du titulaire, comme Partenaires :
    // l'entrée n'apparaît pas au comptoir.
    permission: PERMISSIONS.NEWS_MANAGE,
    match: ["/nouveautes"],
    description: "Prévenir vos patients abonnés des nouvelles gammes",
    group: "decouvrir",
  },

  // --- Configuration
  {
    href: "/connexion",
    label: "Mes connexions",
    icon: Plug,
    permission: PERMISSIONS.PRODUCT_IMPORT,
    match: ["/connexion", "/installation"],
    description: "Installer PharmaBoost sur vos comptoirs, envoyer votre stock, connecter votre robot",
    group: "configuration",
  },
  {
    href: "/parametres",
    label: "Paramètres",
    icon: Settings,
    // SETTINGS_MANAGE et non PHARMACY_VIEW : régler l'officine n'est pas
    // consulter l'officine. Les réglages personnels d'un collaborateur vivent
    // dans « Mon compte », depuis le menu utilisateur.
    permission: PERMISSIONS.SETTINGS_MANAGE,
    match: ["/parametres", "/conseils"],
    description: "Officine, règles de conseil, conformité",
    group: "configuration",
  },
];

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
 * L'équipe et les règles de conseil n'y figurent pas : elles sont devenues des
 * onglets de Paramètres, donc atteignables depuis le menu.
 */
export const OFF_MENU_DESTINATIONS: {
  href: string;
  label: string;
  reachableFrom: string;
}[] = [
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
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
