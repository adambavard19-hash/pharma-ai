import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { belongsToFamily, cleanTerms, FAMILY_NAME_MAX, type FamilyDefinition } from "@/core/associations/families";

/**
 * Les familles déclencheuses, dans la console de PharmaBoost : la pharmacienne les crée, les remplit (par les mots du libellé,
 * puis produit par produit) et s'en sert comme déclencheur d'une association. Tout vaut pour TOUTES les pharmacies.
 *
 * Le catalogue montré pour vérifier une famille : les produits connus des officines clientes (hors démonstration), un par
 * code-barres. Aucun stock, aucun prix, aucune donnée patient.
 */

type Admin = { id: string; fullName: string };
type Failure = { ok: false; error: string };

export type FamilyProduct = { ean: string; name: string; manual: boolean };
export type FamilyView = {
  id: string;
  name: string;
  description: string | null;
  includeTerms: string[];
  excludeTerms: string[];
  status: "ACTIVE" | "VALIDATED" | "REMOVED";
  /** Les produits du catalogue qui en font partie (un par code-barres). */
  products: FamilyProduct[];
  /** Les produits retirés à la main. */
  removed: { key: string; label: string }[];
  associations: number;
};

type CatalogEntry = { ean: string; name: string };

/** Les produits connus des officines clientes, un par code-barres. */
async function knownCatalog(): Promise<CatalogEntry[]> {
  const rows = await prisma.product.findMany({
    where: { deletedAt: null, ean: { not: null }, pharmacy: { isDemo: false } },
    distinct: ["ean"],
    select: { ean: true, name: true },
    orderBy: { name: "asc" },
  });
  return rows.flatMap((row) => (row.ean ? [{ ean: row.ean, name: row.name }] : []));
}

const definitionOf = (row: { id: string; includeTerms: string[]; excludeTerms: string[]; members: { key: string; included: boolean }[] }): FamilyDefinition => ({
  id: row.id,
  includeTerms: row.includeTerms,
  excludeTerms: row.excludeTerms,
  members: new Map(row.members.map((member) => [member.key, member.included])),
});

function productsOf(definition: FamilyDefinition, catalog: CatalogEntry[]): FamilyProduct[] {
  return catalog
    .filter((entry) => belongsToFamily(definition, { labels: [entry.name], keys: [`ean:${entry.ean}`] }))
    .map((entry) => ({ ean: entry.ean, name: entry.name, manual: definition.members.get(`ean:${entry.ean}`) === true }));
}

export async function listTriggerFamilies(): Promise<FamilyView[]> {
  const [rows, catalog, links] = await Promise.all([
    prisma.triggerFamily.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, description: true, includeTerms: true, excludeTerms: true, status: true, members: { select: { key: true, label: true, included: true } } } }),
    knownCatalog(),
    prisma.centralAssociation.groupBy({ by: ["triggerKey"], where: { triggerKind: "FAMILY", status: { not: "REMOVED" } }, _count: true }),
  ]);
  const used = new Map(links.map((link) => [link.triggerKey, link._count]));
  return rows.map((row) => {
    const definition = definitionOf(row);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      includeTerms: row.includeTerms,
      excludeTerms: row.excludeTerms,
      status: row.status,
      products: productsOf(definition, catalog),
      removed: row.members.filter((member) => !member.included).map((member) => ({ key: member.key, label: member.label })),
      associations: used.get(`family:${row.id}`) ?? 0,
    };
  });
}

/** Ce que des mots donneraient, avant d'enregistrer : la pharmacienne voit les produits pris (et ceux qu'il faut exclure). */
export async function previewFamilyTerms(includeTerms: string[], excludeTerms: string[]): Promise<FamilyProduct[]> {
  const definition: FamilyDefinition = { id: "apercu", includeTerms: cleanTerms(includeTerms), excludeTerms: cleanTerms(excludeTerms), members: new Map() };
  if (definition.includeTerms.length === 0) return [];
  return productsOf(definition, await knownCatalog());
}

export type FamilyDraft = { name: string; description: string | null; includeTerms: string[]; excludeTerms: string[] };

