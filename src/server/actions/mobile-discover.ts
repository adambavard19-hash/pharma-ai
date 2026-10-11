"use server";

import { revalidatePath } from "next/cache";
import { getUserSession } from "@/server/auth/user-session";
import { recordAudit } from "@/server/audit/log";
import { throttled } from "@/server/security/throttle";
import { discoverViewerFor, favoriteTargetVisible, setFavorite } from "@/server/services/mobile/discover";
import { createInfoRequest } from "@/server/services/mobile/discover-info-request";
import { recordInfoRequestForCampaign, recordSponsoredEvents } from "@/server/services/mobile/sponsoring";
import { isFavoriteType } from "@/core/discover/content";
import { isPlacement } from "@/core/sponsoring/campaign";
import { sanitizeEvents } from "@/core/sponsoring/stats";
import { PROFESSION_LABELS } from "@/core/mobile/profile";
import { DEMO_REFUSAL } from "./demo-guard";
import { fail, ok, type ActionResult } from "./types";

/**
 * Découvertes (PharmaBoost Mobile) : favoris, demande d'information à une marque, compteurs des emplacements
 * sponsorisés. Chaque action relit la session : la personne n'agit que pour ELLE-MÊME, et son public (officine,
 * préférences) vient de la session, jamais d'un paramètre.
 */

const ID = /^[a-z0-9]{8,40}$/i;

export async function toggleFavoriteAction(payload: { type: string; id: string; on: boolean }): Promise<ActionResult<{ on: boolean }>> {
  const session = await getUserSession();
  if (!session) return fail("Votre session a expiré : reconnectez-vous.");
  if (!isFavoriteType(payload?.type) || typeof payload.id !== "string" || !ID.test(payload.id)) return fail("Demande invalide.");
  if (throttled(`fav:${session.user.id}`, 60, 60_000)) return fail("Doucement : réessayez dans un instant.");
  const on = payload.on === true;
  if (on) {
    const viewer = await discoverViewerFor(session);
    if (!(await favoriteTargetVisible(viewer, session.scope, payload.type, payload.id))) return fail("Ce contenu n'est plus disponible.");
  }
  await setFavorite(session.user.id, payload.type, payload.id, on);
  revalidatePath("/m/decouvertes", "layout");
  return ok({ on }, on ? "Ajouté à vos favoris." : "Retiré de vos favoris.");
}

export async function requestInfoAction(payload: {
  brandId: string;
  launchId?: string | null;
  message?: string | null;
  includePharmacy?: boolean;
  consent?: boolean;
  consentText?: string;
  campaignId?: string | null;
  placement?: string | null;
}): Promise<ActionResult<{ transmitted: boolean }>> {
  const session = await getUserSession();
  if (!session) return fail("Votre session a expiré : reconnectez-vous.");
  if (session.scope?.isDemo) return fail(DEMO_REFUSAL);
  if (typeof payload?.brandId !== "string" || !ID.test(payload.brandId)) return fail("Demande invalide.");
  if (payload.launchId && !ID.test(payload.launchId)) return fail("Demande invalide.");
  if (throttled(`info:${session.user.id}`, 4, 60_000)) return fail("Plusieurs demandes en une minute : patientez un instant.");

  const viewer = await discoverViewerFor(session);
  const result = await createInfoRequest(
    viewer,
    {
      userId: session.user.id,
      fullName: session.user.fullName,
      email: session.user.email,
      professionLabel: session.user.profession ? PROFESSION_LABELS[session.user.profession] : null,
      activePharmacy: session.activePharmacy ? { id: session.activePharmacy.id, name: session.activePharmacy.name } : null,
      declaredPharmacyName: session.user.declaredPharmacyName,
    },
    {
      brandId: payload.brandId,
      launchId: payload.launchId ?? null,
      message: typeof payload.message === "string" ? payload.message.slice(0, 2000) : null,
      includePharmacy: payload.includePharmacy === true,
      consent: payload.consent === true,
      consentTextShown: typeof payload.consentText === "string" ? payload.consentText : "",
    },
  );
  if (!result.ok) return fail(result.error, result.field ? { [result.field]: result.error } : undefined);

  if (payload.campaignId && ID.test(payload.campaignId) && isPlacement(payload.placement)) {
    await recordInfoRequestForCampaign(payload.campaignId, payload.placement, session.sessionId);
  }
  await recordAudit({
    action: "partner.info_request",
    entityType: "PartnerInfoRequest",
    entityId: result.requestId,
    userId: session.user.id,
    pharmacyId: session.activePharmacy?.id ?? null,
    metadata: { brandId: payload.brandId, transmitted: result.transmitted },
  });
  return ok(
    { transmitted: result.transmitted },
    result.transmitted ? `Demande envoyée à ${result.brandName}.` : `Demande enregistrée : l'équipe PharmaBoost la transmet à ${result.brandName}.`,
  );
}

/**
 * Les compteurs des emplacements sponsorisés (impressions, clics, vues de détail), envoyés par lots. Rien n'identifie
 * la personne dans ce qui est écrit ; une session ne compte qu'une fois par jour, par campagne et emplacement.
 */
export async function trackSponsoredEventsAction(events: unknown): Promise<{ counted: number }> {
  const session = await getUserSession();
  if (!session) return { counted: 0 };
  if (throttled(`spons:${session.sessionId}`, 30, 60_000)) return { counted: 0 };
  const clean = sanitizeEvents(events);
  if (clean.length === 0) return { counted: 0 };
  const counted = await recordSponsoredEvents(clean, session.sessionId).catch(() => 0);
  return { counted };
}
