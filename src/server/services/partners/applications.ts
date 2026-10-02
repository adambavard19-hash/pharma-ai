import "server-only";
import { prisma } from "@/server/db/client";
import { APPLICATION_STATUSES, canMoveApplication, type ApplicationStatus, type PublicationStatus } from "@/core/partners/status";
import { isUniqueViolation, knownUniverses, normalizeWebsite, pickUniqueSlug, takenPartnerSlugs, type PartnerIdentityData } from "./partners";

/**
 * Les candidatures des laboratoires, côté console.
 *
 * Une candidature arrive du site public en « Nouveau » ; l'équipe PharmaBoost
 * la fait avancer pas à pas (transitions de src/core/partners/status.ts),
 * annote, puis crée la fiche partenaire une fois la candidature acceptée.
 * Rien n'est activé automatiquement : la fiche créée reste en BROUILLON,
 * invisible des officines, jusqu'à une publication explicite.
 *
 * Chaque changement de statut et chaque note laisse un événement daté, avec
 * l'administrateur qui l'a fait.
 */

/** Les sortes d'événements écrits par la console. */
export const APPLICATION_EVENT_KINDS = {
  STATUS_CHANGED: "STATUS_CHANGED",
  NOTE: "NOTE",
  PARTNER_CREATED: "PARTNER_CREATED",
} as const;

export type ApplicationListRow = {
  id: string;
  createdAt: Date;
  company: string;
  brand: string;
  contactName: string;
  email: string;
  universes: string[];
  status: ApplicationStatus;
  partnerId: string | null;
};

export type ApplicationList = {
  rows: ApplicationListRow[];
  counts: Record<ApplicationStatus, number>;
  total: number;
};

export async function listApplications(status: ApplicationStatus | null): Promise<ApplicationList> {
  const [rows, grouped] = await Promise.all([
    prisma.partnerApplication.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, company: true, brand: true, contactFirstName: true, contactLastName: true, email: true, universes: true, status: true, partnerId: true },
    }),
    prisma.partnerApplication.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries(APPLICATION_STATUSES.map((value) => [value, 0])) as Record<ApplicationStatus, number>;
  for (const group of grouped) counts[group.status] = group._count._all;
  return {
    rows: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      company: row.company,
      brand: row.brand,
      contactName: `${row.contactFirstName} ${row.contactLastName}`.trim(),
      email: row.email,
      universes: row.universes,
      status: row.status,
      partnerId: row.partnerId,
    })),
    counts,
    total: Object.values(counts).reduce((sum, value) => sum + value, 0),
  };
}

export type TimelineEntry = {
  id: string;
  at: Date;
  kind: "RECEIVED" | "ACKNOWLEDGED" | "STATUS_CHANGED" | "NOTE" | "PARTNER_CREATED" | "OTHER";
  rawKind: string;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus | null;
  note: string | null;
  /** Nom de l'administrateur auteur, s'il est connu. */
  author: string | null;
};

type EventRow = { id: string; kind: string; fromStatus: ApplicationStatus | null; toStatus: ApplicationStatus | null; note: string | null; platformAdminId: string | null; createdAt: Date };

function entryKind(kind: string): TimelineEntry["kind"] {
  if (kind === APPLICATION_EVENT_KINDS.STATUS_CHANGED) return "STATUS_CHANGED";
  if (kind === APPLICATION_EVENT_KINDS.NOTE) return "NOTE";
  if (kind === APPLICATION_EVENT_KINDS.PARTNER_CREATED) return "PARTNER_CREATED";
  if (/RECEIV/i.test(kind)) return "RECEIVED";
  if (/ACK/i.test(kind)) return "ACKNOWLEDGED";
  return "OTHER";
}

/**
 * L'historique dans l'ordre chronologique. La réception et l'accusé sont
 * repris des dates de la candidature elle-même quand aucun événement ne les
 * porte : ce sont des faits enregistrés, pas des entrées reconstituées.
 */
