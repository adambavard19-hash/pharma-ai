import "server-only";
import { prisma } from "@/server/db/client";
import { PROSPECT_STATUS_LABELS, CONTRACT_STATUS_LABELS, type ProspectStatusCode, type ContractStatusCode } from "@/core/sales/pipeline";

/**
 * La recherche de la console : officines, dossiers commerciaux, contrats,
 * comptes d'officine, commerciaux. Données d'entreprise uniquement : aucun
 * patient, aucune ordonnance, aucun produit n'est cherché ici.
 */
export type AdminSearchResult = {
  type: "pharmacy" | "prospect" | "contract" | "user" | "rep";
  id: string;
  title: string;
  subtitle: string | null;
  badge: string | null;
  href: string;
};

export const ADMIN_SEARCH_GROUPS: Record<AdminSearchResult["type"], string> = {
  pharmacy: "Officines",
  prospect: "Dossiers commerciaux",
  contract: "Contrats",
  user: "Comptes d'officine",
  rep: "Commerciaux",
};

const insensitive = (value: string) => ({ contains: value, mode: "insensitive" as const });

export async function adminSearch(rawQuery: string): Promise<AdminSearchResult[]> {
  const q = rawQuery.replace(/\s+/g, " ").trim().slice(0, 80);
  if (q.length < 2) return [];
  const digits = q.replace(/\D/g, "");
  const [pharmacies, prospects, contracts, users, reps] = await Promise.all([
    prisma.pharmacy.findMany({
      where: { OR: [{ name: insensitive(q) }, { city: insensitive(q) }, { email: insensitive(q) }, ...(digits.length >= 5 ? [{ siret: { contains: digits } }, { finessNumber: { contains: digits } }] : [])] },
      take: 6,
      orderBy: { name: "asc" },
      select: { id: true, name: true, city: true, isActive: true, isDemo: true },
    }),
    prisma.prospect.findMany({
      where: { pharmacyId: null, OR: [{ name: insensitive(q) }, { ownerName: insensitive(q) }, { email: insensitive(q) }, { city: insensitive(q) }, ...(digits.length >= 5 ? [{ siret: { contains: digits } }] : [])] },
      take: 6,
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, city: true, ownerName: true, status: true },
    }),
    prisma.contract.findMany({
      where: { OR: [{ reference: insensitive(q) }, { pharmacySignerName: insensitive(q) }, { pharmacySignerEmail: insensitive(q) }, { prospect: { name: insensitive(q) } }] },
      take: 5,
      orderBy: { createdAt: "desc" },
      select: { id: true, version: true, status: true, reference: true, prospectId: true, pharmacySignerName: true, prospect: { select: { name: true } } },
    }),
    prisma.user.findMany({
      where: { deletedAt: null, OR: [{ email: insensitive(q) }, { firstName: insensitive(q) }, { lastName: insensitive(q) }] },
      take: 5,
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true, email: true, memberships: { where: { isActive: true }, take: 1, select: { pharmacyId: true, pharmacy: { select: { name: true } } } } },
    }),
    prisma.salesRep.findMany({
      where: { OR: [{ email: insensitive(q) }, { firstName: insensitive(q) }, { lastName: insensitive(q) }, { zone: insensitive(q) }] },
      take: 4,
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true, email: true, isActive: true },
    }),
  ]);

  return [
    ...pharmacies.map((p) => ({ type: "pharmacy" as const, id: p.id, title: p.name, subtitle: p.city, badge: p.isDemo ? "Démo" : p.isActive ? null : "Suspendue", href: `/admin/pharmacies/${p.id}` })),
    ...prospects.map((p) => ({ type: "prospect" as const, id: p.id, title: p.name, subtitle: [p.ownerName, p.city].filter(Boolean).join(" · ") || null, badge: PROSPECT_STATUS_LABELS[p.status as ProspectStatusCode] ?? p.status, href: `/admin/dossiers/${p.id}` })),
    ...contracts.map((c) => ({ type: "contract" as const, id: c.id, title: c.reference ?? `${c.prospect.name} — version ${c.version}`, subtitle: c.pharmacySignerName, badge: CONTRACT_STATUS_LABELS[c.status as ContractStatusCode] ?? c.status, href: `/admin/dossiers/${c.prospectId}` })),
    ...users.map((u) => ({ type: "user" as const, id: u.id, title: `${u.firstName} ${u.lastName}`, subtitle: [u.email, u.memberships[0]?.pharmacy.name].filter(Boolean).join(" · "), badge: null, href: u.memberships[0] ? `/admin/pharmacies/${u.memberships[0].pharmacyId}?onglet=utilisateurs` : `/admin/utilisateurs?q=${encodeURIComponent(u.email)}` })),
    ...reps.map((r) => ({ type: "rep" as const, id: r.id, title: `${r.firstName} ${r.lastName}`, subtitle: r.email, badge: r.isActive ? null : "Inactif", href: `/admin/commerciaux/${r.id}` })),
  ];
}
