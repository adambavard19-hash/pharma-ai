import "server-only";
import { prisma } from "@/server/db/client";
import { getMessagingProvider } from "@/server/ai/registry";
import { notifyAdmins } from "@/server/services/sales/notifications";
import { brandVisibleTo, partnerInPeriod, type DiscoverViewer } from "@/core/discover/visibility";
import { checkInfoRequest, infoRequestConsentText, INFO_REQUEST_CONSENT_VERSION, type InfoRequestShared } from "@/core/discover/content";
import { isLaunchRowLive, liveLaunchWhere } from "./discover";

/**
 * « Demander des informations » à une marque, depuis l'onglet Découvertes.
 *
 * Rien ne part sans la case de consentement cochée par la personne (jamais d'avance). Le texte exact affiché est
 * recalculé ici, côté serveur, à partir des MÊMES éléments (marque, laboratoire, données jointes), puis enregistré
 * avec l'instant de l'accord dans la demande (preuve), et une ligne `UserConsent PARTNER_INFO_REQUEST` s'ajoute au
 * journal. Seules les données listées dans ce texte sont transmises — aucune autre.
 *
 * La demande apparaît dans la console (Partenaires → Demandes d'info). Elle part par e-mail au contact du partenaire
 * s'il en a un (contact des commandes, sinon principal) ; sinon elle reste à l'équipe PharmaBoost.
 */

/** Au plus 3 demandes par personne et par marque en 24 h, et 10 en tout : un garde-fou en base, pas en mémoire. */
export const INFO_REQUEST_LIMITS = { perBrandPerDay: 3, perUserPerDay: 10 } as const;

export type InfoRequestContext = {
  brand: { id: string; name: string; partnerId: string; partnerName: string };
  shared: InfoRequestShared;
  /** Le nom de l'officine que la personne peut choisir de joindre (officine active, ou celle qu'elle a déclarée). */
  pharmacyNameAvailable: string | null;
};

export type InfoRequestPerson = {
  userId: string;
  fullName: string;
  email: string;
  professionLabel: string | null;
  /** Officine active (équipe cliente) : son identifiant et son nom. */
  activePharmacy: { id: string; name: string } | null;
  declaredPharmacyName: string | null;
};

async function visibleBrand(viewer: DiscoverViewer, brandId: string, now: Date) {
  const brand = await prisma.partnerBrand.findUnique({
    where: { id: brandId },
    select: { id: true, name: true, status: true, audience: true, partner: { select: { id: true, name: true, status: true, startsAt: true, endsAt: true } } },
  });
  if (!brand) return null;
  const visible = brandVisibleTo({ id: brand.id, status: brand.status, audience: brand.audience, partnerStatus: brand.partner.status, partnerInPeriod: partnerInPeriod(brand.partner, now) }, viewer);
  return visible ? brand : null;
}

/** Ce que la feuille affiche avant l'envoi. Null si la marque n'est pas visible pour cette personne. */
export async function infoRequestContext(viewer: DiscoverViewer, person: InfoRequestPerson, brandId: string, now = new Date()): Promise<InfoRequestContext | null> {
  const brand = await visibleBrand(viewer, brandId, now);
  if (!brand) return null;
  return {
    brand: { id: brand.id, name: brand.name, partnerId: brand.partner.id, partnerName: brand.partner.name },
    shared: { fullName: person.fullName, email: person.email, professionLabel: person.professionLabel, pharmacyName: null },
    pharmacyNameAvailable: person.activePharmacy?.name ?? person.declaredPharmacyName ?? null,
  };
}

export type InfoRequestInput = {
  brandId: string;
  launchId: string | null;
  message: string | null;
  includePharmacy: boolean;
  consent: boolean;
  /** Le texte que l'écran a affiché : il doit être identique à celui que le serveur recalcule. */
  consentTextShown: string;
};

export type InfoRequestResult =
  | { ok: true; requestId: string; transmitted: boolean; brandName: string }
  | { ok: false; error: string; field?: "consent" | "message" };

