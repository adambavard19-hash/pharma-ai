/**
 * Essai de bout en bout de l'arbre de questions du comptoir, sur la vraie base locale : un Doliprane bipé n'ouvre AUCUN produit ciblé ;
 * « douleur localisée » puis « dos » débloque la poche du dos ; décocher la referme. Défait tout à la fin (la vente d'essai est supprimée).
 *   node --env-file=.env --conditions=react-server --import tsx scripts/essai-arbre.ts
 */
import { prisma } from "@/server/db/client";
import { recordCounterScan } from "@/server/services/counter-scan";
import { analysePrescription } from "@/server/services/analysis";
import { readCounterNotice } from "@/server/services/counter-notice";
import { answerCounterQuestion } from "@/server/services/counter-questions";

const CODE = process.argv[2] ?? "3400935294227"; // DOLIPRANE 1000 mg, comprimé effervescent sécable
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failed += 1;
};

async function main() {
  const pharmacy = await prisma.pharmacy.findFirst({ where: { name: { contains: "Test LGPI" } }, select: { id: true, organizationId: true, name: true } });
  if (!pharmacy) throw new Error("Pharmacie d'essai introuvable");
  const user = await prisma.user.findFirst({ where: { organizationId: pharmacy.organizationId }, select: { id: true } });
  if (!user) throw new Error("Aucun utilisateur");
  const packs = await prisma.product.findMany({ where: { pharmacyId: pharmacy.id, deletedAt: null, name: { contains: "THERAPEARL", mode: "insensitive" } }, select: { name: true, stockItem: { select: { quantity: true } } } });
  console.log(`Pharmacie : ${pharmacy.name} · poches Thérapearl en stock : ${packs.map((p) => `${p.name} (${p.stockItem?.quantity ?? "?"})`).join(" ; ") || "aucune"}`);

  const agent = { scope: { pharmacyId: pharmacy.id, userId: user.id, organizationId: pharmacy.organizationId } };
  const scan = await recordCounterScan(agent as never, { code: CODE, post: "ZZ Essai arbre", scannedAt: null });
  if (!scan.ok) throw new Error(`scan refusé : ${scan.error}`);
  const id = scan.prescriptionId;
  try {
    await prisma.prescription.update({ where: { id }, data: { status: "VERIFIED", verifiedAt: new Date() } });
    await analysePrescription({ scope: agent.scope, prescriptionId: id });

    const first = await readCounterNotice(pharmacy.id, id);
    const names = (read: typeof first) => read?.notice.items.map((i) => i.name) ?? [];
    console.log("Au départ :", JSON.stringify({ items: names(first), questions: first?.notice.questions.map((q) => q.text) }));
    check("une question est posée : pourquoi le patient prend-il ce médicament", first?.notice.questions[0]?.node === "why");
    check("aucun produit ciblé avant la réponse (ni Thérapearl, ni thermomètre)", !names(first).some((n) => /thera ?pearl|thermo/i.test(n)), names(first));

    const sig0 = first?.notice.signature;
    check("répondre à une question fermée est refusé", !(await answerCounterQuestion({ pharmacyId: pharmacy.id, userId: null, source: "POSTE", prescriptionId: id, node: "where", choice: "BACK" })).ok);

    check("« douleur localisée » est accepté", (await answerCounterQuestion({ pharmacyId: pharmacy.id, userId: null, source: "POSTE", prescriptionId: id, node: "why", choice: "PAIN" })).ok);
    const asked = await readCounterNotice(pharmacy.id, id);
    check("« où a-t-il mal ? » est maintenant posée", asked?.notice.questions.some((q) => q.node === "where") === true);
    check("toujours aucune poche tant que la zone n'est pas donnée", !names(asked).some((n) => /thera ?pearl/i.test(n)), names(asked));
    check("l'empreinte a changé : la fenêtre se redessine", asked?.notice.signature !== sig0);

    check("« dos » est accepté", (await answerCounterQuestion({ pharmacyId: pharmacy.id, userId: null, source: "POSTE", prescriptionId: id, node: "where", choice: "BACK" })).ok);
    const back = await readCounterNotice(pharmacy.id, id);
    console.log("Après « dos » :", JSON.stringify(names(back)));
    const dos = names(back).filter((n) => /thera ?pearl|poche|chaud|froid/i.test(n));
    check("seule une poche DU DOS (ou une poche sans zone) est proposée — jamais genou, cheville, hanche…", dos.every((n) => !/genou|cheville|hanche|nuque|epaule|épaule/i.test(n)), dos);

    check("décocher « douleur localisée » referme tout", (await answerCounterQuestion({ pharmacyId: pharmacy.id, userId: null, source: "POSTE", prescriptionId: id, node: "why", choice: "PAIN" })).ok);
    const closed = await readCounterNotice(pharmacy.id, id);
    check("plus de poche, plus de « où »", !names(closed).some((n) => /thera ?pearl/i.test(n)) && !closed?.notice.questions.some((q) => q.node === "where"), names(closed));
    const rows = await prisma.counterQuestionAnswer.count({ where: { prescriptionId: id } });
    check("la base ne garde plus la zone", rows === 0, rows);

    check("fièvre : accepté", (await answerCounterQuestion({ pharmacyId: pharmacy.id, userId: null, source: "POSTE", prescriptionId: id, node: "why", choice: "FEVER" })).ok);
    check("fièvre depuis 3 jours : une phrase d'orientation", (await answerCounterQuestion({ pharmacyId: pharmacy.id, userId: null, source: "POSTE", prescriptionId: id, node: "fever-duration", choice: "LONG" })).ok);
    const fever = await readCounterNotice(pharmacy.id, id);
    check("la phrase d'orientation vers le médecin est donnée", fever?.notice.guidance.some((g) => /orienter vers le médecin/.test(g)) === true, fever?.notice.guidance);

    // Une autre officine ne peut pas répondre.
    const other = await prisma.pharmacy.findFirst({ where: { NOT: { id: pharmacy.id } }, select: { id: true } });
    if (other) check("une autre officine ne peut pas répondre à cette vente", !(await answerCounterQuestion({ pharmacyId: other.id, userId: null, source: "POSTE", prescriptionId: id, node: "why", choice: "PAIN" })).ok);
  } finally {
    await prisma.prescription.delete({ where: { id } }).catch((error) => console.log("nettoyage :", String(error).slice(0, 200)));
    console.log("Vente d'essai supprimée.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    failed += 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(failed === 0 ? "\nTOUT EST BON" : `\n${failed} VÉRIFICATION(S) EN ÉCHEC`);
    process.exit(failed === 0 ? 0 : 1);
  });
