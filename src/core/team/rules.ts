/**
 * L'équipe d'une officine : les règles, sans base ni session.
 *
 * Trois notions, que l'écran de l'équipe ne mélange pas :
 *   • le POSTE (le rôle) — Titulaire, Pharmacien, Préparateur, Étudiant, Consultation : ce que la personne est, et ce
 *     qu'elle peut faire dans PharmaBoost ;
 *   • le TITULAIRE PRINCIPAL — parmi les titulaires (il peut y en avoir plusieurs : associés), celui que PharmaBoost
 *     contacte pour le contrat, la facture et l'accès. Un seul par officine, et il est titulaire ;
 *   • la PLACE dans la liste — l'ordre que le titulaire donne à son équipe.
 *
 * Ce module dit ce qui est permis, et pourquoi pas. Le serveur l'applique ; l'écran s'en sert pour n'offrir que ce qui
 * passera. Aucune officine ne doit jamais se retrouver sans titulaire actif, ni sans titulaire principal.
 */

export type TeamRole = "OWNER" | "PHARMACIST" | "TECHNICIAN" | "STUDENT" | "VIEWER";

/** Le poste, tel que l'équipe le lit — et ce qu'il autorise, en une ligne. */
export const TEAM_ROLES: { value: TeamRole; label: string; hint: string }[] = [
  { value: "OWNER", label: "Titulaire", hint: "Accès complet : paramètres, équipe, facturation" },
  { value: "PHARMACIST", label: "Pharmacien", hint: "Vérifie les ordonnances et valide les conseils" },
  { value: "TECHNICIAN", label: "Préparateur", hint: "Comptoir, patients et stock" },
  { value: "STUDENT", label: "Étudiant", hint: "Consultation et préparation, sans validation" },
  { value: "VIEWER", label: "Consultation", hint: "Lecture seule" },
];

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = Object.fromEntries(TEAM_ROLES.map((role) => [role.value, role.label])) as Record<TeamRole, string>;

export function isTeamRole(value: string): value is TeamRole {
  return TEAM_ROLES.some((role) => role.value === value);
}

export type TeamMemberState = { userId: string; role: TeamRole; isActive: boolean; isPrincipal: boolean };

/** Qui agit : un administrateur PharmaBoost, ou un membre de l'équipe (avec son poste). */
export type TeamActor = { kind: "admin" } | { kind: "member"; userId: string; role: TeamRole };

export type TeamChange = { userId: string; role?: TeamRole; isPrincipal?: boolean };

export type TeamPlan = { ok: true; next: TeamMemberState[]; roleChanged: boolean; principalChanged: boolean } | { ok: false; error: string };

const activeOwners = (team: TeamMemberState[]) => team.filter((member) => member.role === "OWNER" && member.isActive);

/**
 * Applique un changement de poste et/ou de titulaire principal à l'équipe — sur le papier. Rend l'équipe qui en
 * résulterait, ou la raison du refus. Ne dépend de rien d'autre que de l'équipe qu'on lui donne.
 */
export function planTeamChange(team: TeamMemberState[], change: TeamChange, actor: TeamActor): TeamPlan {
  const target = team.find((member) => member.userId === change.userId);
  if (!target) return { ok: false, error: "Ce collaborateur ne fait pas partie de l'équipe." };

  const role = change.role ?? target.role;
  const isPrincipal = change.isPrincipal ?? target.isPrincipal;
  const roleChanged = role !== target.role;
  const principalChanged = isPrincipal !== target.isPrincipal;

  if (!roleChanged && !principalChanged) return { ok: true, next: team, roleChanged, principalChanged };

  // Faire ou défaire un titulaire, désigner le principal : l'affaire des titulaires (ou de PharmaBoost), pas d'un adjoint.
  const touchesOwners = (roleChanged && (target.role === "OWNER" || role === "OWNER")) || principalChanged;
  if (touchesOwners && actor.kind === "member" && actor.role !== "OWNER") {
    return { ok: false, error: "Seul un titulaire peut nommer ou retirer un titulaire, ou désigner le titulaire principal." };
  }

  // Le principal ne s'efface pas, ne change pas de poste : on en désigne un autre à sa place, et il lui passe la main.
  if (target.isPrincipal && role !== "OWNER") return { ok: false, error: "C'est le titulaire principal : désignez d'abord un autre titulaire principal, puis changez son poste." };
  if (target.isPrincipal && !isPrincipal) return { ok: false, error: "Il faut toujours un titulaire principal : désignez-en un autre à sa place." };
  if (isPrincipal && role !== "OWNER") return { ok: false, error: "Le titulaire principal doit être titulaire : choisissez d'abord le poste « Titulaire »." };
  if (isPrincipal && !target.isActive) return { ok: false, error: "Un accès suspendu ne peut pas être titulaire principal : rétablissez-le d'abord." };

  const next = team.map((member) => {
    if (member.userId === target.userId) return { ...member, role, isPrincipal };
    // Désigner un nouveau principal retire ce statut à l'ancien : il n'y en a qu'un.
    return isPrincipal ? { ...member, isPrincipal: false } : member;
  });

  if (target.role === "OWNER" && role !== "OWNER" && activeOwners(next).length === 0) {
    return { ok: false, error: "L'officine doit garder au moins un titulaire actif : nommez d'abord un autre titulaire." };
  }
  return { ok: true, next, roleChanged, principalChanged };
}

/**
 * Le nom, l'adresse, le téléphone et le RPPS sont ceux d'un COMPTE, pas d'une officine : un compte qui travaille aussi
 * dans une autre officine ne se renomme pas depuis celle-ci (cela le renommerait chez l'autre). Soi-même, on le peut ;
 * PharmaBoost aussi.
 */
export function identityEditBlock(input: { actor: TeamActor; targetUserId: string; otherPharmacies: number }): string | null {
  if (input.actor.kind === "admin") return null;
  if (input.actor.userId === input.targetUserId) return null;
  if (input.otherPharmacies > 0) return "Ce compte travaille aussi dans une autre officine : son nom, son adresse et ses coordonnées ne se modifient pas depuis celle-ci. Il peut le faire lui-même, ou PharmaBoost pour lui.";
  return null;
}

/** On ne change pas sa propre adresse de connexion ici : la session en cours serait fermée sous nos pieds. */
export function emailEditBlock(input: { actor: TeamActor; targetUserId: string }): string | null {
  if (input.actor.kind === "member" && input.actor.userId === input.targetUserId) return "Votre propre adresse de connexion ne se change pas depuis l'équipe (vous seriez déconnecté) : demandez-le à PharmaBoost.";
  return null;
}

/** Déplace un collaborateur d'un cran dans la liste ; sans effet aux extrémités. Rend un NOUVEL ordre. */
export function moveInOrder(order: string[], userId: string, direction: "up" | "down"): string[] {
  const index = order.indexOf(userId);
  if (index === -1) return order;
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= order.length) return order;
  const next = [...order];
  [next[index], next[swapWith]] = [next[swapWith], next[index]];
  return next;
}

/** Les places 1…n d'un ordre : ce que l'on écrit en base, sans trou ni doublon. */
export function positionsFor(order: string[]): Map<string, number> {
  return new Map(order.map((userId, index) => [userId, index + 1]));
}

/** Le titulaire principal d'une équipe, s'il y en a un (actif de préférence) : celui que l'on contacte. */
export function principalOf<T extends { role: TeamRole; isActive: boolean; isPrincipal: boolean }>(team: T[]): T | null {
  return team.find((member) => member.isPrincipal && member.role === "OWNER" && member.isActive) ?? team.find((member) => member.role === "OWNER" && member.isActive) ?? null;
}
