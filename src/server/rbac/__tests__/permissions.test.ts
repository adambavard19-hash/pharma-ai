import { describe, expect, it } from "vitest";
import { PERMISSIONS, PERMISSION_LABELS, ROLE_PERMISSIONS, resolvePermissions, type Permission, type Role } from "../permissions";

/**
 * La matrice des rôles est la source de vérité des actions serveur
 * (requirePermission) : elle se teste ici, sans base.
 */

const ROLES: Role[] = ["OWNER", "PHARMACIST", "TECHNICIAN", "STUDENT", "VIEWER"];

/** Ce que chaque rôle peut faire dans les briques gammes / challenges / dates courtes / vigilances / formation / partenaires. */
const EXPECTED: Record<Role, Partial<Record<Permission, boolean>>> = {
  OWNER: {
    [PERMISSIONS.PARTNERS_VIEW]: true,
    [PERMISSIONS.PARTNERS_MANAGE]: true,
    [PERMISSIONS.LAB_PROGRAMS_MANAGE]: true,
    [PERMISSIONS.TRAINING_VIEW]: true,
    [PERMISSIONS.TRAINING_MANAGE]: true,
    [PERMISSIONS.STOCK_ADJUST]: true,
    [PERMISSIONS.SETTINGS_MANAGE]: true,
    [PERMISSIONS.RECOMMENDATION_RULES_MANAGE]: true,
    [PERMISSIONS.PRESCRIPTION_VERIFY]: true,
  },
  PHARMACIST: {
    [PERMISSIONS.PARTNERS_VIEW]: true,
    [PERMISSIONS.PARTNERS_MANAGE]: false,
    [PERMISSIONS.LAB_PROGRAMS_MANAGE]: false,
    [PERMISSIONS.TRAINING_VIEW]: true,
    [PERMISSIONS.TRAINING_MANAGE]: false,
    [PERMISSIONS.STOCK_ADJUST]: true,
    [PERMISSIONS.SETTINGS_MANAGE]: false,
    [PERMISSIONS.RECOMMENDATION_RULES_MANAGE]: true,
    [PERMISSIONS.PRESCRIPTION_VERIFY]: true,
  },
  TECHNICIAN: {
    [PERMISSIONS.PARTNERS_VIEW]: true,
    [PERMISSIONS.PARTNERS_MANAGE]: false,
    [PERMISSIONS.LAB_PROGRAMS_MANAGE]: false,
    [PERMISSIONS.TRAINING_VIEW]: true,
    [PERMISSIONS.TRAINING_MANAGE]: false,
    [PERMISSIONS.STOCK_ADJUST]: true,
    [PERMISSIONS.RECOMMENDATION_RULES_MANAGE]: false,
    // La validation pharmacien d'une vigilance patient lui échappe.
    [PERMISSIONS.PRESCRIPTION_VERIFY]: false,
  },
  STUDENT: {
    [PERMISSIONS.PARTNERS_VIEW]: false,
    [PERMISSIONS.PARTNERS_MANAGE]: false,
    [PERMISSIONS.LAB_PROGRAMS_MANAGE]: false,
    [PERMISSIONS.TRAINING_VIEW]: true,
    [PERMISSIONS.STOCK_ADJUST]: false,
    [PERMISSIONS.PRESCRIPTION_VERIFY]: false,
  },
  VIEWER: {
    [PERMISSIONS.PARTNERS_VIEW]: false,
    [PERMISSIONS.PARTNERS_MANAGE]: false,
    [PERMISSIONS.LAB_PROGRAMS_MANAGE]: false,
    [PERMISSIONS.TRAINING_MANAGE]: false,
    [PERMISSIONS.STOCK_ADJUST]: false,
    [PERMISSIONS.PRESCRIPTION_VERIFY]: false,
  },
};

describe("permissions des nouvelles briques", () => {
  for (const role of ROLES) {
    it(`${role}`, () => {
      const effective = resolvePermissions(role);
      for (const [permission, allowed] of Object.entries(EXPECTED[role])) {
        expect(effective.has(permission as Permission), `${role} → ${permission}`).toBe(allowed);
      }
    });
  }

  it("le titulaire reçoit toutes les permissions, y compris les nouvelles", () => {
    expect(ROLE_PERMISSIONS.OWNER).toEqual(expect.arrayContaining(Object.values(PERMISSIONS)));
  });

  it("chaque permission a un libellé", () => {
    for (const permission of Object.values(PERMISSIONS)) expect(PERMISSION_LABELS[permission], permission).toBeTruthy();
  });

  it("la permission des performances dit ce qu'elle ouvre : la ventilation par collaborateur ET la valeur générée", () => {
    // Elle ouvre Pilotage (résultats de chaque collègue) et « Ce que PharmaBoost vous rapporte » (CA, retour sur abonnement) :
    // le titulaire qui la coche doit lire les deux.
    expect(PERMISSION_LABELS[PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE]).toBe("Voir les performances par collaborateur et la valeur générée par PharmaBoost");
  });

  it("le titulaire peut accorder ou retirer une permission ; le retrait l'emporte ; une chaîne inconnue est ignorée", () => {
    expect(resolvePermissions("TECHNICIAN", [PERMISSIONS.TRAINING_MANAGE]).has(PERMISSIONS.TRAINING_MANAGE)).toBe(true);
    expect(resolvePermissions("PHARMACIST", [], [PERMISSIONS.TRAINING_VIEW]).has(PERMISSIONS.TRAINING_VIEW)).toBe(false);
    expect(resolvePermissions("TECHNICIAN", [PERMISSIONS.LAB_PROGRAMS_MANAGE], [PERMISSIONS.LAB_PROGRAMS_MANAGE]).has(PERMISSIONS.LAB_PROGRAMS_MANAGE)).toBe(false);
    expect(resolvePermissions("STUDENT", ["admin:all"]).size).toBe(resolvePermissions("STUDENT").size);
  });
});
