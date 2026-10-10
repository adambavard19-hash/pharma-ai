import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "@/server/db/client";
import { hashPassword } from "@/server/security/password";
import { refreshStockNotifications } from "@/server/services/notifications";
import { ENGINE_VERSION } from "@/config/constants";
import { classifyProductByName, restrictToVocabulary } from "@/core/catalog/product-vocabulary";
import { classificationKey } from "@/server/services/classification";
import { DEMO_DEV_PASSWORD, DEMO_ORGANIZATION_SLUG, DEMO_PHARMACY, DEMO_PHARMACY_SLUG, DEMO_POST, DEMO_TEAM } from "@/core/demo/identity";
import { DEMO_DRUGS, DEMO_SHELF, DEMO_TAG_OVERRIDES, DEMO_VIGILANCES, type DemoDrug } from "@/core/demo/catalog";
import { planHistory, type PlannedVisit } from "@/core/demo/history";
import { appEnvironment } from "@/config/env";
import type { Prisma } from "@/generated/prisma";

/**
 * Installer, ou remettre à l'état initial, l'officine de démonstration commerciale.
 *
 * Une seule fonction fait les deux : elle ne touche qu'à l'officine désignée
 * par `DEMO_PHARMACY_SLUG` (et à son groupe), jamais à une autre ligne de la
 * base — c'est ce que garantit chaque requête, filtrée sur son identifiant, et
 * ce que vérifie le test d'isolation. Elle est rejouable à volonté : le
 * bouton « Réinitialiser la démo » n'est que cet appel.
 *
 * L'installation écrit : le groupe, l'officine, l'équipe, le rayon, le stock
 * médicament (de vraies références du catalogue national), les vigilances, les
 * règles de la pharmacie, un historique de cinq semaines et le poste de caisse
 * simulé. Aucun e-mail, aucun appel externe, aucun abonnement.
 */

/** Tout ce que l'officine de démonstration possède et que la réinitialisation efface. */
export const WIPED_MODELS = [
  "labChallengeEntry", "labChallenge", "partnerOrder", "partnerAttribution", "partnerLead", "pharmacyPartnerPreference",
  "trainingProgress", "stockDeposit", "importJob", "sealedDocument", "patientDocument", "reminder", "patientInteraction",
  "stockMovement", "sale", "recommendation", "analysisRun", "counterRequest", "counterSaleFollowUp", "prescription", "patient",
  "pharmacyRule", "productAssociation", "preferredRange", "productVigilance", "stockLot", "productBarcode", "stockItem", "product", "pharmacyDrugStock",
  "notification", "emailDispatch", "storedFile", "automationDispatch", "patientNewsSubscription", "patientNewsAnnouncement", "aiUsageRecord", "auditLog",
  // La démonstration n'écrit pas au vrai support (le geste est refusé) ; si une discussion existait, elle ne survit pas à la réinitialisation.
  "supportThread",
  // Une liaison logiciel créée pendant un rendez-vous (clé d'agent comprise) ne survit pas à la démo.
  "stockConnection",
  // Invitations et demandes de rattachement : la démonstration n'en envoie ni n'en garde.
  "teamInvitation", "joinRequest", "counterQuestionAnswer",
] as const;

/** Ce qui porte un `pharmacyId` et que la réinitialisation conserve : la structure de l'officine, jamais son activité. */
export const KEPT_MODELS = [
  "membership", "session", "counterPost", "prospect", "contract", "subscriptionInvite", "billingEvent",
  "platformIncident", "adminNote", "cancellationRequest", "pharmacyPostCountChange", "campaignRecipient", "trainingContent", "partnerBrandAudience",
] as const;

// Deux mois : de quoi comparer le mois en cours au mois dernier, quel que soit le jour où l'on présente.
const HISTORY_DAYS = 65;

export type InstallOptions = {
  /** Le mot de passe du compte. Absent : celui du développement hors production, un tirage au sort en production. */
  password?: string | null;
  /** Remettre les mots de passe de l'équipe à cette valeur (installation) ; la réinitialisation depuis l'application n'y touche pas. */
  setPasswords?: boolean;
  now?: Date;
  log?: (line: string) => void;
};

export type InstallResult = {
  pharmacyId: string;
  created: boolean;
  /** Le mot de passe, quand l'installation vient d'en poser un. Rendu une fois, jamais conservé en clair. */
  password: string | null;
  missingDrugs: string[];
  counts: { products: number; drugs: number; visits: number; sales: number; recommendations: number; users: number };
};

