import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import type { TenantScope } from "@/server/db/tenant";
import { validateOffer, type OfferInput } from "@/core/patient-app/offers";

/**
 * Les offres de l'appli des patients, côté pharmacie et côté console (fondateur, 22 oct. 2026).
 *
 *  - le titulaire publie les offres de SA pharmacie (l'officine vient de la session, jamais de la requête) ;
 *  - la console publie les offres des laboratoires, valables dans tout le réseau, et voit ce que chaque laboratoire doit
 *    (boîtes vendues avec l'offre × prix par boîte) ;
 *  - la console voit les pharmacies que les inscrits réclament.
 */

/** Les mots génériques qui ne désignent pas, à eux seuls, un médicament (« Vitamine », « Zinc »…). */
const GENERIC_WORDS = new Set(["VITAMINE", "VITAMINES", "MAGNESIUM", "CALCIUM", "HUILE", "CREME", "SERUM", "SPRAY", "GAMME", "COMPLEMENT", "COMPLEMENTS", "PROBIOTIQUES", "SOLAIRE", "SOLAIRES", "SOINS", "BEBE", "VISAGE", "CORPS", "CHEVEUX", "MINCEUR", "SOMMEIL", "ARTICULATIONS"]);

/** Le libellé nomme-t-il un médicament du catalogue national (premier mot significatif = début d'un nom de spécialité) ? */
async function namesAMedicine(labels: string[]): Promise<boolean> {
  const words = new Set<string>();
  for (const label of labels) {
    for (const word of label.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().split(/[^A-Z0-9]+/)) {
      if (word.length >= 5 && !GENERIC_WORDS.has(word)) words.add(word);
    }
  }
  if (words.size === 0) return false;
  const hit = await prisma.drugSpecialty.findFirst({ where: { OR: [...words].map((word) => ({ searchName: { startsWith: `${word} ` } })) }, select: { id: true } });
  return hit !== null;
}

async function checkOffer(input: OfferInput, now: Date) {
  const medicine = await namesAMedicine([input.title, input.rangeLabel]);
  return validateOffer(input, now, () => medicine);
}

export type OfferStats = { codes: number; redeemed: number };

export type PharmacyOfferRow = {
  id: string;
  title: string;
  rangeLabel: string;
  discountPercent: number;
  details: string | null;
  audience: "ALL" | "SUBSCRIBERS";
  status: "ACTIVE" | "CANCELED";
  startsAt: Date;
  endsAt: Date;
  createdByName: string | null;
  stats: OfferStats;
};

async function statsFor(offerIds: string[]): Promise<Map<string, OfferStats>> {
  const out = new Map<string, OfferStats>();
  if (offerIds.length === 0) return out;
  const [issued, redeemed] = await Promise.all([
    prisma.patientOfferCode.groupBy({ by: ["offerId"], where: { offerId: { in: offerIds } }, _count: { _all: true } }),
    prisma.patientOfferCode.groupBy({ by: ["offerId"], where: { offerId: { in: offerIds }, redeemedAt: { not: null } }, _count: { _all: true } }),
  ]);
  for (const id of offerIds) out.set(id, { codes: 0, redeemed: 0 });
  for (const row of issued) out.get(row.offerId)!.codes = row._count._all;
  for (const row of redeemed) out.get(row.offerId)!.redeemed = row._count._all;
  return out;
}

// ---------------------------------------------------------------- Titulaire

export type PharmacyOffersOverview = {
  offers: PharmacyOfferRow[];
  members: { total: number; plus: number };
  /** Les offres de laboratoire en cours : elles valent aussi chez lui, remboursées par le laboratoire. */
  labOffers: { id: string; title: string; rangeLabel: string; discountPercent: number; endsAt: Date; partnerName: string | null; redeemedHere: number }[];
};

