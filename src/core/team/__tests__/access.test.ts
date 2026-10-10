import { describe, expect, it } from "vitest";
import { DECLARABLE_ROLES, INVITABLE_ROLES, INVITATION_TTL_DAYS, invitationState, isDeclarableRole, isEmail, isInvitableRole, memberAccess, parseEmails, planClaim, publicPharmacyLabel, searchTerm } from "../access";
import { buildAccountExistsEmail, buildJoinDecisionEmail, buildJoinRequestAlertEmail, buildTeamInvitationEmail } from "../access-emails";

describe("les adresses collées en vrac", () => {
  it("sépare virgules, points-virgules, espaces, retours à la ligne ; retire les doublons et les chevrons", () => {
    const { valid, invalid } = parseEmails("Claire@Exemple.fr, hugo@exemple.fr;\n<lea@exemple.fr>  claire@exemple.fr\n");
    expect(valid).toEqual(["claire@exemple.fr", "hugo@exemple.fr", "lea@exemple.fr"]);
    expect(invalid).toEqual([]);
  });

  it("garde à part ce qui n'est pas une adresse", () => {
    expect(parseEmails("claire@exemple.fr pas-une-adresse a@b").invalid).toEqual(["pas-une-adresse", "a@b"]);
    expect(isEmail("x@y.fr")).toBe(true);
    expect(isEmail("x@y")).toBe(false);
    expect(isEmail(`${"a".repeat(160)}@y.fr`)).toBe(false);
  });
});

describe("les postes qu'on peut donner", () => {
  it("jamais titulaire par invitation ni par demande ; jamais « consultation » à l'initiative du demandeur", () => {
    expect(INVITABLE_ROLES).toEqual(["PHARMACIST", "TECHNICIAN", "STUDENT", "VIEWER"]);
    expect(DECLARABLE_ROLES).toEqual(["PHARMACIST", "TECHNICIAN", "STUDENT"]);
    expect(isInvitableRole("OWNER")).toBe(false);
    expect(isDeclarableRole("OWNER")).toBe(false);
    expect(isDeclarableRole("VIEWER")).toBe(false);
    expect(isInvitableRole("VIEWER")).toBe(true);
    expect(isInvitableRole(undefined)).toBe(false);
  });
});

describe("l'état d'une invitation", () => {
  const now = new Date("2026-10-10T10:00:00Z");
  const base = { acceptedAt: null, revokedAt: null, expiresAt: new Date(now.getTime() + 1000) };
  it("en attente, expirée, acceptée, annulée — l'acceptation l'emporte, puis l'annulation", () => {
    expect(invitationState(base, now)).toBe("PENDING");
    expect(invitationState({ ...base, expiresAt: new Date(now.getTime() - 1) }, now)).toBe("EXPIRED");
    expect(invitationState({ ...base, acceptedAt: now, revokedAt: now }, now)).toBe("ACCEPTED");
    expect(invitationState({ ...base, revokedAt: now }, now)).toBe("REVOKED");
    expect(INVITATION_TTL_DAYS).toBe(7);
  });
});

describe("chercher sa pharmacie sans pouvoir parcourir la liste", () => {
  it("trois caractères utiles au moins, nettoyés des jokers", () => {
    expect(searchTerm("ni")).toBeNull();
    expect(searchTerm("  ab ")).toBeNull();
    expect(searchTerm("%%%")).toBeNull();
    expect(searchTerm("Port")).toBe("Port");
    expect(searchTerm("du  Port_%")).toBe("du Port");
    expect(searchTerm("x".repeat(81))).toBeNull();
    expect(searchTerm(42)).toBeNull();
  });

  it("ne montre d'une officine que son nom et sa commune", () => {
    expect(publicPharmacyLabel({ name: "Pharmacie du Port", postalCode: "06000", city: "Nice" })).toBe("Pharmacie du Port · 06000 Nice");
    expect(publicPharmacyLabel({ name: "Pharmacie du Port", postalCode: null, city: null })).toBe("Pharmacie du Port");
  });
});

