import "server-only";
import { randomInt } from "node:crypto";
import { prisma } from "@/server/db/client";
import { getMessagingProvider } from "@/server/ai/registry";
import { publicUrl } from "@/server/public-url";
import { encryptField, decryptField } from "@/server/security/encryption";
import { hashEmail, maskEmail, openToken, sealToken } from "@/server/security/tokens";
import {
  codeValidAt,
  isOfferCode,
  joinRequestKey,
  makeOfferCode,
  offerAccess,
  offerIsLive,
  validateJoinRequest,
  type JoinRequestInput,
} from "@/core/patient-app/offers";

/**
 * Les inscrits de l'appli des patients (fondateur, 22 oct. 2026) : connexion par lien e-mail, pharmacie PharmaBoost ou
 * pharmacie déclarée hors réseau, abonnement PharmaBoost+, codes d'offre bipés au comptoir.
 *
 * Aucune donnée de santé ici : l'adresse e-mail (chiffrée), la pharmacie, l'abonnement. L'armoire à pharmacie reste sur le
 * téléphone de l'inscrit. La session est un jeton scellé (chiffré, signé, daté) dans un cookie : rien d'autre ne l'ouvre.
 */

const LOGIN_PURPOSE = "app-login";
const SESSION_PURPOSE = "app-member";
const LOGIN_TTL_MS = 30 * 60 * 1000;
export const APP_SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;
export const APP_SESSION_COOKIE = "pb_patient";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;

export type AppMemberView = {
  id: string;
  emailMasked: string;
  plan: "FREE" | "PLUS";
  plusSince: Date | null;
  offersConsent: boolean;
  homePharmacy: { id: string; name: string; city: string | null } | null;
  declared: { pharmacyName: string; city: string; postalCode: string; wantsJoin: boolean } | null;
};

const MEMBER_SELECT = {
  id: true,
  emailMasked: true,
  plan: true,
  plusSince: true,
  offersConsentAt: true,
  homePharmacy: { select: { id: true, name: true, city: true, isActive: true, isDemo: true } },
  joinRequest: { select: { pharmacyName: true, city: true, postalCode: true, wantsJoin: true } },
} as const;

type MemberRow = {
  id: string;
  emailMasked: string;
  plan: "FREE" | "PLUS";
  plusSince: Date | null;
  offersConsentAt: Date | null;
  homePharmacy: { id: string; name: string; city: string | null; isActive: boolean; isDemo: boolean } | null;
  joinRequest: { pharmacyName: string; city: string; postalCode: string; wantsJoin: boolean } | null;
};

function view(row: MemberRow): AppMemberView {
  const home = row.homePharmacy && row.homePharmacy.isActive ? row.homePharmacy : null;
  return {
    id: row.id,
    emailMasked: row.emailMasked,
    plan: row.plan,
    plusSince: row.plusSince,
    offersConsent: row.offersConsentAt !== null,
    homePharmacy: home ? { id: home.id, name: home.name, city: home.city } : null,
    declared: row.joinRequest,
  };
}

// ---------------------------------------------------------------- Connexion

/**
 * Envoie le lien de connexion. Toujours la même réponse, que l'adresse soit connue ou non. Hors production, le lien est
 * aussi rendu à l'écran (aperçu sans boîte e-mail).
 */
export async function requestAppLogin(email: string): Promise<{ ok: true; previewUrl: string | null } | { ok: false; error: string }> {
  const clean = email.trim().toLowerCase();
  if (!EMAIL.test(clean)) return { ok: false, error: "Cette adresse e-mail ne semble pas valide." };
  const url = publicUrl(`/app/connexion/${sealToken(LOGIN_PURPOSE, { e: clean }, LOGIN_TTL_MS)}`);
  const text = `Bonjour,\n\nVoici votre lien pour ouvrir l'appli PharmaBoost (valable 30 minutes) :\n${url}\n\nSi vous n'avez rien demandé, ignorez ce message.\n\nPharmaBoost`;
  const html = `<p>Bonjour,</p><p>Voici votre lien pour ouvrir l'appli PharmaBoost (valable 30 minutes) :</p><p><a href="${url}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#0E8A7B;color:#fff;font-weight:700;text-decoration:none">Ouvrir PharmaBoost</a></p><p style="color:#64748b;font-size:13px">Si vous n'avez rien demandé, ignorez ce message.</p>`;
  try {
    await getMessagingProvider().sendEmail({ to: clean, fromName: "PharmaBoost", subject: "Votre lien PharmaBoost", text, html });
  } catch (error) {
    console.error("[appli patients] envoi du lien de connexion", error);
    if (process.env.NODE_ENV === "production") return { ok: false, error: "Le lien n'a pas pu être envoyé. Réessayez dans un instant." };
  }
  return { ok: true, previewUrl: process.env.NODE_ENV === "production" ? null : url };
}