export async function createInfoRequest(viewer: DiscoverViewer, person: InfoRequestPerson, input: InfoRequestInput, now = new Date()): Promise<InfoRequestResult> {
  const check = checkInfoRequest({ consent: input.consent, message: input.message });
  if (!check.ok) return { ok: false, error: check.error, field: check.field };

  const brand = await visibleBrand(viewer, input.brandId, now);
  if (!brand) return { ok: false, error: "Cette marque n'est pas disponible." };

  let launchId: string | null = null;
  if (input.launchId) {
    const launch = await prisma.partnerLaunch.findFirst({
      where: { id: input.launchId, brandId: brand.id, ...liveLaunchWhere(now) },
      select: { id: true, reviewStatus: true, publishedAt: true, endsAt: true, regulatoryCategory: true, regulatoryValidatedBy: true, regulatoryValidatedAt: true, regulatoryMentions: true },
    });
    launchId = launch && isLaunchRowLive(launch, now) ? launch.id : null;
  }

  const pharmacyName = input.includePharmacy ? (person.activePharmacy?.name ?? person.declaredPharmacyName ?? null) : null;
  const shared: InfoRequestShared = { fullName: person.fullName, email: person.email, professionLabel: person.professionLabel, pharmacyName };
  const consentText = infoRequestConsentText({ brandName: brand.name, partnerName: brand.partner.name, shared, hasMessage: !!check.message });
  // La preuve doit être le texte que la personne a lu : si l'écran a montré autre chose, on n'enregistre rien.
  if (consentText !== input.consentTextShown) return { ok: false, error: "Le texte de l'accord a changé : relisez-le puis cochez à nouveau la case.", field: "consent" };

  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [sameBrand, total] = await Promise.all([
    prisma.partnerInfoRequest.count({ where: { userId: person.userId, brandId: brand.id, createdAt: { gte: since } } }),
    prisma.partnerInfoRequest.count({ where: { userId: person.userId, createdAt: { gte: since } } }),
  ]);
  if (sameBrand >= INFO_REQUEST_LIMITS.perBrandPerDay || total >= INFO_REQUEST_LIMITS.perUserPerDay) {
    return { ok: false, error: "Vous avez déjà envoyé plusieurs demandes aujourd'hui : la marque vous répondra. Réessayez demain si besoin." };
  }

  const request = await prisma.$transaction(async (tx) => {
    const created = await tx.partnerInfoRequest.create({
      data: {
        userId: person.userId,
        partnerId: brand.partner.id,
        brandId: brand.id,
        launchId,
        // L'officine n'est rattachée à la demande que si la personne a choisi de la joindre.
        pharmacyId: input.includePharmacy ? (person.activePharmacy?.id ?? null) : null,
        message: check.message,
        consentText,
        consentAt: now,
        status: "NEW",
      },
      select: { id: true },
    });
    await tx.userConsent.create({
      data: { userId: person.userId, kind: "PARTNER_INFO_REQUEST", granted: true, grantedAt: now, source: "PARTNER_REQUEST", textVersion: `${INFO_REQUEST_CONSENT_VERSION} · ${consentText}`, createdAt: now },
    });
    return created;
  });

  const transmitted = await forwardToPartner(request.id, brand, shared, check.message, now);
  await notifyAdmins({
    type: "PARTNER_INFO_REQUEST",
    title: `Demande d'information — ${brand.name}`,
    body: transmitted ? "Transmise par e-mail au contact du partenaire, avec l'accord de la personne." : "Aucun contact du partenaire n'a d'adresse e-mail : demande à transmettre par l'équipe PharmaBoost.",
    linkUrl: "/admin/partenaires/demandes",
    severity: transmitted ? "INFO" : "WARNING",
  }).catch(() => undefined);

  return { ok: true, requestId: request.id, transmitted, brandName: brand.name };
}

/** Le contact du partenaire qui reçoit les demandes : celui des commandes, sinon le principal, avec une adresse. */
async function partnerContactEmail(partnerId: string): Promise<string | null> {
  const contact = await prisma.partnerContact.findFirst({
    where: { partnerId, email: { not: null }, OR: [{ receivesOrders: true }, { isPrimary: true }] },
    orderBy: [{ receivesOrders: "desc" }, { isPrimary: "desc" }, { createdAt: "asc" }],
    select: { email: true },
  });
  return contact?.email?.trim() || null;
}

/** L'e-mail au partenaire : SEULEMENT les données listées dans l'accord. */
export function infoRequestEmail(input: { brandName: string; shared: InfoRequestShared; message: string | null; consentAt: Date }): { subject: string; text: string } {
  const lines = [
    `Bonjour,`,
    ``,
    `Un professionnel de la pharmacie demande des informations sur ${input.brandName}, depuis l'application PharmaBoost.`,
    ``,
    `Nom : ${input.shared.fullName}`,
    `E-mail : ${input.shared.email}`,
    input.shared.professionLabel ? `Métier (déclaré) : ${input.shared.professionLabel}` : null,
    input.shared.pharmacyName ? `Officine : ${input.shared.pharmacyName}` : null,
    input.message ? `` : null,
    input.message ? `Message :\n${input.message}` : null,
    ``,
    `Cette personne a accepté, le ${input.consentAt.toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}, que ces informations vous soient transmises pour répondre à sa demande. Merci de ne pas les utiliser à d'autres fins.`,
    ``,
    `— PharmaBoost`,
  ].filter((line): line is string => line !== null);
  return { subject: `Demande d'information — ${input.brandName} (PharmaBoost)`, text: lines.join("\n") };
}

async function forwardToPartner(requestId: string, brand: { name: string; partner: { id: string } }, shared: InfoRequestShared, message: string | null, consentAt: Date): Promise<boolean> {
  const recipient = await partnerContactEmail(brand.partner.id);
  if (!recipient) return false;
  const email = infoRequestEmail({ brandName: brand.name, shared, message, consentAt });
  const outcome = await getMessagingProvider().sendEmail({ to: recipient, fromName: "PharmaBoost", subject: email.subject, text: email.text });
  // Simulé (aucun prestataire configuré) ou en échec : la demande reste à l'équipe, on ne prétend pas l'avoir transmise.
  if (outcome.status !== "SENT") return false;
  await prisma.partnerInfoRequest.update({ where: { id: requestId }, data: { status: "TRANSMITTED", transmittedAt: new Date() } });
  return true;
}