describe("où en est chaque accès", () => {
  it("suspendu, jamais connecté, actif", () => {
    expect(memberAccess({ isActive: false, lastLoginAt: new Date() })).toBe("SUSPENDED");
    expect(memberAccess({ isActive: true, lastLoginAt: null })).toBe("NEVER_CONNECTED");
    expect(memberAccess({ isActive: true, lastLoginAt: new Date() })).toBe("ACTIVE");
  });
});

describe("« Je travaille ici »", () => {
  const posts = [{ id: "p1", assignedUserId: "lea" }, { id: "p2", assignedUserId: null }, { id: "p3", assignedUserId: "hugo" }];
  it("prendre un comptoir libre libère ceux qu'on avait : on n'est qu'à un comptoir à la fois", () => {
    expect(planClaim(posts, "p2", "lea")).toEqual({ ok: true, release: ["p1"], previousUserId: null, alreadyMine: false });
  });
  it("prendre le comptoir de quelqu'un dit qui l'occupait (pour le prévenir)", () => {
    expect(planClaim(posts, "p3", "lea")).toEqual({ ok: true, release: ["p1"], previousUserId: "hugo", alreadyMine: false });
  });
  it("reprendre son propre comptoir ne change rien", () => {
    expect(planClaim(posts, "p1", "lea")).toEqual({ ok: true, release: [], previousUserId: null, alreadyMine: true });
  });
  it("un comptoir inconnu (ou d'une autre pharmacie, absent de la liste) est refusé", () => {
    expect(planClaim(posts, "p-autre", "lea")).toEqual({ ok: false, error: "Comptoir introuvable." });
  });
});

describe("les messages d'entrée dans l'officine", () => {
  it("l'invitation porte un lien personnel daté, jamais de mot de passe", () => {
    const message = buildTeamInvitationEmail({ firstName: "Claire", pharmacyName: "Pharmacie du Port", inviterName: "Anne Roux", roleLabel: "préparateur", url: "https://pharmaboost.app/invitation/abc", expiresAt: new Date("2026-10-17T10:00:00Z") });
    expect(message.subject).toBe("Anne Roux vous invite à rejoindre Pharmacie du Port sur PharmaBoost");
    for (const part of [message.text, message.html]) {
      expect(part).toContain("https://pharmaboost.app/invitation/abc");
      expect(part).toContain("préparateur");
    }
    expect(message.text).toContain("à usage unique");
    expect(message.text).not.toMatch(/mot de passe (initial|provisoire)/i);
  });

  it("l'alerte au titulaire dit que rien n'est ouvert tant qu'il n'a pas approuvé", () => {
    const message = buildJoinRequestAlertEmail({ ownerFirstName: "Anne", pharmacyName: "Pharmacie du Port", requesterName: "Camille Martin", requesterEmail: "camille@exemple.fr", roleLabel: "préparateur", url: "https://pharmaboost.app/equipe" });
    expect(message.text).toContain("Camille Martin (camille@exemple.fr)");
    expect(message.text).toContain("n'a accès à rien");
    expect(message.text).toContain("refusez la demande");
  });

  it("la réponse : approuvée → un lien de connexion ; refusée → aucun lien", () => {
    const yes = buildJoinDecisionEmail({ firstName: "Camille", pharmacyName: "Pharmacie du Port", approved: true, roleLabel: "préparateur", loginUrl: "https://pharmaboost.app/login" });
    const no = buildJoinDecisionEmail({ firstName: "Camille", pharmacyName: "Pharmacie du Port", approved: false, roleLabel: null, loginUrl: "https://pharmaboost.app/login" });
    expect(yes.text).toContain("https://pharmaboost.app/login");
    expect(no.text).not.toContain("https://pharmaboost.app/login");
  });

  it("l'e-mail « vous avez déjà un compte » ne nomme aucune officine", () => {
    const message = buildAccountExistsEmail({ firstName: "Camille", loginUrl: "https://pharmaboost.app/login", resetUrl: "https://pharmaboost.app/login/oubli" });
    expect(message.text).toContain("déjà un compte");
    expect(message.text).toContain("/login/oubli");
  });
});
