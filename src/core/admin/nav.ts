import { PATIENT_APP_LIVE } from "@/core/patient-app/offers";

/**
 * La navigation de la console, en CINQ rubriques.
 *
 * Accueil · Officines · Commercial · Finances · Gestion. Chaque rubrique se déplie en groupes (les onglets) et chaque groupe
 * peut contenir quelques vues (les pastilles). Aucune adresse ne change : ce qui était un menu est devenu un onglet, et rien
 * n'a été supprimé — une page est toujours à l'adresse où elle était, et son onglet s'allume.
 */
export type AdminNavItem = {
  href: string;
  label: string;
  /** Une phrase qui dit à quoi sert la vue (aide à la lecture, recherche). */
  description: string;
  /** Autres préfixes d'adresse qui rattachent une page à cette vue. */
  matches?: string[];
};

/**
 * Un onglet : une seule vue (un lien) ou plusieurs vues liées, affichées en pastilles sous l'onglet. La première vue est
 * celle où l'onglet mène.
 */
export type AdminNavGroup = {
  key: string;
  label: string;
  items: AdminNavItem[];
  /** Les vues se choisissent dans l'en-tête de la page (un espace de travail à lui) : pas de pastilles sous l'onglet. */
  ownViewSwitcher?: boolean;
};

export type AdminNavSpaceKey = "home" | "pharmacies" | "commercial" | "finance" | "management";

export type AdminNavSpace = {
  key: AdminNavSpaceKey;
  label: string;
  href: string;
  /** Les adresses sans onglet qui appartiennent à cette rubrique (la cloche des notifications, par exemple). */
  matches?: string[];
  groups: AdminNavGroup[];
};

