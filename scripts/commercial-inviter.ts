/**
 * Crée un commercial et lui envoie son invitation à l'extranet.
 *
 * Usage :
 *   node --env-file=.env --conditions=react-server --import tsx scripts/commercial-inviter.ts \
 *     --email adresse --prenom Prénom --nom Nom [--zone Zone] [--fixe 300]
 *
 * Idempotent : si l'adresse existe déjà, l'invitation est simplement renvoyée
 * (ce qui remplace tout lien précédent). Aucune donnée n'est supprimée.
 */
import { prisma } from "@/server/db/client";
import { createSalesRep, sendSalesInvitation } from "@/server/services/sales/reps";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.toLowerCase();
  const firstName = arg("prenom");
  const lastName = arg("nom");
  if (!email || !firstName || !lastName) throw new Error("--email, --prenom et --nom sont requis.");

  const admin = await prisma.platformAdmin.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!admin) throw new Error("Aucun administrateur plateforme : créez-le d'abord.");

  let rep = await prisma.salesRep.findUnique({ where: { email }, select: { id: true } });
  if (!rep) {
    rep = await createSalesRep(
      { email, firstName, lastName, zone: arg("zone") ?? null, commissionType: "FIXED", commissionValue: Math.round(Number(arg("fixe") ?? "300") * 100) },
      admin.id,
    );
    console.log(`Commercial créé : ${rep.id}`);
  } else {
    console.log(`Commercial existant : ${rep.id}`);
  }
  const outcome = await sendSalesInvitation(rep.id, admin.id);
  console.log(`Invitation : ${outcome.status} — ${outcome.detail}`);
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
