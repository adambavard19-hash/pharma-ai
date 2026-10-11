-- Notifications : « lu » par personne (une notification d'équipe lue par l'un reste non lue pour les autres).
CREATE TABLE "notification_reads" (
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("notificationId","userId")
);

CREATE INDEX "notification_reads_userId_idx" ON "notification_reads"("userId");

ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Résumé hebdomadaire du titulaire : désinscription.
ALTER TABLE "users" ADD COLUMN "weeklyDigestOptOutAt" TIMESTAMP(3);
