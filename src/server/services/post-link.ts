import "server-only";
import { cache } from "react";
import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { getEnv } from "@/config/env";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { generateToken, hashToken, safeCompare } from "@/server/security/tokens";
import { takeComptoirOnThisPc } from "@/server/services/comptoirs";
import { isPostLinkToken, parsePostLinkCookie, POST_LINK_COOKIE, POST_LINK_TTL_MS, postLinkPayload, shouldTakeLinkedPost, type PostLink } from "@/core/counter/post-link";
import { robotLivesOnLinkedPost } from "@/core/robot/single-robot";

/**
 * Le lien navigateur ↔ poste, côté serveur (règles : core/counter/post-link.ts) : émettre le lien à usage unique pour un
 * poste authentifié, le brûler à l'ouverture, signer et relire le cookie, et — à chaque page de l'espace — attribuer le
 * poste lié à la personne connectée et dire si le robot du logiciel installé vit déjà sur ce PC.
 */

/** Un lien neuf pour ce poste : il remplace le précédent. Null : poste introuvable, retiré ou pas encore relié. */
export async function issuePostLink(postId: string, now = new Date()): Promise<{ token: string; expiresAt: Date } | null> {
  const token = generateToken(32);
  const expiresAt = new Date(now.getTime() + POST_LINK_TTL_MS);
  const written = await prisma.counterPost.updateMany({ where: { id: postId, revokedAt: null, pairedAt: { not: null } }, data: { linkTokenHash: hashToken(token), linkExpiresAt: expiresAt } });
  if (written.count !== 1) return null;
  return { token, expiresAt };
}

/**
 * Ouvre un lien : il est brûlé (effacé de la base) avant toute autre chose, qu'il soit encore valable ou non — jamais deux
 * fois, même par deux ouvertures simultanées (seule l'écriture qui l'efface compte). Null : inconnu, déjà servi, expiré,
 * poste retiré.
 */
export async function consumePostLink(token: unknown, now = new Date()): Promise<PostLink | null> {
  if (!isPostLinkToken(token)) return null;
  const hash = hashToken(token);
  const post = await prisma.counterPost.findUnique({ where: { linkTokenHash: hash }, select: { id: true, pharmacyId: true, revokedAt: true, pairedAt: true, linkExpiresAt: true } });
  if (!post) return null;
  const burnt = await prisma.counterPost.updateMany({ where: { id: post.id, linkTokenHash: hash }, data: { linkTokenHash: null, linkExpiresAt: null } });
  if (burnt.count !== 1) return null;
  if (post.revokedAt || !post.pairedAt || !post.linkExpiresAt || post.linkExpiresAt.getTime() <= now.getTime()) return null;
  await recordAudit({ action: "counter_post.linked", entityType: "CounterPost", entityId: post.id, pharmacyId: post.pharmacyId }).catch(() => undefined);
  return { postId: post.id, pharmacyId: post.pharmacyId };
}

const sign = (payload: string) => createHmac("sha256", getEnv().AUTH_SESSION_SECRET).update(`poste-lie:${payload}`).digest("base64url");

/** La valeur du cookie : le poste, sa pharmacie, et la signature qui les couvre. */
export function signPostLinkCookie(link: PostLink): string {
  const payload = postLinkPayload(link);
  if (!payload) throw new Error("Poste ou pharmacie illisible.");
  return `${payload}.${sign(payload)}`;
}

/** Le poste que désigne le cookie, si sa signature est la nôtre ; sinon null (cookie absent, abîmé ou falsifié). */
export function readPostLinkCookie(value: string | null | undefined): PostLink | null {
  const parsed = parsePostLinkCookie(value);
  if (!parsed || !safeCompare(parsed.signature, sign(parsed.payload))) return null;
  return { postId: parsed.postId, pharmacyId: parsed.pharmacyId };
}

export type ThisPc = {
  /** Le poste auquel ce navigateur est lié, dans la pharmacie de la session ; null : aucun (ou pas valable ici). */
  postId: string | null;
  /** Vrai : le logiciel installé sur ce PC dessine le robot ; l'espace n'en dessine pas un second. */
  robotOnPost: boolean;
};

export const NOT_LINKED: ThisPc = { postId: null, robotOnPost: false };

/**
 * Ce navigateur est-il celui d'un poste de la pharmacie de la session ? Si oui, le poste revient à la personne connectée
 * (si elle prend des ventes et qu'il n'est pas déjà à elle), et l'on dit si le robot du logiciel installé y vit. Sans
 * cookie (Mac, téléphone, PC du bureau) : aucune requête. Avec : UNE requête bornée à la pharmacie de la session, plus
 * l'attribution quand elle change. Une fois par requête (la coquille et « Nouvelle vente » la partagent : l'écran lit
 * l'attribution déjà faite). Une erreur (base indisponible, colonne absente avant la migration) : pas de lien.
 */
export const thisPcComptoir = cache(async (pharmacyId: string, userId: string, canTakeSales: boolean): Promise<ThisPc> => {
  try {
    const link = readPostLinkCookie((await cookies()).get(POST_LINK_COOKIE)?.value);
    if (!link || link.pharmacyId !== pharmacyId) return NOT_LINKED;
    const post = await prisma.counterPost.findFirst({
      where: { id: link.postId, pharmacyId },
      select: { pharmacyId: true, revokedAt: true, pairedAt: true, assignedUserId: true, robotShownAt: true },
    });
    if (!post || post.revokedAt || !post.pairedAt) return NOT_LINKED;
    if (shouldTakeLinkedPost({ sessionPharmacyId: pharmacyId, userId, canTakeSales, link, post })) await takeComptoirOnThisPc({ pharmacyId, userId }, link.postId);
    return { postId: link.postId, robotOnPost: robotLivesOnLinkedPost({ sessionPharmacyId: pharmacyId, link, post, now: new Date() }) };
  } catch {
    return NOT_LINKED;
  }
});

/**
 * Déconnexion sur le navigateur lié à un poste : la personne quitte CE comptoir, qui redevient libre — ses prochains bips
 * ne lui sont plus attribués, la personne suivante le reprend en ouvrant son espace. Seulement ce poste, seulement s'il
 * est à elle, seulement dans la pharmacie de la session ; le lien du navigateur, lui, reste. Sans cookie (Mac, téléphone,
 * PC du bureau) : rien. Une erreur ne bloque jamais la déconnexion.
 */
export async function leaveThisPcComptoir(pharmacyId: string, userId: string): Promise<void> {
  try {
    const link = readPostLinkCookie((await cookies()).get(POST_LINK_COOKIE)?.value);
    if (!link || link.pharmacyId !== pharmacyId) return;
    const left = await prisma.counterPost.updateMany({ where: { id: link.postId, pharmacyId, assignedUserId: userId }, data: { assignedUserId: null } });
    if (left.count === 1) await recordAudit({ action: "counter_post.released", entityType: "CounterPost", entityId: link.postId, pharmacyId, userId, metadata: { via: "deconnexion" } });
  } catch {
    // La déconnexion passe toujours.
  }
}
