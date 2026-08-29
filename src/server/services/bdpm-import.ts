/**
 * Import du catalogue national des médicaments.
 *
 * Trois engagements structurent ce fichier.
 *
 * 1. **Rien n'est écrit tant que tout n'a pas été lu.** Les six fichiers sont
 *    décodés et vérifiés d'abord ; le moindre écart de format arrête l'import
 *    avant la première écriture. Un catalogue à moitié remplacé serait pire
 *    qu'un catalogue périmé.
 * 2. **Rien n'est inventé.** Une ligne dont la clé manque, dont la nature est
 *    inconnue ou dont le code CIS n'existe pas dans le fichier des spécialités
 *    est ignorée et comptée dans le journal, jamais complétée.
 * 3. **Rien n'est détruit.** Une spécialité ou une présentation qui disparaît
 *    de la source est marquée retirée, pas supprimée : le stock d'une officine
 *    et ses ventes passées continuent de la référencer. C'est la règle « une
 *    mise à jour du référentiel ne remet jamais à zéro le stock d'une
 *    officine ».
 */

import type { PrismaClient } from "@/generated/prisma";
import {
  BDPM_FILES,
  decodeWindows1252,
  parseTable,
  toCompositionRow,
  toGenericMemberRow,
  toPrescriptionConditionRow,
  toPresentationRow,
  toSmrOpinionRow,
  toSpecialtyRow,
  type BdpmFileKey,
  type CompositionRow,
  type GenericMemberRow,
  type PrescriptionConditionRow,
  type PresentationRow,
  type SmrOpinionRow,
  type SpecialtyRow,
} from "@/core/reference/bdpm";
import { normalizeSearchText } from "@/core/reference/search";
import { chunk } from "@/lib/utils";

/** Lit un fichier de la source. Renvoie `null` si le fichier est absent. */
export type BdpmReader = (fileName: string) => Promise<Uint8Array | null>;

export type BdpmFileReport = {
  fileName: string;
  label: string;
  /** Lignes présentes dans le fichier. */
  read: number;
  created: number;
  /** Lignes dont le contenu a réellement changé. */
  updated: number;
  /** Lignes retrouvées à l'identique. Un import sain en est presque entièrement fait. */
  unchanged: number;
  /** Lignes lues mais non retenues, avec leur motif. */
  skipped: number;
  skipReasons: Record<string, number>;
};

export type BdpmImportResult = {
  importId: string | null;
  status: "SUCCEEDED" | "FAILED";
  isDryRun: boolean;
  sourceUpdatedAt: Date | null;
  fileReports: BdpmFileReport[];
  /** Lignes devenues absentes de la source, marquées retirées. */
  retired: { specialties: number; presentations: number };
  missingFiles: string[];
  error: string | null;
  durationMs: number;
};

export type BdpmImportOptions = {
  /** Lit et vérifie tout, n'écrit rien dans le catalogue. */
  dryRun?: boolean;
  /** Date de mise à jour ANNONCÉE PAR LA SOURCE. `null` si elle est inconnue. */
  sourceUpdatedAt?: Date | null;
  sourceUrl: string;
  /** Journalise la progression. Silencieux par défaut. */
  onProgress?: (message: string) => void;
};

const CREATE_CHUNK = 1_000;
const UPDATE_CHUNK = 2_000;

type ParsedFiles = {
  specialties: SpecialtyRow[];
  presentations: PresentationRow[];
  compositions: CompositionRow[];
  conditions: PrescriptionConditionRow[];
  genericMembers: GenericMemberRow[];
  smrOpinions: SmrOpinionRow[];
};

function emptyReport(key: BdpmFileKey): BdpmFileReport {
  const spec = BDPM_FILES.find((candidate) => candidate.key === key)!;
  return {
    fileName: spec.fileName,
    label: spec.label,
    read: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    skipReasons: {},
  };
}

function skip(report: BdpmFileReport, reason: string) {
  report.skipped += 1;
  report.skipReasons[reason] = (report.skipReasons[reason] ?? 0) + 1;
}

