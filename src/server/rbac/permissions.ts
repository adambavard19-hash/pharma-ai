/**
 * Contrôle d'accès par permissions (RBAC).
 *
 * Les écrans et les actions serveur ne testent JAMAIS un rôle directement mais
 * une permission. Ajouter un rôle revient donc à déclarer une nouvelle entrée
 * dans `ROLE_PERMISSIONS`, sans toucher au reste de l'application.
 *
 * Le titulaire peut par ailleurs accorder ou retirer des permissions
 * individuellement (`Membership.grantedPermissions` / `revokedPermissions`),
 * ce qui couvre le besoin « permissions du préparateur configurables ».
 */

export const PERMISSIONS = {
  // Officine & paramètres
  PHARMACY_VIEW: "pharmacy:view",
  PHARMACY_MANAGE: "pharmacy:manage",
  SETTINGS_MANAGE: "settings:manage",

  // Équipe
  TEAM_VIEW: "team:view",
  TEAM_MANAGE: "team:manage",

  // Patients
  PATIENT_VIEW: "patient:view",
  PATIENT_CREATE: "patient:create",
  PATIENT_UPDATE: "patient:update",
  PATIENT_DELETE: "patient:delete",
  /// Accès aux données de santé (profil médical) — distinct de la fiche CRM.
  PATIENT_HEALTH_VIEW: "patient:health:view",
  PATIENT_HEALTH_UPDATE: "patient:health:update",
  PATIENT_EXPORT: "patient:export",

  // Catalogue & stock
  PRODUCT_VIEW: "product:view",
  PRODUCT_MANAGE: "product:manage",
  PRODUCT_IMPORT: "product:import",
  STOCK_VIEW: "stock:view",
  STOCK_ADJUST: "stock:adjust",

  // Ordonnances
  PRESCRIPTION_VIEW: "prescription:view",
  PRESCRIPTION_CREATE: "prescription:create",
  /// Confirmer les données extraites — acte professionnel.
  PRESCRIPTION_VERIFY: "prescription:verify",
  PRESCRIPTION_DELETE: "prescription:delete",

  // Conseils & recommandations
  RECOMMENDATION_VIEW: "recommendation:view",
  /// Accepter / modifier / refuser un conseil — réservé aux professionnels.
  RECOMMENDATION_DECIDE: "recommendation:decide",
  RECOMMENDATION_RULES_MANAGE: "recommendation:rules:manage",

  // Documents patient
  DOCUMENT_GENERATE: "document:generate",
  DOCUMENT_SEND: "document:send",

  // Ventes
  SALE_VIEW: "sale:view",
  SALE_CREATE: "sale:create",

  // Analytics
  ANALYTICS_VIEW: "analytics:view",
  /// Statistiques nominatives par collaborateur — encadrées (cf. docs/RGPD.md).
  ANALYTICS_VIEW_TEAM_PERFORMANCE: "analytics:team-performance:view",
  ANALYTICS_EXPORT: "analytics:export",

  // Journal d'audit
  AUDIT_VIEW: "audit:view",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

export type Role = "OWNER" | "PHARMACIST" | "TECHNICIAN" | "STUDENT" | "VIEWER";

const PHARMACIST_PERMISSIONS: Permission[] = [
  PERMISSIONS.PHARMACY_VIEW,
  PERMISSIONS.TEAM_VIEW,
  PERMISSIONS.PATIENT_VIEW,
  PERMISSIONS.PATIENT_CREATE,
  PERMISSIONS.PATIENT_UPDATE,
  PERMISSIONS.PATIENT_HEALTH_VIEW,
  PERMISSIONS.PATIENT_HEALTH_UPDATE,
  PERMISSIONS.PRODUCT_VIEW,
  PERMISSIONS.STOCK_VIEW,
  PERMISSIONS.STOCK_ADJUST,
  PERMISSIONS.PRESCRIPTION_VIEW,
  PERMISSIONS.PRESCRIPTION_CREATE,
  PERMISSIONS.PRESCRIPTION_VERIFY,
  PERMISSIONS.RECOMMENDATION_VIEW,
  PERMISSIONS.RECOMMENDATION_DECIDE,
  PERMISSIONS.RECOMMENDATION_RULES_MANAGE,
  PERMISSIONS.DOCUMENT_GENERATE,
  PERMISSIONS.DOCUMENT_SEND,
  PERMISSIONS.SALE_VIEW,
  PERMISSIONS.SALE_CREATE,
  PERMISSIONS.ANALYTICS_VIEW,
];

const TECHNICIAN_PERMISSIONS: Permission[] = [
  PERMISSIONS.PHARMACY_VIEW,
  PERMISSIONS.PATIENT_VIEW,
  PERMISSIONS.PATIENT_CREATE,
  PERMISSIONS.PATIENT_UPDATE,
  PERMISSIONS.PRODUCT_VIEW,
  PERMISSIONS.PRODUCT_MANAGE,
  PERMISSIONS.STOCK_VIEW,
  PERMISSIONS.STOCK_ADJUST,
  PERMISSIONS.PRESCRIPTION_VIEW,
  PERMISSIONS.PRESCRIPTION_CREATE,
  PERMISSIONS.RECOMMENDATION_VIEW,
  PERMISSIONS.SALE_VIEW,
  PERMISSIONS.SALE_CREATE,
];

const STUDENT_PERMISSIONS: Permission[] = [
  PERMISSIONS.PHARMACY_VIEW,
  PERMISSIONS.PATIENT_VIEW,
  PERMISSIONS.PRODUCT_VIEW,
  PERMISSIONS.STOCK_VIEW,
  PERMISSIONS.PRESCRIPTION_VIEW,
  PERMISSIONS.PRESCRIPTION_CREATE,
  PERMISSIONS.RECOMMENDATION_VIEW,
];

const VIEWER_PERMISSIONS: Permission[] = [
  PERMISSIONS.PHARMACY_VIEW,
  PERMISSIONS.PRODUCT_VIEW,
  PERMISSIONS.STOCK_VIEW,
  PERMISSIONS.PRESCRIPTION_VIEW,
  PERMISSIONS.RECOMMENDATION_VIEW,
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: ALL_PERMISSIONS,
  PHARMACIST: PHARMACIST_PERMISSIONS,
  TECHNICIAN: TECHNICIAN_PERMISSIONS,
  STUDENT: STUDENT_PERMISSIONS,
  VIEWER: VIEWER_PERMISSIONS,
};

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Titulaire",
  PHARMACIST: "Pharmacien",
  TECHNICIAN: "Préparateur",
  STUDENT: "Étudiant",
  VIEWER: "Consultation",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER: "Accès complet, y compris paramètres, équipe et chiffre d'affaires.",
  PHARMACIST: "Acte professionnel : vérification des ordonnances et validation des conseils.",
  TECHNICIAN: "Comptoir, catalogue et stock. Permissions ajustables par le titulaire.",
  STUDENT: "Consultation et préparation, sans validation professionnelle.",
  VIEWER: "Lecture seule.",
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  [PERMISSIONS.PHARMACY_VIEW]: "Voir l'officine",
  [PERMISSIONS.PHARMACY_MANAGE]: "Modifier l'officine",
  [PERMISSIONS.SETTINGS_MANAGE]: "Gérer les paramètres",
  [PERMISSIONS.TEAM_VIEW]: "Voir l'équipe",
  [PERMISSIONS.TEAM_MANAGE]: "Gérer l'équipe",
  [PERMISSIONS.PATIENT_VIEW]: "Voir les patients",
  [PERMISSIONS.PATIENT_CREATE]: "Créer un patient",
  [PERMISSIONS.PATIENT_UPDATE]: "Modifier un patient",
  [PERMISSIONS.PATIENT_DELETE]: "Supprimer un patient",
  [PERMISSIONS.PATIENT_HEALTH_VIEW]: "Voir les données de santé",
  [PERMISSIONS.PATIENT_HEALTH_UPDATE]: "Modifier les données de santé",
  [PERMISSIONS.PATIENT_EXPORT]: "Exporter les données patient",
  [PERMISSIONS.PRODUCT_VIEW]: "Voir le catalogue",
  [PERMISSIONS.PRODUCT_MANAGE]: "Gérer le catalogue",
  [PERMISSIONS.PRODUCT_IMPORT]: "Importer des produits",
  [PERMISSIONS.STOCK_VIEW]: "Voir le stock",
  [PERMISSIONS.STOCK_ADJUST]: "Ajuster le stock",
  [PERMISSIONS.PRESCRIPTION_VIEW]: "Voir les ordonnances",
  [PERMISSIONS.PRESCRIPTION_CREATE]: "Importer une ordonnance",
  [PERMISSIONS.PRESCRIPTION_VERIFY]: "Vérifier une ordonnance",
  [PERMISSIONS.PRESCRIPTION_DELETE]: "Supprimer une ordonnance",
  [PERMISSIONS.RECOMMENDATION_VIEW]: "Voir les conseils",
  [PERMISSIONS.RECOMMENDATION_DECIDE]: "Valider les conseils",
  [PERMISSIONS.RECOMMENDATION_RULES_MANAGE]: "Gérer les règles de conseil",
  [PERMISSIONS.DOCUMENT_GENERATE]: "Générer la fiche patient",
  [PERMISSIONS.DOCUMENT_SEND]: "Transmettre la fiche patient",
  [PERMISSIONS.SALE_VIEW]: "Voir les ventes",
  [PERMISSIONS.SALE_CREATE]: "Enregistrer une vente",
  [PERMISSIONS.ANALYTICS_VIEW]: "Voir les statistiques",
  [PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE]: "Voir les performances par collaborateur",
  [PERMISSIONS.ANALYTICS_EXPORT]: "Exporter les statistiques",
  [PERMISSIONS.AUDIT_VIEW]: "Consulter le journal d'audit",
};

/** Permissions effectives = rôle + accordées − retirées. */
export function resolvePermissions(
  role: Role,
  granted: string[] = [],
  revoked: string[] = [],
): Set<Permission> {
  const effective = new Set<Permission>(ROLE_PERMISSIONS[role] ?? []);
  for (const permission of granted) {
    if (isPermission(permission)) effective.add(permission);
  }
  for (const permission of revoked) {
    if (isPermission(permission)) effective.delete(permission);
  }
  return effective;
}

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as string[]).includes(value);
}
