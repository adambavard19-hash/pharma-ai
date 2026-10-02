import "server-only";
import { prisma } from "@/server/db/client";
import { INTEGRATION_MODE_LABELS, LEAD_KIND_LABELS, ORDER_STATUS_LABELS, type IntegrationMode } from "@/core/partners/status";
import { formatDateTime } from "@/lib/format";
import type { ServiceResult } from "./brands";

/**
 * Commandes et leads attribués à PharmaBoost, côté console.
 *
 * Ces tables ne contiennent ni patient ni ordonnance : une commande, c'est
 * une officine cliente, un partenaire, des produits et un identifiant
 * d'attribution. La console suit la transmission (statut, référence du
 * partenaire) et exporte les commandes pour les partenaires en mode
 * import / export. Aucune transmission n'est simulée.
 */

export type OrderStatus = keyof typeof ORDER_STATUS_LABELS;
export const ORDER_STATUSES = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[];

/**
 * Ce que l'équipe PharmaBoost peut constater sur une commande. Une commande
 * confirmée ne repasse pas en échec ; une commande annulée est close.
 */
const ORDER_NEXT: Record<OrderStatus, OrderStatus[]> = {
  SUBMITTED: ["TRANSMITTED", "CONFIRMED", "FAILED", "CANCELLED"],
  TRANSMITTED: ["CONFIRMED", "FAILED", "CANCELLED"],
  FAILED: ["TRANSMITTED", "CANCELLED"],
  CONFIRMED: ["CANCELLED"],
  CANCELLED: [],
};

export function nextOrderStatuses(from: OrderStatus): OrderStatus[] {
  return ORDER_NEXT[from];
}

export const LEAD_STATUS_LABELS: Record<string, string> = { NEW: "Nouveau", TRANSMITTED: "Transmis", CLOSED: "Clos" };

type PharmacyRef = { id: string; name: string; city: string | null; isDemo: boolean };

export type ConsoleOrderRow = {
  id: string;
  createdAt: string;
  pharmacy: PharmacyRef;
  partner: { id: string; name: string };
  brand: { id: string; name: string } | null;
  lines: { id: string; name: string; ean: string | null; quantity: number; unitPriceCents: number | null }[];
  units: number;
  totalCents: number | null;
  integrationMode: IntegrationMode;
  partnerReference: string | null;
  status: OrderStatus;
  statusDetail: string | null;
  /** Note libre de l'officine pour le partenaire. */
  note: string | null;
  transmittedAt: string | null;
  confirmedAt: string | null;
  attributionCode: string;
  nextStatuses: OrderStatus[];
};

export type ConsoleLeadRow = {
  id: string;
  createdAt: string;
  pharmacy: PharmacyRef;
  partner: { id: string; name: string };
  brand: { id: string; name: string } | null;
  kind: keyof typeof LEAD_KIND_LABELS;
  status: string;
  attributionCode: string;
};

/** Les commandes et leads ne portent que l'identifiant de la marque : on lit les noms d'un coup. */
async function brandNames(ids: (string | null)[]): Promise<Map<string, { id: string; name: string }>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const brands = await prisma.partnerBrand.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(brands.map((brand) => [brand.id, brand]));
}

const LIST_LIMIT = 300;

