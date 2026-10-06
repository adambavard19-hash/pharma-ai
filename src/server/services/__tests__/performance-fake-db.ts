/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi } from "vitest";

/**
 * Une base simulée, à plusieurs officines, pour les tests du service de
 * performance.
 *
 * Elle ne se contente pas d'enregistrer les appels : elle APPLIQUE le `where`
 * qu'on lui envoie à des lignes d'officines différentes (égalité, `in`,
 * bornes `gte`/`lt`, `not: null`, relations, `some`, `OR`). Un filtre oublié ou
 * faux dans le service fait donc apparaître la ligne d'une autre officine dans
 * le résultat — c'est ce que les tests d'isolation cherchent.
 *
 * `ignoreFilters` simule le pire cas : une base qui renverrait tout, pour
 * prouver que les gardes de fond du service tiennent seules.
 */

type Row = Record<string, any>;

export type FakeData = {
  pharmacies: Row[];
  recommendations: Row[];
  sales: Row[];
  subscriptions: Row[];
  analysisRuns: Row[];
};

const OPERATORS = ["in", "notIn", "gte", "gt", "lte", "lt", "not", "equals"];
const time = (value: unknown) => (value instanceof Date ? value.getTime() : value);

function isOperatorObject(condition: object): boolean {
  const keys = Object.keys(condition);
  return keys.length > 0 && keys.every((key) => OPERATORS.includes(key));
}

function compare(value: any, condition: Record<string, any>): boolean {
  return Object.entries(condition).every(([operator, expected]) => {
    switch (operator) {
      case "in":
        return expected.includes(value);
      case "notIn":
        return !expected.includes(value);
      case "gte":
        return value != null && time(value)! >= time(expected)!;
      case "gt":
        return value != null && time(value)! > time(expected)!;
      case "lte":
        return value != null && time(value)! <= time(expected)!;
      case "lt":
        return value != null && time(value)! < time(expected)!;
      case "not":
        return expected === null ? value != null : value !== expected;
      case "equals":
        return value === expected;
      default:
        throw new Error(`Opérateur non pris en charge par la base simulée : ${operator}`);
    }
  });
}

export function matches(row: Row | null | undefined, where: Row | undefined): boolean {
  if (!where) return true;
  if (!row) return false;
  return Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) return true;
    if (key === "OR") return (condition as Row[]).some((sub) => matches(row, sub));
    if (key === "AND") return (condition as Row[]).every((sub) => matches(row, sub));
    const value = row[key];
    if (condition === null) return value === null || value === undefined;
    if (condition instanceof Date) return time(value) === condition.getTime();
    if (typeof condition !== "object") return value === condition;
    if ("is" in condition) return value != null && matches(value, condition.is);
    if ("some" in condition) return Array.isArray(value) && value.some((item) => matches(item, condition.some));
    if (isOperatorObject(condition)) return compare(value, condition);
    return value != null && matches(value, condition);
  });
}

