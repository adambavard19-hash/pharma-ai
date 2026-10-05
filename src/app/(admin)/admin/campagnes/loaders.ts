import "server-only";
import { prisma } from "@/server/db/client";

/**
 * Les deux lectures que les écrans des campagnes font en plus des services de
 * campagne : les listes à choisir pour une sélection manuelle, et les
 * officines à qui un bonus a réellement été annoncé. Bornées, sans donnée
 * clinique : des noms d'officines et de partenaires.
 */

/** Une sélection manuelle se choisit dans une liste bornée : au-delà, on affine la recherche. */
export const SELECTION_LIMIT = 500;
/** La liste « à appliquer » d'un bonus : bornée aussi ; au-delà, la liste des destinataires fait foi. */
export const BONUS_LIST_LIMIT = 300;

export type PharmacyOption = { id: string; name: string; city: string | null };
export type PartnerOption = { id: string; name: string };

/** Les mêmes critères que le public « toutes les officines actives » et « contacts des partenaires » : on ne propose que ce qui peut recevoir. */
const PHARMACY_WHERE = { isDemo: false, isActive: true } as const;
const PARTNER_OUT = ["ARCHIVED", "SUSPENDED"] as const;

/**
 * Les officines et partenaires proposés à la sélection manuelle. Ceux déjà
 * choisis par la campagne (en modification) y sont toujours, même au-delà de la
 * borne ou devenus inactifs, pour ne jamais en perdre un sans le dire.
 */
export async function loadSelectionOptions(selected: { pharmacyIds: string[]; partnerIds: string[] }): Promise<{ pharmacies: PharmacyOption[]; partners: PartnerOption[]; truncated: { pharmacies: boolean; partners: boolean } }> {
  const [pharmacyRows, partnerRows] = await Promise.all([
    prisma.pharmacy.findMany({ where: PHARMACY_WHERE, orderBy: [{ name: "asc" }, { id: "asc" }], take: SELECTION_LIMIT + 1, select: { id: true, name: true, city: true } }),
    prisma.partner.findMany({ where: { status: { notIn: [...PARTNER_OUT] } }, orderBy: [{ name: "asc" }, { id: "asc" }], take: SELECTION_LIMIT + 1, select: { id: true, name: true } }),
  ]);
  const pharmacies = pharmacyRows.slice(0, SELECTION_LIMIT);
  const partners = partnerRows.slice(0, SELECTION_LIMIT);

  const missingPharmacies = selected.pharmacyIds.filter((id) => !pharmacies.some((p) => p.id === id));
  const missingPartners = selected.partnerIds.filter((id) => !partners.some((p) => p.id === id));
  const [extraPharmacies, extraPartners] = await Promise.all([
    missingPharmacies.length ? prisma.pharmacy.findMany({ where: { id: { in: missingPharmacies } }, select: { id: true, name: true, city: true } }) : [],
    missingPartners.length ? prisma.partner.findMany({ where: { id: { in: missingPartners } }, select: { id: true, name: true } }) : [],
  ]);

  return {
    pharmacies: [...pharmacies, ...extraPharmacies],
    partners: [...partners, ...extraPartners],
    truncated: { pharmacies: pharmacyRows.length > SELECTION_LIMIT, partners: partnerRows.length > SELECTION_LIMIT },
  };
}

/**
 * Les officines auxquelles le message d'une offre bonus est réellement parti
 * (« envoyé », jamais « simulé » : un message qui n'est pas parti ne promet
 * aucun bonus). C'est la liste que l'équipe applique à la main.
 */
export async function loadBonusRecipients(campaignId: string): Promise<{ rows: { id: string; pharmacyId: string; name: string | null }[]; truncated: boolean }> {
  const rows = await prisma.campaignRecipient.findMany({
    where: { campaignId, status: "SENT", pharmacyId: { not: null } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: BONUS_LIST_LIMIT + 1,
    select: { id: true, pharmacyId: true, name: true },
  });
  return {
    rows: rows.slice(0, BONUS_LIST_LIMIT).flatMap((row) => (row.pharmacyId ? [{ id: row.id, pharmacyId: row.pharmacyId, name: row.name }] : [])),
    truncated: rows.length > BONUS_LIST_LIMIT,
  };
}