function cleanDraft(draft: FamilyDraft): { ok: true; value: FamilyDraft } | Failure {
  const name = draft.name.replace(/\s+/g, " ").trim().slice(0, FAMILY_NAME_MAX);
  if (name.length < 2) return { ok: false, error: "Donnez un nom à la famille (« Shampoings anti-chute »)." };
  const includeTerms = cleanTerms(draft.includeTerms);
  return { ok: true, value: { name, description: draft.description?.trim().slice(0, 300) || null, includeTerms, excludeTerms: cleanTerms(draft.excludeTerms) } };
}

const isDuplicate = (error: unknown) => typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";

export async function createTriggerFamily(admin: Admin, draft: FamilyDraft): Promise<{ ok: true; id: string } | Failure> {
  const clean = cleanDraft(draft);
  if (!clean.ok) return clean;
  try {
    const created = await prisma.triggerFamily.create({ data: { ...clean.value, createdByName: admin.fullName }, select: { id: true } });
    await recordAudit({ action: "central_advice.family_created", entityType: "TriggerFamily", entityId: created.id, platformAdminId: admin.id, metadata: { name: clean.value.name } });
    return { ok: true, id: created.id };
  } catch (error) {
    if (isDuplicate(error)) return { ok: false, error: "Une famille porte déjà ce nom." };
    throw error;
  }
}

export async function updateTriggerFamily(admin: Admin, id: string, draft: FamilyDraft): Promise<{ ok: true } | Failure> {
  const clean = cleanDraft(draft);
  if (!clean.ok) return clean;
  const before = await prisma.triggerFamily.findUnique({ where: { id }, select: { name: true } });
  if (!before) return { ok: false, error: "Famille introuvable." };
  try {
    await prisma.triggerFamily.update({ where: { id }, data: clean.value });
  } catch (error) {
    if (isDuplicate(error)) return { ok: false, error: "Une famille porte déjà ce nom." };
    throw error;
  }
  // Le nom affiché des associations qu'elle déclenche suit le nouveau nom.
  if (before.name !== clean.value.name) await prisma.centralAssociation.updateMany({ where: { triggerKey: `family:${id}` }, data: { triggerLabel: clean.value.name } });
  await recordAudit({ action: "central_advice.family_edited", entityType: "TriggerFamily", entityId: id, platformAdminId: admin.id, metadata: { name: clean.value.name } });
  return { ok: true };
}

/** Supprimer une famille la retire du moteur (ses associations ne se déclenchent plus) ; on peut la rétablir. */
export async function setTriggerFamilyRemoved(admin: Admin, id: string, removed: boolean): Promise<{ ok: true; name: string } | Failure> {
  const row = await prisma.triggerFamily.findUnique({ where: { id }, select: { name: true } });
  if (!row) return { ok: false, error: "Famille introuvable." };
  await prisma.triggerFamily.update({ where: { id }, data: { status: removed ? "REMOVED" : "ACTIVE" } });
  await recordAudit({ action: removed ? "central_advice.family_removed" : "central_advice.family_restored", entityType: "TriggerFamily", entityId: id, platformAdminId: admin.id, metadata: {} });
  return { ok: true, name: row.name };
}

/** Ajouter un produit à la main (`included`), le retirer (`!included`), ou annuler ce choix (`null`). */
export async function setTriggerFamilyMember(admin: Admin, familyId: string, member: { ean: string; label: string }, included: boolean | null): Promise<{ ok: true } | Failure> {
  const ean = member.ean.replace(/\D/g, "");
  if (!/^\d{7,14}$/.test(ean)) return { ok: false, error: "Ce produit n'a pas de code-barres." };
  const family = await prisma.triggerFamily.findUnique({ where: { id: familyId }, select: { id: true } });
  if (!family) return { ok: false, error: "Famille introuvable." };
  const key = `ean:${ean}`;
  if (included === null) {
    await prisma.triggerFamilyMember.deleteMany({ where: { familyId, key } });
  } else {
    await prisma.triggerFamilyMember.upsert({
      where: { familyId_key: { familyId, key } },
      create: { familyId, key, label: member.label.slice(0, 160), included },
      update: { included, label: member.label.slice(0, 160) },
    });
  }
  await recordAudit({ action: "central_advice.family_member", entityType: "TriggerFamily", entityId: familyId, platformAdminId: admin.id, metadata: { key, included } });
  return { ok: true };
}