/** Le lien de connexion ouvert : l'inscrit est créé à la première fois ; renvoie le jeton de session à poser en cookie. */
export async function openAppLogin(token: string): Promise<string | null> {
  const payload = openToken<{ e?: unknown }>(LOGIN_PURPOSE, token);
  const email = typeof payload?.e === "string" ? payload.e : null;
  if (!email || !EMAIL.test(email)) return null;
  const emailHash = hashEmail(email);
  const member = await prisma.appMember.upsert({
    where: { emailHash },
    create: { emailHash, emailCipher: encryptField(email) ?? "", emailMasked: maskEmail(email), lastSeenAt: new Date() },
    update: { lastSeenAt: new Date() },
    select: { id: true },
  });
  return sealToken(SESSION_PURPOSE, { m: member.id }, APP_SESSION_TTL_MS);
}

/** L'inscrit de ce jeton de session, ou rien. */
export async function memberFromSession(token: string | null | undefined): Promise<AppMemberView | null> {
  if (!token) return null;
  const payload = openToken<{ m?: unknown }>(SESSION_PURPOSE, token);
  if (typeof payload?.m !== "string") return null;
  const row = await prisma.appMember.findUnique({ where: { id: payload.m }, select: MEMBER_SELECT });
  return row ? view(row as MemberRow) : null;
}

/** L'adresse de l'inscrit, en clair, pour lui écrire (jamais affichée ailleurs que masquée). */
export async function memberEmail(memberId: string): Promise<string | null> {
  const row = await prisma.appMember.findUnique({ where: { id: memberId }, select: { emailCipher: true } });
  return row ? decryptField(row.emailCipher) : null;
}

// ---------------------------------------------------------------- Ma pharmacie

/** L'inscrit choisit sa pharmacie PharmaBoost : sa demande « hors réseau » éventuelle est retirée. */
export async function chooseHomePharmacy(memberId: string, pharmacyId: string): Promise<{ ok: boolean; error?: string }> {
  const pharmacy = await prisma.pharmacy.findFirst({ where: { id: pharmacyId, isActive: true, isDemo: false }, select: { id: true } });
  if (!pharmacy) return { ok: false, error: "Cette pharmacie n'est pas dans le réseau PharmaBoost." };
  await prisma.$transaction([
    prisma.appMember.update({ where: { id: memberId }, data: { homePharmacyId: pharmacy.id } }),
    prisma.pharmacyJoinRequest.deleteMany({ where: { memberId } }),
  ]);
  return { ok: true };
}

/** « Ma pharmacie n'est pas PharmaBoost » : la pharmacie déclarée, et s'il veut qu'elle rejoigne le réseau. */
export async function declareOutsidePharmacy(memberId: string, input: JoinRequestInput & { wantsJoin: boolean }): Promise<{ ok: boolean; error?: string }> {
  const checked = validateJoinRequest(input);
  if (!checked.ok) return { ok: false, error: checked.error };
  const data = { ...checked.value, key: joinRequestKey(checked.value.pharmacyName, checked.value.postalCode), wantsJoin: input.wantsJoin };
  await prisma.$transaction([
    prisma.pharmacyJoinRequest.upsert({ where: { memberId }, create: { memberId, ...data }, update: { ...data, handledAt: null, handledNote: null } }),
    prisma.appMember.update({ where: { id: memberId }, data: { homePharmacyId: null } }),
  ]);
  return { ok: true };
}

