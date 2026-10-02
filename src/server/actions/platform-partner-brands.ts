"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { recordAudit } from "@/server/audit/log";
import { AUDIENCES, PUBLICATION_STATUSES, slugify } from "@/core/partners/status";
import { brandKey } from "@/core/catalog/brand";
import { isValidCip13, isValidEan13 } from "@/core/stock/cip";
import { parseAmountToCents } from "@/lib/format";
import {
  changeBrandStatus,
  changeRangeStatus,
  createBrand,
  saveDocument,
  saveRange,
  setDocumentActive,
  setPharmacyPilot,
  updateBrand,
  updateBrandAudience,
  type BrandInput,
} from "@/server/services/partners/brands";
import { deleteProduct, importCatalog, saveProduct, setProductActive, type CatalogImportReport } from "@/server/services/partners/catalog-admin";
import { changeOfferStatus, saveOffer } from "@/server/services/partners/offers";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * Console PharmaBoost Partenaires : marques, gammes, documents, catalogue,
 * offres et groupe pilote. Chaque geste part d'une session administrateur
 * plateforme, revérifie tout identifiant reçu et laisse une trace d'audit
 * (identifiants et compteurs seulement). La diffusion est centrale : rien
 * n'est copié dans les officines, elles lisent ces fiches à la demande.
 */

const PARTNERS_ROOT = "/admin/partenaires";

function revalidatePartners(brandId?: string | null) {
  revalidatePath(`${PARTNERS_ROOT}/marques`);
  if (brandId) revalidatePath(`${PARTNERS_ROOT}/marques/${brandId}`);
  revalidatePath(`${PARTNERS_ROOT}/catalogues`);
  revalidatePath(`${PARTNERS_ROOT}/offres`);
  revalidatePath(`${PARTNERS_ROOT}/statistiques`);
}

const id = z.string().min(1).max(64);
const publicationStatus = z.enum(PUBLICATION_STATUSES);

/** Texte facultatif : vide → null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères au plus.`)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null));

/** Une adresse https, ou null si vide ; sinon un message. */
function httpsUrl(value: string | null): { value: string | null; error: string | null } {
  if (!value) return { value: null, error: null };
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return { value: null, error: "Adresse https:// uniquement." };
    return { value: url.toString(), error: null };
  } catch {
    return { value: null, error: "Adresse invalide (https://…)." };
  }
}

// ---------------------------------------------------------------------------
// Groupe pilote
// ---------------------------------------------------------------------------

const pilotSchema = z.object({ pharmacyId: id, pilot: z.boolean() });

export async function setPartnerPilotAction(payload: z.input<typeof pilotSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = pilotSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await setPharmacyPilot(parsed.data.pharmacyId, parsed.data.pilot);
  if (!result.ok) return fail(result.error);
  if (result.data.changed) {
    await recordAudit({
      action: "partner.pilot_updated",
      entityType: "Pharmacy",
      entityId: parsed.data.pharmacyId,
      pharmacyId: parsed.data.pharmacyId,
      platformAdminId: session.admin.id,
      metadata: { partnerPilot: parsed.data.pilot },
    });
  }
  revalidatePartners();
  return ok(null, parsed.data.pilot ? `${result.data.name} rejoint le groupe pilote.` : `${result.data.name} quitte le groupe pilote.`);
}

// ---------------------------------------------------------------------------
// Marques
// ---------------------------------------------------------------------------

const brandSchema = z.object({
  name: z.string().trim().min(2, "Le nom de la marque est obligatoire.").max(120, "120 caractères au plus."),
  slug: optionalText(80),
  brandKey: optionalText(120),
  logoUrl: optionalText(2000),
  description: optionalText(4000),
  universes: z.array(z.string().max(60)).max(30).default([]),
});

function brandInputOf(data: z.output<typeof brandSchema>): { ok: true; input: BrandInput } | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const slug = slugify(data.slug ?? data.name);
  if (!slug) fieldErrors.slug = "Le slug doit contenir des lettres ou des chiffres.";
  const key = brandKey(data.brandKey ?? data.name);
  if (!key) fieldErrors.brandKey = "La marque normalisée est vide.";
  const logo = httpsUrl(data.logoUrl);
  if (logo.error) fieldErrors.logoUrl = logo.error;
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, input: { name: data.name, slug, brandKey: key, logoUrl: logo.value, description: data.description, universes: data.universes } };
}

