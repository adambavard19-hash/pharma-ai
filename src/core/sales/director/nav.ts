/**
 * Le menu de l'espace du directeur commercial : six rubriques, toujours les
 * mêmes. Pur et sans icône (celles-ci vivent dans le composant), pour que la
 * liste serve aussi aux tests et aux autres écrans.
 */
export type DirectorNavKey = "tableau-de-bord" | "commerciaux" | "candidatures" | "commissions" | "factures" | "challenges";

export type DirectorNavItem = {
  key: DirectorNavKey;
  href: string;
  label: string;
  /** Une phrase, affichée sous le libellé dans le menu replié du téléphone. */
  description: string;
  /** Vrai : seule l'adresse exacte rattache la page à cette rubrique (le tableau de bord est la racine de l'espace). */
  exact?: boolean;
};

export const DIRECTOR_HOME = "/directeur";
export const DIRECTOR_LOGIN = "/directeur/connexion";

export const DIRECTOR_NAV: readonly DirectorNavItem[] = [
  { key: "tableau-de-bord", href: DIRECTOR_HOME, label: "Tableau de bord", description: "L'essentiel de l'équipe, en un coup d'œil.", exact: true },
  { key: "commerciaux", href: "/directeur/commerciaux", label: "Commerciaux", description: "L'équipe : ajouter, suivre, réaffecter les dossiers." },
  { key: "candidatures", href: "/directeur/candidatures", label: "Candidatures", description: "Les personnes qui veulent rejoindre l'équipe." },
  { key: "commissions", href: "/directeur/commissions", label: "Commissions", description: "Valider et payer les commissions." },
  { key: "factures", href: "/directeur/factures", label: "Factures", description: "Les factures reçues des commerciaux." },
  { key: "challenges", href: "/directeur/challenges", label: "Challenges", description: "Les objectifs de l'équipe sur une période." },
];

/** `/directeur/commerciaux/?q=a#b` → `/directeur/commerciaux` : seule la partie « chemin » compte. */
function cleanPath(pathname: string): string {
  const path = pathname.split(/[?#]/)[0] ?? "";
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/** La page courante appartient-elle à cette rubrique ? Le préfixe s'arrête à une frontière de segment. */
export function isDirectorNavActive(item: DirectorNavItem, pathname: string): boolean {
  const path = cleanPath(pathname);
  if (item.exact) return path === item.href;
  return path === item.href || path.startsWith(`${item.href}/`);
}

/** La rubrique de la page courante, ou `null` hors du menu (une page d'erreur, par exemple). */
export function activeDirectorNavItem(pathname: string): DirectorNavItem | null {
  return DIRECTOR_NAV.find((item) => isDirectorNavActive(item, pathname)) ?? null;
}