function groupRows(rows: Row[], args: Row): Row[] {
  const groups = new Map<string, Row[]>();
  for (const row of rows.filter((candidate) => matches(candidate, args.where))) {
    const key = (args.by as string[]).map((field) => String(row[field])).join("|");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map((group) => {
    const out: Row = {};
    for (const field of args.by as string[]) out[field] = group[0][field];
    if (args._count) out._count = group.length;
    if (args._max) {
      out._max = Object.fromEntries(
        Object.keys(args._max).map((field) => [
          field,
          group.reduce<Date | null>((max, row) => (max === null || row[field] > max ? row[field] : max), null),
        ]),
      );
    }
    return out;
  });
}

function createFakeDb() {
  const data: FakeData = { pharmacies: [], recommendations: [], sales: [], subscriptions: [], analysisRuns: [] };
  const state = { ignoreFilters: false };
  const filtered = (rows: Row[], where: Row | undefined) =>
    state.ignoreFilters ? rows : rows.filter((row) => matches(row, where));

  /** Les lignes d'une vente, avec leur conseil joint (null quand le conseil n'existe plus). */
  const withAdvice = (sale: Row): Row => ({
    ...sale,
    lines: sale.lines.map((line: Row) => ({
      ...line,
      recommendation: data.recommendations.find((r) => r.id === line.recommendationId) ?? null,
    })),
  });

  /**
   * `select: { organization: { select: { pharmacies: { where, select } } } }` : les officines de
   * l'organisation qui passent le `where` du select (comme Prisma). Une officine absente de
   * `data.pharmacies` est tenue pour active et réelle (les tests simples ne les déclarent pas).
   */
  const withOrganizationPharmacies = (row: Row, ids: string[], args: Row): Row => {
    const spec = args.select?.organization?.select?.pharmacies;
    if (!spec) return row;
    const pharmacies = ids
      .map((id) => data.pharmacies.find((p) => p.id === id) ?? { id, isActive: true, isDemo: false })
      .filter((p) => state.ignoreFilters || matches(p, spec.where))
      .map((p) => ({ id: p.id }));
    return { ...row, organization: { ...row.organization, pharmacies } };
  };

  const models = {
    recommendation: {
      findMany: vi.fn(async (args: Row) => filtered(data.recommendations, args.where)),
      groupBy: vi.fn(async (args: Row) => groupRows(data.recommendations, args)),
    },
    sale: {
      findMany: vi.fn(async (args: Row) => {
        const lineWhere = args.select?.lines?.where;
        return data.sales
          .map(withAdvice)
          .filter((sale) => state.ignoreFilters || matches(sale, args.where))
          .map((sale) => ({
            ...sale,
            lines: state.ignoreFilters ? sale.lines : sale.lines.filter((line: Row) => matches(line, lineWhere)),
          }));
      }),
      groupBy: vi.fn(async (args: Row) => groupRows(data.sales.map(withAdvice), args)),
    },
    subscription: {
      findFirst: vi.fn(async (args: Row) => {
        const row = filtered(data.subscriptions, args.where)[0] ?? null;
        return row && withOrganizationPharmacies(row, row.organization.pharmacies.map((p: Row) => p.id), args);
      }),
    },
    pharmacy: {
      findMany: vi.fn(async (args: Row) =>
        [...filtered(data.pharmacies, args.where)]
          .sort((a, b) => String(a.name).localeCompare(String(b.name)))
          .map((row) =>
            withOrganizationPharmacies(
              row,
              data.pharmacies.filter((p) => p.organizationId === row.organizationId).map((p) => p.id),
              args,
            ),
          ),
      ),
      findUnique: vi.fn(async (args: Row) => data.pharmacies.find((p) => p.id === args.where.id) ?? null),
    },
    analysisRun: {
      groupBy: vi.fn(async (args: Row) => groupRows(data.analysisRuns, args)),
    },
  };

  const operations = () =>
    Object.entries(models).flatMap(([model, ops]) =>
      Object.entries(ops).flatMap(([op, fn]) =>
        (fn as ReturnType<typeof vi.fn>).mock.calls.map((call) => ({ model, op, args: call[0] as Row })),
      ),
    );

  return {
    ...models,
    data,
    state,
    operations,
    /** Nombre total de requêtes envoyées à la base. */
    queryCount: () => operations().length,
    reset(next: Partial<FakeData> = {}) {
      data.pharmacies = next.pharmacies ?? [];
      data.recommendations = next.recommendations ?? [];
      data.sales = next.sales ?? [];
      data.subscriptions = next.subscriptions ?? [];
      data.analysisRuns = next.analysisRuns ?? [];
      state.ignoreFilters = false;
      for (const ops of Object.values(models)) for (const fn of Object.values(ops)) (fn as ReturnType<typeof vi.fn>).mockClear();
    },
  };
}

export const fakeDb = createFakeDb();

/** Cherche, dans un `where` imbriqué, une clé précise et rend toutes ses valeurs. */
export function valuesOfKey(where: unknown, key: string): unknown[] {
  if (Array.isArray(where)) return where.flatMap((item) => valuesOfKey(item, key));
  if (where === null || typeof where !== "object" || where instanceof Date) return [];
  return Object.entries(where as Row).flatMap(([k, v]) => (k === key ? [v, ...valuesOfKey(v, key)] : valuesOfKey(v, key)));
}

// ---------------------------------------------------------------- Jeux de lignes
//
// Des constructeurs de lignes à la forme que renvoie Prisma pour les `select` du
// service : colonnes filtrables (pharmacyId, isDemo, createdAt…) ET relations
// jointes (product, presentation, prescription, organization.subscription).

let sequence = 0;
const nextId = (prefix: string) => `${prefix}-${++sequence}`;

export const hoursBefore = (now: Date, hours: number) => new Date(now.getTime() - hours * 3_600_000);
export const daysBefore = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000);

