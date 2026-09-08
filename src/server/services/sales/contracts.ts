import "server-only";
import { prisma } from "@/server/db/client";
import { generateToken, hashToken } from "@/server/security/tokens";
import { getMessagingProvider, getStorageProvider } from "@/server/ai/registry";
import { getSignatureProvider } from "@/server/signature/registry";
import { buildContractDocument, CONTRACT_TEMPLATE_KEY } from "@/core/contracts/template";
import { renderContractPdf } from "@/core/contracts/pdf";
import { buildContractEmail } from "@/core/platform/sales-emails";
import { SignatureNotConfiguredError, type SignatureEvent, type SignatureStatus } from "@/core/signature";
import { CONTRACT_STATUS_LABELS, prospectStatusForContract, type ContractStatusCode } from "@/core/sales/pipeline";
import { publicUrl } from "@/server/public-url";
import { recordAudit } from "@/server/audit/log";
import { recordProspectEvent, type SalesActor } from "./events";
import { notifyAdmins, notifySalesRep } from "./notifications";
import { upsertCommissionForContract } from "./commissions";

const CONTRACT_LINK_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export async function getCompanyProfile() {
  return prisma.companyProfile.findUnique({ where: { id: "default" } });
}

export async function upsertCompanyProfile(input: { legalName: string; legalForm?: string | null; addressLine1?: string | null; postalCode?: string | null; city?: string | null; siren?: string | null; representativeName: string; representativeTitle?: string | null; representativeEmail: string }, adminId: string): Promise<void> {
  await prisma.companyProfile.upsert({ where: { id: "default" }, update: input, create: { id: "default", ...input } });
  await recordAudit({ action: "sales.company_profile_updated", entityType: "CompanyProfile", entityId: "default", platformAdminId: adminId });
}

function reference(prospectName: string, version: number): string {
  const year = new Date().getFullYear();
  const slug = prospectName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "").toUpperCase().slice(0, 8) || "PHARMA";
  return `PB-${year}-${slug}-V${version}`;
}

