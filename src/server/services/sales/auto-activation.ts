import "server-only";
import { prisma } from "@/server/db/client";
import { recordProspectEvent } from "@/server/services/sales/events";
import { notifyAdmins } from "@/server/services/sales/notifications";

/**
 * Après les signatures, tout s'enchaîne seul (fondateur, 5 nov. 2026) : « pour le lien de paiement, ça part tout de suite,
 * juste après les signatures ». Le contrat est complet (titulaire + société) :
 *  1. l'espace PharmaBoost est créé s'il n'existe pas encore (souscription du site) — sans e-mail d'accueil, qui attend le
 *     paiement, et avec le logiciel bloqué jusqu'au paiement ;
 *  2. le lien de paiement part au titulaire, aux conditions du contrat signé (prix, mise en service).
 * Un échec n'arrête rien : la console est prévenue, avec le geste à faire à la main.
 */
export async function afterContractFinalized(contractId: string): Promise<void> {
  const system = { type: "SYSTEM" as const, label: "Après signature" };
  const contract = await prisma.contract.findUnique({ where: { id: contractId }, select: { id: true, planId: true, setupFeeCents: true, prospect: { select: { id: true, name: true, pharmacyId: true } } } });
  if (!contract) return;
  const prospect = contract.prospect;
  const adminLink = `/admin/dossiers/${prospect.id}`;

  let pharmacyId = prospect.pharmacyId;
  if (!pharmacyId) {
    const { createPharmacyFromProspect } = await import("@/server/services/sales/client-pharmacies");
    const created = await createPharmacyFromProspect(prospect.id, system, { deferWelcome: true, softwareGate: true });
    if (!created.ok) {
      await notifyAdmins({ type: "DOSSIER_BLOCKED", title: `Lien de paiement non parti — ${prospect.name}`, body: `Contrat signé, mais l'espace n'a pas pu être créé : ${created.error} Créez l'espace depuis le dossier, puis « Envoyer le lien d'abonnement ».`, linkUrl: adminLink, severity: "CRITICAL" });
      return;
    }
    pharmacyId = created.pharmacyId;
  }

  const planId = contract.planId ?? (await prisma.plan.findFirst({ where: { isActive: true }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } }))?.id ?? null;
  if (!planId) {
    await notifyAdmins({ type: "DOSSIER_BLOCKED", title: `Lien de paiement non parti — ${prospect.name}`, body: "Aucune offre active : créez l'offre dans Facturation → Offres & tarifs, puis « Envoyer le lien d'abonnement ».", linkUrl: `/admin/abonnements/${pharmacyId}`, severity: "CRITICAL" });
    return;
  }
  const { sendSubscriptionInvite } = await import("@/server/billing/subscriptions");
  const invite = await sendSubscriptionInvite({ pharmacyId, planId, contractId: contract.id, adminId: null, setupFeeCents: contract.setupFeeCents ?? null }).catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }));
  if (!invite.ok) {
    await recordProspectEvent({ prospectId: prospect.id, type: "NOTE", summary: `Lien de paiement NON envoyé après la signature : ${invite.error}`, actor: system, metadata: { contractId } });
    await notifyAdmins({ type: "DOSSIER_BLOCKED", title: `Lien de paiement non parti — ${prospect.name}`, body: `${invite.error} Une fois corrigé : « Envoyer le lien d'abonnement » sur la fiche de l'abonnement.`, linkUrl: `/admin/abonnements/${pharmacyId}`, severity: "CRITICAL" });
    return;
  }
  await recordProspectEvent({ prospectId: prospect.id, type: "EMAIL_SENT", summary: `Lien de paiement envoyé tout seul à ${invite.sentTo}, juste après la signature.`, actor: system, metadata: { contractId, inviteId: invite.inviteId } });
  await notifyAdmins({ type: "SUBSCRIPTION_INVITE", title: `${prospect.name} : lien de paiement envoyé`, body: `Contrat signé ; le lien de paiement est parti à ${invite.sentTo}. Le logiciel partira dès le paiement reçu.`, linkUrl: `/admin/abonnements/${pharmacyId}`, severity: "SUCCESS" });
}
