-- CreateEnum
CREATE TYPE "PartnerPublicationStatus" AS ENUM ('DRAFT', 'TEST', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PartnerAudience" AS ENUM ('ALL_PHARMACIES', 'SELECTED_PHARMACIES', 'PILOT_GROUP');

-- CreateEnum
CREATE TYPE "PartnerPreferenceChoice" AS ENUM ('HIDDEN', 'REFUSED');

-- CreateEnum
CREATE TYPE "PartnerApplicationStatus" AS ENUM ('NEW', 'REVIEWING', 'CONTACTED', 'NEGOTIATION', 'ACCEPTED', 'REFUSED', 'ACTIVE_PARTNER');

-- CreateEnum
CREATE TYPE "PartnerAnswer" AS ENUM ('YES', 'NO', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PartnerIntegrationMode" AS ENUM ('API', 'B2B_LINK', 'FORM', 'EMAIL', 'IMPORT_EXPORT', 'MANUAL');

-- CreateEnum
CREATE TYPE "PartnerContractType" AS ENUM ('FLAT_FEE', 'COMMISSION', 'HYBRID', 'PILOT', 'FREE');

-- CreateEnum
CREATE TYPE "PartnerOrderStatus" AS ENUM ('SUBMITTED', 'TRANSMITTED', 'CONFIRMED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PartnerLeadKind" AS ENUM ('CONTACT_REQUEST', 'B2B_LINK_OPENED', 'FORM_OPENED');

-- CreateEnum
CREATE TYPE "PartnerAttributionKind" AS ENUM ('VIEW', 'LEAD', 'ORDER');

-- CreateEnum
CREATE TYPE "PartnerAttributionSource" AS ENUM ('COUNTER_CARD', 'CATALOG', 'BRAND_PAGE');

-- AlterTable
ALTER TABLE "pharmacies" ADD COLUMN     "partnerPilot" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "partner_applications" (
    "id" TEXT NOT NULL,
    "status" "PartnerApplicationStatus" NOT NULL DEFAULT 'NEW',
    "company" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "contactFirstName" TEXT NOT NULL,
    "contactLastName" TEXT NOT NULL,
    "contactRole" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "website" TEXT,
    "universes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approxReferences" INTEGER,
    "distribution" TEXT,
    "hasApi" "PartnerAnswer" NOT NULL DEFAULT 'UNKNOWN',
    "hasB2bPortal" BOOLEAN,
    "hasCatalog" BOOLEAN,
    "hasTrainings" BOOLEAN,
    "message" TEXT,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "partnerId" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_application_events" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fromStatus" "PartnerApplicationStatus",
    "toStatus" "PartnerApplicationStatus",
    "note" TEXT,
    "platformAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_application_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legalName" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "description" TEXT,
    "universes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PartnerPublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_contacts" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "receivesOrders" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_brands" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "brandKey" TEXT NOT NULL,
    "logoUrl" TEXT,
    "description" TEXT,
    "universes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PartnerPublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "audience" "PartnerAudience" NOT NULL DEFAULT 'ALL_PHARMACIES',
    "audienceCriteria" JSONB,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_ranges" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "universe" TEXT,
    "status" "PartnerPublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_ranges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_products" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "rangeId" TEXT,
    "name" TEXT NOT NULL,
    "ean" TEXT,
    "cip13" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "packaging" TEXT,
    "proPriceCents" INTEGER,
    "publicPriceCents" INTEGER,
    "externalRef" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_documents" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'DOCUMENT',
    "url" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_offers" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "brandId" TEXT,
    "rangeId" TEXT,
    "title" TEXT NOT NULL,
    "conditions" TEXT NOT NULL,
    "discountPercent" DECIMAL(5,2),
    "minimumOrderCents" INTEGER,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "status" "PartnerPublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_integrations" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "mode" "PartnerIntegrationMode" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "b2bUrlTemplate" TEXT,
    "orderEmail" TEXT,
    "formUrl" TEXT,
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_contracts" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "type" "PartnerContractType" NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "fixedAmountCents" INTEGER,
    "commissionPercent" DECIMAL(5,2),
    "commissionPerUnitCents" INTEGER,
    "minimumCents" INTEGER,
    "notes" TEXT,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_brand_audiences" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_brand_audiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pharmacy_partner_preferences" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "choice" "PartnerPreferenceChoice" NOT NULL DEFAULT 'HIDDEN',
    "reason" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pharmacy_partner_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_attributions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "PartnerAttributionKind" NOT NULL,
    "source" "PartnerAttributionSource" NOT NULL,
    "partnerId" TEXT NOT NULL,
    "brandId" TEXT,
    "rangeId" TEXT,
    "pharmacyId" TEXT NOT NULL,
    "userId" TEXT,
    "universe" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_leads" (
    "id" TEXT NOT NULL,
    "attributionId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "brandId" TEXT,
    "pharmacyId" TEXT NOT NULL,
    "kind" "PartnerLeadKind" NOT NULL,
    "message" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "transmittedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_orders" (
    "id" TEXT NOT NULL,
    "attributionId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "integrationMode" "PartnerIntegrationMode" NOT NULL,
    "status" "PartnerOrderStatus" NOT NULL DEFAULT 'SUBMITTED',
    "totalCents" INTEGER,
    "partnerReference" TEXT,
    "statusDetail" TEXT,
    "note" TEXT,
    "transmittedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_order_lines" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "partnerProductId" TEXT,
    "name" TEXT NOT NULL,
    "ean" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER,

    CONSTRAINT "partner_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partner_applications_status_createdAt_idx" ON "partner_applications"("status", "createdAt");

-- CreateIndex
CREATE INDEX "partner_application_events_applicationId_createdAt_idx" ON "partner_application_events"("applicationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "partners_slug_key" ON "partners"("slug");

-- CreateIndex
CREATE INDEX "partners_status_idx" ON "partners"("status");

-- CreateIndex
CREATE INDEX "partner_contacts_partnerId_idx" ON "partner_contacts"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "partner_brands_slug_key" ON "partner_brands"("slug");

-- CreateIndex
CREATE INDEX "partner_brands_partnerId_idx" ON "partner_brands"("partnerId");

-- CreateIndex
CREATE INDEX "partner_brands_status_idx" ON "partner_brands"("status");

-- CreateIndex
CREATE INDEX "partner_brands_brandKey_idx" ON "partner_brands"("brandKey");

-- CreateIndex
CREATE INDEX "partner_ranges_brandId_idx" ON "partner_ranges"("brandId");

-- CreateIndex
CREATE INDEX "partner_products_brandId_idx" ON "partner_products"("brandId");

-- CreateIndex
CREATE INDEX "partner_products_rangeId_idx" ON "partner_products"("rangeId");

-- CreateIndex
CREATE INDEX "partner_products_ean_idx" ON "partner_products"("ean");

-- CreateIndex
CREATE INDEX "partner_documents_brandId_idx" ON "partner_documents"("brandId");

-- CreateIndex
CREATE INDEX "partner_offers_partnerId_idx" ON "partner_offers"("partnerId");

-- CreateIndex
CREATE INDEX "partner_offers_brandId_idx" ON "partner_offers"("brandId");

-- CreateIndex
CREATE INDEX "partner_integrations_partnerId_idx" ON "partner_integrations"("partnerId");

-- CreateIndex
CREATE INDEX "partner_contracts_partnerId_idx" ON "partner_contracts"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "partner_brand_audiences_brandId_pharmacyId_key" ON "partner_brand_audiences"("brandId", "pharmacyId");

-- CreateIndex
CREATE UNIQUE INDEX "pharmacy_partner_preferences_pharmacyId_brandId_key" ON "pharmacy_partner_preferences"("pharmacyId", "brandId");

-- CreateIndex
CREATE UNIQUE INDEX "partner_attributions_code_key" ON "partner_attributions"("code");

-- CreateIndex
CREATE INDEX "partner_attributions_partnerId_createdAt_idx" ON "partner_attributions"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "partner_attributions_pharmacyId_createdAt_idx" ON "partner_attributions"("pharmacyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "partner_leads_attributionId_key" ON "partner_leads"("attributionId");

-- CreateIndex
CREATE INDEX "partner_leads_partnerId_createdAt_idx" ON "partner_leads"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "partner_leads_pharmacyId_createdAt_idx" ON "partner_leads"("pharmacyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "partner_orders_attributionId_key" ON "partner_orders"("attributionId");

-- CreateIndex
CREATE INDEX "partner_orders_partnerId_createdAt_idx" ON "partner_orders"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "partner_orders_pharmacyId_createdAt_idx" ON "partner_orders"("pharmacyId", "createdAt");

-- CreateIndex
CREATE INDEX "partner_order_lines_orderId_idx" ON "partner_order_lines"("orderId");

-- AddForeignKey
ALTER TABLE "partner_applications" ADD CONSTRAINT "partner_applications_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_application_events" ADD CONSTRAINT "partner_application_events_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "partner_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_contacts" ADD CONSTRAINT "partner_contacts_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_brands" ADD CONSTRAINT "partner_brands_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_ranges" ADD CONSTRAINT "partner_ranges_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "partner_brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_products" ADD CONSTRAINT "partner_products_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "partner_brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_products" ADD CONSTRAINT "partner_products_rangeId_fkey" FOREIGN KEY ("rangeId") REFERENCES "partner_ranges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_documents" ADD CONSTRAINT "partner_documents_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "partner_brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_offers" ADD CONSTRAINT "partner_offers_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_offers" ADD CONSTRAINT "partner_offers_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "partner_brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_offers" ADD CONSTRAINT "partner_offers_rangeId_fkey" FOREIGN KEY ("rangeId") REFERENCES "partner_ranges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_integrations" ADD CONSTRAINT "partner_integrations_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_contracts" ADD CONSTRAINT "partner_contracts_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_brand_audiences" ADD CONSTRAINT "partner_brand_audiences_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "partner_brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_brand_audiences" ADD CONSTRAINT "partner_brand_audiences_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_partner_preferences" ADD CONSTRAINT "pharmacy_partner_preferences_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_partner_preferences" ADD CONSTRAINT "pharmacy_partner_preferences_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "partner_brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_attributions" ADD CONSTRAINT "partner_attributions_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_attributions" ADD CONSTRAINT "partner_attributions_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_leads" ADD CONSTRAINT "partner_leads_attributionId_fkey" FOREIGN KEY ("attributionId") REFERENCES "partner_attributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_leads" ADD CONSTRAINT "partner_leads_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_leads" ADD CONSTRAINT "partner_leads_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_orders" ADD CONSTRAINT "partner_orders_attributionId_fkey" FOREIGN KEY ("attributionId") REFERENCES "partner_attributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_orders" ADD CONSTRAINT "partner_orders_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_orders" ADD CONSTRAINT "partner_orders_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_order_lines" ADD CONSTRAINT "partner_order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "partner_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