export async function listConsoleOrders(filter: { partnerId?: string | null }): Promise<ConsoleOrderRow[]> {
  const orders = await prisma.partnerOrder.findMany({
    where: filter.partnerId ? { partnerId: filter.partnerId } : {},
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
    select: {
      id: true,
      createdAt: true,
      brandId: true,
      integrationMode: true,
      status: true,
      totalCents: true,
      partnerReference: true,
      statusDetail: true,
      note: true,
      transmittedAt: true,
      confirmedAt: true,
      pharmacy: { select: { id: true, name: true, city: true, isDemo: true } },
      partner: { select: { id: true, name: true } },
      attribution: { select: { code: true } },
      lines: { orderBy: { name: "asc" }, select: { id: true, name: true, ean: true, quantity: true, unitPriceCents: true } },
    },
  });
  const brands = await brandNames(orders.map((order) => order.brandId));
  return orders.map((order) => ({
    id: order.id,
    createdAt: order.createdAt.toISOString(),
    pharmacy: order.pharmacy,
    partner: order.partner,
    brand: brands.get(order.brandId) ?? null,
    lines: order.lines,
    units: order.lines.reduce((sum, line) => sum + line.quantity, 0),
    totalCents: order.totalCents,
    integrationMode: order.integrationMode,
    partnerReference: order.partnerReference,
    status: order.status,
    statusDetail: order.statusDetail,
    note: order.note,
    transmittedAt: order.transmittedAt?.toISOString() ?? null,
    confirmedAt: order.confirmedAt?.toISOString() ?? null,
    attributionCode: order.attribution.code,
    nextStatuses: nextOrderStatuses(order.status),
  }));
}

export async function listConsoleLeads(filter: { partnerId?: string | null }): Promise<ConsoleLeadRow[]> {
  const leads = await prisma.partnerLead.findMany({
    where: filter.partnerId ? { partnerId: filter.partnerId } : {},
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
    select: {
      id: true,
      createdAt: true,
      brandId: true,
      kind: true,
      status: true,
      pharmacy: { select: { id: true, name: true, city: true, isDemo: true } },
      partner: { select: { id: true, name: true } },
      attribution: { select: { code: true } },
    },
  });
  const brands = await brandNames(leads.map((lead) => lead.brandId));
  return leads.map((lead) => ({
    id: lead.id,
    createdAt: lead.createdAt.toISOString(),
    pharmacy: lead.pharmacy,
    partner: lead.partner,
    brand: lead.brandId ? (brands.get(lead.brandId) ?? null) : null,
    kind: lead.kind,
    status: lead.status,
    attributionCode: lead.attribution.code,
  }));
}

