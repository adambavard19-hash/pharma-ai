import {
  Boxes,
  CalendarClock,
  LineChart,
  ScanLine,
  Settings,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { PERMISSIONS, type Permission } from "@/server/rbac/permissions";

/**
 * La navigation de Pharma.ai.
 *
 * Elle décrit le travail au comptoir, dans l'ordre où il se fait — on reçoit
 * une ordonnance, on a une minute. L'ancienne navigation décrivait les objets
 * du système (ordonnances, produits, stocks, ventes, analytics…) : c'était la
 * carte d'un ERP.
 *
 * Elle se plie au rôle, et c'est une décision de produit autant que de droits :
 * un collaborateur voit QUATRE entrées — vendre, patients, stock, suivis — et
 * rien de la gestion. Le titulaire voit les mêmes, plus Pilotage, Équipe et
 * Paramètres. Personne n'a à traverser des écrans qui ne le concernent pas
 * pour atteindre le sien.
 *
 * Tout ce qui a quitté ce menu reste atteignable (cf. `OFF_MENU_DESTINATIONS`) :
 * retirer du menu n'est pas supprimer. Ce qui disparaît, c'est la charge
 * mentale, pas la fonctionnalité.
 */

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
   * L'action principale de l'application. Rendue comme un bouton plein en tête
   * de la barre latérale, pas comme un lien parmi d'autres.
   */
  primary?: boolean;
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
  {
    href: "/patients",
    label: "Patients",
    icon: Users,
    permission: PERMISSIONS.PATIENT_VIEW,
    match: ["/patients"],
    description: "Fiches, historique et consentements",
  },
  {
    href: "/stock",
    label: "Stock",
    icon: Boxes,
    permission: PERMISSIONS.STOCK_VIEW,
    match: ["/stock", "/stocks", "/produits"],
    description: "Ce qui est en rayon — et ce qui manque",
  },
  {
    href: "/suivis",
    label: "Suivis",
    icon: CalendarClock,
    permission: PERMISSIONS.FOLLOWUP_VIEW,
    match: ["/suivis"],
    description: "Les patients à recontacter aujourd'hui",
  },
  {
    href: "/equipe",
    label: "Équipe",
    icon: UsersRound,
    // Gérer l'équipe est un acte de titulaire. Un pharmacien adjoint garde
    // TEAM_VIEW ailleurs, mais n'a rien à faire dans cet écran au comptoir.
    permission: PERMISSIONS.TEAM_MANAGE,
    match: ["/equipe"],
    description: "Comptes, accès et rôles de vos collaborateurs",
  },
  {
    href: "/pilotage",
    label: "Pilotage",
    icon: LineChart,
    // Permission de titulaire : un pharmacien au comptoir ne voit pas cette
    // entrée, et l'écran de vente ne montre jamais ces chiffres. La séparation
    // est le point : un conseil n'est pas un objectif commercial.
    permission: PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE,
    match: ["/pilotage", "/performance", "/analytics", "/ventes"],
    description: "Ce que les conseils ont produit, par collaborateur",
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
  },
];

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
