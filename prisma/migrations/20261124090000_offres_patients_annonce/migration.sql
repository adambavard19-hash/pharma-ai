-- Appli des patients : le jour où une offre a été annoncée par e-mail aux inscrits qui l'acceptent (une seule fois).
ALTER TABLE "patient_offers" ADD COLUMN IF NOT EXISTS "announcedAt" TIMESTAMP(3);
