import "server-only";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/server/db/client";
import { getEnv } from "@/config/env";
import { getSignatureProvider } from "@/server/signature/registry";
import { printedReference, readCompanySnapshot, readPharmacySnapshot } from "@/core/contracts/snapshot";
import {
  contractDisplayStatus,
  contractTimeline,
  countContractFilters,
  eventsOfContract,
  inContractFilter,
  markLatestVersions,
  matchesContractSearch,
  type ContractDisplayStatus,
  type ContractFilterKey,
} from "@/core/contracts/admin-view";
import type { TimelineEntry } from "@/core/admin/timeline";

export {
  CONTRACT_FILTER_KEYS,
  CONTRACT_FILTER_LABELS,
  contractDisplayStatus,
  contractFilters,
  countContractFilters,
  isPendingContract,
  needsFollowUp,
  resolveContractFilter,
} from "@/core/contracts/admin-view";

/**
 * Le centre des contrats de la console : la liste (dernière version de chaque
 * dossier, ou toutes), ses compteurs, la fiche d'un contrat et son historique.
 * Lecture seule : les gestes passent par les actions serveur, qui revérifient.
 *
 * Les contrats des officines de démonstration sont exclus, comme au cockpit :
 * chaque chiffre du cockpit se retrouve tel quel dans la liste qu'il ouvre.
 */

/**
 * Hors démonstration : le contrat n'est pas rattaché à une officine de
 * démonstration, et son dossier non plus (un dossier sans officine n'est pas
 * une démonstration). Partagé avec le cockpit.
 */
export const REAL_CONTRACT = {
  AND: [{ OR: [{ pharmacyId: null }, { pharmacy: { isDemo: false } }] }, { prospect: { OR: [{ pharmacyId: null }, { pharmacy: { isDemo: false } }] } }],
} satisfies Prisma.ContractWhereInput;

/** Au-delà, la liste le dit plutôt que de ralentir la console. */
export const CONTRACT_LIST_CAP = 2000;
/** Un dossier modifié après la génération du brouillon : le PDF ne reflète plus le dossier. */
const STALE_MARGIN_MS = 5_000;

export type AdminContractRow = {
  id: string;
  prospectId: string;
  pharmacyId: string | null;
  pharmacyName: string;
  legalName: string | null;
  reference: string;
  version: number;
  versionCount: number;
  latest: boolean;
  status: string;
  display: ContractDisplayStatus;
  monthlyPriceCents: number;
  signerName: string;
  signerEmail: string;
  sentAt: Date | null;
  openedAt: Date | null;
  pharmacySignedAt: Date | null;
  companySignedAt: Date | null;
  finalizedAt: Date | null;
  refusedAt: Date | null;
  expiresAt: Date | null;
  reminderCount: number;
  lastReminderAt: Date | null;
  escalatedAt: Date | null;
  createdAt: Date;
  /** Dossier suspendu par l'administrateur : aucun envoi possible. */
  blocked: boolean;
  /** Brouillon généré avant la dernière modification du dossier. */
  stale: boolean;
};

const LIST_SELECT = {
  id: true,
  prospectId: true,
  pharmacyId: true,
  version: true,
  status: true,
  reference: true,
  monthlyPriceCents: true,
  pharmacySignerName: true,
  pharmacySignerEmail: true,
  sentAt: true,
  openedAt: true,
  pharmacySignedAt: true,
  companySignedAt: true,
  finalizedAt: true,
  refusedAt: true,
  expiresAt: true,
  reminderCount: true,
  lastReminderAt: true,
  escalatedAt: true,
  createdAt: true,
  prospect: { select: { name: true, legalName: true, blockedAt: true, updatedAt: true } },
  pharmacy: { select: { name: true } },
} as const;

export type AdminContractList = {
  rows: AdminContractRow[];
  counters: Record<ContractFilterKey | "tous", number>;
  /** Les mêmes compteurs, sans la recherche : pour les indicateurs de tête. */
  totals: Record<ContractFilterKey | "tous", number>;
  /** Contrats lus en base (toutes versions), avant filtre. */
  scanned: number;
  truncated: boolean;
};

