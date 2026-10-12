import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import type { TenantScope } from "@/server/db/tenant";
import { planClaim } from "@/core/team/access";
import { comptoirName, parseComptoirName, resolveMyComptoirs, type ComptoirPost, type MyComptoirs } from "@/core/counter/comptoirs";
import { COMPTOIR_ASSIGNMENT_ACTIONS, releasedOnTake } from "@/core/counter/post-link";

/**
 * Les comptoirs de la pharmacie et la personne connectée à chacun. Chaque comptoir est un espace à part : voir
 * core/counter/comptoirs.ts. Le comptoir revient tout seul à la personne qui ouvre son espace sur le PC du comptoir
 * (core/counter/post-link.ts) ; le titulaire peut, en secours, choisir qui est où dans « Mes comptoirs ». Tout est borné à la
 * pharmacie de la session : une pharmacie ne voit, n'attribue ni ne renomme jamais le comptoir d'une autre.
 */

type Failure = { ok: false; error: string };

export type PharmacyMember = { id: string; name: string; role: string };
export type ComptoirView = ComptoirPost & { name: string; assigneeName: string | null; pairedAt: Date | null; lastSeenAt: Date | null; lastScanAt: Date | null; robotLook: number | null };

const fullName = (user: { firstName: string; lastName: string }) => `${user.firstName} ${user.lastName}`.trim();

