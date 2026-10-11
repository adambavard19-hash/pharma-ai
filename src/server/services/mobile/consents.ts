import "server-only";
import { prisma } from "@/server/db/client";
import type { Prisma } from "@/generated/prisma";
import { CONSENT_KINDS, CONSENT_TEXTS, type ConsentKind } from "@/core/mobile/profile";

/**
 * Les consentements d'une personne : un journal où l'on ajoute, jamais on ne modifie.
 *
 * L'état courant d'un consentement = la dernière décision de son type. Sans aucune décision : NON. Chaque ligne
 * garde la date, l'origine (inscription, bienvenue, réglages) et la version du texte affiché.
 */

export type ConsentState = { kind: ConsentKind; granted: boolean; decidedAt: Date | null };
export type ConsentHistoryEntry = { id: string; kind: ConsentKind; granted: boolean; at: Date; source: string };

type Client = Prisma.TransactionClient | typeof prisma;

export async function currentConsents(userId: string, client: Client = prisma): Promise<Record<ConsentKind, ConsentState>> {
  const rows = await client.userConsent.findMany({
    where: { userId, kind: { in: [...CONSENT_KINDS] } },
    orderBy: { createdAt: "desc" },
    select: { kind: true, granted: true, createdAt: true },
  });
  const result = {} as Record<ConsentKind, ConsentState>;
  for (const kind of CONSENT_KINDS) {
    const latest = rows.find((row) => row.kind === kind);
    result[kind] = { kind, granted: latest?.granted ?? false, decidedAt: latest?.createdAt ?? null };
  }
  return result;
}

/**
 * Enregistre une décision. Ne réécrit rien quand la décision ne change pas l'état (un formulaire renvoyé deux fois ne
 * gonfle pas l'historique), SAUF `force` : à l'inscription, on consigne aussi les « non » — la preuve que rien
 * n'était coché d'avance.
 */
export async function recordConsent(
  input: { userId: string; kind: ConsentKind; granted: boolean; source: string; force?: boolean },
  client: Client = prisma,
  now = new Date(),
): Promise<boolean> {
  if (!input.force) {
    const latest = await client.userConsent.findFirst({ where: { userId: input.userId, kind: input.kind }, orderBy: { createdAt: "desc" }, select: { granted: true } });
    if ((latest?.granted ?? false) === input.granted) return false;
  }
  await client.userConsent.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      granted: input.granted,
      grantedAt: input.granted ? now : null,
      revokedAt: input.granted ? null : now,
      source: input.source,
      textVersion: CONSENT_TEXTS[input.kind].version,
      createdAt: now,
    },
  });
  return true;
}

export async function consentHistory(userId: string, limit = 30): Promise<ConsentHistoryEntry[]> {
  const rows = await prisma.userConsent.findMany({
    where: { userId, kind: { in: [...CONSENT_KINDS] } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, kind: true, granted: true, createdAt: true, source: true },
  });
  return rows.map((row) => ({ id: row.id, kind: row.kind as ConsentKind, granted: row.granted, at: row.createdAt, source: row.source }));
}
