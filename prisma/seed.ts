/**
 * JEU DE DONNÉES DE DÉMONSTRATION PHARMA.AI
 *
 * ⚠️ TOUT est fictif : officines, collaborateurs, patients, ordonnances,
 * produits, prix et ventes. Aucune donnée réelle, aucun patient réel, aucune
 * ordonnance réelle. Les fiches médicamenteuses portent `isDemoData = true` et
 * l'application affiche en permanence le bandeau « Mode démonstration ».
 *
 * Exécution : `npm run db:seed`
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env", quiet: true });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../src/generated/prisma";
import { DEMO_DRUGS } from "./seed-data/drugs";
import { DEMO_DISCLAIMER, DOCUMENT_DISCLAIMERS } from "../src/core/documents/types";
import { DEMO_PRODUCTS } from "./seed-data/products";
import { hashPasswordSync } from "./seed-utils";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DEMO_PASSWORD = "Demo2026!Pharma";

// Générateur pseudo-aléatoire déterministe : deux exécutions du seed produisent
// exactement le même jeu, ce qui rend les captures et les tests reproductibles.
let seedState = 20260101;
function random(): number {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
}
function pick<T>(items: T[]): T {
  return items[Math.floor(random() * items.length)];
}
function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}
function daysAgo(days: number, hour = 10, minute = 0): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

async function reset() {
  console.log("→ Réinitialisation du jeu de démonstration…");
  // L'ordre respecte les contraintes de clés étrangères.
  await prisma.recommendationEvent.deleteMany();
  await prisma.saleLine.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.documentDelivery.deleteMany();
  await prisma.patientDocument.deleteMany();
  await prisma.recommendation.deleteMany();
  await prisma.adviceOpportunity.deleteMany();
  await prisma.safetyFinding.deleteMany();
  await prisma.analysisRun.deleteMany();
  await prisma.treatmentExplanation.deleteMany();
  await prisma.prescriptionLine.deleteMany();
  await prisma.prescription.deleteMany();
  await prisma.patientInteraction.deleteMany();
  await prisma.patientConsent.deleteMany();
  await prisma.patientHealthProfile.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.stockItem.deleteMany();
  await prisma.pharmacyRule.deleteMany();
  await prisma.product.deleteMany();
  await prisma.importJob.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.aiUsageRecord.deleteMany();
  await prisma.session.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.user.deleteMany();
  await prisma.pharmacy.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.drugReference.deleteMany();
  await prisma.platformAdminSession.deleteMany();
  await prisma.platformAdmin.deleteMany();
  await prisma.platformIncident.deleteMany();
}

async function seedPlans() {
  console.log("→ Plans d'abonnement");
  const plans: Prisma.PlanCreateInput[] = [
    {
      code: "ESSENTIEL",
      name: "Essentiel",
      description: "Une officine, jusqu'à 5 collaborateurs. Le parcours complet de conseil.",
      monthlyPriceCents: 12900,
      limits: { maxPharmacies: 1, maxUsers: 5, maxPrescriptionsPerMonth: 400 },
    },
    {
      code: "PRO",
      name: "Pro",
      description: "Une officine, équipe illimitée, analytics avancés et règles de conseil.",
      monthlyPriceCents: 24900,
      limits: { maxPharmacies: 1, maxUsers: null, maxPrescriptionsPerMonth: 2000 },
    },
    {
      code: "GROUPE",
      name: "Groupe",
      description: "Plusieurs officines, disponibilité inter-sites et pilotage consolidé.",
      monthlyPriceCents: 49900,
      limits: { maxPharmacies: null, maxUsers: null, maxPrescriptionsPerMonth: null },
    },
  ];

  for (const plan of plans) {
    await prisma.plan.create({ data: plan });
  }
  return prisma.plan.findFirstOrThrow({ where: { code: "GROUPE" } });
}

async function seedDrugReferences() {
  console.log(`→ Référentiel médicamenteux fictif (${DEMO_DRUGS.length} fiches)`);
  for (const drug of DEMO_DRUGS) {
    await prisma.drugReference.create({
      data: {
        cisCode: drug.cisCode,
        name: drug.name,
        inn: drug.inn,
        atcCode: drug.atcCode,
        therapeuticClass: drug.therapeuticClass,
        form: drug.form,
        strength: drug.strength,
        commonSideEffects: drug.commonSideEffects,
        interactionClasses: drug.interactionClasses,
        cautionPopulations: drug.cautionPopulations,
        patientExplanation: drug.patientExplanation,
        intakeAdvice: drug.intakeAdvice,
        sourceName: "Jeu de démonstration Pharma.ai",
        sourceVersion: "demo-2026.1",
        sourceUrl: null,
        isDemoData: true,
      },
    });
  }
}

const PATIENTS = [
  { firstName: "Camille", lastName: "Berthier", birthDate: "1978-04-12", sex: "FEMALE", city: "Lyon", email: "camille.berthier@exemple.fr", phone: "06 12 34 56 78" },
  { firstName: "Julien", lastName: "Marchand", birthDate: "1991-09-03", sex: "MALE", city: "Lyon", email: "julien.marchand@exemple.fr", phone: "06 23 45 67 89" },
  { firstName: "Nadia", lastName: "Ferrand", birthDate: "1965-01-27", sex: "FEMALE", city: "Villeurbanne", email: "nadia.ferrand@exemple.fr", phone: "06 34 56 78 90" },
  { firstName: "Thomas", lastName: "Leclerc", birthDate: "1984-11-19", sex: "MALE", city: "Lyon", email: "thomas.leclerc@exemple.fr", phone: "06 45 67 89 01" },
  { firstName: "Sophie", lastName: "Nguyen", birthDate: "1996-06-08", sex: "FEMALE", city: "Lyon", email: "sophie.nguyen@exemple.fr", phone: "06 56 78 90 12" },
  { firstName: "Marc", lastName: "Delaunay", birthDate: "1952-03-30", sex: "MALE", city: "Caluire", email: "marc.delaunay@exemple.fr", phone: "06 67 89 01 23" },
  { firstName: "Inès", lastName: "Bouchard", birthDate: "2001-08-14", sex: "FEMALE", city: "Lyon", email: "ines.bouchard@exemple.fr", phone: "06 78 90 12 34" },
  { firstName: "Pierre", lastName: "Vasseur", birthDate: "1970-12-05", sex: "MALE", city: "Lyon", email: null, phone: "06 89 01 23 45" },
  { firstName: "Léa", lastName: "Fontaine", birthDate: "1988-02-21", sex: "FEMALE", city: "Villeurbanne", email: "lea.fontaine@exemple.fr", phone: "06 90 12 34 56" },
  { firstName: "Antoine", lastName: "Roux", birthDate: "1959-07-17", sex: "MALE", city: "Lyon", email: "antoine.roux@exemple.fr", phone: "07 01 23 45 67" },
  { firstName: "Chloé", lastName: "Mercier", birthDate: "1993-10-09", sex: "FEMALE", city: "Lyon", email: "chloe.mercier@exemple.fr", phone: "07 12 34 56 78" },
  { firstName: "Karim", lastName: "Benali", birthDate: "1975-05-23", sex: "MALE", city: "Vaulx-en-Velin", email: "karim.benali@exemple.fr", phone: "07 23 45 67 89" },
  { firstName: "Hélène", lastName: "Girard", birthDate: "1948-09-11", sex: "FEMALE", city: "Caluire", email: null, phone: "07 34 56 78 90" },
  { firstName: "Lucas", lastName: "Petit", birthDate: "2005-01-04", sex: "MALE", city: "Lyon", email: null, phone: "07 45 67 89 01" },
] as const;

/**
 * Patients supplémentaires générés pour atteindre une patientèle réaliste.
 * Noms et prénoms courants, combinés de façon déterministe : aucune personne
 * réelle n'est visée.
 */