/** Les partenaires qui ont au moins une commande ou un lead : le filtre de la page et de l'export. */
export async function listActivityPartners(): Promise<{ id: string; name: string }[]> {
  return prisma.partner.findMany({
    where: { OR: [{ orders: { some: {} } }, { leads: { some: {} } }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function updateOrderStatus(
  orderId: string,
  input: { status: OrderStatus; partnerReference: string | null; statusDetail: string | null },
): Promise<ServiceResult<{ from: OrderStatus; to: OrderStatus; partnerId: string; pharmacyId: string; attributionCode: string }>> {
  const order = await prisma.partnerOrder.findFirst({
    where: { id: orderId },
    select: { id: true, status: true, partnerId: true, pharmacyId: true, transmittedAt: true, confirmedAt: true, attribution: { select: { code: true } } },
  });
  if (!order) return { ok: false, error: "Commande introuvable." };
  // Rester au même statut permet de compléter la référence ou le détail.
  if (input.status !== order.status && !nextOrderStatuses(order.status).includes(input.status)) {
    return { ok: false, error: `Passage de « ${ORDER_STATUS_LABELS[order.status]} » à « ${ORDER_STATUS_LABELS[input.status]} » impossible.`, field: "status" };
  }
  const now = new Date();
  await prisma.partnerOrder.update({
    where: { id: order.id },
    data: {
      status: input.status,
      partnerReference: input.partnerReference,
      statusDetail: input.statusDetail,
      ...(input.status === "TRANSMITTED" && !order.transmittedAt ? { transmittedAt: now } : {}),
      ...(input.status === "CONFIRMED" && !order.confirmedAt ? { confirmedAt: now, ...(order.transmittedAt ? {} : { transmittedAt: now }) } : {}),
    },
  });
  return { ok: true, data: { from: order.status, to: input.status, partnerId: order.partnerId, pharmacyId: order.pharmacyId, attributionCode: order.attribution.code } };
}

// ---------------------------------------------------------------------------
// Export CSV
// ---------------------------------------------------------------------------

/** Une cellule CSV sûre : guillemets doublés, et jamais une formule interprétée par le tableur. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const euros = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","));

const EXPORT_HEADER = [
  "date_commande",
  "identifiant_attribution",
  "statut",
  "mode",
  "partenaire",
  "marque",
  "officine",
  "finess",
  "adresse",
  "code_postal",
  "ville",
  "email_officine",
  "telephone_officine",
  "reference_partenaire",
  "produit",
  "ean",
  "reference_produit",
  "quantite",
  "prix_unitaire_ht",
  "montant_commande_ht",
];

/**
 * Les commandes en CSV (séparateur point-virgule, lisible par Excel), une
 * ligne par produit commandé. Hors officines de démonstration : ce fichier
 * part chez un partenaire. Filtré par partenaire pour n'envoyer à chacun que
 * ses propres commandes.
 */
export async function exportOrdersCsv(filter: { partnerId?: string | null; status?: OrderStatus | null }): Promise<{ filename: string; content: string; orders: number } | null> {
  const partner = filter.partnerId ? await prisma.partner.findFirst({ where: { id: filter.partnerId }, select: { slug: true } }) : null;
  if (filter.partnerId && !partner) return null;
  const orders = await prisma.partnerOrder.findMany({
    where: {
      pharmacy: { isDemo: false },
      ...(filter.partnerId ? { partnerId: filter.partnerId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      createdAt: true,
      brandId: true,
      status: true,
      integrationMode: true,
      totalCents: true,
      partnerReference: true,
      attribution: { select: { code: true } },
      partner: { select: { name: true } },
      pharmacy: { select: { name: true, finessNumber: true, addressLine1: true, postalCode: true, city: true, email: true, phone: true } },
      lines: { orderBy: { name: "asc" }, select: { name: true, ean: true, quantity: true, unitPriceCents: true, partnerProductId: true } },
    },
  });
  const brands = await brandNames(orders.map((order) => order.brandId));
  const productIds = [...new Set(orders.flatMap((order) => order.lines.map((line) => line.partnerProductId)).filter((id): id is string => Boolean(id)))];
  const refs = new Map(
    productIds.length
      ? (await prisma.partnerProduct.findMany({ where: { id: { in: productIds } }, select: { id: true, externalRef: true } })).map((product) => [product.id, product.externalRef])
      : [],
  );

  const rows: string[] = [EXPORT_HEADER.join(";")];
  for (const order of orders) {
    const common = [
      formatDateTime(order.createdAt),
      order.attribution.code,
      ORDER_STATUS_LABELS[order.status],
      INTEGRATION_MODE_LABELS[order.integrationMode],
      order.partner.name,
      brands.get(order.brandId)?.name ?? "",
      order.pharmacy.name,
      order.pharmacy.finessNumber,
      order.pharmacy.addressLine1,
      order.pharmacy.postalCode,
      order.pharmacy.city,
      order.pharmacy.email,
      order.pharmacy.phone,
      order.partnerReference,
    ];
    const lines = order.lines.length ? order.lines : [null];
    for (const line of lines) {
      rows.push(
        [
          ...common,
          line?.name ?? "",
          line?.ean ?? "",
          line?.partnerProductId ? (refs.get(line.partnerProductId) ?? "") : "",
          line ? String(line.quantity) : "",
          line ? euros(line.unitPriceCents) : "",
          euros(order.totalCents),
        ]
          .map(csvCell)
          .join(";"),
      );
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);
  // BOM : Excel reconnaît l'UTF-8 et affiche les accents.
  return { filename: `commandes-pharmaboost${partner ? `-${partner.slug}` : ""}-${stamp}.csv`, content: `\uFEFF${rows.join("\r\n")}\r\n`, orders: orders.length };
}
