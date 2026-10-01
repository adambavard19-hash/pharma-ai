/**
 * Mode sans patient : effacer ce qui rattache une donnée de santé à une
 * personne, dans TOUTES les officines de la base.
 *
 *   node --env-file=.env --conditions=react-server --import tsx scripts/sans-patient/purger.mts            (aperçu, rien n'est effacé)
 *   node --env-file=.env --conditions=react-server --import tsx scripts/sans-patient/purger.mts --confirmer
 *
 * Ce qui part : fiches patient (et avec elles consentements, interactions,
 * rappels de suivi, documents conservés), images d'ordonnances, noms de
 * prescripteurs. Ce qui reste : les ordonnances et leurs lignes de
 * médicaments, les ventes, les conseils, le stock — sans aucun nom. Chaque
 * passage est inscrit au journal d'audit.
 */
import { prisma } from "../../src/server/db/client";
import { recordAudit } from "../../src/server/audit/log";

const confirmer = process.argv.includes("--confirmer");

const counts = {
  patients: await prisma.patient.count(),
  reminders: await prisma.reminder.count(),
  documents: await prisma.patientDocument.count(),
  files: await prisma.storedFile.count(),
  prescriptionsWithPatient: await prisma.prescription.count({ where: { patientId: { not: null } } }),
  prescriptionsWithFile: await prisma.prescription.count({ where: { fileKey: { not: null } } }),
};
console.log(`Fiches patient : ${counts.patients} · rappels : ${counts.reminders} · documents conservés : ${counts.documents} · fichiers : ${counts.files}`);
console.log(`Ordonnances rattachées à un patient : ${counts.prescriptionsWithPatient} · avec image : ${counts.prescriptionsWithFile}`);

if (!confirmer) {
  console.log("Aperçu seulement. Ajoutez --confirmer pour effacer.");
  await prisma.$disconnect();
  process.exit(0);
}

const pharmacies = await prisma.pharmacy.findMany({ select: { id: true, name: true } });
await prisma.$transaction(async (tx) => {
  await tx.prescription.updateMany({ where: { patientId: { not: null } }, data: { patientId: null } });
  await tx.prescription.updateMany({ where: { OR: [{ fileKey: { not: null } }, { prescriberName: { not: null } }] }, data: { fileKey: null, fileName: null, fileMimeType: null, prescriberName: null, prescriberRpps: null } });
  await tx.patientDocument.deleteMany({});
  await tx.reminder.deleteMany({});
  await tx.storedFile.deleteMany({});
  await tx.patient.deleteMany({});
});
for (const pharmacy of pharmacies) {
  await recordAudit({ action: "patient_data.purged", entityType: "Pharmacy", entityId: pharmacy.id, pharmacyId: pharmacy.id, metadata: { ...counts, reason: "PATIENT_DATA_MODE=none" } });
}
console.log(`Effacé pour ${pharmacies.length} officine(s). Les ordonnances et les ventes restent, sans nom.`);
await prisma.$disconnect();
