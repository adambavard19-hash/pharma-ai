import "server-only";
import { prisma } from "@/server/db/client";
import { publicUrl } from "@/server/public-url";
import { demoCounts, demoOutcome, type DemoOutcome } from "@/core/sales/demo-outcome";

/**
 * Le suivi des démonstrations par commercial (17 oct. 2026) : le lien personnel que chaque commercial envoie aux pharmacies, et la
 * liste de ses démos avec leur issue (programmée, faite, abonnée, pas allée au bout). Les mêmes lignes pour la console et le
 * directeur commercial (tous les commerciaux).
 */

export function demoLinkFor(repId: string): string {
  return publicUrl(`/decouvrir/demo?commercial=${encodeURIComponent(repId)}`);
}

export type DemoRow = { id: string; name: string; city: string | null; demoAt: Date | null; demoDoneAt: Date | null; outcome: DemoOutcome; rep: { id: string; name: string } | null };

export async function listDemosFor(input: { salesRepId?: string | null; limit?: number }, now = new Date()): Promise<DemoRow[]> {
  const rows = await prisma.prospect.findMany({
    where: { demoAt: { not: null }, ...(input.salesRepId ? { salesRepId: input.salesRepId } : {}) },
    orderBy: { demoAt: "desc" },
    take: input.limit ?? 200,
    select: { id: true, name: true, city: true, status: true, demoAt: true, demoDoneAt: true, pharmacyId: true, salesRep: { select: { id: true, firstName: true, lastName: true } } },
  });
  return rows.map((row) => ({ id: row.id, name: row.name, city: row.city, demoAt: row.demoAt, demoDoneAt: row.demoDoneAt, outcome: demoOutcome(row, now), rep: row.salesRep ? { id: row.salesRep.id, name: `${row.salesRep.firstName} ${row.salesRep.lastName}`.trim() } : null }));
}

/** Les compteurs par commercial (directeur commercial, console). */
export async function demoBoard(now = new Date()) {
  const [rows, reps] = await Promise.all([listDemosFor({ limit: 2000 }, now), prisma.salesRep.findMany({ where: { isActive: true }, orderBy: { firstName: "asc" }, select: { id: true, firstName: true, lastName: true } })]);
  const byRep = reps.map((rep) => {
    const own = rows.filter((row) => row.rep?.id === rep.id);
    return { id: rep.id, name: `${rep.firstName} ${rep.lastName}`.trim(), ...demoCounts(own.map((row) => row.outcome)) };
  });
  return { rows, byRep, total: demoCounts(rows.map((row) => row.outcome)) };
}
