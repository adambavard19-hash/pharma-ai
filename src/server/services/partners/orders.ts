import "server-only";
import { prisma } from "@/server/db/client";
import { itemVisible } from "@/core/partners/visibility";
import { modeAllowsOrder } from "@/core/partners/connector";
import { INTEGRATION_MODE_LABELS, ORDER_STATUS_LABELS, LEAD_KIND_LABELS, type IntegrationMode } from "@/core/partners/status";
import { isUniverseKey } from "@/config/universes";
import { formatCents } from "@/lib/format";
import { notifyAdmins } from "@/server/services/sales/notifications";
import { createAttribution } from "./attribution";
import { isPartnerPilot } from "./visibility";
import { activeIntegrationOf, brandForPharmacy, pharmacyIdentity, type PartnerScope } from "./pharmacy-partners";
import { connectorFor, contactConnectorFor } from "./connectors";
import { orderTotalCents } from "./connectors/messages";

/**
 * Consultations, prises de contact et commandes d'une officine auprès d'un
 * partenaire, chacune avec son identifiant d'attribution PharmaBoost.
 *
 * Ce qui part chez le partenaire : le nom de l'officine, sa ville, son FINESS,
 * son e-mail et son téléphone, les lignes, le montant, l'identifiant
 * d'attribution et la note ou le message de l'officine. JAMAIS de patient,
 * d'ordonnance ni de conseil — aucune de ces fonctions n'en reçoit, et
 * l'attribution ne garde que l'univers du besoin (src/server/services/partners/attribution.ts).
 *
 * Isolation : l'officine vient de la session (`scope`) ; la marque est
 * revérifiée visible pour elle, chaque produit commandé revérifié comme
 * appartenant à cette marque et publié pour cette officine, et les prix
 * viennent du catalogue central, jamais du client.
 */

export type AttributionSource = "COUNTER_CARD" | "CATALOG" | "BRAND_PAGE";
export type AttributionContext = { source: AttributionSource; universe: string | null };

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const ADMIN_ORDERS = "/admin/partenaires/commandes";
const NOT_OFFERED = "Cette gamme n'est pas proposée à votre officine.";

function universeOf(context: AttributionContext): string | null {
  return context.universe && isUniverseKey(context.universe) ? context.universe : null;
}

// ---------------------------------------------------------------------------
// Consultation
// ---------------------------------------------------------------------------

/** Une consultation de la page d'une marque, depuis le comptoir ou le catalogue. */
export async function recordBrandView(scope: PartnerScope, brandId: string, context: AttributionContext): Promise<Result<{ code: string }>> {
  const brand = await brandForPharmacy(scope, brandId);
  if (!brand) return { ok: false, error: NOT_OFFERED };
  const attribution = await createAttribution(scope, { kind: "VIEW", source: context.source, partnerId: brand.partner.id, brandId: brand.id, universe: universeOf(context) });
  return { ok: true, data: { code: attribution.code } };
}

// ---------------------------------------------------------------------------
// Demande de contact
// ---------------------------------------------------------------------------

export type ContactRequestInput = {
  brandId: string;
  message: string | null;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
} & AttributionContext;

export type ContactRequestOutcome = {
  leadId: string;
  code: string;
  brand: { id: string; slug: string; name: string };
  partnerName: string;
  /** Envoyée au partenaire par e-mail ; sinon enregistrée pour l'équipe PharmaBoost. */
  transmitted: boolean;
};

/** Le contact du partenaire qui reçoit les demandes : celui des commandes, sinon le principal, avec une adresse. */
async function partnerContactEmail(partnerId: string): Promise<string | null> {
  const contacts = await prisma.partnerContact.findMany({
    where: { partnerId, email: { not: null }, OR: [{ receivesOrders: true }, { isPrimary: true }] },
    orderBy: [{ receivesOrders: "desc" }, { isPrimary: "desc" }, { createdAt: "asc" }],
    select: { email: true },
    take: 1,
  });
  return contacts[0]?.email?.trim() || null;
}

