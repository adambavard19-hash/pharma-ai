import "server-only";
import { prisma } from "@/server/db/client";
import { publicUrl } from "@/server/public-url";
import { hashEmail } from "@/server/security/tokens";
import { ensureReferralCode } from "@/server/services/referral";
import { normalizeEmail } from "@/core/contracts/identity";
import { CAMPAIGN_AUDIENCES, type AudienceKey, type CampaignDraftInput } from "@/core/admin/campaigns";
import { PUBLIC_CONTACT_EMAIL } from "@/config/contact";
import { pharmacyRecipient } from "./outbound-email";

/**
 * À qui s'adresse une campagne : la lecture des destinataires, et leurs
 * valeurs au moment de l'envoi.
 *
 * Les mêmes lignes servent l'aperçu (« 42 destinataires ») et l'envoi : le
 * nombre que l'administrateur confirme est celui que l'envoi recalcule, et
 * c'est lui, pas un compteur mis en cache, qui est comparé. Une adresse =
 * un destinataire (dédoublonnage en minuscules) ; une adresse désinscrite des
 * offres n'est jamais contactée (comparée par empreinte, jamais en clair).
 */

export type AudienceTarget = "PHARMACY" | "PARTNER_CONTACT" | "PARTNER_APPLICATION";

export type AudienceRecipient = {
  targetType: AudienceTarget;
  targetId: string;
  pharmacyId: string | null;
  partnerId: string | null;
  /** L'adresse en minuscules : la clé du dédoublonnage. */
  email: string;
  name: string | null;
};

export type ResolvedAudience = {
  /** Ceux qui recevront le message : dédoublonnés, hors désinscrits. */
  recipients: AudienceRecipient[];
  /** Les désinscrits des offres : jamais contactés, gardés pour que l'écran dise pourquoi. */
  optedOut: AudienceRecipient[];
  excluded: { optedOut: number; noEmail: number; duplicates: number };
};

type Candidates = { candidates: AudienceRecipient[]; noEmail: number };

const PARTNER_OUT = ["ARCHIVED", "SUSPENDED"] as const;
/** Les candidatures encore ouvertes : jamais refusées, ni déjà devenues partenaires. */
const OPEN_APPLICATIONS = ["NEW", "REVIEWING", "CONTACTED", "NEGOTIATION"] as const;

async function pharmacyCandidates(audience: AudienceKey, params: CampaignDraftInput["audienceParams"]): Promise<Candidates> {
  const segment =
    audience === "pharmacies.trialing"
      ? { organization: { subscription: { status: "TRIALING" as const } } }
      : audience === "pharmacies.subscribed"
        ? { organization: { subscription: { status: "ACTIVE" as const } } }
        : audience === "pharmacies.without_referrals"
          ? { referrals: { none: {} } }
          : audience === "pharmacies.selected"
            ? { id: { in: params.pharmacyIds ?? [] } }
            : {};
  const rows = await prisma.pharmacy.findMany({
    where: { isDemo: false, isActive: true, ...segment },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    // Le destinataire est celui de `pharmacyRecipient` : le titulaire actif, à défaut l'e-mail de l'officine.
    select: { id: true, name: true, email: true, memberships: { where: { role: "OWNER", isActive: true, user: { deletedAt: null } }, take: 1, select: { user: { select: { email: true } } } } },
  });
  const candidates: AudienceRecipient[] = [];
  let noEmail = 0;
  for (const row of rows) {
    const email = normalizeEmail(row.memberships[0]?.user.email ?? row.email);
    if (!email) noEmail += 1;
    else candidates.push({ targetType: "PHARMACY", targetId: row.id, pharmacyId: row.id, partnerId: null, email, name: row.name });
  }
  return { candidates, noEmail };
}

async function partnerContactCandidates(audience: AudienceKey, params: CampaignDraftInput["audienceParams"]): Promise<Candidates> {
  const segment = audience === "partners.without_brand" ? { brands: { none: {} } } : audience === "partners.selected" ? { id: { in: params.partnerIds ?? [] } } : {};
  const partners = await prisma.partner.findMany({
    where: { status: { notIn: [...PARTNER_OUT] }, ...segment },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], select: { id: true, firstName: true, lastName: true, email: true } } },
  });
  const candidates: AudienceRecipient[] = [];
  let noEmail = 0;
  for (const partner of partners) {
    const usable = partner.contacts.flatMap((contact) => {
      const email = normalizeEmail(contact.email);
      return email ? [{ contact, email }] : [];
    });
    // Un partenaire sans aucune adresse exploitable est compté à part : il n'a personne à qui écrire.
    if (usable.length === 0) noEmail += 1;
    for (const { contact, email } of usable) {
      candidates.push({ targetType: "PARTNER_CONTACT", targetId: contact.id, pharmacyId: null, partnerId: partner.id, email, name: `${contact.firstName} ${contact.lastName}`.trim() || null });
    }
  }
  return { candidates, noEmail };
}