const FIRST_NAMES_F = ["Marie", "Isabelle", "Nathalie", "Sylvie", "Céline", "Aurélie", "Julie", "Émilie", "Laura", "Manon", "Sarah", "Élodie", "Amandine", "Christine", "Valérie", "Sandrine", "Patricia", "Corinne", "Anne", "Claire"];
const FIRST_NAMES_M = ["Jean", "Michel", "Philippe", "Alain", "Patrick", "Nicolas", "Christophe", "Laurent", "David", "Sébastien", "Olivier", "Stéphane", "Frédéric", "Vincent", "Guillaume", "Alexandre", "Maxime", "Romain", "Baptiste", "Mathieu"];
const LAST_NAMES = ["Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Durand", "Moreau", "Simon", "Laurent", "Michel", "Garcia", "David", "Bertrand", "Roux", "Vincent", "Fournier", "Morel", "Girard", "André", "Lefèvre", "Mercier", "Blanc", "Guérin", "Boyer", "Garnier", "Chevalier", "Francois", "Legrand", "Gauthier", "Perrin", "Robin", "Clement", "Morin", "Nicolas", "Henry", "Roussel", "Mathieu", "Gautier", "Masson"];
const CITIES = ["Lyon", "Villeurbanne", "Caluire", "Vaulx-en-Velin", "Bron", "Vénissieux", "Écully"];

