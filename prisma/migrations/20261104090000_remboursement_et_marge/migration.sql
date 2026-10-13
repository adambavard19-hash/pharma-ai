-- La marge et le remboursement au départage du moteur : une référence remboursée ne passe jamais devant une équivalente
-- non remboursée, et la plus rentable (marge HT) l'emporte entre équivalentes. Colonnes additives et vides : rien ne
-- change tant qu'un import ne les a pas remplies (remboursement « inconnu », marge des médicaments « inconnue »).
ALTER TABLE "products" ADD COLUMN     "reimbursed" BOOLEAN,
ADD COLUMN     "reimbursementSource" TEXT;

ALTER TABLE "pharmacy_drug_stocks" ADD COLUMN     "purchasePriceCents" INTEGER,
ADD COLUMN     "vatRate" DOUBLE PRECISION;