async function applicationCandidates(): Promise<Candidates> {
  const rows = await prisma.partnerApplication.findMany({
    where: { status: { in: [...OPEN_APPLICATIONS] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, partnerId: true, email: true, contactFirstName: true, contactLastName: true },
  });
  const candidates: AudienceRecipient[] = [];
  let noEmail = 0;
  for (const row of rows) {
    const email = normalizeEmail(row.email);
    if (!email) noEmail += 1;
    else candidates.push({ targetType: "PARTNER_APPLICATION", targetId: row.id, pharmacyId: null, partnerId: row.partnerId, email, name: `${row.contactFirstName} ${row.contactLastName}`.trim() || null });
  }
  return { candidates, noEmail };
}

/** Les adresses désinscrites parmi celles-ci, par lots : l'empreinte seule est comparée. */
async function optedOutHashes(hashes: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < hashes.length; i += 1000) {
    const rows = await prisma.marketingOptOut.findMany({ where: { emailHash: { in: hashes.slice(i, i + 1000) } }, select: { emailHash: true } });
    for (const row of rows) found.add(row.emailHash);
  }
  return found;
}

/**
 * Les destinataires d'un public : lus en base, dédoublonnés par adresse (le
 * premier garde l'adresse), puis séparés des désinscrits. L'ordre est stable
 * (ancienneté, puis identifiant) : l'aperçu et l'envoi voient les mêmes lignes.
 */
export async function resolveAudience(audience: AudienceKey, params: CampaignDraftInput["audienceParams"]): Promise<ResolvedAudience> {
  const side = CAMPAIGN_AUDIENCES[audience].side;
  const { candidates, noEmail } =
    side === "PHARMACY"
      ? await pharmacyCandidates(audience, params)
      : audience === "partners.applications_open"
        ? await applicationCandidates()
        : await partnerContactCandidates(audience, params);

  const seen = new Set<string>();
  const unique: AudienceRecipient[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.email)) continue;
    seen.add(candidate.email);
    unique.push(candidate);
  }

  const optOuts = await optedOutHashes(unique.map((r) => hashEmail(r.email)));
  const recipients: AudienceRecipient[] = [];
  const optedOut: AudienceRecipient[] = [];
  for (const recipient of unique) (optOuts.has(hashEmail(recipient.email)) ? optedOut : recipients).push(recipient);

  return { recipients, optedOut, excluded: { optedOut: optedOut.length, noEmail, duplicates: candidates.length - unique.length } };
}

/**
 * Les valeurs de variables d'un destinataire, relues au moment de l'envoi : le
 * nom et le prénom sont ceux d'aujourd'hui. Une valeur inconnue est absente,
 * jamais inventée. Le code de parrainage n'est créé que si le texte l'utilise.
 */
export async function recipientValues(recipient: { targetType: string; targetId: string; pharmacyId: string | null; name: string | null }, options: { wantsReferralCode: boolean }): Promise<Record<string, string>> {
  if (recipient.targetType === "PHARMACY" && recipient.pharmacyId) {
    const resolved = await pharmacyRecipient(recipient.pharmacyId);
    const values: Record<string, string> = {
      prenom: resolved?.firstName ?? "",
      titulaire: resolved?.fullName ?? "",
      officine: resolved?.pharmacyName ?? recipient.name ?? "",
      contact: PUBLIC_CONTACT_EMAIL,
      lien_espace: publicUrl("/parametres?onglet=abonnement"),
    };
    if (options.wantsReferralCode) {
      const code = await ensureReferralCode(recipient.pharmacyId);
      values.code_parrainage = code;
      values.lien_parrainage = publicUrl(`/decouvrir/abonnement?parrain=${encodeURIComponent(code)}`);
    }
    return values;
  }
  const common = { contact: PUBLIC_CONTACT_EMAIL, lien_candidature: publicUrl("/decouvrir/partenaires") };
  if (recipient.targetType === "PARTNER_CONTACT") {
    const contact = await prisma.partnerContact.findUnique({ where: { id: recipient.targetId }, select: { firstName: true, partner: { select: { name: true } } } });
    return { ...common, prenom: contact?.firstName ?? "", nom_partenaire: contact?.partner.name ?? "" };
  }
  const application = await prisma.partnerApplication.findUnique({ where: { id: recipient.targetId }, select: { contactFirstName: true, company: true } });
  return { ...common, prenom: application?.contactFirstName ?? "", nom_partenaire: application?.company ?? "" };
}
