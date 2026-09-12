import "server-only";
import * as XLSX from "xlsx";
import { prisma } from "@/server/db/client";
import type { Prisma } from "@/generated/prisma";
import { recordIsDemo } from "@/server/db/demo-scope";
import { reserveReferences } from "./references";
import { refreshStockNotifications, createNotification } from "./notifications";
import { recordAudit } from "@/server/audit/log";
import {
  classifyRows,
  missingRequiredFields,
  normalizeName,
  readRows,
  suggestMapping,
  summarize,
  type ClassifiedRow,
  type ColumnMapping,
  type ImportSummary,
  type Lookups,
  type RowCandidate,
  type RowDecision,
} from "@/core/stock-import";
import type { TenantScope } from "@/server/db/tenant";
import { tagsFromName } from "@/core/stock-import/tags";
import { lgpiInventoryToRecords, parseLgpiInventoryText } from "@/core/stock-import/lgpi-inventory";
import { extractPdfLayoutText } from "./pdf-text";
import { classifyPharmacyProducts, type ClassificationRunSummary } from "./product-classification";

/**
 * L'import du stock d'une officine, en deux temps.
 *
 * 1. ANALYSER : lire le fichier, proposer les colonnes, rattacher chaque ligne
 *    à ce qui est connu (CIP13 → catalogue national, EAN ou nom exact →
 *    produit de l'officine), résumer. Rien n'est écrit en stock : les lignes
 *    attendent dans le journal d'import, avec leur statut.
 * 2. VALIDER : le titulaire a vu l'aperçu, tranché les lignes incertaines,
 *    et tout s'écrit dans une seule transaction — ou rien.
 *
 * Le catalogue national n'est jamais transformé en stock : seules les lignes
 * du fichier, avec leurs quantités, deviennent du stock de cette officine.
 */

export const IMPORT_MAX_BYTES = 8 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 50_000;

export type ParsedFile = { headers: string[]; records: Record<string, unknown>[] };

/**
 * Lit un fichier d'import, y compris un PDF quand c'est une édition
 * d'inventaire LGPI : le texte en est extrait avec sa mise en page, puis lu
 * comme un tableau. Un PDF d'une autre forme est refusé, avec le motif.
 */
export async function parseImportFileAsync(name: string, bytes: Uint8Array): Promise<ParsedFile> {
  if (name.toLowerCase().endsWith(".pdf")) {
    const { text } = await extractPdfLayoutText(bytes);
    const inventory = parseLgpiInventoryText(text);
    if (inventory.lines.length === 0) {
      throw new Error("Ce PDF n'est pas une édition d'inventaire LGPI reconnue. Exportez l'inventaire depuis LGPI (Inventaire → Édition), ou fournissez un CSV / Excel.");
    }
    return lgpiInventoryToRecords(inventory);
  }
  return parseImportFile(name, bytes);
}

export function parseImportFile(name: string, bytes: Uint8Array): ParsedFile {
  const lower = name.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const workbook = XLSX.read(bytes, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return { headers: [], records: [] };
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
    return fromMatrix(matrix);
  }
  return fromMatrix(parseCsv(new TextDecoder("utf-8").decode(bytes)));
}

function fromMatrix(matrix: unknown[][]): ParsedFile {
  const nonEmpty = matrix.filter((row) => row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ""));
  if (nonEmpty.length === 0) return { headers: [], records: [] };
  const headers = nonEmpty[0].map((cell, index) => (cell === null || cell === undefined || String(cell).trim() === "" ? `Colonne ${index + 1}` : String(cell).trim()));
  const records = nonEmpty.slice(1, IMPORT_MAX_ROWS + 1).map((row) => {
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? null;
    });
    return record;
  });
  return { headers, records };
}

/** CSV : séparateur `;`, `,` ou tabulation, guillemets doublés, retours Windows. */
export function parseCsv(text: string): unknown[][] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const firstLine = clean.split("\n")[0] ?? "";
  const delimiter = [";", ",", "\t"]
    .map((candidate) => ({ candidate, count: firstLine.split(candidate).length }))
    .sort((a, b) => b.count - a.count)[0].candidate;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    if (quoted) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((cells) => cells.map((value) => (value.trim() === "" ? null : value.trim())));
}

export type ImportPreview = {
  jobId: string;
  fileName: string;
  headers: string[];
  mapping: ColumnMapping;
  missing: string[];
  summary: ImportSummary;
  rows: ClassifiedRow[];
};