function randomPassword(): string {
  // Dix-huit caractères tirés au sort, avec une majuscule, un chiffre et un symbole : le contrôle de robustesse du produit passe.
  return `Dm${randomBytes(9).toString("base64url")}9!`;
}

const chunk = <T,>(items: T[], size: number): T[][] => {
  const parts: T[][] = [];
  for (let i = 0; i < items.length; i += size) parts.push(items.slice(i, i + size));
  return parts;
};

async function insertAll<T>(items: T[], write: (batch: T[]) => Promise<unknown>, size = 400): Promise<void> {
  for (const batch of chunk(items, size)) await write(batch);
}

/** Un médicament de démonstration, retrouvé dans le catalogue national par son nom. */
export type ResolvedDrug = { entry: DemoDrug; presentationId: string; specialtyId: string; name: string; cip13: string; priceCents: number };

export async function resolveDrug(entry: DemoDrug): Promise<ResolvedDrug | null> {
  const candidates = await prisma.drugSpecialty.findMany({
    where: { name: { startsWith: entry.search, mode: "insensitive" }, withdrawnAt: null, presentations: { some: { withdrawnAt: null } } },
    take: 12,
    select: { id: true, name: true, presentations: { where: { withdrawnAt: null }, orderBy: { cip13: "asc" }, select: { id: true, cip13: true, priceCents: true, approvedForCommunities: true } } },
  });
  // Le nom le plus court est le nom exact : « DOLIPRANE 1000 mg, comprimé » avant sa variante effervescente.
  const specialty = [...candidates].sort((a, b) => a.name.length - b.name.length)[0];
  if (!specialty) return null;
  const presentation = specialty.presentations.find((item) => item.approvedForCommunities && (item.priceCents ?? 0) > 0) ?? specialty.presentations.find((item) => item.approvedForCommunities) ?? specialty.presentations[0];
  if (!presentation) return null;
  return { entry, presentationId: presentation.id, specialtyId: specialty.id, name: specialty.name, cip13: presentation.cip13, priceCents: presentation.priceCents ?? entry.priceCents ?? 500 };
}

/** Les médicaments de démonstration présents dans le catalogue national de CETTE base. */
export async function resolveDemoDrugs(): Promise<{ found: ResolvedDrug[]; missing: string[] }> {
  const found: ResolvedDrug[] = [];
  const missing: string[] = [];
  for (const entry of DEMO_DRUGS) {
    const resolved = await resolveDrug(entry);
    if (resolved) found.push(resolved);
    else missing.push(entry.search);
  }
  return { found, missing };
}

/** Efface l'activité de l'officine de démonstration, et d'elle seule. */
async function wipeActivity(pharmacyId: string): Promise<void> {
  for (const model of WIPED_MODELS) {
    const delegate = (prisma as unknown as Record<string, { deleteMany: (args: { where: { pharmacyId: string } }) => Promise<unknown> }>)[model];
    await delegate.deleteMany({ where: { pharmacyId } });
  }
}

