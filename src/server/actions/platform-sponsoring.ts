"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { recordAudit } from "@/server/audit/log";
import { parseAmountToCents } from "@/lib/format";
import { CAMPAIGN_STATUSES, type CampaignStatus } from "@/core/sponsoring/campaign";
import {
  INFO_REQUEST_STATUSES,
  LAUNCH_REVIEW_STATUSES,
  saveCampaign,
  saveLaunch,
  setCampaignBilling,
  setInfoRequestStatus,
  setLaunchReview,
  transitionCampaign,
  validateCampaignRegulatory,
  validateLaunchRegulatory,
  type CampaignInput,
  type InfoRequestStatus,
  type LaunchInput,
  type LaunchReviewStatus,
} from "@/server/services/mobile/sponsoring-admin";
import { fail, ok, type ActionResult } from "./types";

/**
 * Console → Partenaires : nouveautés, campagnes sponsorisées, demandes d'information. Chaque geste exige une session
 * administrateur plateforme, revérifie les identifiants reçus et laisse une trace d'audit (identifiants seulement).
 */

const ROOT = "/admin/partenaires";
const ID = /^[a-z0-9]{8,40}$/i;

function refresh(id?: string) {
  revalidatePath(`${ROOT}/campagnes`);
  if (id) revalidatePath(`${ROOT}/campagnes/${id}`);
  revalidatePath(`${ROOT}/nouveautes`);
  revalidatePath(`${ROOT}/demandes`);
  revalidatePath("/m", "layout");
}

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const strOrNull = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

// ---------------------------------------------------------------------------
// Nouveautés
// ---------------------------------------------------------------------------

export async function saveLaunchAction(payload: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  const session = await requirePlatformSession();
  const id = strOrNull(payload.id);
  if (id && !ID.test(id)) return fail("Demande invalide.");
  const input: LaunchInput = {
    id,
    brandId: str(payload.brandId),
    title: str(payload.title),
    summary: strOrNull(payload.summary),
    body: str(payload.body),
    mediaUrl: strOrNull(payload.mediaUrl),
    posterUrl: strOrNull(payload.posterUrl),
    orientation: strOrNull(payload.orientation),
    productCodes: str(payload.productCodes),
    universe: strOrNull(payload.universe),
    regulatoryCategory: str(payload.regulatoryCategory),
    regulatoryMentions: strOrNull(payload.regulatoryMentions),
    endsAt: strOrNull(payload.endsAt),
  };
  const result = await saveLaunch(input, session.admin.id);
  if (!result.ok) return fail(result.error, result.fieldErrors);
  await recordAudit({ action: "partner.launch_saved", entityType: "PartnerLaunch", entityId: result.data.id, platformAdminId: session.admin.id, metadata: { created: result.data.created } });
  refresh();
  return ok({ id: result.data.id }, result.data.created ? "Nouveauté créée en brouillon." : "Nouveauté enregistrée : elle repasse en brouillon, à revalider.");
}