async function buildLookups(scope: TenantScope, rows: ReturnType<typeof readRows>): Promise<Lookups> {
  const codes = rows.map((row) => row.code).filter((code): code is string => Boolean(code));
  const cip13s = [...new Set(codes.map((code) => (code.length === 13 ? code : null)).filter(Boolean))] as string[];
  const cip7s = codes.filter((code) => code.length === 7);

  const [presentations, presentationsByCip7, products] = await Promise.all([
    cip13s.length
      ? prisma.drugPresentation.findMany({
          where: { cip13: { in: cip13s } },
          select: { id: true, cip13: true, label: true, specialty: { select: { name: true } } },
        })
      : [],
    cip7s.length
      ? prisma.drugPresentation.findMany({
          where: { cip7: { in: cip7s } },
          select: { id: true, cip13: true, label: true, specialty: { select: { name: true } } },
        })
      : [],
    prisma.product.findMany({
      where: { pharmacyId: scope.pharmacyId, deletedAt: null },
      select: { id: true, name: true, ean: true },
    }),
  ]);

  const presentationByCip13 = new Map<string, { id: string; label: string }>();
  for (const row of [...presentations, ...presentationsByCip7]) {
    presentationByCip13.set(row.cip13, { id: row.id, label: `${row.specialty.name} — ${row.label}` });
  }
  const productByEan = new Map(products.filter((p) => p.ean).map((p) => [p.ean as string, { id: p.id, name: p.name }]));
  const productByName = new Map(products.map((p) => [normalizeName(p.name), { id: p.id, name: p.name }]));

  const candidatesFor = (name: string): RowCandidate[] => {
    const tokens = normalizeName(name).split(" ").filter((token) => token.length > 3);
    if (tokens.length === 0) return [];
    return products
      .map((product) => {
        const normalized = normalizeName(product.name);
        const hits = tokens.filter((token) => normalized.includes(token)).length;
        return { product, hits };
      })
      .filter(({ hits }) => hits >= Math.min(2, tokens.length))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 3)
      .map(({ product }) => ({ id: product.id, label: product.name, detail: "produit de l'officine" }));
  };

  return { presentationByCip13, productByEan, productByName, candidatesFor };
}

export async function analyseStockImport(params: {
  scope: TenantScope;
  fileName: string;
  bytes: Uint8Array;
  mapping?: ColumnMapping;
}): Promise<ImportPreview> {
  const parsed = await parseImportFileAsync(params.fileName, params.bytes);
  if (parsed.headers.length === 0 || parsed.records.length === 0) {
    throw new Error("Le fichier ne contient aucune ligne exploitable.");
  }
  const mapping = params.mapping ?? suggestMapping(parsed.headers);
  const job = await prisma.importJob.create({
    data: {
      pharmacyId: params.scope.pharmacyId,
      kind: "STOCK",
      status: "PENDING",
      fileName: params.fileName,
      totalRows: parsed.records.length,
      userId: params.scope.userId,
      mapping: mapping as never,
      payload: { headers: parsed.headers, records: parsed.records } as never,
    },
  });
  return classifyJob({ scope: params.scope, jobId: job.id, mapping, parsed });
}

/** Réanalyse avec une autre correspondance de colonnes, sans renvoyer le fichier. */
export async function remapStockImport(params: {
  scope: TenantScope;
  jobId: string;
  mapping: ColumnMapping;
}): Promise<ImportPreview> {
  const job = await loadPendingJob(params.scope, params.jobId);
  const payload = job.payload as { headers: string[]; records: Record<string, unknown>[] };
  await prisma.importJob.update({ where: { id: job.id }, data: { mapping: params.mapping as never } });
  return classifyJob({ scope: params.scope, jobId: job.id, mapping: params.mapping, parsed: payload });
}

async function classifyJob(params: {
  scope: TenantScope;
  jobId: string;
  mapping: ColumnMapping;
  parsed: ParsedFile;
}): Promise<ImportPreview> {
  const missing = missingRequiredFields(params.mapping);
  const job = await prisma.importJob.findUniqueOrThrow({ where: { id: params.jobId }, select: { fileName: true } });
  if (missing.length > 0) {
    return {
      jobId: params.jobId,
      fileName: job.fileName,
      headers: params.parsed.headers,
      mapping: params.mapping,
      missing,
      summary: { detected: params.parsed.records.length, medicaments: 0, existing: 0, toVerify: 0, unknown: 0, invalid: 0, withIssues: 0 },
      rows: [],
    };
  }

  const rows = readRows(params.parsed.records, params.mapping);
  const lookups = await buildLookups(params.scope, rows);
  const classified = classifyRows(rows, lookups);
  const summary = summarize(classified);

  await prisma.importJob.update({
    where: { id: params.jobId },
    data: {
      summary: summary as never,
      payload: { headers: params.parsed.headers, records: params.parsed.records, rows: classified } as never,
    },
  });

  return { jobId: params.jobId, fileName: job.fileName, headers: params.parsed.headers, mapping: params.mapping, missing: [], summary, rows: classified };
}

