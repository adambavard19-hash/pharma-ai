import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { getSession } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { listCounterPosts } from "@/server/services/stock-sync";

export const dynamic = "force-dynamic";

export type InstallationState = {
  pharmacyDone: boolean;
  stockDone: boolean;
  stockSyncedAt: string | null;
  posts: { id: string; label: string | null; hostname: string; paired: boolean; alive: boolean; scanCount: number; lastScanAt: string | null; version: string | null; exportPath: string | null; lastExportAt: string | null; lastExportError: string | null }[];
  teamCount: number;
};

/** L'état de la mise en service, relu par le guide toutes les quelques secondes : le titulaire voit son poste apparaître. */
export async function loadInstallationState(pharmacyId: string): Promise<InstallationState> {
  const now = Date.now();
  const [pharmacy, posts, teamCount] = await Promise.all([
    prisma.pharmacy.findUniqueOrThrow({ where: { id: pharmacyId }, select: { addressLine1: true, city: true, phone: true, stockSyncedAt: true } }),
    listCounterPosts(pharmacyId),
    prisma.membership.count({ where: { pharmacyId, isActive: true, user: { deletedAt: null } } }),
  ]);
  return {
    pharmacyDone: Boolean(pharmacy.addressLine1 && pharmacy.city),
    stockDone: Boolean(pharmacy.stockSyncedAt),
    stockSyncedAt: pharmacy.stockSyncedAt?.toISOString() ?? null,
    posts: posts.map((post) => ({
      id: post.id,
      label: post.label,
      hostname: post.hostname,
      paired: Boolean(post.pairedAt),
      alive: Boolean(post.lastSeenAt && now - post.lastSeenAt.getTime() < 180_000),
      scanCount: post.scanCount,
      lastScanAt: post.lastScanAt?.toISOString() ?? null,
      version: post.version,
      exportPath: post.exportPath,
      lastExportAt: post.lastExportAt?.toISOString() ?? null,
      lastExportError: post.lastExportError,
    })),
    teamCount,
  };
}

export async function GET() {
  const session = await getSession();
  if (!session || !session.permissions.has(PERMISSIONS.PRODUCT_IMPORT)) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  return NextResponse.json(await loadInstallationState(session.scope.pharmacyId), { headers: { "Cache-Control": "no-store" } });
}
