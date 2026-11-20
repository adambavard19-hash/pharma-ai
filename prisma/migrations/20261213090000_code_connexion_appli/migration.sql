-- Code à 6 chiffres de connexion à l'appli des patients
CREATE TABLE "app_login_codes" (
    "emailHash" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_login_codes_pkey" PRIMARY KEY ("emailHash")
);