function generateExtraPatients(count: number) {
  const patients: {
    firstName: string;
    lastName: string;
    birthDate: string;
    sex: "FEMALE" | "MALE";
    city: string;
    email: string | null;
    phone: string;
  }[] = [];

  for (let i = 0; i < count; i += 1) {
    const isFemale = random() < 0.54;
    const firstName = isFemale ? pick(FIRST_NAMES_F) : pick(FIRST_NAMES_M);
    const lastName = pick(LAST_NAMES);
    const birthYear = randomInt(1935, 2016);
    const birthMonth = randomInt(1, 12);
    const birthDay = randomInt(1, 28);
    const city = pick(CITIES);
    const slug = `${firstName}.${lastName}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    patients.push({
      firstName,
      lastName,
      birthDate: `${birthYear}-${String(birthMonth).padStart(2, "0")}-${String(birthDay).padStart(2, "0")}`,
      sex: isFemale ? "FEMALE" : "MALE",
      city,
      // Une partie de la patientèle n'a pas d'adresse renseignée : c'est ce qui
      // permet de montrer le garde-fou sur l'envoi de la fiche.
      email: random() < 0.68 ? `${slug}${i}@exemple.fr` : null,
      phone: `0${randomInt(6, 7)} ${randomInt(10, 99)} ${randomInt(10, 99)} ${randomInt(10, 99)} ${randomInt(10, 99)}`,
    });
  }

  return patients;
}

/** Profils de santé fictifs, pour illustrer les garde-fous du moteur. */
const HEALTH_PROFILES: Record<
  string,
  {
    allergies?: string[];
    conditions?: string[];
    isPregnant?: boolean;
    isBreastfeeding?: boolean;
    renalImpairment?: boolean;
  }
> = {
  Berthier: { allergies: ["pénicilline"], conditions: ["asthme léger"] },
  Nguyen: { isPregnant: true },
  Delaunay: { renalImpairment: true, conditions: ["hypertension"] },
  Girard: { conditions: ["ostéoporose", "hypertension"] },
  Benali: { allergies: ["arachide"] },
  Fontaine: { isBreastfeeding: true },
};

async function main() {
  await reset();

  const groupPlan = await seedPlans();
  await seedDrugReferences();

  console.log("→ Groupe et officines");
  const organization = await prisma.organization.create({
    data: {
      name: "Groupe Officines Saint-Michel",
      slug: "groupe-saint-michel",
      siren: "000000000",
    },
  });

  await prisma.subscription.create({
    data: {
      organizationId: organization.id,
      planId: groupPlan.id,
      status: "TRIALING",
      seats: 10,
      trialEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 21),
      currentPeriodStart: daysAgo(9),
    },
  });

  const pharmacy = await prisma.pharmacy.create({
    data: {
      organizationId: organization.id,
      name: "Pharmacie Saint-Michel",
      slug: "pharmacie-saint-michel",
      finessNumber: "690000000",
      siret: "00000000000000",
      orderNumber: "00000",
      email: "contact@pharmacie-saint-michel.exemple.fr",
      phone: "04 00 00 00 00",
      addressLine1: "12 rue des Remparts",
      postalCode: "69003",
      city: "Lyon",
      brandColor: "#0F766E",
      isDemo: true,
      settings: {
        enableSiblingAvailability: true,
        maxRecommendationsPerPrescription: 4,
        requirePatientConsentForDocument: true,
      },
    },
  });

  const secondPharmacy = await prisma.pharmacy.create({
    data: {
      organizationId: organization.id,
      name: "Pharmacie des Halles",
      slug: "pharmacie-des-halles",
      finessNumber: "690000001",
      email: "contact@pharmacie-des-halles.exemple.fr",
      phone: "04 00 00 00 01",
      addressLine1: "3 place du Marché",
      postalCode: "69006",
      city: "Lyon",
      brandColor: "#0F766E",
      isDemo: true,
    },
  });

  console.log("→ Collaborateurs");
  const passwordHash = hashPasswordSync(DEMO_PASSWORD);

  const team = [
    { firstName: "Claire", lastName: "Dumont", email: "titulaire@pharma.ai", role: "OWNER" as const, rpps: "10000000001" },
    { firstName: "Hugo", lastName: "Lambert", email: "pharmacien@pharma.ai", role: "PHARMACIST" as const, rpps: "10000000002" },
    { firstName: "Sarah", lastName: "Ould", email: "pharmacienne@pharma.ai", role: "PHARMACIST" as const, rpps: "10000000003" },
    { firstName: "Yanis", lastName: "Costa", email: "preparateur@pharma.ai", role: "TECHNICIAN" as const, rpps: null },
    { firstName: "Emma", lastName: "Rivière", email: "etudiante@pharma.ai", role: "STUDENT" as const, rpps: null },
  ];

  const users = [];
  for (const member of team) {
    const user = await prisma.user.create({
      data: {
        organizationId: organization.id,
        email: member.email,
        passwordHash,
        firstName: member.firstName,
        lastName: member.lastName,
        rppsNumber: member.rpps,
        status: "ACTIVE",
        lastLoginAt: daysAgo(randomInt(0, 3), randomInt(8, 18)),
      },
    });

    await prisma.membership.create({
      data: { userId: user.id, pharmacyId: pharmacy.id, role: member.role },
    });

    // La titulaire pilote les deux officines du groupe.
    if (member.role === "OWNER") {
      await prisma.membership.create({
        data: { userId: user.id, pharmacyId: secondPharmacy.id, role: "OWNER" },
      });
    }

    users.push({ ...user, role: member.role });
  }

  for (const user of users) {
    PHARMACIST_NAMES[user.id] = `${user.firstName} ${user.lastName}`;
  }

  const owner = users.find((u) => u.role === "OWNER")!;
  const pharmacists = users.filter((u) => u.role === "PHARMACIST");
  const technician = users.find((u) => u.role === "TECHNICIAN")!;

  // Le préparateur reçoit une permission supplémentaire, pour illustrer le RBAC.
  await prisma.membership.updateMany({
    where: { userId: technician.id, pharmacyId: pharmacy.id },
    data: { grantedPermissions: ["analytics:view"] },
  });

  console.log(`→ Catalogue (${DEMO_PRODUCTS.length} références)`);
  const products = [];
  for (const [index, item] of DEMO_PRODUCTS.entries()) {
    const product = await prisma.product.create({
      data: {
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
        matchingTags: item.matchingTags,
        contraindications: item.contraindications,
        purchasePriceCents: item.purchasePriceCents,
        salePriceCents: item.salePriceCents,
        vatRate: item.vatRate,
        isDemo: true,
        stockItem: {
          create: {
            pharmacyId: pharmacy.id,
            quantity: item.quantity,
            alertThreshold: item.alertThreshold,
            location: item.location,
            lastCountedAt: daysAgo(randomInt(2, 30)),
          },
        },
      },
      include: { stockItem: true },
    });

    await prisma.stockMovement.create({
      data: {
        pharmacyId: pharmacy.id,
        productId: product.id,
        type: "IMPORT",
        quantityDelta: item.quantity,
        quantityAfter: item.quantity,
        reason: "Initialisation du catalogue de démonstration",
        userId: technician.id,
        createdAt: daysAgo(45),
      },
    });

    products.push(product);
  }

  // Quelques références dans la seconde officine, pour la disponibilité groupe.
  for (const item of DEMO_PRODUCTS.slice(0, 12)) {
    await prisma.product.create({
      data: {
        pharmacyId: secondPharmacy.id,
        organizationId: organization.id,
        name: item.name,
        brand: item.brand,
        category: item.category,
        subCategory: item.subCategory,
        reference: `HAL-${item.ean.slice(-4)}`,
        ean: item.ean,
        imageUrl: `/produits/${item.slug}.svg`,
        commercialClaims: item.commercialClaims,
        matchingTags: item.matchingTags,
        purchasePriceCents: item.purchasePriceCents,
        salePriceCents: item.salePriceCents,
        vatRate: item.vatRate,
        isDemo: true,
        stockItem: {
          create: {
            pharmacyId: secondPharmacy.id,
            quantity: randomInt(5, 40),
            alertThreshold: 6,
          },
        },
      },
    });
  }

  console.log("→ Règles de conseil de l'officine");
  const preferredProbio = products.find((p) => p.name.startsWith("Flore Équilibre"))!;
  const excludedPhyto = products.find((p) => p.name.startsWith("Échinacée"))!;

  await prisma.pharmacyRule.createMany({
    data: [
      {
        pharmacyId: pharmacy.id,
        type: "PREFER_PRODUCT",
        productId: preferredProbio.id,
        note: "Référence de référence de l'officine pour l'accompagnement d'une antibiothérapie.",
        weight: 1,
        createdByUserId: owner.id,
      },
      {
        pharmacyId: pharmacy.id,
        type: "EXCLUDE_PRODUCT",
        productId: excludedPhyto.id,
        note: "Retiré du conseil comptoir en attendant la nouvelle formule fournisseur.",
        weight: 1,
        createdByUserId: owner.id,
      },
    ],
  });

  const allPatients = [...PATIENTS, ...generateExtraPatients(126)];
  console.log(`→ Patients (${allPatients.length})`);
  const patients = [];
  for (const [index, item] of allPatients.entries()) {
    const patient = await prisma.patient.create({
      data: {
        pharmacyId: pharmacy.id,
        reference: `PAT-${String(index + 1).padStart(4, "0")}`,
        firstName: item.firstName,
        lastName: item.lastName,
        birthDate: new Date(item.birthDate),
        sex: item.sex,
        email: item.email,
        phone: item.phone,
        city: item.city,
        postalCode: item.city === "Lyon" ? "69003" : "69100",
        isDemo: true,
        createdAt: daysAgo(randomInt(30, 180)),
      },
    });

    // Consentements : tous ne sont pas accordés, pour illustrer le garde-fou.
    const grantsAdvice = index % 5 !== 0;
    await prisma.patientConsent.createMany({
      data: [
        {
          patientId: patient.id,
          type: "DATA_PROCESSING",
          granted: true,
          grantedAt: patient.createdAt,
          collectedByUserId: technician.id,
        },
        {
          patientId: patient.id,
          type: "HEALTH_DATA",
          granted: true,
          grantedAt: patient.createdAt,
          collectedByUserId: pharmacists[0].id,
        },
        {
          patientId: patient.id,
          type: "ADVICE_SHARING",
          granted: grantsAdvice,
          grantedAt: grantsAdvice ? patient.createdAt : null,
          revokedAt: grantsAdvice ? null : patient.createdAt,
          collectedByUserId: technician.id,
        },
      ],
    });

    const profile = HEALTH_PROFILES[item.lastName];
    if (profile) {
      // Les champs libres sont chiffrés par l'application ; le seed écrit ici
      // via la même fonction utilitaire pour rester cohérent.
      const { encryptListSync, encryptFieldSync } = await import("./seed-utils");
      await prisma.patientHealthProfile.create({
        data: {
          patientId: patient.id,
          allergiesEncrypted: encryptListSync(profile.allergies ?? []),
          conditionsEncrypted: encryptListSync(profile.conditions ?? []),
          notesEncrypted: encryptFieldSync(
            "Profil de démonstration — donnée fictive saisie automatiquement.",
          ),
          isPregnant: profile.isPregnant ?? null,
          isBreastfeeding: profile.isBreastfeeding ?? null,
          renalImpairment: profile.renalImpairment ?? null,
          updatedByUserId: pharmacists[0].id,
        },
      });
    }

    patients.push(patient);
  }

  console.log("→ Ordonnances, analyses, conseils et ventes");
  await seedHistory({ pharmacy, products, patients, pharmacists, technician, owner });

  console.log("→ Notifications");
  const lowStock = products.filter(
    (p) => p.stockItem && p.stockItem.quantity <= p.stockItem.alertThreshold,
  );
  for (const product of lowStock.slice(0, 5)) {
    const out = (product.stockItem?.quantity ?? 0) <= 0;
    await prisma.notification.create({
      data: {
        pharmacyId: pharmacy.id,
        type: out ? "OUT_OF_STOCK" : "LOW_STOCK",
        severity: out ? "CRITICAL" : "WARNING",
        title: out ? "Produit épuisé" : "Stock faible",
        body: out
          ? `${product.name} est en rupture. Il ne sera plus proposé en conseil.`
          : `${product.name} : ${product.stockItem?.quantity} unité(s) restante(s).`,
        linkUrl: `/produits/${product.id}`,
        metadata: { productId: product.id },
        createdAt: daysAgo(randomInt(0, 2), randomInt(9, 17)),
      },
    });
  }

  await prisma.notification.create({
    data: {
      pharmacyId: pharmacy.id,
      type: "SYSTEM",
      severity: "INFO",
      title: "Bienvenue dans Pharma.ai",
      body: "Ce compte fonctionne sur un jeu de données entièrement fictif. Importez une ordonnance de démonstration pour dérouler le parcours complet.",
      linkUrl: "/ordonnances/nouvelle",
      createdAt: daysAgo(9, 9),
    },
  });

  console.log("→ Administration plateforme");
  await prisma.platformAdmin.create({
    data: {
      email: "superadmin@pharma.ai",
      passwordHash,
      firstName: "Alex",
      lastName: "Moreau",
    },
  });

  await prisma.platformIncident.create({
    data: {
      pharmacyId: pharmacy.id,
      severity: "INFO",
      code: "DEMO_ENVIRONMENT",
      title: "Environnement de démonstration actif",
      detail:
        "Cette organisation fonctionne sur le jeu de données fictif. Aucune donnée réelle n'est traitée.",
    },
  });

  const counts = {
    patients: await prisma.patient.count(),
    produits: await prisma.product.count(),
    ordonnances: await prisma.prescription.count(),
    recommandations: await prisma.recommendation.count(),
    ventes: await prisma.sale.count(),
  };

  console.log("\n✓ Jeu de démonstration installé");
  console.table(counts);
  console.log(`\n  Connexion :`);
  console.log(`    Titulaire    titulaire@pharma.ai      / ${DEMO_PASSWORD}`);
  console.log(`    Pharmacien   pharmacien@pharma.ai     / ${DEMO_PASSWORD}`);
  console.log(`    Préparateur  preparateur@pharma.ai    / ${DEMO_PASSWORD}`);
  console.log(`    Super admin  superadmin@pharma.ai     / ${DEMO_PASSWORD}\n`);
}

// ---------------------------------------------------------------------------
// Historique : ordonnances analysées, conseils validés, ventes attribuées
// ---------------------------------------------------------------------------

type SeedProduct = Awaited<ReturnType<typeof prisma.product.create>> & {
  stockItem: { quantity: number; alertThreshold: number } | null;
};

/** Nom complet par identifiant, pour signer les fiches patient générées. */
const PHARMACIST_NAMES: Record<string, string> = {};

const SCENARIOS = [
  {
    id: "antibio-amoxicilline",
    prescriber: "Dr Camille Rousseau",
    lines: [
      { drug: "Amoxicilline", dosage: "1 g", form: "Comprimé dispersible", posology: "1 comprimé matin et soir", duration: 6, quantity: 12, instructions: "Au cours des repas" },
      { drug: "Paracétamol", dosage: "1 g", form: "Comprimé", posology: "1 comprimé si douleur, max 3 par jour", duration: 5, quantity: 16, instructions: null },
    ],
    opportunity: {
      key: "digestive-tolerance-antibiotics",
      title: "Tolérance digestive pendant l'antibiothérapie",
      category: "PROBIOTIQUES" as const,
      rationale:
        "Une antibiothérapie (Amoxicilline) peut perturber la flore intestinale. Un accompagnement de la tolérance digestive peut être pertinent selon le patient et la durée du traitement.",
      priority: 72,
    },
    productSlugs: ["probio-flore-10", "probio-confort"],
  },
  {
    id: "dermato-eczema",
    prescriber: "Dr Antoine Mercier",
    lines: [
      { drug: "Bétaméthasone", dosage: "0,05 %", form: "Crème", posology: "1 application le soir", duration: 10, quantity: 1, instructions: "Sur les zones atteintes uniquement" },
      { drug: "Cétirizine", dosage: "10 mg", form: "Comprimé", posology: "1 comprimé le soir", duration: 14, quantity: 14, instructions: null },
    ],
    opportunity: {
      key: "hydration-dermato-topical",
      title: "Accompagnement cutané d'un traitement dermatologique",
      category: "DERMOCOSMETIQUE" as const,
      rationale:
        "Un traitement dermatologique local (Bétaméthasone) s'accompagne souvent d'une sécheresse ou d'une sensibilité cutanée. Un soin émollient adapté peut soutenir la tolérance du traitement.",
      priority: 68,
    },
    productSlugs: ["creme-emolliente", "baume-reparateur"],
  },
  {
    id: "cycline-acne",
    prescriber: "Dr Sophie Lemaire",
    lines: [
      { drug: "Doxycycline", dosage: "100 mg", form: "Comprimé", posology: "1 comprimé par jour", duration: 60, quantity: 30, instructions: "Avec un grand verre d'eau, ne pas s'allonger après la prise" },
    ],
    opportunity: {
      key: "sun-photosensitivity",
      title: "Photosensibilisation",
      category: "DERMOCOSMETIQUE" as const,
      rationale:
        "Doxycycline est associé à un risque de photosensibilisation. Une protection solaire est un conseil de sécurité, pas un simple conseil de confort.",
      priority: 70,
    },
    productSlugs: ["spf50-visage", "stick-levres-spf"],
  },
  {
    id: "fer-anemie",
    prescriber: "Dr Nadia Bouchard",
    lines: [
      { drug: "Fumarate de fer", dosage: "80 mg", form: "Gélule", posology: "1 gélule par jour à jeun", duration: 90, quantity: 30, instructions: "À distance du thé et du café" },
    ],
    opportunity: {
      key: "iron-absorption-support",
      title: "Tolérance d'une supplémentation martiale",
      category: "NUTRITION" as const,
      rationale:
        "Une supplémentation martiale (Fumarate de fer) entraîne fréquemment une constipation. Un accompagnement du transit peut favoriser l'observance.",
      priority: 58,
    },
    productSlugs: ["fibres-transit"],
  },
  {
    id: "ains-lombalgie",
    prescriber: "Dr Julien Petit",
    lines: [
      { drug: "Ibuprofène", dosage: "400 mg", form: "Comprimé", posology: "1 comprimé 3 fois par jour", duration: 5, quantity: 30, instructions: "Au cours des repas" },
      { drug: "Thiocolchicoside", dosage: "4 mg", form: "Comprimé", posology: "1 comprimé matin et soir", duration: 5, quantity: 10, instructions: null },
    ],
    opportunity: {
      key: "gastric-protection-nsaid",
      title: "Confort gastrique sous anti-inflammatoire",
      category: "SOINS" as const,
      rationale:
        "Ibuprofène est un anti-inflammatoire ; l'inconfort gastrique est un motif fréquent d'arrêt du traitement. Un rappel des règles de prise, éventuellement accompagné d'un conseil, peut améliorer l'observance.",
      priority: 64,
    },
    productSlugs: ["argile-gastrique"],
  },
  {
    id: "antidepresseur-fatigue",
    prescriber: "Dr Hélène Marchal",
    lines: [
      { drug: "Escitalopram", dosage: "10 mg", form: "Comprimé", posology: "1 comprimé le matin", duration: 30, quantity: 28, instructions: null },
    ],
    opportunity: {
      key: "magnesium-fatigue",
      title: "Fatigue et tension musculaire",
      category: "MAGNESIUM" as const,
      rationale:
        "Le contexte du traitement (Escitalopram) s'accompagne fréquemment d'une fatigue rapportée au comptoir. Un apport en magnésium peut être discuté si l'alimentation est insuffisante.",
      priority: 48,
    },
    productSlugs: ["magnesium-marin-b6", "magnesium-bisglycinate"],
  },
];

async function seedHistory(context: {
  pharmacy: { id: string };
  products: SeedProduct[];
  patients: { id: string; firstName: string; lastName: string; reference: string }[];
  pharmacists: { id: string }[];
  technician: { id: string };
  owner: { id: string };
}) {
  const { pharmacy, products, patients, pharmacists, technician, owner } = context;
  const bySlugName = new Map(products.map((p) => [p.imageUrl?.split("/").pop()?.replace(".svg", "") ?? "", p]));

  let prescriptionIndex = 0;
  let saleIndex = 0;

  // Volume réaliste d'officine : une pharmacie de quartier délivre beaucoup
  // d'ordonnances, dont une partie donne lieu à un conseil accompagné. On
  // simule ~10 à 18 parcours Pharma.ai par jour ouvré sur 90 jours, avec une
  // adoption croissante — le tableau de bord montre alors une vraie tendance.
  const schedule: number[] = [];
  for (let day = 89; day >= 0; day -= 1) {
    const date = daysAgo(day);
    const weekday = date.getDay();
    if (weekday === 0) continue; // officine fermée le dimanche
    const isSaturday = weekday === 6;

    // Montée en charge : l'usage s'installe progressivement dans l'équipe.
    const adoption = 0.45 + ((89 - day) / 89) * 0.55;
    const base = isSaturday ? 7 : 15;
    const count = Math.max(1, Math.round(base * adoption * (0.75 + random() * 0.5)));

    for (let i = 0; i < count; i += 1) schedule.push(day);
  }

  for (const day of schedule) {
    const scenario = pick(SCENARIOS);
    const patient = pick(patients);
    // Les adjoints traitent la majorité des ordonnances ; la titulaire tient
    // aussi le comptoir, plus ponctuellement — les statistiques d'équipe le
    // reflètent.
    const pharmacist = random() < 0.15 ? owner : pick(pharmacists);
    const createdAt = daysAgo(day, randomInt(9, 18), randomInt(0, 59));

    prescriptionIndex += 1;
    const reference = `ORD-${String(prescriptionIndex).padStart(4, "0")}`;

    const prescription = await prisma.prescription.create({
      data: {
        pharmacyId: pharmacy.id,
        patientId: patient.id,
        reference,
        status: "VALIDATED",
        source: pick(["PHOTO", "SCAN", "IMAGE_UPLOAD", "PDF_UPLOAD"] as const),
        prescriberName: scenario.prescriber,
        prescriberRpps: `1000${randomInt(1000000, 9999999)}`,
        prescribedAt: new Date(createdAt.getTime() - 1000 * 60 * 60 * 24),
        ocrConfidence: Number((0.86 + random() * 0.12).toFixed(3)),
        ocrProvider: "mock-ocr",
        createdByUserId: pick([technician.id, pharmacist.id]),
        verifiedByUserId: pharmacist.id,
        verifiedAt: new Date(createdAt.getTime() + 1000 * 60 * 3),
        validatedAt: new Date(createdAt.getTime() + 1000 * 60 * 7),
        isDemo: true,
        createdAt,
        lines: {
          create: scenario.lines.map((line, position) => ({
            position,
            rawText: `${line.drug} ${line.dosage ?? ""} — ${line.posology ?? ""}`.trim(),
            drugName: line.drug,
            dosage: line.dosage,
            form: line.form,
            posology: line.posology,
            durationDays: line.duration,
            quantity: line.quantity,
            instructions: line.instructions,
            status: "CONFIRMED" as const,
            fieldConfidence: {
              drugName: Number((0.88 + random() * 0.11).toFixed(2)),
              dosage: Number((0.82 + random() * 0.15).toFixed(2)),
              posology: Number((0.8 + random() * 0.17).toFixed(2)),
            },
          })),
        },
      },
    });

    const analysisRun = await prisma.analysisRun.create({
      data: {
        pharmacyId: pharmacy.id,
        prescriptionId: prescription.id,
        status: "COMPLETED",
        engineVersion: "1.0.0",
        providers: { ocr: "mock-ocr", ai: "rule-based", knowledge: "local-demo", simulated: true },
        inputSnapshot: {
          lineCount: scenario.lines.length,
          confirmedLines: scenario.lines.length,
          catalogSize: products.length,
          patientContextAvailable: true,
        },
        traceJson: [
          { stage: "SAFETY", label: "Contrôles de sécurité", status: "OK", durationMs: randomInt(4, 18), inputCount: scenario.lines.length, outputCount: randomInt(1, 3), notes: [] },
          { stage: "TREATMENT_UNDERSTANDING", label: "Compréhension du traitement", status: "OK", durationMs: randomInt(6, 22), inputCount: scenario.lines.length, outputCount: scenario.lines.length, notes: [] },
          { stage: "ADVICE_OPPORTUNITIES", label: "Opportunités de conseil", status: "OK", durationMs: randomInt(2, 9), inputCount: scenario.lines.length, outputCount: 1, notes: [] },
          { stage: "CATALOG_MATCHING", label: "Appariement avec le stock", status: "OK", durationMs: randomInt(5, 20), inputCount: 1, outputCount: scenario.productSlugs.length, notes: [] },
          { stage: "SCORING", label: "Classement explicable", status: "OK", durationMs: randomInt(3, 12), inputCount: scenario.productSlugs.length, outputCount: scenario.productSlugs.length, notes: [] },
          { stage: "COMMERCIAL_OPTIMIZATION", label: "Optimisation commerciale autorisée", status: "OK", durationMs: randomInt(1, 5), inputCount: scenario.productSlugs.length, outputCount: 1, notes: [] },
        ],
        isDemo: true,
        startedAt: createdAt,
        finishedAt: new Date(createdAt.getTime() + 1400),
        durationMs: randomInt(600, 1800),
      },
    });

    const opportunity = await prisma.adviceOpportunity.create({
      data: {
        analysisRunId: analysisRun.id,
        category: scenario.opportunity.category,
        title: scenario.opportunity.title,
        rationale: scenario.opportunity.rationale,
        clinicalContext: "Appréciation au cas par cas selon le contexte du patient.",
        safetyNotes: [],
        priority: scenario.opportunity.priority,
      },
    });

    const candidateSlug = pick(scenario.productSlugs);
    const product = bySlugName.get(candidateSlug);
    if (!product) continue;

    // Répartition réaliste des issues : tout n'est ni accepté, ni acheté.
    const roll = random();
    const outcome =
      roll < 0.14 ? "REMOVED" : roll < 0.24 ? "REPLACED" : roll < 0.62 ? "PURCHASED" : "DECLINED";

    const relevance = 0.66 + random() * 0.3;
    const availability = (product.stockItem?.quantity ?? 0) > 0 ? 1 : 0.35;
    const breakdown = {
      relevance: Number(relevance.toFixed(3)),
      safety: 1,
      patientFit: Number((0.82 + random() * 0.16).toFixed(3)),
      availability,
      pharmacistPreference: Number((0.5 + random() * 0.45).toFixed(3)),
      validationHistory: 0.5,
      commercial: Number((0.4 + random() * 0.4).toFixed(3)),
    };
    const totalScore = Number(
      (
        breakdown.relevance * 0.34 +
        breakdown.safety * 0.22 +
        breakdown.patientFit * 0.16 +
        breakdown.availability * 0.14 +
        breakdown.pharmacistPreference * 0.08 +
        breakdown.validationHistory * 0.04 +
        breakdown.commercial * 0.02
      ).toFixed(4),
    );

    const recommendation = await prisma.recommendation.create({
      data: {
        pharmacyId: pharmacy.id,
        prescriptionId: prescription.id,
        analysisRunId: analysisRun.id,
        opportunityId: opportunity.id,
        productId: product.id,
        origin: "AI",
        status: outcome === "REMOVED" ? "REMOVED" : outcome === "DECLINED" ? "DECLINED" : outcome === "REPLACED" ? "REPLACED" : "PURCHASED",
        scoreBreakdown: breakdown,
        totalScore,
        justification: `${scenario.opportunity.title} — ${scenario.opportunity.rationale} Référence retenue : ${product.name}.`,
        patientReason:
          product.commercialClaims[0] ??
          "Conseil proposé par votre pharmacien dans le cadre de votre traitement.",
        precautions: product.precautions,
        quantity: 1,
        unitPriceCents: product.salePriceCents,
        decidedByUserId: pharmacist.id,
        decidedAt: new Date(createdAt.getTime() + 1000 * 60 * 5),
        pharmacistNote:
          outcome === "REMOVED"
            ? pick([
                "Patient déjà supplémenté.",
                "Non pertinent au vu du contexte évoqué au comptoir.",
                "Conseil déjà donné lors de la délivrance précédente.",
              ])
            : null,
        presentedAt:
          outcome === "REMOVED" ? null : new Date(createdAt.getTime() + 1000 * 60 * 8),
        isDemo: true,
        createdAt,
      },
    });

    await prisma.recommendationEvent.createMany({
      data: [
        {
          recommendationId: recommendation.id,
          type: "GENERATED",
          metadata: { engineVersion: "1.0.0", totalScore },
          createdAt,
        },
        ...(outcome === "REMOVED"
          ? [
              {
                recommendationId: recommendation.id,
                type: "REMOVED" as const,
                userId: pharmacist.id,
                createdAt: new Date(createdAt.getTime() + 1000 * 60 * 5),
              },
            ]
          : [
              {
                recommendationId: recommendation.id,
                type: "ACCEPTED" as const,
                userId: pharmacist.id,
                createdAt: new Date(createdAt.getTime() + 1000 * 60 * 5),
              },
              {
                recommendationId: recommendation.id,
                type: "PRESENTED_TO_PATIENT" as const,
                userId: pharmacist.id,
                createdAt: new Date(createdAt.getTime() + 1000 * 60 * 8),
              },
            ]),
      ],
    });

    if (outcome !== "REMOVED") {
      // Le document reprend réellement le traitement et le conseil retenu :
      // une fiche de démonstration vide ne montrerait rien du produit.
      const pharmacistName = PHARMACIST_NAMES[pharmacist.id] ?? "Votre pharmacien";
      const stockQuantity = product.stockItem?.quantity ?? 0;

      const documentContent = {
        version: 1,
        generatedAt: createdAt.toISOString(),
        pharmacy: {
          name: "Pharmacie Saint-Michel",
          logoUrl: null,
          brandColor: "#0F766E",
          addressLine1: "12 rue des Remparts",
          postalCode: "69003",
          city: "Lyon",
          phone: "04 00 00 00 00",
          email: "contact@pharmacie-saint-michel.exemple.fr",
        },
        pharmacist: { fullName: pharmacistName, roleLabel: "Pharmacien" },
        patient: {
          firstName: patient.firstName,
          lastName: patient.lastName,
          reference: patient.reference,
        },
        prescription: {
          reference,
          prescriberName: scenario.prescriber,
          prescribedAt: createdAt.toISOString(),
        },
        treatment: scenario.lines.map((line) => {
          const knowledge = DEMO_DRUGS.find(
            (entry) => entry.name.toLowerCase() === line.drug.toLowerCase(),
          );
          return {
            drugName: line.drug,
            dosage: line.dosage,
            form: line.form,
            posology: line.posology,
            durationDays: line.duration,
            instructions: line.instructions,
            purpose: knowledge?.patientExplanation ?? null,
            tips: knowledge?.intakeAdvice ? [knowledge.intakeAdvice] : [],
            precautions: knowledge?.cautionPopulations.length
              ? [`Vigilance particulière : ${knowledge.cautionPopulations.join(", ")}.`]
              : [],
            sourceLabel: knowledge
              ? "Jeu de démonstration Pharma.ai demo-2026.1"
              : "Information non disponible dans le référentiel connecté",
            explanationUnavailable: !knowledge,
          };
        }),
        advice: [
          {
            productName: product.name,
            brand: product.brand,
            imageUrl: product.imageUrl,
            benefit: product.commercialClaims[0] ?? null,
            personalReason:
              product.commercialClaims[0] ??
              "Conseil proposé par votre pharmacien dans le cadre de votre traitement.",
            usage: product.description,
            precautions: product.precautions,
            priceCents: product.salePriceCents,
            availability:
              stockQuantity <= 0
                ? "ON_ORDER"
                : stockQuantity <= (product.stockItem?.alertThreshold ?? 0)
                  ? "LOW_STOCK"
                  : "IN_STOCK",
            addedManually: false,
          },
        ],
        pharmacistNote:
          random() < 0.4
            ? "N'hésitez pas à revenir me voir si vous avez la moindre question."
            : null,
        disclaimers: [DEMO_DISCLAIMER, ...DOCUMENT_DISCLAIMERS],
        isDemo: true,
      };

      const document = await prisma.patientDocument.create({
        data: {
          pharmacyId: pharmacy.id,
          patientId: patient.id,
          prescriptionId: prescription.id,
          version: 1,
          contentJson: documentContent,
          accessToken: `demo-${prescription.id}`,
          tokenExpiresAt: new Date(createdAt.getTime() + 1000 * 60 * 60 * 24 * 90),
          createdByUserId: pharmacist.id,
          isDemo: true,
          createdAt,
          viewCount: random() < 0.55 ? randomInt(1, 4) : 0,
        },
      });

      await prisma.documentDelivery.create({
        data: {
          documentId: document.id,
          channel: pick(["PRINT", "QR_CODE", "LINK"] as const),
          status: "SENT",
          provider: "application",
          detail: "Remis au patient au comptoir.",
          userId: pharmacist.id,
          createdAt,
        },
      });
    }

    if (outcome === "PURCHASED") {
      saleIndex += 1;
      const unitPrice = product.salePriceCents;
      const quantity = random() < 0.15 ? 2 : 1;
      const totalCents = unitPrice * quantity;
      const marginCents = (unitPrice - product.purchasePriceCents) * quantity;

      // Certaines ventes comportent aussi un achat spontané non attribué :
      // c'est ce qui permet de distinguer CA total et CA additionnel.
      const extraProduct = random() < 0.35 ? pick(products) : null;
      const extraTotal = extraProduct ? extraProduct.salePriceCents : 0;
      const extraMargin = extraProduct
        ? extraProduct.salePriceCents - extraProduct.purchasePriceCents
        : 0;

      await prisma.sale.create({
        data: {
          pharmacyId: pharmacy.id,
          patientId: patient.id,
          prescriptionId: prescription.id,
          reference: `VTE-${String(saleIndex).padStart(4, "0")}`,
          channel: "PHARMA_AI_ADVICE",
          totalCents: totalCents + extraTotal,
          totalMarginCents: marginCents + extraMargin,
          attributedCents: totalCents,
          attributedMarginCents: marginCents,
          userId: pharmacist.id,
          isDemo: true,
          createdAt: new Date(createdAt.getTime() + 1000 * 60 * 10),
          lines: {
            create: [
              {
                productId: product.id,
                recommendationId: recommendation.id,
                label: product.name,
                quantity,
                unitPriceCents: unitPrice,
                totalCents,
                marginCents,
                vatRate: product.vatRate,
              },
              ...(extraProduct
                ? [
                    {
                      productId: extraProduct.id,
                      label: extraProduct.name,
                      quantity: 1,
                      unitPriceCents: extraProduct.salePriceCents,
                      totalCents: extraTotal,
                      marginCents: extraMargin,
                      vatRate: extraProduct.vatRate,
                    },
                  ]
                : []),
            ],
          },
        },
      });

      await prisma.recommendationEvent.create({
        data: {
          recommendationId: recommendation.id,
          type: "PURCHASED",
          userId: pharmacist.id,
          metadata: { quantity, totalCents },
          createdAt: new Date(createdAt.getTime() + 1000 * 60 * 10),
        },
      });
    }

    await prisma.patientInteraction.create({
      data: {
        patientId: patient.id,
        pharmacyId: pharmacy.id,
        type: "PRESCRIPTION_RECEIVED",
        summary: `Ordonnance ${reference} analysée — ${scenario.lines.length} ligne(s).`,
        userId: pharmacist.id,
        createdAt,
      },
    });
  }

  // Une ordonnance laissée EN ATTENTE DE VÉRIFICATION : le parcours complet
  // (vérification → copilote → fiche → vente) peut être déroulé en direct.
  await seedPendingPrescription(context, prescriptionIndex + 1);
}

async function seedPendingPrescription(
  context: Parameters<typeof seedHistory>[0],
  index: number,
) {
  const { pharmacy, patients, technician } = context;
  const patient = patients[1];
  const createdAt = daysAgo(0, 9, 12);

  await prisma.prescription.create({
    data: {
      pharmacyId: pharmacy.id,
      patientId: patient.id,
      reference: `ORD-${String(index).padStart(4, "0")}`,
      status: "NEEDS_VERIFICATION",
      source: "PHOTO",
      prescriberName: "Dr Camille Rousseau",
      prescriberRpps: "10001234567",
      prescribedAt: daysAgo(1),
      ocrConfidence: 0.883,
      ocrProvider: "mock-ocr",
      createdByUserId: technician.id,
      isDemo: true,
      createdAt,
      lines: {
        create: [
          {
            position: 0,
            rawText: "Amoxicilline 1 g — 1 comprimé matin et soir",
            drugName: "Amoxicilline",
            dosage: "1 g",
            form: "Comprimé dispersible",
            posology: "1 comprimé matin et soir",
            durationDays: 6,
            quantity: 12,
            instructions: "Au cours des repas",
            status: "NEEDS_REVIEW",
            fieldConfidence: { drugName: 0.97, dosage: 0.93, posology: 0.9, form: 0.91, durationDays: 0.87, quantity: 0.89, instructions: 0.86 },
            unreadableFields: [],
          },
          {
            position: 1,
            rawText: "Paracétamol 1 g",
            drugName: "Paracétamol",
            dosage: "1 g",
            form: "Comprimé",
            posology: null,
            durationDays: 5,
            quantity: 16,
            instructions: null,
            status: "NEEDS_REVIEW",
            // La posologie est illisible : le champ reste vide, rien n'est supposé.
            fieldConfidence: { drugName: 0.94, dosage: 0.93, posology: 0, form: 0.91, durationDays: 0.87, quantity: 0.89, instructions: 0 },
            unreadableFields: ["posology"],
          },
        ],
      },
    },
  });
}

main()
  .catch((error) => {
    console.error("\n✗ Échec du seed :", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