/** Génère le PDF depuis le modèle et les données vérifiées ; le contrat naît en brouillon. */
export async function generateContract(prospectId: string, terms: { monthlyPriceCents: number; durationMonths: number; startDate: Date }, actor: SalesActor): Promise<{ ok: true; contractId: string } | { ok: false; error: string }> {
  const [prospect, company] = await Promise.all([
    prisma.prospect.findUnique({ where: { id: prospectId }, include: { contracts: { orderBy: { version: "desc" }, take: 1, select: { version: true, status: true } } } }),
    getCompanyProfile(),
  ]);
  if (!prospect) return { ok: false, error: "Dossier introuvable." };
  if (prospect.blockedAt) return { ok: false, error: "Ce dossier est suspendu par l'administrateur." };
  if (!company) return { ok: false, error: "La fiche de la société exploitante n'est pas renseignée : l'administrateur doit la compléter (Console → Société) avant tout contrat." };
  if (!prospect.ownerName || !prospect.email || !prospect.addressLine1 || !prospect.city) {
    return { ok: false, error: "Complétez le dossier avant de générer le contrat : nom du titulaire, e-mail, adresse et ville sont requis." };
  }
  const last = prospect.contracts[0];
  if (last && ["SENT", "OPENED", "SIGNED_PHARMACY", "SIGNED_COMPANY"].includes(last.status)) {
    return { ok: false, error: "Un contrat est déjà en cours de signature. Attendez son issue, ou demandez à l'administrateur de le clore." };
  }
  if (last && last.status === "FINALIZED") return { ok: false, error: "Un contrat finalisé existe déjà pour ce dossier." };

  const version = (last?.version ?? 0) + 1;
  const ref = reference(prospect.name, version);
  const document = buildContractDocument({
    reference: ref,
    company: {
      legalName: company.legalName,
      legalForm: company.legalForm,
      address: [company.addressLine1, [company.postalCode, company.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      siren: company.siren,
      representativeName: company.representativeName,
      representativeTitle: company.representativeTitle,
      representativeEmail: company.representativeEmail,
    },
    pharmacy: {
      name: prospect.name,
      ownerName: prospect.ownerName,
      address: [prospect.addressLine1, [prospect.postalCode, prospect.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      finessNumber: prospect.finessNumber,
      siret: prospect.siret,
      email: prospect.email,
    },
    terms: { ...terms, outletCount: prospect.outletCount ?? 1 },
  });
  const pdf = await renderContractPdf(document);
  const fileKey = `plateforme/contrats/${prospect.id}/${ref}.pdf`;
  await getStorageProvider().put(fileKey, pdf, "application/pdf");

  const token = generateToken(32);
  const contract = await prisma.contract.create({
    data: {
      prospectId: prospect.id,
      version,
      status: "DRAFT",
      templateKey: CONTRACT_TEMPLATE_KEY,
      fileKey,
      accessTokenHash: hashToken(token),
      monthlyPriceCents: terms.monthlyPriceCents,
      durationMonths: terms.durationMonths,
      pharmacySignerName: prospect.ownerName,
      pharmacySignerEmail: prospect.email,
      companySignerName: company.representativeName,
      companySignerEmail: company.representativeEmail,
      expiresAt: new Date(Date.now() + CONTRACT_LINK_TTL_MS),
    },
  });
  // Le jeton en clair n'est conservé nulle part : il repart dans l'e-mail au moment de l'envoi.
  contractTokens.set(contract.id, token);
  await prisma.prospect.update({ where: { id: prospect.id }, data: { monthlyPriceCents: terms.monthlyPriceCents } });
  await recordProspectEvent({ prospectId: prospect.id, type: "CONTRACT_GENERATED", summary: `Contrat ${ref} généré (${(terms.monthlyPriceCents / 100).toFixed(2).replace(".", ",")} € HT/mois, ${terms.durationMonths} mois).`, actor, metadata: { contractId: contract.id } });
  await recordAudit({ action: "sales.contract_generated", entityType: "Contract", entityId: contract.id, salesRepId: actor.type === "SALES" ? actor.id : null, platformAdminId: actor.type === "ADMIN" ? actor.id : null });
  return { ok: true, contractId: contract.id };
}

/**
 * Le jeton d'accès en clair, entre la génération et l'envoi, vit en mémoire du
 * processus. Si l'envoi a lieu plus tard ou depuis une autre instance, un
 * nouveau jeton est émis (l'ancien devient caduc) — c'est le comportement voulu.
 */
const contractTokens = new Map<string, string>();

async function ensureContractToken(contractId: string): Promise<string> {
  const known = contractTokens.get(contractId);
  if (known) return known;
  const token = generateToken(32);
  await prisma.contract.update({ where: { id: contractId }, data: { accessTokenHash: hashToken(token) } });
  contractTokens.set(contractId, token);
  return token;
}

export function contractUrl(token: string): string {
  return publicUrl(`/contrat/${token}`);
}

/**
 * Envoi du contrat au titulaire : par lien sécurisé, et pour signature
 * électronique si un prestataire est branché. Sans prestataire, le contrat
 * part quand même par lien sécurisé et le dossier passe « Contrat envoyé » ;
 * la signature sera enregistrée par l'administrateur (papier) ou par le
 * prestataire quand il sera configuré. Rien n'est présenté comme signé.
 */
export async function sendContract(contractId: string, actor: SalesActor): Promise<{ ok: true; email: { status: string; detail: string }; signature: string } | { ok: false; error: string }> {
  const contract = await prisma.contract.findUnique({ where: { id: contractId }, include: { prospect: { include: { salesRep: true } } } });
  if (!contract) return { ok: false, error: "Contrat introuvable." };
  if (contract.prospect.blockedAt) return { ok: false, error: "Ce dossier est suspendu par l'administrateur." };
  if (!["DRAFT", "SENT", "OPENED"].includes(contract.status)) return { ok: false, error: `Ce contrat est « ${CONTRACT_STATUS_LABELS[contract.status as ContractStatusCode]} » : il ne peut plus être renvoyé.` };

  const token = await ensureContractToken(contract.id);
  const url = contractUrl(token);
  const expiresAt = contract.expiresAt ?? new Date(Date.now() + CONTRACT_LINK_TTL_MS);

  // Signature électronique : réelle ou franchement absente.
  let signingUrl: string | null = null;
  let signatureNote = "";
  let providerEnvelopeId = contract.providerEnvelopeId;
  const signature = getSignatureProvider();
  if (signature.info.capability === "LIVE" && !providerEnvelopeId) {
    try {
      const pdf = await getStorageProvider().read(contract.fileKey);
      if (!pdf) return { ok: false, error: "Le PDF du contrat est introuvable dans le stockage." };
      const [pFirst, ...pRest] = contract.pharmacySignerName.split(/\s+/);
      const [cFirst, ...cRest] = contract.companySignerName.split(/\s+/);
      const envelope = await signature.createEnvelope({
        reference: reference(contract.prospect.name, contract.version),
        title: "Contrat d'abonnement PharmaBoost",
        pdf,
        signers: [
          { role: "PHARMACY", firstName: pFirst, lastName: pRest.join(" ") || pFirst, email: contract.pharmacySignerEmail, phone: contract.prospect.phone },
          { role: "COMPANY", firstName: cFirst, lastName: cRest.join(" ") || cFirst, email: contract.companySignerEmail },
        ],
        expiresAt,
      });
      providerEnvelopeId = envelope.envelopeId;
      signingUrl = envelope.signingUrls.PHARMACY ?? null;
      signatureNote = `envoyé pour signature via ${signature.info.label}`;
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Le prestataire de signature a refusé la demande." };
    }
  } else if (signature.info.capability !== "LIVE") {
    signatureNote = new SignatureNotConfiguredError().message;
  }

  const message = buildContractEmail({
    ownerName: contract.pharmacySignerName,
    pharmacyName: contract.prospect.name,
    salesRepName: `${contract.prospect.salesRep.firstName} ${contract.prospect.salesRep.lastName}`,
    salesRepEmail: contract.prospect.salesRep.email,
    salesRepPhone: contract.prospect.salesRep.phone,
    url,
    signingUrl,
    expiresAt,
  });
  const outcome = await getMessagingProvider().sendEmail({ to: contract.pharmacySignerEmail, fromName: "PharmaBoost", subject: message.subject, text: message.text, html: message.html });
  const sent = outcome.status === "SENT";

  await prisma.contract.update({
    where: { id: contract.id },
    data: { status: sent && contract.status === "DRAFT" ? "SENT" : contract.status, sentAt: sent ? new Date() : contract.sentAt, expiresAt, providerEnvelopeId, signatureProvider: signature.info.id },
  });
  if (sent) {
    const next = prospectStatusForContract("SENT");
    if (next && contract.status === "DRAFT") {
      await prisma.prospect.update({ where: { id: contract.prospectId }, data: { status: next, lastContactAt: new Date() } });
      await upsertCommissionForContract({ prospectId: contract.prospectId, contractId: contract.id, status: "FORECAST", actor: { type: "SYSTEM", label: "PharmaBoost" } });
    }
  }
  await recordProspectEvent({
    prospectId: contract.prospectId,
    type: sent ? "CONTRACT_SENT" : "EMAIL_SENT",
    summary: sent ? `Contrat v${contract.version} envoyé à ${contract.pharmacySignerEmail}${signatureNote ? ` — ${signatureNote}` : ""}.` : `Envoi du contrat v${contract.version} NON effectué : ${outcome.detail}`,
    actor,
    metadata: { contractId: contract.id, emailStatus: outcome.status, signatureProvider: signature.info.id },
  });
  await recordAudit({ action: "sales.contract_sent", entityType: "Contract", entityId: contract.id, salesRepId: actor.type === "SALES" ? actor.id : null, platformAdminId: actor.type === "ADMIN" ? actor.id : null, metadata: { emailStatus: outcome.status, signatureProvider: signature.info.id } });
  if (!sent) return { ok: false, error: `Le contrat n'a pas pu être envoyé : ${outcome.detail}` };
  return { ok: true, email: { status: outcome.status, detail: outcome.detail }, signature: signatureNote };
}

/** Applique un statut de signature (webhook du prestataire, ou signature papier enregistrée par l'admin). */
export async function applySignatureStatus(contractId: string, status: SignatureStatus, actor: SalesActor, reason?: string | null): Promise<void> {
  const contract = await prisma.contract.findUniqueOrThrow({ where: { id: contractId }, include: { prospect: { select: { id: true, name: true, salesRepId: true, status: true } } } });
  const now = new Date();
  const data: Record<string, unknown> = { status };
  if (status === "OPENED") data.openedAt = contract.openedAt ?? now;
  if (status === "SIGNED_PHARMACY") data.pharmacySignedAt = now;
  if (status === "SIGNED_COMPANY") data.companySignedAt = now;
  if (status === "FINALIZED") {
    data.finalizedAt = now;
    data.pharmacySignedAt = contract.pharmacySignedAt ?? now;
    data.companySignedAt = contract.companySignedAt ?? now;
  }
  if (status === "REFUSED") {
    data.refusedAt = now;
    data.refusalReason = reason ?? null;
  }
  await prisma.contract.update({ where: { id: contractId }, data });

  const eventType = status === "FINALIZED" || status === "SIGNED_PHARMACY" || status === "SIGNED_COMPANY" ? "CONTRACT_SIGNED" : status === "OPENED" ? "CONTRACT_OPENED" : status === "REFUSED" ? "CONTRACT_REFUSED" : status === "EXPIRED" ? "CONTRACT_EXPIRED" : "CONTRACT_SENT";
  await recordProspectEvent({ prospectId: contract.prospect.id, type: eventType, summary: `Contrat v${contract.version} : ${CONTRACT_STATUS_LABELS[status]}${reason ? ` — ${reason}` : ""}.`, actor, metadata: { contractId, status } });
  await recordAudit({ action: "sales.contract_event", entityType: "Contract", entityId: contractId, platformAdminId: actor.type === "ADMIN" ? actor.id : null, metadata: { status, actor: actor.type } });

  const next = prospectStatusForContract(status);
  if (next && contract.prospect.status !== "PHARMACY_CREATED" && contract.prospect.status !== "ACTIVATED") {
    await prisma.prospect.update({ where: { id: contract.prospect.id }, data: { status: next } });
  }
  if (status === "FINALIZED") {
    await upsertCommissionForContract({ prospectId: contract.prospect.id, contractId, status: "EARNED", actor: { type: "SYSTEM", label: "PharmaBoost" } });
    await notifySalesRep({ salesRepId: contract.prospect.salesRepId, type: "CONTRACT_SIGNED", title: `${contract.prospect.name} : contrat signé`, body: "Vous pouvez créer l'espace pharmacie.", linkUrl: `/extranet/dossiers/${contract.prospect.id}`, severity: "SUCCESS" });
    await notifyAdmins({ type: "CONTRACT_SIGNED", title: `Nouvelle pharmacie signée : ${contract.prospect.name}`, body: `Contrat v${contract.version} finalisé.`, linkUrl: `/admin/dossiers/${contract.prospect.id}`, severity: "SUCCESS" });
  }
  if (status === "REFUSED" || status === "EXPIRED") {
    await notifySalesRep({ salesRepId: contract.prospect.salesRepId, type: `CONTRACT_${status}`, title: `${contract.prospect.name} : contrat ${CONTRACT_STATUS_LABELS[status].toLowerCase()}`, body: reason ?? "", linkUrl: `/extranet/dossiers/${contract.prospect.id}`, severity: "WARNING" });
    await notifyAdmins({ type: `CONTRACT_${status}`, title: `${contract.prospect.name} : contrat ${CONTRACT_STATUS_LABELS[status].toLowerCase()}`, body: reason ?? "", linkUrl: `/admin/dossiers/${contract.prospect.id}`, severity: "WARNING" });
  }
}

/** Notification d'un prestataire : retrouve le contrat par l'identifiant d'enveloppe. */
export async function handleSignatureEvent(event: SignatureEvent): Promise<boolean> {
  const contract = await prisma.contract.findFirst({ where: { providerEnvelopeId: event.envelopeId }, select: { id: true, status: true } });
  if (!contract) return false;
  if (contract.status === "FINALIZED" && event.status !== "FINALIZED") return true;
  await applySignatureStatus(contract.id, event.status, { type: "SIGNER", label: "Prestataire de signature" }, event.reason ?? null);
  return true;
}

/** Le contrat vu par son lien sécurisé (titulaire). Une ouverture est notée une fois. */
export async function getContractByToken(token: string) {
  if (!token || token.length < 16) return null;
  const contract = await prisma.contract.findUnique({ where: { accessTokenHash: hashToken(token) }, include: { prospect: { select: { name: true, salesRep: { select: { firstName: true, lastName: true, email: true, phone: true } } } } } });
  if (!contract) return null;
  if (contract.expiresAt && contract.expiresAt < new Date() && !contract.finalizedAt) return null;
  if (contract.status === "SENT") {
    await applySignatureStatus(contract.id, "OPENED", { type: "SIGNER", label: contract.pharmacySignerName });
  }
  return contract;
}

export async function readContractPdf(contractId: string): Promise<Uint8Array | null> {
  const contract = await prisma.contract.findUnique({ where: { id: contractId }, select: { fileKey: true } });
  if (!contract) return null;
  return getStorageProvider().read(contract.fileKey);
}