const createBrandSchema = brandSchema.extend({ partnerId: z.string().min(1, "Choisissez le partenaire.").max(64) });

export async function createPartnerBrandAction(payload: z.input<typeof createBrandSchema>): Promise<ActionResult<{ id: string }>> {
  const session = await requirePlatformSession();
  const parsed = createBrandSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez la marque.", zodFieldErrors(parsed.error.issues));
  const built = brandInputOf(parsed.data);
  if (!built.ok) return fail("Vérifiez la marque.", built.fieldErrors);

  const result = await createBrand(parsed.data.partnerId, built.input);
  if (!result.ok) return fail(result.error, result.field ? { [result.field]: result.error } : undefined);

  await recordAudit({
    action: "partner.brand_saved",
    entityType: "PartnerBrand",
    entityId: result.data.id,
    platformAdminId: session.admin.id,
    metadata: { created: true, partnerId: parsed.data.partnerId, slug: built.input.slug, universes: built.input.universes.length },
  });
  revalidatePartners(result.data.id);
  return ok({ id: result.data.id }, `Marque « ${built.input.name} » créée en brouillon.`);
}

const updateBrandSchema = brandSchema.extend({ id });

export async function updatePartnerBrandAction(payload: z.input<typeof updateBrandSchema>): Promise<ActionResult<{ id: string }>> {
  const session = await requirePlatformSession();
  const parsed = updateBrandSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez la marque.", zodFieldErrors(parsed.error.issues));
  const built = brandInputOf(parsed.data);
  if (!built.ok) return fail("Vérifiez la marque.", built.fieldErrors);

  const result = await updateBrand(parsed.data.id, built.input);
  if (!result.ok) return fail(result.error, result.field ? { [result.field]: result.error } : undefined);

  await recordAudit({
    action: "partner.brand_saved",
    entityType: "PartnerBrand",
    entityId: parsed.data.id,
    platformAdminId: session.admin.id,
    metadata: { created: false, slug: built.input.slug, universes: built.input.universes.length },
  });
  revalidatePartners(parsed.data.id);
  return ok({ id: parsed.data.id }, "Fiche marque enregistrée.");
}

const brandStatusSchema = z.object({ id, status: publicationStatus });

export async function setPartnerBrandStatusAction(payload: z.input<typeof brandStatusSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = brandStatusSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await changeBrandStatus(parsed.data.id, parsed.data.status);
  if (!result.ok) return fail(result.error);

  await recordAudit({
    action: "partner.brand_status_changed",
    entityType: "PartnerBrand",
    entityId: parsed.data.id,
    platformAdminId: session.admin.id,
    metadata: { from: result.data.from, to: result.data.to },
  });
  revalidatePartners(parsed.data.id);
  return ok(null, `« ${result.data.name} » : statut mis à jour.`);
}

const audienceSchema = z.object({ id, audience: z.enum(AUDIENCES), pharmacyIds: z.array(id).max(5000).default([]) });

export async function setPartnerBrandAudienceAction(payload: z.input<typeof audienceSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = audienceSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await updateBrandAudience(parsed.data.id, parsed.data.audience, parsed.data.pharmacyIds);
  if (!result.ok) return fail(result.error, result.field ? { [result.field]: result.error } : undefined);

  await recordAudit({
    action: "partner.brand_audience_updated",
    entityType: "PartnerBrand",
    entityId: parsed.data.id,
    platformAdminId: session.admin.id,
    metadata: { audience: parsed.data.audience, selected: result.data.selected },
  });
  revalidatePartners(parsed.data.id);
  return ok(null, "Audience enregistrée.");
}

// ---------------------------------------------------------------------------
// Gammes
// ---------------------------------------------------------------------------

const rangeSchema = z.object({
  brandId: id,
  id: id.optional().nullable(),
  name: z.string().trim().min(1, "Le nom de la gamme est obligatoire.").max(120, "120 caractères au plus."),
  description: optionalText(2000),
  universe: optionalText(60),
  sortOrder: z.coerce.number({ message: "Un nombre entier." }).int("Un nombre entier.").min(0, "0 au moins.").max(9999).default(0),
});

