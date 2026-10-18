import "server-only";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/server/db/client";
import { withAdvisoryLock } from "@/server/db/advisory-lock";
import { getStorageProvider } from "@/server/ai/registry";
import { getSignatureProvider } from "@/server/signature/registry";
import { recordAudit } from "@/server/audit/log";
import { affiliateContractReference, AFFILIATE_CONTRACT_TEMPLATE_KEY, buildAffiliateContractDocument, currentAffiliateTerms } from "@/core/contracts/affiliate-template";
import { resolveContractAmounts } from "@/core/contracts/amounts";
import { nextSignatureState } from "@/core/contracts/countersignature";
import { renderContractPdf } from "@/core/contracts/pdf";
import { signatureFieldPlacement } from "@/core/contracts/layout";
import { companyPartyOf } from "@/core/contracts/snapshot";
import { missingCompanyFields } from "@/core/contracts/requirements";
import { signedContractKey, type SignatureEvent, type SignatureSigner, type SignatureStatus } from "@/core/signature";
import { notifyAdmins, notifySalesRep } from "./notifications";
import { loadCountersigner } from "./countersigner";

/**
 * Les contrats d'affiliation (18 oct. 2026) : générés depuis la console,
 * signés par l'affilié puis contresignés par PharmaBoost (le fondateur), via
 * le même prestataire de signature que les contrats des pharmacies. Un contrat
 * n'est « signé » qu'avec les deux signatures (`nextSignatureState`).
 *
 * Rien n'est simulé : sans prestataire configuré, le contrat reste un
 * brouillon (PDF consultable dans la console) et l'écran le dit.
 */

const LINK_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const IN_PROGRESS = ["SENT", "OPENED", "SIGNED_PHARMACY", "SIGNED_COMPANY"];

export type AffiliateContractResult =
  | { ok: true; outcome: "SENT" | "DRAFT_NO_PROVIDER" | "ALREADY_IN_PROGRESS" | "ALREADY_SIGNED"; contractId: string; message: string }
  | { ok: false; error: string };

/**
 * Prépare et envoie le contrat d'affiliation d'un affilié. Idempotent : un
 * contrat en cours ou signé n'est jamais doublé ; un brouillon est repris.
 */
export async function sendAffiliateContract(salesRepId: string, admin: { id: string; label: string }): Promise<AffiliateContractResult> {
  return withAdvisoryLock(`affiliate-contract:${salesRepId}`, () => sendAffiliateContractLocked(salesRepId, admin));
}

