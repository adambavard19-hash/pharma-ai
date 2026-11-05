-- Associations d'un module de conseil (fondateur, 4 nov. 2026) : elles ne valent que dans les pharmacies qui ont choisi ce module.
ALTER TABLE "central_associations" ADD COLUMN "module" TEXT;
CREATE INDEX "central_associations_module_idx" ON "central_associations"("module");