export async function setOffersConsent(memberId: string, on: boolean): Promise<void> {
  await prisma.appMember.update({ where: { id: memberId }, data: { offersConsentAt: on ? new Date() : null } });
}

// ---------------------------------------------------------------- PharmaBoost+

/**
 * L'abonnement PharmaBoost+ (2,99 € par mois). Le paiement n'est pas encore branché (choix du mode de paiement, Apple et
 * Google, validation juridique) : l'activation n'est ouverte que dans l'aperçu, pour essayer le parcours.
 */
export const PLUS_PAYMENT_READY = false;

export async function activatePlusPreview(memberId: string): Promise<{ ok: boolean; error?: string }> {
  if (PLUS_PAYMENT_READY || process.env.NODE_ENV === "production") return { ok: false, error: "L'abonnement ouvre bientôt." };
  await prisma.appMember.update({ where: { id: memberId }, data: { plan: "PLUS", plusSince: new Date() } });
  return { ok: true };
}

export async function cancelPlus(memberId: string): Promise<void> {
  await prisma.appMember.update({ where: { id: memberId }, data: { plan: "FREE", plusSince: null } });
}

// ---------------------------------------------------------------- Mes offres

export type MemberOffer = {
  id: string;
  funding: "PHARMACY" | "LAB";
  title: string;
  rangeLabel: string;
  discountPercent: number;
  details: string | null;
  endsAt: Date;
  where: string;
  access: "locked" | "open";
  code: { code: string; redeemedAt: Date | null } | null;
};

/** Les offres en cours que l'inscrit voit : celles de sa pharmacie, puis celles des laboratoires (tout le réseau). */
export async function listMemberOffers(member: AppMemberView, now = new Date()): Promise<MemberOffer[]> {
  const rows = await prisma.patientOffer.findMany({
    where: {
      status: "ACTIVE",
      startsAt: { lte: now },
      endsAt: { gte: now },
      OR: [{ funding: "LAB" }, ...(member.homePharmacy ? [{ funding: "PHARMACY" as const, pharmacyId: member.homePharmacy.id }] : [])],
    },
    orderBy: [{ funding: "desc" }, { endsAt: "asc" }],
    take: 50,
    select: {
      id: true, funding: true, pharmacyId: true, title: true, rangeLabel: true, discountPercent: true, details: true, audience: true, status: true, startsAt: true, endsAt: true,
      pharmacy: { select: { name: true } },
      partner: { select: { name: true } },
      codes: { where: { memberId: member.id }, select: { code: true, redeemedAt: true } },
    },
  });
  const out: MemberOffer[] = [];
  for (const row of rows) {
    const access = offerAccess(row, { plan: member.plan, homePharmacyId: member.homePharmacy?.id ?? null }, now);
    if (access === "hidden") continue;
    out.push({
      id: row.id,
      funding: row.funding,
      title: row.title,
      rangeLabel: row.rangeLabel,
      discountPercent: row.discountPercent,
      details: row.details,
      endsAt: row.endsAt,
      where: row.funding === "LAB" ? "Dans toutes les pharmacies PharmaBoost" : `Chez ${row.pharmacy?.name ?? "votre pharmacie"}`,
      access,
      code: access === "open" ? (row.codes[0] ?? null) : null,
    });
  }
  // Celles de la pharmacie d'abord : c'est elle qui fait revenir le patient.
  return out.sort((a, b) => (a.funding === b.funding ? 0 : a.funding === "PHARMACY" ? -1 : 1));
}

