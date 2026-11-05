import "server-only";
import { prisma } from "@/server/db/client";

/**
 * Les démonstrations, dans l'espace du directeur commercial (fondateur, 5 nov. 2026) : « à chaque fois qu'il y a une
 * démonstration, il devra l'avoir depuis son espace ». Toutes les démos programmées (réservées sur le site ou par un
 * commercial), à venir puis des 30 derniers jours, avec où en est chaque pharmacie. Le directeur qui mène une démo et la
 * marque « faite » touche 100 € HT quand la pharmacie va au bout (mise en service réglée).
 */
export type DirectorDemoRow = {
  id: string;
  name: string;
  ownerName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  demoAt: Date;
  demoDoneAt: Date | null;
  /** Démo menée par le directeur connecté. */
  mine: boolean;
  repName: string | null;
  /** L'espace du titulaire existe (lien de bienvenue envoyé, ou contrat signé). */
  spaceOpened: boolean;
  /** Abonnement réglé : la démo est allée au bout. */
  wentThrough: boolean;
};

export async function listDirectorDemos(directorId: string, now = new Date()): Promise<{ upcoming: DirectorDemoRow[]; past: DirectorDemoRow[] }> {
  const since = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const rows = await prisma.prospect.findMany({
    where: { demoAt: { gte: since }, blockedAt: null },
    orderBy: { demoAt: "asc" },
    take: 300,
    select: {
      id: true,
      name: true,
      ownerName: true,
      email: true,
      phone: true,
      city: true,
      demoAt: true,
      demoDoneAt: true,
      demoDirectorId: true,
      pharmacyId: true,
      salesRep: { select: { firstName: true, lastName: true } },
      pharmacy: { select: { organization: { select: { subscription: { select: { payments: { where: { status: "PAID", amountCents: { gt: 0 } }, take: 1, select: { id: true } } } } } } } },
    },
  });
  const view = rows.map(
    (row): DirectorDemoRow => ({
      id: row.id,
      name: row.name,
      ownerName: row.ownerName,
      email: row.email,
      phone: row.phone,
      city: row.city,
      demoAt: row.demoAt as Date,
      demoDoneAt: row.demoDoneAt,
      mine: row.demoDirectorId === directorId,
      repName: row.salesRep ? `${row.salesRep.firstName} ${row.salesRep.lastName}` : null,
      spaceOpened: row.pharmacyId !== null,
      wentThrough: (row.pharmacy?.organization.subscription?.payments.length ?? 0) > 0,
    }),
  );
  const hourAgo = now.getTime() - 3600 * 1000;
  return { upcoming: view.filter((row) => !row.demoDoneAt && row.demoAt.getTime() >= hourAgo), past: view.filter((row) => row.demoDoneAt || row.demoAt.getTime() < hourAgo).reverse() };
}
