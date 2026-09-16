import { prisma } from "@/server/db/client";
import { BDM_IT_SOURCE, currentCoverage, parseBdmItRecord, type BdmItReading } from "@/core/regulation/bdm-it";
import { evaluateRegulation, type CoverageFacts, type RegulationAlert } from "@/core/regulation/rules";
import type { Prisma } from "@/generated/prisma";

/**
 * La réglementation au comptoir : lecture de la base tarifaire, journal des
 * évolutions, et alertes par ligne d'ordonnance.
 *
 * La base tarifaire ne se télécharge pas pour les boîtes de ville (son module
 * CIP « n'est pas opérationnel à ce jour », dit-elle) : on lit donc sa fiche
 * boîte par boîte, poliment — quelques requêtes en parallèle, une pause entre
 * chacune. Une passe complète sur les boîtes remboursables prend une dizaine
 * de minutes ; elle se relance chaque semaine, quand la base est republiée.
 */

const USER_AGENT = "PharmaBoost/1.0 (+https://pharmaboost.app ; contact@pharmaboost.app)";
const FETCH_TIMEOUT_MS = 25_000;
const PAUSE_BETWEEN_FETCHES_MS = 120;

export async function fetchBdmItRecord(cip13: string, fetchImpl: typeof fetch = fetch): Promise<BdmItReading> {
  const response = await fetchImpl(BDM_IT_SOURCE.recordUrl(cip13), {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return { kind: "UNREADABLE", reason: `HTTP ${response.status}` };
  const html = new TextDecoder("utf-8").decode(await response.arrayBuffer());
  return parseBdmItRecord(html, cip13);
}

export type CoverageSyncOptions = {
  /** Ne lire que ces boîtes. Par défaut : toutes les boîtes remboursables non retirées. */
  cip13s?: string[];
  /** Nombre maximal de boîtes à lire (pour un essai). */
  limit?: number;
  concurrency?: number;
  fetchImpl?: typeof fetch;
  onProgress?: (done: number, total: number) => void;
};

export type CoverageSyncReport = {
  total: number;
  records: number;
  unknown: number;
  unreadable: number;
  changes: number;
  exceptions: number;
  errors: { cip13: string; reason: string }[];
};

function formatDay(date: Date | null): string {
  return date ? new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" }).format(date) : "—";
}

function sameDay(a: Date | null, b: Date | null): boolean {
  return (a?.getTime() ?? null) === (b?.getTime() ?? null);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lit les fiches et réécrit `DrugCoverageStatus`, en journalisant chaque
 * changement de statut d'exception ou de fin d'homologation. Le premier
 * passage d'une boîte n'est pas un changement : il n'y avait rien avant.
 */
export async function syncCoverageStatuses(options: CoverageSyncOptions = {}): Promise<CoverageSyncReport> {
  const targets = await prisma.drugPresentation.findMany({
    where: options.cip13s
      ? { cip13: { in: options.cip13s } }
      : { withdrawnAt: null, OR: [{ priceCents: { not: null } }, { coverageStatus: { isNot: null } }] },
    select: { id: true, cip13: true, specialty: { select: { name: true, cisCode: true } }, coverageStatus: true },
    orderBy: { cip13: "asc" },
    ...(options.limit ? { take: options.limit } : {}),
  });

  const report: CoverageSyncReport = { total: targets.length, records: 0, unknown: 0, unreadable: 0, changes: 0, exceptions: 0, errors: [] };
  const fetchImpl = options.fetchImpl ?? fetch;
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 3, 6));
  let cursor = 0;
  let done = 0;

  const worker = async () => {
    while (cursor < targets.length) {
      const target = targets[cursor++]!;
      try {
        const reading = await fetchBdmItRecord(target.cip13, fetchImpl);
        if (reading.kind === "RECORD") {
          report.records += 1;
          const record = reading.record;
          const period = currentCoverage(record.coverage);
          const previous = target.coverageStatus;
          const changes: Prisma.DrugRegulationChangeCreateManyInput[] = [];
          if (previous && previous.isException !== record.isException) {
            changes.push({ kind: "EXCEPTION_STATUS", drugName: target.specialty.name, cisCode: target.specialty.cisCode, cip13: target.cip13, before: previous.isException ? "Oui" : "Non", after: record.isException ? "Oui" : "Non", sourceName: BDM_IT_SOURCE.name, sourceDate: record.sourceUpdatedAt });
          }
          if (previous && !sameDay(previous.coverageEndsAt, period?.end ?? null)) {
            changes.push({ kind: "COVERAGE_END", drugName: target.specialty.name, cisCode: target.specialty.cisCode, cip13: target.cip13, before: formatDay(previous.coverageEndsAt), after: `${formatDay(period?.end ?? null)}${period?.endReason ? ` (${period.endReason})` : ""}`, sourceName: BDM_IT_SOURCE.name, sourceDate: record.sourceUpdatedAt });
          }
          const data = {
            cip13: target.cip13,
            isException: record.isException,
            isSpecific: record.isSpecific,
            nature: record.nature,
            designation: record.designation,
            notReimbursable: record.notReimbursable,
            coverageStartsAt: period?.start ?? null,
            coverageEndsAt: period?.end ?? null,
            coverageEndReason: period?.endReason ?? null,
            sourceName: BDM_IT_SOURCE.name,
            sourceVersion: record.sourceVersion,
            sourceUpdatedAt: record.sourceUpdatedAt,
            checkedAt: new Date(),
          };
          await prisma.$transaction([
            prisma.drugCoverageStatus.upsert({ where: { presentationId: target.id }, create: { presentationId: target.id, ...data }, update: data }),
            ...(changes.length > 0 ? [prisma.drugRegulationChange.createMany({ data: changes })] : []),
          ]);
          report.changes += changes.length;
          if (record.isException) report.exceptions += 1;
        } else if (reading.kind === "UNKNOWN_CIP") {
          report.unknown += 1;
          // Une boîte que la CNAM ne connaît plus : son statut ne vaut plus rien.
          if (target.coverageStatus) {
            await prisma.$transaction([
              prisma.drugCoverageStatus.delete({ where: { presentationId: target.id } }),
              ...(target.coverageStatus.isException
                ? [prisma.drugRegulationChange.create({ data: { kind: "EXCEPTION_STATUS", drugName: target.specialty.name, cisCode: target.specialty.cisCode, cip13: target.cip13, before: "Oui", after: "CIP inconnu du CEPS", sourceName: BDM_IT_SOURCE.name } })]
                : []),
            ]);
            if (target.coverageStatus.isException) report.changes += 1;
          }
        } else {
          report.unreadable += 1;
          report.errors.push({ cip13: target.cip13, reason: reading.reason });
        }
      } catch (error) {
        report.unreadable += 1;
        report.errors.push({ cip13: target.cip13, reason: error instanceof Error ? error.message : String(error) });
      }
      done += 1;
      options.onProgress?.(done, targets.length);
      await sleep(PAUSE_BETWEEN_FETCHES_MS);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return report;
}

/** L'état de la base tarifaire telle que nous la connaissons. */
export async function getCoverageSyncState(): Promise<{ statuses: number; exceptions: number; sourceUpdatedAt: Date | null; checkedAt: Date | null; sourceVersion: string | null }> {
  const [statuses, exceptions, latest] = await Promise.all([
    prisma.drugCoverageStatus.count(),
    prisma.drugCoverageStatus.count({ where: { isException: true } }),
    prisma.drugCoverageStatus.findFirst({ orderBy: { checkedAt: "desc" }, select: { sourceUpdatedAt: true, checkedAt: true, sourceVersion: true } }),
  ]);
  return { statuses, exceptions, sourceUpdatedAt: latest?.sourceUpdatedAt ?? null, checkedAt: latest?.checkedAt ?? null, sourceVersion: latest?.sourceVersion ?? null };
}

/**
 * Le statut de prise en charge d'une spécialité, toutes boîtes confondues.
 *
 * Le statut d'exception se porte par boîte mais vaut en pratique pour la
 * spécialité : une seule boîte concernée suffit à réclamer le formulaire. La
 * fin d'homologation retenue est la plus lointaine — si une seule boîte est
 * encore prise en charge, on ne dit pas que le médicament ne l'est plus.
 */
export async function loadCoverageBySpecialty(specialtyIds: string[]): Promise<Map<string, CoverageFacts>> {
  const result = new Map<string, CoverageFacts>();
  if (specialtyIds.length === 0) return result;
  const rows = await prisma.drugCoverageStatus.findMany({
    where: { presentation: { specialtyId: { in: specialtyIds } } },
    select: { isException: true, coverageEndsAt: true, coverageEndReason: true, notReimbursable: true, sourceUpdatedAt: true, presentation: { select: { specialtyId: true } } },
  });
  for (const row of rows) {
    const key = row.presentation.specialtyId;
    const current = result.get(key);
    if (!current) {
      result.set(key, { isException: row.isException, coverageEndsAt: row.coverageEndsAt, coverageEndReason: row.coverageEndReason, notReimbursable: row.notReimbursable, sourceUpdatedAt: row.sourceUpdatedAt });
      continue;
    }
    current.isException = current.isException || row.isException;
    current.notReimbursable = current.notReimbursable && row.notReimbursable;
    if (current.coverageEndsAt !== null) {
      if (row.coverageEndsAt === null) {
        current.coverageEndsAt = null;
        current.coverageEndReason = null;
      } else if (row.coverageEndsAt.getTime() > current.coverageEndsAt.getTime()) {
        current.coverageEndsAt = row.coverageEndsAt;
        current.coverageEndReason = row.coverageEndReason;
      }
    }
    if (row.sourceUpdatedAt && (!current.sourceUpdatedAt || row.sourceUpdatedAt > current.sourceUpdatedAt)) current.sourceUpdatedAt = row.sourceUpdatedAt;
  }
  return result;
}

export type LineRegulation = {
  lineId: string;
  alerts: RegulationAlert[];
};

/**
 * Les alertes réglementaires d'un jeu de lignes rattachées au catalogue.
 * Une ligne sans spécialité n'a pas d'alerte : on ne sait pas de quoi il
 * s'agit, et on ne le devine pas.
 */
export async function evaluateLinesRegulation(
  lines: { id: string; specialtyId: string | null; conditions: string[]; durationDays: number | null }[],
  today = new Date(),
): Promise<LineRegulation[]> {
  const coverage = await loadCoverageBySpecialty([...new Set(lines.flatMap((line) => (line.specialtyId ? [line.specialtyId] : [])))]);
  return lines.map((line) => ({
    lineId: line.id,
    alerts: line.specialtyId
      ? evaluateRegulation({ conditions: line.conditions, coverage: coverage.get(line.specialtyId) ?? null, durationDays: line.durationDays, today })
      : [],
  }));
}

/** Les dernières évolutions constatées, les plus récentes en premier. */
export async function listRecentRegulationChanges(limit = 50) {
  return prisma.drugRegulationChange.findMany({ orderBy: { detectedAt: "desc" }, take: limit });
}
