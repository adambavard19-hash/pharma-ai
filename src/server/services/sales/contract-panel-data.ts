import "server-only";
import { prisma } from "@/server/db/client";
import { missingContractFields } from "@/core/contracts/requirements";
import type { ContractPanelData } from "@/components/sales/contract-panel";
import type { ProspectDetailData } from "@/components/sales/prospect-detail";

/** Les données du panneau contrat : ce qui manque, l'offre applicable, le dernier contrat. */
export async function contractPanelData(prospect: ProspectDetailData): Promise<ContractPanelData> {
  const offer = prospect.plan ?? (await prisma.plan.findFirst({ where: { isActive: true, isDefault: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, monthlyPriceCents: true, trialDays: true } }));
  const latest = prospect.contracts[0] ?? null;
  return {
    id: prospect.id,
    blocked: Boolean(prospect.blockedAt),
    pharmacyId: prospect.pharmacyId,
    values: {
      name: prospect.name,
      legalName: prospect.legalName ?? "",
      siret: prospect.siret ?? "",
      addressLine1: prospect.addressLine1 ?? "",
      postalCode: prospect.postalCode ?? "",
      city: prospect.city ?? "",
      ownerName: prospect.ownerName ?? "",
      ownerTitle: prospect.ownerTitle ?? "",
      email: prospect.email ?? "",
    },
    missing: missingContractFields(prospect),
    offer: offer ? { planId: offer.id, name: offer.name, monthlyPriceCents: offer.monthlyPriceCents, trialDays: offer.trialDays } : null,
    monthlyPriceCents: prospect.monthlyPriceCents,
    contract: latest ? { id: latest.id, version: latest.version, status: latest.status, providerEnvelopeId: latest.providerEnvelopeId, signedArchivedAt: latest.signedArchivedAt?.toISOString() ?? null } : null,
  };
}
