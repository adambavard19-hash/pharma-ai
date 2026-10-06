import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { getStorageProvider } from "@/server/ai/registry";
import { createSalesRep, sendSalesInvitation } from "@/server/services/sales/reps";
import { applicationEventActorId, auditIdentity, splitEventActors, type RepActorInput } from "@/server/services/sales/rep-actor";
import { getStandardCommissionCents } from "@/server/services/standard-commission";
import { SALES_APPLICATION_STATUSES, SALES_APPLICATION_STATUS_LABELS, SALES_APPLICATION_STATUS_TONES, type SalesApplicationStatusKey } from "@/core/sales-applications/status";
import { formatPriceEuros } from "@/core/pricing/official-offer";
import type { TimelineEntry } from "@/core/admin/timeline";

/**
 * Les candidatures commerciales, côté console.
 *
 * Une candidature arrive du site public en « Nouvelle » ; l'équipe la fait
 * passer d'un statut à un autre, l'annote, puis, une fois acceptée, en fait un
 * commercial d'un seul geste. Rien n'est créé automatiquement : un commercial
 * n'existe que par la décision d'un administrateur.
 *
 * Chaque changement de statut, chaque note et la création du commercial
 * laissent un événement daté (historique de la fiche) et une ligne d'audit.
 * L'audit ne contient jamais la donnée personnelle du candidat : des
 * identifiants, des statuts, des compteurs.
 *
 * Les gestes (statut, note, transformation, CV) sont ceux de la console comme
 * ceux du directeur commercial : chaque fonction reçoit l'acteur (`actor`) soit
 * comme identifiant d'administrateur (forme historique), soit comme acteur
 * complet `{ type: "ADMIN" | "DIRECTOR", id, label }`.
 */

export const SALES_APPLICATIONS_PAGE_SIZE = 25;

export const SALES_APPLICATION_EVENT_KINDS = {
  CREATED: "CREATED",
  STATUS_CHANGED: "STATUS_CHANGED",
  NOTE: "NOTE",
  CONVERTED: "CONVERTED",
} as const;

// ---------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------

export type SalesApplicationRow = {
  id: string;
  createdAt: Date;
  firstName: string;
  lastName: string;
  email: string;
  city: string;
  zone: string;
  status: SalesApplicationStatusKey;
  hasCv: boolean;
  converted: boolean;
};

export type SalesApplicationList = {
  rows: SalesApplicationRow[];
  /** Compteurs par statut, pour la recherche en cours (le statut choisi ne les réduit pas). */
  counts: Record<SalesApplicationStatusKey, number>;
  /** Toutes les candidatures de la recherche, tous statuts confondus. */
  total: number;
  /** Les candidatures reçues, sans aucun filtre : distingue « aucune reçue » de « aucun résultat ». */
  grandTotal: number;
  /** Les candidatures du statut et de la recherche choisis. */
  filteredTotal: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

/**
 * La recherche libre : chaque mot doit se retrouver dans le prénom, le nom,
 * l'e-mail ou la ville (« dupont lyon » trouve Marie Dupont, Lyon).
 */
export function searchWhere(q: string): Prisma.SalesApplicationWhereInput {
  const tokens = q.trim().slice(0, 80).split(/\s+/).filter(Boolean).slice(0, 5);
  if (tokens.length === 0) return {};
  return {
    AND: tokens.map((token) => ({
      OR: [
        { firstName: { contains: token, mode: "insensitive" } },
        { lastName: { contains: token, mode: "insensitive" } },
        { email: { contains: token, mode: "insensitive" } },
        { city: { contains: token, mode: "insensitive" } },
      ],
    })),
  };
}

export async function listSalesApplications(options: { status: SalesApplicationStatusKey | null; q: string; page: number }): Promise<SalesApplicationList> {
  const search = searchWhere(options.q);
  const where = options.status ? { ...search, status: options.status } : search;
  const [filteredTotal, grouped, grandTotal] = await Promise.all([
    prisma.salesApplication.count({ where }),
    prisma.salesApplication.groupBy({ by: ["status"], where: search, _count: { _all: true } }),
    prisma.salesApplication.count(),
  ]);
  const counts = Object.fromEntries(SALES_APPLICATION_STATUSES.map((value) => [value, 0])) as Record<SalesApplicationStatusKey, number>;
  for (const group of grouped) counts[group.status] = group._count._all;

  const pageCount = Math.max(1, Math.ceil(filteredTotal / SALES_APPLICATIONS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(options.page) || 1), pageCount);
  const rows = await prisma.salesApplication.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * SALES_APPLICATIONS_PAGE_SIZE,
    take: SALES_APPLICATIONS_PAGE_SIZE,
    select: { id: true, createdAt: true, firstName: true, lastName: true, email: true, city: true, zone: true, status: true, cvKey: true, salesRepId: true },
  });

  return {
    rows: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      city: row.city,
      zone: row.zone,
      status: row.status,
      hasCv: Boolean(row.cvKey),
      converted: Boolean(row.salesRepId),
    })),
    counts,
    total: Object.values(counts).reduce((sum, value) => sum + value, 0),
    grandTotal,
    filteredTotal,
    page,
    pageCount,
    pageSize: SALES_APPLICATIONS_PAGE_SIZE,
  };
}