export async function getPharmacyOffersOverview(scope: TenantScope, now = new Date()): Promise<PharmacyOffersOverview> {
  const [rows, total, plus, labs] = await Promise.all([
    prisma.patientOffer.findMany({
      where: { pharmacyId: scope.pharmacyId, funding: "PHARMACY" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, title: true, rangeLabel: true, discountPercent: true, details: true, audience: true, status: true, startsAt: true, endsAt: true, createdByName: true },
    }),
    prisma.appMember.count({ where: { homePharmacyId: scope.pharmacyId } }),
    prisma.appMember.count({ where: { homePharmacyId: scope.pharmacyId, plan: "PLUS" } }),
    prisma.patientOffer.findMany({
      where: { funding: "LAB", status: "ACTIVE", startsAt: { lte: now }, endsAt: { gte: now } },
      orderBy: { endsAt: "asc" },
      take: 20,
      select: { id: true, title: true, rangeLabel: true, discountPercent: true, endsAt: true, partner: { select: { name: true } }, _count: { select: { codes: { where: { redeemedPharmacyId: scope.pharmacyId } } } } },
    }),
  ]);
  const stats = await statsFor(rows.map((row) => row.id));
  return {
    offers: rows.map((row) => ({ ...row, stats: stats.get(row.id) ?? { codes: 0, redeemed: 0 } })),
    members: { total, plus },
    labOffers: labs.map((row) => ({ id: row.id, title: row.title, rangeLabel: row.rangeLabel, discountPercent: row.discountPercent, endsAt: row.endsAt, partnerName: row.partner?.name ?? null, redeemedHere: row._count.codes })),
  };
}

export async function createPharmacyOffer(scope: TenantScope, authorName: string, input: OfferInput & { audience: "ALL" | "SUBSCRIBERS" }, now = new Date()): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const checked = await checkOffer(input, now);
  if (!checked.ok) return checked;
  const created = await prisma.patientOffer.create({
    data: { funding: "PHARMACY", pharmacyId: scope.pharmacyId, audience: input.audience === "ALL" ? "ALL" : "SUBSCRIBERS", createdByName: authorName.slice(0, 80), ...checked.value },
    select: { id: true },
  });
  await recordAudit({ action: "patient_offer.created", entityType: "PatientOffer", entityId: created.id, pharmacyId: scope.pharmacyId, userId: scope.userId, metadata: { discountPercent: checked.value.discountPercent, audience: input.audience } });
  return { ok: true, id: created.id };
}

/** Arrêter une offre de SA pharmacie : les codes déjà donnés ne passent plus au comptoir. */
export async function cancelPharmacyOffer(scope: TenantScope, offerId: string): Promise<boolean> {
  const done = await prisma.patientOffer.updateMany({ where: { id: offerId, pharmacyId: scope.pharmacyId, funding: "PHARMACY", status: "ACTIVE" }, data: { status: "CANCELED" } });
  if (done.count > 0) await recordAudit({ action: "patient_offer.canceled", entityType: "PatientOffer", entityId: offerId, pharmacyId: scope.pharmacyId, userId: scope.userId });
  return done.count > 0;
}

// ---------------------------------------------------------------- Console : offres des laboratoires

export type LabOfferRow = {
  id: string;
  title: string;
  rangeLabel: string;
  discountPercent: number;
  audience: "ALL" | "SUBSCRIBERS";
  status: "ACTIVE" | "CANCELED";
  startsAt: Date;
  endsAt: Date;
  labFeeCents: number;
  partner: { id: string; name: string } | null;
  stats: OfferStats;
  /** Ce que le laboratoire doit à PharmaBoost : boîtes vendues avec l'offre × prix par boîte. */
  dueCents: number;
  pharmacies: number;
};

export type LabOffersOverview = {
  offers: LabOfferRow[];
  partners: { id: string; name: string }[];
  members: { total: number; plus: number };
};

export async function getLabOffersOverview(): Promise<LabOffersOverview> {
  const [rows, partners, total, plus] = await Promise.all([
    prisma.patientOffer.findMany({
      where: { funding: "LAB" },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, title: true, rangeLabel: true, discountPercent: true, audience: true, status: true, startsAt: true, endsAt: true, labFeeCents: true, partner: { select: { id: true, name: true } } },
    }),
    prisma.partner.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true }, take: 300 }),
    prisma.appMember.count(),
    prisma.appMember.count({ where: { plan: "PLUS" } }),
  ]);
  const ids = rows.map((row) => row.id);
  const [stats, spread] = await Promise.all([
    statsFor(ids),
    ids.length ? prisma.patientOfferCode.groupBy({ by: ["offerId", "redeemedPharmacyId"], where: { offerId: { in: ids }, redeemedAt: { not: null } } }) : Promise.resolve([] as { offerId: string }[]),
  ]);
  const pharmaciesPerOffer = new Map<string, number>();
  for (const row of spread) pharmaciesPerOffer.set(row.offerId, (pharmaciesPerOffer.get(row.offerId) ?? 0) + 1);
  return {
    offers: rows.map((row) => {
      const s = stats.get(row.id) ?? { codes: 0, redeemed: 0 };
      const fee = row.labFeeCents ?? 0;
      return { ...row, labFeeCents: fee, stats: s, dueCents: s.redeemed * fee, pharmacies: pharmaciesPerOffer.get(row.id) ?? 0 };
    }),
    partners,
    members: { total, plus },
  };
}