/** Un conseil (`Recommendation`) : IA, proposé, ordonnance conservée, hors démo, sauf indication. */
export function adviceRow(over: Row = {}): Row {
  return {
    id: nextId("rec"),
    pharmacyId: "pharmacy-a",
    prescriptionId: nextId("rx"),
    createdAt: new Date("2026-10-04T10:00:00Z"),
    origin: "AI",
    status: "PROPOSED",
    productId: "prod-a-1",
    presentationId: null,
    unitPriceCents: 1500,
    isDemo: false,
    product: { name: "Probiotique A", category: "PROBIOTIQUES" },
    presentation: null,
    prescription: { deletedAt: null },
    ...over,
  };
}

/** Une ligne de vente ; `recommendationId` la rattache à un conseil (jointure faite par la base simulée). */
export function lineRow(over: Row = {}): Row {
  return {
    id: nextId("line"),
    recommendationId: null,
    productId: "prod-a-1",
    presentationId: null,
    label: "Probiotique A",
    quantity: 1,
    unitPriceCents: 1500,
    totalCents: 1500,
    vatRate: 20,
    product: { category: "PROBIOTIQUES" },
    ...over,
  };
}

/** Une vente (ticket) de l'officine, hors démo, avec ses lignes. */
export function saleRow(over: Row = {}, lines: Row[] = []): Row {
  const id = over.id ?? nextId("sale");
  return {
    id,
    pharmacyId: "pharmacy-a",
    createdAt: new Date("2026-10-05T14:00:00Z"),
    isDemo: false,
    ...over,
    lines: lines.map((line) => ({ ...line, saleId: id })),
  };
}

/**
 * Une officine ; `subscription` est celui de son organisation (null : aucun). Chaque officine a
 * sa propre organisation, sauf `organizationId` commun : deux officines d'un même groupe
 * (donnez-leur alors le même abonnement).
 */
export function pharmacyRow(id: string, over: Row = {}, subscription: Row | null = null): Row {
  return {
    id,
    organizationId: `org-${id}`,
    name: `Officine ${id}`,
    city: "Lyon",
    createdAt: new Date("2026-01-15T09:00:00Z"),
    isActive: true,
    isDemo: false,
    organization: { subscription },
    ...over,
  };
}

/** Un abonnement lu par `findFirst` : il est rattaché aux officines de son organisation. */
export function subscriptionRow(pharmacyIds: string[], over: Row = {}): Row {
  return {
    status: "ACTIVE",
    contractPriceCents: 12_500,
    organization: { pharmacies: pharmacyIds.map((id) => ({ id })) },
    ...over,
  };
}

/** Une analyse d'ordonnance (`AnalysisRun`). */
export function analysisRow(over: Row = {}): Row {
  return { pharmacyId: "pharmacy-a", isDemo: false, status: "COMPLETED", startedAt: new Date("2026-10-01T09:00:00Z"), ...over };
}