export async function importBdpm(
  prisma: PrismaClient,
  read: BdpmReader,
  options: BdpmImportOptions,
): Promise<BdpmImportResult> {
  const startedAt = Date.now();
  const dryRun = options.dryRun ?? false;
  const log = options.onProgress ?? (() => {});
  const reports = new Map<BdpmFileKey, BdpmFileReport>(
    BDPM_FILES.map((spec) => [spec.key, emptyReport(spec.key)]),
  );
  const missingFiles: string[] = [];

  const record = await prisma.referenceImport.create({
    data: {
      source: "BDPM",
      sourceUrl: options.sourceUrl,
      sourceUpdatedAt: options.sourceUpdatedAt ?? null,
      isDryRun: dryRun,
    },
    select: { id: true },
  });

  const fail = async (error: string): Promise<BdpmImportResult> => {
    await prisma.referenceImport.update({
      where: { id: record.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error,
        fileReports: [...reports.values()],
      },
    });
    return {
      importId: record.id,
      status: "FAILED",
      isDryRun: dryRun,
      sourceUpdatedAt: options.sourceUpdatedAt ?? null,
      fileReports: [...reports.values()],
      retired: { specialties: 0, presentations: 0 },
      missingFiles,
      error,
      durationMs: Date.now() - startedAt,
    };
  };

  // -------------------------------------------------------------------------
  // Phase 1 — tout lire et tout vérifier avant d'écrire quoi que ce soit.
  // -------------------------------------------------------------------------
  const parsed: ParsedFiles = {
    specialties: [],
    presentations: [],
    compositions: [],
    conditions: [],
    genericMembers: [],
    smrOpinions: [],
  };

  const builders: Record<BdpmFileKey, (columns: string[]) => unknown> = {
    SPECIALTIES: toSpecialtyRow,
    PRESENTATIONS: toPresentationRow,
    COMPOSITIONS: toCompositionRow,
    PRESCRIPTION_CONDITIONS: toPrescriptionConditionRow,
    GENERIC_MEMBERS: toGenericMemberRow,
    SMR_OPINIONS: toSmrOpinionRow,
  };

  const targets: Record<BdpmFileKey, unknown[]> = {
    SPECIALTIES: parsed.specialties,
    PRESENTATIONS: parsed.presentations,
    COMPOSITIONS: parsed.compositions,
    PRESCRIPTION_CONDITIONS: parsed.conditions,
    GENERIC_MEMBERS: parsed.genericMembers,
    SMR_OPINIONS: parsed.smrOpinions,
  };

  for (const spec of BDPM_FILES) {
    const report = reports.get(spec.key)!;
    const bytes = await read(spec.fileName);

    if (!bytes) {
      if (spec.required) {
        return fail(`Fichier obligatoire absent : ${spec.fileName}`);
      }
      missingFiles.push(spec.fileName);
      log(`  ${spec.fileName} absent — ignoré (facultatif)`);
      continue;
    }

    let rows: string[][];
    try {
      rows = parseTable(decodeWindows1252(bytes), spec);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }

    report.read = rows.length;
    const build = builders[spec.key];
    const target = targets[spec.key];
    for (const columns of rows) {
      const built = build(columns);
      if (built === null) skip(report, "ligne inexploitable (clé absente ou valeur non reconnue)");
      else target.push(built);
    }

    log(`  ${spec.fileName.padEnd(24)} ${String(report.read).padStart(6)} lignes lues`);
  }

  // Les fichiers rattachés référencent des spécialités par leur code CIS. La
  // source en cite qui ne figurent pas dans le fichier des spécialités
  // (mesuré : 1 437 dans les groupes génériques, 1 174 dans les avis HAS —
  // des médicaments retirés du marché dont l'historique subsiste). On les
  // écarte : créer la spécialité manquante reviendrait à l'inventer.
  const knownCis = new Set(parsed.specialties.map((row) => row.cisCode));

  const keepKnown = <T extends { cisCode: string }>(rows: T[], key: BdpmFileKey): T[] => {
    const report = reports.get(key)!;
    return rows.filter((row) => {
      if (knownCis.has(row.cisCode)) return true;
      skip(report, "code CIS absent du fichier des spécialités");
      return false;
    });
  };

  parsed.presentations = keepKnown(parsed.presentations, "PRESENTATIONS");
  parsed.compositions = keepKnown(parsed.compositions, "COMPOSITIONS");
  parsed.conditions = keepKnown(parsed.conditions, "PRESCRIPTION_CONDITIONS");
  parsed.genericMembers = keepKnown(parsed.genericMembers, "GENERIC_MEMBERS");
  parsed.smrOpinions = keepKnown(parsed.smrOpinions, "SMR_OPINIONS");

  if (parsed.specialties.length === 0) {
    return fail("Aucune spécialité exploitable : le catalogue n'est pas remplacé.");
  }

  // -------------------------------------------------------------------------
  // Phase 2 — écriture.
  // -------------------------------------------------------------------------
  const now = new Date();
  const retired = { specialties: 0, presentations: 0 };

  try {
    if (dryRun) {
      log("  Exécution à blanc : comparaison sans écriture");
      await countDryRun(prisma, parsed, reports);
    } else {
      const specialtyIds = await writeSpecialties(prisma, parsed.specialties, reports, now);
      await writePresentations(prisma, parsed.presentations, specialtyIds, reports, now);
      const substanceIds = await writeSubstances(prisma, parsed.compositions, now);
      await writeCompositions(prisma, parsed.compositions, specialtyIds, substanceIds, reports, now);
      await writeConditions(prisma, parsed.conditions, specialtyIds, reports, now);
      await writeGenericMembers(prisma, parsed.genericMembers, specialtyIds, reports, now);
      await writeSmrOpinions(prisma, parsed.smrOpinions, specialtyIds, reports);

      retired.specialties = await retireSpecialties(prisma, now);
      retired.presentations = await retirePresentations(prisma, now);
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }

  const fileReports = [...reports.values()];
  await prisma.referenceImport.update({
    where: { id: record.id },
    data: { status: "SUCCEEDED", finishedAt: new Date(), fileReports },
  });

  return {
    importId: record.id,
    status: "SUCCEEDED",
    isDryRun: dryRun,
    sourceUpdatedAt: options.sourceUpdatedAt ?? null,
    fileReports,
    retired,
    missingFiles,
    error: null,
    durationMs: Date.now() - startedAt,
  };
}

// ---------------------------------------------------------------------------
// Écritures
// ---------------------------------------------------------------------------

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameDate(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b;
  return a.getTime() === b.getTime();
}

function specialtyPayload(row: SpecialtyRow) {
  return {
    name: row.name,
    // Dérivée du nom officiel, jamais à sa place. Elle est incluse dans la
    // charge utile comparée pour qu'une correction de la règle de
    // normalisation soit rattrapée à la synchronisation suivante.
    searchName: normalizeSearchText(row.name),
    pharmaceuticalForm: row.pharmaceuticalForm,
    administrationRoutes: row.administrationRoutes,
    authorizationStatus: row.authorizationStatus,
    authorizationProcedure: row.authorizationProcedure,
    marketingStatus: row.marketingStatus,
    authorizedAt: row.authorizedAt,
    bdmStatus: row.bdmStatus,
    europeanAuthorizationNumber: row.europeanAuthorizationNumber,
    holders: row.holders,
    enhancedMonitoring: row.enhancedMonitoring,
  };
}

type ExistingSpecialty = ReturnType<typeof specialtyPayload> & { id: string; cisCode: string };

function specialtyChanged(existing: ExistingSpecialty, row: SpecialtyRow): boolean {
  return (
    existing.name !== row.name ||
    existing.searchName !== normalizeSearchText(row.name) ||
    existing.pharmaceuticalForm !== row.pharmaceuticalForm ||
    !sameList(existing.administrationRoutes, row.administrationRoutes) ||
    existing.authorizationStatus !== row.authorizationStatus ||
    existing.authorizationProcedure !== row.authorizationProcedure ||
    existing.marketingStatus !== row.marketingStatus ||
    !sameDate(existing.authorizedAt, row.authorizedAt) ||
    existing.bdmStatus !== row.bdmStatus ||
    existing.europeanAuthorizationNumber !== row.europeanAuthorizationNumber ||
    !sameList(existing.holders, row.holders) ||
    existing.enhancedMonitoring !== row.enhancedMonitoring
  );
}

async function writeSpecialties(
  prisma: PrismaClient,
  rows: SpecialtyRow[],
  reports: Map<BdpmFileKey, BdpmFileReport>,
  now: Date,
): Promise<Map<string, string>> {
  const report = reports.get("SPECIALTIES")!;
  const existing = await prisma.drugSpecialty.findMany({
    select: {
      id: true,
      cisCode: true,
      name: true,
      searchName: true,
      pharmaceuticalForm: true,
      administrationRoutes: true,
      authorizationStatus: true,
      authorizationProcedure: true,
      marketingStatus: true,
      authorizedAt: true,
      bdmStatus: true,
      europeanAuthorizationNumber: true,
      holders: true,
      enhancedMonitoring: true,
    },
  });
  const byCis = new Map(existing.map((row) => [row.cisCode, row]));

  const ids = new Map<string, string>();
  const seenIds: string[] = [];
  const toCreate: SpecialtyRow[] = [];
  const toUpdate: { id: string; row: SpecialtyRow }[] = [];

  for (const row of rows) {
    const current = byCis.get(row.cisCode);
    if (!current) {
      toCreate.push(row);
      continue;
    }
    ids.set(row.cisCode, current.id);
    seenIds.push(current.id);
    if (specialtyChanged(current, row)) toUpdate.push({ id: current.id, row });
  }

  for (const batch of chunk(toCreate, CREATE_CHUNK)) {
    await prisma.drugSpecialty.createMany({
      data: batch.map((row) => ({ cisCode: row.cisCode, lastSeenAt: now, ...specialtyPayload(row) })),
    });
  }
  report.created = toCreate.length;

  for (const batch of chunk(toCreate.map((row) => row.cisCode), UPDATE_CHUNK)) {
    const created = await prisma.drugSpecialty.findMany({
      where: { cisCode: { in: batch } },
      select: { id: true, cisCode: true },
    });
    for (const row of created) ids.set(row.cisCode, row.id);
  }

  // Une spécialité revue dans la source n'est plus retirée : la mise à jour en
  // masse remet `withdrawnAt` à zéro pour tout ce qui a été vu.
  for (const batch of chunk(seenIds, UPDATE_CHUNK)) {
    await prisma.drugSpecialty.updateMany({
      where: { id: { in: batch } },
      data: { lastSeenAt: now, withdrawnAt: null },
    });
  }

  for (const { id, row } of toUpdate) {
    await prisma.drugSpecialty.update({ where: { id }, data: specialtyPayload(row) });
  }
  report.updated = toUpdate.length;
  report.unchanged = seenIds.length - toUpdate.length;

  return ids;
}

function presentationPayload(row: PresentationRow) {
  return {
    cip7: row.cip7,
    label: row.label,
    administrativeStatus: row.administrativeStatus,
    marketingStatus: row.marketingStatus,
    marketingDeclaredAt: row.marketingDeclaredAt,
    approvedForCommunities: row.approvedForCommunities,
    reimbursementRateRaw: row.reimbursementRateRaw,
    reimbursementRate: row.reimbursementRate,
    priceCents: row.priceCents,
    totalPriceCents: row.totalPriceCents,
    dispensingFeeCents: row.dispensingFeeCents,
    reimbursementNotice: row.reimbursementNotice,
  };
}

type ExistingPresentation = ReturnType<typeof presentationPayload> & {
  id: string;
  cip13: string;
  specialtyId: string;
};

function presentationChanged(
  existing: ExistingPresentation,
  row: PresentationRow,
  specialtyId: string,
): boolean {
  return (
    existing.specialtyId !== specialtyId ||
    existing.cip7 !== row.cip7 ||
    existing.label !== row.label ||
    existing.administrativeStatus !== row.administrativeStatus ||
    existing.marketingStatus !== row.marketingStatus ||
    !sameDate(existing.marketingDeclaredAt, row.marketingDeclaredAt) ||
    existing.approvedForCommunities !== row.approvedForCommunities ||
    existing.reimbursementRateRaw !== row.reimbursementRateRaw ||
    existing.reimbursementRate !== row.reimbursementRate ||
    existing.priceCents !== row.priceCents ||
    existing.totalPriceCents !== row.totalPriceCents ||
    existing.dispensingFeeCents !== row.dispensingFeeCents ||
    existing.reimbursementNotice !== row.reimbursementNotice
  );
}

async function writePresentations(
  prisma: PrismaClient,
  rows: PresentationRow[],
  specialtyIds: Map<string, string>,
  reports: Map<BdpmFileKey, BdpmFileReport>,
  now: Date,
): Promise<void> {
  const report = reports.get("PRESENTATIONS")!;
  const existing = await prisma.drugPresentation.findMany({
    select: {
      id: true,
      cip13: true,
      specialtyId: true,
      cip7: true,
      label: true,
      administrativeStatus: true,
      marketingStatus: true,
      marketingDeclaredAt: true,
      approvedForCommunities: true,
      reimbursementRateRaw: true,
      reimbursementRate: true,
      priceCents: true,
      totalPriceCents: true,
      dispensingFeeCents: true,
      reimbursementNotice: true,
    },
  });
  const byCip13 = new Map(existing.map((row) => [row.cip13, row]));

  const seenIds: string[] = [];
  const toCreate: { row: PresentationRow; specialtyId: string }[] = [];
  const toUpdate: { id: string; row: PresentationRow; specialtyId: string }[] = [];

  for (const row of rows) {
    const specialtyId = specialtyIds.get(row.cisCode);
    if (!specialtyId) {
      skip(report, "code CIS absent du fichier des spécialités");
      continue;
    }
    const current = byCip13.get(row.cip13);
    if (!current) {
      toCreate.push({ row, specialtyId });
      continue;
    }
    seenIds.push(current.id);
    if (presentationChanged(current, row, specialtyId)) {
      toUpdate.push({ id: current.id, row, specialtyId });
    }
  }

  for (const batch of chunk(toCreate, CREATE_CHUNK)) {
    await prisma.drugPresentation.createMany({
      data: batch.map(({ row, specialtyId }) => ({
        specialtyId,
        cip13: row.cip13,
        lastSeenAt: now,
        ...presentationPayload(row),
      })),
    });
  }
  report.created = toCreate.length;

  for (const batch of chunk(seenIds, UPDATE_CHUNK)) {
    await prisma.drugPresentation.updateMany({
      where: { id: { in: batch } },
      data: { lastSeenAt: now, withdrawnAt: null },
    });
  }

  for (const { id, row, specialtyId } of toUpdate) {
    await prisma.drugPresentation.update({
      where: { id },
      data: { specialtyId, ...presentationPayload(row) },
    });
  }
  report.updated = toUpdate.length;
  report.unchanged = seenIds.length - toUpdate.length;
}

/**
 * Séparateur des clés composites construites en mémoire : le caractère de
 * contrôle « unit separator ». Aucun libellé de médicament n'en contient, donc
 * deux clés différentes ne peuvent pas se confondre par accident.
 */
const KEY_SEP = String.fromCharCode(31);

/**
 * Les substances, dédoublonnées par leur code officiel.
 *
 * Mesuré sur la base réelle : 562 codes sur 3 352 portent plusieurs graphies
 * (le code 25783 s'écrit « RANITIDINE (CHLORHYDRATE DE) » et « CHLORHYDRATE DE
 * RANITIDINE »). On retient la plus fréquente comme libellé de référence et on
 * conserve les autres comme alias — sans jamais corriger la source : chaque
 * ligne de composition garde la graphie exacte qu'elle portait.
 */
async function writeSubstances(
  prisma: PrismaClient,
  compositions: CompositionRow[],
  now: Date,
): Promise<Map<string, string>> {
  const occurrences = new Map<string, Map<string, number>>();
  for (const row of compositions) {
    const labels = occurrences.get(row.substanceCode) ?? new Map<string, number>();
    labels.set(row.substanceLabel, (labels.get(row.substanceLabel) ?? 0) + 1);
    occurrences.set(row.substanceCode, labels);
  }

  const wanted = new Map<string, { label: string; searchLabel: string; aliases: string[] }>();
  for (const [code, labels] of occurrences) {
    // Égalité de fréquence tranchée par l'ordre alphabétique : le résultat de
    // l'import ne doit pas dépendre de l'ordre des lignes du fichier.
    const sorted = [...labels.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"),
    );
    wanted.set(code, {
      label: sorted[0][0],
      searchLabel: normalizeSearchText(sorted[0][0]),
      aliases: sorted.slice(1).map(([label]) => label),
    });
  }

  const existing = await prisma.drugSubstance.findMany({
    select: { id: true, code: true, label: true, searchLabel: true, aliases: true },
  });
  const byCode = new Map(existing.map((row) => [row.code, row]));

  const ids = new Map<string, string>();
  const toCreate: { code: string; label: string; searchLabel: string; aliases: string[] }[] = [];
  const seenIds: string[] = [];

  for (const [code, payload] of wanted) {
    const current = byCode.get(code);
    if (!current) {
      toCreate.push({ code, ...payload });
      continue;
    }
    ids.set(code, current.id);
    seenIds.push(current.id);
    if (
      current.label !== payload.label ||
      current.searchLabel !== payload.searchLabel ||
      !sameList(current.aliases, payload.aliases)
    ) {
      await prisma.drugSubstance.update({ where: { id: current.id }, data: payload });
    }
  }

  for (const batch of chunk(toCreate, CREATE_CHUNK)) {
    await prisma.drugSubstance.createMany({
      data: batch.map((row) => ({ ...row, lastSeenAt: now })),
    });
  }
  for (const batch of chunk(
    toCreate.map((row) => row.code),
    UPDATE_CHUNK,
  )) {
    const created = await prisma.drugSubstance.findMany({
      where: { code: { in: batch } },
      select: { id: true, code: true },
    });
    for (const row of created) ids.set(row.code, row.id);
  }
  for (const batch of chunk(seenIds, UPDATE_CHUNK)) {
    await prisma.drugSubstance.updateMany({
      where: { id: { in: batch } },
      data: { lastSeenAt: now },
    });
  }

  return ids;
}

/** Clé naturelle d'une ligne de composition, côté base comme côté fichier. */
function compositionKey(
  specialtyId: string,
  element: string,
  substanceId: string,
  nature: string,
  linkNumber: string | null,
): string {
  return [specialtyId, element, substanceId, nature, linkNumber ?? ""].join(KEY_SEP);
}

/**
 * Les tables rattachées sont remises à l'image de la source — mais UNIQUEMENT
 * pour les spécialités que la source décrit encore. Une spécialité retirée du
 * marché conserve ainsi sa dernière composition connue : une officine peut
 * encore en avoir en stock, et un pharmacien a le droit de savoir ce qu'il y a
 * dedans.
 */
async function writeCompositions(
  prisma: PrismaClient,
  rows: CompositionRow[],
  specialtyIds: Map<string, string>,
  substanceIds: Map<string, string>,
  reports: Map<BdpmFileKey, BdpmFileReport>,
  now: Date,
): Promise<void> {
  const report = reports.get("COMPOSITIONS")!;
  const seenSpecialties = new Set(specialtyIds.values());

  const wanted = new Map<string, CompositionRow & { specialtyId: string; substanceId: string }>();
  for (const row of rows) {
    const specialtyId = specialtyIds.get(row.cisCode);
    const substanceId = substanceIds.get(row.substanceCode);
    if (!specialtyId || !substanceId) {
      skip(report, "code CIS ou code substance non résolu");
      continue;
    }
    wanted.set(compositionKey(specialtyId, row.element, substanceId, row.nature, row.linkNumber), {
      ...row,
      specialtyId,
      substanceId,
    });
  }

  const existing = await prisma.drugComposition.findMany({
    select: {
      id: true,
      specialtyId: true,
      element: true,
      substanceId: true,
      nature: true,
      linkNumber: true,
    },
  });

  const existingKeys = new Set<string>();
  const obsolete: string[] = [];
  for (const row of existing) {
    const key = compositionKey(
      row.specialtyId,
      row.element,
      row.substanceId,
      row.nature,
      row.linkNumber,
    );
    existingKeys.add(key);
    if (!wanted.has(key) && seenSpecialties.has(row.specialtyId)) obsolete.push(row.id);
  }

  const toCreate = [...wanted.entries()].filter(([key]) => !existingKeys.has(key));

  for (const batch of chunk(toCreate, CREATE_CHUNK)) {
    await prisma.drugComposition.createMany({
      data: batch.map(([, row]) => ({
        specialtyId: row.specialtyId,
        substanceId: row.substanceId,
        element: row.element,
        substanceLabel: row.substanceLabel,
        dosage: row.dosage,
        dosageReference: row.dosageReference,
        nature: row.nature,
        linkNumber: row.linkNumber,
        lastSeenAt: now,
      })),
    });
  }
  for (const batch of chunk(obsolete, UPDATE_CHUNK)) {
    await prisma.drugComposition.deleteMany({ where: { id: { in: batch } } });
  }

  report.created = toCreate.length;
  // La clé naturelle porte tout le contenu utile : une ligne retrouvée est une
  // ligne inchangée, jamais une ligne modifiée.
  report.unchanged = wanted.size - toCreate.length;
}

async function writeConditions(
  prisma: PrismaClient,
  rows: PrescriptionConditionRow[],
  specialtyIds: Map<string, string>,
  reports: Map<BdpmFileKey, BdpmFileReport>,
  now: Date,
): Promise<void> {
  const report = reports.get("PRESCRIPTION_CONDITIONS")!;
  const seenSpecialties = new Set(specialtyIds.values());

  const wanted = new Map<string, { specialtyId: string; label: string }>();
  for (const row of rows) {
    const specialtyId = specialtyIds.get(row.cisCode);
    if (!specialtyId) {
      skip(report, "code CIS absent du fichier des spécialités");
      continue;
    }
    wanted.set(`${specialtyId}${KEY_SEP}${row.label}`, { specialtyId, label: row.label });
  }

  const existing = await prisma.drugPrescriptionCondition.findMany({
    select: { id: true, specialtyId: true, label: true },
  });

  const existingKeys = new Set<string>();
  const obsolete: string[] = [];
  for (const row of existing) {
    const key = `${row.specialtyId}${KEY_SEP}${row.label}`;
    existingKeys.add(key);
    if (!wanted.has(key) && seenSpecialties.has(row.specialtyId)) obsolete.push(row.id);
  }

  const toCreate = [...wanted.entries()].filter(([key]) => !existingKeys.has(key));
  for (const batch of chunk(toCreate, CREATE_CHUNK)) {
    await prisma.drugPrescriptionCondition.createMany({
      data: batch.map(([, row]) => ({ ...row, lastSeenAt: now })),
    });
  }
  for (const batch of chunk(obsolete, UPDATE_CHUNK)) {
    await prisma.drugPrescriptionCondition.deleteMany({ where: { id: { in: batch } } });
  }

  report.created = toCreate.length;
  report.unchanged = wanted.size - toCreate.length;
}

async function writeGenericMembers(
  prisma: PrismaClient,
  rows: GenericMemberRow[],
  specialtyIds: Map<string, string>,
  reports: Map<BdpmFileKey, BdpmFileReport>,
  now: Date,
): Promise<void> {
  const report = reports.get("GENERIC_MEMBERS")!;
  const seenSpecialties = new Set(specialtyIds.values());

  // Mesuré : un identifiant de groupe porte toujours le même libellé dans le
  // fichier. On garde donc la dernière occurrence sans avoir à arbitrer.
  const groupLabels = new Map<string, string>();
  for (const row of rows) groupLabels.set(row.groupExternalId, row.groupLabel);

  const existingGroups = await prisma.drugGenericGroup.findMany({
    select: { id: true, externalId: true, label: true },
  });
  const groupIds = new Map(existingGroups.map((group) => [group.externalId, group.id]));
  const groupsByExternalId = new Map(existingGroups.map((group) => [group.externalId, group]));

  const groupsToCreate: { externalId: string; label: string }[] = [];
  const seenGroupIds: string[] = [];
  for (const [externalId, label] of groupLabels) {
    const current = groupsByExternalId.get(externalId);
    if (!current) {
      groupsToCreate.push({ externalId, label });
      continue;
    }
    seenGroupIds.push(current.id);
    if (current.label !== label) {
      await prisma.drugGenericGroup.update({ where: { id: current.id }, data: { label } });
    }
  }

  for (const batch of chunk(groupsToCreate, CREATE_CHUNK)) {
    await prisma.drugGenericGroup.createMany({
      data: batch.map((group) => ({ ...group, lastSeenAt: now })),
    });
  }
  for (const batch of chunk(
    groupsToCreate.map((group) => group.externalId),
    UPDATE_CHUNK,
  )) {
    const created = await prisma.drugGenericGroup.findMany({
      where: { externalId: { in: batch } },
      select: { id: true, externalId: true },
    });
    for (const group of created) groupIds.set(group.externalId, group.id);
  }
  for (const batch of chunk(seenGroupIds, UPDATE_CHUNK)) {
    await prisma.drugGenericGroup.updateMany({
      where: { id: { in: batch } },
      data: { lastSeenAt: now },
    });
  }

  const wanted = new Map<
    string,
    { groupId: string; specialtyId: string; type: number; sortOrder: number | null }
  >();
  for (const row of rows) {
    const specialtyId = specialtyIds.get(row.cisCode);
    const groupId = groupIds.get(row.groupExternalId);
    if (!specialtyId || !groupId) {
      skip(report, "code CIS ou groupe générique non résolu");
      continue;
    }
    wanted.set(`${groupId}${KEY_SEP}${specialtyId}`, {
      groupId,
      specialtyId,
      type: row.type,
      sortOrder: row.sortOrder,
    });
  }

  const existingMembers = await prisma.drugGenericMember.findMany({
    select: { id: true, groupId: true, specialtyId: true, type: true, sortOrder: true },
  });

  const existingKeys = new Set<string>();
  const obsolete: string[] = [];
  let updated = 0;
  for (const member of existingMembers) {
    const key = `${member.groupId}${KEY_SEP}${member.specialtyId}`;
    existingKeys.add(key);
    const target = wanted.get(key);
    if (!target) {
      if (seenSpecialties.has(member.specialtyId)) obsolete.push(member.id);
      continue;
    }
    if (member.type !== target.type || member.sortOrder !== target.sortOrder) {
      await prisma.drugGenericMember.update({
        where: { id: member.id },
        data: { type: target.type, sortOrder: target.sortOrder, lastSeenAt: now },
      });
      updated += 1;
    }
  }

  const toCreate = [...wanted.entries()].filter(([key]) => !existingKeys.has(key));
  for (const batch of chunk(toCreate, CREATE_CHUNK)) {
    await prisma.drugGenericMember.createMany({
      data: batch.map(([, member]) => ({ ...member, lastSeenAt: now })),
    });
  }
  for (const batch of chunk(obsolete, UPDATE_CHUNK)) {
    await prisma.drugGenericMember.deleteMany({ where: { id: { in: batch } } });
  }

  report.created = toCreate.length;
  report.updated = updated;
  report.unchanged = wanted.size - toCreate.length - updated;
}

/**
 * Les avis SMR n'ont pas de clé naturelle : la source contient plusieurs avis
 * pour un même couple (spécialité, dossier, date) — 8 152 tuples distincts pour
 * 9 664 lignes. On ne peut donc pas les rapprocher ligne à ligne. Ils sont
 * remplacés en bloc, pour les seules spécialités que la source décrit encore.
 */
async function writeSmrOpinions(
  prisma: PrismaClient,
  rows: SmrOpinionRow[],
  specialtyIds: Map<string, string>,
  reports: Map<BdpmFileKey, BdpmFileReport>,
): Promise<void> {
  const report = reports.get("SMR_OPINIONS")!;
  const seenSpecialties = new Set(specialtyIds.values());

  const existing = await prisma.drugSmrOpinion.findMany({
    select: { id: true, specialtyId: true },
  });
  const obsolete = existing
    .filter((opinion) => seenSpecialties.has(opinion.specialtyId))
    .map((opinion) => opinion.id);

  for (const batch of chunk(obsolete, UPDATE_CHUNK)) {
    await prisma.drugSmrOpinion.deleteMany({ where: { id: { in: batch } } });
  }

  const toCreate = rows.flatMap((row) => {
    const specialtyId = specialtyIds.get(row.cisCode);
    if (!specialtyId) {
      skip(report, "code CIS absent du fichier des spécialités");
      return [];
    }
    return [
      {
        specialtyId,
        hasDossierCode: row.hasDossierCode,
        evaluationType: row.evaluationType,
        opinionDate: row.opinionDate,
        value: row.value,
        label: row.label,
      },
    ];
  });

  for (const batch of chunk(toCreate, CREATE_CHUNK)) {
    await prisma.drugSmrOpinion.createMany({ data: batch });
  }
  report.created = toCreate.length;
}

/**
 * Ce qui a disparu de la source est marqué retiré, jamais supprimé.
 *
 * `lastSeenAt` vient d'être mis à l'heure de l'import pour tout ce que la
 * source décrit encore : ce qui est resté en arrière n'y figure plus. C'est la
 * garantie qu'une mise à jour du référentiel national ne fait pas disparaître
 * une référence encore présente dans le stock d'une officine.
 */
async function retireSpecialties(prisma: PrismaClient, now: Date): Promise<number> {
  const { count } = await prisma.drugSpecialty.updateMany({
    where: { lastSeenAt: { lt: now }, withdrawnAt: null },
    data: { withdrawnAt: now },
  });
  return count;
}

async function retirePresentations(prisma: PrismaClient, now: Date): Promise<number> {
  const { count } = await prisma.drugPresentation.updateMany({
    where: { lastSeenAt: { lt: now }, withdrawnAt: null },
    data: { withdrawnAt: now },
  });
  return count;
}

/**
 * Exécution à blanc : on compare sans rien écrire dans le catalogue.
 *
 * Les compteurs disent ce que l'import ferait. Pour les tables rattachées, la
 * clé naturelle porte l'essentiel de l'information : le compteur y est un écart
 * de volume, pas une estimation ligne à ligne — mieux vaut un chiffre dont on
 * sait ce qu'il vaut qu'un chiffre précis en apparence.
 */
async function countDryRun(
  prisma: PrismaClient,
  parsed: ParsedFiles,
  reports: Map<BdpmFileKey, BdpmFileReport>,
): Promise<void> {
  const specialties = await prisma.drugSpecialty.findMany({
    select: {
      id: true,
      cisCode: true,
      name: true,
      searchName: true,
      pharmaceuticalForm: true,
      administrationRoutes: true,
      authorizationStatus: true,
      authorizationProcedure: true,
      marketingStatus: true,
      authorizedAt: true,
      bdmStatus: true,
      europeanAuthorizationNumber: true,
      holders: true,
      enhancedMonitoring: true,
    },
  });
  const byCis = new Map(specialties.map((row) => [row.cisCode, row]));
  const specialtyReport = reports.get("SPECIALTIES")!;
  for (const row of parsed.specialties) {
    const current = byCis.get(row.cisCode);
    if (!current) specialtyReport.created += 1;
    else if (specialtyChanged(current, row)) specialtyReport.updated += 1;
    else specialtyReport.unchanged += 1;
  }

  const knownCip = new Set(
    (await prisma.drugPresentation.findMany({ select: { cip13: true } })).map((row) => row.cip13),
  );
  const presentationReport = reports.get("PRESENTATIONS")!;
  for (const row of parsed.presentations) {
    if (knownCip.has(row.cip13)) presentationReport.unchanged += 1;
    else presentationReport.created += 1;
  }

  const volumes: [BdpmFileKey, number, number][] = [
    ["COMPOSITIONS", parsed.compositions.length, await prisma.drugComposition.count()],
    [
      "PRESCRIPTION_CONDITIONS",
      parsed.conditions.length,
      await prisma.drugPrescriptionCondition.count(),
    ],
    ["GENERIC_MEMBERS", parsed.genericMembers.length, await prisma.drugGenericMember.count()],
    ["SMR_OPINIONS", parsed.smrOpinions.length, await prisma.drugSmrOpinion.count()],
  ];
  for (const [key, inFile, inDatabase] of volumes) {
    const report = reports.get(key)!;
    report.created = Math.max(0, inFile - inDatabase);
    report.unchanged = inFile - report.created;
  }
}