/** Les personnes de l'équipe, à qui un comptoir peut être attribué. */
export async function listMembers(pharmacyId: string): Promise<PharmacyMember[]> {
  const rows = await prisma.membership.findMany({
    where: { pharmacyId, isActive: true, user: { status: "ACTIVE" } },
    select: { role: true, user: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: [{ createdAt: "asc" }],
  });
  return rows.map((row) => ({ id: row.user.id, name: fullName(row.user), role: row.role }));
}

/** Les comptoirs reliés de la pharmacie (ceux qui se sont présentés, pas les installations en attente), avec leur collaborateur. */
export async function listComptoirs(pharmacyId: string): Promise<ComptoirView[]> {
  const [posts, members] = await Promise.all([
    prisma.counterPost.findMany({
      where: { pharmacyId, revokedAt: null, pairedAt: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { id: true, label: true, hostname: true, assignedUserId: true, pairedAt: true, lastSeenAt: true, lastScanAt: true, robotLook: true },
    }),
    listMembers(pharmacyId),
  ]);
  const names = new Map(members.map((member) => [member.id, member.name]));
  return posts.map((post) => ({ ...post, name: comptoirName(post), assigneeName: post.assignedUserId ? (names.get(post.assignedUserId) ?? null) : null }));
}

/**
 * Les comptoirs que cette personne voit : les siens, ou l'unique comptoir de la pharmacie. Sur le navigateur lié à un poste
 * (`thisPcPostId`, lu par server/services/post-link.ts dans le cookie signé), celui de CE PC seulement.
 */
export async function myComptoirs(scope: Pick<TenantScope, "pharmacyId" | "userId">, thisPcPostId: string | null = null): Promise<MyComptoirs & { posts: ComptoirView[] }> {
  const posts = await listComptoirs(scope.pharmacyId);
  return { ...resolveMyComptoirs(posts, scope.userId, thisPcPostId), posts };
}

/**
 * En secours, le titulaire choisit qui est à quel comptoir (« Mes comptoirs »). Même règle que la liaison automatique : une
 * personne n'est qu'à UN comptoir à la fois — lui en donner un la retire des autres. Dès qu'elle ouvre son espace sur un PC
 * lié, c'est ce PC qui fait foi.
 */
export async function assignComptoir(scope: TenantScope, postId: string, userId: string | null): Promise<{ ok: true; name: string; assignee: string | null } | Failure> {
  const post = await prisma.counterPost.findFirst({ where: { id: postId, pharmacyId: scope.pharmacyId, revokedAt: null }, select: { id: true, label: true, hostname: true, assignedUserId: true } });
  if (!post) return { ok: false, error: "Comptoir introuvable." };
  let assignee: string | null = null;
  if (userId) {
    const member = (await listMembers(scope.pharmacyId)).find((candidate) => candidate.id === userId);
    if (!member) return { ok: false, error: "Cette personne ne fait pas partie de votre équipe." };
    assignee = member.name;
  }
  await prisma.$transaction([
    ...(userId ? [prisma.counterPost.updateMany({ where: { pharmacyId: scope.pharmacyId, assignedUserId: userId, id: { not: post.id } }, data: { assignedUserId: null } })] : []),
    prisma.counterPost.update({ where: { id: post.id }, data: { assignedUserId: userId } }),
  ]);
  await recordAudit({ action: "counter_post.assigned", entityType: "CounterPost", entityId: post.id, pharmacyId: scope.pharmacyId, userId: scope.userId, metadata: { from: post.assignedUserId, to: userId } });
  return { ok: true, name: comptoirName(post), assignee };
}

export async function renameComptoir(scope: TenantScope, postId: string, raw: unknown): Promise<{ ok: true; name: string } | Failure> {
  const parsed = parseComptoirName(raw);
  if (!parsed.ok) return parsed;
  const result = await prisma.counterPost.updateMany({ where: { id: postId, pharmacyId: scope.pharmacyId, revokedAt: null }, data: { label: parsed.value } });
  if (result.count === 0) return { ok: false, error: "Comptoir introuvable." };
  await recordAudit({ action: "counter_post.renamed", entityType: "CounterPost", entityId: postId, pharmacyId: scope.pharmacyId, userId: scope.userId, metadata: { name: parsed.value } });
  return { ok: true, name: parsed.value };
}

/**
 * La personne connectée sur le PC lié à ce poste le prend, sans clic (appelé par server/services/post-link.ts, une fois la
 * liaison vérifiée) ; la personne qui l'occupait le perd (elle le reprendra en ouvrant son espace sur ce PC). Ses autres
 * comptoirs tenus d'une attribution de secours sont libérés ; pas ceux qu'elle a pris elle-même sur un autre PC lié, où sa
 * session est ouverte (core/counter/post-link.ts, `releasedOnTake`) : un même compte sur deux PC garde un comptoir par PC,
 * sans bascule à chaque page. N'écrit rien si rien ne change ; deux rendus simultanés n'écrivent qu'une trace (seule
 * l'écriture qui change vraiment le comptoir compte).
 */
export async function takeComptoirOnThisPc(scope: Pick<TenantScope, "pharmacyId" | "userId">, postId: string): Promise<{ changed: boolean }> {
  const posts = await prisma.counterPost.findMany({ where: { pharmacyId: scope.pharmacyId, revokedAt: null, pairedAt: { not: null } }, select: { id: true, assignedUserId: true } });
  const plan = planClaim(posts, postId, scope.userId);
  if (!plan.ok || plan.alreadyMine) return { changed: false };
  const release = releasedOnTake(plan.release, await lastAssignmentTraces(scope.pharmacyId, plan.release), scope.userId);
  if (release.length === 0 && posts.some((post) => post.id === postId && post.assignedUserId === scope.userId)) return { changed: false };
  const [released, taken] = await prisma.$transaction([
    prisma.counterPost.updateMany({ where: { id: { in: release }, pharmacyId: scope.pharmacyId, assignedUserId: scope.userId }, data: { assignedUserId: null } }),
    prisma.counterPost.updateMany({ where: { id: postId, pharmacyId: scope.pharmacyId, revokedAt: null, OR: [{ assignedUserId: null }, { assignedUserId: { not: scope.userId } }] }, data: { assignedUserId: scope.userId } }),
  ]);
  if (taken.count === 0 && released.count === 0) return { changed: false };
  await recordAudit({ action: "counter_post.taken", entityType: "CounterPost", entityId: postId, pharmacyId: scope.pharmacyId, userId: scope.userId, metadata: { previous: plan.previousUserId, released: release, via: "pc" } });
  return { changed: true };
}

/** La dernière trace qui a changé la personne de chacun de ces comptoirs, lue dans le journal de CETTE pharmacie seulement. */
async function lastAssignmentTraces(pharmacyId: string, postIds: string[]): Promise<Map<string, { action: string; userId: string | null } | null>> {
  const traces = await Promise.all(
    postIds.map((postId) =>
      prisma.auditLog.findFirst({ where: { pharmacyId, entityType: "CounterPost", entityId: postId, action: { in: [...COMPTOIR_ASSIGNMENT_ACTIONS] } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { action: true, userId: true } }),
    ),
  );
  return new Map(postIds.map((postId, index) => [postId, traces[index]]));
}
