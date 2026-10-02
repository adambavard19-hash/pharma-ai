"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { recordAudit } from "@/server/audit/log";
import { PREFERENCE_CHOICE_LABELS } from "@/core/partners/status";
import { setBrandPreference } from "@/server/services/partners/pharmacy-partners";
import { openPartnerLink, placeOrder, recordBrandView, requestContact, type OrderOutcome } from "@/server/services/partners/orders";
import { fail, ok, zodFieldErrors, type ActionResult } from "./types";

/**
 * PharmaBoost Partenaires, côté officine.
 *
 * Consulter : toute l'équipe (PARTNERS_VIEW). Masquer, refuser, contacter,
 * commander : le titulaire (PARTNERS_MANAGE). Chaque geste repart de la
 * session — l'officine n'est jamais lue dans la requête — et la marque, comme
 * chaque produit, est revérifiée côté serveur. Le journal d'audit ne garde
 * que des identifiants et des compteurs : jamais de patient, d'ordonnance ni
 * de conseil, et pas le texte libre saisi par l'officine.
 */

const CATALOG = "/partenaires";

const source = z.enum(["COUNTER_CARD", "CATALOG", "BRAND_PAGE"]).default("BRAND_PAGE");
const universe = z.string().trim().max(60).nullable().optional();
const id = z.string().trim().min(1).max(64);

function revalidateBrand(slug: string) {
  revalidatePath(CATALOG);
  revalidatePath(`${CATALOG}/${slug}`);
}

// ---------------------------------------------------------------------------
// Masquer, refuser, rétablir
// ---------------------------------------------------------------------------

const preferenceSchema = z.object({
  brandId: id,
  choice: z.enum(["HIDDEN", "REFUSED"]).nullable(),
  reason: z.string().trim().max(300, "300 caractères au plus.").nullable().optional(),
});

export async function setPartnerPreferenceAction(payload: z.input<typeof preferenceSchema>): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.PARTNERS_MANAGE);
  const parsed = preferenceSchema.safeParse(payload);
  if (!parsed.success) return fail("Choix invalide.", zodFieldErrors(parsed.error.issues));
  const { brandId, choice, reason } = parsed.data;

  const result = await setBrandPreference(session.scope, brandId, choice, reason ?? null);
  if (!result.ok) return fail(result.error);

  await recordAudit({
    action: "partner.preference_updated",
    entityType: "PartnerBrand",
    entityId: result.brand.id,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { previous: result.previous, choice: result.choice, withReason: Boolean(reason) },
  });

  revalidateBrand(result.brand.slug);
  const message =
    choice === null
      ? `${result.brand.name} est de nouveau proposée${result.previous === "HIDDEN" ? " au comptoir" : ""}.`
      : choice === "HIDDEN"
        ? `${result.brand.name} : ${PREFERENCE_CHOICE_LABELS.HIDDEN.toLowerCase()}. Elle reste consultable ici.`
        : `${result.brand.name} : refusée. Elle n'apparaît plus nulle part ; vous pouvez revenir sur ce choix.`;
  return ok(null, message);
}

// ---------------------------------------------------------------------------
// Consultation (attribution VIEW)
// ---------------------------------------------------------------------------

const viewSchema = z.object({ brandId: id, source: z.enum(["COUNTER_CARD", "CATALOG"]), universe });

/** Appelée une fois à l'arrivée sur la page d'une marque depuis le comptoir ou le catalogue. */
export async function recordPartnerViewAction(payload: z.input<typeof viewSchema>): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.PARTNERS_VIEW);
  const parsed = viewSchema.safeParse(payload);
  if (!parsed.success) return fail("Consultation invalide.");
  const result = await recordBrandView(session.scope, parsed.data.brandId, { source: parsed.data.source, universe: parsed.data.universe ?? null });
  if (!result.ok) return fail(result.error);
  return ok(null);
}

// ---------------------------------------------------------------------------
// Demande de contact
// ---------------------------------------------------------------------------

const contactSchema = z.object({
  brandId: id,
  source,
  universe,
  contactName: z.string().trim().min(1, "Indiquez qui rappeler.").max(120, "120 caractères au plus."),
  contactEmail: z
    .string()
    .trim()
    .max(160)
    .transform((value) => value || null)
    .pipe(z.email("Adresse e-mail invalide.").nullable()),
  contactPhone: z
    .string()
    .trim()
    .max(30, "30 caractères au plus.")
    .transform((value) => value || null),
  message: z
    .string()
    .trim()
    .max(1000, "1 000 caractères au plus.")
    .transform((value) => value || null),
});