/** Le code de l'inscrit pour cette offre : créé à la première demande, toujours le même ensuite. */
export async function issueOfferCode(member: AppMemberView, offerId: string, now = new Date()): Promise<{ ok: true; code: string; redeemedAt: Date | null } | { ok: false; error: string }> {
  const offer = await prisma.patientOffer.findUnique({ where: { id: offerId }, select: { funding: true, pharmacyId: true, audience: true, status: true, startsAt: true, endsAt: true } });
  if (!offer) return { ok: false, error: "Cette offre n'existe plus." };
  const access = offerAccess(offer, { plan: member.plan, homePharmacyId: member.homePharmacy?.id ?? null }, now);
  if (access === "hidden") return { ok: false, error: "Cette offre n'est plus disponible." };
  if (access === "locked") return { ok: false, error: "Offre réservée aux abonnés PharmaBoost+." };
  const existing = await prisma.patientOfferCode.findUnique({ where: { offerId_memberId: { offerId, memberId: member.id } }, select: { code: true, redeemedAt: true } });
  if (existing) return { ok: true, ...existing };
  // Un code unique : en cas de collision (rarissime), on retire un nouveau tirage.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeOfferCode(String(randomInt(0, 100_000_000)).padStart(8, "0"));
    try {
      const created = await prisma.patientOfferCode.create({ data: { offerId, memberId: member.id, code }, select: { code: true, redeemedAt: true } });
      return { ok: true, ...created };
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      const raced = await prisma.patientOfferCode.findUnique({ where: { offerId_memberId: { offerId, memberId: member.id } }, select: { code: true, redeemedAt: true } });
      if (raced) return { ok: true, ...raced };
    }
  }
  return { ok: false, error: "Le code n'a pas pu être créé. Réessayez." };
}

/** L'état du code de l'inscrit (l'écran le relit pour passer à « Offre utilisée ✓ » dès le bip au comptoir). */
export async function offerCodeState(memberId: string, offerId: string): Promise<{ redeemedAt: Date | null; pharmacyName: string | null } | null> {
  const row = await prisma.patientOfferCode.findUnique({ where: { offerId_memberId: { offerId, memberId } }, select: { redeemedAt: true, redeemedPharmacyId: true } });
  if (!row) return null;
  const pharmacy = row.redeemedPharmacyId ? await prisma.pharmacy.findUnique({ where: { id: row.redeemedPharmacyId }, select: { name: true } }) : null;
  return { redeemedAt: row.redeemedAt, pharmacyName: pharmacy?.name ?? null };
}

// ---------------------------------------------------------------- Au comptoir

export type OfferRedemption =
  | { kind: "not-offer" }
  | { kind: "redeemed"; message: string }
  | { kind: "refused"; message: string };

/**
 * Un code bipé au comptoir : si c'est un code d'offre, il est utilisé (une seule fois, dans une pharmacie où il vaut) et le
 * bip ne va pas plus loin ; sinon (« not-offer »), le bip suit son chemin habituel — une étiquette interne de la pharmacie
 * peut porter le même préfixe.
 */
export async function redeemOfferCodeAtCounter(pharmacyId: string, code: string, post: string, now = new Date()): Promise<OfferRedemption> {
  if (!isOfferCode(code)) return { kind: "not-offer" };
  const row = await prisma.patientOfferCode.findUnique({
    where: { code },
    select: { id: true, redeemedAt: true, offer: { select: { funding: true, pharmacyId: true, status: true, startsAt: true, endsAt: true, discountPercent: true, rangeLabel: true } } },
  });
  if (!row) return { kind: "not-offer" };
  const label = `-${row.offer.discountPercent} % ${row.offer.rangeLabel}`;
  if (row.redeemedAt) return { kind: "refused", message: `Offre PharmaBoost déjà utilisée (${label}).` };
  if (!offerIsLive(row.offer, now)) return { kind: "refused", message: `Offre PharmaBoost terminée (${label}).` };
  if (!codeValidAt(row.offer, pharmacyId)) return { kind: "refused", message: `Offre PharmaBoost d'une autre pharmacie (${label}).` };
  const won = await prisma.patientOfferCode.updateMany({ where: { id: row.id, redeemedAt: null }, data: { redeemedAt: now, redeemedPharmacyId: pharmacyId, redeemedPost: post.slice(0, 60) } });
  if (won.count === 0) return { kind: "refused", message: `Offre PharmaBoost déjà utilisée (${label}).` };
  return { kind: "redeemed", message: `Offre PharmaBoost validée : ${label} — faites la remise en caisse.` };
}