export const ADMIN_NAV: AdminNavSpace[] = [
  { key: "home", label: "Accueil", href: "/admin", matches: ["/admin/notifications", "/admin/carnet"], groups: [] },
  {
    key: "pharmacies",
    label: "Officines",
    href: "/admin/pharmacies",
    groups: [
      {
        key: "officines",
        label: "Mes officines",
        items: [
          {
            href: "/admin/pharmacies",
            label: "Officines clientes",
            description: "Chaque pharmacie a sa fiche : équipe, postes, stock, abonnement, contrats, échanges, notes, performance.",
            // Les anciennes listes transversales restent à leur adresse ; leur contenu est dans chaque fiche.
            matches: ["/admin/utilisateurs", "/admin/acces", "/admin/technique", "/admin/depots-stock"],
          },
        ],
      },
      { key: "support", label: "Support", items: [{ href: "/admin/support", label: "Support", description: "Les questions posées par les officines : lire, répondre, clore." }] },
      {
        key: "performance",
        label: "Performance",
        items: [
          { href: "/admin/performance", label: "Performance", description: "La valeur générée par PharmaBoost, officine par officine : qui en tire beaucoup, qui a besoin d'accompagnement." },
          { href: "/admin/activite", label: "Activité", description: "Officines actives, inactives, usage récent." },
        ],
      },
    ],
  },
  {
    key: "commercial",
    label: "Commercial",
    href: "/admin/pipeline",
    groups: [
      {
        key: "prospects",
        label: "Suivi commercial",
        ownViewSwitcher: true,
        items: [
          { href: "/admin/pipeline", label: "Pipeline", description: "Les dossiers par étape, à déplacer d'une colonne à l'autre." },
          { href: "/admin/prospects", label: "Liste", description: "Tous les dossiers, filtrables et cherchables.", matches: ["/admin/dossiers"] },
          { href: "/admin/demonstrations", label: "Démonstrations", description: "Démos programmées et réalisées." },
          { href: "/admin/relances-commerciales", label: "Relances", description: "Les relances prévues, en retard et du jour." },
          ...(PATIENT_APP_LIVE ? [{ href: "/admin/pharmacies-reclamees", label: "Pharmacies réclamées", description: "Les pharmacies hors réseau que les patients de l'appli veulent voir rejoindre PharmaBoost : les plus réclamées d'abord." }] : []),
        ],
      },
      {
        key: "equipe-commerciale",
        label: "Équipe commerciale",
        items: [
          { href: "/admin/commerciaux", label: "Commerciaux", description: "L'équipe commerciale, portefeuilles et résultats." },
          { href: "/admin/candidatures-commerciales", label: "Candidatures", description: "Les personnes qui ont postulé au programme d'affiliation : à contacter, entretien, acceptation." },
          { href: "/admin/directeur-commercial", label: "Directeur commercial", description: "Le compte qui gère l'équipe commerciale depuis son propre espace." },
        ],
      },
      {
        key: "site-internet",
        label: "Site internet",
        items: [
          { href: "/admin/site-internet", label: "Réponses des visiteurs", description: "Le compteur des visiteurs et ce que la bulle « Vous êtes plutôt… ? » a recueilli : profils, intérêts, coordonnées." },
          { href: "/admin/visiteurs", label: "Villes des visiteurs", description: "D'où viennent les visiteurs du site, ville par ville." },
        ],
      },
    ],
  },
  {
    key: "finance",
    label: "Finances",
    href: "/admin/abonnements",
    groups: [
      {
        key: "abonnements",
        label: "Abonnements",
        items: [
          { href: "/admin/abonnements", label: "Abonnements", description: "Essais, actifs, retards, résiliations demandées." },
          { href: "/admin/abonnements/offres", label: "Offres & tarifs", description: "Le catalogue : il ne s'applique qu'aux nouveaux abonnements." },
        ],
      },
      { key: "contrats", label: "Contrats", items: [{ href: "/admin/contrats", label: "Contrats", description: "Brouillons, envois, signatures, relances." }] },
      {
        key: "paiements",
        label: "Paiements",
        // Les impayés sont une vue de la page « Paiements » (`?vue=impayes`) ; l'ancienne adresse y redirige.
        items: [{ href: "/admin/paiements", label: "Paiements", description: "Les factures Stripe reçues, et les impayés à relancer.", matches: ["/admin/impayes"] }],
      },
      { key: "resiliations", label: "Résiliations", items: [{ href: "/admin/resiliations", label: "Résiliations", description: "Demandes reçues, en traitement, confirmées, terminées." }] },
    ],
  },
  {
    key: "management",
    label: "Gestion",
    href: "/admin/conseils",
    groups: [
      {
        key: "conseils",
        label: "Conseils",
        items: [
          {
            href: "/admin/conseils",
            label: "Conseils",
            description: "Tout ce que PharmaBoost propose au comptoir quand un médicament ou un produit est scanné — règles, conseils déclenchés par un produit, suggestions du robot, ce qu'il ne faut pas associer : valider, modifier, supprimer, ajouter, pour toutes les pharmacies.",
            // « Suggestions du robot » a rejoint « Conseils » : l'ancienne adresse y redirige (filtre « Proposés par le robot »).
            matches: ["/admin/suggestions-robot"],
          },
          { href: "/admin/conseils/routines", label: "Routines", description: "Plusieurs produits proposés ensemble au comptoir (nettoyer, hydrater, traiter…), par médicament et par thème, une gamme par étape." },
          { href: "/admin/conseils/priorites", label: "Priorités", description: "Pour chaque famille de médicaments, l'ordre des conseils au comptoir — règle 1, règle 2, règle 3 — choisi par vous, pour toutes les pharmacies." },
          { href: "/admin/conseils/modules", label: "Modules", description: "Phytothérapie, aromathérapie, médicaments conseil : ce que chaque pharmacie choisit de mettre en avant au comptoir." },
          { href: "/admin/conseils/questions", label: "Questions du comptoir", description: "Les questions, les réponses du patient et le conseil à dire, sous chaque produit conseil de la bannière : modifier pour toutes les pharmacies." },
          { href: "/admin/connaissances", label: "Base de connaissances", description: "Déposer des documents et des notes : le modèle les lit et propose des conseils, vous acceptez ou refusez." },
          { href: "/admin/a-connaitre", label: "Produits à connaître", description: "Ce que PharmaBoost n'a pas su ranger dans le stock des pharmacies : vous répondez une fois, c'est appris pour toutes." },
          { href: "/admin/validation-clinique", label: "Validation clinique", description: "Les règles jugées « pas adaptées à ce patient » au comptoir, comptées par officine : relire, confirmer ou modifier la règle." },
        ],
      },
      {
        key: "communication",
        label: "Communication",
        ownViewSwitcher: true,
        items: [
          { href: "/admin/campagnes", label: "Campagnes", description: "Offres bonus, parrainage, invitations des partenaires : envoi immédiat ou programmé." },
          { href: "/admin/communications", label: "Historique", description: "Tous les e-mails, relances et notifications, filtrables." },
          { href: "/admin/emails/modeles", label: "Modèles d'e-mails", description: "Les textes des relances et messages, avec aperçu.", matches: ["/admin/emails"] },
          { href: "/admin/relances", label: "Relances automatiques", description: "Scénarios d'essai, de contrat, de paiement, de résiliation." },
        ],
      },
      {
        key: "partenaires",
        label: "Partenaires",
        items: [
          { href: "/admin/partenaires", label: "Partenaires", description: "Candidatures, marques, catalogues, commandes." },
          ...(PATIENT_APP_LIVE ? [{ href: "/admin/offres-laboratoires", label: "Offres laboratoires", description: "Les offres de l'appli des patients payées par les laboratoires, dans tout le réseau : boîtes vendues et montant à facturer." }] : []),
        ],
      },
      {
        key: "formations",
        label: "Formations & challenges",
        items: [
          { href: "/admin/formations", label: "Formations", description: "Les formations proposées aux officines." },
          { href: "/admin/academie", label: "Académie", description: "PharmaBoost Mobile : micro-vidéos, quiz et parcours, avec relecture et mise en ligne." },
          { href: "/admin/challenges", label: "Challenges", description: "Challenges laboratoires, en agrégats." },
        ],
      },
      {
        key: "equipe",
        label: "Équipe & société",
        items: [
          { href: "/admin/equipe", label: "Équipe PharmaBoost", description: "Les administrateurs de la console." },
          { href: "/admin/societe", label: "Société exploitante", description: "La partie signataire des contrats." },
        ],
      },
      {
        key: "parametres",
        label: "Paramètres",
        items: [
          { href: "/admin/parametres", label: "Paramètres", description: "Messagerie, paiement, signature, tâches planifiées." },
          { href: "/admin/journal", label: "Journal d'audit", description: "Qui a fait quoi, quand, avec l'avant et l'après." },
        ],
      },
    ],
  },
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export type ActiveNav = { space: AdminNavSpace; group: AdminNavGroup | null; item: AdminNavItem | null };

/** Toutes les vues de la console, à plat, avec leur rubrique et leur onglet. */
export function allNavItems(): { space: AdminNavSpace; group: AdminNavGroup; item: AdminNavItem }[] {
  return ADMIN_NAV.flatMap((space) => space.groups.flatMap((group) => group.items.map((item) => ({ space, group, item }))));
}

/**
 * La vue la plus précise qui correspond à l'adresse (« Offres & tarifs » plutôt qu'« Abonnements »). Une adresse inconnue
 * ou l'accueil tombe sur l'Accueil.
 */
export function activeNavItem(pathname: string): ActiveNav {
  let best: (ActiveNav & { group: AdminNavGroup; item: AdminNavItem; length: number }) | null = null;
  for (const { space, group, item } of allNavItems()) {
    for (const prefix of [item.href, ...(item.matches ?? [])]) {
      if (matchesPrefix(pathname, prefix) && (!best || prefix.length > best.length)) best = { space, group, item, length: prefix.length };
    }
  }
  if (best) return { space: best.space, group: best.group, item: best.item };
  const home = ADMIN_NAV[0];
  const attached = ADMIN_NAV.find((space) => (space.matches ?? []).some((prefix) => matchesPrefix(pathname, prefix)));
  return { space: attached ?? home, group: null, item: null };
}