async function loadPendingJob(scope: TenantScope, jobId: string) {
  const job = await prisma.importJob.findUnique({ where: { id: jobId } });
  if (!job || job.pharmacyId !== scope.pharmacyId) throw new Error("Import introuvable dans cette officine.");
  if (job.status !== "PENDING") throw new Error("Cet import a déjà été traité.");
  return job;
}

export type ImportOutcome = {
  jobId: string;
  drugsUpserted: number;
  productsUpdated: number;
  productsCreated: number;
  ignored: number;
  invalid: number;
  /** Ce que le moteur a compris des produits créés : combien il pourra relier à un besoin. */
  classification: ClassificationRunSummary | null;
};

/**
 * Écrit l'import — tout ou rien.
 *
 * Une ligne « à vérifier » sans décision est ignorée, jamais devinée. Une
 * ligne non reconnue n'est créée que si le titulaire l'a demandé. Les
 * quantités importées sont des INVENTAIRES : c'est ce que l'officine dit
 * avoir, et le mouvement le consigne comme tel.
 */
export async function commitStockImport(params: {
  scope: TenantScope;
  pharmacyIsDemo: boolean;
  jobId: string;
  decisions: Record<string, RowDecision>;
  /** Quand vrai, toute ligne non reconnue est créée comme produit de l'officine. */
  createUnknownByDefault: boolean;
}): Promise<ImportOutcome> {
  const job = await loadPendingJob(params.scope, params.jobId);
  const payload = job.payload as { rows?: ClassifiedRow[] } | null;
  const rows = payload?.rows ?? [];
  if (rows.length === 0) throw new Error("Aucune ligne analysée : relancez l'analyse du fichier.");

  const plan = rows.map((row) => {
    const decision = params.decisions[String(row.line)];
    if (row.status === "INVALIDE") return { row, action: "INVALID" as const };
    if (decision?.kind === "IGNORER") return { row, action: "IGNORE" as const };
    if (row.status === "MEDICAMENT") return { row, action: "DRUG" as const, targetId: row.targetId as string };
    if (row.status === "PRODUIT_EXISTANT") return { row, action: "PRODUCT" as const, targetId: row.targetId as string };
    if (decision?.kind === "RATTACHER") return { row, action: "PRODUCT" as const, targetId: decision.targetId };
    if (decision?.kind === "CREER_PRODUIT" || (row.status === "NON_RECONNU" && params.createUnknownByDefault)) {
      return { row, action: "CREATE" as const };
    }
    return { row, action: "IGNORE" as const };
  });

  // Les références des nouveaux produits sont réservées avant la transaction :
  // le compteur vit hors d'elle, et une transaction qui échoue ne doit pas
  // laisser des trous invisibles.
  const creations = plan.filter((item) => item.action === "CREATE");
  const references = await reserveReferences("product", params.scope.pharmacyId, creations.length);

  const outcome: ImportOutcome = {
    jobId: job.id,
    drugsUpserted: 0,
    productsUpdated: 0,
    productsCreated: 0,
    ignored: plan.filter((item) => item.action === "IGNORE").length,
    invalid: plan.filter((item) => item.action === "INVALID").length,
    classification: null,
  };
  const createdProductIds: string[] = [];

  await prisma.$transaction(
    async (tx) => {
      let creationIndex = 0;
      for (const item of plan) {
        const { row } = item;
        const quantity = Math.max(0, row.quantity ?? 0);

        if (item.action === "DRUG") {
          await tx.pharmacyDrugStock.upsert({
            where: { pharmacyId_presentationId: { pharmacyId: params.scope.pharmacyId, presentationId: item.targetId } },
            create: {
              pharmacyId: params.scope.pharmacyId,
              presentationId: item.targetId,
              quantity,
              priceCents: row.salePriceCents,
              source: "IMPORT",
              lastCountedAt: new Date(),
            },
            update: { quantity, priceCents: row.salePriceCents ?? undefined, source: "IMPORT", lastCountedAt: new Date() },
          });
          outcome.drugsUpserted += 1;
        } else if (item.action === "PRODUCT") {
          const product = await tx.product.findUnique({ where: { id: item.targetId }, select: { pharmacyId: true } });
          if (!product || product.pharmacyId !== params.scope.pharmacyId) {
            throw new Error(`Ligne ${row.line} : produit introuvable dans cette officine.`);
          }
          await tx.product.update({
            where: { id: item.targetId },
            data: {
              ...(row.salePriceCents !== null ? { salePriceCents: row.salePriceCents } : {}),
              ...(row.purchasePriceCents !== null ? { purchasePriceCents: row.purchasePriceCents } : {}),
              ...(row.vatRate !== null ? { vatRate: row.vatRate } : {}),
              ...(row.brand ? { brand: row.brand } : {}),
              ...(row.code && row.code.length === 13 ? { ean: row.code } : {}),
            },
          });
          await inventoryInTx(tx, params.scope, item.targetId, quantity, `Import ${job.fileName}`);
          outcome.productsUpdated += 1;
        } else if (item.action === "CREATE") {
          const name = row.name ?? `Produit ${row.code}`;
          const created = await tx.product.create({
            data: {
              pharmacyId: params.scope.pharmacyId,
              organizationId: params.scope.organizationId,
              name,
              brand: row.brand,
              // La catégorie et les étiquettes d'usage sont posées juste après
              // l'écriture, par la classification (dictionnaire puis modèle).
              category: "AUTRE",
              subCategory: row.categoryLabel,
              reference: references[creationIndex++],
              ean: row.code && row.code.length === 13 ? row.code : null,
              salePriceCents: row.salePriceCents ?? 0,
              purchasePriceCents: row.purchasePriceCents ?? 0,
              ...(row.vatRate !== null ? { vatRate: row.vatRate } : {}),
              // Les mots du nom servent d'étiquettes de recherche en attendant.
              matchingTags: tagsFromName(name),
              isDemo: recordIsDemo(params.pharmacyIsDemo),
              stockItem: { create: { pharmacyId: params.scope.pharmacyId, quantity, alertThreshold: 5 } },
            },
            select: { id: true },
          });
          createdProductIds.push(created.id);
          await tx.stockMovement.create({
            data: {
              pharmacyId: params.scope.pharmacyId,
              productId: created.id,
              type: "IMPORT",
              quantityDelta: quantity,
              quantityAfter: quantity,
              reason: `Import ${job.fileName}`,
              userId: params.scope.userId,
            },
          });
          outcome.productsCreated += 1;
        }
      }

      await tx.importJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          createdRows: outcome.productsCreated,
          updatedRows: outcome.productsUpdated + outcome.drugsUpserted,
          errorRows: outcome.invalid,
          errors: rows.filter((row) => row.status === "INVALIDE").slice(0, 200).map((row) => ({ line: row.line, issues: row.issues })) as never,
          summary: { ...((job.summary as object) ?? {}), outcome } as never,
          // Le fichier lui-même n'a plus à vivre en base une fois écrit.
          payload: { rows } as never,
          finishedAt: new Date(),
        },
      });

      // Le stock est désormais synchronisé : c'est cette date que voit le
      // titulaire (« Stock synchronisé aujourd'hui à… »).
      await tx.pharmacy.update({ where: { id: params.scope.pharmacyId }, data: { stockSyncedAt: new Date() } });
    },
    { timeout: 120_000, maxWait: 10_000 },
  );

  // Comprendre ce que l'officine vient d'importer, pour que le moteur puisse
  // le proposer. Hors transaction : une classification qui échoue ne défait
  // pas un import réussi — elle laisse des produits « à classer », visibles.
  if (createdProductIds.length > 0) {
    try {
      outcome.classification = await classifyPharmacyProducts({ scope: params.scope, productIds: createdProductIds });
    } catch (error) {
      console.error(`[stock-import] classification des produits impossible : ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await recordAudit({
    action: "product.imported",
    entityType: "ImportJob",
    entityId: job.id,
    pharmacyId: params.scope.pharmacyId,
    userId: params.scope.userId,
    metadata: outcome as never,
  });
  await createNotification({
    pharmacyId: params.scope.pharmacyId,
    userId: params.scope.userId,
    type: "IMPORT_COMPLETED",
    severity: outcome.invalid > 0 ? "WARNING" : "SUCCESS",
    title: "Import du stock terminé",
    body: `${outcome.productsCreated} produit(s) créé(s), ${outcome.productsUpdated + outcome.drugsUpserted} mis à jour, ${outcome.ignored} ignoré(s), ${outcome.invalid} ligne(s) invalide(s).`,
    linkUrl: "/stock",
  });
  await refreshStockNotifications(params.scope.pharmacyId);

  return outcome;
}

/** Une quantité déclarée par inventaire, avec son mouvement, dans la transaction courante. */
async function inventoryInTx(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  productId: string,
  quantity: number,
  reason: string,
): Promise<void> {
  const item = await tx.stockItem.findUnique({ where: { productId }, select: { id: true, quantity: true } });
  const before = item?.quantity ?? 0;
  if (item) {
    await tx.stockItem.update({ where: { id: item.id }, data: { quantity, lastCountedAt: new Date() } });
  } else {
    await tx.stockItem.create({ data: { pharmacyId: scope.pharmacyId, productId, quantity, alertThreshold: 5, lastCountedAt: new Date() } });
  }
  await tx.stockMovement.create({
    data: {
      pharmacyId: scope.pharmacyId,
      productId,
      type: "IMPORT",
      quantityDelta: quantity - before,
      quantityAfter: quantity,
      reason,
      userId: scope.userId,
    },
  });
}

export { tagsFromName };
