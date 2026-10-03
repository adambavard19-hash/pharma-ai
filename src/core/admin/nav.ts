/**
 * La navigation de la console, en six espaces. Les adresses existantes ne
 * changent pas (aucun lien cassé) : elles sont seulement rangées.
 */
export type AdminNavItem = {
  href: string;
  label: string;
  /** Une phrase, affichée dans le menu déroulant. */
  description: string;
  /** Autres préfixes d'adresse qui rattachent une page à cet élément. */
  matches?: string[];
};

export type AdminNavSpace = {
  key: "overview" | "clients" | "commercial" | "billing" | "communication" | "administration";
  label: string;
  href: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV: AdminNavSpace[] = [
  { key: "overview", label: "Vue d'ensemble", href: "/admin", items: [] },
  {
    key: "clients",
    label: "Clients",
    href: "/admin/pharmacies",
    items: [
      { href: "/admin/pharmacies", label: "Officines clientes", description: "Fiches 360°, inscriptions en cours, création d'officine." },
      { href: "/admin/utilisateurs", label: "Utilisateurs", description: "Les comptes des officines, leurs rôles et dernière connexion." },
      { href: "/admin/activite", label: "Activité", description: "Officines actives, inactives, usage récent." },
      { href: "/admin/acces", label: "Accès", description: "Officines et comptes suspendus, invitations en attente." },
      { href: "/admin/technique", label: "État technique", description: "Connecteurs, postes de comptoir, versions, incidents." },
    ],
  },
  {
    key: "commercial",
    label: "Commercial",
    href: "/admin/pipeline",
    items: [
      { href: "/admin/pipeline", label: "Pipeline", description: "Les dossiers par étape, à déplacer d'une colonne à l'autre." },
      { href: "/admin/prospects", label: "Prospects", description: "Tous les dossiers, filtrables et cherchables.", matches: ["/admin/dossiers"] },
      { href: "/admin/demonstrations", label: "Démonstrations", description: "Démos programmées et réalisées." },
      { href: "/admin/relances-commerciales", label: "Relances commerciales", description: "Les relances prévues, en retard et du jour." },
      { href: "/admin/commerciaux", label: "Commerciaux", description: "L'équipe commerciale, portefeuilles et résultats." },
    ],
  },
  {
    key: "billing",
    label: "Facturation",
    href: "/admin/abonnements",
    items: [
      { href: "/admin/abonnements", label: "Abonnements", description: "Essais, actifs, retards, résiliations demandées." },
      { href: "/admin/abonnements/offres", label: "Offres & tarifs", description: "Le catalogue : il ne s'applique qu'aux nouveaux abonnements." },
      { href: "/admin/contrats", label: "Contrats", description: "Brouillons, envois, signatures, relances." },
      { href: "/admin/paiements", label: "Paiements", description: "Les factures Stripe reçues : payées, échouées, en attente." },
      { href: "/admin/impayes", label: "Impayés", description: "Paiements échoués restés impayés, et leurs relances." },
      { href: "/admin/resiliations", label: "Résiliations", description: "Demandes reçues, en traitement, confirmées, terminées." },
    ],
  },
  {
    key: "communication",
    label: "Communication",
    href: "/admin/communications",
    items: [
      { href: "/admin/communications", label: "Historique", description: "Tous les e-mails, relances et notifications, filtrables." },
      { href: "/admin/emails/modeles", label: "Modèles d'e-mails", description: "Les textes des relances et messages, avec aperçu." },
      { href: "/admin/relances", label: "Relances automatiques", description: "Scénarios d'essai, de contrat, de paiement, de résiliation." },
      { href: "/admin/notifications", label: "Notifications", description: "Les alertes de la plateforme pour l'équipe." },
    ],
  },
  {
    key: "administration",
    label: "Administration",
    href: "/admin/societe",
    items: [
      { href: "/admin/societe", label: "Société exploitante", description: "La partie signataire des contrats." },
      { href: "/admin/equipe", label: "Équipe PharmaBoost", description: "Les administrateurs de la console." },
      { href: "/admin/partenaires", label: "Partenaires", description: "Candidatures, marques, catalogues, commandes." },
      { href: "/admin/formations", label: "Formations", description: "Les formations proposées aux officines." },
      { href: "/admin/challenges", label: "Challenges", description: "Challenges laboratoires, en agrégats." },
      { href: "/admin/parametres", label: "Paramètres", description: "Messagerie, paiement, signature, tâches planifiées." },
      { href: "/admin/journal", label: "Journal d'audit", description: "Qui a fait quoi, quand, avec l'avant et l'après." },
    ],
  },
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** L'élément le plus précis qui correspond à l'adresse (« Offres & tarifs » plutôt qu'« Abonnements »). */
export function activeNavItem(pathname: string): { space: AdminNavSpace; item: AdminNavItem | null } {
  if (pathname === "/admin") return { space: ADMIN_NAV[0], item: null };
  let best: { space: AdminNavSpace; item: AdminNavItem; length: number } | null = null;
  for (const space of ADMIN_NAV) {
    for (const item of space.items) {
      for (const prefix of [item.href, ...(item.matches ?? [])]) {
        if (matchesPrefix(pathname, prefix) && (!best || prefix.length > best.length)) best = { space, item, length: prefix.length };
      }
    }
  }
  return best ? { space: best.space, item: best.item } : { space: ADMIN_NAV[0], item: null };
}
