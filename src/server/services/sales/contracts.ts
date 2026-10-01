import "server-only";
import { prisma } from "@/server/db/client";
import { withAdvisoryLock } from "@/server/db/advisory-lock";
import { generateToken, hashToken } from "@/server/security/tokens";
import { getMessagingProvider, getStorageProvider } from "@/server/ai/registry";
import { getSignatureProvider } from "@/server/signature/registry";
import { buildContractDocument, CONTRACT_TEMPLATE_KEY } from "@/core/contracts/template";
import { renderContractPdf } from "@/core/contracts/pdf";
import { signatureFieldPlacement } from "@/core/contracts/layout";
import { describeMissing, missingCompanyFields, missingContractFields, type MissingField } from "@/core/contracts/requirements";
import { nextReminderAction, AWAITING_PHARMACY, type ReminderPolicy } from "@/core/contracts/reminders";
import { ORIGIN_LABELS } from "@/core/contracts/journey";
import { PDFDocument } from "pdf-lib";
import { buildContractFinalizedEmail, buildPharmacySignedEmail, buildSignatureReminderEmail, buildSignatureRequestEmail, type ContractEmailFacts } from "@/core/platform/contract-emails";
import { SignatureNotConfiguredError, shouldApplySignatureStatus, signedContractKey, type SignatureEvent, type SignatureStatus } from "@/core/signature";
import { CONTRACT_STATUS_LABELS, prospectStatusForContract, type ContractStatusCode } from "@/core/sales/pipeline";
import { TIME_ZONE } from "@/config/constants";
import { publicUrl } from "@/server/public-url";
import { recordAudit } from "@/server/audit/log";
import { platformEmailContext } from "@/server/services/email-context";
import { loadReminderPolicy } from "@/server/services/platform-settings";
import { recordProspectEvent, type SalesActor } from "./events";
import { notifyAdmins, notifySalesRep } from "./notifications";
import { upsertCommissionForContract } from "./commissions";

const CONTRACT_LINK_TTL_MS = 1000 * 60 * 60 * 24 * 30;
/** Un envoi interrompu (instance arrêtée) libère son verrou au bout de ce délai. */
const SEND_LOCK_TTL_MS = 1000 * 60 * 2;
/** Statuts d'un dossier que l'envoi d'un contrat ne doit pas faire reculer. */
const ADVANCED_PROSPECT_STATUSES = ["CONTRACT_SIGNED", "PHARMACY_CREATED", "ACTIVATED"];
const IN_PROGRESS = ["SENT", "OPENED", "SIGNED_PHARMACY", "SIGNED_COMPANY"];

const shortDate = (d: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);

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

// ---------------------------------------------------------------------------
// Conditions : l'offre active, ou ce que le dossier a retenu
// ---------------------------------------------------------------------------

export type ContractTermsInput = { monthlyPriceCents?: number | null; durationMonths?: number | null; startDate?: Date | null; planId?: string | null };
export type ResolvedTerms = { monthlyPriceCents: number; durationMonths: number; startDate: Date; planId: string | null; planName?: string; trialDays: number };

/**
 * Les conditions du contrat : l'offre choisie (ou l'offre par défaut de la
 * console), son tarif et ses jours offerts. Un commercial peut ajuster le
 * tarif ; le premier mois offert suit l'offre. Sans offre ni tarif : rien
 * n'est inventé, l'envoi est refusé.
 */
