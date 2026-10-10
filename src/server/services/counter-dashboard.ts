import "server-only";
import { prisma } from "@/server/db/client";
import { activityScope } from "@/server/db/demo-scope";
import type { TenantScope } from "@/server/db/tenant";
import { TIME_ZONE } from "@/config/constants";
import { patientDataEnabled } from "@/config/env";
import { listCounterPosts } from "@/server/services/stock-sync";
import { ACTIVITY_LINES_SHOWN, buildCounterStatus, describeSaleStage, describeWhen, type ActivityItem, type CounterDashboardData } from "@/core/counter/dashboard";
import { comptoirTitle } from "@/core/counter/comptoirs";
import { myComptoirs } from "@/server/services/comptoirs";

/**
 * Ce que le tableau de bord du comptoir lit : l'état des postes, les chiffres du jour, l'activité récente.
 *
 * Tout vient de la base, rien n'est calculé à l'écran : un chiffre affiché est un chiffre que l'on peut
 * retrouver. Les ventes en cours de la douchette, elles, ont leur propre lecture (`listLiveCounterSales`),
 * plus fréquente.
 */

const OPEN_STATUSES = ["NEEDS_VERIFICATION", "VERIFIED", "ANALYZING", "ANALYZED", "VALIDATED"] as const;
const ACTIVITY_LIMIT = 6;

/** Minuit à Paris, quelle que soit l'heure du serveur. */
export function startOfParisDay(now: Date): Date {
  const parts = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return new Date(now.getTime() - ((get("hour") * 60 + get("minute")) * 60 + get("second")) * 1000);
}

export async function loadCounterDashboard(scope: TenantScope, now: Date = new Date(), options: { canAssign?: boolean } = {}): Promise<CounterDashboardData> {
  const { pharmacyId } = scope;
  const startOfDay = startOfParisDay(now);
  const day = { pharmacyId, ...activityScope(scope), deletedAt: null };

  // Chaque comptoir est un espace à part : cette personne ne voit que SES comptoirs (voir core/counter/comptoirs.ts), pas le travail des autres.
  const mine = await myComptoirs(scope);
  const owners = Object.fromEntries(mine.posts.map((post) => [post.id, post.assigneeName]));
  const titles = new Map(mine.posts.map((post) => [post.id, comptoirTitle(post, post.assigneeName)]));
  // « À moi » : une vente de l'un de mes comptoirs, ou une ordonnance que j'ai saisie moi-même à l'écran.
  const mineFilter = { OR: [{ counterPostId: { in: mine.postIds } }, { source: { not: "COUNTER_SCAN" as const }, handledByUserId: scope.userId }] };

  const [posts, detected, recent, salesToday, decidedToday] = await Promise.all([
    listCounterPosts(pharmacyId),
    // Une délivrance « détectée » est une vente ouverte par un bip de douchette : elle compte même si le comptoir l'a clôturée depuis.
    prisma.prescription.count({ where: { ...day, source: "COUNTER_SCAN", counterPostId: { in: mine.postIds }, createdAt: { gte: startOfDay } } }),
    prisma.prescription.findMany({
      where: {
        ...day,
        AND: [
          mineFilter,
          // Aujourd'hui, et ce qui est resté ouvert depuis deux jours : « à reprendre » n'a pas disparu, il se lit ici.
          { OR: [{ createdAt: { gte: startOfDay } }, { status: { in: [...OPEN_STATUSES] }, sales: { none: {} }, createdAt: { gte: new Date(now.getTime() - 48 * 3600 * 1000) } }] },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: ACTIVITY_LIMIT,
      select: {
        id: true,
        reference: true,
        status: true,
        createdAt: true,
        counterPostId: true,
        patient: { select: { firstName: true, lastName: true } },
        lines: { orderBy: { position: "asc" }, take: ACTIVITY_LINES_SHOWN, select: { drugName: true, quantity: true } },
        _count: { select: { lines: true, recommendations: true } },
      },
    }),
    prisma.sale.aggregate({ where: { pharmacyId, userId: scope.userId, createdAt: { gte: startOfDay } }, _count: { _all: true }, _sum: { attributedCents: true } }),
    prisma.recommendation.groupBy({ by: ["status"], where: { pharmacyId, decidedAt: { gte: startOfDay }, prescription: mineFilter }, _count: { _all: true } }),
  ]);

  const accepted = decidedToday.filter((row) => row.status === "ACCEPTED" || row.status === "PURCHASED").reduce((sum, row) => sum + row._count._all, 0);
  const declined = decidedToday.filter((row) => row.status === "DECLINED").reduce((sum, row) => sum + row._count._all, 0);
  const withPatients = patientDataEnabled();

  const activity: ActivityItem[] = recent.map((prescription) => {
    const lines = prescription.lines.map((line) => ({ name: (line.drugName ?? "").trim(), quantity: line.quantity ?? 1 })).filter((line) => line.name.length > 0);
    return {
      id: prescription.id,
      when: describeWhen(prescription.createdAt, now),
      patient: withPatients && prescription.patient ? `${prescription.patient.lastName.toUpperCase()} ${prescription.patient.firstName}` : null,
      lines,
      moreLines: Math.max(0, prescription._count.lines - lines.length),
      comptoir: prescription.counterPostId ? (titles.get(prescription.counterPostId) ?? null) : null,
      stage: describeSaleStage(prescription.status, prescription._count.recommendations),
      reference: prescription.reference,
    };
  });

  return {
    status: buildCounterStatus({
      now,
      posts: posts.map((post) => ({ id: post.id, label: post.label, hostname: post.hostname, pairedAt: post.pairedAt, lastSeenAt: post.lastSeenAt, lastScanAt: post.lastScanAt, scanCount: post.scanCount, version: post.version, pairingExpiresAt: post.pairingExpiresAt })),
      mine,
      owners,
      canAssign: options.canAssign,
    }),
    stats: { detected, accepted, declined, salesCount: salesToday._count._all, attributedCents: salesToday._sum.attributedCents ?? 0 },
    activity,
  };
}
