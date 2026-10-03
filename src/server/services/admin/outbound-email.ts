import "server-only";
import { prisma } from "@/server/db/client";
import { getMessagingProvider } from "@/server/ai/registry";
import { publicUrl } from "@/server/public-url";
import { traceDispatch, type DispatchTrigger } from "@/server/services/email-dispatch";
import { PUBLIC_CONTACT_EMAIL } from "@/config/contact";
import { contractualPrice } from "@/core/billing/contract-price";
import { formatEuros, formatFrenchDate } from "@/core/billing/subscription";
import { renderTemplate } from "./email-templates";
import type { DeliveryOutcome } from "@/core/ai/ports";
import type { TemplateText } from "@/core/admin/email-templates";

/**
 * Les e-mails qui partent de la console (envoi manuel, relance automatique,
 * test) : toujours un modèle du centre de modèles, toujours le gabarit
 * PharmaBoost, toujours une ligne dans l'historique des communications.
 * Aucune donnée de santé n'entre dans ces messages.
 */

export type Recipient = {
  email: string;
  firstName: string | null;
  fullName: string | null;
  pharmacyId: string | null;
  organizationId: string | null;
  prospectId: string | null;
  pharmacyName: string;
};

/** Le titulaire actif d'une officine ; à défaut, l'e-mail de contact de l'officine. */
export async function pharmacyRecipient(pharmacyId: string): Promise<Recipient | null> {
  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id: pharmacyId },
    select: { id: true, name: true, email: true, organizationId: true, prospect: { select: { id: true } }, memberships: { where: { role: "OWNER", isActive: true, user: { deletedAt: null } }, take: 1, select: { user: { select: { email: true, firstName: true, lastName: true } } } } },
  });
  if (!pharmacy) return null;
  const owner = pharmacy.memberships[0]?.user ?? null;
  const email = owner?.email ?? pharmacy.email;
  if (!email) return null;
  return { email, firstName: owner?.firstName ?? null, fullName: owner ? `${owner.firstName} ${owner.lastName}` : null, pharmacyId: pharmacy.id, organizationId: pharmacy.organizationId, prospectId: pharmacy.prospect?.id ?? null, pharmacyName: pharmacy.name };
}

/** Le contact d'un dossier commercial (prospect sans officine, le plus souvent). */
export async function prospectRecipient(prospectId: string): Promise<Recipient | null> {
  const prospect = await prisma.prospect.findUnique({ where: { id: prospectId }, select: { id: true, name: true, email: true, ownerName: true, pharmacyId: true, pharmacy: { select: { organizationId: true } } } });
  if (!prospect?.email) return null;
  const firstName = prospect.ownerName?.trim().split(/\s+/)[0] ?? null;
  return { email: prospect.email, firstName, fullName: prospect.ownerName, pharmacyId: prospect.pharmacyId, organizationId: prospect.pharmacy?.organizationId ?? null, prospectId: prospect.id, pharmacyName: prospect.name };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Les valeurs réelles des variables pour un destinataire : abonnement, offre,
 * tarif contractuel, fin d'essai. Une valeur inconnue reste vide, jamais
 * inventée.
 */
export async function templateValuesFor(recipient: Recipient, extra: Record<string, string | null | undefined> = {}): Promise<Record<string, string>> {
  const values: Record<string, string> = {
    prenom: recipient.firstName ?? "",
    titulaire: recipient.fullName ?? "",
    officine: recipient.pharmacyName,
    contact: PUBLIC_CONTACT_EMAIL,
    lien_espace: publicUrl("/parametres?onglet=abonnement"),
  };
  if (recipient.organizationId) {
    const subscription = await prisma.subscription.findUnique({ where: { organizationId: recipient.organizationId }, select: { contractPriceCents: true, trialEndsAt: true, lastPaymentFailedAt: true, plan: { select: { name: true, monthlyPriceCents: true } }, payments: { where: { status: "FAILED" }, orderBy: { createdAt: "desc" }, take: 1, select: { amountCents: true } } } });
    if (subscription) {
      values.offre = subscription.plan.name;
      values.prix = `${formatEuros(contractualPrice(subscription, subscription.plan).cents)} HT`;
      if (subscription.trialEndsAt) {
        values.date_fin_essai = formatFrenchDate(subscription.trialEndsAt);
        values.jours_restants = String(Math.max(0, Math.ceil((subscription.trialEndsAt.getTime() - Date.now()) / DAY_MS)));
      }
      if (subscription.lastPaymentFailedAt) values.date_echec = formatFrenchDate(subscription.lastPaymentFailedAt);
      if (subscription.payments[0]) values.montant = formatEuros(subscription.payments[0].amountCents);
    }
  }
  for (const [key, value] of Object.entries(extra)) if (value !== null && value !== undefined) values[key] = value;
  return values;
}

export type SendTemplatedEmailInput = {
  templateKey: string;
  recipient: Recipient;
  values: Record<string, string | null | undefined>;
  /** Texte saisi au moment de l'envoi (message libre, relance ajustée) ; sinon le texte du modèle. */
  textOverride?: TemplateText;
  trigger: DispatchTrigger;
  ruleKey?: string | null;
  contractId?: string | null;
  adminId?: string | null;
};

/** Envoie un modèle et le trace. Ne lève pas : l'issue est rendue (envoyé, simulé, en échec). */
export async function sendTemplatedEmail(input: SendTemplatedEmailInput): Promise<{ outcome: DeliveryOutcome; subject: string; dispatchId: string | null }> {
  const rendered = await renderTemplate(input.templateKey, input.values, input.textOverride);
  if (!rendered) return { outcome: { status: "FAILED", provider: "aucun", detail: `Modèle inconnu : ${input.templateKey}` }, subject: "", dispatchId: null };
  const outcome = await getMessagingProvider().sendEmail({ to: input.recipient.email, fromName: "PharmaBoost", subject: rendered.subject, text: rendered.text, html: rendered.html });
  const trace = await traceDispatch({
    kind: "TEMPLATE",
    recipient: input.recipient.email,
    outcome,
    subject: rendered.subject,
    templateKey: input.templateKey,
    trigger: input.trigger,
    ruleKey: input.ruleKey ?? null,
    pharmacyId: input.recipient.pharmacyId,
    organizationId: input.recipient.organizationId,
    prospectId: input.recipient.prospectId,
    contractId: input.contractId ?? null,
    sentByAdminId: input.adminId ?? null,
  });
  return { outcome, subject: rendered.subject, dispatchId: trace?.id ?? null };
}
