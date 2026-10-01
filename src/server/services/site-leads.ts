import { prisma } from "@/server/db/client";
import { getMessagingProvider } from "@/server/ai/registry";
import { publicUrl } from "@/server/public-url";
import { recordProspectEvent } from "@/server/services/sales/events";
import { notifyAdmins } from "@/server/services/sales/notifications";
import { buildSiteLeadAcknowledgement, buildSiteLeadAlert, type SiteLeadKind, type SiteLeadSummary } from "@/core/platform/site-emails";

export const DEFAULT_CONTACT_EMAIL = "contact@pharmaboost.app";

export type SiteLeadInput = {
  kind: SiteLeadKind;
  pharmacyName: string;
  contactName: string;
  email: string;
  phone: string | null;
  city: string | null;
  lgo: string | null;
  postCount: number | null;
  message: string | null;
  preferredSlot: string | null;
};

/**
 * Une demande venue du site public devient un dossier du pipeline, sans
 * commercial attribué : la console le voit, l'équipe est prévenue, le
 * pharmacien reçoit un accusé de réception. Aucune donnée de santé ici.
 */
export async function receiveSiteLead(input: SiteLeadInput): Promise<{ prospectId: string; acknowledged: boolean }> {
  const kindLabel = input.kind === "DEMO" ? "Démonstration demandée depuis le site" : "Abonnement demandé depuis le site";
  const notes = [
    kindLabel,
    input.lgo ? `Logiciel : ${input.lgo}` : null,
    input.postCount !== null ? `Postes de comptoir : ${input.postCount}` : null,
    input.preferredSlot ? `Créneau souhaité : ${input.preferredSlot}` : null,
    input.message ? `Message : ${input.message}` : null,
  ].filter(Boolean).join("\n");

  // Une officine qui redemande depuis le site retrouve son dossier : l'e-mail
  // fait foi, et on ne crée pas deux fiches pour une même pharmacie.
  const existing = await prisma.prospect.findFirst({ where: { email: { equals: input.email, mode: "insensitive" }, pharmacyId: null }, select: { id: true, notes: true } });
  const prospect = existing
    ? await prisma.prospect.update({
        where: { id: existing.id },
        data: { status: input.kind === "SUBSCRIBE" ? "INTERESTED" : undefined, lastContactAt: new Date(), notes: [existing.notes, notes].filter(Boolean).join("\n\n") },
        select: { id: true },
      })
    : await prisma.prospect.create({
        data: {
          name: input.pharmacyName,
          ownerName: input.contactName,
          email: input.email,
          phone: input.phone,
          city: input.city,
          outletCount: input.postCount,
          status: input.kind === "SUBSCRIBE" ? "INTERESTED" : "PROSPECT",
          lastContactAt: new Date(),
          nextActionAt: new Date(Date.now() + 24 * 3600 * 1000),
          nextActionLabel: input.kind === "DEMO" ? "Rappeler pour fixer la démonstration" : "Préparer le contrat et envoyer le lien d'activation",
          notes,
        },
        select: { id: true },
      });

  await recordProspectEvent({ prospectId: prospect.id, type: "CREATED", summary: kindLabel, actor: { type: "SYSTEM", label: "Site public" }, metadata: { kind: input.kind, existing: Boolean(existing) } });
  const adminUrl = publicUrl(`/admin/dossiers/${prospect.id}`);
  await notifyAdmins({ type: "SITE_LEAD", title: `${kindLabel} — ${input.pharmacyName}`, body: `${input.contactName} · ${input.email}${input.phone ? ` · ${input.phone}` : ""}`, linkUrl: `/admin/dossiers/${prospect.id}`, severity: "INFO" });

  const company = await prisma.companyProfile.findUnique({ where: { id: "default" }, select: { representativeEmail: true } });
  const contactEmail = company?.representativeEmail ?? DEFAULT_CONTACT_EMAIL;
  const summary: SiteLeadSummary = { ...input };
  const messaging = getMessagingProvider();
  const alert = buildSiteLeadAlert({ ...summary, adminUrl });
  await messaging.sendEmail({ to: contactEmail, fromName: "PharmaBoost", subject: alert.subject, text: alert.text, html: alert.html });
  const ack = buildSiteLeadAcknowledgement({ ...summary, contactEmail });
  const outcome = await messaging.sendEmail({ to: input.email, fromName: "PharmaBoost", subject: ack.subject, text: ack.text, html: ack.html });
  return { prospectId: prospect.id, acknowledged: outcome.status === "SENT" };
}

/** L'offre affichée sur le site : l'offre par défaut de la console, sinon rien. */
export async function loadPublicOffer(): Promise<{ name: string; description: string; monthlyPriceCents: number; trialDays: number } | null> {
  const plan = await prisma.plan.findFirst({ where: { isActive: true }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], select: { name: true, description: true, monthlyPriceCents: true, trialDays: true } });
  return plan;
}

/** La fiche société, pour les mentions légales : ce que la console a renseigné, rien d'autre. */
export async function loadCompanyProfile() {
  return prisma.companyProfile.findUnique({ where: { id: "default" } });
}

/**
 * La preuve chiffrée du site : conseils acceptés et ventes additionnelles,
 * agrégés sur toutes les officines réelles. Rien n'est publié en dessous
 * d'un seuil : un chiffre trop petit ne prouve rien, et une officine seule
 * ne doit pas être reconnaissable.
 */
const PROOF_MIN_ACCEPTED = 50;
export async function loadLiveProof(): Promise<{ acceptedAdvices: number; attributedCents: number; attributedMarginCents: number; pharmacies: number } | null> {
  const [accepted, sales, pharmacies] = await Promise.all([
    prisma.recommendation.count({ where: { isDemo: false, status: { in: ["ACCEPTED", "MODIFIED", "REPLACED", "PRESENTED", "PURCHASED"] } } }),
    prisma.sale.aggregate({ where: { isDemo: false, attributedCents: { gt: 0 } }, _sum: { attributedCents: true, attributedMarginCents: true } }),
    prisma.pharmacy.count({ where: { isDemo: false, isActive: true } }),
  ]);
  if (accepted < PROOF_MIN_ACCEPTED || pharmacies < 2) return null;
  return { acceptedAdvices: accepted, attributedCents: sales._sum.attributedCents ?? 0, attributedMarginCents: sales._sum.attributedMarginCents ?? 0, pharmacies };
}

