import { describe, expect, it } from "vitest";
import { emailEditBlock, identityEditBlock, moveInOrder, planTeamChange, positionsFor, principalOf, TEAM_ROLE_LABELS, type TeamActor, type TeamMemberState } from "../rules";

const owner: TeamActor = { kind: "member", userId: "adam", role: "OWNER" };
const adjoint: TeamActor = { kind: "member", userId: "donna", role: "PHARMACIST" };
const admin: TeamActor = { kind: "admin" };

/** Adam, titulaire principal ; Donna, pharmacienne ; Léo, préparateur ; Sam, 2e titulaire (associé). */
const team = (): TeamMemberState[] => [
  { userId: "adam", role: "OWNER", isActive: true, isPrincipal: true },
  { userId: "donna", role: "PHARMACIST", isActive: true, isPrincipal: false },
  { userId: "leo", role: "TECHNICIAN", isActive: true, isPrincipal: false },
  { userId: "sam", role: "OWNER", isActive: true, isPrincipal: false },
];

describe("les postes", () => {
  it("se lisent comme l'équipe les dit", () => {
    expect(TEAM_ROLE_LABELS).toMatchObject({ OWNER: "Titulaire", PHARMACIST: "Pharmacien", TECHNICIAN: "Préparateur", STUDENT: "Étudiant", VIEWER: "Consultation" });
  });
});

describe("changer le poste de quelqu'un", () => {
  it("un titulaire change le poste d'un collaborateur", () => {
    const plan = planTeamChange(team(), { userId: "leo", role: "PHARMACIST" }, owner);
    expect(plan).toMatchObject({ ok: true, roleChanged: true, principalChanged: false });
    expect(plan.ok && plan.next.find((m) => m.userId === "leo")?.role).toBe("PHARMACIST");
  });

  it("un adjoint peut changer le poste d'un préparateur mais pas faire un titulaire", () => {
    expect(planTeamChange(team(), { userId: "leo", role: "STUDENT" }, adjoint)).toMatchObject({ ok: true });
    expect(planTeamChange(team(), { userId: "leo", role: "OWNER" }, adjoint)).toMatchObject({ ok: false, error: expect.stringMatching(/Seul un titulaire/) });
  });

  it("un adjoint ne retire pas un titulaire, ne désigne pas le principal", () => {
    expect(planTeamChange(team(), { userId: "sam", role: "PHARMACIST" }, adjoint)).toMatchObject({ ok: false });
    expect(planTeamChange(team(), { userId: "sam", role: "OWNER", isPrincipal: true }, adjoint)).toMatchObject({ ok: false });
  });

  it("un titulaire, ou PharmaBoost, nomme un associé", () => {
    expect(planTeamChange(team(), { userId: "donna", role: "OWNER" }, owner)).toMatchObject({ ok: true, roleChanged: true });
    expect(planTeamChange(team(), { userId: "donna", role: "OWNER" }, admin)).toMatchObject({ ok: true });
  });

  it("ne change rien quand rien ne change", () => {
    const t = team();
    const plan = planTeamChange(t, { userId: "donna", role: "PHARMACIST" }, adjoint);
    expect(plan).toMatchObject({ ok: true, roleChanged: false, principalChanged: false });
    expect(plan.ok && plan.next).toBe(t);
  });

  it("refuse un collaborateur qui n'est pas dans l'équipe", () => {
    expect(planTeamChange(team(), { userId: "inconnu", role: "VIEWER" }, owner)).toMatchObject({ ok: false });
  });
});