// ---------------------------------------------------------------------------
// Fiche
// ---------------------------------------------------------------------------

type EventRow = {
  id: string;
  kind: string;
  fromStatus: SalesApplicationStatusKey | null;
  toStatus: SalesApplicationStatusKey | null;
  note: string | null;
  platformAdminId: string | null;
  createdAt: Date;
};

/**
 * L'historique, du plus ancien au plus récent. La réception et l'accusé sont
 * repris des dates de la candidature elle-même quand aucun événement ne les
 * porte : ce sont des faits enregistrés, pas des entrées inventées.
 */
export function buildApplicationTimeline(
  application: { id: string; createdAt: Date; acknowledgedAt: Date | null; salesRepId: string | null },
  events: EventRow[],
  adminNames: Map<string, string>,
  /** Où mène le lien vers le commercial créé : la console par défaut, l'espace du directeur sinon. */
  repBasePath = "/admin/commerciaux",
): TimelineEntry[] {
  const entries: TimelineEntry[] = events.map((event): TimelineEntry => {
    const actor = event.platformAdminId ? (adminNames.get(event.platformAdminId) ?? null) : null;
    switch (event.kind) {
      case SALES_APPLICATION_EVENT_KINDS.CREATED:
        return { id: `event:${event.id}`, at: event.createdAt, kind: "dossier", title: "Candidature reçue depuis le site", tone: "info", actor };
      case SALES_APPLICATION_EVENT_KINDS.STATUS_CHANGED: {
        const from = event.fromStatus ? SALES_APPLICATION_STATUS_LABELS[event.fromStatus] : "—";
        const to = event.toStatus ? SALES_APPLICATION_STATUS_LABELS[event.toStatus] : "—";
        return { id: `event:${event.id}`, at: event.createdAt, kind: "dossier", title: `Statut : ${from} → ${to}`, tone: event.toStatus ? SALES_APPLICATION_STATUS_TONES[event.toStatus] : "neutral", actor };
      }
      case SALES_APPLICATION_EVENT_KINDS.NOTE:
        return { id: `event:${event.id}`, at: event.createdAt, kind: "note", title: "Note interne", detail: event.note, actor };
      case SALES_APPLICATION_EVENT_KINDS.CONVERTED:
        return { id: `event:${event.id}`, at: event.createdAt, kind: "commercial", title: "Transformée en commercial", detail: event.note, tone: "success", actor, href: application.salesRepId ? `${repBasePath}/${application.salesRepId}` : null };
      default:
        return { id: `event:${event.id}`, at: event.createdAt, kind: "dossier", title: event.kind, detail: event.note, actor };
    }
  });
  if (!events.some((event) => event.kind === SALES_APPLICATION_EVENT_KINDS.CREATED)) {
    entries.push({ id: `${application.id}:received`, at: application.createdAt, kind: "dossier", title: "Candidature reçue depuis le site", tone: "info" });
  }
  if (application.acknowledgedAt) {
    entries.push({ id: `${application.id}:acknowledged`, at: application.acknowledgedAt, kind: "email", title: "Accusé de réception envoyé au candidat" });
  }
  // À la même seconde, la réception passe avant tout le reste, puis l'accusé.
  const rank = (entry: TimelineEntry) => (entry.title === "Candidature reçue depuis le site" ? 0 : entry.id.endsWith(":acknowledged") ? 1 : 2);
  return entries.sort((a, b) => a.at.getTime() - b.at.getTime() || rank(a) - rank(b));
}

