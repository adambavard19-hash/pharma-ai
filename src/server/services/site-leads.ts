import { prisma } from "@/server/db/client";
import { getMessagingProvider } from "@/server/ai/registry";
import { publicUrl } from "@/server/public-url";
import { recordProspectEvent } from "@/server/services/sales/events";
import { notifyAdmins } from "@/server/services/sales/notifications";
import { traceDispatch } from "@/server/services/email-dispatch";
import { buildSiteLeadAcknowledgement, buildSiteLeadAlert, type SiteLeadKind, type SiteLeadSummary } from "@/core/platform/site-emails";
import { resolveReferralCode } from "@/server/services/referral";
import { reconcileNewProspect } from "@/server/services/referral-leads";

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
  referralCode: string | null;
};

/**
 * Une demande venue du site public devient un dossier du pipeline, sans
 * commercial attribué : la console le voit, l'équipe est prévenue, le
 * pharmacien reçoit un accusé de réception. Aucune donnée de santé ici.
 */
export async function receiveSiteLead(input: SiteLeadInput): Promise<{ prospectId: string; acknowledged: boolean }> {
  const kindLabel = input.kind === "DEMO" ? "Démonstration demandée depuis le site" : "Abonnement demandé depuis le site";
  // Le code n'est gardé que s'il désigne une vraie officine : un code inventé ne parraine personne.
  const referrer = await resolveReferralCode(input.referralCode);
  const notes = [
    kindLabel,
    input.lgo ? `Logiciel : ${input.lgo}` : null,
    input.postCount !== null ? `Postes de comptoir : ${input.postCount}` : null,
    input.preferredSlot ? `Créneau souhaité : ${input.preferredSlot}` : null,
    input.message ? `Message : ${input.message}` : null,
    referrer ? `Parrainée par : ${referrer.name}` : input.referralCode ? `Code de parrainage inconnu : ${input.referralCode}` : null,
  ].filter(Boolean).join("\n");

  // Une officine qui redemande depuis le site retrouve son dossier : l'e-mail
  // fait foi, et on ne crée pas deux fiches pour une même pharmacie.
  const existing = await prisma.prospect.findFirst({ where: { email: { equals: input.email, mode: "insensitive" }, pharmacyId: null }, select: { id: true, notes: true } });
  const prospect = existing
    ? await prisma.prospect.update({
        where: { id: existing.id },
        data: { status: input.kind === "SUBSCRIBE" ? "INTERESTED" : undefined, lastContactAt: new Date(), notes: [existing.notes, notes].filter(Boolean).join("\n\n"), ...(referrer ? { referralCode: input.referralCode!.trim().toUpperCase() } : {}) },
        select: { id: true },
      })
    : await prisma.prospect.create({
        data: {
          name: input.pharmacyName,
          // Venu du site : sans cette origine, le dossier se présentait comme créé par un commercial.
          origin: "SELF_SERVICE_SITE",
          ownerName: input.contactName,
          email: input.email,
          phone: input.phone,
          city: input.city,
          // Les postes de comptoir ne sont pas des points de vente : le contrat facture par point de vente.
          // Le nombre de postes reste dans les notes du dossier.
          status: input.kind === "SUBSCRIBE" ? "INTERESTED" : "PROSPECT",
          lastContactAt: new Date(),
          nextActionAt: new Date(Date.now() + 24 * 3600 * 1000),
          nextActionLabel: input.kind === "DEMO" ? "Rappeler pour fixer la démonstration" : "Préparer le contrat et envoyer le lien d'activation",
          notes,
          referralCode: referrer ? input.referralCode!.trim().toUpperCase() : null,
        },
        select: { id: true },
      });

  const siteActor = { type: "SYSTEM" as const, label: "Site public" };
  await recordProspectEvent({ prospectId: prospect.id, type: "CREATED", summary: kindLabel, actor: siteActor, metadata: { kind: input.kind, existing: Boolean(existing) } });
  // Un NOUVEAU dossier dont l'e-mail est celui d'un confrère proposé au parrainage lui est rattaché (casse ignorée).
  if (!existing) await reconcileNewProspect({ id: prospect.id, email: input.email, name: input.pharmacyName }, siteActor);
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
  // L'accusé au demandeur entre dans l'historique des communications, envoyé ou non (ne lève jamais).
  await traceDispatch({ kind: "SITE_LEAD_ACK", recipient: input.email, outcome, subject: ack.subject, trigger: "SYSTEM", prospectId: prospect.id });
  return { prospectId: prospect.id, acknowledged: outcome.status === "SENT" };
}

/**
 * L'offre affichée sur le site : l'offre marquée « par défaut » dans la
 * console, et elle seule. Sans offre par défaut, le site affiche le tarif
 * annoncé (voir FALLBACK_OFFER sur la page) : les offres de la grille
 * interne ne s'affichent pas au public par accident.
 */
export async function loadPublicOffer(): Promise<{ id: string; name: string; description: string; monthlyPriceCents: number; trialDays: number } | null> {
  const plan = await prisma.plan.findFirst({ where: { isActive: true, isDefault: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, description: true, monthlyPriceCents: true, trialDays: true } });
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

