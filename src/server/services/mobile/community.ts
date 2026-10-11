import "server-only";
import { prisma } from "@/server/db/client";

/**
 * La « Communauté PharmaBoost » : l'organisation unique qui porte les comptes gratuits de PharmaBoost Mobile.
 *
 * Elle n'a aucune officine ; ses membres n'ont aucun rattachement (Membership). C'est ce qui les tient hors du
 * comptoir (`getSession` exige un rattachement actif) tout en leur laissant un compte complet, avec le même mot de
 * passe, la même table de sessions et le même cookie que tout le monde.
 *
 * La migration 20261027090000_mobile_fondations la crée ; ce module la recrée au besoin (base neuve, essais), à
 * l'identique, sans jamais en créer une deuxième (clé : le slug).
 */
export const COMMUNITY_ORGANIZATION_SLUG = "communaute-pharmaboost";
export const COMMUNITY_ORGANIZATION_NAME = "Communauté PharmaBoost";

let cachedId: string | null = null;

export async function ensureCommunityOrganization(): Promise<string> {
  if (cachedId) return cachedId;
  const organization = await prisma.organization.upsert({
    where: { slug: COMMUNITY_ORGANIZATION_SLUG },
    update: { kind: "COMMUNITY" },
    create: { slug: COMMUNITY_ORGANIZATION_SLUG, name: COMMUNITY_ORGANIZATION_NAME, kind: "COMMUNITY" },
    select: { id: true },
  });
  cachedId = organization.id;
  return organization.id;
}

/** Pour les essais : oublie l'identifiant mémorisé. */
export function resetCommunityOrganizationCache(): void {
  cachedId = null;
}
