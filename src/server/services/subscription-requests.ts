import "server-only";
import { prisma } from "@/server/db/client";
import { withAdvisoryLock } from "@/server/db/advisory-lock";
import { getMessagingProvider } from "@/server/ai/registry";
import { recordAudit } from "@/server/audit/log";
import { recordProspectEvent } from "@/server/services/sales/events";
import { notifyAdmins, notifySalesRep } from "@/server/services/sales/notifications";
import { platformEmailContext } from "@/server/services/email-context";
import { traceDispatch } from "@/server/services/email-dispatch";
import { resolveReferralCode } from "@/server/services/referral";
import { loadPublicPricing } from "@/server/services/public-pricing";
import { proposeReferee, reconcileNewProspect } from "@/server/services/referral-leads";
import { formatPriceEuros } from "@/core/pricing/official-offer";
import { buildSubscriptionReceivedEmail } from "@/core/platform/contract-emails";
import { verifyPayload } from "@/server/security/tokens";
import { nameKey } from "@/core/contracts/identity";
import { normalizeSubscriptionRequest, type NormalizedRequest, type SubscriptionRequestInput } from "@/core/contracts/subscription-request";

export { normalizeSubscriptionRequest, type SubscriptionRequestInput };

/**
 * Souscription depuis le site, formulaire public : rien de ce qu'il reçoit
 * n'est cru sur parole.
 *  - Un dossier existant (même SIRET, ou officine déjà cliente) n'est JAMAIS
 *    modifié depuis le site : la demande lui est rattachée et l'équipe est
 *    prévenue ; aucun contrat ne part. Le SIRET est public, il ne prouve rien.
 *  - Le CONTRAT ne part jamais tout seul pour une demande du site : l'abonnement
 *    unique (126 € HT par mois, engagement de 12 mois) s'accompagne d'une mise en
 *    service de 290 € HT qui n'existe pas dans le contrat automatique. L'équipe
 *    fixe les conditions puis « Envoyer le contrat » depuis la console.
 *  - Le prix figé au dossier est celui que le visiteur a VU (offre de la console
 *    ou offre officielle), pas celui d'un tarif plus ancien.
 *  - Le confrère que l'officine propose de parrainer est enregistré pour un NOUVEAU
 *    dossier seulement ; rien n'est envoyé à cette personne, l'équipe la contacte.
 *  - La réponse au visiteur est la même que l'officine soit connue ou non.
 */
export type SubscriptionRequestOutcome = { status: "RECEIVED"; prospectId: string | null; reason: string };

const IN_PROGRESS = ["SENT", "OPENED", "SIGNED_PHARMACY", "SIGNED_COMPANY"];
const GENERIC_NEXT_STEP = "Notre équipe vérifie votre demande et revient vers vous très rapidement, par e-mail ou par téléphone.";

export async function requestSubscription(input: SubscriptionRequestInput): Promise<{ ok: true; outcome: SubscriptionRequestOutcome } | { ok: false; errors: Record<string, string> }> {
  const normalized = normalizeSubscriptionRequest(input);
  if (!normalized.ok) return normalized;
  const v = normalized.value;
  // Un même SIRET n'est traité qu'une fois à la fois : deux envois du formulaire ne créent pas deux dossiers.
  const outcome = await withAdvisoryLock(`subscription:${v.siret}`, () => handleRequest(v, input));
  return { ok: true, outcome };
}