export async function savePartnerRangeAction(payload: z.input<typeof rangeSchema>): Promise<ActionResult<{ id: string }>> {
  const session = await requirePlatformSession();
  const parsed = rangeSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez la gamme.", zodFieldErrors(parsed.error.issues));
  const { brandId, id: rangeId, ...input } = parsed.data;
  const result = await saveRange(brandId, rangeId ?? null, input);
  if (!result.ok) return fail(result.error, result.field ? { [result.field]: result.error } : undefined);

  await recordAudit({
    action: "partner.range_saved",
    entityType: "PartnerRange",
    entityId: result.data.id,
    platformAdminId: session.admin.id,
    metadata: { brandId, created: result.data.created, universe: input.universe },
  });
  revalidatePartners(brandId);
  return ok({ id: result.data.id }, result.data.created ? `Gamme « ${input.name} » créée en brouillon.` : "Gamme enregistrée.");
}

const rangeStatusSchema = z.object({ brandId: id, id, status: publicationStatus });

export async function setPartnerRangeStatusAction(payload: z.input<typeof rangeStatusSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = rangeStatusSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await changeRangeStatus(parsed.data.brandId, parsed.data.id, parsed.data.status);
  if (!result.ok) return fail(result.error);

  await recordAudit({
    action: "partner.range_saved",
    entityType: "PartnerRange",
    entityId: parsed.data.id,
    platformAdminId: session.admin.id,
    metadata: { brandId: parsed.data.brandId, from: result.data.from, to: result.data.to },
  });
  revalidatePartners(parsed.data.brandId);
  return ok(null, `Gamme « ${result.data.name} » : statut mis à jour.`);
}

// ---------------------------------------------------------------------------
// Documents professionnels
// ---------------------------------------------------------------------------

const documentSchema = z.object({
  brandId: id,
  id: id.optional().nullable(),
  title: z.string().trim().min(2, "Le titre est obligatoire.").max(200, "200 caractères au plus."),
  kind: z.string().trim().regex(/^[A-Z_]{2,40}$/, "Type invalide."),
  url: z.string().trim().min(1, "L'adresse est obligatoire.").max(2000),
});

export async function savePartnerDocumentAction(payload: z.input<typeof documentSchema>): Promise<ActionResult<{ id: string }>> {
  const session = await requirePlatformSession();
  const parsed = documentSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez le document.", zodFieldErrors(parsed.error.issues));
  const url = httpsUrl(parsed.data.url);
  if (url.error || !url.value) return fail("Vérifiez le document.", { url: url.error ?? "Adresse invalide." });

  const result = await saveDocument(parsed.data.brandId, parsed.data.id ?? null, { title: parsed.data.title, kind: parsed.data.kind, url: url.value });
  if (!result.ok) return fail(result.error);

  await recordAudit({
    action: "partner.document_saved",
    entityType: "PartnerDocument",
    entityId: result.data.id,
    platformAdminId: session.admin.id,
    metadata: { brandId: parsed.data.brandId, created: result.data.created, kind: parsed.data.kind },
  });
  revalidatePartners(parsed.data.brandId);
  return ok({ id: result.data.id }, result.data.created ? "Document ajouté." : "Document enregistré.");
}

const documentActiveSchema = z.object({ brandId: id, id, isActive: z.boolean() });