export type SalesApplicationDetail = {
  id: string;
  status: SalesApplicationStatusKey;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  salesExperience: string;
  healthExperience: string | null;
  currentStatus: string;
  zone: string;
  message: string;
  consentAt: Date;
  acknowledgedAt: Date | null;
  createdAt: Date;
  /** Le CV déposé ; sa clé de stockage ne sort jamais du serveur. */
  cv: { fileName: string; sizeBytes: number | null } | null;
  salesRep: { id: string; name: string; isActive: boolean } | null;
  timeline: TimelineEntry[];
};

export async function getSalesApplication(id: string, options: { repBasePath?: string } = {}): Promise<SalesApplicationDetail | null> {
  const application = await prisma.salesApplication.findUnique({
    where: { id },
    include: {
      salesRep: { select: { id: true, firstName: true, lastName: true, isActive: true } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!application) return null;

  // L'auteur d'un événement est un administrateur (son identifiant) ou le directeur commercial (`director:<id>`).
  const { adminIds, directorIds } = splitEventActors(application.events.map((event) => event.platformAdminId));
  const [admins, directors] = await Promise.all([
    adminIds.length > 0 ? prisma.platformAdmin.findMany({ where: { id: { in: adminIds } }, select: { id: true, firstName: true, lastName: true } }) : [],
    directorIds.length > 0 ? prisma.salesDirector.findMany({ where: { id: { in: directorIds } }, select: { id: true, firstName: true, lastName: true } }) : [],
  ]);
  const adminNames = new Map<string, string>([
    ...admins.map((admin): [string, string] => [admin.id, `${admin.firstName} ${admin.lastName}`.trim()]),
    ...directors.map((director): [string, string] => [applicationEventActorId({ type: "DIRECTOR", id: director.id, label: "" }) ?? director.id, `${director.firstName} ${director.lastName}`.trim()]),
  ]);

  return {
    id: application.id,
    status: application.status,
    firstName: application.firstName,
    lastName: application.lastName,
    email: application.email,
    phone: application.phone,
    city: application.city,
    salesExperience: application.salesExperience,
    healthExperience: application.healthExperience,
    currentStatus: application.currentStatus,
    zone: application.zone,
    message: application.message,
    consentAt: application.consentAt,
    acknowledgedAt: application.acknowledgedAt,
    createdAt: application.createdAt,
    cv: application.cvKey ? { fileName: application.cvFileName || "cv.pdf", sizeBytes: application.cvSizeBytes } : null,
    salesRep: application.salesRep ? { id: application.salesRep.id, name: `${application.salesRep.firstName} ${application.salesRep.lastName}`.trim(), isActive: application.salesRep.isActive } : null,
    timeline: buildApplicationTimeline(application, application.events, adminNames, options.repBasePath),
  };
}

// ---------------------------------------------------------------------------
// Statut
// ---------------------------------------------------------------------------

export type MoveResult =
  | { ok: true; from: SalesApplicationStatusKey; to: SalesApplicationStatusKey }
  | { ok: false; reason: "NOT_FOUND" | "SAME_STATUS" | "CONVERTED" | "CONFLICT" };

/**
 * Change le statut d'une candidature (n'importe lequel vers n'importe lequel :
 * on peut rouvrir une candidature refusée). Une candidature déjà transformée en
 * commercial ne bouge plus : son statut dit ce qu'elle est devenue.
 */
export async function moveSalesApplication(id: string, to: SalesApplicationStatusKey, actor: RepActorInput): Promise<MoveResult> {
  const application = await prisma.salesApplication.findUnique({ where: { id }, select: { status: true, salesRepId: true } });
  if (!application) return { ok: false, reason: "NOT_FOUND" };
  if (application.salesRepId) return { ok: false, reason: "CONVERTED" };
  const from = application.status;
  if (from === to) return { ok: false, reason: "SAME_STATUS" };

  const moved = await prisma.$transaction(async (tx) => {
    // Conditionné au statut lu : deux gestes simultanés ne s'écrasent pas.
    const updated = await tx.salesApplication.updateMany({ where: { id, status: from, salesRepId: null }, data: { status: to } });
    if (updated.count === 0) return false;
    await tx.salesApplicationEvent.create({ data: { applicationId: id, kind: SALES_APPLICATION_EVENT_KINDS.STATUS_CHANGED, fromStatus: from, toStatus: to, platformAdminId: applicationEventActorId(actor) } });
    return true;
  });
  if (!moved) return { ok: false, reason: "CONFLICT" };

  await recordAudit({
    action: "sales_application.status_changed",
    entityType: "SalesApplication",
    entityId: id,
    ...auditIdentity(actor),
    metadata: { before: { status: from }, after: { status: to } },
  });
  return { ok: true, from, to };
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export async function addSalesApplicationNote(id: string, note: string, actor: RepActorInput): Promise<{ ok: true; eventId: string } | { ok: false }> {
  const application = await prisma.salesApplication.findUnique({ where: { id }, select: { id: true } });
  if (!application) return { ok: false };
  const event = await prisma.salesApplicationEvent.create({
    data: { applicationId: id, kind: SALES_APPLICATION_EVENT_KINDS.NOTE, note, platformAdminId: applicationEventActorId(actor) },
    select: { id: true },
  });
  await recordAudit({ action: "sales_application.note_added", entityType: "SalesApplication", entityId: id, ...auditIdentity(actor), metadata: { eventId: event.id, length: note.length } });
  return { ok: true, eventId: event.id };
}

// ---------------------------------------------------------------------------
// Transformer en commercial
// ---------------------------------------------------------------------------

/** La même validation que « Nouveau commercial » (`createSalesRepAction`). */
const repIdentity = z.object({
  firstName: z.string().trim().min(1, "prénom manquant").max(80, "prénom trop long"),
  lastName: z.string().trim().min(1, "nom manquant").max(80, "nom trop long"),
  email: z.string().trim().toLowerCase().email("adresse e-mail invalide"),
  phone: z.string().trim().max(30).optional().nullable(),
  zone: z.string().trim().max(120).optional().nullable(),
});

export type ConvertResult =
  | { ok: true; salesRepId: string; name: string; commissionCents: number; invitation: { status: string; detail: string } | null }
  | { ok: false; reason: "NOT_FOUND" | "NOT_ACCEPTED" | "ALREADY_CONVERTED" | "EMAIL_TAKEN" | "INVALID" | "CONFLICT"; salesRepId?: string; detail?: string };

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

/**
 * Crée le commercial d'une candidature ACCEPTÉE : ses coordonnées et sa zone
 * viennent de la candidature, sa commission est FIXE au montant standard de la
 * console (`getStandardCommissionCents`, 250 € par pharmacie activée à
 * défaut). Le compte et l'invitation facultative passent par les fonctions
 * existantes (`createSalesRep`, `sendSalesInvitation`) : même mot de passe
 * aléatoire inconnu, même lien d'invitation.
 *
 * Idempotent : une candidature déjà transformée n'en crée jamais un second.
 * Refus nets si l'adresse est déjà celle d'un commercial ou si la candidature
 * n'est pas acceptée. Le commercial n'est lié à la candidature (avec son
 * événement) qu'en une seule transaction conditionnée à l'état lu.
 */
export async function convertSalesApplication(id: string, actor: RepActorInput, options: { invite?: boolean } = {}): Promise<ConvertResult> {
  const application = await prisma.salesApplication.findUnique({
    where: { id },
    select: { status: true, salesRepId: true, firstName: true, lastName: true, email: true, phone: true, zone: true },
  });
  if (!application) return { ok: false, reason: "NOT_FOUND" };
  if (application.salesRepId) return { ok: false, reason: "ALREADY_CONVERTED", salesRepId: application.salesRepId };
  if (application.status !== "ACCEPTED") return { ok: false, reason: "NOT_ACCEPTED" };

  // Le téléphone et la zone d'une candidature sont libres ; la fiche d'un commercial en limite la longueur.
  const parsed = repIdentity.safeParse({ ...application, phone: application.phone.slice(0, 30), zone: application.zone.slice(0, 120) });
  if (!parsed.success) return { ok: false, reason: "INVALID", detail: parsed.error.issues.map((issue) => issue.message).join(", ") };
  const identity = parsed.data;

  const existing = await prisma.salesRep.findUnique({ where: { email: identity.email }, select: { id: true } });
  if (existing) return { ok: false, reason: "EMAIL_TAKEN" };

  const commissionCents = await getStandardCommissionCents();
  let created: { id: string };
  try {
    created = await createSalesRep({ ...identity, commissionType: "FIXED", commissionValue: commissionCents }, actor);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Deux gestes simultanés : l'adresse est le verrou. Le perdant lit ce que le gagnant a fait.
    const now = await prisma.salesApplication.findUnique({ where: { id }, select: { salesRepId: true } });
    return now?.salesRepId ? { ok: false, reason: "ALREADY_CONVERTED", salesRepId: now.salesRepId } : { ok: false, reason: "EMAIL_TAKEN" };
  }

  const name = `${identity.firstName} ${identity.lastName}`.trim();
  const linked = await prisma.$transaction(async (tx) => {
    const updated = await tx.salesApplication.updateMany({ where: { id, status: "ACCEPTED", salesRepId: null }, data: { salesRepId: created.id } });
    if (updated.count === 0) return false;
    await tx.salesApplicationEvent.create({
      data: {
        applicationId: id,
        kind: SALES_APPLICATION_EVENT_KINDS.CONVERTED,
        note: `Commercial créé : ${name}. Commission fixe de ${formatPriceEuros(commissionCents)} par pharmacie activée.`,
        platformAdminId: applicationEventActorId(actor),
      },
    });
    return true;
  });
  if (!linked) {
    // La candidature a changé entre la lecture et l'écriture (refusée, par exemple) : on défait le compte qu'on vient de créer.
    await prisma.salesRep.delete({ where: { id: created.id } }).catch(() => undefined);
    return { ok: false, reason: "CONFLICT" };
  }

  let invitation: { status: string; detail: string } | null = null;
  if (options.invite !== false) {
    try {
      invitation = await sendSalesInvitation(created.id, actor);
    } catch {
      // Le commercial existe ; seule l'invitation a échoué, et la fiche du commercial permet de la renvoyer.
      invitation = { status: "FAILED", detail: "l'envoi a échoué, renvoyez l'invitation depuis la fiche du commercial" };
    }
  }

  await recordAudit({
    action: "sales_application.converted",
    entityType: "SalesApplication",
    entityId: id,
    ...auditIdentity(actor),
    metadata: { salesRepId: created.id, commissionType: "FIXED", commissionCents, invitation: invitation?.status ?? "NOT_REQUESTED" },
  });
  return { ok: true, salesRepId: created.id, name, commissionCents, invitation };
}

// ---------------------------------------------------------------------------
// CV
// ---------------------------------------------------------------------------

/** Un nom de fichier sûr pour l'en-tête de téléchargement : ni chemin, ni guillemet, ni caractère de contrôle, toujours en `.pdf`. */
export function cvDownloadName(fileName: string | null | undefined, firstName: string, lastName: string): string {
  const clean = (value: string) =>
    value
      .replace(/[\\/]/g, " ")
      .replace(/[^\p{L}\p{N} ._()-]/gu, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\.+/, "")
      .slice(0, 120);
  const base = clean(fileName ?? "").replace(/\.pdf$/i, "").trim() || clean(`CV ${firstName} ${lastName}`) || "CV";
  return `${base}.pdf`;
}

/** L'en-tête `Content-Disposition` d'un téléchargement : nom ASCII de repli et nom complet encodé (RFC 5987). */
export function attachmentDisposition(fileName: string): string {
  const ascii = fileName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._() -]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export type CvResult =
  | { ok: true; bytes: Uint8Array; fileName: string }
  | { ok: false; reason: "NOT_FOUND" | "NO_CV" | "STORAGE_UNAVAILABLE" | "FILE_MISSING" };

/**
 * Relit le CV d'une candidature, pour la console ou pour le directeur. La clé doit être celle de
 * cette candidature (`sales-applications/<id>/…`) : une clé altérée ne permet
 * jamais de lire le fichier d'une autre officine. Chaque lecture est tracée.
 */
export async function readSalesApplicationCv(id: string, actor: RepActorInput): Promise<CvResult> {
  const application = await prisma.salesApplication.findUnique({ where: { id }, select: { cvKey: true, cvFileName: true, firstName: true, lastName: true } });
  if (!application) return { ok: false, reason: "NOT_FOUND" };
  const key = application.cvKey;
  if (!key || key.includes("..") || !key.startsWith(`sales-applications/${id}/`)) return { ok: false, reason: "NO_CV" };

  let bytes: Uint8Array | null;
  try {
    bytes = await getStorageProvider().read(key);
  } catch {
    return { ok: false, reason: "STORAGE_UNAVAILABLE" };
  }
  if (!bytes) return { ok: false, reason: "FILE_MISSING" };

  await recordAudit({ action: "sales_application.cv_downloaded", entityType: "SalesApplication", entityId: id, ...auditIdentity(actor), metadata: { sizeBytes: bytes.length } });
  return { ok: true, bytes, fileName: cvDownloadName(application.cvFileName, application.firstName, application.lastName) };
}
