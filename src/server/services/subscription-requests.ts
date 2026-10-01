import "server-only";
import { prisma } from "@/server/db/client";
import { withAdvisoryLock } from "@/server/db/advisory-lock";
import { getMessagingProvider } from "@/server/ai/registry";
import { recordAudit } from "@/server/audit/log";
import { recordProspectEvent } from "@/server/services/sales/events";
import { notifyAdmins, notifySalesRep } from "@/server/services/sales/notifications";
import { startContracting } from "@/server/services/sales/contracts";
import { platformEmailContext } from "@/server/services/email-context";
import { resolveReferralCode } from "@/server/services/referral";
import { buildSubscriptionReceivedEmail } from "@/core/platform/contract-emails";
import { nameKey } from "@/core/contracts/identity";
import { normalizeSubscriptionRequest, type NormalizedRequest, type SubscriptionRequestInput } from "@/core/contracts/subscription-request";

export { normalizeSubscriptionRequest, type SubscriptionRequestInput };

/**
 * Souscription depuis le site : l'officine donne ses informations une fois,
 * confirme explicitement sa demande, et le même moteur que la console et
 * l'extranet génère puis envoie le contrat. Le SIRET identifie l'officine :
 * un dossier existant est repris, jamais doublé ; un rapprochement incertain
 * est signalé à l'administrateur, jamais fusionné en silence.
 */
export type SubscriptionRequestOutcome =
  | { status: "CONTRACT_SENT"; prospectId: string; email: string }
  | { status: "ALREADY_IN_PROGRESS"; prospectId: string; email: string }
  | { status: "ALREADY_CLIENT"; prospectId: string | null }
  | { status: "RECEIVED"; prospectId: string; reason: string };

