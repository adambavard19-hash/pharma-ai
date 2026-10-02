import "server-only";
import { prisma } from "@/server/db/client";
import { canMovePublication, PUBLICATION_STATUS_LABELS, type PublicationStatus } from "@/core/partners/status";
import type { ServiceResult } from "./brands";

/**
 * Les conditions professionnelles qu'un partenaire propose aux officines
 * (remise, minimum de commande, période). Elles suivent le même cycle de
 * publication que les marques : une offre n'est vue qu'en TEST (groupe
 * pilote) ou ACTIVE, et seulement par les officines qui voient la marque.
 */

export type ConsoleOfferRow = {
  id: string;
  title: string;
  conditions: string;
  discountPercent: number | null;
  minimumOrderCents: number | null;
  /** AAAA-MM-JJ. */
  validFrom: string | null;
  validTo: string | null;
  status: PublicationStatus;
  partner: { id: string; name: string };
  brand: { id: string; name: string } | null;
  range: { id: string; name: string } | null;
  updatedAt: string;
};

function decimalToNumber(value: { toString(): string } | null): number | null {
  if (value === null) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

export async function listConsoleOffers(filter: { brandId?: string | null; partnerId?: string | null }): Promise<ConsoleOfferRow[]> {
  const offers = await prisma.partnerOffer.findMany({
    where: { ...(filter.brandId ? { brandId: filter.brandId } : {}), ...(filter.partnerId ? { partnerId: filter.partnerId } : {}) },
    orderBy: [{ partner: { name: "asc" } }, { updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      conditions: true,
      discountPercent: true,
      minimumOrderCents: true,
      validFrom: true,
      validTo: true,
      status: true,
      updatedAt: true,
      partner: { select: { id: true, name: true } },
      brand: { select: { id: true, name: true } },
      range: { select: { id: true, name: true } },
    },
  });
  return offers.map((offer) => ({
    ...offer,
    discountPercent: decimalToNumber(offer.discountPercent),
    validFrom: day(offer.validFrom),
    validTo: day(offer.validTo),
    updatedAt: offer.updatedAt.toISOString(),
  }));
}

export type OfferTarget = { id: string; name: string; brands: { id: string; name: string; ranges: { id: string; name: string }[] }[] };

/** Partenaires, leurs marques et leurs gammes : ce à quoi une offre peut se rattacher. */
export async function listOfferTargets(): Promise<OfferTarget[]> {
  return prisma.partner.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      brands: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, ranges: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } } },
      },
    },
  });
}

export type OfferInput = {
  partnerId: string;
  brandId: string;
  rangeId: string | null;
  title: string;
  conditions: string;
  discountPercent: number | null;
  minimumOrderCents: number | null;
  validFrom: Date | null;
  validTo: Date | null;
};

/** Crée (en brouillon) ou modifie une offre. La marque doit appartenir au partenaire, la gamme à la marque. */
export async function saveOffer(offerId: string | null, input: OfferInput): Promise<ServiceResult<{ id: string; created: boolean; partnerId: string }>> {
  const brand = await prisma.partnerBrand.findFirst({ where: { id: input.brandId, partnerId: input.partnerId }, select: { id: true, partnerId: true } });
  if (!brand) return { ok: false, error: "Cette marque n'appartient pas au partenaire choisi.", field: "brandId" };
  if (input.rangeId) {
    const range = await prisma.partnerRange.findFirst({ where: { id: input.rangeId, brandId: brand.id }, select: { id: true } });
    if (!range) return { ok: false, error: "Cette gamme n'appartient pas à la marque choisie.", field: "rangeId" };
  }
  if (input.validFrom && input.validTo && input.validTo < input.validFrom) return { ok: false, error: "La fin de validité précède son début.", field: "validTo" };

  const data = {
    partnerId: brand.partnerId,
    brandId: brand.id,
    rangeId: input.rangeId,
    title: input.title,
    conditions: input.conditions,
    discountPercent: input.discountPercent,
    minimumOrderCents: input.minimumOrderCents,
    validFrom: input.validFrom,
    validTo: input.validTo,
  };
  if (offerId) {
    const offer = await prisma.partnerOffer.findFirst({ where: { id: offerId }, select: { id: true } });
    if (!offer) return { ok: false, error: "Offre introuvable." };
    await prisma.partnerOffer.update({ where: { id: offer.id }, data });
    return { ok: true, data: { id: offer.id, created: false, partnerId: brand.partnerId } };
  }
  const created = await prisma.partnerOffer.create({ data: { ...data, status: "DRAFT" }, select: { id: true } });
  return { ok: true, data: { id: created.id, created: true, partnerId: brand.partnerId } };
}

export async function changeOfferStatus(offerId: string, to: PublicationStatus): Promise<ServiceResult<{ title: string; partnerId: string; from: PublicationStatus; to: PublicationStatus }>> {
  const offer = await prisma.partnerOffer.findFirst({ where: { id: offerId }, select: { id: true, title: true, status: true, partnerId: true } });
  if (!offer) return { ok: false, error: "Offre introuvable." };
  if (!canMovePublication(offer.status, to)) {
    return { ok: false, error: `Passage de « ${PUBLICATION_STATUS_LABELS[offer.status]} » à « ${PUBLICATION_STATUS_LABELS[to]} » impossible.` };
  }
  await prisma.partnerOffer.update({ where: { id: offer.id }, data: { status: to } });
  return { ok: true, data: { title: offer.title, partnerId: offer.partnerId, from: offer.status, to } };
}
