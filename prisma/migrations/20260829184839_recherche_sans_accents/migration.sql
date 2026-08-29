-- AlterTable
ALTER TABLE "drug_specialties" ADD COLUMN     "searchName" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "drug_substances" ADD COLUMN     "searchLabel" TEXT NOT NULL DEFAULT '';

