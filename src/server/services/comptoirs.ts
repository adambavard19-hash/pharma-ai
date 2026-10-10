import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import type { TenantScope } from "@/server/db/tenant";
import { createNotification } from "@/server/services/notifications";
import { planClaim } from "@/core/team/access";
import { comptoirName, parseComptoirName, resolveMyComptoirs, type ComptoirPost, type MyComptoirs } from "@/core/counter/comptoirs";

/**
 * Les comptoirs de la pharmacie et leur collaborateur. Chaque comptoir est un espace à part : voir core/counter/comptoirs.ts.
 * Tout est borné à la pharmacie de la session : une pharmacie ne voit, n'attribue ni ne renomme jamais le comptoir d'une autre.
 */

type Failure = { ok: false; error: string };

export type PharmacyMember = { id: string; name: string; role: string };
export type ComptoirView = ComptoirPost & { name: string; assigneeName: string | null; pairedAt: Date | null; lastSeenAt: Date | null; lastScanAt: Date | null };

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
      select: { id: true, label: true, hostname: true, assignedUserId: true, pairedAt: true, lastSeenAt: true, lastScanAt: true },
    }),
    listMembers(pharmacyId),
  ]);
  const names = new Map(members.map((member) => [member.id, member.name]));
  return posts.map((post) => ({ ...post, name: comptoirName(post), assigneeName: post.assignedUserId ? (names.get(post.assignedUserId) ?? null) : null }));
}

/** Les comptoirs que cette personne voit : les siens, ou l'unique comptoir de la pharmacie. */
export async function myComptoirs(scope: Pick<TenantScope, "pharmacyId" | "userId">): Promise<MyComptoirs & { posts: ComptoirView[] }> {
  const posts = await listComptoirs(scope.pharmacyId);
  return { ...resolveMyComptoirs(posts, scope.userId), posts };
}

export async function assignComptoir(scope: TenantScope, postId: string, userId: string | null): Promise<{ ok: true; name: string; assignee: string | null } | Failure> {
  const post = await prisma.counterPost.findFirst({ where: { id: postId, pharmacyId: scope.pharmacyId, revokedAt: null }, select: { id: true, label: true, hostname: true, assignedUserId: true } });
  if (!post) return { ok: false, error: "Comptoir introuvable." };
  let assignee: string | null = null;
  if (userId) {
    const member = (await listMembers(scope.pharmacyId)).find((candidate) => candidate.id === userId);
    if (!member) return { ok: false, error: "Cette personne ne fait pas partie de votre équipe." };
    assignee = member.name;
  }
  await prisma.counterPost.update({ where: { id: post.id }, data: { assignedUserId: userId } });
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
 * « Je travaille ici » : un collaborateur prend le comptoir où il s'installe, sans rien réinstaller. Ses conseils et ses ventes lui sont alors
 * attribués. Il ne peut être qu'à un comptoir à la fois : prendre celui-ci libère ses autres comptoirs. Celui qui l'occupait en est prévenu,
 * et le titulaire voit toujours qui est où (« Mes comptoirs »).
 */
export async function claimComptoir(scope: TenantScope, postId: string): Promise<{ ok: true; name: string; changed: boolean } | Failure> {
  const members = await listMembers(scope.pharmacyId);
  const me = members.find((member) => member.id === scope.userId);
  if (!me) return { ok: false, error: "Vous ne faites pas partie de l'équipe de cette pharmacie." };
  const posts = await prisma.counterPost.findMany({ where: { pharmacyId: scope.pharmacyId, revokedAt: null, pairedAt: { not: null } }, select: { id: true, label: true, hostname: true, assignedUserId: true } });
  const plan = planClaim(posts, postId, scope.userId);
  if (!plan.ok) return plan;
  const target = posts.find((post) => post.id === postId)!;
  const name = comptoirName(target);
  if (plan.alreadyMine) return { ok: true, name, changed: false };
  await prisma.$transaction([
    ...(plan.release.length > 0 ? [prisma.counterPost.updateMany({ where: { id: { in: plan.release }, pharmacyId: scope.pharmacyId, assignedUserId: scope.userId }, data: { assignedUserId: null } })] : []),
    prisma.counterPost.update({ where: { id: target.id }, data: { assignedUserId: scope.userId } }),
  ]);
  await recordAudit({ action: "counter_post.claimed", entityType: "CounterPost", entityId: target.id, pharmacyId: scope.pharmacyId, userId: scope.userId, metadata: { previous: plan.previousUserId, released: plan.release } });
  if (plan.previousUserId) {
    await createNotification({ pharmacyId: scope.pharmacyId, userId: plan.previousUserId, type: "TEAM_EVENT", severity: "INFO", title: `${me.name} a pris ${name}`, body: "Vos prochaines ventes ne seront plus attribuées à ce comptoir. Reprenez-le ou choisissez-en un autre depuis « Nouvelle vente ».", linkUrl: "/vente/nouvelle" }).catch(() => undefined);
  }
  return { ok: true, name, changed: true };
}

/** « Je quitte ce comptoir » : seulement SON comptoir ; il redevient libre. */
export async function releaseComptoir(scope: TenantScope, postId: string): Promise<{ ok: true; name: string } | Failure> {
  const post = await prisma.counterPost.findFirst({ where: { id: postId, pharmacyId: scope.pharmacyId, revokedAt: null, assignedUserId: scope.userId }, select: { id: true, label: true, hostname: true } });
  if (!post) return { ok: false, error: "Ce comptoir ne vous est pas attribué." };
  await prisma.counterPost.updateMany({ where: { id: post.id, pharmacyId: scope.pharmacyId, assignedUserId: scope.userId }, data: { assignedUserId: null } });
  await recordAudit({ action: "counter_post.released", entityType: "CounterPost", entityId: post.id, pharmacyId: scope.pharmacyId, userId: scope.userId });
  return { ok: true, name: comptoirName(post) };
}