export async function validateLaunchAction(payload: { id: string; validator: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  if (!ID.test(str(payload?.id))) return fail("Demande invalide.");
  const result = await validateLaunchRegulatory(payload.id, str(payload.validator));
  if (!result.ok) return fail(result.error, result.fieldErrors);
  await recordAudit({ action: "partner.launch_status_changed", entityType: "PartnerLaunch", entityId: payload.id, platformAdminId: session.admin.id, metadata: { regulatoryValidated: true } });
  refresh();
  return ok(null, "Validation réglementaire enregistrée.");
}

export async function setLaunchReviewAction(payload: { id: string; status: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  if (!ID.test(str(payload?.id)) || !(LAUNCH_REVIEW_STATUSES as readonly string[]).includes(payload.status)) return fail("Demande invalide.");
  const result = await setLaunchReview(payload.id, payload.status as LaunchReviewStatus);
  if (!result.ok) return fail(result.error);
  await recordAudit({ action: "partner.launch_status_changed", entityType: "PartnerLaunch", entityId: payload.id, platformAdminId: session.admin.id, metadata: { status: payload.status } });
  refresh();
  return ok(null, payload.status === "APPROVED" ? "Nouveauté publiée." : "Statut mis à jour.");
}

// ---------------------------------------------------------------------------
// Campagnes
// ---------------------------------------------------------------------------

export async function saveCampaignAction(payload: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  const session = await requirePlatformSession();
  const id = strOrNull(payload.id);
  if (id && !ID.test(id)) return fail("Demande invalide.");
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);
  const input: CampaignInput = {
    id,
    partnerId: str(payload.partnerId),
    brandId: strOrNull(payload.brandId),
    launchId: strOrNull(payload.launchId),
    moduleId: strOrNull(payload.moduleId),
    name: str(payload.name),
    format: str(payload.format),
    placements: list(payload.placements),
    audiences: list(payload.audiences),
    startsAt: str(payload.startsAt),
    endsAt: str(payload.endsAt),
    regulatoryCategory: strOrNull(payload.regulatoryCategory),
  };
  const result = await saveCampaign(input, session.admin.id);
  if (!result.ok) return fail(result.error, result.fieldErrors);
  await recordAudit({ action: "sponsoring.campaign_saved", entityType: "SponsoredCampaign", entityId: result.data.id, platformAdminId: session.admin.id, metadata: { created: result.data.created } });
  refresh(result.data.id);
  return ok({ id: result.data.id }, result.data.created ? "Campagne créée en brouillon." : "Campagne enregistrée (brouillon, validation à refaire).");
}

export async function validateCampaignAction(payload: { id: string; validator: string; notes?: string; category?: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  if (!ID.test(str(payload?.id))) return fail("Demande invalide.");
  const result = await validateCampaignRegulatory(payload.id, { validator: str(payload.validator), notes: strOrNull(payload.notes), category: strOrNull(payload.category) });
  if (!result.ok) return fail(result.error, result.fieldErrors);
  await recordAudit({ action: "sponsoring.campaign_status_changed", entityType: "SponsoredCampaign", entityId: payload.id, platformAdminId: session.admin.id, metadata: { regulatoryValidated: true } });
  refresh(payload.id);
  return ok(null, "Validation réglementaire enregistrée.");
}

export async function transitionCampaignAction(payload: { id: string; to: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  if (!ID.test(str(payload?.id)) || !(CAMPAIGN_STATUSES as readonly string[]).includes(payload.to)) return fail("Demande invalide.");
  const result = await transitionCampaign(payload.id, payload.to as CampaignStatus);
  if (!result.ok) return fail(result.error);
  await recordAudit({ action: "sponsoring.campaign_status_changed", entityType: "SponsoredCampaign", entityId: payload.id, platformAdminId: session.admin.id, metadata: { to: payload.to } });
  refresh(payload.id);
  return ok(null, "Étape mise à jour.");
}

export async function setCampaignBillingAction(payload: Record<string, unknown>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const id = str(payload.id);
  if (!ID.test(id)) return fail("Demande invalide.");
  const amount = (value: unknown, field: string): { cents: number | null; error: string | null } => {
    const raw = str(value).trim();
    if (!raw) return { cents: null, error: null };
    const cents = parseAmountToCents(raw);
    return cents === null ? { cents: null, error: field } : { cents, error: null };
  };
  const budget = amount(payload.budget, "budgetCents");
  const billed = amount(payload.billed, "billedCents");
  const errors = [budget.error, billed.error].filter((e): e is string => !!e);
  if (errors.length) return fail("Montant invalide (ex. 1 200,00).", Object.fromEntries(errors.map((e) => [e, "Montant invalide."])));
  const result = await setCampaignBilling(id, {
    billingStatus: str(payload.billingStatus),
    priceNote: strOrNull(payload.priceNote),
    budgetCents: budget.cents,
    billedCents: billed.cents,
    billingReference: strOrNull(payload.billingReference),
    contractReference: strOrNull(payload.contractReference),
  });
  if (!result.ok) return fail(result.error, result.fieldErrors);
  await recordAudit({ action: "sponsoring.campaign_billing_updated", entityType: "SponsoredCampaign", entityId: id, platformAdminId: session.admin.id, metadata: { billingStatus: payload.billingStatus } });
  refresh(id);
  return ok(null, "Facturation enregistrée.");
}

// ---------------------------------------------------------------------------
// Demandes d'information
// ---------------------------------------------------------------------------

export async function setInfoRequestStatusAction(payload: { id: string; status: string }): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  if (!ID.test(str(payload?.id)) || !(INFO_REQUEST_STATUSES as readonly string[]).includes(payload.status)) return fail("Demande invalide.");
  const result = await setInfoRequestStatus(payload.id, payload.status as InfoRequestStatus, session.admin.id);
  if (!result.ok) return fail(result.error);
  await recordAudit({ action: "partner.info_request_status_changed", entityType: "PartnerInfoRequest", entityId: payload.id, platformAdminId: session.admin.id, metadata: { status: payload.status } });
  refresh();
  return ok(null, "Demande mise à jour.");
}