async function handleRequest(v: NormalizedRequest, input: SubscriptionRequestInput): Promise<SubscriptionRequestOutcome> {
  const system = { type: "SYSTEM" as const, label: "Site PharmaBoost" };
  const submitted = `${v.ownerName} (${v.ownerTitle}) · ${v.email}${v.phone ? ` · ${v.phone}` : ""} · ${v.addressLine1}, ${v.postalCode} ${v.city}`;
  // L'offre cochée par le visiteur, et elle seule : si elle n'est plus proposée, rien ne part.
  const plan = input.planId
    ? await prisma.plan.findFirst({ where: { id: input.planId, isActive: true } })
    : await prisma.plan.findFirst({ where: { isActive: true, isDefault: true }, orderBy: { createdAt: "asc" } });
  const referrer = await resolveReferralCode(input.referralCode);
  const now = new Date();
  // L'abonnement vu par le visiteur et ses montants : l'offre de la console ou, à défaut, l'offre officielle.
  const pricing = await loadPublicPricing();
  const terms = `${formatPriceEuros(pricing.monthlyPriceCents)} HT / mois, engagement ${pricing.commitmentMonths} mois, mise en service ${formatPriceEuros(pricing.setupFeeCents)} HT`;

  // 1. Officine déjà cliente, ou dossier déjà ouvert pour ce SIRET : on rattache, on ne touche à rien.
  const [pharmacyBySiret, prospectsBySiret] = await Promise.all([
    prisma.pharmacy.findFirst({ where: { siret: v.siret }, select: { id: true, name: true, prospect: { select: { id: true } } } }),
    prisma.prospect.findMany({ where: { siret: v.siret }, select: { id: true, name: true, salesRepId: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const existingIds = [...new Set([pharmacyBySiret?.prospect?.id, ...prospectsBySiret.map((p) => p.id)].filter((id): id is string => Boolean(id)))];
  if (pharmacyBySiret || existingIds.length) {
    // Le confrère indiqué n'est pas enregistré pour un dossier existant : on le dit, sans en recopier les coordonnées.
    const { referee, ...submittedFields } = v;
    const refereeNote = referee ? " Un confrère à parrainer était indiqué : il n'a pas été enregistré, à demander au titulaire." : "";
    for (const id of existingIds) {
      await recordProspectEvent({ prospectId: id, type: "SUBSCRIPTION_REQUESTED", summary: `Demande d'abonnement reçue depuis le site pour ce SIRET, à vérifier (rien n'a été modifié, aucun contrat envoyé) : ${submitted}.${refereeNote}`, actor: system, metadata: { siret: v.siret, submitted: submittedFields } });
    }
    const link = existingIds[0] ? `/admin/dossiers/${existingIds[0]}` : `/admin/pharmacies/${pharmacyBySiret!.id}`;
    await notifyAdmins({ type: "SITE_SUBSCRIPTION_TO_MATCH", title: `Demande d'abonnement à rapprocher — ${v.name}`, body: `SIRET ${v.siret} déjà connu${pharmacyBySiret ? ` (officine « ${pharmacyBySiret.name} »)` : ""}. Le dossier n'a pas été modifié et aucun contrat n'est parti : vérifiez l'identité du demandeur avant d'agir. Saisie : ${submitted}.${refereeNote}`, linkUrl: link, severity: "WARNING" });
    for (const p of prospectsBySiret) {
      if (p.salesRepId) await notifySalesRep({ salesRepId: p.salesRepId, type: "SITE_SUBSCRIPTION_TO_MATCH", title: `${p.name} : demande d'abonnement reçue du site`, body: "À vérifier avec le titulaire avant d'envoyer le contrat.", linkUrl: `/extranet/dossiers/${p.id}`, severity: "INFO" });
    }
    await acknowledge(v, GENERIC_NEXT_STEP, { prospectId: existingIds[0] ?? null, pharmacyId: pharmacyBySiret?.id ?? null });
    return { status: "RECEIVED", prospectId: existingIds[0] ?? null, reason: "SIRET déjà connu" };
  }

  // 2. Nouveau dossier. Un rapprochement incertain (même e-mail, ou même nom et code postal) est signalé.
  const candidates = await prisma.prospect.findMany({
    where: { OR: [{ email: { equals: v.email, mode: "insensitive" } }, { postalCode: v.postalCode }] },
    select: { id: true, name: true, email: true, siret: true, postalCode: true, contracts: { orderBy: { version: "desc" }, take: 1, select: { status: true } } },
    take: 200,
  });
  const key = nameKey(v.name);
  const suspects = candidates.filter((c) => (c.email && c.email.toLowerCase() === v.email) || (key && nameKey(c.name) === key && c.postalCode === v.postalCode));
  const warning = suspects.length ? `Doublon possible : ${suspects.map((s) => `« ${s.name} »${s.siret ? ` (SIRET ${s.siret})` : ""}`).join(", ")} — même e-mail ou même nom et code postal.` : null;
  const created = await prisma.prospect.create({
    data: {
      name: v.name,
      legalName: v.legalName,
      siret: v.siret,
      finessNumber: v.finessNumber,
      addressLine1: v.addressLine1,
      postalCode: v.postalCode,
      city: v.city,
      phone: v.phone,
      ownerName: v.ownerName,
      ownerTitle: v.ownerTitle,
      email: v.email,
      outletCount: v.outletCount,
      origin: "SELF_SERVICE_SITE",
      subscriptionRequestedAt: now,
      planId: plan?.id ?? null,
      // Le prix vu par le visiteur est figé au dossier : le contrat reprendra celui-là, pas un tarif plus ancien.
      monthlyPriceCents: pricing.monthlyPriceCents,
      status: "INTERESTED",
      lastContactAt: now,
      duplicateWarning: warning,
      referralCode: referrer ? input.referralCode!.trim().toUpperCase() : null,
    },
    select: { id: true },
  });
  const prospectId = created.id;
  await recordProspectEvent({ prospectId, type: "SUBSCRIPTION_REQUESTED", summary: `Demande d'abonnement reçue depuis le site (${v.ownerName}, ${v.ownerTitle})${plan ? ` — offre ${plan.name}` : ""} — abonnement à ${terms}.`, actor: system, metadata: { siret: v.siret, planId: plan?.id ?? null, referral: referrer?.name ?? null, monthlyPriceCents: pricing.monthlyPriceCents, setupFeeCents: pricing.setupFeeCents, commitmentMonths: pricing.commitmentMonths } });
  await recordProspectEvent({ prospectId, type: "CREATED", summary: `Dossier créé pour ${v.name}.`, actor: system });
  await recordAudit({ action: "sales.subscription_requested", entityType: "Prospect", entityId: prospectId, metadata: { siret: v.siret, planId: plan?.id ?? null } });
  await notifyAdmins({ type: "SITE_SUBSCRIPTION", title: `Nouvelle demande d'abonnement — ${v.name}`, body: `${submitted}. Abonnement à ${terms}. Le contrat ne part pas tout seul : fixez les conditions puis « Envoyer le contrat ».`, linkUrl: `/admin/dossiers/${prospectId}`, severity: "SUCCESS" });

  // Parrainage : ce dossier rejoint le confrère qu'une autre officine avait proposé (même e-mail), et son propre confrère est enregistré.
  // Aucun e-mail, aucun SMS n'est envoyé à la personne parrainée : l'équipe la contacte.
  await reconcileNewProspect({ id: prospectId, email: v.email, name: v.name }, system);
  if (v.referee) await registerReferee(prospectId, v.name, v.referee);

  if (warning) {
    await recordProspectEvent({ prospectId, type: "DUPLICATE_SUSPECTED", summary: warning, actor: system, metadata: { suspects: suspects.map((s) => s.id) } });
    await notifyAdmins({ type: "DUPLICATE_SUSPECTED", title: `Doublon possible — ${v.name}`, body: warning, linkUrl: `/admin/dossiers/${prospectId}`, severity: "WARNING" });
  }

  if (input.planId && !plan) {
    await notifyAdmins({ type: "DOSSIER_BLOCKED", title: `Contrat retenu — ${v.name}`, body: "L'offre choisie sur le site n'est plus proposée : choisissez les conditions puis « Envoyer le contrat ».", linkUrl: `/admin/dossiers/${prospectId}`, severity: "WARNING" });
    await acknowledge(v, GENERIC_NEXT_STEP, { prospectId });
    return { status: "RECEIVED", prospectId, reason: "offre indisponible" };
  }
  // Le contrat ne part JAMAIS tout seul pour une demande du site : la mise en service n'existe pas dans le contrat automatique,
  // l'équipe fixe les conditions. Jamais un contrat qui tairait un frais annoncé sur le site.
  const closeContract = suspects.some((s) => s.contracts[0] && (s.contracts[0].status === "FINALIZED" || IN_PROGRESS.includes(s.contracts[0].status)));
  await notifyAdmins({
    type: "DOSSIER_BLOCKED",
    title: `Contrat retenu — ${v.name}`,
    body: `Abonnement unique, engagement de ${pricing.commitmentMonths} mois : la mise en service de ${formatPriceEuros(pricing.setupFeeCents)} HT n'est pas prévue au contrat automatique. Fixez les conditions puis « Envoyer le contrat ».${closeContract ? " Un dossier proche a déjà un contrat en cours ou signé : vérifiez avant d'envoyer." : ""}`,
    linkUrl: `/admin/dossiers/${prospectId}`,
    severity: "WARNING",
  });
  await acknowledge(v, GENERIC_NEXT_STEP, { prospectId });
  return { status: "RECEIVED", prospectId, reason: "mise en service à faire figurer au contrat" };
}

/** Le confrère à parrainer. Un échec ne perd pas la saisie : l'équipe est prévenue avec les coordonnées, à enregistrer à la main. */
async function registerReferee(prospectId: string, pharmacyName: string, referee: NonNullable<NormalizedRequest["referee"]>): Promise<void> {
  try {
    await proposeReferee({ referrerProspectId: prospectId, referrerName: pharmacyName, referee });
  } catch (error) {
    console.error("[site] confrère à parrainer non enregistré", error);
    try {
      await notifyAdmins({
        type: "REFERRAL_LEAD",
        title: `Confrère à enregistrer à la main — ${pharmacyName}`,
        body: `Le confrère indiqué n'a pas pu être enregistré : ${[referee.name, referee.email, referee.phone].filter(Boolean).join(" · ")}. Rien ne lui a été envoyé.`,
        linkUrl: `/admin/dossiers/${prospectId}`,
        severity: "WARNING",
      });
    } catch (noticeError) {
      console.error("[site] alerte « confrère à enregistrer » impossible", noticeError);
    }
  }
}

export type ConfirmationResult = { ok: false; error: string };

/**
 * Le lien de confirmation d'adresse d'AVANT l'abonnement unique, encore valable
 * 48 heures chez ceux qui l'ont reçu. Il ne fait plus partir le contrat : le contrat
 * ne part jamais tout seul pour une demande du site (la mise en service n'existe
 * pas dans le contrat automatique). L'adresse confirmée est notée sur le dossier et
 * l'équipe est prévenue ; le titulaire reçoit son contrat des mains de l'équipe.
 * Le lien ne vaut que pour le dossier et l'adresse qu'il désigne.
 */
export async function confirmSubscription(token: string): Promise<ConfirmationResult> {
  const payload = verifyPayload<{ p: string; e: string }>(token);
  if (!payload) return { ok: false, error: "Ce lien de confirmation n'est pas valide ou a expiré. Refaites votre demande depuis le site, ou écrivez-nous." };
  const prospect = await prisma.prospect.findUnique({ where: { id: payload.p }, select: { id: true, name: true, email: true, origin: true, blockedAt: true } });
  if (!prospect || prospect.origin !== "SELF_SERVICE_SITE" || prospect.email?.toLowerCase() !== payload.e.toLowerCase()) return { ok: false, error: "Ce lien ne correspond plus à une demande en cours. Notre équipe reste à votre disposition." };
  if (prospect.blockedAt) return { ok: false, error: "Votre demande est en cours de vérification par notre équipe : elle revient vers vous très rapidement." };
  await recordProspectEvent({ prospectId: prospect.id, type: "NOTE", summary: `Adresse e-mail confirmée par le titulaire (${payload.e}). Le contrat ne part pas tout seul.`, actor: { type: "SIGNER", label: "Titulaire (site)" } });
  await notifyAdmins({ type: "DOSSIER_BLOCKED", title: `Contrat à envoyer — ${prospect.name}`, body: "Le titulaire a confirmé son adresse e-mail. Le contrat ne part pas tout seul (la mise en service n'est pas prévue au contrat automatique) : fixez les conditions puis « Envoyer le contrat ».", linkUrl: `/admin/dossiers/${prospect.id}`, severity: "WARNING" });
  return { ok: false, error: "Votre adresse est confirmée. Votre contrat est en cours de préparation : vous le recevez par e-mail très prochainement." };
}

/** L'accusé de réception au demandeur, tracé dans l'historique des communications (dossier et officine quand ils sont connus). */
async function acknowledge(v: NormalizedRequest, nextStep: string, links: { prospectId: string | null; pharmacyId?: string | null }): Promise<void> {
  const ctx = await platformEmailContext();
  const email = buildSubscriptionReceivedEmail(ctx, { ownerName: v.ownerName, pharmacyName: v.name, nextStep });
  const outcome = await getMessagingProvider().sendEmail({ to: v.email, fromName: "PharmaBoost", subject: email.subject, text: email.text, html: email.html });
  await traceDispatch({ kind: "SUBSCRIPTION_RECEIVED", recipient: v.email, outcome, subject: email.subject, trigger: "SYSTEM", prospectId: links.prospectId, pharmacyId: links.pharmacyId ?? null });
}