/**
 * La liste des contrats : par défaut la dernière version de chaque dossier
 * (`versions: "toutes"` pour l'historique complet), filtrée par statut et par
 * recherche. Les compteurs tiennent compte de la recherche, pas du statut :
 * chaque pastille dit ce qu'on trouvera en cliquant.
 */
export async function listContractsForAdmin(params: { statut: ContractFilterKey | null; q?: string | null; versions?: "derniere" | "toutes" }, now = new Date()): Promise<AdminContractList> {
  const contracts = await prisma.contract.findMany({ where: REAL_CONTRACT, orderBy: [{ createdAt: "desc" }, { version: "desc" }], take: CONTRACT_LIST_CAP + 1, select: LIST_SELECT });
  const truncated = contracts.length > CONTRACT_LIST_CAP;
  const scannedRows = truncated ? contracts.slice(0, CONTRACT_LIST_CAP) : contracts;

  const rows: AdminContractRow[] = markLatestVersions(scannedRows).map((c) => {
    const classifiable = { status: c.status, escalatedAt: c.escalatedAt, expiresAt: c.expiresAt, superseded: !c.latest };
    return {
      id: c.id,
      prospectId: c.prospectId,
      pharmacyId: c.pharmacyId,
      pharmacyName: c.pharmacy?.name ?? c.prospect.name,
      legalName: c.prospect.legalName,
      reference: printedReference(c, c.prospect.name),
      version: c.version,
      versionCount: c.versionCount,
      latest: c.latest,
      status: c.status,
      display: contractDisplayStatus(classifiable, now),
      monthlyPriceCents: c.monthlyPriceCents,
      signerName: c.pharmacySignerName,
      signerEmail: c.pharmacySignerEmail,
      sentAt: c.sentAt,
      openedAt: c.openedAt,
      pharmacySignedAt: c.pharmacySignedAt,
      companySignedAt: c.companySignedAt,
      finalizedAt: c.finalizedAt,
      refusedAt: c.refusedAt,
      expiresAt: c.expiresAt,
      reminderCount: c.reminderCount,
      lastReminderAt: c.lastReminderAt,
      escalatedAt: c.escalatedAt,
      createdAt: c.createdAt,
      blocked: Boolean(c.prospect.blockedAt),
      stale: c.status === "DRAFT" && c.prospect.updatedAt.getTime() > c.createdAt.getTime() + STALE_MARGIN_MS,
    };
  });

  const scoped = params.versions === "toutes" ? rows : rows.filter((r) => r.latest);
  const searched = scoped.filter((r) => matchesContractSearch(r, params.q));
  const classify = (r: AdminContractRow) => ({ status: r.status, escalatedAt: r.escalatedAt, expiresAt: r.expiresAt, superseded: !r.latest });
  return {
    rows: searched.filter((r) => inContractFilter(classify(r), params.statut, now)),
    counters: countContractFilters(searched.map(classify), now),
    totals: countContractFilters(scoped.map(classify), now),
    scanned: scannedRows.length,
    truncated,
  };
}

/**
 * Les compteurs seuls, pour le cockpit : la dernière version de chaque
 * dossier, hors démonstration — exactement ce que compte la liste par défaut
 * (`totals`), sans son plafond de lecture. Un brouillon remplacé par une
 * version plus récente ne compte plus.
 */
export async function contractCounters(now = new Date()): Promise<Record<ContractFilterKey | "tous", number>> {
  const contracts = await prisma.contract.findMany({ where: REAL_CONTRACT, select: { prospectId: true, version: true, status: true, escalatedAt: true, expiresAt: true } });
  const latest = markLatestVersions(contracts).filter((c) => c.latest);
  return countContractFilters(latest.map((c) => ({ status: c.status, escalatedAt: c.escalatedAt, expiresAt: c.expiresAt })), now);
}

