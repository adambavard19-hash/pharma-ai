import { prisma } from "@/server/db/client";
import { analysePrescription } from "@/server/services/analysis";
import { generatePatientDocument } from "@/server/services/documents";
import { recordSale } from "@/server/services/sales";
import { scheduleReminder, sendReminder } from "@/server/services/followup";
import { findTemplate, proposedDueDate } from "@/core/followup";
import { formatCents } from "@/lib/format";

/**
 * Script de vérification du parcours complet.
 *
 * Exécution : `npm run demo:parcours` (charge `.env` via `--env-file` et active
 * la condition `react-server` pour que les modules serveur s'importent hors du
 * runtime Next.js).
 *
 * Parcours complet exécuté contre la base réelle, en appelant exactement les
 * mêmes services que l'application : vérification → analyse → validation →
 * fiche patient → vente attribuée.
 */
async function main() {
  const pharmacy = await prisma.pharmacy.findFirstOrThrow({ where: { isDemo: true } });
  const pharmacist = await prisma.user.findFirstOrThrow({
    where: { email: "pharmacien@pharma.ai" },
  });
  const scope = {
    pharmacyId: pharmacy.id,
    organizationId: pharmacy.organizationId,
    userId: pharmacist.id,
  };

  const startedAt = new Date();

  const prescription = await prisma.prescription.findFirstOrThrow({
    where: { pharmacyId: pharmacy.id, status: "NEEDS_VERIFICATION" },
    include: { lines: { orderBy: { position: "asc" } } },
  });

  console.log(`\n1. ORDONNANCE ${prescription.reference}`);
  for (const line of prescription.lines) {
    const unread = line.unreadableFields.length
      ? ` ⚠ illisible : ${line.unreadableFields.join(", ")}`
      : "";
    console.log(`   • ${line.drugName} ${line.dosage ?? ""} — ${line.status}${unread}`);
  }

  console.log("\n2. VÉRIFICATION par le pharmacien");
  await prisma.prescriptionLine.updateMany({
    where: { prescriptionId: prescription.id },
    data: { status: "CONFIRMED", correctedByUserId: pharmacist.id, correctedAt: new Date() },
  });
  await prisma.prescription.update({
    where: { id: prescription.id },
    data: { status: "VERIFIED", verifiedByUserId: pharmacist.id, verifiedAt: new Date() },
  });
  console.log(`   ${prescription.lines.length} ligne(s) confirmée(s)`);

  console.log("\n3. ANALYSE (moteur complet)");
  const { result } = await analysePrescription({ scope, prescriptionId: prescription.id });
  console.log(`   Statut : ${result.status} · moteur v${result.engineVersion}`);
  console.log("   Pipeline :");
  for (const stage of result.trace) {
    console.log(
      `     ${stage.stage.padEnd(26)} ${stage.status.padEnd(8)} ${stage.inputCount} → ${stage.outputCount}  (${stage.durationMs} ms)`,
    );
    for (const note of stage.notes) console.log(`       ↳ ${note}`);
  }
  console.log(`   Signaux de sécurité : ${result.safetyFindings.length}`);
  for (const finding of result.safetyFindings) {
    console.log(`     [${finding.severity}] ${finding.message}`);
  }
  console.log(`   Opportunités : ${result.opportunities.length}`);
  for (const opportunity of result.opportunities) {
    console.log(
      `     • ${opportunity.title} (${opportunity.kind}, priorité ${opportunity.priority})${opportunity.isBlocked ? " — BLOQUÉE : " + opportunity.blockReason : ""}`,
    );
  }
  console.log(`   Recommandations : ${result.recommendations.length}`);
  for (const recommendation of result.recommendations) {
    console.log(
      `     • score ${(recommendation.totalScore * 100).toFixed(0)} % — ${recommendation.justification.slice(0, 110)}…`,
    );
  }

  if (result.recommendations.length === 0) {
    console.log("\n⚠ Aucune recommandation : parcours interrompu ici.");
    return;
  }

  console.log("\n4. VALIDATION par le pharmacien");
  const proposed = await prisma.recommendation.findMany({
    where: { prescriptionId: prescription.id, status: "PROPOSED" },
    include: { product: true },
  });
  const accepted = proposed[0];
  await prisma.recommendation.update({
    where: { id: accepted.id },
    data: { status: "ACCEPTED", decidedByUserId: pharmacist.id, decidedAt: new Date() },
  });
  console.log(`   Accepté : ${accepted.product?.name}`);
  if (accepted.counterScript) {
    console.log(`   À dire au patient : ${accepted.counterScript}`);
  }
  for (const other of proposed.slice(1)) {
    await prisma.recommendation.update({
      where: { id: other.id },
      data: {
        status: "REMOVED",
        decidedByUserId: pharmacist.id,
        decidedAt: new Date(),
        pharmacistNote: "Non pertinent au vu du contexte",
      },
    });
    console.log(`   Retiré  : ${other.product?.name}`);
  }

  console.log("\n5. FICHE PATIENT");
  const document = await generatePatientDocument({
    session: {
      scope,
      user: { fullName: `${pharmacist.firstName} ${pharmacist.lastName}` },
      roleLabel: "Pharmacien",
    },
    prescriptionId: prescription.id,
    pharmacistNote: "N'hésitez pas à revenir me voir si vous avez la moindre question.",
  });
  const stored = await prisma.patientDocument.findUniqueOrThrow({
    where: { id: document.documentId },
  });
  const content = stored.contentJson as never as {
    treatment: { drugName: string; purpose: string | null }[];
    advice: { productName: string; personalReason: string; priceCents: number }[];
    disclaimers: string[];
  };
  console.log(`   Version ${stored.version} · ${document.url}`);
  console.log(`   Traitement : ${content.treatment.length} médicament(s)`);
  for (const item of content.treatment) {
    console.log(`     • ${item.drugName} — ${item.purpose ?? "aucune explication disponible"}`);
  }
  console.log(`   Conseils : ${content.advice.length}`);
  for (const item of content.advice) {
    console.log(`     • ${item.productName} (${formatCents(item.priceCents)}) — ${item.personalReason}`);
  }
  console.log(`   Mentions : ${content.disclaimers.length}`);

  console.log("\n6. VENTE");
  const sale = await recordSale({
    scope,
    patientId: prescription.patientId,
    prescriptionId: prescription.id,
    lines: [{ productId: accepted.productId!, recommendationId: accepted.id, quantity: 1 }],
    isDemo: true,
  });
  console.log(
    `   Total ${formatCents(sale.totalCents)} · attribué à Pharma.ai ${formatCents(sale.attributedCents)}`,
  );

  const finalState = await prisma.recommendation.findUniqueOrThrow({
    where: { id: accepted.id },
    select: { status: true },
  });
  console.log(`   Recommandation → ${finalState.status}`);

  console.log("\n7. SUIVI PATIENT");
  if (!prescription.patientId) {
    console.log("   Ordonnance sans patient : aucun suivi possible.");
  } else {
    // Le consentement se recueille au comptoir. Sans lui, le rappel se
    // programme mais ne peut pas partir — c'est exactement ce que le parcours
    // doit montrer.
    await prisma.patientConsent.upsert({
      where: {
        patientId_type: { patientId: prescription.patientId, type: "FOLLOW_UP_MESSAGE" },
      },
      create: {
        patientId: prescription.patientId,
        type: "FOLLOW_UP_MESSAGE",
        granted: true,
        grantedAt: new Date(),
        collectedByUserId: pharmacist.id,
      },
      update: { granted: true, grantedAt: new Date(), revokedAt: null },
    });

    const template = findTemplate("course-end")!;
    const durationDays = Math.max(
      0,
      ...prescription.lines.map((line) => line.durationDays ?? 0),
    );
    const dueAt = proposedDueDate(template, new Date(), durationDays);

    const { reminderId } = await scheduleReminder({
      scope,
      patientId: prescription.patientId,
      templateKey: template.key,
      dueAt,
      prescriptionId: prescription.id,
      saleId: sale.saleId,
      isDemo: true,
    });
    console.log(
      `   Programmé : « ${template.label} » le ${dueAt.toLocaleDateString("fr-FR")} ` +
        `(durée du traitement : ${durationDays || template.defaultDelayDays} j)`,
    );

    const outcome = await sendReminder({ scope, reminderId });
    console.log(`   Envoi : ${outcome.status}`);
    console.log(`   ${outcome.detail}`);

    const sent = await prisma.reminder.findUniqueOrThrow({
      where: { id: reminderId },
      select: { targetMasked: true, sentByUserId: true },
    });
    console.log(
      `   Destinataire journalisé : ${sent.targetMasked} · envoyé par un professionnel : ${
        sent.sentByUserId ? "oui" : "non"
      }`,
    );
  }

  const audit = await prisma.auditLog.findMany({
    where: { pharmacyId: pharmacy.id },
    orderBy: { createdAt: "asc" },
    select: { action: true, createdAt: true },
  });
  const journeyActions = audit
    .filter((entry) => entry.createdAt >= startedAt)
    .map((entry) => entry.action);
  console.log(`\n8. AUDIT : ${journeyActions.join(" → ")}`);

  console.log("\n✓ Parcours complet exécuté sur la base réelle.");
  console.log("  Les trois piliers sont couverts : conseiller, vendre, faire revenir.");
}

main()
  .catch((error) => {
    console.error("\n✗ Échec :", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
