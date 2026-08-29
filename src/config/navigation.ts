import {
  Boxes,
  CalendarClock,
  ScanLine,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { PERMISSIONS, type Permission } from "@/server/rbac/permissions";

/**
 * La navigation de Pharma.ai.
 *
 * Cinq entrées, et rien d'autre. L'ancienne navigation décrivait les objets du
 * système (ordonnances, produits, stocks, ventes, analytics…) : c'était la carte
 * d'un ERP. Celle-ci décrit le travail du pharmacien au comptoir, dans l'ordre
 * où il le fait — il reçoit une ordonnance, il a une minute.
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
    href: "/parametres",
    label: "Paramètres",
    icon: Settings,
    permission: PERMISSIONS.PHARMACY_VIEW,
    match: ["/parametres", "/equipe", "/conseils"],
    description: "Officine, équipe, règles de conseil, conformité",
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
    reachableFrom: "les chiffres de l'accueil",
  },
  { href: "/analytics", label: "Analytics détaillées", reachableFrom: "la page Performance" },
  { href: "/ventes", label: "Journal des ventes", reachableFrom: "la page Performance" },
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
