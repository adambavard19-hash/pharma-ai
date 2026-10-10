import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { learnPharmacyStock } from "@/server/services/stock-learning";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Le temps qu'on se donne par passage : on s'arrête proprement, la nuit suivante reprend là où on en était. */
const BUDGET_MS = 240_000;

/**
 * Chaque nuit, PharmaBoost termine de « connaître » le stock des pharmacies : produits restés à ranger, médicaments pas encore classés
 * (stocks arrivés par le logiciel de gestion ou par dépôt, lots interrompus). Ce qui reste incompris est inscrit dans « Produits à
 * connaître » (console super admin). Protégé par CRON_SECRET ; rejouable sans effet de bord.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET non configuré" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const startedAt = Date.now();
  const pharmacies = await prisma.pharmacy.findMany({
    where: { isActive: true, isDemo: false },
    select: { id: true, organizationId: true, memberships: { where: { role: "OWNER", isActive: true }, take: 1, select: { userId: true } } },
    orderBy: { createdAt: "asc" },
  });
  let processed = 0;
  let skipped = 0;
  for (const pharmacy of pharmacies) {
    if (Date.now() - startedAt > BUDGET_MS) { skipped += 1; continue; }
    const owner = pharmacy.memberships[0];
    if (!owner) { skipped += 1; continue; }
    try {
      await learnPharmacyStock({ pharmacyId: pharmacy.id, organizationId: pharmacy.organizationId, userId: owner.userId }, { maxProductBatches: 10, maxMedicineBatches: 10 });
      processed += 1;
    } catch (error) {
      console.error("[cron connaissance-du-stock]", pharmacy.id, error instanceof Error ? error.message : error);
      skipped += 1;
    }
  }
  return NextResponse.json({ pharmacies: pharmacies.length, processed, skipped });
}