export function buildTimeline(application: { id: string; createdAt: Date; acknowledgedAt: Date | null }, events: EventRow[], adminNames: Map<string, string>): TimelineEntry[] {
  const entries: TimelineEntry[] = events.map((event) => ({
    id: event.id,
    at: event.createdAt,
    kind: entryKind(event.kind),
    rawKind: event.kind,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    note: event.note,
    author: event.platformAdminId ? (adminNames.get(event.platformAdminId) ?? null) : null,
  }));
  if (!entries.some((entry) => entry.kind === "RECEIVED")) {
    entries.push({ id: `${application.id}:received`, at: application.createdAt, kind: "RECEIVED", rawKind: "RECEIVED", fromStatus: null, toStatus: null, note: null, author: null });
  }
  if (application.acknowledgedAt && !entries.some((entry) => entry.kind === "ACKNOWLEDGED")) {
    entries.push({ id: `${application.id}:acknowledged`, at: application.acknowledgedAt, kind: "ACKNOWLEDGED", rawKind: "ACKNOWLEDGED", fromStatus: null, toStatus: null, note: null, author: null });
  }
  // À la même seconde, la réception passe avant tout le reste.
  const rank = (entry: TimelineEntry) => (entry.kind === "RECEIVED" ? 0 : entry.kind === "ACKNOWLEDGED" ? 1 : 2);
  return entries.sort((a, b) => a.at.getTime() - b.at.getTime() || rank(a) - rank(b));
}

export type ApplicationDetail = {
  id: string;
  status: ApplicationStatus;
  company: string;
  brand: string;
  contactFirstName: string;
  contactLastName: string;
  contactRole: string | null;
  email: string;
  phone: string | null;
  website: string | null;
  universes: string[];
  approxReferences: number | null;
  distribution: string | null;
  hasApi: "YES" | "NO" | "UNKNOWN";
  hasB2bPortal: boolean | null;
  hasCatalog: boolean | null;
  hasTrainings: boolean | null;
  message: string | null;
  consentAt: Date;
  acknowledgedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  partner: { id: string; name: string; status: PublicationStatus } | null;
  timeline: TimelineEntry[];
};

