import { describe, expect, it } from "vitest";
import { DECLARABLE_ROLES, INVITABLE_ROLES, INVITATION_TTL_DAYS, invitationState, isDeclarableRole, isEmail, isInvitableRole, MAX_INVITES_AT_ONCE, PERSON_NAME_MAX, cleanPersonName, inviteeLabel, memberAccess, planClaim, validateInvitees, publicPharmacyLabel, searchTerm } from "../access";
import { buildAccountExistsEmail, buildJoinDecisionEmail, buildJoinRequestAlertEmail, buildTeamInvitationEmail } from "../access-emails";

describe("inviter : prénom, nom et adresse de chaque personne", () => {
  it("nettoie le prénom et le nom : caractères invisibles ou de contrôle retirés, espaces resserrés", () => {
    expect(cleanPersonName("  Léa\u200b   Rose \n")).toBe("Léa Rose");
    expect(cleanPersonName("Mar\u0000tin")).toBe("Mar tin");
    expect(cleanPersonName(42)).toBe("");
  });

  it("rend les personnes nettoyées, adresses en minuscules ; ignore les lignes entièrement vides", () => {
    const result = validateInvitees([{ firstName: " Léa ", lastName: "  Martin", email: " Lea.Martin@Exemple.fr " }, { firstName: "", lastName: "", email: "  " }]);
    expect(result).toEqual({ ok: true, invitees: [{ firstName: "Léa", lastName: "Martin", email: "lea.martin@exemple.fr" }] });
  });

  it("prénom et nom sont obligatoires, pour chaque personne, et bornés à 80 caractères", () => {
    expect(validateInvitees([{ firstName: "", lastName: "Martin", email: "lea@exemple.fr" }])).toEqual({ ok: false, error: "Indiquez le prénom." });
    expect(validateInvitees([{ firstName: "Léa", lastName: " \u200b ", email: "lea@exemple.fr" }])).toEqual({ ok: false, error: "Indiquez le nom." });
    expect(validateInvitees([{ firstName: "Léa", lastName: "Martin", email: "lea@exemple.fr" }, { firstName: "Hugo", lastName: "", email: "hugo@exemple.fr" }])).toEqual({ ok: false, error: "Indiquez le nom (personne n° 2)." });
    expect(validateInvitees([{ firstName: "L".repeat(PERSON_NAME_MAX + 1), lastName: "Martin", email: "lea@exemple.fr" }])).toMatchObject({ ok: false });
    expect(validateInvitees([{ firstName: "L".repeat(PERSON_NAME_MAX), lastName: "Martin", email: "lea@exemple.fr" }])).toMatchObject({ ok: true });
  });

  it("refuse une adresse invalide, une adresse en double, aucune personne, ou plus de 20 à la fois", () => {
    expect(validateInvitees([{ firstName: "Léa", lastName: "Martin", email: "lea@exemple" }])).toMatchObject({ ok: false, error: expect.stringContaining("pas valide") });
    expect(validateInvitees([{ firstName: "Léa", lastName: "Martin", email: "lea@exemple.fr" }, { firstName: "Léa", lastName: "M", email: "LEA@exemple.fr" }])).toMatchObject({ ok: false, error: expect.stringContaining("deux fois") });
    expect(validateInvitees([])).toMatchObject({ ok: false });
    expect(validateInvitees("lea@exemple.fr")).toMatchObject({ ok: false });
    const many = Array.from({ length: MAX_INVITES_AT_ONCE + 1 }, (_, i) => ({ firstName: "A", lastName: "B", email: `p${i}@exemple.fr` }));
    expect(validateInvitees(many)).toMatchObject({ ok: false });
    expect(isEmail("x@y.fr")).toBe(true);
    expect(isEmail("x@y")).toBe(false);
    expect(isEmail(`${"a".repeat(160)}@y.fr`)).toBe(false);
  });

  it("une invitation affiche le nom complet ; une ancienne, envoyée sans nom, son adresse", () => {
    expect(inviteeLabel({ firstName: "Léa", lastName: "Martin", email: "lea@exemple.fr" })).toBe("Léa Martin");
    expect(inviteeLabel({ firstName: null, lastName: null, email: "lea@exemple.fr" })).toBe("lea@exemple.fr");
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
    // La personne est saluée par son prénom ; on lui dit qui l'invite, et dans quelle pharmacie.
    expect(message.text.startsWith("Bonjour Claire,")).toBe(true);
    expect(message.html).toContain("Bonjour Claire,");
    expect(message.text).toContain("Anne Roux vous a ouvert un accès à PharmaBoost pour Pharmacie du Port");
    // Une ancienne invitation sans prénom reste polie.
    expect(buildTeamInvitationEmail({ firstName: null, pharmacyName: "P", inviterName: "A", roleLabel: "r", url: "u", expiresAt: new Date() }).text.startsWith("Bonjour,")).toBe(true);
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