export async function installDemoPharmacy(options: InstallOptions = {}): Promise<InstallResult> {
  const now = options.now ?? new Date();
  const log = options.log ?? (() => undefined);

  // --- Le groupe et l'officine ---------------------------------------------------------------
  const existingPharmacy = await prisma.pharmacy.findUnique({ where: { slug: DEMO_PHARMACY_SLUG }, select: { id: true, isDemo: true, organizationId: true } });
  if (existingPharmacy && !existingPharmacy.isDemo) {
    // Jamais écraser une vraie officine : l'identifiant réservé à la démonstration doit lui appartenir.
    throw new Error("L'identifiant réservé à la démonstration désigne une officine qui n'en est pas une : installation refusée.");
  }
  const organization = await prisma.organization.upsert({
    where: { slug: DEMO_ORGANIZATION_SLUG },
    create: { name: "Groupe Pharmacie des Lilas (démonstration)", slug: DEMO_ORGANIZATION_SLUG },
    update: {},
    select: { id: true },
  });
  const pharmacyData = {
    name: DEMO_PHARMACY.name,
    city: DEMO_PHARMACY.city,
    postalCode: DEMO_PHARMACY.postalCode,
    addressLine1: DEMO_PHARMACY.addressLine1,
    phone: DEMO_PHARMACY.phone,
    email: DEMO_PHARMACY.email,
    brandColor: DEMO_PHARMACY.brandColor,
    isDemo: true,
    isActive: true,
    // Le stock vient d'être « mis à jour » : aucun rappel de dépôt.
    stockSyncedAt: now,
    onboardingCompletedAt: now,
    // Les annonces aux patients abonnés ne sont jamais envoyées depuis la démonstration.
    patientNewsEnabled: false,
  };
  const pharmacy = await prisma.pharmacy.upsert({
    where: { slug: DEMO_PHARMACY_SLUG },
    create: { ...pharmacyData, slug: DEMO_PHARMACY_SLUG, organizationId: organization.id },
    update: pharmacyData,
    select: { id: true },
  });
  const created = !existingPharmacy;
  if (existingPharmacy && existingPharmacy.organizationId !== organization.id) throw new Error("L'officine de démonstration appartient à un autre groupe : installation refusée.");

  // --- L'équipe -----------------------------------------------------------------------------
  const generated = options.password ? null : appEnvironment() === "production" ? randomPassword() : null;
  const password = options.password ?? generated ?? DEMO_DEV_PASSWORD;
  const hash = await hashPassword(password);
  let passwordGiven = false;
  const userIds: Record<string, string> = {};
  for (const member of DEMO_TEAM) {
    const existing = await prisma.user.findUnique({ where: { email: member.email }, select: { id: true, organizationId: true } });
    if (existing && existing.organizationId !== organization.id) throw new Error(`L'adresse ${member.email} appartient à un autre groupe : installation refusée.`);
    const setPassword = !existing || options.setPasswords === true;
    const user = existing
      ? await prisma.user.update({ where: { id: existing.id }, data: { firstName: member.firstName, lastName: member.lastName, status: "ACTIVE", deletedAt: null, ...(setPassword ? { passwordHash: hash } : {}) }, select: { id: true } })
      : await prisma.user.create({ data: { organizationId: organization.id, email: member.email, firstName: member.firstName, lastName: member.lastName, status: "ACTIVE", passwordHash: hash }, select: { id: true } });
    if (setPassword) passwordGiven = true;
    userIds[member.key] = user.id;
    await prisma.membership.upsert({
      where: { userId_pharmacyId: { userId: user.id, pharmacyId: pharmacy.id } },
      create: { userId: user.id, pharmacyId: pharmacy.id, role: member.role, isActive: true, isPrincipal: member.key === "owner", sortOrder: DEMO_TEAM.indexOf(member) + 1 },
      update: { role: member.role, isActive: true, grantedPermissions: [], revokedPermissions: [] },
    });
  }
  // Un collaborateur ajouté au cours d'un rendez-vous disparaît à la réinitialisation.
  await prisma.user.deleteMany({ where: { organizationId: organization.id, email: { notIn: DEMO_TEAM.map((member) => member.email) } } });

  // --- Repartir d'une activité vide, puis le rayon -----------------------------------------------
  await wipeActivity(pharmacy.id);
  log("activité effacée");

  const productIds = new Map<string, string>();
  const shelfRows: Prisma.ProductCreateManyInput[] = DEMO_SHELF.map((item, index) => {
    const id = randomUUID();
    productIds.set(item.slug, id);
    // Les étiquettes viennent du même dictionnaire qu'à l'import d'un vrai stock : la démonstration ne triche pas sur la classification.
    const heuristic = classifyProductByName(item.name, { brand: item.brand, description: item.description });
    const tags = DEMO_TAG_OVERRIDES[item.slug] ?? [...new Set([...(heuristic?.tags ?? []), ...restrictToVocabulary(item.matchingTags)])];
    return {
      id,
      pharmacyId: pharmacy.id,
      organizationId: organization.id,
      name: item.name,
      brand: item.brand,
      category: item.category,
      subCategory: item.subCategory,
      reference: `REF-${String(index + 1).padStart(4, "0")}`,
      ean: item.ean,
      imageUrl: `/produits/${item.slug}.svg`,
      description: item.description,
      commercialClaims: item.commercialClaims,
      precautions: item.precautions,
      matchingTags: tags,
      contraindications: item.contraindications,
      purchasePriceCents: item.purchasePriceCents,
      salePriceCents: item.salePriceCents,
      vatRate: item.vatRate,
      isDemo: true,
      classifiedAt: now,
      classificationSource: "HEURISTIC",
    };
  });
  await insertAll(shelfRows, (batch) => prisma.product.createMany({ data: batch }));
  await prisma.stockItem.createMany({
    data: DEMO_SHELF.map((item) => ({ pharmacyId: pharmacy.id, productId: productIds.get(item.slug) as string, quantity: item.quantity, alertThreshold: item.alertThreshold, location: item.location, lastCountedAt: new Date(now.getTime() - 86_400_000) })),
  });
  await prisma.productVigilance.createMany({
    data: DEMO_VIGILANCES.filter((item) => productIds.has(item.slug)).map((item) => ({ pharmacyId: pharmacy.id, productId: productIds.get(item.slug) as string, population: item.population, level: item.level, note: item.note, source: "PHARMACIST", createdByUserId: userIds.owner })),
  });
  log(`rayon : ${DEMO_SHELF.length} produits`);

  // --- Le stock médicament (vraies références du catalogue national) ---------------------------------
  const { found, missing } = await resolveDemoDrugs();
  await prisma.pharmacyDrugStock.createMany({
    data: found.map((item) => ({ pharmacyId: pharmacy.id, presentationId: item.presentationId, quantity: item.entry.quantity, alertThreshold: 4, priceCents: item.priceCents, source: "IMPORT" as const, lastCountedAt: new Date(now.getTime() - 86_400_000) })),
    skipDuplicates: true,
  });
  // Ce que le moteur sait de ces boîtes, posé une fois : la démonstration n'appelle jamais de modèle externe.
  for (const item of found) {
    const classification = item.entry.classification;
    if (!classification) continue;
    const key = classificationKey(item.name);
    if (!key) continue;
    await prisma.drugClassification.upsert({
      where: { key },
      create: { key, substance: classification.substance, atcCode: classification.atcCode, therapeuticClass: classification.therapeuticClass, commonSideEffects: classification.sideEffects, confidence: 0.95, providerId: "demo-reference", model: "reference" },
      update: {},
    });
  }
  log(`stock médicament : ${found.length} références${missing.length ? ` (${missing.length} introuvables)` : ""}`);

  // --- Le poste de caisse simulé, les règles de la pharmacie -----------------------------------------
  // Un poste appairé pendant un rendez-vous (« Connecter mon logiciel ») disparaît : seul le poste simulé reste.
  await prisma.counterPost.deleteMany({ where: { pharmacyId: pharmacy.id, hostname: { not: DEMO_POST.hostname } } });
  const existingPost = await prisma.counterPost.findFirst({ where: { pharmacyId: pharmacy.id, hostname: DEMO_POST.hostname }, select: { id: true } });
  // Le poste est « relié » et son export du stock « configuré » : la page de mise en service n'a rien à réclamer.
  const postData = { label: DEMO_POST.label, version: "démo", pairedAt: now, lastSeenAt: now, lastScanAt: null, scanCount: 0, revokedAt: null, exportPath: "\\\\SERVEUR\\PharmaBoost\\Export", lastExportAt: now, lastExportError: null };
  if (existingPost) await prisma.counterPost.update({ where: { id: existingPost.id }, data: postData });
  else await prisma.counterPost.create({ data: { pharmacyId: pharmacy.id, hostname: DEMO_POST.hostname, ...postData } });

  const preferred = productIds.get("probio-flore-10");
  const excluded = productIds.get("echinacea-immunite");
  await prisma.pharmacyRule.createMany({
    data: [
      ...(preferred ? [{ pharmacyId: pharmacy.id, type: "PREFER_PRODUCT" as const, productId: preferred, note: "Notre référence pour accompagner une antibiothérapie.", weight: 1, createdByUserId: userIds.owner }] : []),
      ...(excluded ? [{ pharmacyId: pharmacy.id, type: "EXCLUDE_PRODUCT" as const, productId: excluded, note: "Retiré du conseil en attendant la nouvelle formule du fournisseur.", weight: 1, createdByUserId: userIds.owner }] : []),
    ],
  });

  // --- L'historique ---------------------------------------------------------------------------------
  const shelf = new Map(DEMO_SHELF.map((item) => [item.slug, { name: item.name, category: item.category, salePriceCents: item.salePriceCents, purchasePriceCents: item.purchasePriceCents }]));
  const drugsByKey = new Map(found.map((item) => [item.entry.key, item]));
  const drugPrices = new Map(found.map((item) => [item.entry.key, item.priceCents]));
  const visits = planHistory({ now, days: HISTORY_DAYS, seed: 20261006, shelf, drugPrices }).filter((visit) => visit.scans.every((scan) => drugsByKey.has(scan)));
  const history = await writeHistory({ visits, pharmacyId: pharmacy.id, userIds, productIds, drugsByKey, now });
  log(`historique : ${history.sales} ventes, ${history.recommendations} conseils`);

  await refreshStockNotifications(pharmacy.id);

  return {
    pharmacyId: pharmacy.id,
    created,
    password: passwordGiven ? password : null,
    missingDrugs: missing,
    counts: { products: DEMO_SHELF.length, drugs: found.length, visits: visits.length, sales: history.sales, recommendations: history.recommendations, users: DEMO_TEAM.length },
  };
}