async function sendAffiliateContractLocked(salesRepId: string, admin: { id: string; label: string }): Promise<AffiliateContractResult> {
  const rep = await prisma.salesRep.findUnique({ where: { id: salesRepId }, include: { affiliateContracts: { orderBy: { version: "desc" }, take: 1 } } });
  if (!rep) return { ok: false, error: "Affilié introuvable." };
  if (!rep.isActive) return { ok: false, error: "Cet affilié est désactivé : réactivez-le avant de lui envoyer un contrat." };
  const last = rep.affiliateContracts[0];
  if (last?.status === "FINALIZED") return { ok: true, outcome: "ALREADY_SIGNED", contractId: last.id, message: "Le contrat d'affiliation est déjà signé par les deux parties." };
  if (last && IN_PROGRESS.includes(last.status)) return { ok: true, outcome: "ALREADY_IN_PROGRESS", contractId: last.id, message: "Un contrat d'affiliation est déjà en cours de signature : aucun nouvel envoi." };

  const contract = last?.status === "DRAFT" ? last : await generateAffiliateContract(rep, admin.id, (last?.version ?? 0) + 1);
  if ("error" in contract) return { ok: false, error: contract.error };

  const provider = getSignatureProvider();
  if (provider.info.capability !== "LIVE") {
    return { ok: true, outcome: "DRAFT_NO_PROVIDER", contractId: contract.id, message: "Contrat généré (brouillon). Aucun prestataire de signature n'est configuré : il ne peut pas encore être envoyé pour signature." };
  }

  const pdf = await getStorageProvider().read(contract.fileKey);
  if (!pdf) return { ok: false, error: "Le PDF du contrat est introuvable dans le stockage." };
  const pageCount = (await PDFDocument.load(pdf, { updateMetadata: false })).getPageCount();
  const [cFirst, ...cRest] = contract.companySignerName.split(/\s+/);
  const expiresAt = new Date(Date.now() + LINK_TTL_MS);
  try {
    const envelope = await provider.createEnvelope({
      reference: contract.reference,
      title: "Contrat d'affiliation PharmaBoost",
      pdf,
      signers: [
        // L'affilié signe en premier ; le prestataire lui écrit directement. PharmaBoost contresigne ensuite.
        { role: "AFFILIATE", firstName: rep.firstName, lastName: rep.lastName || rep.firstName, email: contract.affiliateSignerEmail, phone: rep.phone, field: signatureFieldPlacement(0, 2, pageCount) },
        { role: "COMPANY", firstName: cFirst, lastName: cRest.join(" ") || cFirst, email: contract.companySignerEmail, field: signatureFieldPlacement(1, 2, pageCount) },
      ],
      expiresAt,
    });
    await prisma.affiliateContract.update({
      where: { id: contract.id },
      data: { status: "SENT", sentAt: new Date(), expiresAt, providerEnvelopeId: envelope.envelopeId, affiliateSigningUrl: envelope.signingUrls.AFFILIATE ?? null, companySigningUrl: envelope.signingUrls.COMPANY ?? null, signatureProvider: provider.info.id },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Le prestataire de signature a refusé la demande.";
    await recordAudit({ action: "sales.contract_event", entityType: "AffiliateContract", entityId: contract.id, platformAdminId: admin.id, metadata: { signature: "failed", reason: message } });
    return { ok: false, error: `Le prestataire de signature n'a pas accepté la demande (${message}). Le contrat reste en brouillon : réessayez dans quelques minutes.` };
  }
  await recordAudit({ action: "sales.contract_sent", entityType: "AffiliateContract", entityId: contract.id, platformAdminId: admin.id, metadata: { signatureProvider: provider.info.id, salesRepId } });
  await notifySalesRep({ salesRepId, type: "AFFILIATE_CONTRACT_SENT", title: "Votre contrat d'affiliation est à signer", body: `${provider.info.label} vous a envoyé le contrat par e-mail (${contract.affiliateSignerEmail}). PharmaBoost le contresignera ensuite.`, severity: "INFO" });
  return { ok: true, outcome: "SENT", contractId: contract.id, message: `Contrat d'affiliation envoyé à ${contract.affiliateSignerEmail} via ${provider.info.label}. PharmaBoost (${contract.companySignerEmail}) contresignera après l'affilié.` };
}

async function generateAffiliateContract(rep: { id: string; firstName: string; lastName: string; email: string; phone: string | null; zone: string | null }, adminId: string, version: number) {
  const [company, plan, countersigner] = await Promise.all([
    prisma.companyProfile.findUnique({ where: { id: "default" } }),
    prisma.plan.findFirst({ where: { isActive: true, isDefault: true }, orderBy: { createdAt: "asc" }, select: { monthlyPriceCents: true, setupFeeCents: true } }),
    loadCountersigner(),
  ]);
  const missing = missingCompanyFields(company);
  if (!company || missing.length) return { error: `La fiche de la société exploitante est incomplète (${missing.join(", ")}) : complétez-la (Console → Société) avant tout contrat.` };
  const startDate = new Date();
  const terms = currentAffiliateTerms(resolveContractAmounts(plan).monthlyPriceCents, startDate);
  const reference = affiliateContractReference(rep.lastName, version, startDate.getFullYear());
  const document = buildAffiliateContractDocument({ reference, company: companyPartyOf(company), affiliate: rep, terms, countersigner });
  const pdf = await renderContractPdf(document);
  const fileKey = `plateforme/contrats-affilies/${rep.id}/${reference}.pdf`;
  await getStorageProvider().put(fileKey, pdf, "application/pdf");
  const contract = await prisma.affiliateContract.create({
    data: {
      salesRepId: rep.id,
      version,
      status: "DRAFT",
      templateKey: AFFILIATE_CONTRACT_TEMPLATE_KEY,
      fileKey,
      reference,
      termsSnapshot: terms,
      affiliateSignerName: `${rep.firstName} ${rep.lastName}`.trim(),
      affiliateSignerEmail: rep.email,
      companySignerName: countersigner.name,
      companySignerEmail: countersigner.email,
      createdByAdminId: adminId,
    },
  });
  await recordAudit({ action: "sales.contract_generated", entityType: "AffiliateContract", entityId: contract.id, platformAdminId: adminId, metadata: { salesRepId: rep.id, reference, templateKey: AFFILIATE_CONTRACT_TEMPLATE_KEY } });
  return contract;
}

// ---------------------------------------------------------------------------
// Statuts de signature
// ---------------------------------------------------------------------------

/**
 * Applique un statut au contrat d'affiliation selon la règle de la double
 * signature. Conditionnel et idempotent : un événement rejoué ou en retard ne
 * change rien.
 */
export async function applyAffiliateSignatureStatus(contractId: string, announced: SignatureStatus, options: { role?: SignatureSigner["role"]; reason?: string | null; occurredAt?: Date; actorLabel: string }): Promise<boolean> {
  const contract = await prisma.affiliateContract.findUnique({ where: { id: contractId } });
  if (!contract) return false;
  const now = options.occurredAt ?? new Date();
  const next = nextSignatureState({ status: contract.status, firstPartySignedAt: contract.affiliateSignedAt, companySignedAt: contract.companySignedAt }, { status: announced, role: options.role, occurredAt: now });
  if (!next || next.status === "DRAFT") return false;
  const status = next.status;
  const data: Record<string, unknown> = { status, affiliateSignedAt: next.firstPartySignedAt, companySignedAt: next.companySignedAt };
  if (status === "OPENED") data.openedAt = contract.openedAt ?? now;
  if (status === "FINALIZED") data.finalizedAt = new Date();
  if (status === "REFUSED") {
    data.refusedAt = new Date();
    data.refusalReason = options.reason ?? null;
  }
  const won = await prisma.affiliateContract.updateMany({ where: { id: contractId, status: contract.status }, data });
  if (won.count === 0) return false;
  await recordAudit({ action: "sales.contract_event", entityType: "AffiliateContract", entityId: contractId, metadata: { status, announced, role: options.role ?? null, actor: options.actorLabel } });

  const who = contract.affiliateSignerName;
  if (status === "SIGNED_PHARMACY") {
    await notifyAdmins({ type: "AFFILIATE_CONTRACT_SIGNED", title: `Contrat d'affiliation signé par ${who}`, body: `À contresigner par PharmaBoost (${contract.companySignerEmail}) : Console → Finances → Contrats → « À contresigner par moi ».`, linkUrl: "/admin/contrats?statut=a-contresigner", severity: "SUCCESS" });
  }
  if (status === "FINALIZED") {
    const archived = await archiveAffiliateSignedPdf(contractId);
    await notifyAdmins({ type: "AFFILIATE_CONTRACT_FINALIZED", title: `Contrat d'affiliation signé par les deux parties — ${who}`, body: archived ? "PDF signé archivé." : "PDF signé NON archivé (Actualiser chez le prestataire).", linkUrl: "/admin/contrats", severity: "SUCCESS" });
    await notifySalesRep({ salesRepId: contract.salesRepId, type: "AFFILIATE_CONTRACT_FINALIZED", title: "Votre contrat d'affiliation est signé", body: "PharmaBoost l'a contresigné : le contrat est en vigueur.", severity: "SUCCESS" });
  }
  if (status === "REFUSED" || status === "EXPIRED") {
    await notifyAdmins({ type: `AFFILIATE_CONTRACT_${status}`, title: `Contrat d'affiliation ${status === "REFUSED" ? "refusé" : "expiré"} — ${who}`, body: options.reason ?? "", linkUrl: "/admin/contrats", severity: "WARNING" });
  }
  return true;
}

/**
 * Notification du prestataire pour un contrat d'affiliation. `null` : aucune
 * enveloppe d'affiliation ne correspond (le webhook continue ailleurs).
 */
export async function handleAffiliateSignatureEvent(event: SignatureEvent): Promise<boolean | null> {
  const contract = await prisma.affiliateContract.findUnique({ where: { providerEnvelopeId: event.envelopeId }, select: { id: true, status: true, affiliateSignedAt: true, companySignedAt: true } });
  if (!contract) return null;
  const trace = (outcome: string, status?: string) =>
    recordAudit({ action: "sales.signature_webhook", entityType: "AffiliateContract", entityId: contract.id, metadata: { envelopeId: event.envelopeId, announced: event.status, role: event.role ?? null, applied: status ?? null, verified: event.verified, outcome } });
  if (contract.status === "FINALIZED") {
    await trace("already_finalized");
    return true;
  }
  const status = event.verified ? event.status : await getSignatureProvider().getStatus(event.envelopeId);
  const role = event.verified ? event.role : undefined;
  if (!nextSignatureState({ status: contract.status, firstPartySignedAt: contract.affiliateSignedAt, companySignedAt: contract.companySignedAt }, { status, role, occurredAt: event.occurredAt })) {
    await trace("ignored_not_forward", status);
    return true;
  }
  const applied = await applyAffiliateSignatureStatus(contract.id, status, { role, reason: event.reason ?? null, occurredAt: event.occurredAt, actorLabel: event.verified ? "Prestataire de signature" : "Prestataire de signature (statut relu)" });
  await trace(applied ? "applied" : "concurrent_duplicate", status);
  return true;
}

/** Relit l'état chez le prestataire (webhook manqué) et récupère le lien de contresignature s'il manque. */
export async function refreshAffiliateContract(contractId: string): Promise<{ ok: true; status: SignatureStatus; changed: boolean } | { ok: false; error: string }> {
  const contract = await prisma.affiliateContract.findUnique({ where: { id: contractId } });
  if (!contract) return { ok: false, error: "Contrat introuvable." };
  if (!contract.providerEnvelopeId) return { ok: false, error: "Ce contrat n'a pas été envoyé à un prestataire de signature." };
  const provider = getSignatureProvider();
  if (provider.info.capability !== "LIVE" || provider.info.id !== contract.signatureProvider) return { ok: false, error: `Le prestataire « ${contract.signatureProvider} » n'est pas configuré actuellement.` };
  let status: SignatureStatus;
  try {
    status = await provider.getStatus(contract.providerEnvelopeId);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Le prestataire n'a pas répondu." };
  }
  if (!contract.companySigningUrl && provider.getSigningUrls) {
    const urls = await provider.getSigningUrls(contract.providerEnvelopeId).catch(() => null);
    if (urls?.COMPANY) await prisma.affiliateContract.update({ where: { id: contractId }, data: { companySigningUrl: urls.COMPANY } });
  }
  const changed = await applyAffiliateSignatureStatus(contractId, status, { actorLabel: `statut relu chez ${provider.info.label}` });
  if (!changed && contract.status === "FINALIZED") await archiveAffiliateSignedPdf(contractId);
  return { ok: true, status, changed };
}

/** Récupère et range le PDF signé chez le prestataire ; sans effet s'il est déjà archivé. */
export async function archiveAffiliateSignedPdf(contractId: string): Promise<boolean> {
  const contract = await prisma.affiliateContract.findUnique({ where: { id: contractId }, select: { fileKey: true, providerEnvelopeId: true, signatureProvider: true, signedArchivedAt: true } });
  if (!contract?.providerEnvelopeId) return false;
  const storage = getStorageProvider();
  const key = signedContractKey(contract.fileKey);
  const existing = await storage.read(key);
  if (contract.signedArchivedAt && existing) return true;
  const provider = getSignatureProvider();
  if (provider.info.capability !== "LIVE" || provider.info.id !== contract.signatureProvider) return false;
  try {
    const pdf = existing ?? (await provider.downloadSigned(contract.providerEnvelopeId));
    if (!pdf) throw new Error("le prestataire n'a pas fourni le document signé");
    if (!existing) await storage.put(key, pdf, "application/pdf");
    await prisma.affiliateContract.updateMany({ where: { id: contractId, signedArchivedAt: null }, data: { signedArchivedAt: new Date() } });
    return true;
  } catch (error) {
    await recordAudit({ action: "sales.contract_event", entityType: "AffiliateContract", entityId: contractId, metadata: { signedPdf: "failed", reason: error instanceof Error ? error.message : String(error) } });
    return false;
  }
}

/** Le PDF : la version signée une fois le contrat finalisé et archivé, sinon l'original. */
export async function readAffiliateContractPdf(contractId: string): Promise<{ pdf: Uint8Array; reference: string; signed: boolean } | null> {
  const contract = await prisma.affiliateContract.findUnique({ where: { id: contractId }, select: { fileKey: true, finalizedAt: true, reference: true } });
  if (!contract) return null;
  if (contract.finalizedAt) {
    const signed = await getStorageProvider().read(signedContractKey(contract.fileKey));
    if (signed) return { pdf: signed, reference: contract.reference, signed: true };
  }
  const original = await getStorageProvider().read(contract.fileKey);
  return original ? { pdf: original, reference: contract.reference, signed: false } : null;
}
