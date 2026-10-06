/**
 * L'officine de démonstration commerciale : qui elle est, et comment on la reconnaît.
 *
 * Tout ce qui est écrit ici est FICTIF. Les adresses sont en `.test` (réservé
 * par la RFC 2606 : aucun serveur ne les résout), les patients et les marques
 * n'existent pas. L'officine est une vraie ligne de la base, marquée
 * `isDemo`, dans son propre groupe : elle n'est jamais mêlée à une vraie
 * officine, et rien de ce qu'elle fait ne sort de l'application.
 */

/** L'identifiant stable de l'officine : c'est lui, avec `isDemo`, qui la désigne. */
export const DEMO_PHARMACY_SLUG = "pharmacie-demo-pharmaboost";
export const DEMO_ORGANIZATION_SLUG = "groupe-demo-pharmaboost";

export const DEMO_PHARMACY = {
  name: "Pharmacie des Lilas",
  city: "Lyon",
  postalCode: "69003",
  addressLine1: "18 rue des Lilas",
  phone: "04 00 00 00 00",
  email: "contact@pharmacie-des-lilas.test",
  brandColor: "#0F766E",
} as const;

export type DemoMember = { key: "owner" | "pharmacist" | "technician" | "student"; email: string; firstName: string; lastName: string; role: "OWNER" | "PHARMACIST" | "TECHNICIAN" | "STUDENT" };

/** L'équipe fictive. Le premier compte, le titulaire, est celui du rendez-vous. */
export const DEMO_TEAM: readonly DemoMember[] = [
  { key: "owner", email: "demo@pharmaboost.test", firstName: "Camille", lastName: "Moreau", role: "OWNER" },
  { key: "pharmacist", email: "adjoint@pharmaboost.test", firstName: "Julien", lastName: "Bernard", role: "PHARMACIST" },
  { key: "technician", email: "preparatrice@pharmaboost.test", firstName: "Sarah", lastName: "Lambert", role: "TECHNICIAN" },
  { key: "student", email: "preparateur@pharmaboost.test", firstName: "Lucas", lastName: "Petit", role: "TECHNICIAN" },
];

export const DEMO_LOGIN_EMAIL = DEMO_TEAM[0].email;

/** Le mot de passe de développement. En production, il est tiré au hasard et donné une fois. */
export const DEMO_DEV_PASSWORD = "Demo2026!Pharma";

/** Le poste de caisse simulé : c'est lui que « Simuler une délivrance » fait « bipper ». */
export const DEMO_POST = { hostname: "poste-demo", label: "Comptoir 1 (démo)" } as const;

export const DEMO_MODE_LABEL = "Mode démo";
export const DEMO_MODE_HINT = "Données fictives. Aucun e-mail n'est envoyé, aucune commande n'est passée, aucun service externe n'est appelé.";

/** Vrai pour l'officine de démonstration commerciale (et elle seule). */
export function isCommercialDemoPharmacy(pharmacy: { slug: string; isDemo: boolean }): boolean {
  return pharmacy.isDemo && pharmacy.slug === DEMO_PHARMACY_SLUG;
}
