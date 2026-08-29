-- CreateEnum
CREATE TYPE "ReferenceSource" AS ENUM ('BDPM');

-- CreateEnum
CREATE TYPE "ReferenceImportStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "reference_imports" (
    "id" TEXT NOT NULL,
    "source" "ReferenceSource" NOT NULL DEFAULT 'BDPM',
    "sourceUpdatedAt" TIMESTAMP(3),
    "sourceUrl" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "ReferenceImportStatus" NOT NULL DEFAULT 'RUNNING',
    "fileReports" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "isDryRun" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "reference_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drug_specialties" (
    "id" TEXT NOT NULL,
    "cisCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pharmaceuticalForm" TEXT,
    "administrationRoutes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "authorizationStatus" TEXT,
    "authorizationProcedure" TEXT,
    "marketingStatus" TEXT,
    "authorizedAt" TIMESTAMP(3),
    "bdmStatus" TEXT,
    "europeanAuthorizationNumber" TEXT,
    "holders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enhancedMonitoring" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drug_specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drug_presentations" (
    "id" TEXT NOT NULL,
    "specialtyId" TEXT NOT NULL,
    "cip13" TEXT NOT NULL,
    "cip7" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "administrativeStatus" TEXT,
    "marketingStatus" TEXT,
    "marketingDeclaredAt" TIMESTAMP(3),
    "approvedForCommunities" BOOLEAN,
    "reimbursementRateRaw" TEXT,
    "reimbursementRate" INTEGER,
    "priceCents" INTEGER,
    "totalPriceCents" INTEGER,
    "dispensingFeeCents" INTEGER,
    "reimbursementNotice" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drug_presentations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drug_substances" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drug_substances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drug_compositions" (
    "id" TEXT NOT NULL,
    "specialtyId" TEXT NOT NULL,
    "substanceId" TEXT NOT NULL,
    "element" TEXT NOT NULL,
    "substanceLabel" TEXT NOT NULL,
    "dosage" TEXT,
    "dosageReference" TEXT,
    "nature" TEXT NOT NULL,
    "linkNumber" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drug_compositions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drug_prescription_conditions" (
    "id" TEXT NOT NULL,
    "specialtyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drug_prescription_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drug_generic_groups" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drug_generic_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drug_generic_members" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "specialtyId" TEXT NOT NULL,
    "type" INTEGER NOT NULL,
    "sortOrder" INTEGER,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drug_generic_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drug_smr_opinions" (
    "id" TEXT NOT NULL,
    "specialtyId" TEXT NOT NULL,
    "hasDossierCode" TEXT,
    "evaluationType" TEXT,
    "opinionDate" TIMESTAMP(3),
    "value" TEXT,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drug_smr_opinions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reference_imports_source_startedAt_idx" ON "reference_imports"("source", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "drug_specialties_cisCode_key" ON "drug_specialties"("cisCode");

-- CreateIndex
CREATE INDEX "drug_specialties_name_idx" ON "drug_specialties"("name");

-- CreateIndex
CREATE INDEX "drug_specialties_marketingStatus_idx" ON "drug_specialties"("marketingStatus");

-- CreateIndex
CREATE UNIQUE INDEX "drug_presentations_cip13_key" ON "drug_presentations"("cip13");

-- CreateIndex
CREATE UNIQUE INDEX "drug_presentations_cip7_key" ON "drug_presentations"("cip7");

-- CreateIndex
CREATE INDEX "drug_presentations_specialtyId_idx" ON "drug_presentations"("specialtyId");

-- CreateIndex
CREATE INDEX "drug_presentations_marketingStatus_idx" ON "drug_presentations"("marketingStatus");

-- CreateIndex
CREATE UNIQUE INDEX "drug_substances_code_key" ON "drug_substances"("code");

-- CreateIndex
CREATE INDEX "drug_substances_label_idx" ON "drug_substances"("label");

-- CreateIndex
CREATE INDEX "drug_compositions_substanceId_idx" ON "drug_compositions"("substanceId");

-- CreateIndex
CREATE UNIQUE INDEX "drug_compositions_specialtyId_element_substanceId_nature_li_key" ON "drug_compositions"("specialtyId", "element", "substanceId", "nature", "linkNumber");

-- CreateIndex
CREATE INDEX "drug_prescription_conditions_label_idx" ON "drug_prescription_conditions"("label");

-- CreateIndex
CREATE UNIQUE INDEX "drug_prescription_conditions_specialtyId_label_key" ON "drug_prescription_conditions"("specialtyId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "drug_generic_groups_externalId_key" ON "drug_generic_groups"("externalId");

-- CreateIndex
CREATE INDEX "drug_generic_members_specialtyId_idx" ON "drug_generic_members"("specialtyId");

-- CreateIndex
CREATE UNIQUE INDEX "drug_generic_members_groupId_specialtyId_key" ON "drug_generic_members"("groupId", "specialtyId");

-- CreateIndex
CREATE INDEX "drug_smr_opinions_specialtyId_idx" ON "drug_smr_opinions"("specialtyId");

-- AddForeignKey
ALTER TABLE "drug_presentations" ADD CONSTRAINT "drug_presentations_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "drug_specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drug_compositions" ADD CONSTRAINT "drug_compositions_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "drug_specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drug_compositions" ADD CONSTRAINT "drug_compositions_substanceId_fkey" FOREIGN KEY ("substanceId") REFERENCES "drug_substances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drug_prescription_conditions" ADD CONSTRAINT "drug_prescription_conditions_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "drug_specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drug_generic_members" ADD CONSTRAINT "drug_generic_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "drug_generic_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drug_generic_members" ADD CONSTRAINT "drug_generic_members_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "drug_specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drug_smr_opinions" ADD CONSTRAINT "drug_smr_opinions_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "drug_specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