export async function resolveContractTerms(prospect: { planId: string | null; monthlyPriceCents: number | null }, input: ContractTermsInput = {}): Promise<{ ok: true; terms: ResolvedTerms } | { ok: false; error: string }> {
  const planId = input.planId ?? prospect.planId;
  const plan = planId
    ? await prisma.plan.findUnique({ where: { id: planId } })
    : await prisma.plan.findFirst({ where: { isActive: true, isDefault: true }, orderBy: { createdAt: "asc" } });
  const monthlyPriceCents = input.monthlyPriceCents ?? prospect.monthlyPriceCents ?? plan?.monthlyPriceCents ?? null;
  if (!monthlyPriceCents || monthlyPriceCents <= 0) return { ok: false, error: "Aucune offre active ni tarif n'est défini : créez une offre par défaut (Console → Abonnements → Offres) ou indiquez un tarif." };
  return {
    ok: true,
    terms: {
      monthlyPriceCents,
      durationMonths: input.durationMonths ?? 12,
      startDate: input.startDate ?? new Date(),
      planId: plan?.id ?? null,
      planName: plan?.name,
      trialDays: plan?.trialDays ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Génération
// ---------------------------------------------------------------------------

/** Génère le PDF depuis le modèle et les données vérifiées ; le contrat naît en brouillon. */
export async function generateContract(prospectId: string, terms: { monthlyPriceCents: number; durationMonths: number; startDate: Date; planId?: string | null; planName?: string; trialDays?: number }, actor: SalesActor): Promise<{ ok: true; contractId: string } | { ok: false; error: string; missing?: MissingField[] }> {
  const [prospect, company] = await Promise.all([
    prisma.prospect.findUnique({ where: { id: prospectId }, include: { contracts: { orderBy: { version: "desc" }, take: 1, select: { version: true, status: true } }, pharmacy: { select: { id: true } } } }),
    getCompanyProfile(),
  ]);
  if (!prospect) return { ok: false, error: "Dossier introuvable." };
  if (prospect.blockedAt) return { ok: false, error: "Ce dossier est suspendu par l'administrateur." };
  const companyMissing = missingCompanyFields(company);
  if (!company || companyMissing.length) return { ok: false, error: `La fiche de la société exploitante est incomplète (${companyMissing.join(", ")}) : l'administrateur doit la compléter (Console → Société) avant tout contrat.` };
  const missing = missingContractFields(prospect);
  if (missing.length) return { ok: false, error: `Complétez le dossier avant de générer le contrat : ${describeMissing(missing)}.`, missing };
  const last = prospect.contracts[0];
  if (last && IN_PROGRESS.includes(last.status)) {
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
      legalName: prospect.legalName,
      ownerName: prospect.ownerName!,
      ownerTitle: prospect.ownerTitle,
      address: [prospect.addressLine1, [prospect.postalCode, prospect.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      finessNumber: prospect.finessNumber,
      siret: prospect.siret,
      email: prospect.email!,
    },
    terms: { monthlyPriceCents: terms.monthlyPriceCents, durationMonths: terms.durationMonths, startDate: terms.startDate, planName: terms.planName, trialDays: terms.trialDays ?? 0, outletCount: prospect.outletCount ?? 1 },
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
      startDate: terms.startDate,
      planId: terms.planId ?? null,
      trialDays: terms.trialDays ?? 0,
      pharmacyId: prospect.pharmacy?.id ?? null,
      pharmacySignerName: prospect.ownerName!,
      pharmacySignerEmail: prospect.email!,
      companySignerName: company.representativeName,
      companySignerEmail: company.representativeEmail,
      expiresAt: new Date(Date.now() + CONTRACT_LINK_TTL_MS),
    },
  });
  // Le jeton en clair n'est conservé nulle part : il repart dans l'e-mail au moment de l'envoi.
  contractTokens.set(contract.id, token);
  await prisma.prospect.update({ where: { id: prospect.id }, data: { monthlyPriceCents: terms.monthlyPriceCents, planId: terms.planId ?? prospect.planId } });
  await recordProspectEvent({ prospectId: prospect.id, type: "CONTRACT_GENERATED", summary: `Contrat ${ref} généré (${(terms.monthlyPriceCents / 100).toFixed(2).replace(".", ",")} € HT/mois, ${terms.durationMonths} mois${terms.trialDays ? `, ${terms.trialDays >= 28 && terms.trialDays <= 31 ? "premier mois offert" : `${terms.trialDays} jours offerts`}` : ""}).`, actor, metadata: { contractId: contract.id, planId: terms.planId ?? null, templateKey: CONTRACT_TEMPLATE_KEY } });
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

// ---------------------------------------------------------------------------
// Le point d'entrée unique : « Envoyer le contrat »
// ---------------------------------------------------------------------------

export type ContractingResult =
  | { ok: true; outcome: "SENT" | "ALREADY_IN_PROGRESS" | "ALREADY_SIGNED"; contractId: string; message: string }
  | { ok: false; error: string; missing?: MissingField[] };

/**
 * Engage la contractualisation d'un dossier, quelle que soit son origine
 * (site, console, commercial) : vérifie les informations, génère le contrat
 * depuis le modèle actif, le soumet au prestataire de signature et l'adresse
 * au titulaire. Idempotent : un contrat déjà en cours ou signé n'est jamais
 * doublé, et un double clic n'envoie qu'une fois.
 */
export async function startContracting(prospectId: string, actor: SalesActor, input: ContractTermsInput = {}): Promise<ContractingResult> {
  // Un seul engagement à la fois par dossier : le second appel voit le contrat du premier.
  return withAdvisoryLock(`contracting:${prospectId}`, () => startContractingLocked(prospectId, actor, input));
}

async function startContractingLocked(prospectId: string, actor: SalesActor, input: ContractTermsInput): Promise<ContractingResult> {
  const prospect = await prisma.prospect.findUnique({ where: { id: prospectId }, include: { contracts: { orderBy: { version: "desc" }, take: 1 } } });
  if (!prospect) return { ok: false, error: "Dossier introuvable." };
  if (prospect.blockedAt) return { ok: false, error: "Ce dossier est suspendu par l'administrateur." };
  const last = prospect.contracts[0];
  if (last?.status === "FINALIZED") return { ok: true, outcome: "ALREADY_SIGNED", contractId: last.id, message: "Le contrat de ce dossier est déjà signé." };
  if (last && IN_PROGRESS.includes(last.status)) return { ok: true, outcome: "ALREADY_IN_PROGRESS", contractId: last.id, message: `Un contrat est déjà en cours (${CONTRACT_STATUS_LABELS[last.status as ContractStatusCode].toLowerCase()}) : aucun nouvel envoi.` };

  const missing = missingContractFields(prospect);
  if (missing.length) return { ok: false, error: `Informations manquantes pour le contrat : ${describeMissing(missing)}.`, missing };

  // Un brouillon existant est repris tant que ses conditions sont celles demandées (reprise après une
  // interruption, second clic) ; des conditions différentes donnent une nouvelle version.
  const sameDay = (a: Date | null | undefined, b: Date | null | undefined) => !a || !b || a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
  const draftMatches =
    last?.status === "DRAFT" &&
    (input.monthlyPriceCents == null || input.monthlyPriceCents === last.monthlyPriceCents) &&
    (input.durationMonths == null || input.durationMonths === last.durationMonths) &&
    (input.planId == null || input.planId === last.planId) &&
    sameDay(input.startDate, last.startDate);
  let contractId = last?.status === "DRAFT" && (draftMatches || last.providerEnvelopeId) ? last.id : null;
  if (!contractId) {
    const resolved = await resolveContractTerms(prospect, input);
    if (!resolved.ok) return resolved;
    const generated = await generateContract(prospect.id, resolved.terms, actor);
    if (!generated.ok) return generated;
    contractId = generated.contractId;
  }
  const sent = await sendContract(contractId, actor);
  if (!sent.ok) return { ok: false, error: sent.error };
  if (sent.skipped) return { ok: true, outcome: "ALREADY_IN_PROGRESS", contractId, message: "Un envoi est déjà en cours pour ce contrat." };
  return { ok: true, outcome: "SENT", contractId, message: `Contrat envoyé à ${prospect.email}${sent.signature ? ` — ${sent.signature}` : ""}.` };
}

async function contractFacts(contractId: string): Promise<{ facts: ContractEmailFacts; prospect: { id: string; name: string; salesRepId: string | null; origin: string; status: string } } | null> {
  const contract = await prisma.contract.findUnique({ where: { id: contractId }, include: { plan: { select: { name: true } }, prospect: { include: { salesRep: true } } } });
  if (!contract) return null;
  const rep = contract.prospect.salesRep;
  return {
    prospect: { id: contract.prospect.id, name: contract.prospect.name, salesRepId: contract.prospect.salesRepId, origin: contract.prospect.origin, status: contract.prospect.status },
    facts: {
      ownerName: contract.pharmacySignerName,
      pharmacyName: contract.prospect.name,
      legalName: contract.prospect.legalName,
      offerName: contract.plan?.name ?? null,
      monthlyPriceCents: contract.monthlyPriceCents,
      durationMonths: contract.durationMonths,
      trialDays: contract.trialDays,
      reference: reference(contract.prospect.name, contract.version),
      contact: rep ? { name: `${rep.firstName} ${rep.lastName}`, email: rep.email, phone: rep.phone } : null,
    },
  };
}

/**
 * Envoi du contrat au titulaire : création de la demande de signature (une
 * seule, verrouillée) puis e-mail PharmaBoost portant le lien de signature.
 * Renvoyer réutilise la même demande et le même lien. Sans prestataire, le
 * contrat part par lien sécurisé et rien n'est présenté comme signé.
 */
export async function sendContract(contractId: string, actor: SalesActor): Promise<{ ok: true; skipped?: boolean; email: { status: string; detail: string }; signature: string } | { ok: false; error: string }> {
  // Verrou : un seul envoi à la fois pour un contrat (double clic, deux onglets, deux instances).
  const now = new Date();
  const claimed = await prisma.contract.updateMany({
    where: { id: contractId, OR: [{ sendLockedAt: null }, { sendLockedAt: { lt: new Date(now.getTime() - SEND_LOCK_TTL_MS) } }] },
    data: { sendLockedAt: now },
  });
  if (claimed.count === 0) {
    const exists = await prisma.contract.count({ where: { id: contractId } });
    if (!exists) return { ok: false, error: "Contrat introuvable." };
    return { ok: true, skipped: true, email: { status: "SKIPPED", detail: "envoi déjà en cours" }, signature: "" };
  }
  try {
    return await sendContractLocked(contractId, actor);
  } finally {
    await prisma.contract.update({ where: { id: contractId }, data: { sendLockedAt: null } }).catch(() => undefined);
  }
}

async function sendContractLocked(contractId: string, actor: SalesActor): Promise<{ ok: true; email: { status: string; detail: string }; signature: string } | { ok: false; error: string }> {
  const contract = await prisma.contract.findUnique({ where: { id: contractId }, include: { prospect: { include: { salesRep: true } } } });
  if (!contract) return { ok: false, error: "Contrat introuvable." };
  if (contract.prospect.blockedAt) return { ok: false, error: "Ce dossier est suspendu par l'administrateur." };
  if (!["DRAFT", "SENT", "OPENED"].includes(contract.status)) return { ok: false, error: `Ce contrat est « ${CONTRACT_STATUS_LABELS[contract.status as ContractStatusCode]} » : il ne peut plus être renvoyé.` };

  const firstSend = contract.status === "DRAFT";
  const token = await ensureContractToken(contract.id);
  const viewUrl = contractUrl(token);
  // Le délai de signature court à partir de l'envoi, pas de la génération.
  const expiresAt = firstSend ? new Date(Date.now() + CONTRACT_LINK_TTL_MS) : (contract.expiresAt ?? new Date(Date.now() + CONTRACT_LINK_TTL_MS));

  // Signature électronique : réelle ou franchement absente. Une seule demande par contrat.
  let signingUrl = contract.pharmacySigningUrl;
  let signatureNote = "";
  let providerEnvelopeId = contract.providerEnvelopeId;
  const signature = getSignatureProvider();
  if (signature.info.capability === "LIVE" && !providerEnvelopeId) {
    try {
      const pdf = await getStorageProvider().read(contract.fileKey);
      if (!pdf) return { ok: false, error: "Le PDF du contrat est introuvable dans le stockage." };
      const [pFirst, ...pRest] = contract.pharmacySignerName.split(/\s+/);
      const [cFirst, ...cRest] = contract.companySignerName.split(/\s+/);
      // Les champs de signature vont dans les cases dessinées en bas de la dernière page.
      const pageCount = (await PDFDocument.load(pdf, { updateMetadata: false })).getPageCount();
      const envelope = await signature.createEnvelope({
        reference: reference(contract.prospect.name, contract.version),
        title: "Contrat d'abonnement PharmaBoost",
        pdf,
        signers: [
          // Le titulaire reçoit le lien dans l'e-mail PharmaBoost : un seul message, pas deux.
          { role: "PHARMACY", firstName: pFirst, lastName: pRest.join(" ") || pFirst, email: contract.pharmacySignerEmail, phone: contract.prospect.phone, field: signatureFieldPlacement(0, 2, pageCount), notify: false },
          { role: "COMPANY", firstName: cFirst, lastName: cRest.join(" ") || cFirst, email: contract.companySignerEmail, field: signatureFieldPlacement(1, 2, pageCount) },
        ],
        expiresAt,
      });
      providerEnvelopeId = envelope.envelopeId;
      signingUrl = envelope.signingUrls.PHARMACY ?? null;
      // Enregistré aussitôt : si l'e-mail échoue, la demande n'est ni perdue ni recréée.
      await prisma.contract.update({ where: { id: contract.id }, data: { providerEnvelopeId, pharmacySigningUrl: signingUrl, signatureProvider: signature.info.id, expiresAt } });
      signatureNote = `envoyé pour signature via ${signature.info.label}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Le prestataire de signature a refusé la demande.";
      await recordProspectEvent({ prospectId: contract.prospectId, type: "SIGNATURE_ERROR", summary: `Demande de signature NON créée : ${message}`, actor, metadata: { contractId: contract.id, signatureProvider: signature.info.id } });
      await notifyAdmins({ type: "SIGNATURE_ERROR", title: `Erreur de signature électronique — ${contract.prospect.name}`, body: `${signature.info.label} : ${message}. Le contrat reste en brouillon ; « Envoyer le contrat » relance l'opération.`, linkUrl: `/admin/dossiers/${contract.prospectId}`, severity: "CRITICAL" });
      if (contract.prospect.salesRepId && actor.type !== "SALES") await notifySalesRep({ salesRepId: contract.prospect.salesRepId, type: "SIGNATURE_ERROR", title: `${contract.prospect.name} : envoi du contrat en échec`, body: "Le prestataire de signature n'a pas répondu. L'équipe PharmaBoost est prévenue.", linkUrl: `/extranet/dossiers/${contract.prospectId}`, severity: "WARNING" });
      return { ok: false, error: `Le prestataire de signature n'a pas accepté la demande (${message}). Le contrat reste en brouillon : réessayez dans quelques minutes.` };
    }
  } else if (signature.info.capability === "LIVE") {
    signatureNote = signingUrl ? "même demande de signature" : "";
  } else {
    signatureNote = new SignatureNotConfiguredError().message;
  }

  const [ctx, factsBundle] = await Promise.all([platformEmailContext(), contractFacts(contract.id)]);
  const message = buildSignatureRequestEmail(ctx, { ...factsBundle!.facts, signingUrl, viewUrl, expiresAt });
  const outcome = await getMessagingProvider().sendEmail({ to: contract.pharmacySignerEmail, fromName: "PharmaBoost", subject: message.subject, text: message.text, html: message.html });
  const sent = outcome.status === "SENT";

  await prisma.contract.update({
    where: { id: contract.id },
    data: { status: sent && firstSend ? "SENT" : contract.status, sentAt: sent ? (contract.sentAt ?? new Date()) : contract.sentAt, expiresAt, providerEnvelopeId, pharmacySigningUrl: signingUrl, signatureProvider: signature.info.id },
  });
  if (sent && firstSend) {
    const next = prospectStatusForContract("SENT");
    if (next && !ADVANCED_PROSPECT_STATUSES.includes(contract.prospect.status)) {
      await prisma.prospect.update({ where: { id: contract.prospectId }, data: { status: next, lastContactAt: new Date() } });
    }
    await upsertCommissionForContract({ prospectId: contract.prospectId, contractId: contract.id, status: "FORECAST", actor: { type: "SYSTEM", label: "PharmaBoost" } });
    const rep = contract.prospect.salesRep;
    const initiator = actor.type === "SALES" ? `Commercial : ${actor.label}` : rep ? `Commercial : ${rep.firstName} ${rep.lastName}` : `Origine : ${ORIGIN_LABELS[contract.prospect.origin] ?? contract.prospect.origin}`;
    await notifyAdmins({
      type: "CONTRACT_SENT",
      title: `Nouvelle contractualisation initiée — ${contract.prospect.name}`,
      body: `Pharmacie : ${contract.prospect.name} · ${initiator} · Date : ${shortDate(new Date())} · Statut : Contrat envoyé`,
      linkUrl: `/admin/dossiers/${contract.prospectId}`,
      severity: "INFO",
    });
    if (rep && actor.type !== "SALES") await notifySalesRep({ salesRepId: rep.id, type: "CONTRACT_SENT", title: `${contract.prospect.name} : contrat envoyé`, body: `Envoyé à ${contract.pharmacySignerEmail}.`, linkUrl: `/extranet/dossiers/${contract.prospectId}`, severity: "INFO" });
  }
  await recordProspectEvent({
    prospectId: contract.prospectId,
    type: sent ? "CONTRACT_SENT" : "EMAIL_SENT",
    summary: sent ? `Contrat v${contract.version} ${firstSend ? "envoyé" : "renvoyé"} à ${contract.pharmacySignerEmail}${signatureNote ? ` — ${signatureNote}` : ""}.` : `Envoi du contrat v${contract.version} NON effectué : ${outcome.detail}`,
    actor,
    metadata: { contractId: contract.id, emailStatus: outcome.status, signatureProvider: signature.info.id },
  });
  await recordAudit({ action: "sales.contract_sent", entityType: "Contract", entityId: contract.id, salesRepId: actor.type === "SALES" ? actor.id : null, platformAdminId: actor.type === "ADMIN" ? actor.id : null, metadata: { emailStatus: outcome.status, signatureProvider: signature.info.id, firstSend } });
  if (!sent) {
    await notifyAdmins({ type: "EMAIL_FAILED", title: `E-mail du contrat non parti — ${contract.prospect.name}`, body: `${contract.pharmacySignerEmail} : ${outcome.detail}`, linkUrl: `/admin/dossiers/${contract.prospectId}`, severity: "WARNING" });
    return { ok: false, error: `Le contrat n'a pas pu être envoyé : ${outcome.detail}` };
  }
  return { ok: true, email: { status: outcome.status, detail: outcome.detail }, signature: signatureNote };
}

// ---------------------------------------------------------------------------
// Statuts de signature
// ---------------------------------------------------------------------------

/**
 * Applique un statut de signature (webhook du prestataire, statut relu, ou
 * signature papier enregistrée par l'admin). La mise à jour est
 * conditionnelle : deux notifications simultanées pour le même fait n'en
 * appliquent qu'une, et chaque e-mail ne part qu'une fois.
 */
export async function applySignatureStatus(contractId: string, status: SignatureStatus, actor: SalesActor, reason?: string | null): Promise<boolean> {
  const contract = await prisma.contract.findUniqueOrThrow({ where: { id: contractId }, include: { prospect: { select: { id: true, name: true, salesRepId: true, status: true } } } });
  const now = new Date();
  const data: Record<string, unknown> = { status };
  if (status === "OPENED") data.openedAt = contract.openedAt ?? now;
  if (status === "SIGNED_PHARMACY") data.pharmacySignedAt = contract.pharmacySignedAt ?? now;
  if (status === "SIGNED_COMPANY") data.companySignedAt = contract.companySignedAt ?? now;
  if (status === "FINALIZED") {
    data.finalizedAt = now;
    data.pharmacySignedAt = contract.pharmacySignedAt ?? now;
    data.companySignedAt = contract.companySignedAt ?? now;
  }
  if (status === "REFUSED") {
    data.refusedAt = now;
    data.refusalReason = reason ?? null;
  }
  const won = await prisma.contract.updateMany({ where: { id: contractId, status: contract.status }, data });
  if (won.count === 0) return false;

  const eventType = status === "FINALIZED" || status === "SIGNED_PHARMACY" || status === "SIGNED_COMPANY" ? "CONTRACT_SIGNED" : status === "OPENED" ? "CONTRACT_OPENED" : status === "REFUSED" ? "CONTRACT_REFUSED" : status === "EXPIRED" ? "CONTRACT_EXPIRED" : "CONTRACT_SENT";
  const summaries: Partial<Record<SignatureStatus, string>> = {
    OPENED: "Contrat consulté par le titulaire",
    SIGNED_PHARMACY: "Signé par la pharmacie",
    SIGNED_COMPANY: "Signé par PharmaBoost",
    FINALIZED: "Contrat finalisé : signé par les deux parties",
  };
  await recordProspectEvent({ prospectId: contract.prospect.id, type: eventType, summary: `Contrat v${contract.version} : ${summaries[status] ?? CONTRACT_STATUS_LABELS[status]}${reason ? ` — ${reason}` : ""}.`, actor, metadata: { contractId, status } });
  await recordAudit({ action: "sales.contract_event", entityType: "Contract", entityId: contractId, platformAdminId: actor.type === "ADMIN" ? actor.id : null, metadata: { status, actor: actor.type } });

  const next = prospectStatusForContract(status);
  if (next && !ADVANCED_PROSPECT_STATUSES.includes(contract.prospect.status)) {
    await prisma.prospect.update({ where: { id: contract.prospect.id }, data: { status: next } });
  }
  const repLink = `/extranet/dossiers/${contract.prospect.id}`;
  const adminLink = `/admin/dossiers/${contract.prospect.id}`;
  const rep = contract.prospect.salesRepId;

  if (status === "OPENED" && rep) {
    await notifySalesRep({ salesRepId: rep, type: "CONTRACT_OPENED", title: `${contract.prospect.name} a consulté son contrat`, body: "La signature est attendue.", linkUrl: repLink, severity: "INFO" });
  }
  if (status === "SIGNED_PHARMACY") {
    await notifyAdmins({ type: "CONTRACT_SIGNED_PHARMACY", title: `Contrat signé par la pharmacie — ${contract.prospect.name}`, body: "À contresigner par PharmaBoost (invitation envoyée par le prestataire au signataire de la société).", linkUrl: adminLink, severity: "SUCCESS" });
    if (rep) await notifySalesRep({ salesRepId: rep, type: "CONTRACT_SIGNED_PHARMACY", title: `${contract.prospect.name} a signé son contrat`, body: "PharmaBoost contresigne.", linkUrl: repLink, severity: "SUCCESS" });
    await sendClientEmail(contractId, "PHARMACY_SIGNED");
  }
  if (status === "FINALIZED") {
    await upsertCommissionForContract({ prospectId: contract.prospect.id, contractId, status: "EARNED", actor: { type: "SYSTEM", label: "PharmaBoost" } });
    const archived = await archiveSignedPdf(contractId);
    await recordProspectEvent({ prospectId: contract.prospect.id, type: "SUBSCRIPTION_PENDING", summary: "En attente d'activation de l'abonnement.", actor: { type: "SYSTEM", label: "PharmaBoost" }, metadata: { contractId } });
    if (rep) await notifySalesRep({ salesRepId: rep, type: "CONTRACT_FINALIZED", title: `${contract.prospect.name} : contrat finalisé`, body: "Abonnement à activer.", linkUrl: repLink, severity: "SUCCESS" });
    await notifyAdmins({ type: "CONTRACT_FINALIZED", title: `Contrat finalisé — ${contract.prospect.name}`, body: `Contrat v${contract.version} signé par les deux parties${archived ? ", PDF signé archivé" : " — PDF signé NON archivé (Actualiser chez le prestataire)"}. Dossier prêt pour l'activation de l'abonnement.`, linkUrl: adminLink, severity: "SUCCESS" });
    await sendClientEmail(contractId, "FINALIZED");
  }
  if (status === "REFUSED" || status === "EXPIRED") {
    if (rep) await notifySalesRep({ salesRepId: rep, type: `CONTRACT_${status}`, title: `${contract.prospect.name} : contrat ${CONTRACT_STATUS_LABELS[status].toLowerCase()}`, body: reason ?? "Votre intervention est nécessaire.", linkUrl: repLink, severity: "WARNING" });
    await notifyAdmins({ type: `CONTRACT_${status}`, title: `${contract.prospect.name} : contrat ${CONTRACT_STATUS_LABELS[status].toLowerCase()}`, body: reason ?? "", linkUrl: adminLink, severity: "WARNING" });
  }
  return true;
}

/** E-mails au titulaire sur les faits acquis ; un échec d'envoi est tracé, sans bloquer le parcours. */
async function sendClientEmail(contractId: string, kind: "PHARMACY_SIGNED" | "FINALIZED"): Promise<void> {
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  const bundle = await contractFacts(contractId);
  if (!contract || !bundle) return;
  const ctx = await platformEmailContext();
  const email =
    kind === "PHARMACY_SIGNED"
      ? buildPharmacySignedEmail(ctx, { ...bundle.facts, signedAt: contract.pharmacySignedAt ?? new Date() })
      : buildContractFinalizedEmail(ctx, { ...bundle.facts, finalizedAt: contract.finalizedAt ?? new Date(), documentUrl: contractUrl(await ensureContractToken(contractId)) });
  const outcome = await getMessagingProvider().sendEmail({ to: contract.pharmacySignerEmail, fromName: "PharmaBoost", subject: email.subject, text: email.text, html: email.html });
  await recordProspectEvent({
    prospectId: contract.prospectId,
    type: "EMAIL_SENT",
    summary: outcome.status === "SENT" ? `E-mail « ${email.subject} » envoyé à ${contract.pharmacySignerEmail}.` : `E-mail « ${email.subject} » NON envoyé : ${outcome.detail}`,
    actor: { type: "SYSTEM", label: "PharmaBoost" },
    metadata: { contractId, kind, emailStatus: outcome.status },
  });
}

/**
 * Relit le statut chez le prestataire (quand un webhook a été manqué, ou pour
 * vérifier). N'applique un changement que si le statut a avancé.
 */
export async function refreshContractSignatureStatus(contractId: string, actor: SalesActor): Promise<{ ok: true; status: SignatureStatus; changed: boolean } | { ok: false; error: string }> {
  const contract = await prisma.contract.findUnique({ where: { id: contractId }, select: { status: true, providerEnvelopeId: true, signatureProvider: true } });
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
  if (!shouldApplySignatureStatus(contract.status, status)) {
    // Déjà finalisé : on s'assure au passage que la version signée est archivée.
    if (contract.status === "FINALIZED") await archiveSignedPdf(contractId);
    return { ok: true, status, changed: false };
  }
  const changed = await applySignatureStatus(contractId, status, actor, `statut relu chez ${provider.info.label}`);
  return { ok: true, status, changed };
}

/**
 * Notification d'un prestataire : retrouve le contrat par l'identifiant
 * d'enveloppe. Doublons et événements en désordre sont absorbés : un statut
 * n'est appliqué que s'il fait avancer le contrat. Chaque réception est tracée.
 */
export async function handleSignatureEvent(event: SignatureEvent): Promise<boolean> {
  const contract = await prisma.contract.findFirst({ where: { providerEnvelopeId: event.envelopeId }, select: { id: true, status: true } });
  const trace = (outcome: string, status?: string) =>
    recordAudit({ action: "sales.signature_webhook", entityType: "Contract", entityId: contract?.id ?? event.envelopeId, metadata: { envelopeId: event.envelopeId, announced: event.status, applied: status ?? null, verified: event.verified, outcome } });
  if (!contract) {
    await trace("unknown_envelope");
    return false;
  }
  if (contract.status === "FINALIZED") {
    await trace("already_finalized");
    return true;
  }
  // Notification non authentifiée : seul l'état relu chez le prestataire fait foi.
  const status = event.verified ? event.status : await getSignatureProvider().getStatus(event.envelopeId);
  if (!shouldApplySignatureStatus(contract.status, status)) {
    await trace("ignored_not_forward", status);
    return true;
  }
  const applied = await applySignatureStatus(contract.id, status, { type: "SIGNER", label: event.verified ? "Prestataire de signature" : "Prestataire de signature (statut relu)" }, event.reason ?? null);
  await trace(applied ? "applied" : "concurrent_duplicate", status);
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
  const contract = await prisma.contract.findUnique({ where: { id: contractId }, select: { fileKey: true, finalizedAt: true } });
  if (!contract) return null;
  // Une fois finalisé, c'est la version signée qui fait foi, si elle a été archivée.
  if (contract.finalizedAt) {
    const signed = await getStorageProvider().read(signedContractKey(contract.fileKey));
    if (signed) return signed;
  }
  return getStorageProvider().read(contract.fileKey);
}

/**
 * Récupère chez le prestataire le PDF signé (avec son dossier de preuve) et le
 * range à côté du contrat. Sans effet s'il est déjà archivé ; un échec est
 * tracé mais ne remet pas en cause la finalisation, et « Actualiser chez le
 * prestataire » retente l'archivage.
 */
export async function archiveSignedPdf(contractId: string): Promise<boolean> {
  const contract = await prisma.contract.findUnique({ where: { id: contractId }, select: { fileKey: true, providerEnvelopeId: true, signatureProvider: true, signedArchivedAt: true, prospectId: true, version: true } });
  if (!contract?.providerEnvelopeId) return false;
  const storage = getStorageProvider();
  const key = signedContractKey(contract.fileKey);
  if (contract.signedArchivedAt && (await storage.read(key))) return true;
  const provider = getSignatureProvider();
  if (provider.info.capability !== "LIVE" || provider.info.id !== contract.signatureProvider) return false;
  try {
    const existing = await storage.read(key);
    const pdf = existing ?? (await provider.downloadSigned(contract.providerEnvelopeId));
    if (!pdf) throw new Error("le prestataire n'a pas fourni le document signé");
    if (!existing) await storage.put(key, pdf, "application/pdf");
    const marked = await prisma.contract.updateMany({ where: { id: contractId, signedArchivedAt: null }, data: { signedArchivedAt: new Date() } });
    if (marked.count > 0) {
      await recordProspectEvent({ prospectId: contract.prospectId, type: "SIGNED_PDF_ARCHIVED", summary: `PDF signé du contrat v${contract.version} récupéré chez ${provider.info.label} et archivé (${Math.round(pdf.length / 1024)} Ko).`, actor: { type: "SYSTEM", label: "PharmaBoost" }, metadata: { contractId, bytes: pdf.length, signatureProvider: provider.info.id, envelopeId: contract.providerEnvelopeId } });
      await recordAudit({ action: "sales.contract_event", entityType: "Contract", entityId: contractId, metadata: { signedPdf: "archived", bytes: pdf.length, signatureProvider: provider.info.id } });
    }
    return true;
  } catch (error) {
    await recordAudit({ action: "sales.contract_event", entityType: "Contract", entityId: contractId, metadata: { signedPdf: "failed", reason: error instanceof Error ? error.message : String(error) } });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Relances
// ---------------------------------------------------------------------------

export type ReminderRunReport = { checked: number; reminded: number; escalated: number; expired: number; errors: string[] };

/**
 * Passe sur les contrats qui attendent la signature du titulaire : rappel
 * selon la règle de la console, puis signalement à l'équipe et au commercial.
 * Un contrat signé n'est jamais relancé (le statut est relu juste avant).
 * Un contrat dont le lien a expiré passe « Expiré ».
 */
export async function runContractReminders(now = new Date(), policyOverride?: ReminderPolicy): Promise<ReminderRunReport> {
  const policy = policyOverride ?? (await loadReminderPolicy());
  const report: ReminderRunReport = { checked: 0, reminded: 0, escalated: 0, expired: 0, errors: [] };
  const contracts = await prisma.contract.findMany({ where: { status: { in: AWAITING_PHARMACY as ContractStatusCode[] } }, include: { prospect: { select: { id: true, name: true, salesRepId: true, blockedAt: true } } } });
  for (const contract of contracts) {
    report.checked += 1;
    if (contract.prospect.blockedAt) continue;
    try {
      if (contract.expiresAt && contract.expiresAt <= now) {
        if (await applySignatureStatus(contract.id, "EXPIRED", { type: "SYSTEM", label: "PharmaBoost" }, "délai de signature dépassé")) report.expired += 1;
        continue;
      }
      const action = nextReminderAction(contract, policy, now);
      if (!action) continue;
      // Le prestataire fait foi : si la signature est arrivée sans webhook, on l'applique et on s'arrête là.
      if (contract.providerEnvelopeId) {
        const refreshed = await refreshContractSignatureStatus(contract.id, { type: "SYSTEM", label: "PharmaBoost (vérification avant relance)" });
        if (refreshed.ok && !AWAITING_PHARMACY.includes(refreshed.status)) continue;
      }
      if (action === "REMIND") {
        const claimed = await prisma.contract.updateMany({ where: { id: contract.id, reminderCount: contract.reminderCount, status: { in: AWAITING_PHARMACY as ContractStatusCode[] } }, data: { reminderCount: { increment: 1 }, lastReminderAt: now } });
        if (claimed.count === 0) continue;
        const bundle = await contractFacts(contract.id);
        const ctx = await platformEmailContext();
        const token = await ensureContractToken(contract.id);
        const email = buildSignatureReminderEmail(ctx, { ...bundle!.facts, signingUrl: contract.pharmacySigningUrl, viewUrl: contractUrl(token), expiresAt: contract.expiresAt ?? new Date(now.getTime() + CONTRACT_LINK_TTL_MS), reminderNumber: contract.reminderCount + 1 });
        const outcome = await getMessagingProvider().sendEmail({ to: contract.pharmacySignerEmail, fromName: "PharmaBoost", subject: email.subject, text: email.text, html: email.html });
        await recordProspectEvent({ prospectId: contract.prospectId, type: "CONTRACT_REMINDER", summary: outcome.status === "SENT" ? `Relance ${contract.reminderCount + 1} envoyée à ${contract.pharmacySignerEmail}.` : `Relance ${contract.reminderCount + 1} NON envoyée : ${outcome.detail}`, actor: { type: "SYSTEM", label: "Relances automatiques" }, metadata: { contractId: contract.id, emailStatus: outcome.status } });
        await recordAudit({ action: "sales.contract_reminder", entityType: "Contract", entityId: contract.id, metadata: { reminder: contract.reminderCount + 1, emailStatus: outcome.status } });
        if (outcome.status === "SENT") report.reminded += 1;
      } else {
        const claimed = await prisma.contract.updateMany({ where: { id: contract.id, escalatedAt: null }, data: { escalatedAt: now } });
        if (claimed.count === 0) continue;
        const summary = `Contrat non signé après ${contract.reminderCount} relance${contract.reminderCount > 1 ? "s" : ""} : une intervention est nécessaire.`;
        await recordProspectEvent({ prospectId: contract.prospectId, type: "CONTRACT_REMINDER", summary, actor: { type: "SYSTEM", label: "Relances automatiques" }, metadata: { contractId: contract.id, escalated: true } });
        await notifyAdmins({ type: "CONTRACT_STALLED", title: `Dossier à relancer — ${contract.prospect.name}`, body: summary, linkUrl: `/admin/dossiers/${contract.prospectId}`, severity: "WARNING" });
        if (contract.prospect.salesRepId) await notifySalesRep({ salesRepId: contract.prospect.salesRepId, type: "CONTRACT_STALLED", title: `${contract.prospect.name} : votre intervention est nécessaire`, body: summary, linkUrl: `/extranet/dossiers/${contract.prospectId}`, severity: "WARNING" });
        report.escalated += 1;
      }
    } catch (error) {
      report.errors.push(`${contract.id} : ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return report;
}