export async function getApplication(id: string): Promise<ApplicationDetail | null> {
  const application = await prisma.partnerApplication.findFirst({
    where: { id },
    include: {
      partner: { select: { id: true, name: true, status: true } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!application) return null;

  const adminIds = [...new Set(application.events.map((event) => event.platformAdminId).filter((value): value is string => Boolean(value)))];
  const admins = adminIds.length > 0 ? await prisma.platformAdmin.findMany({ where: { id: { in: adminIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
  const adminNames = new Map(admins.map((admin) => [admin.id, `${admin.firstName} ${admin.lastName}`.trim()]));

  const { events, partner, ...fields } = application;
  return {
    ...fields,
    partner,
    timeline: buildTimeline(application, events, adminNames),
  };
}

export type MoveResult =
  | { ok: true; from: ApplicationStatus; to: ApplicationStatus; label: string }
  | { ok: false; reason: "NOT_FOUND" | "FORBIDDEN_TRANSITION" | "NEEDS_PARTNER" | "CONFLICT" };

/** Fait avancer une candidature d'un statut à un autre, selon les seules transitions permises. */
export async function moveApplication(id: string, to: ApplicationStatus, adminId: string): Promise<MoveResult> {
  const application = await prisma.partnerApplication.findFirst({ where: { id }, select: { status: true, partnerId: true, brand: true, company: true } });
  if (!application) return { ok: false, reason: "NOT_FOUND" };
  const from = application.status;
  if (!canMoveApplication(from, to, Boolean(application.partnerId))) {
    return { ok: false, reason: to === "ACTIVE_PARTNER" && canMoveApplication(from, to, true) ? "NEEDS_PARTNER" : "FORBIDDEN_TRANSITION" };
  }
  const moved = await prisma.$transaction(async (tx) => {
    // Conditionné au statut lu : deux gestes simultanés ne s'écrasent pas.
    const updated = await tx.partnerApplication.updateMany({ where: { id, status: from }, data: { status: to } });
    if (updated.count === 0) return false;
    await tx.partnerApplicationEvent.create({ data: { applicationId: id, kind: APPLICATION_EVENT_KINDS.STATUS_CHANGED, fromStatus: from, toStatus: to, platformAdminId: adminId } });
    return true;
  });
  if (!moved) return { ok: false, reason: "CONFLICT" };
  return { ok: true, from, to, label: application.brand || application.company };
}

export async function addApplicationNote(id: string, note: string, adminId: string): Promise<{ ok: true; eventId: string } | { ok: false }> {
  const application = await prisma.partnerApplication.findFirst({ where: { id }, select: { id: true } });
  if (!application) return { ok: false };
  const event = await prisma.partnerApplicationEvent.create({
    data: { applicationId: id, kind: APPLICATION_EVENT_KINDS.NOTE, note, platformAdminId: adminId },
    select: { id: true },
  });
  return { ok: true, eventId: event.id };
}

/** Ce que la candidature apporte à la fiche partenaire : identité et contact principal. */
export function partnerDraftFromApplication(application: {
  company: string;
  brand: string;
  website: string | null;
  universes: string[];
  contactFirstName: string;
  contactLastName: string;
  contactRole: string | null;
  email: string;
  phone: string | null;
}): { identity: PartnerIdentityData; contact: { firstName: string; lastName: string; role: string | null; email: string | null; phone: string | null } } {
  // Le partenaire est la société (le laboratoire) ; la marque se crée ensuite, à part, dans « Marques ».
  const name = application.company.trim() || application.brand.trim();
  const website = normalizeWebsite(application.website);
  return {
    identity: {
      name,
      legalName: application.company.trim() || null,
      website: website.ok ? website.value : null,
      logoUrl: null,
      description: null,
      universes: knownUniverses(application.universes),
      startsAt: null,
      endsAt: null,
      notes: null,
    },
    contact: {
      firstName: application.contactFirstName.trim(),
      lastName: application.contactLastName.trim(),
      role: application.contactRole?.trim() || null,
      email: application.email.trim().toLowerCase() || null,
      phone: application.phone?.trim() || null,
    },
  };
}

export type CreateFromApplicationResult =
  | { ok: true; partnerId: string; name: string }
  | { ok: false; reason: "NOT_FOUND" | "NOT_ACCEPTED" | "ALREADY_LINKED" | "CONFLICT" };

/** Levée dans la transaction quand la candidature a changé entre la lecture et l'écriture. */
class ApplicationChanged extends Error {}

/**
 * Crée la fiche partenaire d'une candidature ACCEPTÉE et sans fiche : un
 * partenaire en BROUILLON (rien n'est publié), son contact principal repris
 * de la candidature, le lien candidature → partenaire et un événement. Le
 * tout dans une seule transaction : si la candidature a changé entre-temps
 * (déjà reliée, plus acceptée), rien n'est écrit. Une collision de slug
 * simultanée est rejouée.
 */
export async function createPartnerFromApplication(id: string, adminId: string): Promise<CreateFromApplicationResult> {
  const application = await prisma.partnerApplication.findFirst({ where: { id } });
  if (!application) return { ok: false, reason: "NOT_FOUND" };
  if (application.partnerId) return { ok: false, reason: "ALREADY_LINKED" };
  if (application.status !== "ACCEPTED") return { ok: false, reason: "NOT_ACCEPTED" };

  const draft = partnerDraftFromApplication(application);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = pickUniqueSlug(draft.identity.name, await takenPartnerSlugs(draft.identity.name));
    try {
      const partner = await prisma.$transaction(async (tx) => {
        const created = await tx.partner.create({ data: { ...draft.identity, slug, status: "DRAFT", createdByAdminId: adminId }, select: { id: true } });
        const updated = await tx.partnerApplication.updateMany({ where: { id, status: "ACCEPTED", partnerId: null }, data: { partnerId: created.id } });
        if (updated.count === 0) throw new ApplicationChanged();
        if (draft.contact.firstName && draft.contact.lastName) {
          await tx.partnerContact.create({ data: { ...draft.contact, partnerId: created.id, isPrimary: true, receivesOrders: false } });
        }
        await tx.partnerApplicationEvent.create({
          data: { applicationId: id, kind: APPLICATION_EVENT_KINDS.PARTNER_CREATED, note: `Fiche partenaire « ${draft.identity.name} » créée en brouillon.`, platformAdminId: adminId },
        });
        return created;
      });
      return { ok: true, partnerId: partner.id, name: draft.identity.name };
    } catch (error) {
      if (error instanceof ApplicationChanged) return { ok: false, reason: "CONFLICT" };
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }
  throw new Error("createPartnerFromApplication : aucun slug libre après 5 essais");
}