describe("le titulaire principal", () => {
  it("passe d'un titulaire à un autre : un seul principal à la fois", () => {
    const plan = planTeamChange(team(), { userId: "sam", isPrincipal: true }, owner);
    expect(plan).toMatchObject({ ok: true, principalChanged: true });
    if (!plan.ok) throw new Error("plan refusé");
    expect(plan.next.filter((m) => m.isPrincipal).map((m) => m.userId)).toEqual(["sam"]);
  });

  it("doit être titulaire : on ne désigne pas un pharmacien", () => {
    expect(planTeamChange(team(), { userId: "donna", isPrincipal: true }, owner)).toMatchObject({ ok: false, error: expect.stringMatching(/doit être titulaire/) });
  });

  it("on peut nommer titulaire ET principal d'un seul geste", () => {
    const plan = planTeamChange(team(), { userId: "donna", role: "OWNER", isPrincipal: true }, owner);
    expect(plan.ok && plan.next.filter((m) => m.isPrincipal).map((m) => m.userId)).toEqual(["donna"]);
  });

  it("un accès suspendu ne peut pas être principal", () => {
    const t = team().map((m) => (m.userId === "sam" ? { ...m, isActive: false } : m));
    expect(planTeamChange(t, { userId: "sam", isPrincipal: true }, owner)).toMatchObject({ ok: false, error: expect.stringMatching(/suspendu/) });
  });

  it("ne se retire pas à lui-même : on en désigne un autre à sa place", () => {
    expect(planTeamChange(team(), { userId: "adam", isPrincipal: false }, owner)).toMatchObject({ ok: false, error: expect.stringMatching(/toujours un titulaire principal/) });
  });

  it("ne change pas de poste tant qu'il est principal", () => {
    expect(planTeamChange(team(), { userId: "adam", role: "PHARMACIST" }, owner)).toMatchObject({ ok: false, error: expect.stringMatching(/désignez d'abord un autre titulaire principal/) });
  });

  it("après avoir passé la main, l'ancien principal peut redevenir pharmacien", () => {
    const first = planTeamChange(team(), { userId: "sam", isPrincipal: true }, owner);
    if (!first.ok) throw new Error("plan refusé");
    expect(planTeamChange(first.next, { userId: "adam", role: "PHARMACIST" }, owner)).toMatchObject({ ok: true });
  });
});

describe("une officine garde toujours un titulaire actif", () => {
  it("le dernier titulaire ne se rétrograde pas", () => {
    const solo: TeamMemberState[] = [
      { userId: "adam", role: "OWNER", isActive: true, isPrincipal: true },
      { userId: "donna", role: "PHARMACIST", isActive: true, isPrincipal: false },
    ];
    // Principal : refusé d'abord pour cette raison…
    expect(planTeamChange(solo, { userId: "adam", role: "PHARMACIST" }, owner)).toMatchObject({ ok: false });
  });

  it("un titulaire non principal, seul actif avec un principal suspendu, ne peut pas quitter le poste", () => {
    const t: TeamMemberState[] = [
      { userId: "adam", role: "OWNER", isActive: false, isPrincipal: true },
      { userId: "sam", role: "OWNER", isActive: true, isPrincipal: false },
    ];
    expect(planTeamChange(t, { userId: "sam", role: "PHARMACIST" }, owner)).toMatchObject({ ok: false, error: expect.stringMatching(/au moins un titulaire actif/) });
  });

  it("un associé se rétrograde tant qu'un autre titulaire reste", () => {
    expect(planTeamChange(team(), { userId: "sam", role: "TECHNICIAN" }, owner)).toMatchObject({ ok: true });
  });
});

describe("modifier le nom, l'adresse, les coordonnées", () => {
  it("PharmaBoost modifie tout compte", () => {
    expect(identityEditBlock({ actor: admin, targetUserId: "x", otherPharmacies: 3 })).toBeNull();
  });

  it("un titulaire modifie un collaborateur de SON officine seulement", () => {
    expect(identityEditBlock({ actor: owner, targetUserId: "leo", otherPharmacies: 0 })).toBeNull();
    expect(identityEditBlock({ actor: owner, targetUserId: "leo", otherPharmacies: 1 })).toMatch(/autre officine/);
  });

  it("chacun modifie son propre compte, même s'il travaille ailleurs", () => {
    expect(identityEditBlock({ actor: owner, targetUserId: "adam", otherPharmacies: 2 })).toBeNull();
  });

  it("on ne change pas sa propre adresse de connexion depuis l'équipe", () => {
    expect(emailEditBlock({ actor: owner, targetUserId: "adam" })).toMatch(/déconnecté/);
    expect(emailEditBlock({ actor: owner, targetUserId: "leo" })).toBeNull();
    expect(emailEditBlock({ actor: admin, targetUserId: "adam" })).toBeNull();
  });
});

describe("l'ordre de l'équipe", () => {
  it("monte et descend d'un cran, sans effet aux extrémités", () => {
    const order = ["adam", "donna", "leo", "sam"];
    expect(moveInOrder(order, "donna", "up")).toEqual(["donna", "adam", "leo", "sam"]);
    expect(moveInOrder(order, "donna", "down")).toEqual(["adam", "leo", "donna", "sam"]);
    expect(moveInOrder(order, "adam", "up")).toEqual(order);
    expect(moveInOrder(order, "sam", "down")).toEqual(order);
    expect(moveInOrder(order, "inconnu", "up")).toEqual(order);
    expect(order).toEqual(["adam", "donna", "leo", "sam"]); // l'ordre d'origine n'est pas modifié
  });

  it("numérote de 1 à n, sans trou ni doublon", () => {
    expect([...positionsFor(["b", "a", "c"]).entries()]).toEqual([["b", 1], ["a", 2], ["c", 3]]);
  });
});

describe("qui PharmaBoost contacte", () => {
  it("le titulaire principal actif ; à défaut, un titulaire actif", () => {
    expect(principalOf(team())?.userId).toBe("adam");
    const suspended = team().map((m) => (m.userId === "adam" ? { ...m, isActive: false } : m));
    expect(principalOf(suspended)?.userId).toBe("sam");
    expect(principalOf(team().filter((m) => m.role !== "OWNER"))).toBeNull();
  });
});