/**
 * Le prestataire de signature, tel qu'il est réellement branché : rien n'est
 * simulé. Sans secret de webhook, chaque notification est relue chez le
 * prestataire avant d'être appliquée (voir handleSignatureEvent).
 */
export function signatureProviderState(): { configured: boolean; id: string; label: string; description: string; webhookAuthenticated: boolean } {
  const provider = getSignatureProvider();
  const env = getEnv();
  const webhookSecret = provider.info.id === "docuseal" ? env.DOCUSEAL_WEBHOOK_SECRET : provider.info.id === "yousign" ? env.YOUSIGN_WEBHOOK_SECRET : undefined;
  return {
    configured: provider.info.capability === "LIVE",
    id: provider.info.id,
    label: provider.info.label,
    description: provider.info.description,
    webhookAuthenticated: Boolean(webhookSecret),
  };
}

/** La fiche d'un contrat : conditions, signature, parties imprimées, autres versions, historique. */
export async function getContractForAdmin(contractId: string, now = new Date()) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      plan: { select: { name: true } },
      pharmacy: { select: { id: true, name: true } },
      prospect: { select: { id: true, name: true, legalName: true, blockedAt: true, updatedAt: true, salesRep: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!contract) return null;
  const [versions, events, dispatches] = await Promise.all([
    prisma.contract.findMany({ where: { prospectId: contract.prospectId }, orderBy: { version: "desc" }, select: { id: true, version: true, status: true, reference: true, createdAt: true, escalatedAt: true, expiresAt: true } }),
    prisma.prospectEvent.findMany({ where: { prospectId: contract.prospectId }, orderBy: { createdAt: "desc" }, take: 500, select: { id: true, type: true, summary: true, actorType: true, actorLabel: true, metadata: true, createdAt: true } }),
    prisma.emailDispatch.findMany({ where: { contractId: contract.id }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, kind: true, recipient: true, status: true, subject: true, detail: true, trigger: true, createdAt: true } }),
  ]);
  const latestVersion = versions[0]?.version ?? contract.version;
  const superseded = contract.version < latestVersion;
  const timeline: TimelineEntry[] = contractTimeline(eventsOfContract(events, contract.id), dispatches);
  return {
    contract,
    reference: printedReference(contract, contract.prospect.name),
    display: contractDisplayStatus({ status: contract.status, escalatedAt: contract.escalatedAt, expiresAt: contract.expiresAt, superseded }, now),
    superseded,
    blocked: Boolean(contract.prospect.blockedAt),
    stale: contract.status === "DRAFT" && contract.prospect.updatedAt.getTime() > contract.createdAt.getTime() + STALE_MARGIN_MS,
    companySnapshot: readCompanySnapshot(contract.companySnapshot),
    pharmacySnapshot: readPharmacySnapshot(contract.pharmacySnapshot),
    versions: versions.map((v) => ({ id: v.id, version: v.version, reference: printedReference(v, contract.prospect.name), display: contractDisplayStatus({ status: v.status, escalatedAt: v.escalatedAt, expiresAt: v.expiresAt, superseded: v.version < latestVersion }, now), createdAt: v.createdAt })),
    timeline,
  };
}

/** Les contrats déjà générés : ils gardent leur copie, quoi qu'il arrive à la fiche société. */
export async function generatedContractCounts(): Promise<{ signed: number; total: number }> {
  const [signed, total] = await Promise.all([prisma.contract.count({ where: { status: "FINALIZED" } }), prisma.contract.count()]);
  return { signed, total };
}

/** Ce qu'il faut pour le PDF spécimen : la fiche société enregistrée et l'offre par défaut du catalogue. */
export async function loadSpecimenInputs() {
  const [company, plan] = await Promise.all([
    prisma.companyProfile.findUnique({ where: { id: "default" } }),
    prisma.plan.findFirst({ where: { isActive: true, isDefault: true }, orderBy: { createdAt: "asc" }, select: { name: true, monthlyPriceCents: true, trialDays: true } }),
  ]);
  return { company, plan };
}
