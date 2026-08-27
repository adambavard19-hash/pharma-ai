/**
 * État d'installation — module PUR, importable depuis un composant client.
 *
 * La sonde qui interroge la base vit dans `src/server/services/install-state.ts`.
 * Séparer les deux évite qu'un composant client n'entraîne le pilote
 * PostgreSQL dans le bundle navigateur.
 */

export type InstallState =
  | { status: "READY"; userCount: number }
  | { status: "NO_ACCOUNTS" }
  | { status: "NO_SCHEMA" }
  | { status: "NO_DATABASE"; detail: string };

export const INSTALL_HELP: Record<
  Exclude<InstallState["status"], "READY">,
  { title: string; body: string; command: string }
> = {
  NO_ACCOUNTS: {
    title: "Aucun compte n'existe encore",
    body:
      "La base est bien accessible mais ne contient aucun utilisateur : c'est pourquoi la connexion échoue. Installez le jeu de démonstration.",
    command: "npm run db:seed",
  },
  NO_SCHEMA: {
    title: "Les tables n'ont pas encore été créées",
    body: "La base est accessible mais le schéma n'y a pas été appliqué.",
    command: "npm run db:deploy && npm run db:seed",
  },
  NO_DATABASE: {
    title: "La base de données n'est pas joignable",
    body:
      "Vérifiez que PostgreSQL est démarré et que DATABASE_URL est correct dans votre fichier .env.",
    command: "npm run doctor",
  },
};
