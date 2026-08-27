import {
  BarChart3,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  Sparkles,
  Users,
  UsersRound,
} from "lucide-react";
import { PERMISSIONS, type Permission } from "@/server/rbac/permissions";

export type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission: Permission;
  /** Correspondance sur le préfixe pour l'état actif. */
  match?: string;
  description: string;
};

export type NavGroup = {
  id: string;
  label: string | null;
  items: NavItem[];
};

export const NAVIGATION: NavGroup[] = [
  {
    id: "main",
    label: null,
    items: [
      {
        href: "/tableau-de-bord",
        label: "Vue d'ensemble",
        icon: LayoutDashboard,
        permission: PERMISSIONS.PHARMACY_VIEW,
        description: "L'activité de l'officine en un coup d'œil",
      },
    ],
  },
  {
    id: "comptoir",
    label: "Comptoir",
    items: [
      {
        href: "/patients",
        label: "Patients",
        icon: Users,
        permission: PERMISSIONS.PATIENT_VIEW,
        description: "Fiches patients et historique",
      },
      {
        href: "/ordonnances",
        label: "Ordonnances",
        icon: ClipboardList,
        permission: PERMISSIONS.PRESCRIPTION_VIEW,
        description: "Ordonnances importées et analysées",
      },
      {
        href: "/conseils",
        label: "Conseils IA",
        icon: Sparkles,
        permission: PERMISSIONS.RECOMMENDATION_VIEW,
        description: "Recommandations et règles de l'officine",
      },
    ],
  },
  {
    id: "officine",
    label: "Officine",
    items: [
      {
        href: "/produits",
        label: "Produits",
        icon: Package,
        permission: PERMISSIONS.PRODUCT_VIEW,
        description: "Catalogue de conseil et parapharmacie",
      },
      {
        href: "/stocks",
        label: "Stocks",
        icon: Boxes,
        permission: PERMISSIONS.STOCK_VIEW,
        description: "Disponibilité et alertes",
      },
      {
        href: "/ventes",
        label: "Ventes",
        icon: Receipt,
        permission: PERMISSIONS.SALE_VIEW,
        description: "Ventes complémentaires enregistrées",
      },
    ],
  },
  {
    id: "pilotage",
    label: "Pilotage",
    items: [
      {
        href: "/analytics",
        label: "Analytics",
        icon: BarChart3,
        permission: PERMISSIONS.ANALYTICS_VIEW,
        description: "Performance et chiffre d'affaires additionnel",
      },
      {
        href: "/equipe",
        label: "Équipe",
        icon: UsersRound,
        permission: PERMISSIONS.TEAM_VIEW,
        description: "Collaborateurs et permissions",
      },
      {
        href: "/parametres",
        label: "Paramètres",
        icon: Settings,
        permission: PERMISSIONS.PHARMACY_VIEW,
        description: "Officine, moteur Pharma.ai, conformité",
      },
    ],
  },
];

export function flatNavItems(): NavItem[] {
  return NAVIGATION.flatMap((group) => group.items);
}