export async function setPartnerDocumentActiveAction(payload: z.input<typeof documentActiveSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = documentActiveSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await setDocumentActive(parsed.data.brandId, parsed.data.id, parsed.data.isActive);
  if (!result.ok) return fail(result.error);

  await recordAudit({
    action: "partner.document_saved",
    entityType: "PartnerDocument",
    entityId: parsed.data.id,
    platformAdminId: session.admin.id,
    metadata: { brandId: parsed.data.brandId, isActive: parsed.data.isActive },
  });
  revalidatePartners(parsed.data.brandId);
  return ok(null, parsed.data.isActive ? `« ${result.data.title} » est de nouveau proposé.` : `« ${result.data.title} » n'est plus proposé.`);
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

const productSchema = z.object({
  brandId: id,
  id: id.optional().nullable(),
  name: z.string().trim().min(2, "Le nom du produit est obligatoire.").max(300, "300 caractères au plus."),
  rangeId: id.optional().nullable().or(z.literal("")),
  ean: optionalText(20),
  cip13: optionalText(20),
  packaging: optionalText(200),
  proPrice: optionalText(20),
  publicPrice: optionalText(20),
  externalRef: optionalText(200),
  isActive: z.boolean().default(true),
});

function priceCents(value: string | null, field: string, fieldErrors: Record<string, string>): number | null {
  if (!value) return null;
  const cents = parseAmountToCents(value);
  if (cents === null || !/^\s*\d[\d\s]*([.,]\d{1,2})?\s*€?\s*$/.test(value)) {
    fieldErrors[field] = "Montant invalide (ex. 12,90).";
    return null;
  }
  return cents;
}

export async function savePartnerProductAction(payload: z.input<typeof productSchema>): Promise<ActionResult<{ id: string }>> {
  const session = await requirePlatformSession();
  const parsed = productSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez le produit.", zodFieldErrors(parsed.error.issues));
  const data = parsed.data;

  const fieldErrors: Record<string, string> = {};
  const ean = data.ean?.replace(/\s/g, "") || null;
  if (ean && !isValidEan13(ean)) fieldErrors.ean = "EAN invalide (13 chiffres, clé de contrôle).";
  const cip13 = data.cip13?.replace(/\s/g, "") || null;
  if (cip13 && !isValidCip13(cip13)) fieldErrors.cip13 = "CIP13 invalide (13 chiffres commençant par 34009).";
  const proPriceCents = priceCents(data.proPrice, "proPrice", fieldErrors);
  const publicPriceCents = priceCents(data.publicPrice, "publicPrice", fieldErrors);
  if (Object.keys(fieldErrors).length > 0) return fail("Vérifiez le produit.", fieldErrors);

  const result = await saveProduct(data.brandId, data.id ?? null, {
    name: data.name,
    rangeId: data.rangeId || null,
    ean,
    cip13,
    packaging: data.packaging,
    proPriceCents,
    publicPriceCents,
    externalRef: data.externalRef,
    isActive: data.isActive,
  });
  if (!result.ok) return fail(result.error, result.field ? { [result.field]: result.error } : undefined);

  await recordAudit({
    action: "partner.product_saved",
    entityType: "PartnerProduct",
    entityId: result.data.id,
    platformAdminId: session.admin.id,
    metadata: { brandId: data.brandId, created: result.data.created, isActive: data.isActive },
  });
  revalidatePartners(data.brandId);
  return ok({ id: result.data.id }, result.data.created ? `« ${result.data.name} » ajouté au catalogue.` : "Produit enregistré.");
}

const productActiveSchema = z.object({ brandId: id, id, isActive: z.boolean() });

export async function setPartnerProductActiveAction(payload: z.input<typeof productActiveSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = productActiveSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await setProductActive(parsed.data.brandId, parsed.data.id, parsed.data.isActive);
  if (!result.ok) return fail(result.error);

  await recordAudit({
    action: "partner.product_saved",
    entityType: "PartnerProduct",
    entityId: parsed.data.id,
    platformAdminId: session.admin.id,
    metadata: { brandId: parsed.data.brandId, isActive: parsed.data.isActive },
  });
  revalidatePartners(parsed.data.brandId);
  return ok(null, parsed.data.isActive ? `« ${result.data.name} » réactivé.` : `« ${result.data.name} » désactivé.`);
}

const productDeleteSchema = z.object({ brandId: id, id });

export async function deletePartnerProductAction(payload: z.input<typeof productDeleteSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = productDeleteSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await deleteProduct(parsed.data.brandId, parsed.data.id);
  if (!result.ok) return fail(result.error);

  await recordAudit({
    action: "partner.product_deleted",
    entityType: "PartnerProduct",
    entityId: parsed.data.id,
    platformAdminId: session.admin.id,
    metadata: { brandId: parsed.data.brandId },
  });
  revalidatePartners(parsed.data.brandId);
  return ok(null, `« ${result.data.name} » supprimé du catalogue.`);
}

const importSchema = z.object({ brandId: id, text: z.string().max(2_000_000, "Texte trop long : découpez l'import."), apply: z.boolean() });

/** Vérifie un catalogue collé (`apply: false`) ou en écrit les lignes valides (`apply: true`). */
export async function importPartnerCatalogAction(payload: z.input<typeof importSchema>): Promise<ActionResult<CatalogImportReport>> {
  const session = await requirePlatformSession();
  const parsed = importSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Demande invalide.");
  const result = await importCatalog(parsed.data.brandId, parsed.data.text, parsed.data.apply);
  if (!result.ok) return fail(result.error);

  const report = result.data;
  if (report.applied) {
    await recordAudit({
      action: "partner.product_saved",
      entityType: "PartnerBrand",
      entityId: parsed.data.brandId,
      platformAdminId: session.admin.id,
      metadata: { import: true, created: report.creates, updated: report.updates, rejected: report.errors.length },
    });
    revalidatePartners(parsed.data.brandId);
    return ok(report, `${report.creates} produit${report.creates > 1 ? "s" : ""} créé${report.creates > 1 ? "s" : ""}, ${report.updates} mis à jour.`);
  }
  return ok(report);
}

// ---------------------------------------------------------------------------
// Offres
// ---------------------------------------------------------------------------

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const offerSchema = z.object({
  id: id.optional().nullable(),
  partnerId: z.string().min(1, "Choisissez le partenaire.").max(64),
  brandId: z.string().min(1, "Choisissez la marque.").max(64),
  rangeId: id.optional().nullable().or(z.literal("")),
  title: z.string().trim().min(2, "Le titre est obligatoire.").max(200, "200 caractères au plus."),
  conditions: z.string().trim().min(2, "Décrivez les conditions.").max(4000, "4000 caractères au plus."),
  discountPercent: optionalText(10),
  minimumOrder: optionalText(20),
  validFrom: z.string().regex(DAY, "Date invalide.").optional().nullable().or(z.literal("")),
  validTo: z.string().regex(DAY, "Date invalide.").optional().nullable().or(z.literal("")),
});

export async function savePartnerOfferAction(payload: z.input<typeof offerSchema>): Promise<ActionResult<{ id: string }>> {
  const session = await requirePlatformSession();
  const parsed = offerSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez l'offre.", zodFieldErrors(parsed.error.issues));
  const data = parsed.data;

  const fieldErrors: Record<string, string> = {};
  let discountPercent: number | null = null;
  if (data.discountPercent) {
    const value = Number(data.discountPercent.replace(",", ".").replace(/[%\s]/g, ""));
    if (!Number.isFinite(value) || value < 0 || value > 100) fieldErrors.discountPercent = "Une remise entre 0 et 100 %.";
    else discountPercent = Math.round(value * 100) / 100;
  }
  const minimumOrderCents = priceCents(data.minimumOrder, "minimumOrder", fieldErrors);
  if (Object.keys(fieldErrors).length > 0) return fail("Vérifiez l'offre.", fieldErrors);

  const result = await saveOffer(data.id ?? null, {
    partnerId: data.partnerId,
    brandId: data.brandId,
    rangeId: data.rangeId || null,
    title: data.title,
    conditions: data.conditions,
    discountPercent,
    minimumOrderCents,
    validFrom: data.validFrom ? new Date(`${data.validFrom}T00:00:00.000Z`) : null,
    validTo: data.validTo ? new Date(`${data.validTo}T00:00:00.000Z`) : null,
  });
  if (!result.ok) return fail(result.error, result.field ? { [result.field]: result.error } : undefined);

  await recordAudit({
    action: "partner.offer_saved",
    entityType: "PartnerOffer",
    entityId: result.data.id,
    platformAdminId: session.admin.id,
    metadata: { created: result.data.created, partnerId: result.data.partnerId, brandId: data.brandId, rangeId: data.rangeId || null },
  });
  revalidatePartners(data.brandId);
  return ok({ id: result.data.id }, result.data.created ? "Offre créée en brouillon." : "Offre enregistrée.");
}

const offerStatusSchema = z.object({ id, status: publicationStatus });

export async function setPartnerOfferStatusAction(payload: z.input<typeof offerStatusSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = offerStatusSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await changeOfferStatus(parsed.data.id, parsed.data.status);
  if (!result.ok) return fail(result.error);

  await recordAudit({
    action: "partner.offer_saved",
    entityType: "PartnerOffer",
    entityId: parsed.data.id,
    platformAdminId: session.admin.id,
    metadata: { partnerId: result.data.partnerId, from: result.data.from, to: result.data.to },
  });
  revalidatePartners();
  return ok(null, `« ${result.data.title} » : statut mis à jour.`);
}
