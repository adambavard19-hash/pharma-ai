-- La péremption de la boîte bipée (Datamatrix lu par la douchette). Ajout seulement.
ALTER TABLE "prescription_lines" ADD COLUMN IF NOT EXISTS "expiresOn" DATE;
