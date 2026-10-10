/**
 * Le classement de l'équipe, simple : pour chaque collaborateur, combien de conseils lui ont été proposés, combien ont été validés,
 * et son rang. Rien d'autre.
 *
 * « Proposé » : un conseil PharmaBoost apparu sur l'une de SES ventes (celles de son comptoir, ou qu'il a saisies). « Validé » : le
 * conseil a été retenu et n'a pas été refusé ensuite — accepté, modifié, remplacé, présenté ou acheté. Un conseil refusé par le
 * patient, retiré ou resté sans réponse n'est pas validé. Le rang suit le nombre de conseils validés ; à égalité, même rang.
 *
 * Module pur.
 */

export const VALIDATED_STATUSES: readonly string[] = ["ACCEPTED", "MODIFIED", "REPLACED", "PRESENTED", "PURCHASED"];

export type TeamMember = { id: string; name: string };
export type TeamCount = { userId: string | null; status: string; count: number };

export type TeamRow = {
  /** `null` : les ventes d'un comptoir qui n'était attribué à personne. */
  userId: string | null;
  name: string;
  proposed: number;
  validated: number;
  /** Validés sur proposés ; `null` tant qu'aucun conseil n'a été proposé (jamais un faux 0 %). */
  rate: number | null;
  rank: number;
};

export type TeamRanking = { rows: TeamRow[]; totals: { proposed: number; validated: number; rate: number | null } };

export const UNASSIGNED_NAME = "Comptoir non attribué";

export function buildTeamRanking(members: TeamMember[], counts: TeamCount[]): TeamRanking {
  const tally = new Map<string | null, { proposed: number; validated: number }>();
  for (const { userId, status, count } of counts) {
    const row = tally.get(userId) ?? { proposed: 0, validated: 0 };
    row.proposed += count;
    if (VALIDATED_STATUSES.includes(status)) row.validated += count;
    tally.set(userId, row);
  }
  const memberIds = new Set(members.map((member) => member.id));
  const people: Omit<TeamRow, "rank">[] = members.map((member) => {
    const row = tally.get(member.id) ?? { proposed: 0, validated: 0 };
    return { userId: member.id, name: member.name, ...row, rate: row.proposed > 0 ? row.validated / row.proposed : null };
  });
  // Ventes attribuées à quelqu'un qui n'est plus dans l'équipe, ou à personne : une ligne à part, jamais perdues, jamais au rang d'une personne.
  const orphan = { proposed: 0, validated: 0 };
  for (const [userId, row] of tally) {
    if (userId !== null && memberIds.has(userId)) continue;
    orphan.proposed += row.proposed;
    orphan.validated += row.validated;
  }
  const ordered = people.sort((a, b) => b.validated - a.validated || b.proposed - a.proposed || a.name.localeCompare(b.name, "fr"));
  const rows: TeamRow[] = [];
  ordered.forEach((person, index) => {
    const previous = rows[index - 1];
    const sameAsPrevious = previous && previous.validated === person.validated && previous.proposed === person.proposed;
    rows.push({ ...person, rank: sameAsPrevious ? previous.rank : index + 1 });
  });
  if (orphan.proposed > 0) rows.push({ userId: null, name: UNASSIGNED_NAME, ...orphan, rate: orphan.validated / orphan.proposed, rank: 0 });

  const proposed = rows.reduce((sum, row) => sum + row.proposed, 0);
  const validated = rows.reduce((sum, row) => sum + row.validated, 0);
  return { rows, totals: { proposed, validated, rate: proposed > 0 ? validated / proposed : null } };
}