/** Le contact qui reçoit les commandes, quand l'intégration E-mail n'a pas d'adresse propre. */
async function orderContactEmail(partnerId: string): Promise<string | null> {
  const contact = await prisma.partnerContact.findFirst({
    where: { partnerId, receivesOrders: true, email: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { email: true },
  });
  return contact?.email?.trim() || null;
}

/**
 * Une demande de contact : toujours possible, quel que soit le mode
 * d'intégration. Envoyée par e-mail au contact du partenaire quand une adresse
 * existe et que l'envoi aboutit ; sinon elle reste enregistrée (NEW) et
 * l'équipe PharmaBoost la transmet.
 */
export async function requestContact(scope: PartnerScope, input: ContactRequestInput): Promise<Result<ContactRequestOutcome>> {
  const brand = await brandForPharmacy(scope, input.brandId);
  if (!brand) return { ok: false, error: NOT_OFFERED };

  const attribution = await createAttribution(scope, { kind: "LEAD", source: input.source, partnerId: brand.partner.id, brandId: brand.id, universe: universeOf(input) });
  const lead = await prisma.partnerLead.create({
    data: {
      attributionId: attribution.id,
      partnerId: brand.partner.id,
      brandId: brand.id,
      pharmacyId: scope.pharmacyId,
      kind: "CONTACT_REQUEST",
      message: input.message,
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      status: "NEW",
      createdByUserId: scope.userId,
    },
    select: { id: true },
  });

  const [pharmacy, recipient] = await Promise.all([pharmacyIdentity(scope.pharmacyId), partnerContactEmail(brand.partner.id)]);
  let transmitted = false;
  let detail = "Aucun contact du partenaire n'a d'adresse e-mail : demande enregistrée pour l'équipe PharmaBoost.";
  if (recipient) {
    const result = await contactConnectorFor(recipient, { brandName: brand.name }).submitLead({
      attributionCode: attribution.code,
      brandName: brand.name,
      pharmacy,
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      message: input.message,
    });
    if (result.ok) {
      transmitted = true;
      detail = result.data.detail;
      await prisma.partnerLead.updateMany({ where: { id: lead.id, pharmacyId: scope.pharmacyId }, data: { status: "TRANSMITTED", transmittedAt: new Date() } });
    } else {
      detail = `Envoi au partenaire non abouti (${result.message}) : demande enregistrée pour l'équipe PharmaBoost.`;
    }
  }

  await notifyAdmins({
    type: "PARTNER_LEAD",
    title: `${LEAD_KIND_LABELS.CONTACT_REQUEST} — ${brand.name} — ${pharmacy.name}`,
    body: `${pharmacy.name}${pharmacy.city ? ` (${pharmacy.city})` : ""} · ${attribution.code} · ${detail}`,
    linkUrl: ADMIN_ORDERS,
    severity: transmitted ? "INFO" : "WARNING",
  });

  return {
    ok: true,
    data: { leadId: lead.id, code: attribution.code, brand: { id: brand.id, slug: brand.slug, name: brand.name }, partnerName: brand.partner.name, transmitted },
  };
}

// ---------------------------------------------------------------------------
// Portail B2B et formulaire
// ---------------------------------------------------------------------------

export type PartnerLinkOutcome = { leadId: string; code: string; url: string; kind: "B2B_LINK_OPENED" | "FORM_OPENED"; brand: { id: string; slug: string; name: string } };

/**
 * Ouvrir le portail B2B ou le formulaire du partenaire : une attribution et
 * une trace (lead B2B_LINK_OPENED / FORM_OPENED), puis le lien, qui porte
 * l'identifiant d'attribution quand le partenaire le prévoit.
 */
export async function openPartnerLink(scope: PartnerScope, input: { brandId: string } & AttributionContext): Promise<Result<PartnerLinkOutcome>> {
  const brand = await brandForPharmacy(scope, input.brandId);
  if (!brand) return { ok: false, error: NOT_OFFERED };
  const integration = await activeIntegrationOf(brand.partner.id);
  if (!integration || (integration.mode !== "B2B_LINK" && integration.mode !== "FORM")) {
    return { ok: false, error: "Ce partenaire n'a pas de portail ni de formulaire en ligne." };
  }
  const connector = connectorFor(integration, { brandName: brand.name });
  // Le lien est vérifié AVANT de créer quoi que ce soit : pas d'attribution pour un lien inutilisable.
  if (!connector.redirectUrl || connector.redirectUrl("PB-2222-2222") === null) {
    return { ok: false, error: "Le lien de ce partenaire n'est pas utilisable pour l'instant. Demandez plutôt un contact." };
  }

  const kind = integration.mode === "B2B_LINK" ? "B2B_LINK_OPENED" : "FORM_OPENED";
  const attribution = await createAttribution(scope, { kind: "LEAD", source: input.source, partnerId: brand.partner.id, brandId: brand.id, universe: universeOf(input) });
  const url = connector.redirectUrl(attribution.code);
  if (!url) return { ok: false, error: "Le lien de ce partenaire n'est pas utilisable pour l'instant. Demandez plutôt un contact." };
  const lead = await prisma.partnerLead.create({
    data: { attributionId: attribution.id, partnerId: brand.partner.id, brandId: brand.id, pharmacyId: scope.pharmacyId, kind, createdByUserId: scope.userId },
    select: { id: true },
  });
  return { ok: true, data: { leadId: lead.id, code: attribution.code, url, kind, brand: { id: brand.id, slug: brand.slug, name: brand.name } } };
}

// ---------------------------------------------------------------------------
// Commande
// ---------------------------------------------------------------------------

export type OrderInput = {
  brandId: string;
  lines: { productId: string; quantity: number }[];
  note: string | null;
} & AttributionContext;

export type OrderOutcome = {
  orderId: string;
  code: string;
  status: "SUBMITTED" | "TRANSMITTED" | "CONFIRMED" | "FAILED";
  mode: IntegrationMode;
  totalCents: number | null;
  lineCount: number;
  brand: { id: string; slug: string; name: string };
  partnerName: string;
};

/**
 * Une commande auprès d'un partenaire dont le mode le permet (E-mail, Import /
 * export, Manuel). Enregistrée d'abord (SUBMITTED), puis : envoyée par e-mail
 * (TRANSMITTED si l'envoi est réellement parti, FAILED avec le motif sinon),
 * ou laissée à l'équipe PharmaBoost qui la transmet.
 */
export async function placeOrder(scope: PartnerScope, input: OrderInput): Promise<Result<OrderOutcome>> {
  const brand = await brandForPharmacy(scope, input.brandId);
  if (!brand) return { ok: false, error: NOT_OFFERED };
  const integration = await activeIntegrationOf(brand.partner.id);
  if (!integration || !modeAllowsOrder(integration.mode)) return { ok: false, error: "Ce partenaire ne prend pas de commande depuis PharmaBoost pour l'instant. Demandez plutôt un contact." };

  // Une ligne par produit : deux saisies du même produit s'additionnent.
  const quantities = new Map<string, number>();
  for (const line of input.lines) {
    if (line.quantity > 0) quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity);
  }
  if (quantities.size === 0) return { ok: false, error: "Indiquez au moins une quantité." };

  const pilot = await isPartnerPilot(scope.pharmacyId);
  const products = await prisma.partnerProduct.findMany({
    where: { id: { in: [...quantities.keys()] }, brandId: brand.id, isActive: true },
    select: { id: true, name: true, ean: true, cip13: true, externalRef: true, proPriceCents: true, rangeId: true, range: { select: { status: true } } },
  });
  const published = products.filter((product) => !product.range || itemVisible(product.range.status, pilot));
  if (published.length !== quantities.size) return { ok: false, error: "Un produit choisi n'est plus proposé par cette marque. Rechargez la page." };

  const lines = published
    .map((product) => ({
      partnerProductId: product.id,
      name: product.name,
      ean: product.ean ?? product.cip13,
      externalRef: product.externalRef,
      quantity: quantities.get(product.id) ?? 0,
      unitPriceCents: product.proPriceCents,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const totalCents = orderTotalCents(lines);
  const rangeIds = new Set(published.map((product) => product.rangeId));
  const rangeId = rangeIds.size === 1 ? ([...rangeIds][0] ?? null) : null;

  const attribution = await createAttribution(scope, { kind: "ORDER", source: input.source, partnerId: brand.partner.id, brandId: brand.id, rangeId, universe: universeOf(input) });
  const order = await prisma.partnerOrder.create({
    data: {
      attributionId: attribution.id,
      partnerId: brand.partner.id,
      brandId: brand.id,
      pharmacyId: scope.pharmacyId,
      integrationMode: integration.mode,
      status: "SUBMITTED",
      totalCents,
      partnerReference: null,
      note: input.note,
      createdByUserId: scope.userId,
      lines: { create: lines.map(({ partnerProductId, name, ean, quantity, unitPriceCents }) => ({ partnerProductId, name, ean, quantity, unitPriceCents })) },
    },
    select: { id: true },
  });

  const pharmacy = await pharmacyIdentity(scope.pharmacyId);
  const connector = connectorFor(integration, { brandName: brand.name, fallbackOrderEmail: integration.mode === "EMAIL" && !integration.orderEmail?.trim() ? await orderContactEmail(brand.partner.id) : null });

  let status: OrderOutcome["status"] = "SUBMITTED";
  let detail = "Enregistrée : l'équipe PharmaBoost la transmet au partenaire.";
  if (connector.orderHandling === "CONNECTOR" && connector.submitOrder) {
    const result = await connector.submitOrder({
      attributionCode: attribution.code,
      pharmacy,
      lines: lines.map(({ name, ean, externalRef, quantity, unitPriceCents }) => ({ name, ean, externalRef, quantity, unitPriceCents })),
      totalCents,
      note: input.note,
    });
    const now = new Date();
    if (result.ok) {
      status = result.data.status;
      detail = result.data.detail;
      await prisma.partnerOrder.updateMany({
        where: { id: order.id, pharmacyId: scope.pharmacyId },
        data: { status, statusDetail: detail, transmittedAt: now, confirmedAt: status === "CONFIRMED" ? now : null, partnerReference: result.data.partnerReference },
      });
    } else {
      status = "FAILED";
      detail = result.message;
      await prisma.partnerOrder.updateMany({ where: { id: order.id, pharmacyId: scope.pharmacyId }, data: { status, statusDetail: detail } });
    }
  } else {
    await prisma.partnerOrder.updateMany({ where: { id: order.id, pharmacyId: scope.pharmacyId }, data: { statusDetail: detail } });
  }

  const units = lines.reduce((sum, line) => sum + line.quantity, 0);
  // La note est gardée sur la commande ; hors e-mail, elle est aussi reprise dans la notification de l'équipe.
  const note = input.note && connector.orderHandling !== "CONNECTOR" ? ` · Note : ${input.note.replace(/\s+/g, " ").slice(0, 300)}` : "";
  await notifyAdmins({
    type: "PARTNER_ORDER",
    title: `Commande ${brand.name} — ${pharmacy.name}`,
    body: `${pharmacy.name}${pharmacy.city ? ` (${pharmacy.city})` : ""} · ${lines.length} produit${lines.length > 1 ? "s" : ""}, ${units} unité${units > 1 ? "s" : ""} · ${totalCents !== null ? formatCents(totalCents) : "montant à confirmer"} · ${INTEGRATION_MODE_LABELS[integration.mode]} · ${ORDER_STATUS_LABELS[status]} · ${attribution.code} · ${detail}${note}`,
    linkUrl: ADMIN_ORDERS,
    severity: status === "FAILED" ? "WARNING" : status === "SUBMITTED" ? "INFO" : "SUCCESS",
  });

  return {
    ok: true,
    data: { orderId: order.id, code: attribution.code, status, mode: integration.mode, totalCents, lineCount: lines.length, brand: { id: brand.id, slug: brand.slug, name: brand.name }, partnerName: brand.partner.name },
  };
}

// ---------------------------------------------------------------------------
// Historique de l'officine
// ---------------------------------------------------------------------------

export type PartnerActivityItem = {
  id: string;
  type: "ORDER" | "LEAD";
  label: string;
  code: string;
  status: string;
  totalCents: number | null;
  createdAt: Date;
};

const LEAD_STATUS_LABELS: Record<string, string> = { NEW: "Enregistrée", TRANSMITTED: "Transmise", CLOSED: "Close" };

/** Les dernières demandes et commandes de CETTE officine auprès d'un partenaire. */
export async function partnerActivity(scope: PartnerScope, partnerId: string, limit = 8): Promise<PartnerActivityItem[]> {
  const [orders, leads] = await Promise.all([
    prisma.partnerOrder.findMany({
      where: { pharmacyId: scope.pharmacyId, partnerId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, status: true, totalCents: true, createdAt: true, attribution: { select: { code: true } }, _count: { select: { lines: true } } },
    }),
    prisma.partnerLead.findMany({
      where: { pharmacyId: scope.pharmacyId, partnerId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, kind: true, status: true, createdAt: true, attribution: { select: { code: true } } },
    }),
  ]);
  const items: PartnerActivityItem[] = [
    ...orders.map((order) => ({
      id: order.id,
      type: "ORDER" as const,
      label: `Commande · ${order._count.lines} produit${order._count.lines > 1 ? "s" : ""}`,
      code: order.attribution.code,
      status: ORDER_STATUS_LABELS[order.status],
      totalCents: order.totalCents,
      createdAt: order.createdAt,
    })),
    ...leads.map((lead) => ({
      id: lead.id,
      type: "LEAD" as const,
      label: LEAD_KIND_LABELS[lead.kind],
      code: lead.attribution.code,
      status: lead.kind === "CONTACT_REQUEST" ? (LEAD_STATUS_LABELS[lead.status] ?? lead.status) : "Ouvert",
      totalCents: null,
      createdAt: lead.createdAt,
    })),
  ];
  return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}
