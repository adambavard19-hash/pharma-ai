import { prisma } from "@/server/db/client";
import { analysePrescription } from "@/server/services/analysis";
import { generatePatientDocument } from "@/server/services/documents";
import { recordSale } from "@/server/services/sales";
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

  const audit = await prisma.auditLog.findMany({
    where: { pharmacyId: pharmacy.id, entityId: prescription.id },
    orderBy: { createdAt: "asc" },
    select: { action: true },
  });
  console.log(`\n7. AUDIT : ${audit.map((a) => a.action).join(" → ")}`);

  console.log("\n✓ Parcours complet exécuté sur la base réelle.");
}

main()
  .catch((error) => {
    console.error("\n✗ Échec :", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
