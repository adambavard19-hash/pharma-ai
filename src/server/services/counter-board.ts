import "server-only";
import { prisma } from "@/server/db/client";
import { activityScope } from "@/server/db/demo-scope";
import type { TenantScope } from "@/server/db/tenant";
import { listLiveCounterSales } from "@/server/services/counter-scan";
import { myComptoirs } from "@/server/services/comptoirs";
import { startOfParisDay } from "@/server/services/counter-dashboard";
import { comptoirTitle } from "@/core/counter/comptoirs";
import { adviceOutcome, boardAdvice, type FinishedSale, type LiveSale } from "@/core/counter/board";

/**
 * La page « Au comptoir » : les délivrances en cours et les ventes terminées du jour.
 *
 * Même règle de visibilité que partout au comptoir (core/counter/comptoirs.ts, `resolveMyComptoirs`) : chacun voit SES
 * comptoirs — sur le navigateur lié à un poste, celui de CE PC seulement. Le titulaire n'a pas de passe-droit ici : le
 * travail d'un collègue se lit dans « Mon équipe », pas sur son écran de comptoir.
 */

const FINISHED_LIMIT = 30;
const recName = (rec: { product: { name: string } | null; presentation: { specialty: { name: string } } | null }) => rec.product?.name ?? rec.presentation?.specialty.name ?? null;

/** Les comptoirs de cette personne et leur titre (« Comptoir 2 · Léa Martin »). */
async function comptoirsOf(scope: TenantScope, thisPcPostId: string | null) {
  const mine = await myComptoirs(scope, thisPcPostId);
  const titles = new Map(mine.posts.map((post) => [post.id, comptoirTitle(post, post.assigneeName)]));
  return { postIds: mine.postIds, titles };
}

export async function loadLiveBoard(scope: TenantScope, thisPcPostId: string | null): Promise<LiveSale[]> {
  const { postIds, titles } = await comptoirsOf(scope, thisPcPostId);
  const sales = await listLiveCounterSales(scope.pharmacyId, postIds);
  return sales.map((sale) => ({
    id: sale.id,
    reference: sale.reference,
    status: sale.status,
    comptoir: (sale.counterPostId ? titles.get(sale.counterPostId) : null) ?? sale.counterPost ?? null,
    updatedAt: sale.updatedAt.toISOString(),
    lines: sale.lines.map((line) => ({ drugName: line.drugName ?? "", quantity: line.quantity ?? 1 })),
    advice: boardAdvice(sale.recommendations.map((rec) => ({ name: recName(rec), status: rec.status }))),
    recommendations: sale._count.recommendations,
  }));
}

/**
 * Les ventes terminées aujourd'hui (heure de Paris) : celles de mes comptoirs, et les saisies à la main que j'ai faites.
 * Terminée : « Terminer la vente » au poste, une vente enregistrée, un plan remis, ou une vente du scan close par
 * « Nouveau patient » (avec au moins un produit scanné).
 */
export async function loadFinishedToday(scope: TenantScope, thisPcPostId: string | null, now: Date = new Date()): Promise<FinishedSale[]> {
  const { postIds, titles } = await comptoirsOf(scope, thisPcPostId);
  const rows = await prisma.prescription.findMany({
    where: {
      pharmacyId: scope.pharmacyId,
      ...activityScope(scope),
      deletedAt: null,
      createdAt: { gte: startOfParisDay(now) },
      AND: [
        { OR: [{ source: "COUNTER_SCAN", counterPostId: { in: postIds } }, { source: { not: "COUNTER_SCAN" }, handledByUserId: scope.userId }] },
        {
          OR: [
            { counterFollowUp: { closedAt: { not: null } } },
            { sales: { some: {} } },
            { status: { in: ["VALIDATED", "DELIVERED"] } },
            { status: "CANCELLED", source: "COUNTER_SCAN", lines: { some: {} } },
          ],
        },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: FINISHED_LIMIT,
    select: {
      id: true,
      reference: true,
      updatedAt: true,
      counterPost: true,
      counterPostId: true,
      counterFollowUp: { select: { closedAt: true } },
      lines: { orderBy: { position: "asc" }, take: 6, select: { drugName: true, quantity: true } },
      recommendations: { orderBy: { totalScore: "desc" }, select: { status: true, product: { select: { name: true } }, presentation: { select: { specialty: { select: { name: true } } } } } },
    },
  });
  return rows.map((row) => {
    const outcomes = row.recommendations.map((rec) => adviceOutcome(rec.status)).filter((outcome) => outcome !== null);
    const sold = [...new Set(row.recommendations.filter((rec) => adviceOutcome(rec.status) === "SOLD").map(recName).filter((name): name is string => Boolean(name)))];
    return {
      id: row.id,
      reference: row.reference,
      finishedAt: (row.counterFollowUp?.closedAt ?? row.updatedAt).toISOString(),
      comptoir: (row.counterPostId ? titles.get(row.counterPostId) : null) ?? row.counterPost ?? null,
      lines: row.lines.map((line) => ({ drugName: line.drugName ?? "", quantity: line.quantity ?? 1 })).filter((line) => line.drugName.trim().length > 0),
      soldCount: outcomes.filter((outcome) => outcome === "SOLD").length,
      adviceCount: outcomes.length,
      sold,
    };
  });
}