export async function createLabOffer(
  admin: { id: string; name: string },
  input: OfferInput & { audience: "ALL" | "SUBSCRIBERS"; partnerId: string; labFeeCents: number },
  now = new Date(),
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const partner = await prisma.partner.findFirst({ where: { id: input.partnerId, status: "ACTIVE" }, select: { id: true } });
  if (!partner) return { ok: false, error: "Choisissez un laboratoire partenaire actif." };
  if (!Number.isInteger(input.labFeeCents) || input.labFeeCents < 0 || input.labFeeCents > 10_000) return { ok: false, error: "Le prix par boîte va de 0 à 100 €." };
  const checked = await checkOffer(input, now);
  if (!checked.ok) return checked;
  const created = await prisma.patientOffer.create({
    data: { funding: "LAB", partnerId: partner.id, labFeeCents: input.labFeeCents, audience: input.audience === "ALL" ? "ALL" : "SUBSCRIBERS", createdByName: admin.name.slice(0, 80), ...checked.value },
    select: { id: true },
  });
  await recordAudit({ action: "patient_offer.lab_created", entityType: "PatientOffer", entityId: created.id, platformAdminId: admin.id, metadata: { partnerId: partner.id, labFeeCents: input.labFeeCents } });
  return { ok: true, id: created.id };
}

export async function cancelLabOffer(admin: { id: string }, offerId: string): Promise<boolean> {
  const done = await prisma.patientOffer.updateMany({ where: { id: offerId, funding: "LAB", status: "ACTIVE" }, data: { status: "CANCELED" } });
  if (done.count > 0) await recordAudit({ action: "patient_offer.lab_canceled", entityType: "PatientOffer", entityId: offerId, platformAdminId: admin.id });
  return done.count > 0;
}

// ---------------------------------------------------------------- Console : pharmacies réclamées

export type ClaimedPharmacy = {
  key: string;
  pharmacyName: string;
  city: string;
  postalCode: string;
  /** Les inscrits qui veulent qu'elle rejoigne PharmaBoost. */
  wanting: number;
  /** Tous ceux qui l'ont déclarée comme leur pharmacie. */
  declared: number;
  plus: number;
  lastAt: Date;
  handledAt: Date | null;
  handledNote: string | null;
};

/** Les pharmacies hors réseau déclarées par les inscrits, regroupées, les plus réclamées d'abord. */
export async function listClaimedPharmacies(): Promise<ClaimedPharmacy[]> {
  const rows = await prisma.pharmacyJoinRequest.findMany({
    orderBy: { updatedAt: "desc" },
    take: 5000,
    select: { key: true, pharmacyName: true, city: true, postalCode: true, wantsJoin: true, updatedAt: true, handledAt: true, handledNote: true, member: { select: { plan: true } } },
  });
  const groups = new Map<string, ClaimedPharmacy>();
  for (const row of rows) {
    const group = groups.get(row.key) ?? { key: row.key, pharmacyName: row.pharmacyName, city: row.city, postalCode: row.postalCode, wanting: 0, declared: 0, plus: 0, lastAt: row.updatedAt, handledAt: row.handledAt, handledNote: row.handledNote };
    group.declared += 1;
    if (row.wantsJoin) group.wanting += 1;
    if (row.member.plan === "PLUS") group.plus += 1;
    if (row.updatedAt > group.lastAt) group.lastAt = row.updatedAt;
    if (row.handledAt && (!group.handledAt || row.handledAt > group.handledAt)) {
      group.handledAt = row.handledAt;
      group.handledNote = row.handledNote;
    }
    groups.set(row.key, group);
  }
  return [...groups.values()].sort((a, b) => b.wanting - a.wanting || b.declared - a.declared || b.lastAt.getTime() - a.lastAt.getTime());
}

/** « Contactée » : la console note la suite donnée (appel du commercial, rendez-vous…). */
export async function markClaimedPharmacy(admin: { id: string }, key: string, note: string): Promise<number> {
  const done = await prisma.pharmacyJoinRequest.updateMany({ where: { key }, data: { handledAt: new Date(), handledNote: note.trim().slice(0, 200) || "Contactée" } });
  if (done.count > 0) await recordAudit({ action: "pharmacy_join_request.handled", entityType: "PharmacyJoinRequest", entityId: key, platformAdminId: admin.id, metadata: { count: done.count } });
  return done.count;
}