const IN_PROGRESS = ["SENT", "OPENED", "SIGNED_PHARMACY", "SIGNED_COMPANY"];

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
  const plan = input.planId
    ? await prisma.plan.findFirst({ where: { id: input.planId, isActive: true } })
    : await prisma.plan.findFirst({ where: { isActive: true, isDefault: true }, orderBy: { createdAt: "asc" } });
  const referrer = await resolveReferralCode(input.referralCode);
  const now = new Date();

  // 1. Le SIRET fait foi : une officine déjà cliente, ou un dossier déjà ouvert.
  const [pharmacyBySiret, prospectsBySiret] = await Promise.all([
    prisma.pharmacy.findFirst({ where: { siret: v.siret }, select: { id: true, name: true, isActive: true, prospect: { select: { id: true } } } }),
    prisma.prospect.findMany({ where: { siret: v.siret }, include: { contracts: { orderBy: { version: "desc" }, take: 1, select: { status: true } }, salesRep: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: "asc" } }),
  ]);

  if (pharmacyBySiret?.isActive) {
    await notifyAdmins({ type: "SITE_SUBSCRIPTION_EXISTING_CLIENT", title: `Demande d'abonnement d'un client existant — ${v.name}`, body: `SIRET ${v.siret} déjà rattaché à l'officine « ${pharmacyBySiret.name} ». Aucun contrat envoyé. Contact : ${v.ownerName} · ${v.email}`, linkUrl: pharmacyBySiret.prospect ? `/admin/dossiers/${pharmacyBySiret.prospect.id}` : `/admin/pharmacies/${pharmacyBySiret.id}`, severity: "WARNING" });
    await acknowledge(v, "Votre officine est déjà cliente de PharmaBoost : notre équipe revient vers vous rapidement pour répondre à votre demande.");
    return { status: "ALREADY_CLIENT", prospectId: pharmacyBySiret.prospect?.id ?? null };
  }

  if (prospectsBySiret.length > 1) {
    // Plusieurs dossiers pour un même SIRET : on ne choisit pas à la place de l'administrateur.
    const ids = prospectsBySiret.map((p) => p.id);
    await notifyAdmins({ type: "DUPLICATE_SUSPECTED", title: `Demande d'abonnement à rapprocher — ${v.name}`, body: `${prospectsBySiret.length} dossiers portent déjà le SIRET ${v.siret}. Aucun contrat envoyé tant que le bon dossier n'est pas désigné.`, linkUrl: `/admin/dossiers/${ids[0]}`, severity: "WARNING" });
    for (const id of ids) await recordProspectEvent({ prospectId: id, type: "DUPLICATE_SUSPECTED", summary: `Demande d'abonnement reçue du site pour ce SIRET (${v.ownerName}, ${v.email}) : plusieurs dossiers correspondent, rapprochement manuel requis.`, actor: system });
    await acknowledge(v, "Notre équipe vérifie votre dossier et vous adresse votre contrat très rapidement.");
    return { status: "RECEIVED", prospectId: ids[0], reason: "plusieurs dossiers pour ce SIRET" };
  }

  let prospectId: string;
  const existing = prospectsBySiret[0];
  if (existing) {
    // 2. Dossier retrouvé par SIRET (créé par un commercial, la console ou une précédente demande).
    const last = existing.contracts[0];
    if (last && (last.status === "FINALIZED" || IN_PROGRESS.includes(last.status))) {
      await recordProspectEvent({ prospectId: existing.id, type: "SUBSCRIPTION_REQUESTED", summary: `Nouvelle demande d'abonnement reçue du site (${v.ownerName}, ${v.email}) : un contrat ${last.status === "FINALIZED" ? "signé" : "en cours"} existe déjà, aucun nouvel envoi.`, actor: system });
      await notifyAdmins({ type: "SITE_SUBSCRIPTION_DUPLICATE", title: `Demande d'abonnement en double — ${v.name}`, body: `Un contrat ${last.status === "FINALIZED" ? "signé" : "est déjà en cours"} pour ce SIRET. Aucun nouvel envoi.`, linkUrl: `/admin/dossiers/${existing.id}`, severity: "INFO" });
      await acknowledge(v, last.status === "FINALIZED" ? "Votre contrat est déjà signé : notre équipe revient vers vous pour la suite." : "Un contrat vous a déjà été adressé : retrouvez-le dans votre messagerie. Notre équipe reste à votre disposition.");
      return last.status === "FINALIZED" ? { status: "ALREADY_CLIENT", prospectId: existing.id } : { status: "ALREADY_IN_PROGRESS", prospectId: existing.id, email: existing.email ?? v.email };
    }
    // Les informations saisies par le titulaire deviennent la référence du dossier.
    await prisma.prospect.update({
      where: { id: existing.id },
      data: {
        name: v.name,
        legalName: v.legalName,
        addressLine1: v.addressLine1,
        postalCode: v.postalCode,
        city: v.city,
        phone: v.phone ?? existing.phone,
        finessNumber: v.finessNumber ?? existing.finessNumber,
        ownerName: v.ownerName,
        ownerTitle: v.ownerTitle,
        email: v.email,
        outletCount: v.outletCount ?? existing.outletCount,
        planId: plan?.id ?? existing.planId,
        subscriptionRequestedAt: now,
        status: ["PROSPECT", "CONTACTED", "INTERESTED", "PROPOSAL_SENT", "LOST"].includes(existing.status) ? "INTERESTED" : existing.status,
        lastContactAt: now,
        ...(referrer && !existing.referralCode ? { referralCode: input.referralCode!.trim().toUpperCase() } : {}),
      },
    });
    prospectId = existing.id;
    await recordProspectEvent({ prospectId, type: "SUBSCRIPTION_REQUESTED", summary: `Demande d'abonnement reçue depuis le site — dossier existant retrouvé par SIRET${existing.salesRep ? ` (suivi par ${existing.salesRep.firstName} ${existing.salesRep.lastName})` : ""}.`, actor: system, metadata: { siret: v.siret, planId: plan?.id ?? null } });
    if (existing.salesRepId) await notifySalesRep({ salesRepId: existing.salesRepId, type: "SITE_SUBSCRIPTION", title: `${v.name} a demandé à souscrire depuis le site`, body: "Le contrat part automatiquement avec les informations saisies par le titulaire.", linkUrl: `/extranet/dossiers/${prospectId}`, severity: "SUCCESS" });
  } else {
    // 3. Aucun SIRET connu : nouveau dossier. Un rapprochement incertain (même e-mail, même nom et code postal) est signalé.
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
        status: "INTERESTED",
        lastContactAt: now,
        duplicateWarning: warning,
        referralCode: referrer ? input.referralCode!.trim().toUpperCase() : null,
      },
      select: { id: true },
    });
    prospectId = created.id;
    await recordProspectEvent({ prospectId, type: "SUBSCRIPTION_REQUESTED", summary: `Demande d'abonnement reçue depuis le site (${v.ownerName}, ${v.ownerTitle}).`, actor: system, metadata: { siret: v.siret, planId: plan?.id ?? null, referral: referrer?.name ?? null } });
    await recordProspectEvent({ prospectId, type: "CREATED", summary: `Dossier créé pour ${v.name}.`, actor: system });
    if (warning) {
      await recordProspectEvent({ prospectId, type: "DUPLICATE_SUSPECTED", summary: warning, actor: system, metadata: { suspects: suspects.map((s) => s.id) } });
      await notifyAdmins({ type: "DUPLICATE_SUSPECTED", title: `Doublon possible — ${v.name}`, body: warning, linkUrl: `/admin/dossiers/${prospectId}`, severity: "WARNING" });
      // Un dossier voisin a déjà un contrat : on ne risque pas deux contrats pour une même officine.
      if (suspects.some((s) => s.contracts[0] && (s.contracts[0].status === "FINALIZED" || IN_PROGRESS.includes(s.contracts[0].status)))) {
        await notifyAdmins({ type: "DOSSIER_BLOCKED", title: `Contrat retenu — ${v.name}`, body: "Un dossier proche a déjà un contrat en cours ou signé : vérifiez avant d'envoyer (bouton « Envoyer le contrat »).", linkUrl: `/admin/dossiers/${prospectId}`, severity: "WARNING" });
        await acknowledge(v, "Notre équipe vérifie votre dossier et vous adresse votre contrat très rapidement.");
        return { status: "RECEIVED", prospectId, reason: "rapprochement à vérifier" };
      }
    }
  }

  await recordAudit({ action: "sales.subscription_requested", entityType: "Prospect", entityId: prospectId, metadata: { siret: v.siret, planId: plan?.id ?? null } });
  await notifyAdmins({ type: "SITE_SUBSCRIPTION", title: `Nouvelle demande d'abonnement — ${v.name}`, body: `${v.ownerName} (${v.ownerTitle}) · ${v.email}${v.phone ? ` · ${v.phone}` : ""} · ${v.city}`, linkUrl: `/admin/dossiers/${prospectId}`, severity: "SUCCESS" });

  // 4. Le même moteur que partout ailleurs : vérification, génération, signature, e-mail.
  const contracting = await startContracting(prospectId, system, { planId: plan?.id ?? null });
  if (contracting.ok && contracting.outcome === "SENT") return { status: "CONTRACT_SENT", prospectId, email: v.email };
  if (contracting.ok && contracting.outcome === "ALREADY_IN_PROGRESS") return { status: "ALREADY_IN_PROGRESS", prospectId, email: v.email };
  if (contracting.ok) return { status: "ALREADY_CLIENT", prospectId };
  // L'envoi n'a pas pu se faire (prestataire indisponible, fiche société incomplète…) : la demande est gardée, l'équipe reprend la main.
  await notifyAdmins({ type: "DOSSIER_BLOCKED", title: `Contrat non envoyé — ${v.name}`, body: contracting.error, linkUrl: `/admin/dossiers/${prospectId}`, severity: "CRITICAL" });
  await acknowledge(v, "Votre contrat est en cours de préparation : vous le recevez par e-mail très prochainement.");
  return { status: "RECEIVED", prospectId, reason: contracting.error };
}

async function acknowledge(v: NormalizedRequest, nextStep: string): Promise<void> {
  const ctx = await platformEmailContext();
  const email = buildSubscriptionReceivedEmail(ctx, { ownerName: v.ownerName, pharmacyName: v.name, nextStep });
  await getMessagingProvider().sendEmail({ to: v.email, fromName: "PharmaBoost", subject: email.subject, text: email.text, html: email.html });
}