export async function requestPartnerContactAction(payload: z.input<typeof contactSchema>): Promise<ActionResult<{ code: string; transmitted: boolean }>> {
  const session = await requirePermission(PERMISSIONS.PARTNERS_MANAGE);
  const parsed = contactSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez la demande.", zodFieldErrors(parsed.error.issues));
  const input = parsed.data;
  if (!input.contactEmail && !input.contactPhone) {
    return fail("Indiquez au moins un e-mail ou un téléphone pour être recontacté.", { contactEmail: "Un e-mail ou un téléphone." });
  }

  const result = await requestContact(session.scope, {
    brandId: input.brandId,
    source: input.source,
    universe: input.universe ?? null,
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone,
    message: input.message,
  });
  if (!result.ok) return fail(result.error);

  await recordAudit({
    action: "partner.lead_created",
    entityType: "PartnerLead",
    entityId: result.data.leadId,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { kind: "CONTACT_REQUEST", brandId: result.data.brand.id, code: result.data.code, source: input.source, transmitted: result.data.transmitted },
  });

  revalidatePath(`${CATALOG}/${result.data.brand.slug}`);
  return ok(
    { code: result.data.code, transmitted: result.data.transmitted },
    result.data.transmitted ? `Demande envoyée à ${result.data.partnerName}.` : `Demande enregistrée : l'équipe PharmaBoost la transmet à ${result.data.partnerName}.`,
  );
}

// ---------------------------------------------------------------------------
// Portail B2B, formulaire
// ---------------------------------------------------------------------------

const linkSchema = z.object({ brandId: id, source, universe });

export async function openPartnerLinkAction(payload: z.input<typeof linkSchema>): Promise<ActionResult<{ url: string; code: string; kind: "B2B_LINK_OPENED" | "FORM_OPENED" }>> {
  const session = await requirePermission(PERMISSIONS.PARTNERS_MANAGE);
  const parsed = linkSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");

  const result = await openPartnerLink(session.scope, { brandId: parsed.data.brandId, source: parsed.data.source, universe: parsed.data.universe ?? null });
  if (!result.ok) return fail(result.error);

  await recordAudit({
    action: "partner.lead_created",
    entityType: "PartnerLead",
    entityId: result.data.leadId,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { kind: result.data.kind, brandId: result.data.brand.id, code: result.data.code, source: parsed.data.source },
  });

  revalidatePath(`${CATALOG}/${result.data.brand.slug}`);
  return ok({ url: result.data.url, code: result.data.code, kind: result.data.kind });
}

// ---------------------------------------------------------------------------
// Commande
// ---------------------------------------------------------------------------

const orderSchema = z.object({
  brandId: id,
  source,
  universe,
  lines: z
    .array(
      z.object({
        productId: id,
        quantity: z.coerce.number({ error: "Une quantité entière." }).int("Une quantité entière.").min(0, "Pas de quantité négative.").max(9999, "9 999 au plus."),
      }),
    )
    .min(1, "Indiquez au moins une quantité.")
    .max(300, "300 produits au plus par commande."),
  note: z
    .string()
    .trim()
    .max(1000, "1 000 caractères au plus.")
    .transform((value) => value || null),
});

export async function placePartnerOrderAction(
  payload: z.input<typeof orderSchema>,
): Promise<ActionResult<Pick<OrderOutcome, "code" | "status" | "totalCents" | "lineCount" | "mode">>> {
  const session = await requirePermission(PERMISSIONS.PARTNERS_MANAGE);
  const parsed = orderSchema.safeParse(payload);
  if (!parsed.success) return fail("Vérifiez la commande.", zodFieldErrors(parsed.error.issues));
  const input = parsed.data;

  const result = await placeOrder(session.scope, {
    brandId: input.brandId,
    source: input.source,
    universe: input.universe ?? null,
    lines: input.lines,
    note: input.note,
  });
  if (!result.ok) return fail(result.error);
  const order = result.data;

  await recordAudit({
    action: "partner.order_created",
    entityType: "PartnerOrder",
    entityId: order.orderId,
    pharmacyId: session.scope.pharmacyId,
    userId: session.scope.userId,
    metadata: { brandId: order.brand.id, code: order.code, mode: order.mode, status: order.status, lines: order.lineCount, totalCents: order.totalCents, source: input.source },
  });

  revalidatePath(`${CATALOG}/${order.brand.slug}`);
  const message =
    order.status === "TRANSMITTED" || order.status === "CONFIRMED"
      ? `Commande transmise à ${order.partnerName}.`
      : order.status === "FAILED"
        ? "Commande enregistrée, mais l'envoi au partenaire n'a pas abouti : l'équipe PharmaBoost est prévenue."
        : `Commande enregistrée : l'équipe PharmaBoost la transmet à ${order.partnerName}.`;
  return ok({ code: order.code, status: order.status, totalCents: order.totalCents, lineCount: order.lineCount, mode: order.mode }, message);
}
