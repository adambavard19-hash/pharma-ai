-- CreateTable
CREATE TABLE "stored_files" (
    "key" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "stored_files_pharmacyId_idx" ON "stored_files"("pharmacyId");