type HistoryContext = {
  visits: PlannedVisit[];
  pharmacyId: string;
  userIds: Record<string, string>;
  productIds: Map<string, string>;
  drugsByKey: Map<string, ResolvedDrug>;
  now: Date;
};

const minutes = (date: Date, count: number) => new Date(date.getTime() + count * 60_000);
const seconds = (date: Date, count: number) => new Date(date.getTime() + count * 1000);

async function writeHistory(context: HistoryContext): Promise<{ sales: number; recommendations: number }> {
  const { visits, pharmacyId, userIds, productIds, drugsByKey } = context;
  const prescriptions: Prisma.PrescriptionCreateManyInput[] = [];
  const lines: Prisma.PrescriptionLineCreateManyInput[] = [];
  const runs: Prisma.AnalysisRunCreateManyInput[] = [];
  const opportunities: Prisma.AdviceOpportunityCreateManyInput[] = [];
  const recommendations: Prisma.RecommendationCreateManyInput[] = [];
  const events: Prisma.RecommendationEventCreateManyInput[] = [];
  const sales: Prisma.SaleCreateManyInput[] = [];
  const saleLines: Prisma.SaleLineCreateManyInput[] = [];
  let saleNumber = 0;

  for (const visit of visits) {
    const memberId = userIds[visit.member];
    const prescriptionId = randomUUID();
    const runId = randomUUID();
    prescriptions.push({
      id: prescriptionId,
      pharmacyId,
      reference: `ORD-${String(visit.index + 1).padStart(4, "0")}`,
      status: "DELIVERED",
      source: "COUNTER_SCAN",
      counterPost: DEMO_POST.hostname,
      createdByUserId: memberId,
      verifiedByUserId: memberId,
      verifiedAt: seconds(visit.at, 20),
      validatedAt: minutes(visit.at, 4),
      isDemo: true,
      createdAt: visit.at,
      updatedAt: minutes(visit.at, 4),
    });
    visit.scans.forEach((key, position) => {
      const drug = drugsByKey.get(key) as ResolvedDrug;
      lines.push({ id: randomUUID(), prescriptionId, position: position + 1, drugName: drug.name, drugSpecialtyId: drug.specialtyId, identifiedBy: "SCAN", identificationScore: 1, quantity: 1, status: "CONFIRMED", fieldConfidence: { drugName: 1 }, createdAt: seconds(visit.at, position * 4), updatedAt: seconds(visit.at, position * 4) });
    });
    runs.push({ id: runId, pharmacyId, prescriptionId, status: "COMPLETED", engineVersion: ENGINE_VERSION, providers: { demo: true, simulated: true }, outcome: visit.outcome, isDemo: true, startedAt: seconds(visit.at, 25), finishedAt: seconds(visit.at, 27), durationMs: 1400 + ((visit.index * 137) % 900) });

    const purchased: { recommendationId: string; advice: PlannedVisit["advice"][number] }[] = [];
    for (const [position, advice] of visit.advice.entries()) {
      const recommendationId = randomUUID();
      let opportunityId: string | null = null;
      if (!advice.manual) {
        opportunityId = randomUUID();
        opportunities.push({ id: opportunityId, analysisRunId: runId, category: advice.category as never, title: advice.title, rationale: advice.reason, priority: 60, ruleKey: advice.ruleKey, ruleVersion: "1.0", coverage: "COVERED", createdAt: seconds(visit.at, 26) });
      }
      const drug = advice.target.kind === "drug" ? drugsByKey.get(advice.target.key) : null;
      if (advice.target.kind === "drug" && !drug) continue;
      const decided = advice.status !== "IGNORED";
      const decidedAt = minutes(visit.at, 2 + position);
      recommendations.push({
        id: recommendationId,
        pharmacyId,
        prescriptionId,
        analysisRunId: runId,
        opportunityId,
        productId: advice.target.kind === "product" ? (productIds.get(advice.target.slug) ?? null) : null,
        presentationId: drug?.presentationId ?? null,
        origin: advice.manual ? "MANUAL" : "AI",
        status: advice.status,
        totalScore: advice.manual ? 0 : 55 + ((visit.index * 7 + position * 11) % 38),
        justification: advice.reason,
        shortReason: advice.reason,
        quantity: advice.quantity,
        unitPriceCents: advice.unitPriceCents,
        decidedByUserId: decided ? memberId : null,
        decidedAt: decided ? decidedAt : null,
        presentedAt: decided ? decidedAt : null,
        isDemo: true,
        createdAt: seconds(visit.at, 28 + position),
        updatedAt: decidedAt,
      });
      events.push({ id: randomUUID(), recommendationId, type: advice.manual ? "MANUALLY_ADDED" : "GENERATED", userId: advice.manual ? memberId : null, createdAt: seconds(visit.at, 28 + position) });
      if (decided) events.push({ id: randomUUID(), recommendationId, type: advice.status === "DECLINED" ? "DECLINED_BY_PATIENT" : advice.status === "REMOVED" ? "REMOVED" : "ACCEPTED", userId: memberId, createdAt: decidedAt });
      if (advice.status === "IGNORED") events.push({ id: randomUUID(), recommendationId, type: "IGNORED", userId: null, createdAt: minutes(visit.at, 5) });
      if (advice.status === "PURCHASED") {
        events.push({ id: randomUUID(), recommendationId, type: "PURCHASED", userId: memberId, createdAt: minutes(visit.at, 4) });
        purchased.push({ recommendationId, advice });
      }
    }
    for (const gap of visit.gaps) {
      opportunities.push({ id: randomUUID(), analysisRunId: runId, category: gap.category as never, title: gap.title, rationale: "Un besoin réel que le rayon n'a pas couvert.", priority: 55, ruleKey: gap.ruleKey, ruleVersion: "1.0", coverage: gap.cause, createdAt: seconds(visit.at, 26) });
    }

    if (purchased.length > 0) {
      saleNumber += 1;
      const saleId = randomUUID();
      const total = purchased.reduce((sum, item) => sum + item.advice.unitPriceCents * item.advice.quantity, 0);
      const margin = purchased.reduce((sum, item) => sum + item.advice.marginCents * item.advice.quantity, 0);
      const attributed = purchased.filter((item) => !item.advice.manual);
      const attributedCents = attributed.reduce((sum, item) => sum + item.advice.unitPriceCents * item.advice.quantity, 0);
      const attributedMargin = attributed.reduce((sum, item) => sum + item.advice.marginCents * item.advice.quantity, 0);
      sales.push({ id: saleId, pharmacyId, prescriptionId, reference: `VTE-${String(saleNumber).padStart(4, "0")}`, channel: attributedCents > 0 ? "PHARMA_AI_ADVICE" : "COUNTER", totalCents: total, totalMarginCents: margin, attributedCents, attributedMarginCents: attributedMargin, userId: memberId, isDemo: true, createdAt: minutes(visit.at, 4) });
      for (const item of purchased) {
        const { advice } = item;
        const drug = advice.target.kind === "drug" ? drugsByKey.get(advice.target.key) : null;
        const label = advice.target.kind === "product" ? (DEMO_LABELS.get(advice.target.slug) ?? advice.title) : (drug?.name ?? advice.title);
        saleLines.push({ id: randomUUID(), saleId, productId: advice.target.kind === "product" ? (productIds.get(advice.target.slug) ?? null) : null, presentationId: drug?.presentationId ?? null, recommendationId: item.recommendationId, label, quantity: advice.quantity, unitPriceCents: advice.unitPriceCents, totalCents: advice.unitPriceCents * advice.quantity, marginCents: advice.marginCents * advice.quantity, vatRate: 20 });
      }
    }
  }

  await insertAll(prescriptions, (batch) => prisma.prescription.createMany({ data: batch }));
  await insertAll(lines, (batch) => prisma.prescriptionLine.createMany({ data: batch }));
  await insertAll(runs, (batch) => prisma.analysisRun.createMany({ data: batch }));
  await insertAll(opportunities, (batch) => prisma.adviceOpportunity.createMany({ data: batch }));
  await insertAll(recommendations, (batch) => prisma.recommendation.createMany({ data: batch }));
  await insertAll(events, (batch) => prisma.recommendationEvent.createMany({ data: batch }));
  await insertAll(sales, (batch) => prisma.sale.createMany({ data: batch }));
  await insertAll(saleLines, (batch) => prisma.saleLine.createMany({ data: batch }));
  return { sales: sales.length, recommendations: recommendations.length };
}

const DEMO_LABELS = new Map(DEMO_SHELF.map((item) => [item.slug, item.name]));
